import { db } from "~/lib/db";
import { columns } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession, getUserBoard } from "~/lib/auth";
import { nanoid } from "nanoid";

// POST /api/columns - Create a new column
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

    const { title } = await request.json();

    if (!title) {
      return new Response(
        JSON.stringify({ error: "Title is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the current column count to set position
    const existingColumns = db.select().from(columns).where(eq(columns.boardId, board.id)).all();
    const columnCount = existingColumns.length;

    const columnId = nanoid();
    const now = new Date();

    // Create the column
    db.insert(columns).values({
      id: columnId,
      title,
      position: columnCount,
      boardId: board.id,
      cardIds: "[]",
      createdAt: now,
      updatedAt: now,
    }).run();

    const newColumn = db.select().from(columns).where(eq(columns.id, columnId)).get();

    return new Response(JSON.stringify(newColumn), {
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
