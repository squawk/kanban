import { api, requireUser } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";
import { createClient, listClients, serializeClient } from "~/lib/clients.server";

// GET /api/clients - Active clients, by name (?all=1 adds archived ones, for admins)
export const loader = api("list clients", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  const includeArchived = new URL(request.url).searchParams.get("all") === "1" && user.role === "admin";
  return json(await listClients({ includeArchived }));
});

// POST /api/clients - Add a client: { name, color }. Anyone can; an existing name
// (ignoring case) returns that client instead of a duplicate.
export const action = api("add client", async ({ request }: { request: Request }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);
  const user = await requireUser(request);
  const body = await readJson<{ name?: unknown; color?: unknown }>(request);
  const { client, created, restored } = await createClient(body, user.id);
  if (created || restored) {
    await logAudit({
      actor: user,
      action: created ? "client.created" : "client.restored",
      entityType: "client",
      entityId: client.id,
      summary: created ? `Added client "${client.name}"` : `Restored archived client "${client.name}"`,
      metadata: { name: client.name, color: client.color },
      request,
    });
  }
  return json(serializeClient(client), created ? 201 : 200);
});
