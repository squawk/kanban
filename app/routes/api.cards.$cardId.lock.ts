import { api, requireCardAccess, requireUser } from "~/lib/access.server";
import { cardRef } from "~/lib/card-privacy";
import { acquireCardLock, LOCK_RENEW_MS, LOCK_TTL_MS, releaseCardLock } from "~/lib/card-locks.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";
import { broadcastBoardChanged } from "~/lib/realtime.server";

type Args = { request: Request; params: { cardId: string } };

// POST   /api/cards/:cardId/lock  { force?: boolean }  acquire or renew (force = take over; board owner only)
// DELETE /api/cards/:cardId/lock                       release (holder only)
export const action = api("update card lock", async ({ request, params }: Args) => {
  const user = await requireUser(request);
  const { card, role } = await requireCardAccess(user, params.cardId);

  if (request.method === "POST") {
    const { force } = await readJson<{ force?: boolean }>(request);
    if (force && role !== "owner") return jsonError("Only the board owner can take over editing", 403);

    const result = await acquireCardLock(card.id, user.id, { force: !!force });
    if (!result.ok) {
      return jsonError(`${result.holder.name} is editing this card right now`, 409, {
        code: "CARD_LOCKED",
        lock: result.holder,
        canTakeOver: role === "owner",
      });
    }

    if (result.previousHolderId) {
      await logAudit({
        actor: user,
        action: "card.lock_taken_over",
        entityType: "card",
        entityId: card.id,
        boardId: card.boardId,
        summary: `Took over editing ${cardRef(card)}`,
        metadata: { previousHolderId: result.previousHolderId },
        request,
      });
    } else if (!result.renewed) {
      broadcastBoardChanged(card.boardId); // show the lock to others; renewals stay quiet
    }

    return json({ locked: true, expiresAt: result.expiresAt.toISOString(), ttlMs: LOCK_TTL_MS, renewMs: LOCK_RENEW_MS });
  }

  if (request.method === "DELETE") {
    const released = await releaseCardLock(card.id, user.id);
    if (released) broadcastBoardChanged(card.boardId);
    return json({ released });
  }

  return jsonError("Method not allowed", 405);
});
