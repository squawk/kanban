import type { Route } from "./+types/api.cards";
import { prisma } from "~/lib/prisma";

// POST /api/cards - Create a new card
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { title, notes, columnId } = await request.json();

    if (!title || !columnId) {
      return new Response(
        JSON.stringify({ error: "Title and columnId are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the first board
    const board = await prisma.board.findFirst();

    if (!board) {
      return new Response(
        JSON.stringify({ error: "Board not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create the card
    const card = await prisma.card.create({
      data: {
        title,
        notes: notes || "",
        boardId: board.id,
      },
    });

    // Add card ID to the column's cardIds
    const column = await prisma.column.findUnique({
      where: { id: columnId },
    });

    if (column) {
      const cardIds = Array.isArray(column.cardIds)
        ? column.cardIds
        : JSON.parse(column.cardIds as string);

      await prisma.column.update({
        where: { id: columnId },
        data: {
          cardIds: JSON.stringify([...cardIds, card.id]),
        },
      });
    }

    return new Response(JSON.stringify(card), {
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
