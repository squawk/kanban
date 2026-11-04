import { db } from "~/lib/db";
import { cards, columns, cardTags, users } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { api, isBoardParticipant, requireColumnAccess, requireUser } from "~/lib/access.server";
import { filterValidTagIds, serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";
import { INPUT_LIMITS } from "~/lib/security";
import { logAudit } from "~/lib/audit.server";
import { notifyCardAssigned } from "~/lib/notifications.server";

const PRIORITIES = ["low", "medium", "high"];

// POST /api/cards - Create a new card
export const action = api("create card", async ({ request }: { request: Request }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const { title, notes, columnId, dueDate, priority, tagIds, assigneeId } = await readJson<{
    title?: string;
    notes?: string;
    columnId?: string;
    dueDate?: string | null;
    priority?: string;
    tagIds?: unknown;
    assigneeId?: string | null;
  }>(request);

  if (!title || !columnId) return jsonError("Title and columnId are required", 400);
  if (title.length > INPUT_LIMITS.cardTitle) return jsonError(`Title must be ${INPUT_LIMITS.cardTitle} characters or less`, 400);
  if (notes && notes.length > INPUT_LIMITS.cardNotes) return jsonError(`Notes must be ${INPUT_LIMITS.cardNotes} characters or less`, 400);

  // The column determines the board; access is checked against it
  const { column } = requireColumnAccess(user, columnId);
  const boardId = column.boardId;

  if (assigneeId && !isBoardParticipant(boardId, assigneeId)) {
    return jsonError("Assignee must be a member of this board", 400);
  }

  const cardId = nanoid();
  const now = new Date();
  const validTagIds = filterValidTagIds(tagIds);

  db.transaction((tx) => {
    tx.insert(cards)
      .values({
        id: cardId,
        title,
        notes: notes || "",
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority && PRIORITIES.includes(priority) ? priority : "medium",
        boardId,
        assigneeId: assigneeId || null,
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const fresh = tx.select().from(columns).where(eq(columns.id, columnId)).get()!;
    const cardIdsList = JSON.parse(fresh.cardIds);
    cardIdsList.push(cardId);
    tx.update(columns).set({ cardIds: JSON.stringify(cardIdsList), updatedAt: now }).where(eq(columns.id, columnId)).run();

    for (const tagId of validTagIds) {
      tx.insert(cardTags).values({ cardId, tagId, createdAt: now }).run();
    }
  });

  const newCard = db.select().from(cards).where(eq(cards.id, cardId)).get()!;

  logAudit({
    actor: user,
    action: "card.created",
    entityType: "card",
    entityId: cardId,
    boardId,
    summary: `Created "${title}" in ${column.title}`,
    metadata: { columnId, assigneeId: assigneeId || null, priority: newCard.priority },
    request,
  });

  if (assigneeId) {
    const assigneeName = db.select({ name: users.name }).from(users).where(eq(users.id, assigneeId)).get()?.name;
    logAudit({
      actor: user,
      action: "card.assigned",
      entityType: "card",
      entityId: cardId,
      boardId,
      summary: `Assigned "${title}" to ${assigneeName ?? "a board member"}`,
      metadata: { from: null, to: assigneeId },
      request,
    });
    notifyCardAssigned(newCard, assigneeId, user);
  }

  return json(serializeCards([newCard])[0], 201);
});
