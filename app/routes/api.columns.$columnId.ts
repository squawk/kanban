import { db } from "~/lib/db";
import { columns, cards, cardTags, comments } from "~/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getSession, getUserBoard } from "~/lib/auth";

// DELETE /api/columns/:columnId - Delete a column
export async function action({ request, params }: { request: Request; params: { columnId: string } }) {
  if (request.method !== "DELETE") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { columnId } = params;

  if (!columnId) {
    return new Response(
      JSON.stringify({ error: "Column ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
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

    // Get the column
    const column = db.select().from(columns).where(eq(columns.id, columnId)).get();

    if (!column || column.boardId !== board.id) {
      return new Response(
        JSON.stringify({ error: "Column not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete all cards in this column
    const cardIdsList = JSON.parse(column.cardIds) as string[];

    if (cardIdsList.length > 0) {
      // Delete card tags
      for (const cardId of cardIdsList) {
        db.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();
        db.delete(comments).where(eq(comments.cardId, cardId)).run();
      }
      // Delete cards
      for (const cardId of cardIdsList) {
        db.delete(cards).where(eq(cards.id, cardId)).run();
      }
    }

    // Delete the column
    db.delete(columns).where(eq(columns.id, columnId)).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error deleting column:", error);
    return new Response(
      JSON.stringify({ error: "Failed to delete column" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
