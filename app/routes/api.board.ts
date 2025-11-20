import type { Route } from "./+types/api.board";
import { prisma } from "~/lib/prisma";

// GET /api/board - Get the kanban board with all columns and cards
export async function loader() {
  try {
    // Get the first board (we only have one board for now)
    const board = await prisma.board.findFirst({
      include: {
        columns: {
          orderBy: {
            position: "asc",
          },
        },
        cards: {
          include: {
            comments: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
      },
    });

    if (!board) {
      return new Response(
        JSON.stringify({ error: "Board not found. Please run database seeding." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Transform the data to match our client-side format
    const transformedBoard = {
      columns: board.columns.map((col) => ({
        id: col.id,
        title: col.title,
        cardIds: Array.isArray(col.cardIds)
          ? col.cardIds
          : JSON.parse(col.cardIds as string),
      })),
      cards: board.cards.reduce((acc, card: any) => {
        acc[card.id] = {
          id: card.id,
          title: card.title,
          notes: card.notes,
          generatedPrompt: card.generatedPrompt || undefined,
          comments: card.comments.map((comment: any) => ({
            id: comment.id,
            content: comment.content,
            cardId: comment.cardId,
            createdAt: comment.createdAt.toISOString(),
            updatedAt: comment.updatedAt.toISOString(),
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
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "PUT") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { columns } = await request.json();

    // Get the first board
    const board = await prisma.board.findFirst();

    if (!board) {
      return new Response(
        JSON.stringify({ error: "Board not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update all columns with their new cardIds
    await Promise.all(
      columns.map((column: any, index: number) =>
        prisma.column.update({
          where: { id: column.id },
          data: {
            cardIds: JSON.stringify(column.cardIds),
            position: index,
          },
        })
      )
    );

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
