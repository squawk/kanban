/**
 * Browser side of live boards over Supabase Realtime:
 *  - Broadcast: calls `onChange` when someone else edits the board (we then refetch).
 *  - Presence: reports who is viewing the board right now. (Who is *editing* a card
 *    comes from server-side card locks, which are authoritative.)
 * The realtime client is loaded lazily so it only downloads when needed.
 */
export interface RealtimeInfo {
  url: string;
  key: string;
  topic: string;
  /** Private channel: joining requires a JWT from /api/realtime-token */
  private?: boolean;
}

export type RealtimeStatus = "connecting" | "live" | "offline";

export interface BoardViewer {
  userId: string;
}

interface PresenceMeta {
  user_id?: unknown;
}

/** Collapse Realtime's presence state (one entry per tab) into one viewer per user. */
export function viewersFromPresence(state: Record<string, PresenceMeta[]>): BoardViewer[] {
  const ids = new Set<string>();
  for (const metas of Object.values(state)) {
    for (const meta of metas) if (typeof meta.user_id === "string") ids.add(meta.user_id);
  }
  return [...ids].map((userId) => ({ userId }));
}

/**
 * Returns the current board token, fetching a new one shortly before it expires.
 * (The realtime client asks on every heartbeat, so this must be cheap.)
 */
function createTokenProvider(boardId: string) {
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string | null> | null = null;
  return async (): Promise<string | null> => {
    if (cached && cached.expiresAt - Date.now() > 2 * 60_000) return cached.token;
    inflight ??= fetch(`/api/realtime-token?boardId=${encodeURIComponent(boardId)}`)
      .then(async (res) => {
        if (!res.ok) return null; // e.g. removed from the board: stop authorizing
        cached = await res.json();
        return cached!.token;
      })
      .catch(() => cached?.token ?? null)
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

export interface BoardSubscription {
  unsubscribe: () => void;
}

export function subscribeToBoard(opts: {
  boardId: string;
  userId: string;
  info: RealtimeInfo;
  onChange: () => void;
  onStatus: (status: RealtimeStatus) => void;
  onPresence: (viewers: BoardViewer[]) => void;
}): BoardSubscription {
  const { boardId, userId, info, onChange, onStatus, onPresence } = opts;
  let cleanup: (() => void) | null = null;
  let cancelled = false;
  let wasLive = false;

  onStatus("connecting");
  import("@supabase/realtime-js")
    .then(async ({ RealtimeClient }) => {
      if (cancelled) return;
      const client = new RealtimeClient(`${info.url.replace(/^http/, "ws")}/realtime/v1`, {
        params: { apikey: info.key },
        ...(info.private && { accessToken: createTokenProvider(boardId) }),
      });
      // Private channels: get the board token before joining, or the first join is refused
      if (info.private) await client.setAuth();
      if (cancelled) {
        client.disconnect();
        return;
      }
      const channel = client.channel(info.topic, {
        config: {
          private: !!info.private,
          broadcast: { self: false },
          presence: { key: userId, enabled: true },
        },
      });
      channel
        .on("broadcast", { event: "changed" }, () => onChange())
        .on("presence", { event: "sync" }, () =>
          onPresence(viewersFromPresence(channel.presenceState() as Record<string, PresenceMeta[]>))
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // After a reconnect we may have missed signals, so catch up once
            if (wasLive) onChange();
            wasLive = true;
            onStatus("live");
            channel.track({ user_id: userId }).catch(() => {});
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            onStatus("offline");
            onPresence([]);
          }
        });
      cleanup = () => {
        channel.untrack().catch(() => {});
        client.removeChannel(channel);
        client.disconnect();
      };
    })
    .catch((error) => {
      console.error("Realtime unavailable:", error);
      onStatus("offline");
    });

  return {
    unsubscribe: () => {
      cancelled = true;
      cleanup?.();
    },
  };
}
