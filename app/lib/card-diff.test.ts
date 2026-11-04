import { describe, it, expect } from "vitest";
import { detectCardMoves, diffCard } from "./card-diff";

describe("diffCard", () => {
  const base = { title: "A", notes: "n", priority: "medium", dueDate: null, assigneeId: null, tagIds: ["t1", "t2"] };

  it("returns no changes for identical cards (tag order ignored)", () => {
    expect(diffCard(base, { ...base, tagIds: ["t2", "t1"] })).toEqual([]);
  });

  it("reports each changed field", () => {
    const changes = diffCard(base, {
      ...base,
      title: "B",
      notes: "longer notes",
      priority: "high",
      dueDate: "2026-12-01T00:00:00.000Z",
      assigneeId: "u1",
      tagIds: ["t1"],
    });
    expect(changes.map((c) => c.field)).toEqual(["title", "notes", "priority", "dueDate", "assigneeId", "tags"]);
    expect(changes.find((c) => c.field === "notes")).toEqual({ field: "notes", from: "1 chars", to: "12 chars" });
    expect(changes.find((c) => c.field === "dueDate")?.to).toBe("2026-12-01");
  });

  it("treats Date and ISO string for the same day as equal", () => {
    expect(diffCard({ ...base, dueDate: new Date("2026-12-01T00:00:00Z") }, { ...base, dueDate: "2026-12-01T00:00:00.000Z" })).toEqual([]);
  });
});

describe("detectCardMoves", () => {
  it("finds cards that changed column, ignoring reorders and new cards", () => {
    const before = [
      { id: "todo", cardIds: ["a", "b"] },
      { id: "done", cardIds: ["c"] },
    ];
    const after = [
      { id: "todo", cardIds: ["b"] },
      { id: "done", cardIds: ["c", "a", "new"] },
    ];
    expect(detectCardMoves(before, after)).toEqual([{ cardId: "a", fromColumnId: "todo", toColumnId: "done" }]);
  });
});
