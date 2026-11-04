import { db } from "~/lib/db";
import { cards, columns } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { api, isBoardParticipant, requireCardAccess, requireUser } from "~/lib/access.server";
import { filterValidTagIds, serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";
import { INPUT_LIMITS } from "~/lib/security";
import { assertNotLockedByOther } from "~/lib/card-locks.server";
import { updateCard } from "~/lib/card-update.server";
import { logAudit } from "~/lib/audit.server";

const PRIORITIES = ["low", "medium", "high"];


// PUT /api/cards/:cardId - Update a card
// DELETE /api/cards/:cardId - Archive a card
export const action = api(
  "perform card operation",
  async ({ request, params }: { request: Request; params: { cardId: string } }) => {
    const { cardId } = params;
    if (!cardId) return jsonError("Card ID is required", 400);

    const user = await requireUser(request);
    const { card } = await requireCardAccess(user, cardId);

    if (request.method === "PUT") {
      const body = await readJson<{
        title?: string;
        notes?: string;
        generatedPrompt?: string;
        dueDate?: string | null;
        priority?: string;
        tagIds?: unknown;
        assigneeId?: string | null;
        expectedVersion?: number;
      }>(request);
      const { title, notes, generatedPrompt, dueDate, priority, tagIds, assigneeId } = body;

      // Only the lock holder may edit. Saving an AI-generated prompt doesn't touch the
      // fields being edited, so it's allowed while someone else has the card open.
      const onlyPrompt = Object.keys(body).every((k) => k === "generatedPrompt" || k === "expectedVersion");
      if (!onlyPrompt) await assertNotLockedByOther(card.id, user.id);

      if (title !== undefined && (!title || title.length > INPUT_LIMITS.cardTitle)) {
        return jsonError(`Title is required and must be ${INPUT_LIMITS.cardTitle} characters or less`, 400);
      }
      if (notes !== undefined && notes.length > INPUT_LIMITS.cardNotes) {
        return jsonError(`Notes must be ${INPUT_LIMITS.cardNotes} characters or less`, 400);
      }
      if (priority !== undefined && !PRIORITIES.includes(priority)) return jsonError("Invalid priority", 400);
      if (assigneeId && !await isBoardParticipant(card.boardId, assigneeId)) {
        return jsonError("Assignee must be a member of this board", 400);
      }

      const { card: updatedCard, revision } = await updateCard({
        user,
        card,
        request,
        // The version the editor loaded: refuse to overwrite someone else's newer save
        expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
        changes: {
          ...(title !== undefined && { title }),
          ...(notes !== undefined && { notes }),
          ...(generatedPrompt !== undefined && { generatedPrompt }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(priority !== undefined && { priority }),
          ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
          ...(tagIds !== undefined && { tagIds: await filterValidTagIds(tagIds) }),
        },
      });

      return json({ ...(await serializeCards([updatedCard]))[0], revision });
    }

    if (request.method === "DELETE") {
      await assertNotLockedByOther(card.id, user.id);
      // Archive the card instead of deleting: remove from all columns of its board
      const now = new Date();
      await db.transaction(async (tx) => {
        const allColumns = await tx.select().from(columns).where(eq(columns.boardId, card.boardId)).for("update");
        for (const column of allColumns) {
          const cardIdsList = JSON.parse(column.cardIds) as string[];
          if (cardIdsList.includes(cardId)) {
            await tx.update(columns)
              .set({ cardIds: JSON.stringify(cardIdsList.filter((id) => id !== cardId)), updatedAt: now })
              .where(eq(columns.id, column.id));
          }
        }
        await tx.update(cards).set({ archivedAt: now, updatedAt: now }).where(eq(cards.id, cardId));
      });

      await logAudit({
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
