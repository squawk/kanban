import type { Route } from "./+types/api.columns.$columnId";
import { prisma } from "~/lib/prisma";

// DELETE /api/columns/:columnId - Delete a column
export async function action({ request, params }: Route.ActionArgs) {
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
    // Get the column with its cards
    const column = await prisma.column.findUnique({
      where: { id: columnId },
    });

    if (!column) {
      return new Response(
        JSON.stringify({ error: "Column not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Delete all cards in this column
    const cardIds = Array.isArray(column.cardIds)
      ? column.cardIds
      : JSON.parse(column.cardIds as string);

    if (cardIds.length > 0) {
      await prisma.card.deleteMany({
        where: {
          id: {
            in: cardIds,
          },
        },
      });
    }

    // Delete the column
    await prisma.column.delete({
      where: { id: columnId },
    });

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
