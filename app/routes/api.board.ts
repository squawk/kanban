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

// GET /api/board?boardId= - Get a kanban board (defaults to the user's own board)
export const loader = api("fetch board", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  const { board, role } = resolveBoard(user, boardIdFromRequest(request));

  const boardColumns = db
    .select()
    .from(columns)
    .where(eq(columns.boardId, board.id))
    .orderBy(asc(columns.position))
    .all();

  const boardCards = db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, board.id), isNull(cards.archivedAt)))
    .all();

  const serialized = serializeCards(boardCards);

  return json({
    board: { id: board.id, name: board.name, role },
    members: getBoardParticipants(board.id),
    columns: boardColumns.map((col) => ({
      id: col.id,
      title: col.title,
      cardIds: JSON.parse(col.cardIds),
    })),
    cards: Object.fromEntries(serialized.map((c) => [c.id, c])),
  });
});

// PUT /api/board - Update column order / card placement (drag and drop)
export const action = api("update board", async ({ request }: { request: Request }) => {
  if (request.method !== "PUT") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const body = await readJson<{ boardId?: string; columns?: unknown }>(request);
  const { board } = resolveBoard(user, body.boardId ?? boardIdFromRequest(request));
  const newColumns = body.columns;

  if (!Array.isArray(newColumns)) return jsonError("Invalid request format", 400);

  const existingColumns = db.select().from(columns).where(eq(columns.boardId, board.id)).all();
  const existingById = new Map(existingColumns.map((c) => [c.id, c]));
  const beforeLayout = existingColumns.map((c) => ({ id: c.id, cardIds: JSON.parse(c.cardIds) as string[] }));

  // Validate every column and card belongs to this board
  const submittedCardIds = new Set<string>();
  for (const col of newColumns) {
    if (!col || typeof col.id !== "string" || !Array.isArray(col.cardIds)) {
      return jsonError("Invalid column format", 400);
    }
    if (!existingById.has(col.id)) return jsonError("Column not found or access denied", 403);
    for (const cardId of col.cardIds) {
      if (typeof cardId !== "string") return jsonError("Invalid card ID format", 400);
      submittedCardIds.add(cardId);
    }
  }
  const referenced = submittedCardIds.size
    ? db.select({ id: cards.id, boardId: cards.boardId }).from(cards).where(inArray(cards.id, [...submittedCardIds])).all()
    : [];
  if (referenced.some((c) => c.boardId !== board.id)) return jsonError("Card access denied", 403);

  // Collaboration safety: if a collaborator added a card the client hasn't seen yet,
  // keep it in its current column instead of silently dropping it.
  const afterLayout = (newColumns as { id: string; cardIds: string[] }[]).map((c) => ({
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
  afterLayout.forEach((col, i) => {
    db.update(columns)
      .set({ cardIds: JSON.stringify(col.cardIds), position: i, updatedAt: now })
      .where(and(eq(columns.id, col.id), eq(columns.boardId, board.id)))
      .run();
  });

  // Audit + notify on cards that changed column
  const moves = detectCardMoves(beforeLayout, afterLayout);
  if (moves.length) {
    const movedCards = db.select().from(cards).where(inArray(cards.id, moves.map((m) => m.cardId))).all();
    const cardMap = new Map(movedCards.map((c) => [c.id, c]));
    for (const move of moves) {
      const card = cardMap.get(move.cardId);
      if (!card) continue;
      const from = existingById.get(move.fromColumnId)?.title ?? "?";
      const to = existingById.get(move.toColumnId)?.title ?? "?";
      logAudit({
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
