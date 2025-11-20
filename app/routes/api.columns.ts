import type { Route } from "./+types/api.columns";
import { prisma } from "~/lib/prisma";

// POST /api/columns - Create a new column
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { title } = await request.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: "Title is required" }),
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

    // Get the current column count to set position
    const columnCount = await prisma.column.count({
      where: { boardId: board.id },
    });

    // Create the column
    const column = await prisma.column.create({
      data: {
        title,
        position: columnCount,
        boardId: board.id,
        cardIds: JSON.stringify([]),
      },
    });

    return new Response(JSON.stringify(column), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating column:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create column" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
