import { db } from "~/lib/db";
import { boards, users } from "~/lib/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { api, requireAdmin } from "~/lib/access.server";
import { createUserBoard, deleteUser } from "~/lib/auth";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";
import { sendApprovalNotificationEmail } from "~/lib/email";

function activeAdminCount(excludingUserId?: string) {
  const conditions = [eq(users.role, "admin"), eq(users.disabled, false), eq(users.approved, true)];
  if (excludingUserId) conditions.push(ne(users.id, excludingUserId));
  return db.select({ id: users.id }).from(users).where(and(...conditions)).all().length;
}

// GET /api/admin/users
export const loader = api("list users", async ({ request }: { request: Request }) => {
  await requireAdmin(request);
  const rows = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      approved: users.approved,
      emailVerified: users.emailVerified,
      disabled: users.disabled,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .all();

  return json(
    rows.map((u) => ({
      ...u,
      status: u.disabled ? "disabled" : u.approved ? "active" : "pending",
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

// PATCH  { userId, role?, disabled?, approved? }
// DELETE { userId }
export const action = api("update user", async ({ request }: { request: Request }) => {
  const admin = await requireAdmin(request);
  const body = await readJson<{ userId?: string; role?: string; disabled?: boolean; approved?: boolean }>(request);
  if (!body.userId) return jsonError("userId is required", 400);

  const target = db.select().from(users).where(eq(users.id, body.userId)).get();
  if (!target) return jsonError("User not found", 404);
  const isSelf = target.id === admin.id;
  const targetIsActiveAdmin = target.role === "admin" && !target.disabled && target.approved;

  if (request.method === "PATCH") {
    const updates: Partial<typeof users.$inferInsert> = {};
    const events: { action: string; summary: string; metadata?: Record<string, unknown> }[] = [];

    if (body.role !== undefined) {
      if (body.role !== "admin" && body.role !== "member") return jsonError("Invalid role", 400);
      if (body.role !== target.role) {
        if (isSelf) return jsonError("You can't change your own role", 400);
        if (body.role === "member" && targetIsActiveAdmin && activeAdminCount(target.id) === 0) {
          return jsonError("There must be at least one active admin", 400);
        }
        updates.role = body.role;
        events.push({
          action: "user.role_changed",
          summary: `Changed ${target.email} role from ${target.role} to ${body.role}`,
          metadata: { from: target.role, to: body.role },
        });
      }
    }

    if (body.disabled !== undefined && body.disabled !== target.disabled) {
      if (isSelf) return jsonError("You can't disable your own account", 400);
      if (body.disabled && targetIsActiveAdmin && activeAdminCount(target.id) === 0) {
        return jsonError("There must be at least one active admin", 400);
      }
      updates.disabled = !!body.disabled;
      events.push({
        action: body.disabled ? "user.disabled" : "user.enabled",
        summary: `${body.disabled ? "Disabled" : "Re-enabled"} ${target.email}`,
      });
    }

    let approvedNow = false;
    if (body.approved === true && !target.approved) {
      updates.approved = true;
      approvedNow = true;
      events.push({ action: "user.approved", summary: `Approved ${target.email}`, metadata: { via: "admin_ui" } });
    }

    if (events.length === 0) return json({ success: true, unchanged: true });

    db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, target.id)).run();
    if (approvedNow) {
      createUserBoard(target.id);
      void sendApprovalNotificationEmail(target.email, target.name, true);
    }
    for (const e of events) {
      logAudit({ actor: admin, entityType: "user", entityId: target.id, request, ...e });
    }
    return json({ success: true });
  }

  if (request.method === "DELETE") {
    if (isSelf) return jsonError("You can't delete your own account", 400);
    if (targetIsActiveAdmin && activeAdminCount(target.id) === 0) {
      return jsonError("There must be at least one active admin", 400);
    }
    const ownedBoards = db.select({ id: boards.id }).from(boards).where(eq(boards.userId, target.id)).all().length;
    const wasPending = !target.approved;

    deleteUser(target.id); // cascades to their board(s), memberships, tokens
    if (wasPending) void sendApprovalNotificationEmail(target.email, target.name, false);

    logAudit({
      actor: admin,
      action: wasPending ? "user.rejected" : "user.deleted",
      entityType: "user",
      entityId: target.id,
      summary: `${wasPending ? "Rejected" : "Deleted"} ${target.name} <${target.email}>`,
      metadata: { email: target.email, ownedBoardsDeleted: ownedBoards, via: "admin_ui" },
      request,
    });
    return json({ success: true });
  }

  return jsonError("Method not allowed", 405);
});
