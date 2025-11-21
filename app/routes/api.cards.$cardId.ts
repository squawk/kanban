import type { Route } from "./+types/api.cards.$cardId";
import { prisma } from "~/lib/prisma";

// PUT /api/cards/:cardId - Update a card
// DELETE /api/cards/:cardId - Delete a card
export async function action({ request, params }: Route.ActionArgs) {
  const { cardId } = params;

  if (!cardId) {
    return new Response(
      JSON.stringify({ error: "Card ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    if (request.method === "PUT") {
      const { title, notes, generatedPrompt, dueDate, priority, tagIds } = await request.json();

      // If tagIds are provided, update the tags
      if (tagIds !== undefined) {
        // Delete existing tags
        await prisma.cardTag.deleteMany({
          where: { cardId },
        });

        // Create new tags if provided
        if (tagIds && tagIds.length > 0) {
          await prisma.cardTag.createMany({
            data: tagIds.map((tagId: string) => ({
              cardId,
              tagId,
            })),
          });
        }
      }

      const card = await prisma.card.update({
        where: { id: cardId },
        data: {
          ...(title !== undefined && { title }),
          ...(notes !== undefined && { notes }),
          ...(generatedPrompt !== undefined && { generatedPrompt }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(priority !== undefined && { priority }),
        },
      });

      return new Response(JSON.stringify(card), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "DELETE") {
      // Remove the card ID from all columns
      const columns = await prisma.column.findMany();

      await Promise.all(
        columns.map(async (column: any) => {
          const cardIds = Array.isArray(column.cardIds)
            ? column.cardIds
            : JSON.parse(column.cardIds as string);

          if (cardIds.includes(cardId)) {
            await prisma.column.update({
              where: { id: column.id },
              data: {
                cardIds: JSON.stringify(cardIds.filter((id: string) => id !== cardId)),
              },
            });
          }
        })
      );

      // Delete the card
      await prisma.card.delete({
        where: { id: cardId },
      });

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
