import { db } from "~/lib/db";
import { cards, columns, cardTags, users } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { api, isBoardParticipant, requireCardAccess, requireUser } from "~/lib/access.server";
import { filterValidTagIds, serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";
import { INPUT_LIMITS } from "~/lib/security";
import { diffCard } from "~/lib/card-diff";
import { logAudit } from "~/lib/audit.server";
import { notifyCardAssigned } from "~/lib/notifications.server";

const PRIORITIES = ["low", "medium", "high"];

function userName(id: string | null): string {
  if (!id) return "nobody";
  return db.select({ name: users.name }).from(users).where(eq(users.id, id)).get()?.name ?? "unknown user";
}

// PUT /api/cards/:cardId - Update a card
// DELETE /api/cards/:cardId - Archive a card
export const action = api(
  "perform card operation",
  async ({ request, params }: { request: Request; params: { cardId: string } }) => {
    const { cardId } = params;
    if (!cardId) return jsonError("Card ID is required", 400);

    const user = await requireUser(request);
    const { card } = requireCardAccess(user, cardId);

    if (request.method === "PUT") {
      const body = await readJson<{
        title?: string;
        notes?: string;
        generatedPrompt?: string;
        dueDate?: string | null;
        priority?: string;
        tagIds?: unknown;
        assigneeId?: string | null;
      }>(request);
      const { title, notes, generatedPrompt, dueDate, priority, tagIds, assigneeId } = body;

      if (title !== undefined && (!title || title.length > INPUT_LIMITS.cardTitle)) {
        return jsonError(`Title is required and must be ${INPUT_LIMITS.cardTitle} characters or less`, 400);
      }
      if (notes !== undefined && notes.length > INPUT_LIMITS.cardNotes) {
        return jsonError(`Notes must be ${INPUT_LIMITS.cardNotes} characters or less`, 400);
      }
      if (priority !== undefined && !PRIORITIES.includes(priority)) return jsonError("Invalid priority", 400);
      if (assigneeId && !isBoardParticipant(card.boardId, assigneeId)) {
        return jsonError("Assignee must be a member of this board", 400);
      }

      const beforeTagIds = db.select().from(cardTags).where(eq(cardTags.cardId, cardId)).all().map((t) => t.tagId);
      const nextTagIds = tagIds !== undefined ? filterValidTagIds(tagIds) : beforeTagIds;
      const now = new Date();

      db.transaction((tx) => {
        tx.update(cards)
          .set({
            ...(title !== undefined && { title }),
            ...(notes !== undefined && { notes }),
            ...(generatedPrompt !== undefined && { generatedPrompt }),
            ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
            ...(priority !== undefined && { priority }),
            ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
            updatedAt: now,
          })
          .where(eq(cards.id, cardId))
          .run();

        if (tagIds !== undefined) {
          tx.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();
          for (const tagId of nextTagIds) {
            tx.insert(cardTags).values({ cardId, tagId, createdAt: now }).run();
          }
        }
      });

      const updatedCard = db.select().from(cards).where(eq(cards.id, cardId)).get()!;

      // Audit the field-level changes
      const changes = diffCard(
        { ...card, tagIds: beforeTagIds },
        { ...updatedCard, tagIds: nextTagIds }
      );
      const nonAssignChanges = changes.filter((c) => c.field !== "assigneeId");
      if (nonAssignChanges.length) {
        logAudit({
          actor: user,
          action: "card.updated",
          entityType: "card",
          entityId: cardId,
          boardId: card.boardId,
          summary: `Updated ${nonAssignChanges.map((c) => c.field).join(", ")} on "${updatedCard.title}"`,
          metadata: { changes: nonAssignChanges },
          request,
        });
      }

      const prevAssignee = card.assigneeId ?? null;
      const nextAssignee = updatedCard.assigneeId ?? null;
      if (prevAssignee !== nextAssignee) {
        logAudit({
          actor: user,
          action: nextAssignee ? "card.assigned" : "card.unassigned",
          entityType: "card",
          entityId: cardId,
          boardId: card.boardId,
          summary: nextAssignee
            ? `Assigned "${updatedCard.title}" to ${userName(nextAssignee)}`
            : `Unassigned "${updatedCard.title}" (was ${userName(prevAssignee)})`,
          metadata: { from: prevAssignee, to: nextAssignee },
          request,
        });
        if (nextAssignee) notifyCardAssigned(updatedCard, nextAssignee, user);
      }

      return json(serializeCards([updatedCard])[0]);
    }

    if (request.method === "DELETE") {
      // Archive the card instead of deleting: remove from all columns of its board
      const now = new Date();
      db.transaction((tx) => {
        const allColumns = tx.select().from(columns).where(eq(columns.boardId, card.boardId)).all();
        for (const column of allColumns) {
          const cardIdsList = JSON.parse(column.cardIds) as string[];
          if (cardIdsList.includes(cardId)) {
            tx.update(columns)
              .set({ cardIds: JSON.stringify(cardIdsList.filter((id) => id !== cardId)), updatedAt: now })
              .where(eq(columns.id, column.id))
              .run();
          }
        }
        tx.update(cards).set({ archivedAt: now, updatedAt: now }).where(eq(cards.id, cardId)).run();
      });

      logAudit({
        actor: user,
        action: "card.archived",
        entityType: "card",
        entityId: cardId,
        boardId: card.boardId,
        summary: `Archived "${card.title}"`,
        request,
      });

      return json({ success: true });
    }

    return jsonError("Method not allowed", 405);
  }
);
