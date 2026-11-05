import { db } from "~/lib/db";
import { columns, cards, cardTags, comments } from "~/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { api, requireColumnAccess, requireUser } from "~/lib/access.server";
import { json, jsonError } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";

// DELETE /api/columns/:columnId - Delete a column (board owner only)
export const action = api(
  "delete column",
  async ({ request, params }: { request: Request; params: { columnId: string } }) => {
    if (request.method !== "DELETE") return jsonError("Method not allowed", 405);
    if (!params.columnId) return jsonError("Column ID is required", 400);

    const user = await requireUser(request);
    const { column, role } = await requireColumnAccess(user, params.columnId);
    if (role !== "owner") return jsonError("Only the board owner can delete columns", 403);

    const cardIdsList = JSON.parse(column.cardIds) as string[];
    const deletedTitles = cardIdsList.length
      ? (await db.select({ title: cards.title, isPrivate: cards.isPrivate }).from(cards).where(inArray(cards.id, cardIdsList))).map(
          (c) => (c.isPrivate ? "(private card)" : c.title)
        )
      : [];

    await db.transaction(async (tx) => {
      if (cardIdsList.length > 0) {
        // BOLT OPTIMIZATION: Use batch deletion with inArray to avoid N individual database calls
        await tx.delete(cardTags).where(inArray(cardTags.cardId, cardIdsList));
        await tx.delete(comments).where(inArray(comments.cardId, cardIdsList));
        await tx.delete(cards).where(inArray(cards.id, cardIdsList));
      }
      await tx.delete(columns).where(eq(columns.id, column.id));
    });

    await logAudit({
      actor: user,
      action: "column.deleted",
      entityType: "column",
      entityId: column.id,
      boardId: column.boardId,
      summary: `Deleted column "${column.title}"${deletedTitles.length ? ` and ${deletedTitles.length} card(s)` : ""}`,
      metadata: { deletedCards: deletedTitles },
      request,
    });

    return json({ success: true });
  }
);
