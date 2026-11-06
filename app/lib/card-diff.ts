/**
 * Compute a human-readable diff between two versions of a card for the audit trail.
 * Pure so it can be unit tested.
 */

export interface CardSnapshot {
  title: string;
  notes: string;
  priority: string;
  dueDate: Date | string | null | undefined;
  assigneeId?: string | null;
  tagIds?: string[];
  /** The card's client (compared by id, recorded by name) */
  client?: { id: string; name: string } | null;
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

function normDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function diffCard(before: CardSnapshot, after: CardSnapshot): FieldChange[] {
  const changes: FieldChange[] = [];
  if (before.title !== after.title) changes.push({ field: "title", from: before.title, to: after.title });
  if (before.notes !== after.notes) {
    // Notes can be long; record only that they changed plus their lengths.
    changes.push({ field: "notes", from: `${before.notes.length} chars`, to: `${after.notes.length} chars` });
  }
  if (before.priority !== after.priority) changes.push({ field: "priority", from: before.priority, to: after.priority });
  const bd = normDate(before.dueDate);
  const ad = normDate(after.dueDate);
  if (bd !== ad) changes.push({ field: "dueDate", from: bd, to: ad });
  if ((before.assigneeId ?? null) !== (after.assigneeId ?? null)) {
    changes.push({ field: "assigneeId", from: before.assigneeId ?? null, to: after.assigneeId ?? null });
  }
  if (before.client !== undefined && after.client !== undefined && (before.client?.id ?? null) !== (after.client?.id ?? null)) {
    changes.push({ field: "client", from: before.client?.name ?? null, to: after.client?.name ?? null });
  }
  if (before.tagIds && after.tagIds) {
    const b = [...before.tagIds].sort();
    const a = [...after.tagIds].sort();
    if (b.join(",") !== a.join(",")) changes.push({ field: "tags", from: b, to: a });
  }
  return changes;
}

/** Map cardId -> columnId from a list of columns. */
export function cardColumnIndex(columns: { id: string; cardIds: string[] }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const col of columns) for (const id of col.cardIds) map.set(id, col.id);
  return map;
}

/** Cards whose column changed between two board layouts. */
export function detectCardMoves(
  before: { id: string; cardIds: string[] }[],
  after: { id: string; cardIds: string[] }[]
): { cardId: string; fromColumnId: string; toColumnId: string }[] {
  const b = cardColumnIndex(before);
  const a = cardColumnIndex(after);
  const moves: { cardId: string; fromColumnId: string; toColumnId: string }[] = [];
  for (const [cardId, toColumnId] of a) {
    const fromColumnId = b.get(cardId);
    if (fromColumnId && fromColumnId !== toColumnId) moves.push({ cardId, fromColumnId, toColumnId });
  }
  return moves;
}
