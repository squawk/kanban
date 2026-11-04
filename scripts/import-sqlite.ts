/**
 * One-time import of the old SQLite database (Fly volume: /data/data.db) into Postgres.
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/import-sqlite.ts ./data.db [--dry-run]
 *
 * - Run `npm run db:migrate` against the same DATABASE_URL first.
 * - Refuses to run if the target already has users (so it can't double-import).
 * - Works with databases from before or after the team features (missing tables or
 *   columns get defaults).
 * - SQLite never enforced foreign keys here, so orphaned rows (e.g. cards whose board
 *   was deleted) are skipped and dangling optional references are set to null.
 *   Everything skipped is reported.
 * - Runs in a single transaction: it imports everything or nothing.
 */
import Database from "better-sqlite3";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as s from "../app/lib/db/schema";

const [, , sqlitePath, ...flags] = process.argv;
const dryRun = flags.includes("--dry-run");
if (!sqlitePath || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=postgres://... npx tsx scripts/import-sqlite.ts <path-to-sqlite.db> [--dry-run]");
  process.exit(1);
}

const lite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
type Row = Record<string, unknown>;

function tableExists(name: string) {
  return !!lite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}
function rows(table: string): Row[] {
  return tableExists(table) ? (lite.prepare(`SELECT * FROM "${table}"`).all() as Row[]) : [];
}
/** drizzle's sqlite `timestamp` mode stores unix seconds */
function date(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Date(n < 1e11 ? n * 1000 : n); // tolerate millisecond values too
}
const req = (v: unknown) => date(v) ?? new Date();
const bool = (v: unknown, fallback: boolean) => (v === null || v === undefined ? fallback : Number(v) === 1);
const str = (v: unknown, fallback = "") => (v === null || v === undefined ? fallback : String(v));
const opt = (v: unknown) => (v === null || v === undefined ? null : String(v));

const skipped: Record<string, number> = {};
const skip = (table: string) => (skipped[table] = (skipped[table] ?? 0) + 1);

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema: s });

  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length) {
    console.error("Target database already has users; refusing to import twice.");
    await client.end();
    process.exit(1);
  }

  // ---- Build rows in dependency order, dropping orphans ----
  const users = rows("users").map((r) => ({
    id: str(r.id),
    email: str(r.email).toLowerCase(),
    passwordHash: str(r.password_hash),
    name: str(r.name),
    emailVerified: bool(r.email_verified, false),
    approved: bool(r.approved, false),
    role: (r.role === "admin" ? "admin" : "member") as "admin" | "member",
    disabled: bool(r.disabled, false),
    emailNotifications: bool(r.email_notifications, true),
    lastLoginAt: date(r.last_login_at),
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
  }));
  const userIds = new Set(users.map((u) => u.id));
  const optUser = (v: unknown) => {
    const id = opt(v);
    return id && userIds.has(id) ? id : null;
  };

  const tokens = (table: string) =>
    rows(table).flatMap((r) =>
      userIds.has(str(r.user_id))
        ? [{ id: str(r.id), userId: str(r.user_id), token: str(r.token), expiresAt: req(r.expires_at), createdAt: req(r.created_at) }]
        : (skip(table), [])
    );
  const verificationTokens = tokens("email_verification_tokens");
  const resetTokens = tokens("password_reset_tokens");

  const boards = rows("boards").flatMap((r) =>
    userIds.has(str(r.user_id))
      ? [{ id: str(r.id), name: str(r.name, "My Board"), userId: str(r.user_id), createdAt: req(r.created_at), updatedAt: req(r.updated_at) }]
      : (skip("boards"), [])
  );
  const boardIds = new Set(boards.map((b) => b.id));

  const columns = rows("columns").flatMap((r) =>
    boardIds.has(str(r.board_id))
      ? [{
          id: str(r.id),
          title: str(r.title),
          position: Number(r.position ?? 0),
          boardId: str(r.board_id),
          cardIds: str(r.card_ids, "[]"),
          createdAt: req(r.created_at),
          updatedAt: req(r.updated_at),
        }]
      : (skip("columns"), [])
  );

  const cards = rows("cards").flatMap((r) =>
    boardIds.has(str(r.board_id))
      ? [{
          id: str(r.id),
          title: str(r.title),
          notes: str(r.notes),
          generatedPrompt: opt(r.generated_prompt),
          dueDate: date(r.due_date),
          priority: str(r.priority, "medium"),
          boardId: str(r.board_id),
          archivedAt: date(r.archived_at),
          assigneeId: optUser(r.assignee_id),
          createdById: optUser(r.created_by_id),
          createdAt: req(r.created_at),
          updatedAt: req(r.updated_at),
        }]
      : (skip("cards"), [])
  );
  const cardIds = new Set(cards.map((c) => c.id));

  const comments = rows("comments").flatMap((r) =>
    cardIds.has(str(r.card_id))
      ? [{ id: str(r.id), content: str(r.content), cardId: str(r.card_id), authorId: optUser(r.author_id), createdAt: req(r.created_at), updatedAt: req(r.updated_at) }]
      : (skip("comments"), [])
  );

  const tags = rows("tags").map((r) => ({ id: str(r.id), name: str(r.name), color: str(r.color), createdAt: req(r.created_at), updatedAt: req(r.updated_at) }));
  const tagIds = new Set(tags.map((t) => t.id));
  const seenCardTag = new Set<string>();
  const cardTags = rows("card_tags").flatMap((r) => {
    const key = `${r.card_id}:${r.tag_id}`;
    if (!cardIds.has(str(r.card_id)) || !tagIds.has(str(r.tag_id)) || seenCardTag.has(key)) return skip("card_tags"), [];
    seenCardTag.add(key);
    return [{ cardId: str(r.card_id), tagId: str(r.tag_id), createdAt: req(r.created_at) }];
  });

  const templates = rows("templates").map((r) => ({
    id: str(r.id),
    name: str(r.name),
    title: str(r.title),
    notes: str(r.notes),
    tags: str(r.tags, "[]"),
    priority: str(r.priority, "medium"),
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
  }));

  const boardMembers = rows("board_members").flatMap((r) =>
    boardIds.has(str(r.board_id)) && userIds.has(str(r.user_id))
      ? [{ boardId: str(r.board_id), userId: str(r.user_id), addedById: optUser(r.added_by_id), createdAt: req(r.created_at) }]
      : (skip("board_members"), [])
  );

  const invitations = rows("invitations").map((r) => ({
    id: str(r.id),
    email: str(r.email),
    role: (r.role === "admin" ? "admin" : "member") as "admin" | "member",
    tokenHash: str(r.token_hash),
    invitedById: optUser(r.invited_by_id),
    expiresAt: req(r.expires_at),
    acceptedAt: date(r.accepted_at),
    revokedAt: date(r.revoked_at),
    createdAt: req(r.created_at),
  }));

  const auditLogs = rows("audit_logs")
    .map((r) => ({
      id: str(r.id),
      actorId: opt(r.actor_id),
      actorEmail: opt(r.actor_email),
      action: str(r.action),
      entityType: str(r.entity_type),
      entityId: opt(r.entity_id),
      boardId: opt(r.board_id),
      summary: str(r.summary),
      metadata: str(r.metadata, "{}"),
      ipAddress: opt(r.ip_address),
      createdAt: req(r.created_at),
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); // keeps `seq` in time order

  const dueReminders = rows("due_reminders").flatMap((r) =>
    cardIds.has(str(r.card_id))
      ? [{ cardId: str(r.card_id), kind: (r.kind === "overdue" ? "overdue" : "due_soon") as "overdue" | "due_soon", dueDay: str(r.due_day), userId: str(r.user_id), sentAt: req(r.sent_at) }]
      : (skip("due_reminders"), [])
  );

  const appSettings = rows("app_settings").map((r) => ({ key: str(r.key), value: str(r.value), updatedAt: req(r.updated_at) }));

  const plan = [
    ["users", s.users, users],
    ["email_verification_tokens", s.emailVerificationTokens, verificationTokens],
    ["password_reset_tokens", s.passwordResetTokens, resetTokens],
    ["boards", s.boards, boards],
    ["columns", s.columns, columns],
    ["cards", s.cards, cards],
    ["comments", s.comments, comments],
    ["tags", s.tags, tags],
    ["card_tags", s.cardTags, cardTags],
    ["templates", s.templates, templates],
    ["board_members", s.boardMembers, boardMembers],
    ["invitations", s.invitations, invitations],
    ["audit_logs", s.auditLogs, auditLogs],
    ["due_reminders", s.dueReminders, dueReminders],
    ["app_settings", s.appSettings, appSettings],
  ] as const;

  console.table(plan.map(([name, , list]) => ({ table: name, import: list.length, skipped: skipped[name] ?? 0 })));

  if (dryRun) {
    console.log("Dry run: nothing written.");
  } else {
    await db.transaction(async (tx) => {
      for (const [, table, list] of plan) {
        for (let i = 0; i < list.length; i += 500) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await tx.insert(table as any).values(list.slice(i, i + 500) as any);
        }
      }
    });
    console.log("Import complete.");
  }
  await client.end();
}

main().catch((error) => {
  console.error("Import failed (nothing was written):", error);
  process.exit(1);
});
