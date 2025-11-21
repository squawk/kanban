import type { Route } from "./+types/api.templates";
import { prisma } from "~/lib/prisma";

// GET /api/templates - Get all templates
export async function loader() {
  try {
    const templates = await prisma.template.findMany({
      orderBy: {
        name: "asc",
      },
    });

    // Transform JSON fields
    const transformedTemplates = templates.map((template) => ({
      ...template,
      tags: Array.isArray(template.tags)
        ? template.tags
        : JSON.parse(template.tags as string),
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    }));

    return new Response(JSON.stringify(transformedTemplates), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch templates" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// POST /api/templates - Create a new template
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { name, title, notes, tags, priority } = await request.json();

    if (!name || !title) {
      return new Response(
        JSON.stringify({ error: "Name and title are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const template = await prisma.template.create({
      data: {
        name,
        title,
        notes: notes || "",
        tags: JSON.stringify(tags || []),
        priority: priority || "medium",
      },
    });

    return new Response(
      JSON.stringify({
        ...template,
        tags: Array.isArray(template.tags)
          ? template.tags
          : JSON.parse(template.tags as string),
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating template:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create template" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
