import { and, eq } from "drizzle-orm";
import { db, firstRow } from "~/lib/db";
import { columns } from "~/lib/db/schema";
import { api, requireCardAccess, requireUser } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";
import { notifyCardMoved } from "~/lib/notifications.server";
import { columnKey } from "~/lib/linked-cards";

/**
 * POST /api/cards/:cardId/move  { columnTitle }
 * Move a card to the column with that name on the card's own board. Used when a card
 * assigned to you on someone else's board is dragged on your board.
 */
export const action = api("move card", async ({ request, params }: { request: Request; params: { cardId?: string } }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);
  const user = await requireUser(request);
  const { card } = await requireCardAccess(user, params.cardId ?? "");
  if (card.archivedAt) return jsonError("This card is archived", 409);

  const { columnTitle } = await readJson<{ columnTitle?: unknown }>(request);
  if (typeof columnTitle !== "string" || !columnTitle.trim()) return jsonError("columnTitle is required", 400);

  const result = await db.transaction(async (tx) => {
    const boardColumns = await tx.select().from(columns).where(eq(columns.boardId, card.boardId)).for("update");
    const target = boardColumns.find((c) => columnKey(c.title) === columnKey(columnTitle));
    if (!target) return { missing: true as const };
    const source = boardColumns.find((c) => (JSON.parse(c.cardIds) as string[]).includes(card.id));
    if (source?.id === target.id) return { from: source, to: target, moved: false };

    const now = new Date();
    if (source) {
      const ids = (JSON.parse(source.cardIds) as string[]).filter((id) => id !== card.id);
      await tx.update(columns).set({ cardIds: JSON.stringify(ids), updatedAt: now }).where(and(eq(columns.id, source.id), eq(columns.boardId, card.boardId)));
    }
    const fresh = (await tx.select().from(columns).where(eq(columns.id, target.id)).limit(1).then(firstRow))!;
    const ids = [...(JSON.parse(fresh.cardIds) as string[]).filter((id) => id !== card.id), card.id];
    await tx.update(columns).set({ cardIds: JSON.stringify(ids), updatedAt: now }).where(and(eq(columns.id, target.id), eq(columns.boardId, card.boardId)));
    return { from: source, to: target, moved: true };
  });

  if ("missing" in result) {
    return jsonError(`That board has no "${columnTitle.trim()}" column, so the card stayed where it was`, 409);
  }
  if (result.moved) {
    const from = result.from?.title ?? "?";
    const to = result.to.title;
    await logAudit({
      actor: user,
      action: "card.moved",
      entityType: "card",
      entityId: card.id,
      boardId: card.boardId,
      summary: `Moved "${card.title}" from ${from} to ${to}`,
      metadata: { fromColumnId: result.from?.id ?? null, toColumnId: result.to.id, from, to },
      request,
    });
    notifyCardMoved(card, from, to, user);
  }
  return json({ success: true, column: { id: result.to.id, title: result.to.title } });
});
