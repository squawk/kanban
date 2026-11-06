import { api, getBoardParticipants, requireCardAccess, requireUser } from "~/lib/access.server";
import { getClient } from "~/lib/clients.server";
import { assertNotLockedByOther } from "~/lib/card-locks.server";
import { getRevision, listRevisions, updateCard } from "~/lib/card-update.server";
import { filterValidTagIds, serializeCards } from "~/lib/board-serialize.server";
import { json, jsonError, readJson } from "~/lib/http";

type Args = { request: Request; params: { cardId: string } };

// GET /api/cards/:cardId/revisions - edit history (newest first)
export const loader = api("load card history", async ({ request, params }: Args) => {
  const user = await requireUser(request);
  const { card } = await requireCardAccess(user, params.cardId);
  return json(await listRevisions(card.id));
});

// POST /api/cards/:cardId/revisions { version, expectedVersion }
// Restore a previous version. Creates a new version, so the restore itself can be undone.
// expectedVersion is the latest version the client saw; if someone saved since, the
// restore is refused (409) rather than silently discarding their change.
export const action = api("restore card version", async ({ request, params }: Args) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);
  const user = await requireUser(request);
  const { card } = await requireCardAccess(user, params.cardId);
  const { version, expectedVersion } = await readJson<{ version?: unknown; expectedVersion?: unknown }>(request);
  if (typeof version !== "number" || !Number.isInteger(version)) return jsonError("version is required", 400);

  // Restoring is an edit: not while someone else has the card open
  await assertNotLockedByOther(card.id, user.id);

  const target = await getRevision(card.id, version);
  if (!target) return jsonError("That version doesn't exist (it may have been pruned)", 404);

  // People and tags may have changed since: keep only what's still valid
  const participants = await getBoardParticipants(card.boardId);
  const assigneeStillMember = !target.assigneeId || participants.some((p) => p.id === target.assigneeId);
  const tagIds = await filterValidTagIds((JSON.parse(target.tags) as { id: string }[]).map((t) => t.id));
  // The client may have been deleted since; archived is fine (it was on the card then)
  const targetClient = target.client ? (JSON.parse(target.client) as { id: string }) : null;
  const clientStillExists = !targetClient || !!(await getClient(targetClient.id));

  const { card: updated, revision, changes } = await updateCard({
    user,
    card,
    request,
    expectedVersion: typeof expectedVersion === "number" ? expectedVersion : undefined,
    restoredFromVersion: version,
    changes: {
      title: target.title,
      notes: target.notes,
      priority: target.priority,
      dueDate: target.dueDate,
      assigneeId: assigneeStillMember ? target.assigneeId : null,
      tagIds,
      clientId: clientStillExists ? (targetClient?.id ?? null) : null,
    },
  });

  return json({
    card: (await serializeCards([updated]))[0],
    revision,
    changed: changes.map((c) => c.field),
    warnings: assigneeStillMember ? [] : ["The assignee from that version is no longer on this board, so the card was left unassigned."],
  });
});
