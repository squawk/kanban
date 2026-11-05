import { db, firstRow } from "~/lib/db";
import { cards, columns, cardTags } from "~/lib/db/schema";
import { eq, and, isNotNull, desc, asc } from "drizzle-orm";
import { api, boardIdFromRequest, requireCardAccess, requireUser, resolveBoard, visibleCardsFor } from "~/lib/access.server";
import { cardRef } from "~/lib/card-privacy";
import { serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";

// GET /api/archived-cards?boardId= - Archived cards for a board
export const loader = api("fetch archived cards", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  const { board } = await resolveBoard(user, boardIdFromRequest(request));

  const archivedCards = await db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, board.id), isNotNull(cards.archivedAt), visibleCardsFor(user.id)))
    .orderBy(desc(cards.archivedAt));

  return json(await serializeCards(archivedCards, { includeComments: false }));
});

// POST /api/archived-cards - Restore or permanently delete an archived card
export const action = api("update archived card", async ({ request }: { request: Request }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const { action, cardId, columnId } = await readJson<{ action?: string; cardId?: string; columnId?: string }>(request);
  if (!cardId) return jsonError("Card ID is required", 400);

  const { card, role } = await requireCardAccess(user, cardId);
  if (!card.archivedAt) return jsonError("Card is not archived", 400);

  if (action === "restore") {
    const column = columnId
      ? await db.select().from(columns).where(and(eq(columns.id, columnId), eq(columns.boardId, card.boardId))).limit(1).then(firstRow)
      : await db.select().from(columns).where(eq(columns.boardId, card.boardId)).orderBy(asc(columns.position)).limit(1).then(firstRow);

    if (!column) return jsonError(columnId ? "Column not found" : "No columns found to restore card to", columnId ? 404 : 400);

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(cards).set({ archivedAt: null, updatedAt: now }).where(eq(cards.id, cardId));
      const fresh = (await tx.select().from(columns).where(eq(columns.id, column.id)).for("update").limit(1).then(firstRow))!;
      const ids = JSON.parse(fresh.cardIds) as string[];
      if (!ids.includes(cardId)) ids.push(cardId);
      await tx.update(columns).set({ cardIds: JSON.stringify(ids), updatedAt: now }).where(eq(columns.id, column.id));
    });

    await logAudit({
      actor: user,
      action: "card.restored",
      entityType: "card",
      entityId: cardId,
      boardId: card.boardId,
      summary: `Restored ${cardRef(card)} to ${column.title}`,
      request,
    });

    return json({ success: true, columnId: column.id });
  }

  if (action === "delete") {
    if (role !== "owner") return jsonError("Only the board owner can permanently delete cards", 403);

    await db.transaction(async (tx) => {
      await tx.delete(cardTags).where(eq(cardTags.cardId, cardId));
      await tx.delete(cards).where(eq(cards.id, cardId)); // comments cascade
    });

    await logAudit({
      actor: user,
      action: "card.deleted",
      entityType: "card",
      entityId: cardId,
      boardId: card.boardId,
      summary: `Permanently deleted ${cardRef(card)}`,
      request,
    });

    return json({ success: true });
  }

  return jsonError("Invalid action. Use 'restore' or 'delete'", 400);
});
