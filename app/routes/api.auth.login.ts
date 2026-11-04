import { findUserByEmail, verifyPassword, getSessionWithResponse } from "~/lib/auth";
import { db } from "~/lib/db";
import { users } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "~/lib/audit.server";
import { isBootstrapAdminEmail } from "~/lib/config";
import { checkRateLimit, rateLimitResponse, getClientIP, isValidEmail, INPUT_LIMITS } from "~/lib/security";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Rate limiting to prevent brute force attacks
  const clientIP = getClientIP(request);
  const rateLimit = await checkRateLimit(clientIP, "auth");
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfter!);
  }

  try {
    const { email, password } = await request.json();

    // Validation
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Input validation
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (password.length > INPUT_LIMITS.password) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find user
    const user = await findUserByEmail(email);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await logAudit({
        actor: { id: user.id, email: user.email },
        action: "auth.login_failed",
        entityType: "auth",
        entityId: user.id,
        summary: `Failed sign-in for ${user.email}`,
        request,
      });
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Disabled accounts cannot sign in (same message as bad credentials to avoid enumeration)
    if (user.disabled) {
      await logAudit({
        actor: { id: user.id, email: user.email },
        action: "auth.login_blocked",
        entityType: "auth",
        entityId: user.id,
        summary: `Sign-in blocked for disabled account ${user.email}`,
        request,
      });
      return new Response(
        JSON.stringify({ error: "This account has been disabled. Contact an administrator." , code: "ACCOUNT_DISABLED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return new Response(
        JSON.stringify({
          error: "Please verify your email before logging in. Check your inbox for the verification link.",
          code: "EMAIL_NOT_VERIFIED",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if account is approved
    if (!user.approved) {
      return new Response(
        JSON.stringify({
          error: "Your account is pending admin approval. You will receive an email once approved.",
          code: "ACCOUNT_NOT_APPROVED",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Promote ADMIN_EMAIL addresses that signed up before being configured as admins
    const promote = isBootstrapAdminEmail(user.email) && user.role !== "admin";
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), ...(promote && { role: "admin" as const }) })
      .where(eq(users.id, user.id));
    if (promote) user.role = "admin";
    await logAudit({
      actor: { id: user.id, email: user.email },
      action: "auth.login",
      entityType: "auth",
      entityId: user.id,
      summary: `${user.email} signed in`,
      request,
    });

    // Create session
    const response = new Response(
      JSON.stringify({ user: { id: user.id, email: user.email, name: user.name, role: user.role } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    const session = await getSessionWithResponse(request, response);
    session.userId = user.id;
    session.email = user.email;
    session.name = user.name;
    await session.save();

    return response;
  } catch (error) {
    // Log sanitized error info server-side only
    console.error("Login error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Failed to login" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
