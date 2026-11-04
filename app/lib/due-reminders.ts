/**
 * Pure planning logic for due-date reminder emails (no DB access, unit tested).
 *
 * Due dates are calendar days (stored as UTC midnight of the chosen date), so all
 * comparisons are done on YYYY-MM-DD strings in the configured reminder time zone.
 */

export type ReminderKind = "due_soon" | "overdue";

/** Columns whose cards count as finished and never get reminders. */
const DONE_COLUMN_TITLES = new Set(["completed", "complete", "done", "finished", "closed"]);

export function isDoneColumn(title: string | null | undefined): boolean {
  return !!title && DONE_COLUMN_TITLES.has(title.trim().toLowerCase());
}

/** YYYY-MM-DD and hour for `now` in the given IANA time zone. */
export function localDayAndHour(now: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dueDayOf(dueDate: Date): string {
  return dueDate.toISOString().slice(0, 10);
}

/**
 * Which reminder (if any) applies to a card due on `dueDay` when today is `today`:
 *  - due_soon: due tomorrow or today (catches up if the "tomorrow" run was missed)
 *  - overdue:  due date has passed
 */
export function reminderKindFor(dueDay: string, today: string): ReminderKind | null {
  if (dueDay < today) return "overdue";
  if (dueDay === today || dueDay === addDays(today, 1)) return "due_soon";
  return null;
}

export interface ReminderCandidate {
  cardId: string;
  title: string;
  boardId: string;
  boardName: string;
  dueDate: Date;
  priority: string;
  columnTitle: string | null;
  /** Assignee, else creator, else board owner */
  recipientId: string;
}

export interface PlannedReminder extends ReminderCandidate {
  kind: ReminderKind;
  dueDay: string;
}

/**
 * Decide which reminders to send. `alreadySent` holds keys `${cardId}:${kind}:${dueDay}`.
 * Overdue cards only get an overdue reminder once; a card can't get both kinds in one run.
 */
export function planReminders(
  candidates: ReminderCandidate[],
  today: string,
  alreadySent: Set<string>
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (const c of candidates) {
    if (isDoneColumn(c.columnTitle)) continue;
    const dueDay = dueDayOf(c.dueDate);
    const kind = reminderKindFor(dueDay, today);
    if (!kind) continue;
    if (alreadySent.has(`${c.cardId}:${kind}:${dueDay}`)) continue;
    planned.push({ ...c, kind, dueDay });
  }
  return planned;
}

/** Group planned reminders into one digest per recipient. */
export function groupByRecipient(planned: PlannedReminder[]): Map<string, PlannedReminder[]> {
  const byUser = new Map<string, PlannedReminder[]>();
  for (const r of planned) {
    const list = byUser.get(r.recipientId) ?? [];
    list.push(r);
    byUser.set(r.recipientId, list);
  }
  for (const list of byUser.values()) list.sort((a, b) => a.dueDay.localeCompare(b.dueDay));
  return byUser;
}
