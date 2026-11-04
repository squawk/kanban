import { getSessionWithResponse } from "~/lib/auth";
import { acceptInvitation, findPendingInvitation } from "~/lib/invitations.server";
import { checkRateLimit, getClientIP, INPUT_LIMITS, rateLimitResponse, validatePassword } from "~/lib/security";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";

// GET /api/auth/accept-invite?token=... - check an invitation before showing the form
export async function loader({ request }: { request: Request }) {
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, "api");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfter!);

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const invite = findPendingInvitation(token);
  if (!invite) return jsonError("This invitation is invalid or has expired.", 404);
  return json({ email: invite.email, role: invite.role, expiresAt: invite.expiresAt.toISOString() });
}

// POST /api/auth/accept-invite - create the account and sign in
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, "auth");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfter!);

  try {
    const { token, name, password } = await readJson<{ token?: string; name?: string; password?: string }>(request);
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!token || !trimmedName || !password) return jsonError("Name and password are required", 400);
    if (trimmedName.length > INPUT_LIMITS.name) {
      return jsonError(`Name must be ${INPUT_LIMITS.name} characters or less`, 400);
    }
    const pw = validatePassword(password);
    if (!pw.valid) return jsonError(pw.error!, 400);

    const result = await acceptInvitation(token, trimmedName, password);
    if (!result.ok) return jsonError(result.error, 400);

    logAudit({
      actor: { id: result.user.id, email: result.user.email },
      action: "invitation.accepted",
      entityType: "invitation",
      entityId: result.invite.id,
      summary: `${trimmedName} <${result.user.email}> accepted an invitation (${result.user.role})`,
      metadata: { userId: result.user.id, role: result.user.role },
      request,
    });

    const response = json(
      { user: { id: result.user.id, email: result.user.email, name: trimmedName, role: result.user.role } },
      201
    );
    const session = await getSessionWithResponse(request, response);
    session.userId = result.user.id;
    session.email = result.user.email;
    session.name = trimmedName;
    await session.save();
    return response;
  } catch (error) {
    console.error("Accept invite error:", error instanceof Error ? error.message : error);
    return jsonError("Failed to accept invitation", 500);
  }
}
