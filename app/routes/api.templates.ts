import { db } from "~/lib/db";
import { templates } from "~/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getSession } from "~/lib/auth";
import { nanoid } from "nanoid";

// GET /api/templates - Get all templates
export async function loader({ request }: { request: Request }) {
  try {
    const session = await getSession(request);
    if (!session.userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const allTemplates = db.select().from(templates).orderBy(asc(templates.name)).all();

    // Transform JSON fields
    const transformedTemplates = allTemplates.map((template) => ({
      ...template,
      tags: JSON.parse(template.tags),
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

    const { name, title, notes, tags: templateTags, priority } = await request.json();

    if (!name || !title) {
      return new Response(
        JSON.stringify({ error: "Name and title are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const templateId = nanoid();
    const now = new Date();

    db.insert(templates).values({
      id: templateId,
      name,
      title,
      notes: notes || "",
      tags: JSON.stringify(templateTags || []),
      priority: priority || "medium",
      createdAt: now,
      updatedAt: now,
    }).run();

    const newTemplate = db.select().from(templates).where(eq(templates.id, templateId)).get();

    return new Response(
      JSON.stringify({
        ...newTemplate,
        tags: JSON.parse(newTemplate!.tags),
        createdAt: newTemplate!.createdAt.toISOString(),
        updatedAt: newTemplate!.updatedAt.toISOString(),
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
