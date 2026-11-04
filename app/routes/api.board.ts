import { db } from "~/lib/db";
import { columns, cards } from "~/lib/db/schema";
import { eq, asc, and, isNull, inArray } from "drizzle-orm";
import {
  api,
  boardIdFromRequest,
  getBoardParticipants,
  requireUser,
  resolveBoard,
} from "~/lib/access.server";
import { serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";
import { detectCardMoves } from "~/lib/card-diff";
import { logAudit } from "~/lib/audit.server";
import { notifyCardMoved } from "~/lib/notifications.server";
import { broadcastBoardChanged, clientRealtimeConfig } from "~/lib/realtime.server";
import { getActiveLocks } from "~/lib/card-locks.server";

// GET /api/board?boardId= - Get a kanban board (defaults to the user's own board)
export const loader = api("fetch board", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  const { board, role } = await resolveBoard(user, boardIdFromRequest(request));

  const boardColumns = await db
    .select()
    .from(columns)
    .where(eq(columns.boardId, board.id))
    .orderBy(asc(columns.position));

  const boardCards = await db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, board.id), isNull(cards.archivedAt)));

  const serialized = await serializeCards(boardCards);
  const locks = await getActiveLocks(serialized.map((c) => c.id));

  return json({
    board: { id: board.id, name: board.name, role },
    realtime: clientRealtimeConfig(board.id),
    members: await getBoardParticipants(board.id),
    columns: boardColumns.map((col) => ({
      id: col.id,
      title: col.title,
      cardIds: JSON.parse(col.cardIds),
    })),
    cards: Object.fromEntries(serialized.map((c) => [c.id, { ...c, lock: locks.get(c.id) ?? null }])),
  });
});

// PUT /api/board - Update column order / card placement (drag and drop)
export const action = api("update board", async ({ request }: { request: Request }) => {
  if (request.method !== "PUT") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const body = await readJson<{ boardId?: string; columns?: unknown }>(request);
  const { board } = await resolveBoard(user, body.boardId ?? boardIdFromRequest(request));
  const newColumns = body.columns;

  if (!Array.isArray(newColumns)) return jsonError("Invalid request format", 400);

  type Layout = { id: string; cardIds: string[] }[];
  const result = await db.transaction(async (tx) => {
    // Lock the board's columns so concurrent saves can't interleave their read-merge-write
    const existingColumns = await tx.select().from(columns).where(eq(columns.boardId, board.id)).for("update");
    const existingById = new Map(existingColumns.map((c) => [c.id, c]));
    const beforeLayout: Layout = existingColumns.map((c) => ({ id: c.id, cardIds: JSON.parse(c.cardIds) as string[] }));

    // Validate every column and card belongs to this board
    const submittedCardIds = new Set<string>();
    for (const col of newColumns) {
      if (!col || typeof col.id !== "string" || !Array.isArray(col.cardIds)) {
        return { error: jsonError("Invalid column format", 400) };
      }
      if (!existingById.has(col.id)) return { error: jsonError("Column not found or access denied", 403) };
      for (const cardId of col.cardIds) {
        if (typeof cardId !== "string") return { error: jsonError("Invalid card ID format", 400) };
        submittedCardIds.add(cardId);
      }
    }
    const referenced = submittedCardIds.size
      ? await tx.select({ id: cards.id, boardId: cards.boardId }).from(cards).where(inArray(cards.id, [...submittedCardIds]))
      : [];
    if (referenced.some((c) => c.boardId !== board.id)) return { error: jsonError("Card access denied", 403) };

    // Collaboration safety: if a collaborator added a card the client hasn't seen yet,
    // keep it in its current column instead of silently dropping it.
    const afterLayout: Layout = (newColumns as Layout).map((c) => ({
      id: c.id,
      cardIds: c.cardIds.filter((id, i, arr) => arr.indexOf(id) === i),
    }));
    for (const before of beforeLayout) {
      const missing = before.cardIds.filter((id) => !submittedCardIds.has(id));
      if (missing.length) {
        const target = afterLayout.find((c) => c.id === before.id);
        if (target) target.cardIds.push(...missing);
      }
    }

    const now = new Date();
    for (const [i, col] of afterLayout.entries()) {
      await tx
        .update(columns)
        .set({ cardIds: JSON.stringify(col.cardIds), position: i, updatedAt: now })
        .where(and(eq(columns.id, col.id), eq(columns.boardId, board.id)));
    }
    return { existingById, beforeLayout, afterLayout };
  });
  if ("error" in result) return result.error!;
  const { existingById, beforeLayout, afterLayout } = result;
  // Reorders aren't audited, so signal live viewers explicitly (deduped per request)
  broadcastBoardChanged(board.id);

  // Audit + notify on cards that changed column
  const moves = detectCardMoves(beforeLayout, afterLayout);
  if (moves.length) {
    const movedCards = await db.select().from(cards).where(inArray(cards.id, moves.map((m) => m.cardId)));
    const cardMap = new Map(movedCards.map((c) => [c.id, c]));
    for (const move of moves) {
      const card = cardMap.get(move.cardId);
      if (!card) continue;
      const from = existingById.get(move.fromColumnId)?.title ?? "?";
      const to = existingById.get(move.toColumnId)?.title ?? "?";
      await logAudit({
        actor: user,
        action: "card.moved",
        entityType: "card",
        entityId: card.id,
        boardId: board.id,
        summary: `Moved "${card.title}" from ${from} to ${to}`,
        metadata: { fromColumnId: move.fromColumnId, toColumnId: move.toColumnId, from, to },
        request,
      });
      notifyCardMoved(card, from, to, user);
    }
  }

  return json({ success: true });
});
