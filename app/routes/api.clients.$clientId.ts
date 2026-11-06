import { eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { clients } from "~/lib/db/schema";
import { api, requireAdmin } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";
import { cleanClientColor, cleanClientName, getClient, nameTaken, serializeClient } from "~/lib/clients.server";

// PATCH /api/clients/:clientId - Admins rename, recolor, archive or restore a client.
// Body: any of { name, color, archived }
export const action = api(
  "update client",
  async ({ request, params }: { request: Request; params: { clientId?: string } }) => {
    if (request.method !== "PATCH") return jsonError("Method not allowed", 405);
    const admin = await requireAdmin(request);
    const client = params.clientId ? await getClient(params.clientId) : undefined;
    if (!client) return jsonError("Client not found", 404);

    const body = await readJson<{ name?: unknown; color?: unknown; archived?: unknown }>(request);
    const name = body.name !== undefined ? cleanClientName(body.name) : undefined;
    const color = body.color !== undefined ? cleanClientColor(body.color) : undefined;
    if (body.archived !== undefined && typeof body.archived !== "boolean") return jsonError("archived must be true or false", 400);
    if (name && name.toLowerCase() !== client.name.toLowerCase() && (await nameTaken(name, client.id))) {
      return jsonError(`There's already a client named "${name}"`, 409);
    }

    const now = new Date();
    await db
      .update(clients)
      .set({
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(body.archived !== undefined && { archivedAt: body.archived ? (client.archivedAt ?? now) : null }),
        updatedAt: now,
      })
      .where(eq(clients.id, client.id));
    const updated = (await getClient(client.id))!;

    const changes: string[] = [];
    if (name !== undefined && name !== client.name) changes.push(`renamed to "${name}"`);
    if (color !== undefined && color !== client.color) changes.push("recolored");
    if (body.archived !== undefined && body.archived !== !!client.archivedAt) changes.push(body.archived ? "archived" : "restored");
    if (changes.length) {
      await logAudit({
        actor: admin,
        action: "client.updated",
        entityType: "client",
        entityId: client.id,
        summary: `Client "${client.name}": ${changes.join(", ")}`,
        metadata: { from: serializeClient(client), to: serializeClient(updated) },
        request,
      });
    }
    return json(serializeClient(updated));
  }
);
