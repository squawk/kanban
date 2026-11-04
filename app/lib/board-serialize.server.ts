import { inArray } from "drizzle-orm";
import { db } from "./db";
import { cardTags, comments, tags, users, type Card } from "./db/schema";

type UserLite = { id: string; name: string; email: string };

function loadUsers(ids: (string | null | undefined)[]): Map<string, UserLite> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, unique))
    .all();
  return new Map(rows.map((u) => [u.id, u]));
}

/** Serialize cards with tags, comments (with authors) and assignee for the client. */
export function serializeCards(cardRows: Card[], opts: { includeComments?: boolean } = {}) {
  const includeComments = opts.includeComments ?? true;
  const cardIds = cardRows.map((c) => c.id);

  const allComments =
    includeComments && cardIds.length > 0 ? db.select().from(comments).where(inArray(comments.cardId, cardIds)).all() : [];
  const allCardTags = cardIds.length > 0 ? db.select().from(cardTags).where(inArray(cardTags.cardId, cardIds)).all() : [];
  const tagIds = [...new Set(allCardTags.map((ct) => ct.tagId))];
  const tagMap = new Map(
    (tagIds.length ? db.select().from(tags).where(inArray(tags.id, tagIds)).all() : []).map((t) => [t.id, t])
  );
  const userMap = loadUsers([
    ...cardRows.map((c) => c.assigneeId),
    ...cardRows.map((c) => c.createdById),
    ...allComments.map((c) => c.authorId),
  ]);

  const commentsByCard = new Map<string, typeof allComments>();
  for (const c of allComments) {
    const list = commentsByCard.get(c.cardId) ?? [];
    list.push(c);
    commentsByCard.set(c.cardId, list);
  }
  const tagsByCard = new Map<string, string[]>();
  for (const ct of allCardTags) {
    const list = tagsByCard.get(ct.cardId) ?? [];
    list.push(ct.tagId);
    tagsByCard.set(ct.cardId, list);
  }

  return cardRows.map((card) => {
    const assignee = card.assigneeId ? userMap.get(card.assigneeId) ?? null : null;
    const createdBy = card.createdById ? userMap.get(card.createdById) ?? null : null;
    return {
      id: card.id,
      boardId: card.boardId,
      title: card.title,
      notes: card.notes,
      generatedPrompt: card.generatedPrompt || undefined,
      dueDate: card.dueDate ? card.dueDate.toISOString() : undefined,
      priority: card.priority,
      assigneeId: card.assigneeId ?? null,
      assignee,
      createdBy,
      comments: (commentsByCard.get(card.id) ?? [])
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((comment) => ({
          id: comment.id,
          content: comment.content,
          cardId: comment.cardId,
          author: comment.authorId ? userMap.get(comment.authorId) ?? null : null,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
        })),
      tags: (tagsByCard.get(card.id) ?? [])
        .map((id) => tagMap.get(id))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          createdAt: tag.createdAt.toISOString(),
          updatedAt: tag.updatedAt.toISOString(),
        })),
      archivedAt: card.archivedAt ? card.archivedAt.toISOString() : undefined,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
    };
  });
}

/** Return only tag IDs that exist (prevents FK errors / junk rows). */
export function filterValidTagIds(tagIds: unknown): string[] {
  if (!Array.isArray(tagIds)) return [];
  const ids = [...new Set(tagIds.filter((t): t is string => typeof t === "string"))];
  if (ids.length === 0) return [];
  return db.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids)).all().map((t) => t.id);
}
