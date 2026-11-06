/**
 * Commands for the open board from outside it (the ⌘K palette lives in the page
 * header, the board owns its dialogs and spotlight). A window event keeps the two
 * decoupled: whichever board is mounted handles it.
 */
import type { SpotlightKind } from "./board-pulse";

export type BoardCommand =
  | { type: "new-card" }
  | { type: "quick-add" }
  | { type: "spotlight"; kind: SpotlightKind | null };

const EVENT = "kanban:board-command";

export function sendBoardCommand(command: BoardCommand) {
  window.dispatchEvent(new CustomEvent<BoardCommand>(EVENT, { detail: command }));
}

/** Subscribe to board commands; returns the unsubscribe function. */
export function onBoardCommand(handler: (command: BoardCommand) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<BoardCommand>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
