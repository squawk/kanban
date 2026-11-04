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
 *
 * Private mode (recommended; on when SUPABASE_JWT_PRIVATE_KEY is set): channels are
 * private, and Realtime only lets a browser join with a short-lived JWT we sign for
 * exactly one board topic (checked by the RLS policy in drizzle/0002). Removed
 * members lose access when their token expires, and nobody can join by guessing or
 * remembering a topic name.
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
    /** ES256 private key as a JWK (JSON) that's imported into Supabase's JWT signing keys */
    jwtPrivateKey: process.env.SUPABASE_JWT_PRIVATE_KEY || "",
  };
}

export function isPrivateMode(): boolean {
  return !!getRealtimeConfig().jwtPrivateKey;
}

/** How long a browser's Realtime token lasts; also the worst-case delay before a removed member loses access. */
export const REALTIME_TOKEN_TTL_SECONDS = 10 * 60;

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
  return { url, key: publishableKey, topic: boardTopic(boardId), private: isPrivateMode() };
}

function base64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedKey: { raw: string; key: CryptoKey; kid: string } | null = null;

async function getSigningKey(): Promise<{ raw: string; key: CryptoKey; kid: string }> {
  const { jwtPrivateKey } = getRealtimeConfig();
  if (cachedKey?.raw === jwtPrivateKey) return cachedKey;
  const jwk = JSON.parse(jwtPrivateKey) as JsonWebKey & { kid?: string };
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d) {
    throw new Error("SUPABASE_JWT_PRIVATE_KEY must be an ES256 (P-256) private JWK");
  }
  if (!jwk.kid) throw new Error("SUPABASE_JWT_PRIVATE_KEY must include a kid that matches the key imported into Supabase");
  const key = await globalThis.crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  cachedKey = { raw: jwtPrivateKey, key, kid: jwk.kid };
  return cachedKey;
}

/**
 * Sign a short-lived Supabase JWT that can only join one board's private channel.
 * Web Crypto's ECDSA output is already the raw r||s form that JWS ES256 requires.
 */
export async function signRealtimeToken(userId: string, boardId: string, now = Date.now()) {
  const { key, kid } = await getSigningKey();
  const iat = Math.floor(now / 1000);
  const exp = iat + REALTIME_TOKEN_TTL_SECONDS;
  const header = { alg: "ES256", typ: "JWT", kid };
  const payload = {
    iss: "kanban",
    aud: "authenticated",
    role: "authenticated",
    sub: userId,
    iat,
    exp,
    kanban_topic: boardTopic(boardId),
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  return { token: `${signingInput}.${base64url(signature)}`, expiresAt: exp * 1000 };
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

  const privateQuery = isPrivateMode() ? "?private=true" : "";
  const p = fetch(`${url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${BOARD_CHANGED_EVENT}${privateQuery}`, {
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
