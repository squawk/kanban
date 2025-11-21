import { db } from "~/lib/db";
import { boards, columns, cards, comments, cardTags, tags } from "~/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getSession, getUserBoard } from "~/lib/auth";

// GET /api/board - Get the kanban board with all columns and cards
export async function loader({ request }: { request: Request }) {
  try {
    const session = await getSession(request);

    if (!session.userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user's board
    const board = getUserBoard(session.userId);

    if (!board) {
      return new Response(
        JSON.stringify({ error: "Board not found. Please contact support." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get columns for this board
    const boardColumns = db
      .select()
      .from(columns)
      .where(eq(columns.boardId, board.id))
      .orderBy(asc(columns.position))
      .all();

    // Get cards for this board
    const boardCards = db
      .select()
      .from(cards)
      .where(eq(cards.boardId, board.id))
      .all();

    // Get comments for all cards
    const cardIds = boardCards.map((c) => c.id);
    const allComments = cardIds.length > 0
      ? db.select().from(comments).all().filter((c) => cardIds.includes(c.cardId))
      : [];

    // Get card tags
    const allCardTags = cardIds.length > 0
      ? db.select().from(cardTags).all().filter((ct) => cardIds.includes(ct.cardId))
      : [];

    // Get all tags
    const allTags = db.select().from(tags).all();
    const tagMap = new Map(allTags.map((t) => [t.id, t]));

    // Transform the data to match our client-side format
    const transformedBoard = {
      columns: boardColumns.map((col) => ({
        id: col.id,
        title: col.title,
        cardIds: JSON.parse(col.cardIds),
      })),
      cards: boardCards.reduce((acc, card) => {
        const cardComments = allComments.filter((c) => c.cardId === card.id);
        const cardTagRelations = allCardTags.filter((ct) => ct.cardId === card.id);
        const cardTagList = cardTagRelations
          .map((ct) => tagMap.get(ct.tagId))
          .filter((t): t is NonNullable<typeof t> => t !== undefined);

        acc[card.id] = {
          id: card.id,
          title: card.title,
          notes: card.notes,
          generatedPrompt: card.generatedPrompt || undefined,
          dueDate: card.dueDate ? card.dueDate.toISOString() : undefined,
          priority: card.priority,
          comments: cardComments.map((comment) => ({
            id: comment.id,
            content: comment.content,
            cardId: comment.cardId,
            createdAt: comment.createdAt.toISOString(),
            updatedAt: comment.updatedAt.toISOString(),
          })),
          tags: cardTagList.map((tag) => ({
            id: tag.id,
            name: tag.name,
            color: tag.color,
            createdAt: tag.createdAt.toISOString(),
            updatedAt: tag.updatedAt.toISOString(),
          })),
          createdAt: card.createdAt.toISOString(),
          updatedAt: card.updatedAt.toISOString(),
        };
        return acc;
      }, {} as Record<string, any>),
    };

    return new Response(JSON.stringify(transformedBoard), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching board:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch board" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// PUT /api/board - Update the entire board structure (for drag and drop)
export async function action({ request }: { request: Request }) {
  if (request.method !== "PUT") {
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

    const { columns: newColumns } = await request.json();

    // Update all columns with their new cardIds
    for (let i = 0; i < newColumns.length; i++) {
      const col = newColumns[i];
      db.update(columns)
        .set({
          cardIds: JSON.stringify(col.cardIds),
          position: i,
          updatedAt: new Date(),
        })
        .where(eq(columns.id, col.id))
        .run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating board:", error);
    return new Response(
      JSON.stringify({ error: "Failed to update board" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
