/**
 * Board Pulse: the at-a-glance health of a board (how work is spread across
 * columns, how much is done, what needs attention) and the "spotlight" lenses
 * that light up matching cards on the board. Pure and unit tested.
 */
import { isDoneColumn } from "./due-reminders";
import type { KanbanBoard, KanbanCard } from "./types";

export type SpotlightKind = "overdue" | "dueSoon" | "high" | "mine" | "unassigned" | "private";

export const SPOTLIGHT_LABELS: Record<SpotlightKind, string> = {
  overdue: "Overdue",
  dueSoon: "Due this week",
  high: "High priority",
  mine: "Mine",
  unassigned: "Unassigned",
  private: "Private",
};

/** Lane hues, assigned to columns in order; done columns are always green. */
const LANE_HUES = [32, 212, 268, 340, 190, 48, 12, 160];
const DONE_HUE = 145;

export function laneHue(index: number, title: string): number {
  return isDoneColumn(title) ? DONE_HUE : LANE_HUES[index % LANE_HUES.length];
}

/** Local calendar date of a due date ("2026-11-05" or an ISO timestamp), at midnight. */
export function dueDay(dueDate: string): Date {
  const [y, m, d] = dueDate.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from today until the due date (negative = overdue). */
export function daysUntil(dueDate: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueDay(dueDate).getTime() - today.getTime()) / 86_400_000);
}

export interface SpotlightContext {
  currentUserId?: string;
  /** Cards in a done column never count as overdue or due soon */
  isDone: boolean;
  now?: Date;
}

export function matchesSpotlight(card: KanbanCard, kind: SpotlightKind, ctx: SpotlightContext): boolean {
  switch (kind) {
    case "overdue":
      return !ctx.isDone && !!card.dueDate && daysUntil(card.dueDate, ctx.now) < 0;
    case "dueSoon": {
      if (ctx.isDone || !card.dueDate) return false;
      const days = daysUntil(card.dueDate, ctx.now);
      return days >= 0 && days <= 7;
    }
    case "high":
      return card.priority === "high";
    case "mine":
      return !!ctx.currentUserId && card.assigneeId === ctx.currentUserId;
    case "unassigned":
      // A private card can't be assigned, so it isn't waiting for an owner
      return !card.assigneeId && !card.isPrivate;
    case "private":
      return !!card.isPrivate;
  }
}

export interface PulseLane {
  id: string;
  title: string;
  count: number;
  hue: number;
  done: boolean;
}

export interface BoardPulse {
  total: number;
  doneCount: number;
  /** 0–100, rounded */
  percentDone: number;
  lanes: PulseLane[];
  counts: Record<SpotlightKind, number>;
}

export function computeBoardPulse(
  board: Pick<KanbanBoard, "columns" | "cards">,
  opts: { currentUserId?: string; now?: Date } = {},
): BoardPulse {
  const counts: Record<SpotlightKind, number> = { overdue: 0, dueSoon: 0, high: 0, mine: 0, unassigned: 0, private: 0 };
  let total = 0;
  let doneCount = 0;
  const lanes = board.columns.map((col, i) => {
    const done = isDoneColumn(col.title);
    const cards = col.cardIds.map((id) => board.cards[id]).filter(Boolean);
    for (const card of cards) {
      for (const kind of Object.keys(counts) as SpotlightKind[]) {
        if (matchesSpotlight(card, kind, { currentUserId: opts.currentUserId, isDone: done, now: opts.now })) {
          counts[kind]++;
        }
      }
    }
    total += cards.length;
    if (done) doneCount += cards.length;
    return { id: col.id, title: col.title, count: cards.length, hue: laneHue(i, col.title), done };
  });
  return {
    total,
    doneCount,
    percentDone: total === 0 ? 0 : Math.round((doneCount / total) * 100),
    lanes,
    counts,
  };
}
