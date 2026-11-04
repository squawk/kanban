import { db } from "~/lib/db";
import { boardMembers, boards, cards, users } from "~/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { api, getBoardParticipants, requireBoardAccess, requireUser } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";
import { notifyAddedToBoard } from "~/lib/notifications.server";

type Args = { request: Request; params: { boardId: string } };

// GET /api/boards/:boardId/members - People who can see (and be assigned on) this board
export const loader = api("list board members", async ({ request, params }: Args) => {
  const user = await requireUser(request);
  requireBoardAccess(user, params.boardId);
  return json(getBoardParticipants(params.boardId));
});

// POST   { userId } - add a member (owner only)
// DELETE { userId } - remove a member (owner, or a member removing themselves)
export const action = api("update board members", async ({ request, params }: Args) => {
  const user = await requireUser(request);
  const { boardId } = params;
  const role = requireBoardAccess(user, boardId);
  const { userId } = await readJson<{ userId?: string }>(request);
  if (!userId) return jsonError("userId is required", 400);

  const board = db.select().from(boards).where(eq(boards.id, boardId)).get()!;
  const target = db
    .select({ id: users.id, name: users.name, email: users.email, approved: users.approved, disabled: users.disabled })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!target) return jsonError("User not found", 404);

  if (request.method === "POST") {
    if (role !== "owner") return jsonError("Only the board owner can add members", 403);
    if (target.id === board.userId) return jsonError("The owner already has access", 400);
    if (!target.approved || target.disabled) return jsonError("That user can't be added right now", 400);

    const inserted = db
      .insert(boardMembers)
      .values({ boardId, userId, addedById: user.id, createdAt: new Date() })
      .onConflictDoNothing()
      .run();

    if (inserted.changes > 0) {
      logAudit({
        actor: user,
        action: "board.member_added",
        entityType: "board",
        entityId: boardId,
        boardId,
        summary: `Shared "${board.name}" with ${target.name} <${target.email}>`,
        metadata: { userId },
        request,
      });
      notifyAddedToBoard(boardId, userId, user);
    }
    return json(getBoardParticipants(boardId), inserted.changes > 0 ? 201 : 200);
  }

  if (request.method === "DELETE") {
    const isSelf = userId === user.id;
    if (role !== "owner" && !isSelf) return jsonError("Only the board owner can remove members", 403);
    if (userId === board.userId) return jsonError("The board owner can't be removed", 400);

    db.transaction((tx) => {
      tx.delete(boardMembers).where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId))).run();
      // Cards assigned to someone who lost access become unassigned
      tx.update(cards)
        .set({ assigneeId: null, updatedAt: new Date() })
        .where(and(eq(cards.boardId, boardId), eq(cards.assigneeId, userId)))
        .run();
    });

    logAudit({
      actor: user,
      action: isSelf ? "board.member_left" : "board.member_removed",
      entityType: "board",
      entityId: boardId,
      boardId,
      summary: isSelf
        ? `${target.name} left "${board.name}"`
        : `Removed ${target.name} <${target.email}> from "${board.name}"`,
      metadata: { userId },
      request,
    });
    return json(getBoardParticipants(boardId));
  }

  return jsonError("Method not allowed", 405);
});
