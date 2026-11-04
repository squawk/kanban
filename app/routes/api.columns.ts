import { db } from "~/lib/db";
import { columns } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { api, boardIdFromRequest, requireUser, resolveBoard } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { INPUT_LIMITS } from "~/lib/security";
import { logAudit } from "~/lib/audit.server";

// POST /api/columns - Create a new column
export const action = api("create column", async ({ request }: { request: Request }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const { title, boardId } = await readJson<{ title?: string; boardId?: string }>(request);
  const { board } = resolveBoard(user, boardId ?? boardIdFromRequest(request));

  if (!title || !title.trim()) return jsonError("Title is required", 400);
  if (title.length > INPUT_LIMITS.columnTitle) {
    return jsonError(`Title must be ${INPUT_LIMITS.columnTitle} characters or less`, 400);
  }

  const existingColumns = db.select().from(columns).where(eq(columns.boardId, board.id)).all();
  const columnId = nanoid();
  const now = new Date();

  db.insert(columns)
    .values({
      id: columnId,
      title: title.trim(),
      position: existingColumns.length,
      boardId: board.id,
      cardIds: "[]",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const newColumn = db.select().from(columns).where(eq(columns.id, columnId)).get();

  logAudit({
    actor: user,
    action: "column.created",
    entityType: "column",
    entityId: columnId,
    boardId: board.id,
    summary: `Added column "${title.trim()}"`,
    request,
  });

  return json(newColumn, 201);
});
