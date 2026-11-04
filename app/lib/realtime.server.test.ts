// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runWithContext, type Database } from "./db";
import { boardTopic, broadcastBoardChanged, clientRealtimeConfig, flushBroadcasts } from "./realtime.server";

const fetchMock = vi.fn(async () => new Response("", { status: 202 }));

function configure() {
  process.env.SUPABASE_URL = "https://abc.supabase.co/";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_123";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_456";
  process.env.REALTIME_TOPIC_SECRET = "topic-secret";
}

describe("realtime broadcasts", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    configure();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "REALTIME_TOPIC_SECRET"]) delete process.env[k];
  });

  it("derives a stable, unguessable topic per board", () => {
    const a = boardTopic("board-1");
    expect(a).toMatch(/^kanban-board-[0-9a-f]{32}$/);
    expect(boardTopic("board-1")).toBe(a);
    expect(boardTopic("board-2")).not.toBe(a);
    expect(a).not.toContain("board-1");
    process.env.REALTIME_TOPIC_SECRET = "other-secret";
    expect(boardTopic("board-1")).not.toBe(a);
  });

  it("gives the browser only the public key", () => {
    const cfg = clientRealtimeConfig("board-1")!;
    expect(cfg).toEqual({ url: "https://abc.supabase.co", key: "sb_publishable_123", topic: boardTopic("board-1") });
    expect(JSON.stringify(cfg)).not.toContain("sb_secret");
  });

  it("sends a content-free broadcast with the secret key", async () => {
    broadcastBoardChanged("board-1");
    await flushBroadcasts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://abc.supabase.co/realtime/v1/api/broadcast/${boardTopic("board-1")}/events/changed`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apikey).toBe("sb_secret_456");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(Object.keys(JSON.parse(init.body as string))).toEqual(["at"]);
  });

  it("sends at most once per board per request", async () => {
    const waitUntil = vi.fn();
    await runWithContext({ db: {} as Database, env: {}, waitUntil }, async () => {
      broadcastBoardChanged("board-1");
      broadcastBoardChanged("board-1");
      broadcastBoardChanged("board-2");
    });
    await flushBroadcasts();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waitUntil).toHaveBeenCalledTimes(2); // kept alive after the response on Workers
  });

  it("does nothing when Supabase isn't configured, and never throws on failure", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    broadcastBoardChanged("board-1");
    expect(clientRealtimeConfig("board-1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    configure();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    broadcastBoardChanged("board-1");
    await flushBroadcasts();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
