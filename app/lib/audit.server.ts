import { nanoid } from "nanoid";
import { and, desc, eq, gte, lt, or, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { db } from "./db";
import { auditLogs } from "./db/schema";
import { getClientIP } from "./security";
import { broadcastBoardChanged } from "./realtime.server";

export interface AuditActor {
  id: string;
  email: string;
}

export interface AuditEvent {
  actor?: AuditActor | null;
  action: string; // e.g. "card.created", "user.role_changed"
  entityType: "user" | "card" | "column" | "board" | "comment" | "invitation" | "settings" | "auth" | "system";
  entityId?: string | null;
  boardId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}

/**
 * Append an entry to the audit trail. Never throws: auditing must not break the
 * user-facing operation, but failures are logged.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  // Every board mutation is audited, so this is also where live viewers get notified
  if (event.boardId) broadcastBoardChanged(event.boardId);
  try {
    await db.insert(auditLogs)
      .values({
        id: nanoid(),
        actorId: event.actor?.id ?? null,
        actorEmail: event.actor?.email ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        boardId: event.boardId ?? null,
        summary: event.summary.slice(0, 500),
        metadata: JSON.stringify(event.metadata ?? {}),
        ipAddress: event.request ? getClientIP(event.request) : null,
        createdAt: new Date(),
      });
  } catch (error) {
    console.error("Failed to write audit log:", error instanceof Error ? error.message : error);
  }
}

/** Escape LIKE wildcards so user input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function likeEscaped(column: AnyColumn, pattern: string): SQL {
  // ILIKE: case-insensitive, matching how the old SQLite LIKE behaved
  return sql`${column} ILIKE ${pattern} ESCAPE '\\'`;
}

export interface AuditQuery {
  action?: string; // prefix match, e.g. "card." or "user.role_changed"
  actorId?: string;
  entityType?: string;
  entityId?: string;
  boardId?: string;
  search?: string;
  before?: Date; // cursor
  since?: Date;
  limit?: number;
}

export function serializeAuditLog(row: typeof auditLogs.$inferSelect) {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata);
  } catch {
    // ignore malformed metadata
  }
  return {
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    boardId: row.boardId,
    summary: row.summary,
    metadata,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
  };
}

export type SerializedAuditLog = ReturnType<typeof serializeAuditLog>;

export async function queryAuditLogs(q: AuditQuery) {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const conditions: SQL[] = [];
  if (q.action) {
    // "card." matches every card event; "card.moved" matches exactly
    conditions.push(
      q.action.endsWith(".") ? likeEscaped(auditLogs.action, `${escapeLike(q.action)}%`) : eq(auditLogs.action, q.action)
    );
  }
  if (q.actorId) conditions.push(eq(auditLogs.actorId, q.actorId));
  if (q.entityType) conditions.push(eq(auditLogs.entityType, q.entityType));
  if (q.entityId) conditions.push(eq(auditLogs.entityId, q.entityId));
  if (q.boardId) conditions.push(eq(auditLogs.boardId, q.boardId));
  if (q.before) conditions.push(lt(auditLogs.createdAt, q.before));
  if (q.since) conditions.push(gte(auditLogs.createdAt, q.since));
  if (q.search) {
    const term = `%${escapeLike(q.search)}%`;
    conditions.push(or(likeEscaped(auditLogs.summary, term), likeEscaped(auditLogs.actorEmail, term))!);
  }

  const rows = await db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    // seq breaks ties between events logged in the same millisecond
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.seq))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(serializeAuditLog);
  return {
    entries: page,
    nextCursor: hasMore ? page[page.length - 1].createdAt : null,
  };
}
