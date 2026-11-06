/**
 * Card creation shared by POST /api/cards and AI quick add, so both apply the same
 * validation, access checks, revision history, audit trail and assignment email.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, firstRow } from "./db";
import { cards, cardTags, columns, users } from "./db/schema";
import { isBoardParticipant, requireColumnAccess, type AuthUser } from "./access.server";
import { filterValidTagIds, serializeCards } from "./board-serialize.server";
import { jsonError } from "./http";
import { INPUT_LIMITS } from "./security";
import { logAudit } from "./audit.server";
import { notifyCardAssigned } from "./notifications.server";
import { recordInitialRevision } from "./card-update.server";
import { cardRef } from "./card-privacy";
import { requireAssignableClient } from "./clients.server";

export const PRIORITIES = ["low", "medium", "high"] as const;

export interface NewCardInput {
  title?: string;
  notes?: string;
  columnId?: string;
  dueDate?: string | null;
  priority?: string;
  tagIds?: unknown;
  assigneeId?: string | null;
  /** Only the creator will see it; can't be combined with an assignee */
  isPrivate?: boolean;
  /** Optional client (must exist and not be archived) */
  clientId?: string | null;
}

/** Create a card; throws a JSON error `Response` on invalid input or missing access. */
export async function createCard(
  user: AuthUser,
  input: NewCardInput,
  request: Request,
  audit: { via?: string } = {},
) {
  const { title, notes, columnId, dueDate, priority, tagIds } = input;
  const isPrivate = input.isPrivate === true;
  const assigneeId = isPrivate ? null : input.assigneeId;
  if (input.clientId !== undefined && input.clientId !== null && typeof input.clientId !== "string") throw jsonError("Invalid clientId", 400);
  const clientId = input.clientId ? (await requireAssignableClient(input.clientId)).id : null;

  if (!title || !columnId) throw jsonError("Title and columnId are required", 400);
  if (title.length > INPUT_LIMITS.cardTitle) throw jsonError(`Title must be ${INPUT_LIMITS.cardTitle} characters or less`, 400);
  if (notes && notes.length > INPUT_LIMITS.cardNotes) throw jsonError(`Notes must be ${INPUT_LIMITS.cardNotes} characters or less`, 400);

  // The column determines the board; access is checked against it
  const { column } = await requireColumnAccess(user, columnId);
  const boardId = column.boardId;

  if (assigneeId && !await isBoardParticipant(boardId, assigneeId)) {
    throw jsonError("Assignee must be a member of this board", 400);
  }

  const cardId = nanoid();
  const now = new Date();
  const validTagIds = await filterValidTagIds(tagIds);

  await db.transaction(async (tx) => {
    await tx.insert(cards)
      .values({
        id: cardId,
        title,
        notes: notes || "",
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority && (PRIORITIES as readonly string[]).includes(priority) ? priority : "medium",
        boardId,
        assigneeId: assigneeId || null,
        createdById: user.id,
        isPrivate,
        clientId,
        createdAt: now,
        updatedAt: now,
      });

    const fresh = (await tx.select().from(columns).where(eq(columns.id, columnId)).for("update").limit(1).then(firstRow))!;
    const cardIdsList = JSON.parse(fresh.cardIds);
    cardIdsList.push(cardId);
    await tx.update(columns).set({ cardIds: JSON.stringify(cardIdsList), updatedAt: now }).where(eq(columns.id, columnId));

    for (const tagId of validTagIds) {
      await tx.insert(cardTags).values({ cardId, tagId, createdAt: now });
    }

    // History starts at creation (version 1)
    const created = (await tx.select().from(cards).where(eq(cards.id, cardId)).then(firstRow))!;
    await recordInitialRevision(tx, created, user);
  });

  const newCard = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1).then(firstRow))!;

  await logAudit({
    actor: user,
    action: "card.created",
    entityType: "card",
    entityId: cardId,
    boardId,
    summary: `Created ${cardRef(newCard)} in ${column.title}${audit.via ? ` (${audit.via})` : ""}`,
    metadata: {
      columnId,
      assigneeId: assigneeId || null,
      priority: newCard.priority,
      ...(isPrivate && { private: true }),
      ...(clientId && { clientId }),
      ...(audit.via && { via: audit.via }),
    },
    request,
  });

  if (assigneeId) {
    const assigneeName = (await db.select({ name: users.name }).from(users).where(eq(users.id, assigneeId)).limit(1).then(firstRow))?.name;
    await logAudit({
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

  return { card: (await serializeCards([newCard]))[0], column };
}
