/**
 * Live board updates through Supabase Realtime **Broadcast**.
 *
 * The server sends a content-free "changed" signal to a per-board channel after any
 * board mutation; browsers watching the board refetch it through the normal
 * authenticated API. No board data passes through Realtime, so the tables can stay
 * locked down with RLS and the public Supabase key reveals nothing.
 *
 * The channel name is an HMAC of the board id, handed only to people who can open the
 * board, so outsiders can't find (or spam) a board's channel.
 */
import crypto from "crypto";
import { getRequestContext, waitUntil } from "./db";

export const BOARD_CHANGED_EVENT = "changed";

export function getRealtimeConfig() {
  return {
    url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || "",
    secretKey: process.env.SUPABASE_SECRET_KEY || "",
    topicSecret: process.env.REALTIME_TOPIC_SECRET || process.env.SESSION_SECRET || "",
  };
}

export function isRealtimeConfigured(): boolean {
  const c = getRealtimeConfig();
  return !!(c.url && c.publishableKey && c.secretKey && c.topicSecret);
}

/** Deterministic, unguessable channel name for a board. */
export function boardTopic(boardId: string): string {
  const { topicSecret } = getRealtimeConfig();
  const digest = crypto.createHmac("sha256", topicSecret).update(`board:${boardId}`).digest("hex");
  return `kanban-board-${digest.slice(0, 32)}`;
}

/** What the browser needs to subscribe, or null when realtime isn't configured. */
export function clientRealtimeConfig(boardId: string) {
  if (!isRealtimeConfigured()) return null;
  const { url, publishableKey } = getRealtimeConfig();
  return { url, key: publishableKey, topic: boardTopic(boardId) };
}

const sentInRequest = new WeakMap<object, Set<string>>();
const pending = new Set<Promise<unknown>>();

/** Await in-flight broadcasts (tests). */
export async function flushBroadcasts() {
  await Promise.allSettled([...pending]);
}

/**
 * Tell everyone watching `boardId` to refetch. Sent at most once per board per
 * request, in the background (kept alive with waitUntil). Never throws.
 */
export function broadcastBoardChanged(boardId: string) {
  if (!isRealtimeConfigured()) return;

  const ctx = getRequestContext();
  if (ctx) {
    const sent = sentInRequest.get(ctx) ?? new Set<string>();
    if (sent.has(boardId)) return;
    sent.add(boardId);
    sentInRequest.set(ctx, sent);
  }

  const { url, secretKey } = getRealtimeConfig();
  const topic = boardTopic(boardId);
  const headers: Record<string, string> = { apikey: secretKey, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't
  if (secretKey.startsWith("eyJ")) headers.Authorization = `Bearer ${secretKey}`;

  const p = fetch(`${url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${BOARD_CHANGED_EVENT}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ at: Date.now() }),
  })
    .then(async (res) => {
      if (!res.ok) console.error(`Realtime broadcast failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    })
    .catch((error) => console.error("Realtime broadcast error:", error instanceof Error ? error.message : error));

  pending.add(p);
  p.finally(() => pending.delete(p));
  waitUntil(p);
}
