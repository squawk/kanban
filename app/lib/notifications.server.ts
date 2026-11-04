/**
 * Email notifications for collaboration events.
 *
 * Rules:
 *  - Never notify the person who performed the action.
 *  - Respect each recipient's `emailNotifications` preference.
 *  - Skip disabled accounts.
 *  - Fire-and-forget: never block or fail the request on email delivery.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { boards, users } from "./db/schema";
import { getAppUrl } from "./config";
import { emailLayout, escapeHtml, NOTIFICATION_FOOTER, sendEmail } from "./email";

interface Actor {
  id: string;
  name: string;
}

interface CardRef {
  id: string;
  title: string;
  boardId: string;
  dueDate?: Date | null;
  priority?: string;
}

function recipientsFor(userIds: (string | null | undefined)[], actorId: string) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== actorId))];
  if (ids.length === 0) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailNotifications: users.emailNotifications,
      disabled: users.disabled,
    })
    .from(users)
    .where(inArray(users.id, ids))
    .all()
    .filter((u) => u.emailNotifications && !u.disabled);
}

function boardName(boardId: string): string {
  return db.select({ name: boards.name }).from(boards).where(eq(boards.id, boardId)).get()?.name ?? "a board";
}

function cardUrl(card: CardRef): string {
  return `${getAppUrl()}/?boardId=${encodeURIComponent(card.boardId)}&card=${encodeURIComponent(card.id)}`;
}

function dispatch(promise: Promise<unknown>) {
  promise.catch((error) => console.error("Notification error:", error instanceof Error ? error.message : error));
}

/** Track pending sends so tests (and graceful shutdown) can await them. */
const pending = new Set<Promise<unknown>>();
function track(p: Promise<unknown>) {
  pending.add(p);
  p.finally(() => pending.delete(p));
  dispatch(p);
}
export async function flushNotifications() {
  await Promise.allSettled([...pending]);
}

export function notifyCardAssigned(card: CardRef, assigneeId: string, actor: Actor) {
  for (const r of recipientsFor([assigneeId], actor.id)) {
    const board = boardName(card.boardId);
    const due = card.dueDate
      ? card.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      : null;
    const details = [`Board: ${board}`, card.priority ? `Priority: ${card.priority}` : null, due ? `Due: ${due}` : null]
      .filter(Boolean)
      .join("\n");
    track(
      sendEmail({
        to: r.email,
        subject: `${actor.name} assigned you "${card.title}"`,
        text: `Hi ${r.name},\n\n${actor.name} assigned you a card:\n\n${card.title}\n${details}\n\nOpen it: ${cardUrl(card)}\n\n${NOTIFICATION_FOOTER}`,
        html: emailLayout({
          heading: "New assignment",
          bodyHtml: `<p>Hi ${escapeHtml(r.name)},</p>
            <p><strong>${escapeHtml(actor.name)}</strong> assigned you a card:</p>
            <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 4px 0; font-size: 16px;"><strong>${escapeHtml(card.title)}</strong></p>
              ${details
                .split("\n")
                .map((line) => `<p style="margin: 4px 0; color: #4b5563;">${escapeHtml(line)}</p>`)
                .join("")}
            </div>`,
          cta: { label: "Open Card", url: cardUrl(card) },
          footer: NOTIFICATION_FOOTER,
        }),
      })
    );
  }
}

export function notifyCardCommented(
  card: CardRef & { assigneeId?: string | null; createdById?: string | null },
  comment: string,
  actor: Actor
) {
  const snippet = comment.length > 500 ? `${comment.slice(0, 500)}…` : comment;
  for (const r of recipientsFor([card.assigneeId, card.createdById], actor.id)) {
    track(
      sendEmail({
        to: r.email,
        subject: `${actor.name} commented on "${card.title}"`,
        text: `Hi ${r.name},\n\n${actor.name} commented on "${card.title}":\n\n${snippet}\n\nOpen it: ${cardUrl(card)}\n\n${NOTIFICATION_FOOTER}`,
        html: emailLayout({
          heading: "New comment",
          bodyHtml: `<p>Hi ${escapeHtml(r.name)},</p>
            <p><strong>${escapeHtml(actor.name)}</strong> commented on <strong>${escapeHtml(card.title)}</strong>:</p>
            <blockquote style="border-left: 4px solid #d1d5db; margin: 16px 0; padding: 8px 16px; color: #374151; white-space: pre-wrap;">${escapeHtml(snippet)}</blockquote>`,
          cta: { label: "View Card", url: cardUrl(card) },
          footer: NOTIFICATION_FOOTER,
        }),
      })
    );
  }
}

export function notifyCardMoved(
  card: CardRef & { assigneeId?: string | null; createdById?: string | null },
  fromColumn: string,
  toColumn: string,
  actor: Actor
) {
  for (const r of recipientsFor([card.assigneeId, card.createdById], actor.id)) {
    track(
      sendEmail({
        to: r.email,
        subject: `"${card.title}" moved to ${toColumn}`,
        text: `Hi ${r.name},\n\n${actor.name} moved "${card.title}" from ${fromColumn} to ${toColumn}.\n\nOpen it: ${cardUrl(card)}\n\n${NOTIFICATION_FOOTER}`,
        html: emailLayout({
          heading: "Card status changed",
          bodyHtml: `<p>Hi ${escapeHtml(r.name)},</p>
            <p><strong>${escapeHtml(actor.name)}</strong> moved <strong>${escapeHtml(card.title)}</strong>
            from <em>${escapeHtml(fromColumn)}</em> to <em>${escapeHtml(toColumn)}</em>.</p>`,
          cta: { label: "View Card", url: cardUrl(card) },
          footer: NOTIFICATION_FOOTER,
        }),
      })
    );
  }
}

export function notifyAddedToBoard(boardId: string, userId: string, actor: Actor) {
  for (const r of recipientsFor([userId], actor.id)) {
    const name = boardName(boardId);
    const url = `${getAppUrl()}/?boardId=${encodeURIComponent(boardId)}`;
    track(
      sendEmail({
        to: r.email,
        subject: `${actor.name} shared the board "${name}" with you`,
        text: `Hi ${r.name},\n\n${actor.name} added you to the board "${name}". You can now view its cards and be assigned work.\n\nOpen it: ${url}\n\n${NOTIFICATION_FOOTER}`,
        html: emailLayout({
          heading: "A board was shared with you",
          bodyHtml: `<p>Hi ${escapeHtml(r.name)},</p>
            <p><strong>${escapeHtml(actor.name)}</strong> added you to the board <strong>${escapeHtml(name)}</strong>.
            You can now view its cards and be assigned work.</p>`,
          cta: { label: "Open Board", url },
          footer: NOTIFICATION_FOOTER,
        }),
      })
    );
  }
}
