/**
 * Clients: who a card's work is for. One shared list (like tags); anyone can add a
 * client, admins rename, recolor and archive. Archived clients stay on the cards that
 * have them but aren't offered for new ones.
 */
import { asc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, firstRow } from "./db";
import { clients, type Client } from "./db/schema";
import { jsonError } from "./http";

export const CLIENT_NAME_MAX = 80;
const HEX = /^#[0-9a-f]{6}$/i;

export interface ClientSummary {
  id: string;
  name: string;
  color: string;
  archived: boolean;
}

export function serializeClient(c: Client): ClientSummary {
  return { id: c.id, name: c.name, color: c.color, archived: !!c.archivedAt };
}

/** Trimmed, single-spaced name; throws a 400 Response when empty or too long. */
export function cleanClientName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!trimmed) throw jsonError("Client name is required", 400);
  if (trimmed.length > CLIENT_NAME_MAX) throw jsonError(`Client name must be ${CLIENT_NAME_MAX} characters or less`, 400);
  return trimmed;
}

export function cleanClientColor(color: unknown): string {
  if (typeof color !== "string" || !HEX.test(color)) throw jsonError("Color must be a hex value like #3b82f6", 400);
  return color.toLowerCase();
}

export async function listClients(opts: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select()
    .from(clients)
    .where(opts.includeArchived ? undefined : isNull(clients.archivedAt))
    .orderBy(asc(sql`lower(${clients.name})`));
  return rows.map(serializeClient);
}

export async function findClientByName(name: string) {
  return db
    .select()
    .from(clients)
    .where(eq(sql`lower(${clients.name})`, name.toLowerCase()))
    .limit(1)
    .then(firstRow);
}

/**
 * Add a client, or return the existing one with that name (ignoring case), so two
 * people typing "Acme" end up with one client. An archived match comes back active.
 */
export async function createClient(input: { name?: unknown; color?: unknown }, userId: string) {
  const name = cleanClientName(input.name);
  const color = cleanClientColor(input.color);
  const existing = await findClientByName(name);
  if (existing) {
    if (existing.archivedAt) {
      await db.update(clients).set({ archivedAt: null, updatedAt: new Date() }).where(eq(clients.id, existing.id));
      return { client: { ...existing, archivedAt: null }, created: false, restored: true };
    }
    return { client: existing, created: false, restored: false };
  }
  const now = new Date();
  const row = { id: nanoid(), name, color, createdById: userId, createdAt: now, updatedAt: now, archivedAt: null };
  try {
    await db.insert(clients).values(row);
  } catch (error) {
    // Someone added the same name a moment ago: use theirs
    const raced = await findClientByName(name);
    if (raced) return { client: raced, created: false, restored: false };
    throw error;
  }
  return { client: row as Client, created: true, restored: false };
}

/** A client a card may be set to: it must exist and, unless the card already has it, not be archived. */
export async function requireAssignableClient(clientId: string, currentClientId?: string | null) {
  const client = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1).then(firstRow);
  if (!client) throw jsonError("Client not found", 400);
  if (client.archivedAt && client.id !== currentClientId) throw jsonError(`"${client.name}" is archived`, 400);
  return client;
}

export async function getClient(id: string) {
  return db.select().from(clients).where(eq(clients.id, id)).limit(1).then(firstRow);
}

/** Is another client (not `exceptId`) already using this name? */
export async function nameTaken(name: string, exceptId: string) {
  const other = await findClientByName(name);
  return !!other && other.id !== exceptId;
}

