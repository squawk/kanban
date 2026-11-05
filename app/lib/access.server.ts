/**
 * Authentication + authorization helpers for API routes.
 *
 * All helpers *throw* a JSON `Response` on failure; wrap handlers with `api()` so
 * thrown responses are returned and unexpected errors become a sanitized 500.
 */
import { and, eq, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { db, firstRow } from "./db";
import { boardMembers, boards, cards, columns, users, type User } from "./db/schema";
import { createUserBoard, getSession } from "./auth";
import { jsonError } from "./http";
import { canSeeCard } from "./card-privacy";

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

  const user = await db
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
    .limit(1).then(firstRow);

  if (!user || user.disabled || !user.approved) throw jsonError("Unauthorized", 401);

  const { approved: _a, disabled: _d, ...authUser } = user;
  return authUser;
}

export async function requireAdmin(request: Request): Promise<AuthUser> {
  const user = await requireUser(request);
  if (user.role !== "admin") throw jsonError("Forbidden", 403);
  return user;
}

export async function getBoardRole(userId: string, boardId: string): Promise<BoardRole | null> {
  const board = await db.select({ userId: boards.userId }).from(boards).where(eq(boards.id, boardId)).limit(1).then(firstRow);
  if (!board) return null;
  if (board.userId === userId) return "owner";
  const member = await db
    .select({ userId: boardMembers.userId })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
    .limit(1).then(firstRow);
  return member ? "member" : null;
}

/** Ensure the user can access the board; returns their role. 404s otherwise (don't leak existence). */
export async function requireBoardAccess(user: AuthUser, boardId: string, need: BoardRole = "member"): Promise<BoardRole> {
  const role = await getBoardRole(user.id, boardId);
  if (!role) throw jsonError("Board not found", 404);
  if (need === "owner" && role !== "owner") throw jsonError("Only the board owner can do that", 403);
  return role;
}

/**
 * Resolve the board a request targets: an explicit `boardId` (checked for access),
 * or the user's own board (created on first use).
 */
export async function resolveBoard(user: AuthUser, boardId?: string | null) {
  if (boardId) {
    const role = await requireBoardAccess(user, boardId);
    const board = (await db.select().from(boards).where(eq(boards.id, boardId)).limit(1).then(firstRow))!;
    return { board, role };
  }
  let board = await db.select().from(boards).where(eq(boards.userId, user.id)).limit(1).then(firstRow);
  if (!board) {
    await createUserBoard(user.id);
    board = await db.select().from(boards).where(eq(boards.userId, user.id)).limit(1).then(firstRow);
  }
  if (!board) throw jsonError("Board not found", 404);
  return { board, role: "owner" as BoardRole };
}

export function boardIdFromRequest(request: Request): string | null {
  return new URL(request.url).searchParams.get("boardId");
}

export async function requireCardAccess(user: AuthUser, cardId: string) {
  const card = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1).then(firstRow);
  if (!card) throw jsonError("Card not found", 404);
  const role = await getBoardRole(user.id, card.boardId);
  // Someone else's private card doesn't exist as far as this user is concerned
  if (!role || !canSeeCard(card, user.id)) throw jsonError("Card not found", 404);
  return { card, role };
}

/** Ids of cards on these boards that `userId` may not see (other people's private cards). */
export async function hiddenCardIds(
  boardIds: string[],
  userId: string,
  executor: Pick<typeof db, "select"> = db,
): Promise<Set<string>> {
  if (boardIds.length === 0) return new Set();
  const rows = await executor
    .select({ id: cards.id })
    .from(cards)
    .where(
      and(
        inArray(cards.boardId, boardIds),
        eq(cards.isPrivate, true),
        or(isNull(cards.createdById), ne(cards.createdById, userId)),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** SQL filter for cards `userId` may see: every non-private card, plus their own private ones. */
export function visibleCardsFor(userId: string): SQL {
  return or(eq(cards.isPrivate, false), eq(cards.createdById, userId))!;
}

export async function requireColumnAccess(user: AuthUser, columnId: string) {
  const column = await db.select().from(columns).where(eq(columns.id, columnId)).limit(1).then(firstRow);
  if (!column) throw jsonError("Column not found", 404);
  const role = await getBoardRole(user.id, column.boardId);
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
export async function getBoardParticipants(boardId: string): Promise<Participant[]> {
  const board = await db.select().from(boards).where(eq(boards.id, boardId)).limit(1).then(firstRow);
  if (!board) return [];
  const owner = await db
    .select({ id: users.id, name: users.name, email: users.email, disabled: users.disabled })
    .from(users)
    .where(eq(users.id, board.userId))
    .limit(1).then(firstRow);
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, disabled: users.disabled })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, boardId));
  const out: Participant[] = [];
  if (owner && !owner.disabled) out.push({ id: owner.id, name: owner.name, email: owner.email, boardRole: "owner" });
  for (const m of members) {
    if (!m.disabled) out.push({ id: m.id, name: m.name, email: m.email, boardRole: "member" });
  }
  return out.sort((a, b) => (a.boardRole === b.boardRole ? a.name.localeCompare(b.name) : a.boardRole === "owner" ? -1 : 1));
}

export async function isBoardParticipant(boardId: string, userId: string): Promise<boolean> {
  return (await getBoardParticipants(boardId)).some((p) => p.id === userId);
}

/** Boards the user owns or has been added to. */
export async function listAccessibleBoards(userId: string) {
  const owned = await db.select().from(boards).where(eq(boards.userId, userId));
  const memberRows = await db
    .select({ boardId: boardMembers.boardId })
    .from(boardMembers)
    .where(eq(boardMembers.userId, userId));
  const shared = memberRows.length
    ? await db.select().from(boards).where(inArray(boards.id, memberRows.map((r) => r.boardId)))
    : [];

  const ownerIds = [...new Set(shared.map((b) => b.userId))];
  const owners = ownerIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds))
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));

  return [
    ...owned.map((b) => ({ id: b.id, name: b.name, role: "owner" as BoardRole, ownerName: null as string | null })),
    ...shared.map((b) => ({ id: b.id, name: b.name, role: "member" as BoardRole, ownerName: ownerName.get(b.userId) ?? null })),
  ];
}
