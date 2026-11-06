import { describe, it, expect } from "vitest";
import { addDays, groupByRecipient, isDoneColumn, localDayAndHour, planReminders, reminderKey, reminderKindFor } from "./due-reminders";

const card = (id: string, due: string, extra: Partial<Parameters<typeof planReminders>[0][number]> = {}) => ({
  cardId: id,
  title: id,
  boardId: "b",
  boardName: "Board",
  dueDate: new Date(`${due}T00:00:00Z`),
  priority: "medium",
  columnTitle: "To Do",
  recipientId: "u1",
  ...extra,
});

describe("due reminder planning", () => {
  it("computes the local day and hour in a time zone", () => {
    const now = new Date("2026-11-05T03:30:00Z");
    expect(localDayAndHour(now, "UTC")).toEqual({ day: "2026-11-05", hour: 3 });
    expect(localDayAndHour(now, "America/Los_Angeles")).toEqual({ day: "2026-11-04", hour: 19 });
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("classifies due dates", () => {
    expect(reminderKindFor("2026-11-06", "2026-11-05")).toBe("due_tomorrow");
    expect(reminderKindFor("2026-11-05", "2026-11-05")).toBe("due_today");
    expect(reminderKindFor("2026-11-04", "2026-11-05")).toBe("overdue");
    expect(reminderKindFor("2026-11-07", "2026-11-05")).toBeNull();
  });

  it("recognizes done columns", () => {
    expect(isDoneColumn("Completed")).toBe(true);
    expect(isDoneColumn(" done ")).toBe(true);
    expect(isDoneColumn("In Progress")).toBe(false);
  });

  it("skips done cards, already-sent reminders, and far-off due dates", () => {
    const planned = planReminders(
      [
        card("tomorrow", "2026-11-06"),
        card("late", "2026-11-03"),
        card("finished", "2026-11-06", { columnTitle: "Completed" }),
        card("sent", "2026-11-06"),
        card("later", "2026-11-20"),
      ],
      "2026-11-05",
      new Set([reminderKey("sent", "2026-11-06", "2026-11-05")])
    );
    expect(planned.map((p) => [p.cardId, p.kind])).toEqual([
      ["tomorrow", "due_tomorrow"],
      ["late", "overdue"],
    ]);
  });

  it("reminds again on the due day and every morning while overdue", () => {
    const c = [card("x", "2026-11-06")];
    // Reminded yesterday ("due tomorrow"): still reminded today ("due today")
    const yesterday = new Set([reminderKey("x", "2026-11-06", "2026-11-05")]);
    expect(planReminders(c, "2026-11-06", yesterday).map((p) => p.kind)).toEqual(["due_today"]);
    // Already sent this morning: nothing
    expect(planReminders(c, "2026-11-06", new Set([reminderKey("x", "2026-11-06", "2026-11-06")]))).toEqual([]);
    // Overdue: every morning, whatever was sent on earlier mornings
    const earlier = new Set(["2026-11-07", "2026-11-08"].map((d) => reminderKey("x", "2026-11-06", d)));
    expect(planReminders(c, "2026-11-09", earlier).map((p) => p.kind)).toEqual(["overdue"]);
  });

  it("groups by recipient, soonest first", () => {
    const grouped = groupByRecipient(
      planReminders(
        [card("a", "2026-11-06"), card("b", "2026-11-03"), card("c", "2026-11-06", { recipientId: "u2" })],
        "2026-11-05",
        new Set()
      )
    );
    expect(grouped.get("u1")!.map((r) => r.cardId)).toEqual(["b", "a"]);
    expect(grouped.get("u2")!.map((r) => r.cardId)).toEqual(["c"]);
  });
});
