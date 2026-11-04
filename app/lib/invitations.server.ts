import crypto from "crypto";
import { nanoid } from "nanoid";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "./db";
import { invitations, users, type UserRole } from "./db/schema";
import { INVITATION_TTL_DAYS } from "./config";
import { createUser, createUserBoard, findUserByEmail } from "./auth";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Create (or replace) a pending invitation. Returns the raw token for the email link. */
export function createInvitation(email: string, role: UserRole, invitedById: string) {
  const normalized = email.trim().toLowerCase();
  const now = new Date();

  // Revoke any still-pending invites for this address so only the newest link works
  db.update(invitations)
    .set({ revokedAt: now })
    .where(and(eq(invitations.email, normalized), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .run();

  const token = crypto.randomBytes(32).toString("hex");
  const id = nanoid();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  db.insert(invitations)
    .values({ id, email: normalized, role, tokenHash: hashToken(token), invitedById, expiresAt, createdAt: now })
    .run();

  return { id, token, email: normalized, role, expiresAt };
}

export function findPendingInvitation(token: string) {
  if (!token || typeof token !== "string") return null;
  return (
    db
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
      .get() ?? null
  );
}

export function revokeInvitation(id: string) {
  const invite = db.select().from(invitations).where(eq(invitations.id, id)).get();
  if (!invite || invite.acceptedAt || invite.revokedAt) return null;
  db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id)).run();
  return invite;
}

/**
 * Accept an invitation: creates an approved, verified account with the invited role
 * and a default board. Returns null if the token is invalid or the email is taken.
 */
export async function acceptInvitation(token: string, name: string, password: string) {
  const invite = findPendingInvitation(token);
  if (!invite) return { ok: false as const, error: "This invitation is invalid or has expired." };
  if (findUserByEmail(invite.email)) {
    return { ok: false as const, error: "An account with this email already exists. Try signing in." };
  }

  const user = await createUser(invite.email, password, name);
  const now = new Date();
  db.update(users)
    .set({ emailVerified: true, approved: true, role: invite.role, lastLoginAt: now, updatedAt: now })
    .where(eq(users.id, user.id))
    .run();
  db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invite.id)).run();
  createUserBoard(user.id);

  return { ok: true as const, user: { ...user, email: invite.email, role: invite.role }, invite };
}

export function listInvitations() {
  const rows = db
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
    .limit(200)
    .all();
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
