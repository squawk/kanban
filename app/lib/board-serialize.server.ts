import { inArray, max } from "drizzle-orm";
import { db } from "./db";
import { cardRevisions, cardTags, clients, comments, tags, users, type Card } from "./db/schema";

type UserLite = { id: string; name: string; email: string };

async function loadUsers(ids: (string | null | undefined)[]): Promise<Map<string, UserLite>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((u) => [u.id, u]));
}

/** Serialize cards with tags, comments (with authors) and assignee for the client. */
export async function serializeCards(cardRows: Card[], opts: { includeComments?: boolean } = {}) {
  const includeComments = opts.includeComments ?? true;
  const cardIds = cardRows.map((c) => c.id);

  const allComments =
    includeComments && cardIds.length > 0 ? await db.select().from(comments).where(inArray(comments.cardId, cardIds)) : [];
  const allCardTags = cardIds.length > 0 ? await db.select().from(cardTags).where(inArray(cardTags.cardId, cardIds)) : [];
  const tagIds = [...new Set(allCardTags.map((ct) => ct.tagId))];
  const tagMap = new Map(
    (tagIds.length ? await db.select().from(tags).where(inArray(tags.id, tagIds)) : []).map((t) => [t.id, t])
  );
  const userMap = await loadUsers([
    ...cardRows.map((c) => c.assigneeId),
    ...cardRows.map((c) => c.createdById),
    ...allComments.map((c) => c.authorId),
  ]);

  const clientIds = [...new Set(cardRows.map((c) => c.clientId).filter((id): id is string => !!id))];
  const clientMap = new Map(
    (clientIds.length
      ? await db.select({ id: clients.id, name: clients.name, color: clients.color, archivedAt: clients.archivedAt }).from(clients).where(inArray(clients.id, clientIds))
      : []
    ).map((c) => [c.id, { id: c.id, name: c.name, color: c.color, archived: !!c.archivedAt }])
  );

  // Latest history version per card: editors send it back so stale saves are refused
  const versionRows = cardIds.length
    ? await db
        .select({ cardId: cardRevisions.cardId, v: max(cardRevisions.version) })
        .from(cardRevisions)
        .where(inArray(cardRevisions.cardId, cardIds))
        .groupBy(cardRevisions.cardId)
    : [];
  const versionOf = new Map(versionRows.map((r) => [r.cardId, r.v ?? 0]));

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
      isPrivate: card.isPrivate,
      clientId: card.clientId ?? null,
      client: card.clientId ? clientMap.get(card.clientId) ?? null : null,
      version: versionOf.get(card.id) ?? 0,
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
export async function filterValidTagIds(tagIds: unknown): Promise<string[]> {
  if (!Array.isArray(tagIds)) return [];
  const ids = [...new Set(tagIds.filter((t): t is string => typeof t === "string"))];
  if (ids.length === 0) return [];
  return ((await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids)))).map((t) => t.id);
}
