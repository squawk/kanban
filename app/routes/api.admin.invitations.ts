import { api, requireAdmin } from "~/lib/access.server";
import { findUserByEmail } from "~/lib/auth";
import { getAppUrl } from "~/lib/config";
import { isEmailConfigured, sendInvitationEmail } from "~/lib/email";
import { json, jsonError, readJson } from "~/lib/http";
import { createInvitation, listInvitations, revokeInvitation } from "~/lib/invitations.server";
import { isValidEmail } from "~/lib/security";
import { logAudit } from "~/lib/audit.server";

// GET /api/admin/invitations
export const loader = api("list invitations", async ({ request }: { request: Request }) => {
  await requireAdmin(request);
  return json(await listInvitations());
});

// POST   { email, role } - invite (or re-send to) someone
// DELETE { id }          - revoke a pending invitation
export const action = api("update invitations", async ({ request }: { request: Request }) => {
  const admin = await requireAdmin(request);
  const body = await readJson<{ email?: string; role?: string; id?: string }>(request);

  if (request.method === "POST") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role === "admin" ? "admin" : "member";
    if (!isValidEmail(email)) return jsonError("Enter a valid email address", 400);
    if (await findUserByEmail(email)) return jsonError("A user with that email already exists", 409);

    const invite = await createInvitation(email, role, admin.id);
    const sent = await sendInvitationEmail({
      email,
      inviterName: admin.name,
      token: invite.token,
      expiresAt: invite.expiresAt,
    });

    await logAudit({
      actor: admin,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invite.id,
      summary: `Invited ${email} as ${role}`,
      metadata: { email, role, emailSent: sent },
      request,
    });

    return json(
      {
        id: invite.id,
        email,
        role,
        expiresAt: invite.expiresAt.toISOString(),
        emailSent: sent,
        // Returned once so the admin can share the link manually if email isn't configured
        inviteUrl: `${getAppUrl()}/accept-invite?token=${invite.token}`,
        emailConfigured: isEmailConfigured(),
      },
      201
    );
  }

  if (request.method === "DELETE") {
    if (!body.id) return jsonError("id is required", 400);
    const invite = await revokeInvitation(body.id);
    if (!invite) return jsonError("Invitation not found or no longer pending", 404);
    await logAudit({
      actor: admin,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invite.id,
      summary: `Revoked invitation for ${invite.email}`,
      metadata: { email: invite.email },
      request,
    });
    return json({ success: true });
  }

  return jsonError("Method not allowed", 405);
});
