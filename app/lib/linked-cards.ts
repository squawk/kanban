/** Columns on different boards match by name, ignoring case and extra spaces. */
export function columnKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The default board name; boards keeping it are named after their owner instead. */
export const DEFAULT_BOARD_NAME = "My Board";

/** How a board shared with you is named: "Luke's board", or "Roadmap (Luke)" if renamed. */
export function sharedBoardName(name: string, ownerName: string | null | undefined): string {
  if (!ownerName) return name;
  return name === DEFAULT_BOARD_NAME ? `${ownerName}'s board` : `${name} (${ownerName})`;
}

/** Label on a card that lives on another board, from the viewer's point of view. */
export function cardBoardLabel(board: { name: string; role: "owner" | "member"; ownerName?: string | null }): string {
  if (board.role === "owner") return board.name === DEFAULT_BOARD_NAME ? "Your board" : board.name;
  return sharedBoardName(board.name, board.ownerName);
}

/** Board id for the combined view of every board you can open */
export const COMBINED_BOARD_ID = "all";
