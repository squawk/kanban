/**
 * Authentication + authorization helpers for API routes.
 *
 * All helpers *throw* a JSON `Response` on failure; wrap handlers with `api()` so
 * thrown responses are returned and unexpected errors become a sanitized 500.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { boardMembers, boards, cards, columns, users, type User } from "./db/schema";
import { createUserBoard, getSession } from "./auth";
import { jsonError } from "./http";

export type AuthUser = Pick<User, "id" | "email" | "name" | "role" | "emailNotifications">;
export type BoardRole = "owner" | "member";

/** Wrap a loader/action so thrown `Response`s are returned and other errors become a 500. */
export function api<A extends unknown[]>(label: string, handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(`${label} error:`, error instanceof Error ? error.message : error);
      return jsonError(`Failed to ${label}`, 500);
    }
  };
}

/**
 * Load the signed-in user from the database (never trust role from the cookie).
 * Rejects disabled, unapproved, or deleted accounts.
 */
export async function requireUser(request: Request): Promise<AuthUser> {
  const session = await getSession(request);
  if (!session.userId) throw jsonError("Unauthorized", 401);

  const user = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailNotifications: users.emailNotifications,
      approved: users.approved,
      disabled: users.disabled,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .get();

  if (!user || user.disabled || !user.approved) throw jsonError("Unauthorized", 401);

  const { approved: _a, disabled: _d, ...authUser } = user;
  return authUser;
}

export async function requireAdmin(request: Request): Promise<AuthUser> {
  const user = await requireUser(request);
  if (user.role !== "admin") throw jsonError("Forbidden", 403);
  return user;
}

export function getBoardRole(userId: string, boardId: string): BoardRole | null {
  const board = db.select({ userId: boards.userId }).from(boards).where(eq(boards.id, boardId)).get();
  if (!board) return null;
  if (board.userId === userId) return "owner";
  const member = db
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
    .get();
  return member ? "member" : null;
}

/** Ensure the user can access the board; returns their role. 404s otherwise (don't leak existence). */
export function requireBoardAccess(user: AuthUser, boardId: string, need: BoardRole = "member"): BoardRole {
  const role = getBoardRole(user.id, boardId);
  if (!role) throw jsonError("Board not found", 404);
  if (need === "owner" && role !== "owner") throw jsonError("Only the board owner can do that", 403);
  return role;
}

/**
 * Resolve the board a request targets: an explicit `boardId` (checked for access),
 * or the user's own board (created on first use).
 */
export function resolveBoard(user: AuthUser, boardId?: string | null) {
  if (boardId) {
    const role = requireBoardAccess(user, boardId);
    const board = db.select().from(boards).where(eq(boards.id, boardId)).get()!;
    return { board, role };
  }
  let board = db.select().from(boards).where(eq(boards.userId, user.id)).get();
  if (!board) {
    createUserBoard(user.id);
    board = db.select().from(boards).where(eq(boards.userId, user.id)).get();
  }
  if (!board) throw jsonError("Board not found", 404);
  return { board, role: "owner" as BoardRole };
}

export function boardIdFromRequest(request: Request): string | null {
  return new URL(request.url).searchParams.get("boardId");
}

export function requireCardAccess(user: AuthUser, cardId: string) {
  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card) throw jsonError("Card not found", 404);
  const role = getBoardRole(user.id, card.boardId);
  if (!role) throw jsonError("Card not found", 404);
  return { card, role };
}

export function requireColumnAccess(user: AuthUser, columnId: string) {
  const column = db.select().from(columns).where(eq(columns.id, columnId)).get();
  if (!column) throw jsonError("Column not found", 404);
  const role = getBoardRole(user.id, column.boardId);
  if (!role) throw jsonError("Column not found", 404);
  return { column, role };
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  boardRole: BoardRole;
}

/** Everyone who can see a board (owner first). Disabled users are excluded. */
export function getBoardParticipants(boardId: string): Participant[] {
  const board = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!board) return [];
  const owner = db
    .select({ id: users.id, name: users.name, email: users.email, disabled: users.disabled })
    .from(users)
    .where(eq(users.id, board.userId))
    .get();
  const members = db
    .select({ id: users.id, name: users.name, email: users.email, disabled: users.disabled })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, boardId))
    .all();
  const out: Participant[] = [];
  if (owner && !owner.disabled) out.push({ id: owner.id, name: owner.name, email: owner.email, boardRole: "owner" });
  for (const m of members) {
    if (!m.disabled) out.push({ id: m.id, name: m.name, email: m.email, boardRole: "member" });
  }
  return out.sort((a, b) => (a.boardRole === b.boardRole ? a.name.localeCompare(b.name) : a.boardRole === "owner" ? -1 : 1));
}

export function isBoardParticipant(boardId: string, userId: string): boolean {
  return getBoardParticipants(boardId).some((p) => p.id === userId);
}

/** Boards the user owns or has been added to. */
export function listAccessibleBoards(userId: string) {
  const owned = db.select().from(boards).where(eq(boards.userId, userId)).all();
  const memberRows = db
    .select({ boardId: boardMembers.boardId })
    .from(boardMembers)
    .where(eq(boardMembers.userId, userId))
    .all();
  const shared = memberRows.length
    ? db.select().from(boards).where(inArray(boards.id, memberRows.map((r) => r.boardId))).all()
    : [];

  const ownerIds = [...new Set(shared.map((b) => b.userId))];
  const owners = ownerIds.length
    ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds)).all()
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));

  return [
    ...owned.map((b) => ({ id: b.id, name: b.name, role: "owner" as BoardRole, ownerName: null as string | null })),
    ...shared.map((b) => ({ id: b.id, name: b.name, role: "member" as BoardRole, ownerName: ownerName.get(b.userId) ?? null })),
  ];
}
