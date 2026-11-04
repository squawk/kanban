/**
 * Holds a card's edit lock while its edit dialog is open: acquires on open, renews on
 * an interval, releases on close or page unload. While someone else holds the lock it
 * keeps checking, and takes the lock automatically once it's free.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface LockHolderInfo {
  userId: string;
  name: string;
}

export type CardLockState =
  | { status: "idle" }
  | { status: "acquiring" }
  | { status: "held" }
  | { status: "locked"; holder: LockHolderInfo; canTakeOver: boolean }
  | { status: "lost"; holder: LockHolderInfo | null }
  /** Couldn't reach the lock service: editing is allowed; the server still enforces on save */
  | { status: "error" };

const RENEW_MS = 30_000;

function releaseInBackground(cardId: string) {
  // keepalive lets the request finish even if the page is closing
  fetch(`/api/cards/${encodeURIComponent(cardId)}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
}

export function useCardLock(
  cardId: string | null,
  opts: { onReacquired?: (cardId: string) => void | Promise<void> } = {}
) {
  const [state, setStateRaw] = useState<CardLockState>({ status: "idle" });
  // Track the latest state synchronously: decisions below must not read a stale
  // value from a previous dialog session that hasn't re-rendered yet.
  const stateRef = useRef(state);
  const setState = useCallback((next: CardLockState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const onReacquiredRef = useRef(opts.onReacquired);
  onReacquiredRef.current = opts.onReacquired;

  const acquire = useCallback(
    async (id: string, force = false) => {
      const previous = stateRef.current.status;
      try {
        const res = await fetch(`/api/cards/${encodeURIComponent(id)}/lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(force ? { force: true } : {}),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          // We waited for (or took over from) someone who may have saved: stay read-only
          // until the latest version is loaded, so nobody edits (and saves) stale data.
          if ((previous === "locked" || previous === "lost" || force) && onReacquiredRef.current) {
            setState({ status: "acquiring" });
            await onReacquiredRef.current(id);
          }
          setState({ status: "held" });
        } else if (res.status === 409 && data.lock) {
          setState(
            previous === "held"
              ? { status: "lost", holder: data.lock }
              : previous === "lost"
                ? { status: "lost", holder: data.lock }
                : { status: "locked", holder: data.lock, canTakeOver: !!data.canTakeOver }
          );
        } else {
          setState({ status: "error" });
        }
      } catch {
        if (previous !== "held") setState({ status: "error" });
      }
    },
    [setState]
  );

  useEffect(() => {
    if (!cardId) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "acquiring" });
    acquire(cardId);

    // Renew while we hold it; while someone else does, keep checking whether it's free.
    // After losing it to a takeover we stop, rather than grabbing it back.
    const timer = window.setInterval(() => {
      if (stateRef.current.status !== "lost") acquire(cardId);
    }, RENEW_MS);
    const onPageHide = () => {
      if (stateRef.current.status === "held") releaseInBackground(cardId);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      if (stateRef.current.status === "held") releaseInBackground(cardId);
    };
  }, [cardId, acquire]);

  const takeOver = useCallback(() => {
    if (cardId) return acquire(cardId, true);
  }, [cardId, acquire]);

  /** Check now instead of waiting for the next renewal (e.g. a live "board changed" signal). */
  const recheck = useCallback(() => {
    if (cardId && stateRef.current.status !== "lost" && stateRef.current.status !== "acquiring") acquire(cardId);
  }, [cardId, acquire]);

  return { state, takeOver, recheck };
}
