import { describe, it, expect } from "vitest";
import { viewersFromPresence } from "./realtime-client";

describe("viewersFromPresence", () => {
  it("merges tabs into one viewer per user and keeps any editing card", () => {
    const viewers = viewersFromPresence({
      alice: [
        { user_id: "alice", editing_card_id: null },
        { user_id: "alice", editing_card_id: "card-1" }, // second tab has a card open
      ],
      bob: [{ user_id: "bob", editing_card_id: null }],
    });
    expect(viewers).toEqual([
      { userId: "alice", editingCardId: "card-1" },
      { userId: "bob", editingCardId: null },
    ]);
  });

  it("ignores malformed presence payloads", () => {
    expect(
      viewersFromPresence({
        x: [{ user_id: 42 }, { editing_card_id: "c" }, { user_id: "ok", editing_card_id: { evil: true } }],
      })
    ).toEqual([{ userId: "ok", editingCardId: null }]);
  });
});
