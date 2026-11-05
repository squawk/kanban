/**
 * Private cards: only the person who created a private card can see it. Nobody else
 * (not the board owner, not admins) gets its title, notes, comments, or even its id.
 * A private card can't be assigned to anyone.
 *
 * Pure helpers shared by the server routes (and safe to import on the client).
 */

export interface PrivacyFields {
  isPrivate?: boolean | null;
  createdById?: string | null;
}

/** Whether `userId` may see this card at all. */
export function canSeeCard(card: PrivacyFields, userId: string): boolean {
  return !card.isPrivate || (!!card.createdById && card.createdById === userId);
}

/** How a card is named in shared records (audit log, admin export): never a private card's title. */
export function cardRef(card: { title: string; isPrivate?: boolean | null }): string {
  return card.isPrivate ? "a private card" : `"${card.title}"`;
}

/** Field-level changes for the audit log, with values dropped for a private card. */
export function auditChanges<T extends { field: string }>(changes: T[], isPrivate: boolean | null | undefined) {
  return isPrivate ? changes.map((c) => ({ field: c.field })) : changes;
}

/**
 * Put cards the saver couldn't see (other people's private cards) back into a column
 * layout they just saved, as close as possible to where they were: right after the
 * nearest card that preceded them before the save, or at the top if none did.
 */
export function restoreHiddenCards(before: string[], after: string[], hidden: Set<string>): string[] {
  const out = after.filter((id) => !hidden.has(id));
  let anchor: string | null = null; // last visible card seen in `before`
  let insertedAfterAnchor = 0; // hidden cards already placed after that anchor (keeps their order)
  for (const id of before) {
    if (!hidden.has(id)) {
      if (out.includes(id)) {
        anchor = id;
        insertedAfterAnchor = 0;
      }
      continue;
    }
    const at = anchor === null ? insertedAfterAnchor : out.indexOf(anchor) + 1 + insertedAfterAnchor;
    out.splice(at, 0, id);
    insertedAfterAnchor++;
  }
  return out;
}
