import { describe, it, expect } from "vitest";
import { highlightParts, rankItems, scoreItem, queryWords } from "./command-search";

const items = [
  { title: "Write release notes", extra: ["In Progress", "My Board"] },
  { title: "Draft Q4 launch announcement", extra: ["To Do", "Launch", "Brad"] },
  { title: "Launch checklist", extra: ["To Do"] },
  { title: "Fix login redirect on Safari", extra: ["Bug", "Bob's board"] },
  { title: "Café menu", extra: [] },
];

describe("rankItems", () => {
  it("requires every word to match somewhere", () => {
    expect(rankItems(items, "login safari").map((r) => r.item.title)).toEqual(["Fix login redirect on Safari"]);
    expect(rankItems(items, "login launch")).toEqual([]);
  });

  it("ranks a title that starts with the query first, then word starts, then other fields", () => {
    expect(rankItems(items, "launch").map((r) => r.item.title)).toEqual([
      "Launch checklist", // title starts with it
      "Draft Q4 launch announcement", // a word in the title starts with it
    ]);
    // Only matches other fields (tag, board)
    expect(rankItems(items, "bob").map((r) => r.item.title)).toEqual(["Fix login redirect on Safari"]);
  });

  it("matches across title and other fields, ignoring case and accents", () => {
    expect(rankItems(items, "RELEASE progress").map((r) => r.item.title)).toEqual(["Write release notes"]);
    expect(rankItems(items, "cafe").map((r) => r.item.title)).toEqual(["Café menu"]);
  });

  it("returns everything in its original order for an empty query, up to the limit", () => {
    expect(rankItems(items, "   ", 2).map((r) => r.item.title)).toEqual(["Write release notes", "Draft Q4 launch announcement"]);
  });

  it("treats regex characters literally", () => {
    expect(scoreItem({ title: "Fix (urgent) bug" }, queryWords("(urgent"))).toBeGreaterThan(0);
    expect(scoreItem({ title: "Fix bug" }, queryWords(".*"))).toBe(0);
  });
});

describe("highlightParts", () => {
  it("marks every occurrence of every word", () => {
    expect(highlightParts("Launch the launch", "launch")).toEqual([
      { text: "Launch", match: true },
      { text: " the ", match: false },
      { text: "launch", match: true },
    ]);
    expect(highlightParts("Fix login", "fi log")).toEqual([
      { text: "Fi", match: true },
      { text: "x ", match: false },
      { text: "log", match: true },
      { text: "in", match: false },
    ]);
  });

  it("returns the text unchanged with no query", () => {
    expect(highlightParts("Plain", "")).toEqual([{ text: "Plain", match: false }]);
  });
});
