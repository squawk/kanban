import { db } from "~/lib/db";
import { boards, cards, columns } from "~/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { api, listAccessibleBoards, requireUser } from "~/lib/access.server";
import { serializeCards } from "~/lib/board-serialize.server";
import { json } from "~/lib/http";

// GET /api/my-tasks - Active cards assigned to the current user across all their boards
export const loader = api("list assigned cards", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  const accessible = await listAccessibleBoards(user.id);
  const boardIds = accessible.map((b) => b.id);
  if (boardIds.length === 0) return json([]);

  const assigned = await db
    .select()
    .from(cards)
    .where(and(eq(cards.assigneeId, user.id), isNull(cards.archivedAt), inArray(cards.boardId, boardIds)));
  if (assigned.length === 0) return json([]);

  const boardNames = new Map(
    (await db.select({ id: boards.id, name: boards.name }).from(boards).where(inArray(boards.id, boardIds))).map((b) => [b.id, b.name])
  );
  const columnRows = await db.select().from(columns).where(inArray(columns.boardId, [...new Set(assigned.map((c) => c.boardId))]));
  const columnOf = new Map<string, string>();
  for (const col of columnRows) for (const id of JSON.parse(col.cardIds) as string[]) columnOf.set(id, col.title);

  const result = (await serializeCards(assigned, { includeComments: false }))
    .map((c) => ({ ...c, boardName: boardNames.get(c.boardId) ?? "Board", columnTitle: columnOf.get(c.id) ?? null }))
    .sort((a, b) => {
      // Due soonest first; undated last
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return json(result);
});
