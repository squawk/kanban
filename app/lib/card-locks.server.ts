/**
 * Card edit locks (leases). Opening a card's edit dialog acquires a lock that the
 * dialog renews every LOCK_RENEW_MS; it expires after LOCK_TTL_MS without renewal, so
 * a closed tab or crashed browser can't keep a card locked.
 *
 * Enforced server-side: card edits and archiving by anyone but the holder get 423.
 */
import { and, eq, gt, inArray, or, lt, sql } from "drizzle-orm";
import { db, firstRow } from "./db";
import { cardLocks, users } from "./db/schema";
import { jsonError } from "./http";

export const LOCK_TTL_MS = 90_000;
export const LOCK_RENEW_MS = 30_000;

export interface LockHolder {
  userId: string;
  name: string;
  expiresAt: string;
}

export type AcquireResult =
  | { ok: true; expiresAt: Date; renewed: boolean }
  | { ok: false; holder: LockHolder };

/**
 * Acquire or renew the lock in one atomic statement. It succeeds when the card is
 * unlocked, the existing lock has expired, it's already ours, or `force` is set
 * (takeover). Returns the current holder otherwise.
 */
export async function acquireCardLock(
  cardId: string,
  userId: string,
  opts: { force?: boolean; now?: Date } = {}
): Promise<AcquireResult & { previousHolderId?: string | null }> {
  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  const before = await db.select().from(cardLocks).where(eq(cardLocks.cardId, cardId)).limit(1).then(firstRow);

  const rows = await db
    .insert(cardLocks)
    .values({ cardId, userId, acquiredAt: now, expiresAt })
    .onConflictDoUpdate({
      target: cardLocks.cardId,
      set: {
        userId,
        expiresAt,
        // Keep the original acquisition time when renewing our own lock
        // (`excluded` is the row being inserted; avoids passing the Date through raw SQL)
        acquiredAt: sql`CASE WHEN ${cardLocks.userId} = excluded.user_id THEN ${cardLocks.acquiredAt} ELSE excluded.acquired_at END`,
      },
      setWhere: opts.force
        ? undefined
        : or(eq(cardLocks.userId, userId), lt(cardLocks.expiresAt, now)),
    })
    .returning({ userId: cardLocks.userId });

  if (rows.length > 0) {
    const active = before && before.expiresAt > now;
    return {
      ok: true,
      expiresAt,
      renewed: !!active && before!.userId === userId,
      previousHolderId: active && before!.userId !== userId ? before!.userId : null,
    };
  }

  const holder = await getActiveLock(cardId, now);
  if (!holder) return acquireCardLock(cardId, userId, opts); // expired between statements; retry
  return { ok: false, holder };
}

/** Release a lock, but only if `userId` holds it. */
export async function releaseCardLock(cardId: string, userId: string) {
  const rows = await db
    .delete(cardLocks)
    .where(and(eq(cardLocks.cardId, cardId), eq(cardLocks.userId, userId)))
    .returning({ cardId: cardLocks.cardId });
  return rows.length > 0;
}

export async function getActiveLock(cardId: string, now = new Date()): Promise<LockHolder | null> {
  const row = await db
    .select({ userId: cardLocks.userId, expiresAt: cardLocks.expiresAt, name: users.name })
    .from(cardLocks)
    .innerJoin(users, eq(users.id, cardLocks.userId))
    .where(and(eq(cardLocks.cardId, cardId), gt(cardLocks.expiresAt, now)))
    .limit(1)
    .then(firstRow);
  return row ? { userId: row.userId, name: row.name, expiresAt: row.expiresAt.toISOString() } : null;
}

/** Active locks for many cards (board view). */
export async function getActiveLocks(cardIds: string[], now = new Date()): Promise<Map<string, LockHolder>> {
  if (cardIds.length === 0) return new Map();
  const rows = await db
    .select({ cardId: cardLocks.cardId, userId: cardLocks.userId, expiresAt: cardLocks.expiresAt, name: users.name })
    .from(cardLocks)
    .innerJoin(users, eq(users.id, cardLocks.userId))
    .where(and(inArray(cardLocks.cardId, cardIds), gt(cardLocks.expiresAt, now)));
  return new Map(rows.map((r) => [r.cardId, { userId: r.userId, name: r.name, expiresAt: r.expiresAt.toISOString() }]));
}

/** Throw 423 Locked if someone other than `userId` holds an active lock on the card. */
export async function assertNotLockedByOther(cardId: string, userId: string) {
  const holder = await getActiveLock(cardId);
  if (holder && holder.userId !== userId) {
    throw jsonError(`${holder.name} is editing this card right now`, 423, { code: "CARD_LOCKED", lock: holder });
  }
}
