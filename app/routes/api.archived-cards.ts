import { db } from "~/lib/db";
import { cards, columns, cardTags } from "~/lib/db/schema";
import { eq, and, isNotNull, desc, asc } from "drizzle-orm";
import { api, boardIdFromRequest, requireCardAccess, requireUser, resolveBoard } from "~/lib/access.server";
import { serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";

// GET /api/archived-cards?boardId= - Archived cards for a board
export const loader = api("fetch archived cards", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  const { board } = resolveBoard(user, boardIdFromRequest(request));

  const archivedCards = db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, board.id), isNotNull(cards.archivedAt)))
    .orderBy(desc(cards.archivedAt))
    .all();

  return json(serializeCards(archivedCards, { includeComments: false }));
});

// POST /api/archived-cards - Restore or permanently delete an archived card
export const action = api("update archived card", async ({ request }: { request: Request }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const { action, cardId, columnId } = await readJson<{ action?: string; cardId?: string; columnId?: string }>(request);
  if (!cardId) return jsonError("Card ID is required", 400);

  const { card, role } = requireCardAccess(user, cardId);
  if (!card.archivedAt) return jsonError("Card is not archived", 400);

  if (action === "restore") {
    const column = columnId
      ? db.select().from(columns).where(and(eq(columns.id, columnId), eq(columns.boardId, card.boardId))).get()
      : db.select().from(columns).where(eq(columns.boardId, card.boardId)).orderBy(asc(columns.position)).get();

    if (!column) return jsonError(columnId ? "Column not found" : "No columns found to restore card to", columnId ? 404 : 400);

    const now = new Date();
    db.transaction((tx) => {
      tx.update(cards).set({ archivedAt: null, updatedAt: now }).where(eq(cards.id, cardId)).run();
      const fresh = tx.select().from(columns).where(eq(columns.id, column.id)).get()!;
      const ids = JSON.parse(fresh.cardIds) as string[];
      if (!ids.includes(cardId)) ids.push(cardId);
      tx.update(columns).set({ cardIds: JSON.stringify(ids), updatedAt: now }).where(eq(columns.id, column.id)).run();
    });

    logAudit({
      actor: user,
      action: "card.restored",
      entityType: "card",
      entityId: cardId,
      boardId: card.boardId,
      summary: `Restored "${card.title}" to ${column.title}`,
      request,
    });

    return json({ success: true, columnId: column.id });
  }

  if (action === "delete") {
    if (role !== "owner") return jsonError("Only the board owner can permanently delete cards", 403);

    db.transaction((tx) => {
      tx.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();
      tx.delete(cards).where(eq(cards.id, cardId)).run(); // comments cascade
    });

    logAudit({
      actor: user,
      action: "card.deleted",
      entityType: "card",
      entityId: cardId,
      boardId: card.boardId,
      summary: `Permanently deleted "${card.title}"`,
      request,
    });

    return json({ success: true });
  }

  return jsonError("Invalid action. Use 'restore' or 'delete'", 400);
});
