import { db } from "~/lib/db";
import { boards } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { api, listAccessibleBoards, requireUser, resolveBoard } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";

// GET /api/boards - Boards the user owns or is a member of
export const loader = api("list boards", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  await resolveBoard(user); // ensure the user's own board exists
  return json(await listAccessibleBoards(user.id));
});

// PATCH /api/boards - Rename a board (owner only). Body: { boardId, name }
export const action = api("update board", async ({ request }: { request: Request }) => {
  if (request.method !== "PATCH") return jsonError("Method not allowed", 405);
  const user = await requireUser(request);
  const { boardId, name } = await readJson<{ boardId?: string; name?: string }>(request);
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!boardId || !trimmed || trimmed.length > 100) return jsonError("A board name of up to 100 characters is required", 400);

  const { board, role } = await resolveBoard(user, boardId);
  if (role !== "owner") return jsonError("Only the board owner can rename it", 403);

  await db.update(boards).set({ name: trimmed, updatedAt: new Date() }).where(eq(boards.id, board.id));
  await logAudit({
    actor: user,
    action: "board.renamed",
    entityType: "board",
    entityId: board.id,
    boardId: board.id,
    summary: `Renamed board "${board.name}" to "${trimmed}"`,
    metadata: { from: board.name, to: trimmed },
    request,
  });
  return json({ id: board.id, name: trimmed });
});
