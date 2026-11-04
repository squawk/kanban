import crypto from "crypto";
import { nanoid } from "nanoid";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, firstRow } from "./db";
import { invitations, users, type UserRole } from "./db/schema";
import { INVITATION_TTL_DAYS } from "./config";
import { createUser, createUserBoard, findUserByEmail } from "./auth";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Create (or replace) a pending invitation. Returns the raw token for the email link. */
export async function createInvitation(email: string, role: UserRole, invitedById: string) {
  const normalized = email.trim().toLowerCase();
  const now = new Date();

  // Revoke any still-pending invites for this address so only the newest link works
  await db.update(invitations)
    .set({ revokedAt: now })
    .where(and(eq(invitations.email, normalized), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));

  const token = crypto.randomBytes(32).toString("hex");
  const id = nanoid();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(invitations)
    .values({ id, email: normalized, role, tokenHash: hashToken(token), invitedById, expiresAt, createdAt: now });

  return { id, token, email: normalized, role, expiresAt };
}

export async function findPendingInvitation(token: string) {
  if (!token || typeof token !== "string") return null;
  return (
    (await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date())
        )
      )
      .limit(1)
      .then(firstRow)) ?? null
  );
}

export async function revokeInvitation(id: string) {
  const invite = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1).then(firstRow);
  if (!invite || invite.acceptedAt || invite.revokedAt) return null;
  await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id));
  return invite;
}

/**
 * Accept an invitation: creates an approved, verified account with the invited role
 * and a default board. Returns null if the token is invalid or the email is taken.
 */
export async function acceptInvitation(token: string, name: string, password: string) {
  const invite = await findPendingInvitation(token);
  if (!invite) return { ok: false as const, error: "This invitation is invalid or has expired." };
  if (await findUserByEmail(invite.email)) {
    return { ok: false as const, error: "An account with this email already exists. Try signing in." };
  }

  // Claim the invitation atomically so a double-submit can't create two accounts
  const now = new Date();
  const claimed = await db
    .update(invitations)
    .set({ acceptedAt: now })
    .where(and(eq(invitations.id, invite.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .returning({ id: invitations.id });
  if (claimed.length === 0) return { ok: false as const, error: "This invitation is invalid or has expired." };

  let user: Awaited<ReturnType<typeof createUser>>;
  try {
    user = await createUser(invite.email, password, name);
  } catch (error) {
    await db.update(invitations).set({ acceptedAt: null }).where(eq(invitations.id, invite.id));
    throw error;
  }
  await db
    .update(users)
    .set({ emailVerified: true, approved: true, role: invite.role, lastLoginAt: now, updatedAt: now })
    .where(eq(users.id, user.id));
  await createUserBoard(user.id);

  return { ok: true as const, user: { ...user, email: invite.email, role: invite.role }, invite };
}

export async function listInvitations() {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      createdAt: invitations.createdAt,
      invitedByName: users.name,
    })
    .from(invitations)
    .leftJoin(users, eq(users.id, invitations.invitedById))
    .orderBy(desc(invitations.createdAt))
    .limit(200);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    invitedByName: r.invitedByName,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    status: r.acceptedAt
      ? ("accepted" as const)
      : r.revokedAt
        ? ("revoked" as const)
        : r.expiresAt.getTime() < now
          ? ("expired" as const)
          : ("pending" as const),
  }));
}
