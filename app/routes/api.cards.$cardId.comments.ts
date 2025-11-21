import type { Route } from "./+types/api.cards.$cardId.comments";
import { prisma } from "~/lib/prisma";

// GET /api/cards/:cardId/comments - Get all comments for a card
export async function loader({ params }: Route.LoaderArgs) {
  try {
    const { cardId } = params;

    const comments = await prisma.comment.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
    });

    return new Response(JSON.stringify(comments), {
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
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { cardId } = params;
    const { content } = await request.json();

    if (!content || !content.trim()) {
      return new Response(
        JSON.stringify({ error: "Comment content is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify card exists
    const card = await prisma.card.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      return new Response(
        JSON.stringify({ error: "Card not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        cardId,
      },
    });

    return new Response(JSON.stringify(comment), {
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
