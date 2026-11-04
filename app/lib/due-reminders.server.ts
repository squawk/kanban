/**
 * Sends due-date reminder emails: one digest per person listing cards due
 * tomorrow/today and cards that just became overdue.
 *
 * Runs hourly inside the server process and via POST /api/cron/due-reminders (for
 * hosts that stop idle machines). The due_reminders table makes it idempotent, so
 * overlapping runs or several instances never send the same reminder twice.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "./db";
import { boards, cards, columns, dueReminders, users } from "./db/schema";
import { getAppUrl, getReminderConfig } from "./config";
import { emailLayout, escapeHtml, isEmailConfigured, NOTIFICATION_FOOTER, sendEmail } from "./email";
import { logAudit } from "./audit.server";
import {
  addDays,
  groupByRecipient,
  localDayAndHour,
  planReminders,
  type PlannedReminder,
  type ReminderCandidate,
} from "./due-reminders";

/** Don't email about cards that went overdue long ago (e.g. on the first deploy). */
const OVERDUE_LOOKBACK_DAYS = 7;

export interface ReminderRunResult {
  ran: boolean;
  reason?: string;
  today: string;
  emailsSent: number;
  remindersSent: number;
}

function loadCandidates(today: string): ReminderCandidate[] {
  const from = new Date(`${addDays(today, -OVERDUE_LOOKBACK_DAYS)}T00:00:00Z`);
  const to = new Date(`${addDays(today, 1)}T00:00:00Z`);

  const rows = db
    .select({
      id: cards.id,
      title: cards.title,
      boardId: cards.boardId,
      dueDate: cards.dueDate,
      priority: cards.priority,
      assigneeId: cards.assigneeId,
      createdById: cards.createdById,
      boardName: boards.name,
      boardOwnerId: boards.userId,
    })
    .from(cards)
    .innerJoin(boards, eq(boards.id, cards.boardId))
    .where(and(isNull(cards.archivedAt), isNotNull(cards.dueDate), gte(cards.dueDate, from), lte(cards.dueDate, to)))
    .all();
  if (rows.length === 0) return [];

  const columnRows = db
    .select({ title: columns.title, cardIds: columns.cardIds })
    .from(columns)
    .where(inArray(columns.boardId, [...new Set(rows.map((r) => r.boardId))]))
    .all();
  const columnOf = new Map<string, string>();
  for (const col of columnRows) for (const id of JSON.parse(col.cardIds) as string[]) columnOf.set(id, col.title);

  return rows.map((r) => ({
    cardId: r.id,
    title: r.title,
    boardId: r.boardId,
    boardName: r.boardName,
    dueDate: r.dueDate!,
    priority: r.priority,
    columnTitle: columnOf.get(r.id) ?? null,
    recipientId: r.assigneeId ?? r.createdById ?? r.boardOwnerId,
  }));
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dueText(r: PlannedReminder, today: string): string {
  if (r.kind === "overdue") return `Overdue (was due ${formatDay(r.dueDay)})`;
  return r.dueDay === today ? "Due today" : "Due tomorrow";
}

function cardLink(r: PlannedReminder) {
  return `${getAppUrl()}/?boardId=${encodeURIComponent(r.boardId)}&card=${encodeURIComponent(r.cardId)}`;
}

export function buildReminderEmail(name: string, items: PlannedReminder[], today: string) {
  const overdue = items.filter((i) => i.kind === "overdue");
  const soon = items.filter((i) => i.kind === "due_soon");
  const subject =
    overdue.length && soon.length
      ? `${overdue.length} overdue and ${soon.length} due soon on Kanban Board`
      : overdue.length
        ? overdue.length === 1
          ? `Overdue: "${overdue[0].title}"`
          : `${overdue.length} cards are overdue`
        : soon.length === 1
          ? `${dueText(soon[0], today)}: "${soon[0].title}"`
          : `${soon.length} cards are due soon`;

  const section = (heading: string, list: PlannedReminder[], color: string) =>
    list.length === 0
      ? ""
      : `<h3 style="color: ${color}; margin: 24px 0 8px;">${escapeHtml(heading)}</h3>
         <ul style="padding-left: 0; list-style: none; margin: 0;">
           ${list
             .map(
               (r) => `<li style="background-color: #f3f4f6; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px;">
                 <a href="${cardLink(r)}" style="color: #111827; font-weight: bold; text-decoration: none;">${escapeHtml(r.title)}</a>
                 <div style="color: #4b5563; font-size: 13px; margin-top: 4px;">
                   ${escapeHtml(dueText(r, today))} · ${escapeHtml(r.boardName)}${r.columnTitle ? ` · ${escapeHtml(r.columnTitle)}` : ""} · ${escapeHtml(r.priority)} priority
                 </div>
               </li>`
             )
             .join("")}
         </ul>`;

  const textList = (heading: string, list: PlannedReminder[]) =>
    list.length === 0
      ? ""
      : `${heading}\n${list.map((r) => `- ${r.title} (${dueText(r, today)}, ${r.boardName})\n  ${cardLink(r)}`).join("\n")}\n\n`;

  return {
    subject,
    text: `Hi ${name},\n\n${textList("Overdue:", overdue)}${textList("Due soon:", soon)}${NOTIFICATION_FOOTER}`,
    html: emailLayout({
      heading: overdue.length ? "Cards need your attention" : "Coming up",
      bodyHtml: `<p>Hi ${escapeHtml(name)},</p>
        ${section("Overdue", overdue, "#dc2626")}
        ${section("Due soon", soon, "#2563eb")}`,
      cta: { label: "Open Kanban Board", url: getAppUrl() },
      footer: NOTIFICATION_FOOTER,
    }),
  };
}

let running = false;

export async function runDueReminders(now = new Date(), opts: { ignoreHour?: boolean } = {}): Promise<ReminderRunResult> {
  const config = getReminderConfig();
  const { day: today, hour } = localDayAndHour(now, config.timeZone);
  const base = { today, emailsSent: 0, remindersSent: 0 };

  if (!config.enabled) return { ...base, ran: false, reason: "disabled" };
  if (!opts.ignoreHour && hour < config.sendAfterHour) return { ...base, ran: false, reason: "too_early" };
  if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
    return { ...base, ran: false, reason: "email_not_configured" };
  }
  if (running) return { ...base, ran: false, reason: "already_running" };
  running = true;

  try {
    const candidates = loadCandidates(today);
    if (candidates.length === 0) return { ...base, ran: true };

    const sent = db
      .select({ cardId: dueReminders.cardId, kind: dueReminders.kind, dueDay: dueReminders.dueDay })
      .from(dueReminders)
      .where(inArray(dueReminders.cardId, candidates.map((c) => c.cardId)))
      .all();
    const alreadySent = new Set(sent.map((s) => `${s.cardId}:${s.kind}:${s.dueDay}`));

    const byRecipient = groupByRecipient(planReminders(candidates, today, alreadySent));
    if (byRecipient.size === 0) return { ...base, ran: true };

    const recipients = new Map(
      db
        .select({ id: users.id, name: users.name, email: users.email, emailNotifications: users.emailNotifications, disabled: users.disabled })
        .from(users)
        .where(inArray(users.id, [...byRecipient.keys()]))
        .all()
        .map((u) => [u.id, u])
    );

    let emailsSent = 0;
    let remindersSent = 0;
    for (const [userId, items] of byRecipient) {
      const user = recipients.get(userId);
      if (!user || user.disabled || !user.emailNotifications) continue;

      // Claim first so concurrent runs (or another instance) can't double-send
      const claimed = db.transaction((tx) =>
        items.filter(
          (r) =>
            tx
              .insert(dueReminders)
              .values({ cardId: r.cardId, kind: r.kind, dueDay: r.dueDay, userId, sentAt: new Date() })
              .onConflictDoNothing()
              .run().changes > 0
        )
      );
      if (claimed.length === 0) continue;

      const ok = await sendEmail({ to: user.email, ...buildReminderEmail(user.name, claimed, today) });
      if (!ok && isEmailConfigured()) {
        // Delivery failed: release the claims so the next run retries
        db.transaction((tx) => {
          for (const r of claimed) {
            tx.delete(dueReminders)
              .where(and(eq(dueReminders.cardId, r.cardId), eq(dueReminders.kind, r.kind), eq(dueReminders.dueDay, r.dueDay)))
              .run();
          }
        });
        continue;
      }
      emailsSent++;
      remindersSent += claimed.length;
    }

    if (remindersSent > 0) {
      logAudit({
        action: "notification.due_reminders_sent",
        entityType: "system",
        summary: `Sent ${remindersSent} due-date reminder(s) in ${emailsSent} email(s)`,
        metadata: { today, emailsSent, remindersSent },
      });
    }
    return { ran: true, today, emailsSent, remindersSent };
  } finally {
    running = false;
  }
}

/** Start the hourly in-process scheduler once per process. */
export function startDueReminderScheduler() {
  const g = globalThis as unknown as { __dueReminderTimer?: ReturnType<typeof setInterval> };
  if (g.__dueReminderTimer || process.env.VITEST || !getReminderConfig().enabled) return;

  const tick = () => {
    runDueReminders().catch((error) =>
      console.error("Due reminder run failed:", error instanceof Error ? error.message : error)
    );
  };
  // First run shortly after boot (covers machines woken by traffic), then hourly
  setTimeout(tick, 30_000).unref?.();
  g.__dueReminderTimer = setInterval(tick, 60 * 60 * 1000);
  g.__dueReminderTimer.unref?.();
}
