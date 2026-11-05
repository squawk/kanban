import { db } from "~/lib/db";
import { columns, cards } from "~/lib/db/schema";
import { eq, asc, and, isNull, inArray, ne } from "drizzle-orm";
import {
  api,
  boardIdFromRequest,
  getBoardParticipants,
  listAccessibleBoards,
  requireUser,
  resolveBoard,
} from "~/lib/access.server";
import { serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";
import { detectCardMoves } from "~/lib/card-diff";
import { logAudit } from "~/lib/audit.server";
import { notifyCardMoved } from "~/lib/notifications.server";
import { broadcastBoardChanged, clientRealtimeConfig } from "~/lib/realtime.server";
import { getActiveLocks } from "~/lib/card-locks.server";
import { cardBoardLabel, columnKey, COMBINED_BOARD_ID, sharedBoardName } from "~/lib/linked-cards";
import { users } from "~/lib/db/schema";

// GET /api/board?boardId= - Get a kanban board (defaults to the user's own board)
export const loader = api("fetch board", async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  if (boardIdFromRequest(request) === COMBINED_BOARD_ID) return json(await combinedBoard(user.id));
  const { board, role } = await resolveBoard(user, boardIdFromRequest(request));

  const boardColumns = await db
    .select()
    .from(columns)
    .where(eq(columns.boardId, board.id))
    .orderBy(asc(columns.position));

  const boardCards = await db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, board.id), isNull(cards.archivedAt)));

  const outColumns = boardColumns.map((col) => ({
    id: col.id,
    title: col.title,
    cardIds: JSON.parse(col.cardIds) as string[],
  }));

  // A board also shows cards assigned to its owner on other boards, to anyone viewing
  // it who can see those boards too. They stay on their own board: each appears in the
  // column with the same name here (the first column if there's none), and moving it
  // here moves it there.
  const linked = outColumns.length > 0 ? await linkedCardsFor(board.userId, board.id, user.id) : [];
  for (const { card, columnTitle } of linked) {
    const target = outColumns.find((c) => columnKey(c.title) === columnKey(columnTitle ?? "")) ?? outColumns[0];
    target.cardIds.push(card.id);
  }

  const serialized = await serializeCards([...boardCards, ...linked.map((l) => l.card)]);
  const linkedById = new Map(linked.map((l) => [l.card.id, l]));
  const locks = await getActiveLocks(serialized.map((c) => c.id));

  return json({
    board: { id: board.id, name: board.name, role, displayName: role === "owner" ? board.name : sharedBoardName(board.name, await ownerName(board.userId)) },
    realtime: clientRealtimeConfig(board.id),
    members: await getBoardParticipants(board.id),
    columns: outColumns,
    cards: Object.fromEntries(
      serialized.map((c) => {
        const l = linkedById.get(c.id);
        return [
          c.id,
          {
            ...c,
            lock: locks.get(c.id) ?? null,
            ...(l && { linkedFrom: { boardId: l.card.boardId, boardName: l.boardName, columnTitle: l.columnTitle } }),
          },
        ];
      })
    ),
  });
});

// PUT /api/board - Update column order / card placement (drag and drop)
export const action = api("update board", async ({ request }: { request: Request }) => {
  if (request.method !== "PUT") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const body = await readJson<{ boardId?: string; columns?: unknown }>(request);
  const { board } = await resolveBoard(user, body.boardId ?? boardIdFromRequest(request));
  const newColumns = body.columns;

  if (!Array.isArray(newColumns)) return jsonError("Invalid request format", 400);

  type Layout = { id: string; cardIds: string[] }[];
  const result = await db.transaction(async (tx) => {
    // Lock the board's columns so concurrent saves can't interleave their read-merge-write
    const existingColumns = await tx.select().from(columns).where(eq(columns.boardId, board.id)).for("update");
    const existingById = new Map(existingColumns.map((c) => [c.id, c]));
    const beforeLayout: Layout = existingColumns.map((c) => ({ id: c.id, cardIds: JSON.parse(c.cardIds) as string[] }));

    // Validate every column and card belongs to this board
    const submittedCardIds = new Set<string>();
    for (const col of newColumns) {
      if (!col || typeof col.id !== "string" || !Array.isArray(col.cardIds)) {
        return { error: jsonError("Invalid column format", 400) };
      }
      if (!existingById.has(col.id)) return { error: jsonError("Column not found or access denied", 403) };
      for (const cardId of col.cardIds) {
        if (typeof cardId !== "string") return { error: jsonError("Invalid card ID format", 400) };
        submittedCardIds.add(cardId);
      }
    }
    const referenced = submittedCardIds.size
      ? await tx.select({ id: cards.id, boardId: cards.boardId }).from(cards).where(inArray(cards.id, [...submittedCardIds]))
      : [];
    if (referenced.some((c) => c.boardId !== board.id)) return { error: jsonError("Card access denied", 403) };

    // Collaboration safety: if a collaborator added a card the client hasn't seen yet,
    // keep it in its current column instead of silently dropping it.
    const afterLayout: Layout = (newColumns as Layout).map((c) => ({
      id: c.id,
      cardIds: c.cardIds.filter((id, i, arr) => arr.indexOf(id) === i),
    }));
    for (const before of beforeLayout) {
      const missing = before.cardIds.filter((id) => !submittedCardIds.has(id));
      if (missing.length) {
        const target = afterLayout.find((c) => c.id === before.id);
        if (target) target.cardIds.push(...missing);
      }
    }

    const now = new Date();
    for (const [i, col] of afterLayout.entries()) {
      await tx
        .update(columns)
        .set({ cardIds: JSON.stringify(col.cardIds), position: i, updatedAt: now })
        .where(and(eq(columns.id, col.id), eq(columns.boardId, board.id)));
    }
    return { existingById, beforeLayout, afterLayout };
  });
  if ("error" in result) return result.error!;
  const { existingById, beforeLayout, afterLayout } = result;
  // Reorders aren't audited, so signal live viewers explicitly (deduped per request)
  broadcastBoardChanged(board.id);

  // Audit + notify on cards that changed column
  const moves = detectCardMoves(beforeLayout, afterLayout);
  if (moves.length) {
    const movedCards = await db.select().from(cards).where(inArray(cards.id, moves.map((m) => m.cardId)));
    const cardMap = new Map(movedCards.map((c) => [c.id, c]));
    for (const move of moves) {
      const card = cardMap.get(move.cardId);
      if (!card) continue;
      const from = existingById.get(move.fromColumnId)?.title ?? "?";
      const to = existingById.get(move.toColumnId)?.title ?? "?";
      await logAudit({
        actor: user,
        action: "card.moved",
        entityType: "card",
        entityId: card.id,
        boardId: board.id,
        summary: `Moved "${card.title}" from ${from} to ${to}`,
        metadata: { fromColumnId: move.fromColumnId, toColumnId: move.toColumnId, from, to },
        request,
      });
      notifyCardMoved(card, from, to, user);
    }
  }

  return json({ success: true });
});

/**
 * Active cards assigned to the board's owner on their other boards, limited to boards the
 * viewer can also access, with each card's column there.
 */
async function linkedCardsFor(ownerId: string, boardId: string, viewerId: string) {
  const ownerBoards = (await listAccessibleBoards(ownerId)).filter((b) => b.id !== boardId);
  if (ownerBoards.length === 0) return [];
  const viewerBoards = viewerId === ownerId ? ownerBoards : await listAccessibleBoards(viewerId);
  const visible = new Map(viewerBoards.filter((b) => b.id !== boardId).map((b) => [b.id, b]));
  const sourceIds = ownerBoards.map((b) => b.id).filter((id) => visible.has(id));
  if (sourceIds.length === 0) return [];

  const assigned = await db
    .select()
    .from(cards)
    .where(and(eq(cards.assigneeId, ownerId), isNull(cards.archivedAt), inArray(cards.boardId, sourceIds), ne(cards.boardId, boardId)));
  if (assigned.length === 0) return [];

  const label = (id: string) => {
    const b = visible.get(id);
    return b ? cardBoardLabel(b) : "Shared board";
  };
  const sourceBoardIds = [...new Set(assigned.map((c) => c.boardId))];
  const columnOf = new Map<string, string>();
  for (const col of await db.select().from(columns).where(inArray(columns.boardId, sourceBoardIds))) {
    for (const id of JSON.parse(col.cardIds) as string[]) columnOf.set(id, col.title);
  }
  return assigned.map((card) => ({ card, boardName: label(card.boardId), columnTitle: columnOf.get(card.id) ?? null }));
}

async function ownerName(userId: string) {
  return (await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1))[0]?.name ?? null;
}

/**
 * Every board the user can open, merged into one view: columns with the same name are
 * combined (in the order they first appear, your own board first), and each card is
 * labeled with the board it lives on. Cards are moved with POST /api/cards/:id/move.
 */
async function combinedBoard(userId: string) {
  const accessible = await listAccessibleBoards(userId); // own boards first
  const boardIds = accessible.map((b) => b.id);
  const byId = new Map(accessible.map((b) => [b.id, b]));

  const allColumns = boardIds.length
    ? await db.select().from(columns).where(inArray(columns.boardId, boardIds)).orderBy(asc(columns.position))
    : [];
  const merged = new Map<string, { id: string; title: string; cardIds: string[] }>();
  const columnTitleOf = new Map<string, string>();
  for (const boardId of boardIds) {
    for (const col of allColumns.filter((c) => c.boardId === boardId)) {
      const key = columnKey(col.title);
      if (!merged.has(key)) merged.set(key, { id: `${COMBINED_BOARD_ID}:${key}`, title: col.title, cardIds: [] });
      for (const id of JSON.parse(col.cardIds) as string[]) {
        merged.get(key)!.cardIds.push(id);
        columnTitleOf.set(id, col.title);
      }
    }
  }

  const boardCards = boardIds.length
    ? await db.select().from(cards).where(and(inArray(cards.boardId, boardIds), isNull(cards.archivedAt)))
    : [];
  const live = new Set(boardCards.map((c) => c.id));
  for (const col of merged.values()) col.cardIds = col.cardIds.filter((id) => live.has(id));

  const serialized = await serializeCards(boardCards);
  const locks = await getActiveLocks(serialized.map((c) => c.id));

  // Everyone on any of these boards, once each
  const members = new Map<string, Awaited<ReturnType<typeof getBoardParticipants>>[number]>();
  for (const boardId of boardIds) {
    for (const p of await getBoardParticipants(boardId)) if (!members.has(p.id)) members.set(p.id, { ...p, boardRole: "member" });
  }

  return {
    board: { id: COMBINED_BOARD_ID, name: "Everyone", displayName: "Everyone", role: "member" as const, combined: true },
    realtime: null,
    members: [...members.values()],
    columns: [...merged.values()],
    cards: Object.fromEntries(
      serialized.map((c) => {
        const b = byId.get(c.boardId!)!;
        return [
          c.id,
          { ...c, lock: locks.get(c.id) ?? null, linkedFrom: { boardId: c.boardId, boardName: cardBoardLabel(b), columnTitle: columnTitleOf.get(c.id) ?? null } },
        ];
      })
    ),
  };
}
