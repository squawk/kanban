/**
 * Browser side of live boards over Supabase Realtime:
 *  - Broadcast: calls `onChange` when someone else edits the board (we then refetch).
 *  - Presence: reports who is viewing the board right now, and which card each person
 *    has open for editing.
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
  /** Card this person has open in the edit dialog, if any */
  editingCardId: string | null;
}

interface PresenceMeta {
  user_id?: unknown;
  editing_card_id?: unknown;
}

/** Collapse Realtime's presence state (one entry per tab) into one viewer per user. */
export function viewersFromPresence(state: Record<string, PresenceMeta[]>): BoardViewer[] {
  const byUser = new Map<string, BoardViewer>();
  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      if (typeof meta.user_id !== "string") continue;
      const editing = typeof meta.editing_card_id === "string" ? meta.editing_card_id : null;
      const existing = byUser.get(meta.user_id);
      if (!existing) byUser.set(meta.user_id, { userId: meta.user_id, editingCardId: editing });
      else if (!existing.editingCardId && editing) existing.editingCardId = editing;
    }
  }
  return [...byUser.values()];
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
  /** Tell other viewers which card you're editing (null when the dialog closes). */
  setEditing: (cardId: string | null) => void;
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
  let editingCardId: string | null = null;
  let track: (() => void) | null = null;

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
      track = () => {
        channel.track({ user_id: userId, editing_card_id: editingCardId }).catch(() => {});
      };
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
            track?.();
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
    setEditing: (cardId) => {
      if (cardId === editingCardId) return;
      editingCardId = cardId;
      track?.();
    },
  };
}
