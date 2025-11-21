import type { Route } from "./+types/api.tags";
import { prisma } from "~/lib/prisma";

// GET /api/tags - Get all tags
export async function loader() {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return new Response(JSON.stringify(tags), {
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
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { name, color } = await request.json();

    if (!name || !color) {
      return new Response(
        JSON.stringify({ error: "Name and color are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if tag with this name already exists
    const existing = await prisma.tag.findUnique({
      where: { name },
    });

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Tag with this name already exists" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const tag = await prisma.tag.create({
      data: {
        name,
        color,
      },
    });

    return new Response(JSON.stringify(tag), {
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
