import { db } from "~/lib/db";
import { cards, columns, cardTags } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, getUserBoard } from "~/lib/auth";
import { nanoid } from "nanoid";

// POST /api/cards - Create a new card
export async function action({ request }: { request: Request }) {
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

    const { title, notes, columnId, dueDate, priority, tagIds } = await request.json();

    if (!title || !columnId) {
      return new Response(
        JSON.stringify({ error: "Title and columnId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const cardId = nanoid();
    const now = new Date();

    // Create the card
    db.insert(cards).values({
      id: cardId,
      title,
      notes: notes || "",
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || "medium",
      boardId: board.id,
      createdAt: now,
      updatedAt: now,
    }).run();

    // Add card to column
    const column = db.select().from(columns).where(eq(columns.id, columnId)).get();
    if (column) {
      const cardIdsList = JSON.parse(column.cardIds);
      cardIdsList.push(cardId);
      db.update(columns)
        .set({ cardIds: JSON.stringify(cardIdsList), updatedAt: now })
        .where(eq(columns.id, columnId))
        .run();
    }

    // Add tags if provided
    if (tagIds && tagIds.length > 0) {
      for (const tagId of tagIds) {
        db.insert(cardTags).values({
          cardId,
          tagId,
          createdAt: now,
        }).run();
      }
    }

    const newCard = db.select().from(cards).where(eq(cards.id, cardId)).get();

    return new Response(JSON.stringify(newCard), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating card:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create card" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
