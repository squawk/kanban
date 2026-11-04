import { db } from "~/lib/db";
import { comments, users } from "~/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { api, requireCardAccess, requireUser } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { INPUT_LIMITS } from "~/lib/security";
import { logAudit } from "~/lib/audit.server";
import { notifyCardCommented } from "~/lib/notifications.server";

function serializeComment(c: typeof comments.$inferSelect, author: { id: string; name: string; email: string } | null) {
  return {
    id: c.id,
    content: c.content,
    cardId: c.cardId,
    author,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /api/cards/:cardId/comments - Get all comments for a card
export const loader = api(
  "fetch comments",
  async ({ request, params }: { request: Request; params: { cardId: string } }) => {
    const user = await requireUser(request);
    requireCardAccess(user, params.cardId);

    const rows = db
      .select({ comment: comments, author: { id: users.id, name: users.name, email: users.email } })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.cardId, params.cardId))
      .orderBy(asc(comments.createdAt))
      .all();

    return json(rows.map((r) => serializeComment(r.comment, r.author?.id ? r.author : null)));
  }
);

// POST /api/cards/:cardId/comments - Create a new comment
export const action = api(
  "create comment",
  async ({ request, params }: { request: Request; params: { cardId: string } }) => {
    if (request.method !== "POST") return jsonError("Method not allowed", 405);

    const user = await requireUser(request);
    const { card } = requireCardAccess(user, params.cardId);
    const { content } = await readJson<{ content?: string }>(request);

    if (!content || typeof content !== "string" || !content.trim()) {
      return jsonError("Comment content is required", 400);
    }
    if (content.length > INPUT_LIMITS.commentContent) {
      return jsonError(`Comment must be ${INPUT_LIMITS.commentContent} characters or less`, 400);
    }

    const commentId = nanoid();
    const now = new Date();
    const trimmed = content.trim();

    db.insert(comments)
      .values({ id: commentId, content: trimmed, cardId: card.id, authorId: user.id, createdAt: now, updatedAt: now })
      .run();

    const newComment = db.select().from(comments).where(eq(comments.id, commentId)).get()!;

    logAudit({
      actor: user,
      action: "comment.created",
      entityType: "card",
      entityId: card.id,
      boardId: card.boardId,
      summary: `Commented on "${card.title}"`,
      metadata: { commentId, preview: trimmed.slice(0, 140) },
      request,
    });
    notifyCardCommented(card, trimmed, user);

    return json(serializeComment(newComment, { id: user.id, name: user.name, email: user.email }), 201);
  }
);
