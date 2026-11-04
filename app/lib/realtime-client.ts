/**
 * Browser side of live board updates: subscribes to a board's Supabase Realtime
 * broadcast channel and calls `onChange` when someone else edits the board.
 * The realtime client is loaded lazily so it only downloads when needed.
 */
export interface RealtimeInfo {
  url: string;
  key: string;
  topic: string;
}

export type RealtimeStatus = "connecting" | "live" | "offline";

export function subscribeToBoard(
  info: RealtimeInfo,
  onChange: () => void,
  onStatus: (status: RealtimeStatus) => void
): () => void {
  let cleanup: (() => void) | null = null;
  let cancelled = false;
  let wasLive = false;

  onStatus("connecting");
  import("@supabase/realtime-js")
    .then(({ RealtimeClient }) => {
      if (cancelled) return;
      const client = new RealtimeClient(`${info.url.replace(/^http/, "ws")}/realtime/v1`, {
        params: { apikey: info.key },
      });
      const channel = client
        .channel(info.topic, { config: { private: false, broadcast: { self: false } } })
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
