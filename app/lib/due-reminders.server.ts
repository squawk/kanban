/**
 * Sends due-date reminder emails: one digest per person each morning listing cards
 * due tomorrow, due today, and overdue (overdue ones every morning until they're done).
 *
 * Runs hourly from the Worker's Cron Trigger (see workers/app.ts and wrangler.jsonc)
 * and on demand via POST /api/cron/due-reminders. The due_reminders table makes it
 * idempotent, so overlapping runs never send the same reminder twice.
 */
import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
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
  reminderKey,
  type PlannedReminder,
  type ReminderCandidate,
} from "./due-reminders";

export interface ReminderRunResult {
  ran: boolean;
  reason?: string;
  today: string;
  emailsSent: number;
  remindersSent: number;
}

async function loadCandidates(today: string): Promise<ReminderCandidate[]> {
  // Everything due up to tomorrow: overdue cards keep coming until they're done
  const to = new Date(`${addDays(today, 1)}T00:00:00Z`);

  const rows = await db
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
    .where(and(isNull(cards.archivedAt), isNotNull(cards.dueDate), lte(cards.dueDate, to)));
  if (rows.length === 0) return [];

  const columnRows = await db
    .select({ title: columns.title, cardIds: columns.cardIds })
    .from(columns)
    .where(inArray(columns.boardId, [...new Set(rows.map((r) => r.boardId))]));
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

function daysLate(dueDay: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`)) / 86_400_000);
}

function dueText(r: PlannedReminder, today: string): string {
  if (r.kind === "overdue") {
    const late = daysLate(r.dueDay, today);
    return `Overdue by ${late} day${late === 1 ? "" : "s"} (was due ${formatDay(r.dueDay)})`;
  }
  return r.kind === "due_today" ? "Due today" : "Due tomorrow";
}

function cardLink(r: PlannedReminder) {
  return `${getAppUrl()}/?boardId=${encodeURIComponent(r.boardId)}&card=${encodeURIComponent(r.cardId)}`;
}

export function buildReminderEmail(name: string, items: PlannedReminder[], today: string) {
  const overdue = items.filter((i) => i.kind === "overdue");
  const dueToday = items.filter((i) => i.kind === "due_today");
  const dueTomorrow = items.filter((i) => i.kind === "due_tomorrow");
  const subject = reminderSubject(overdue, dueToday, dueTomorrow, today);

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
    text: `Hi ${name},\n\n${textList("Overdue:", overdue)}${textList("Due today:", dueToday)}${textList("Due tomorrow:", dueTomorrow)}${NOTIFICATION_FOOTER}`,
    html: emailLayout({
      heading: overdue.length ? "Cards need your attention" : dueToday.length ? "Due today" : "Coming up",
      bodyHtml: `<p>Hi ${escapeHtml(name)},</p>
        ${section("Overdue", overdue, "#dc2626")}
        ${section("Due today", dueToday, "#d97706")}
        ${section("Due tomorrow", dueTomorrow, "#2563eb")}`,
      cta: { label: "Open Kanban Board", url: getAppUrl() },
      footer: NOTIFICATION_FOOTER,
    }),
  };
}

/** e.g. "2 overdue, 3 due today", or "Due today: "Ship it"" for a single card */
export function reminderSubject(overdue: PlannedReminder[], dueToday: PlannedReminder[], dueTomorrow: PlannedReminder[], today: string): string {
  const all = [...overdue, ...dueToday, ...dueTomorrow];
  if (all.length === 1) return `${dueText(all[0], today)}: "${all[0].title}"`.replace(/ \(was due [^)]*\)/, "");
  const parts = [
    overdue.length && `${overdue.length} overdue`,
    dueToday.length && `${dueToday.length} due today`,
    dueTomorrow.length && `${dueTomorrow.length} due tomorrow`,
  ].filter(Boolean);
  return `${parts.join(", ")} on Kanban Board`;
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
    const candidates = await loadCandidates(today);
    if (candidates.length === 0) return { ...base, ran: true };

    const sent = await db
      .select({ cardId: dueReminders.cardId, dueDay: dueReminders.dueDay, sentDay: dueReminders.sentDay })
      .from(dueReminders)
      .where(and(eq(dueReminders.sentDay, today), inArray(dueReminders.cardId, candidates.map((c) => c.cardId))));
    const alreadySent = new Set(sent.map((s) => reminderKey(s.cardId, s.dueDay, s.sentDay)));

    const byRecipient = groupByRecipient(planReminders(candidates, today, alreadySent));
    if (byRecipient.size === 0) return { ...base, ran: true };

    const recipientRows = await db
      .select({ id: users.id, name: users.name, email: users.email, emailNotifications: users.emailNotifications, disabled: users.disabled })
      .from(users)
      .where(inArray(users.id, [...byRecipient.keys()]));
    const recipients = new Map(recipientRows.map((u) => [u.id, u]));

    let emailsSent = 0;
    let remindersSent = 0;
    for (const [userId, items] of byRecipient) {
      const user = recipients.get(userId);
      if (!user || user.disabled || !user.emailNotifications) continue;

      // Claim first so concurrent runs (or another instance) can't double-send
      const claimed: PlannedReminder[] = [];
      for (const r of items) {
        const inserted = await db
          .insert(dueReminders)
          .values({ cardId: r.cardId, kind: r.kind, dueDay: r.dueDay, sentDay: today, userId, sentAt: new Date() })
          .onConflictDoNothing()
          .returning({ cardId: dueReminders.cardId });
        if (inserted.length > 0) claimed.push(r);
      }
      if (claimed.length === 0) continue;

      const ok = await sendEmail({ to: user.email, ...buildReminderEmail(user.name, claimed, today) });
      if (!ok && isEmailConfigured()) {
        // Delivery failed: release the claims so the next run retries
        await db.transaction(async (tx) => {
          for (const r of claimed) {
            await tx.delete(dueReminders)
              .where(and(eq(dueReminders.cardId, r.cardId), eq(dueReminders.dueDay, r.dueDay), eq(dueReminders.sentDay, today)));
          }
        });
        continue;
      }
      emailsSent++;
      remindersSent += claimed.length;
    }

    if (remindersSent > 0) {
      await logAudit({
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
