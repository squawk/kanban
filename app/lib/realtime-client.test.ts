import { describe, it, expect } from "vitest";
import { viewersFromPresence } from "./realtime-client";

describe("viewersFromPresence", () => {
  it("merges tabs into one viewer per user", () => {
    expect(
      viewersFromPresence({
        alice: [{ user_id: "alice" }, { user_id: "alice" }], // two tabs
        bob: [{ user_id: "bob" }],
      })
    ).toEqual([{ userId: "alice" }, { userId: "bob" }]);
  });

  it("ignores malformed presence payloads", () => {
    expect(viewersFromPresence({ x: [{ user_id: 42 }, {}, { user_id: "ok" }] })).toEqual([{ userId: "ok" }]);
  });
});
