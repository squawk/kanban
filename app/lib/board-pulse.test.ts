import { describe, it, expect } from "vitest";
import { computeBoardPulse, daysUntil, laneHue, matchesSpotlight } from "./board-pulse";
import type { KanbanCard } from "./types";

const now = new Date(2026, 10, 5, 15, 30); // Nov 5, 2026, mid-afternoon local time

const card = (id: string, extra: Partial<KanbanCard> = {}): KanbanCard => ({
  id,
  title: id,
  notes: "",
  priority: "medium",
  createdAt: "",
  updatedAt: "",
  ...extra,
});

describe("daysUntil", () => {
  it("compares calendar days, ignoring the time of day", () => {
    expect(daysUntil("2026-11-05", now)).toBe(0);
    expect(daysUntil("2026-11-05T00:00:00.000Z", now)).toBe(0);
    expect(daysUntil("2026-11-04", now)).toBe(-1);
    expect(daysUntil("2026-11-12", now)).toBe(7);
  });
});

describe("matchesSpotlight", () => {
  const ctx = { currentUserId: "u1", isDone: false, now };

  it("finds overdue and due-this-week cards, but never in a done column", () => {
    const late = card("a", { dueDate: "2026-11-01" });
    const soon = card("b", { dueDate: "2026-11-10" });
    const later = card("c", { dueDate: "2026-11-20" });
    expect(matchesSpotlight(late, "overdue", ctx)).toBe(true);
    expect(matchesSpotlight(late, "dueSoon", ctx)).toBe(false);
    expect(matchesSpotlight(soon, "dueSoon", ctx)).toBe(true);
    expect(matchesSpotlight(later, "dueSoon", ctx)).toBe(false);
    expect(matchesSpotlight(late, "overdue", { ...ctx, isDone: true })).toBe(false);
  });

  it("matches priority and assignment", () => {
    expect(matchesSpotlight(card("a", { priority: "high" }), "high", ctx)).toBe(true);
    expect(matchesSpotlight(card("a", { assigneeId: "u1" }), "mine", ctx)).toBe(true);
    expect(matchesSpotlight(card("a", { assigneeId: "u2" }), "mine", ctx)).toBe(false);
    expect(matchesSpotlight(card("a"), "unassigned", ctx)).toBe(true);
    expect(matchesSpotlight(card("a"), "mine", { ...ctx, currentUserId: undefined })).toBe(false);
    // Private cards light up under "Private", not "Unassigned"
    expect(matchesSpotlight(card("a", { isPrivate: true }), "private", ctx)).toBe(true);
    expect(matchesSpotlight(card("a", { isPrivate: true }), "unassigned", ctx)).toBe(false);
  });
});

describe("computeBoardPulse", () => {
  it("summarizes lanes, completion, and spotlight counts", () => {
    const pulse = computeBoardPulse(
      {
        columns: [
          { id: "todo", title: "To Do", cardIds: ["a", "b", "missing"] },
          { id: "doing", title: "In Progress", cardIds: ["c"] },
          { id: "done", title: "Completed", cardIds: ["d"] },
        ],
        cards: {
          a: card("a", { dueDate: "2026-11-01", priority: "high" }),
          b: card("b", { dueDate: "2026-11-06", assigneeId: "u1" }),
          c: card("c", { assigneeId: "u2" }),
          d: card("d", { dueDate: "2026-10-01" }),
        },
      },
      { currentUserId: "u1", now },
    );
    expect(pulse.total).toBe(4);
    expect(pulse.doneCount).toBe(1);
    expect(pulse.percentDone).toBe(25);
    expect(pulse.lanes.map((l) => [l.id, l.count, l.done])).toEqual([
      ["todo", 2, false],
      ["doing", 1, false],
      ["done", 1, true],
    ]);
    // The done card's past due date doesn't count as overdue
    expect(pulse.counts).toEqual({ overdue: 1, dueSoon: 1, high: 1, mine: 1, unassigned: 2, private: 0 });
  });

  it("handles an empty board", () => {
    const pulse = computeBoardPulse({ columns: [], cards: {} });
    expect(pulse.total).toBe(0);
    expect(pulse.percentDone).toBe(0);
  });
});

describe("laneHue", () => {
  it("colors done columns green and cycles the rest", () => {
    expect(laneHue(5, "Done")).toBe(145);
    expect(laneHue(0, "To Do")).not.toBe(laneHue(1, "In Progress"));
  });
});
