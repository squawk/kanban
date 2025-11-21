import { db } from "~/lib/db";
import { tags } from "~/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getSession } from "~/lib/auth";
import { nanoid } from "nanoid";

// GET /api/tags - Get all tags
export async function loader({ request }: { request: Request }) {
  try {
    const session = await getSession(request);
    if (!session.userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const allTags = db.select().from(tags).orderBy(asc(tags.name)).all();

    return new Response(JSON.stringify(allTags), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch tags" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST /api/tags - Create a new tag
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

    const { name, color } = await request.json();

    if (!name || !color) {
      return new Response(
        JSON.stringify({ error: "Name and color are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if tag with this name already exists
    const existing = db.select().from(tags).where(eq(tags.name, name)).get();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Tag with this name already exists" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tagId = nanoid();
    const now = new Date();

    db.insert(tags).values({
      id: tagId,
      name,
      color,
      createdAt: now,
      updatedAt: now,
    }).run();

    const newTag = db.select().from(tags).where(eq(tags.id, tagId)).get();

    return new Response(JSON.stringify(newTag), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating tag:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create tag" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
