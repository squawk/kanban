/**
 * Browser side of live board updates: subscribes to a board's Supabase Realtime
 * broadcast channel and calls `onChange` when someone else edits the board.
 * The realtime client is loaded lazily so it only downloads when needed.
 */
export interface RealtimeInfo {
  url: string;
  key: string;
  topic: string;
  /** Private channel: joining requires a JWT from /api/realtime-token */
  private?: boolean;
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

export type RealtimeStatus = "connecting" | "live" | "offline";

export function subscribeToBoard(
  boardId: string,
  info: RealtimeInfo,
  onChange: () => void,
  onStatus: (status: RealtimeStatus) => void
): () => void {
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
      const channel = client
        .channel(info.topic, { config: { private: !!info.private, broadcast: { self: false } } })
        .on("broadcast", { event: "changed" }, () => onChange())
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // After a reconnect we may have missed signals, so catch up once
            if (wasLive) onChange();
            wasLive = true;
            onStatus("live");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            onStatus("offline");
          }
        });
      cleanup = () => {
        client.removeChannel(channel);
        client.disconnect();
      };
    })
    .catch((error) => {
      console.error("Realtime unavailable:", error);
      onStatus("offline");
    });

  return () => {
    cancelled = true;
    cleanup?.();
  };
}
