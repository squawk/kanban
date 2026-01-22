import { db } from "~/lib/db";
import { cards, columns, cardTags, tags } from "~/lib/db/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { getSession, getUserBoard } from "~/lib/auth";

// GET /api/archived-cards - Get all archived cards for the user's board
export async function loader({ request }: { request: Request }) {
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

    // Get archived cards for this board
    const archivedCards = db
      .select()
      .from(cards)
      .where(and(eq(cards.boardId, board.id), isNotNull(cards.archivedAt)))
      .orderBy(desc(cards.archivedAt))
      .all();

    // Get all tags for enriching card data
    const allTags = db.select().from(tags).all();
    const tagMap = new Map(allTags.map((t) => [t.id, t]));

    // Get card tags for archived cards
    const cardIds = archivedCards.map((c) => c.id);
    const allCardTags = cardIds.length > 0
      ? db.select().from(cardTags).all().filter((ct) => cardIds.includes(ct.cardId))
      : [];

    // Transform cards with tags
    const transformedCards = archivedCards.map((card) => {
      const cardTagRelations = allCardTags.filter((ct) => ct.cardId === card.id);
      const cardTagList = cardTagRelations
        .map((ct) => tagMap.get(ct.tagId))
        .filter((t): t is NonNullable<typeof t> => t !== undefined);

      return {
        id: card.id,
        title: card.title,
        notes: card.notes,
        priority: card.priority,
        dueDate: card.dueDate ? card.dueDate.toISOString() : undefined,
        tags: cardTagList.map((tag) => ({
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

    return new Response(JSON.stringify(transformedCards), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching archived cards:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch archived cards" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST /api/archived-cards - Restore or permanently delete an archived card
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

    const { action, cardId, columnId } = await request.json();

    if (!cardId) {
      return new Response(
        JSON.stringify({ error: "Card ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify card belongs to user's board and is archived
    const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!card || card.boardId !== board.id) {
      return new Response(
        JSON.stringify({ error: "Card not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!card.archivedAt) {
      return new Response(
        JSON.stringify({ error: "Card is not archived" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (action === "restore") {
      // Restore card - clear archivedAt and add to specified column (or first column)
      let targetColumnId = columnId;

      if (!targetColumnId) {
        // Get first column if no column specified
        const firstColumn = db
          .select()
          .from(columns)
          .where(eq(columns.boardId, board.id))
          .orderBy(columns.position)
          .get();

        if (!firstColumn) {
          return new Response(
            JSON.stringify({ error: "No columns found to restore card to" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        targetColumnId = firstColumn.id;
      }

      // Verify column belongs to user's board
      const column = db
        .select()
        .from(columns)
        .where(and(eq(columns.id, targetColumnId), eq(columns.boardId, board.id)))
        .get();

      if (!column) {
        return new Response(
          JSON.stringify({ error: "Column not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Clear archivedAt
      db.update(cards)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(cards.id, cardId))
        .run();

      // Add card to column
      const cardIdsList = JSON.parse(column.cardIds);
      cardIdsList.push(cardId);
      db.update(columns)
        .set({ cardIds: JSON.stringify(cardIdsList), updatedAt: new Date() })
        .where(eq(columns.id, targetColumnId))
        .run();

      return new Response(JSON.stringify({ success: true, columnId: targetColumnId }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // Permanently delete the card
      // Delete card tags
      db.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();

      // Delete the card (comments will cascade)
      db.delete(cards).where(eq(cards.id, cardId)).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'restore' or 'delete'" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error with archived card operation:", error);
    return new Response(
      JSON.stringify({ error: "Failed to perform operation" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
