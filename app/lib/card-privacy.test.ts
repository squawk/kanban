import { describe, it, expect } from "vitest";
import { auditChanges, canSeeCard, cardRef, restoreHiddenCards } from "./card-privacy";

describe("canSeeCard", () => {
  it("lets everyone see public cards and only the creator see private ones", () => {
    expect(canSeeCard({ isPrivate: false, createdById: "a" }, "b")).toBe(true);
    expect(canSeeCard({ isPrivate: true, createdById: "a" }, "a")).toBe(true);
    expect(canSeeCard({ isPrivate: true, createdById: "a" }, "b")).toBe(false);
    // Creator's account was deleted: nobody can see it
    expect(canSeeCard({ isPrivate: true, createdById: null }, "b")).toBe(false);
  });
});

describe("cardRef and auditChanges", () => {
  it("never names a private card", () => {
    expect(cardRef({ title: "Plan", isPrivate: false })).toBe('"Plan"');
    expect(cardRef({ title: "Plan", isPrivate: true })).toBe("a private card");
  });
  it("drops change values for a private card", () => {
    const changes = [{ field: "title", from: "a", to: "b" }];
    expect(auditChanges(changes, false)).toEqual(changes);
    expect(auditChanges(changes, true)).toEqual([{ field: "title" }]);
  });
});

describe("restoreHiddenCards", () => {
  const hidden = new Set(["h1", "h2"]);

  it("keeps a hidden card right after the card that preceded it", () => {
    expect(restoreHiddenCards(["a", "h1", "b"], ["b", "a"], hidden)).toEqual(["b", "a", "h1"]);
  });
  it("keeps hidden cards at the top, in order", () => {
    expect(restoreHiddenCards(["h1", "h2", "a", "b"], ["b", "a"], hidden)).toEqual(["h1", "h2", "b", "a"]);
  });
  it("falls back to an earlier anchor when the preceding card left the column", () => {
    expect(restoreHiddenCards(["a", "b", "h1"], ["a"], hidden)).toEqual(["a", "h1"]);
  });
  it("ignores hidden ids the client sent and handles an empty column", () => {
    expect(restoreHiddenCards(["h1"], ["h1"], hidden)).toEqual(["h1"]);
    expect(restoreHiddenCards(["h1"], [], hidden)).toEqual(["h1"]);
  });
});
