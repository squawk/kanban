/**
 * The single path for changing a card's editable fields (used by edits and by
 * restoring a past version), so history, audit, notifications and live updates
 * always stay consistent.
 *
 * Every change is recorded in card_revisions as a full snapshot. Cards from before
 * history existed get a baseline revision (their prior state) on their first edit.
 */
import { and, desc, eq, lte, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, firstRow, type Database } from "./db";
import { cardRevisions, cards, cardTags, tags, users, type Card, type CardRevision } from "./db/schema";
import { diffCard, type FieldChange } from "./card-diff";
import { logAudit } from "./audit.server";
import { notifyCardAssigned } from "./notifications.server";
import { broadcastBoardChanged } from "./realtime.server";
import { jsonError } from "./http";
import type { AuthUser } from "./access.server";
import { auditChanges, cardRef } from "./card-privacy";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Revisions kept per card; older ones are pruned. */
export const MAX_REVISIONS_PER_CARD = 200;

export interface CardChanges {
  title?: string;
  notes?: string;
  priority?: string;
  dueDate?: Date | null;
  assigneeId?: string | null;
  /** Already validated tag ids */
  tagIds?: string[];
  generatedPrompt?: string;
  /** Only the creator may change this (checked by the caller); a private card is never assigned */
  isPrivate?: boolean;
}

interface Snapshot {
  title: string;
  notes: string;
  priority: string;
  dueDate: Date | null;
  assigneeId: string | null;
  tags: { id: string; name: string; color: string }[];
}

async function tagsFor(tx: Tx, cardId: string) {
  return tx
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(cardTags)
    .innerJoin(tags, eq(tags.id, cardTags.tagId))
    .where(eq(cardTags.cardId, cardId));
}

function snapshotOf(card: Card, cardTagRows: Snapshot["tags"]): Snapshot {
  return {
    title: card.title,
    notes: card.notes,
    priority: card.priority,
    dueDate: card.dueDate ?? null,
    assigneeId: card.assigneeId ?? null,
    tags: [...cardTagRows].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

async function insertRevision(
  tx: Tx,
  cardId: string,
  version: number,
  snap: Snapshot,
  meta: { changedFields: string[]; actor: { id: string; name: string } | null; restoredFromVersion?: number | null; at: Date }
) {
  await tx.insert(cardRevisions).values({
    id: nanoid(),
    cardId,
    version,
    title: snap.title,
    notes: snap.notes,
    priority: snap.priority,
    dueDate: snap.dueDate,
    assigneeId: snap.assigneeId,
    tags: JSON.stringify(snap.tags),
    changedFields: JSON.stringify(meta.changedFields),
    actorId: meta.actor?.id ?? null,
    actorName: meta.actor?.name ?? null,
    restoredFromVersion: meta.restoredFromVersion ?? null,
    createdAt: meta.at,
  });
}

/** Record version 1 for a newly created card (call inside the creating transaction). */
export async function recordInitialRevision(tx: Tx, card: Card, actor: { id: string; name: string }) {
  await insertRevision(tx, card.id, 1, snapshotOf(card, await tagsFor(tx, card.id)), {
    changedFields: [],
    actor,
    at: card.createdAt,
  });
}

async function latestVersion(tx: Tx | Database, cardId: string): Promise<number> {
  const row = await tx
    .select({ v: max(cardRevisions.version) })
    .from(cardRevisions)
    .where(eq(cardRevisions.cardId, cardId))
    .then(firstRow);
  return row?.v ?? 0;
}

async function userName(id: string | null): Promise<string> {
  if (!id) return "nobody";
  return (await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1).then(firstRow))?.name ?? "a former member";
}

export interface UpdateResult {
  card: Card;
  changes: FieldChange[];
  /** The version created by this update, and the one before it (for undo); null if nothing tracked changed */
  revision: { version: number; previousVersion: number } | null;
}

/**
 * Apply changes to a card. Throws a 409 Response when `expectedVersion` is given and
 * the card has moved on (someone else saved in between).
 */
export async function updateCard(opts: {
  user: AuthUser;
  card: Card;
  changes: CardChanges;
  request?: Request;
  expectedVersion?: number;
  restoredFromVersion?: number;
}): Promise<UpdateResult> {
  const { user, card, changes, request, expectedVersion, restoredFromVersion } = opts;
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    // Serialize concurrent updates of this card so versions can't collide
    const current = (await tx.select().from(cards).where(eq(cards.id, card.id)).for("update").then(firstRow))!;
    let version = await latestVersion(tx, card.id);
    if (expectedVersion !== undefined && expectedVersion !== version) {
      throw jsonError("This card was changed by someone else since you opened it. Reload it to see their changes.", 409, {
        code: "CARD_VERSION_CONFLICT",
        currentVersion: version,
      });
    }

    const before = snapshotOf(current, await tagsFor(tx, card.id));
    // A private card can't be assigned, including by restoring a version that had an assignee
    const willBePrivate = changes.isPrivate ?? current.isPrivate;

    await tx
      .update(cards)
      .set({
        ...(changes.title !== undefined && { title: changes.title }),
        ...(changes.notes !== undefined && { notes: changes.notes }),
        ...(changes.generatedPrompt !== undefined && { generatedPrompt: changes.generatedPrompt }),
        ...(changes.dueDate !== undefined && { dueDate: changes.dueDate }),
        ...(changes.priority !== undefined && { priority: changes.priority }),
        ...(changes.assigneeId !== undefined && { assigneeId: changes.assigneeId || null }),
        ...(changes.isPrivate !== undefined && { isPrivate: changes.isPrivate }),
        ...(willBePrivate && { assigneeId: null }),
        updatedAt: now,
      })
      .where(eq(cards.id, card.id));

    if (changes.tagIds !== undefined) {
      await tx.delete(cardTags).where(eq(cardTags.cardId, card.id));
      for (const tagId of changes.tagIds) await tx.insert(cardTags).values({ cardId: card.id, tagId, createdAt: now });
    }

    const updated = (await tx.select().from(cards).where(eq(cards.id, card.id)).then(firstRow))!;
    const after = snapshotOf(updated, await tagsFor(tx, card.id));
    const fieldChanges = diffCard(
      { ...before, tagIds: before.tags.map((t) => t.id) },
      { ...after, tagIds: after.tags.map((t) => t.id) }
    );

    let revision: UpdateResult["revision"] = null;
    if (fieldChanges.length > 0) {
      if (version === 0) {
        // First tracked change to a card from before history existed: keep its prior state
        await insertRevision(tx, card.id, 1, before, { changedFields: [], actor: null, at: current.updatedAt });
        version = 1;
      }
      await insertRevision(tx, card.id, version + 1, after, {
        changedFields: fieldChanges.map((c) => c.field),
        actor: { id: user.id, name: user.name },
        restoredFromVersion,
        at: now,
      });
      revision = { version: version + 1, previousVersion: version };
      // Bound storage per card
      await tx
        .delete(cardRevisions)
        .where(and(eq(cardRevisions.cardId, card.id), lte(cardRevisions.version, version + 1 - MAX_REVISIONS_PER_CARD)));
    }
    return { updated, fieldChanges, revision, before, wasPrivate: current.isPrivate };
  });

  const { updated, fieldChanges, revision, before, wasPrivate } = result;
  const ref = cardRef(updated);

  if (wasPrivate !== updated.isPrivate) {
    await logAudit({
      actor: user,
      action: updated.isPrivate ? "card.made_private" : "card.made_public",
      entityType: "card",
      entityId: card.id,
      boardId: card.boardId,
      summary: updated.isPrivate ? "Made a card private" : `Made ${ref} visible to the board`,
      metadata: {},
      request,
    });
  }
  broadcastBoardChanged(card.boardId); // also covers edits the audit log skips (e.g. AI prompt)

  if (restoredFromVersion !== undefined && revision) {
    await logAudit({
      actor: user,
      action: "card.version_restored",
      entityType: "card",
      entityId: card.id,
      boardId: card.boardId,
      summary: `Restored ${ref} to version ${restoredFromVersion}`,
      metadata: { restoredFromVersion, newVersion: revision.version, changes: auditChanges(fieldChanges, updated.isPrivate) },
      request,
    });
  } else {
    const nonAssign = fieldChanges.filter((c) => c.field !== "assigneeId");
    if (nonAssign.length) {
      await logAudit({
        actor: user,
        action: "card.updated",
        entityType: "card",
        entityId: card.id,
        boardId: card.boardId,
        summary: `Updated ${nonAssign.map((c) => c.field).join(", ")} on ${ref}`,
        metadata: { changes: auditChanges(nonAssign, updated.isPrivate), version: revision?.version },
        request,
      });
    }
  }

  const prevAssignee = before.assigneeId;
  const nextAssignee = updated.assigneeId ?? null;
  if (prevAssignee !== nextAssignee) {
    if (restoredFromVersion === undefined) {
      await logAudit({
        actor: user,
        action: nextAssignee ? "card.assigned" : "card.unassigned",
        entityType: "card",
        entityId: card.id,
        boardId: card.boardId,
        summary: nextAssignee
          ? `Assigned ${ref} to ${await userName(nextAssignee)}`
          : `Unassigned ${ref} (was ${await userName(prevAssignee)})`,
        metadata: { from: prevAssignee, to: nextAssignee },
        request,
      });
    }
    if (nextAssignee) notifyCardAssigned(updated, nextAssignee, user);
  }

  return { card: updated, changes: fieldChanges, revision };
}

export function serializeRevision(r: CardRevision) {
  return {
    id: r.id,
    version: r.version,
    title: r.title,
    notes: r.notes,
    priority: r.priority,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    assigneeId: r.assigneeId,
    tags: JSON.parse(r.tags) as Snapshot["tags"],
    changedFields: JSON.parse(r.changedFields) as string[],
    actor: r.actorId ? { id: r.actorId, name: r.actorName ?? "Unknown" } : null,
    restoredFromVersion: r.restoredFromVersion,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listRevisions(cardId: string, limit = 50) {
  const rows = await db
    .select()
    .from(cardRevisions)
    .where(eq(cardRevisions.cardId, cardId))
    .orderBy(desc(cardRevisions.version))
    .limit(limit);
  return rows.map(serializeRevision);
}

export async function getRevision(cardId: string, version: number) {
  return db
    .select()
    .from(cardRevisions)
    .where(and(eq(cardRevisions.cardId, cardId), eq(cardRevisions.version, version)))
    .limit(1)
    .then(firstRow);
}

