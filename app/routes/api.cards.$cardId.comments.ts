import { db } from "~/lib/db";
import { cards, comments } from "~/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getSession, getUserBoard } from "~/lib/auth";
import { nanoid } from "nanoid";

// GET /api/cards/:cardId/comments - Get all comments for a card
export async function loader({ request, params }: { request: Request; params: { cardId: string } }) {
  try {
    const session = await getSession(request);
    if (!session.userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // SECURITY FIX: Verify card belongs to user's board before returning comments
    const board = getUserBoard(session.userId);
    if (!board) {
      return new Response(
        JSON.stringify({ error: "Board not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { cardId } = params;

    // Verify card exists and belongs to user's board
    const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!card || card.boardId !== board.id) {
      return new Response(
        JSON.stringify({ error: "Card not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const cardComments = db
      .select()
      .from(comments)
      .where(eq(comments.cardId, cardId))
      .orderBy(asc(comments.createdAt))
      .all();

    return new Response(JSON.stringify(cardComments), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch comments" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST /api/cards/:cardId/comments - Create a new comment
export async function action({ request, params }: { request: Request; params: { cardId: string } }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const session = await getSession(request);
    if (!session.userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const board = getUserBoard(session.userId);
    if (!board) {
      return new Response(
        JSON.stringify({ error: "Board not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { cardId } = params;
    const { content } = await request.json();

    if (!content || !content.trim()) {
      return new Response(
        JSON.stringify({ error: "Comment content is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify card exists and belongs to user's board
    const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!card || card.boardId !== board.id) {
      return new Response(
        JSON.stringify({ error: "Card not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const commentId = nanoid();
    const now = new Date();

    // Create the comment
    db.insert(comments).values({
      id: commentId,
      content: content.trim(),
      cardId,
      createdAt: now,
      updatedAt: now,
    }).run();

    const newComment = db.select().from(comments).where(eq(comments.id, commentId)).get();

    return new Response(JSON.stringify(newComment), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating comment:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create comment" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
