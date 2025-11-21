import { db } from "~/lib/db";
import { cards, columns, cardTags } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, getUserBoard } from "~/lib/auth";

// PUT /api/cards/:cardId - Update a card
// DELETE /api/cards/:cardId - Delete a card
export async function action({ request, params }: { request: Request; params: { cardId: string } }) {
  const { cardId } = params;

  if (!cardId) {
    return new Response(
      JSON.stringify({ error: "Card ID is required" }),
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

    // Verify card belongs to user's board
    const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!card || card.boardId !== board.id) {
      return new Response(
        JSON.stringify({ error: "Card not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (request.method === "PUT") {
      const { title, notes, generatedPrompt, dueDate, priority, tagIds } = await request.json();

      // Update card
      db.update(cards)
        .set({
          ...(title !== undefined && { title }),
          ...(notes !== undefined && { notes }),
          ...(generatedPrompt !== undefined && { generatedPrompt }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(priority !== undefined && { priority }),
          updatedAt: new Date(),
        })
        .where(eq(cards.id, cardId))
        .run();

      // Update tags if provided
      if (tagIds !== undefined) {
        // Delete existing tags
        db.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();

        // Add new tags
        if (tagIds && tagIds.length > 0) {
          const now = new Date();
          for (const tagId of tagIds) {
            db.insert(cardTags).values({
              cardId,
              tagId,
              createdAt: now,
            }).run();
          }
        }
      }

      const updatedCard = db.select().from(cards).where(eq(cards.id, cardId)).get();

      return new Response(JSON.stringify(updatedCard), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "DELETE") {
      // Remove card from all columns
      const allColumns = db.select().from(columns).where(eq(columns.boardId, board.id)).all();
      for (const column of allColumns) {
        const cardIdsList = JSON.parse(column.cardIds);
        if (cardIdsList.includes(cardId)) {
          const newCardIds = cardIdsList.filter((id: string) => id !== cardId);
          db.update(columns)
            .set({ cardIds: JSON.stringify(newCardIds), updatedAt: new Date() })
            .where(eq(columns.id, column.id))
            .run();
        }
      }

      // Delete card tags
      db.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();

      // Delete the card (comments will cascade)
      db.delete(cards).where(eq(cards.id, cardId)).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    console.error("Error with card operation:", error);
    return new Response(
      JSON.stringify({ error: "Failed to perform card operation" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
