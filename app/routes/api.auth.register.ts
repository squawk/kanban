import { checkRateLimit, rateLimitResponse, getClientIP, isValidEmail, validatePassword, INPUT_LIMITS } from "~/lib/security";
import {
  createUser,
  findUserByEmail,
  createEmailVerificationToken,
  verifyRecaptcha,
  setUserApproved,
  createUserBoard,
  getAdminRecipientEmails,
} from "~/lib/auth";
import { getSignupPolicy } from "~/lib/settings.server";
import { checkSignupAllowed } from "~/lib/signup-policy";
import { logAudit } from "~/lib/audit.server";
import { isBootstrapAdminEmail } from "~/lib/config";
import {
  sendVerificationEmail,
  sendAdminApprovalEmail,
} from "~/lib/email";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Rate limiting to prevent registration spam
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, "auth");
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfter!);
  }

  try {
    const { email, password, name, recaptchaToken } = await request.json();

    // Validation
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Email, password, and name are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Email format validation
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Name length validation
    if (name.length > INPUT_LIMITS.name) {
      return new Response(
        JSON.stringify({ error: `Name must be ${INPUT_LIMITS.name} characters or less` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Strong password validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ error: passwordValidation.error }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Enforce the sign-up policy (open / allowed domains / invite only)
    // ADMIN_EMAIL addresses can always register so a fresh install can't lock itself out
    const isBootstrapAdmin = isBootstrapAdminEmail(email);
    const signupCheck = isBootstrapAdmin
      ? ({ allowed: true, autoApprove: true } as const)
      : checkSignupAllowed(email, getSignupPolicy());
    if (!signupCheck.allowed) {
      logAudit({
        action: "auth.signup_blocked",
        entityType: "auth",
        summary: `Blocked sign-up for ${String(email).toLowerCase()} (${signupCheck.reason})`,
        metadata: { email: String(email).toLowerCase(), reason: signupCheck.reason },
        request,
      });
      return new Response(
        JSON.stringify({ error: signupCheck.message, code: "SIGNUP_RESTRICTED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify reCAPTCHA
    if (recaptchaToken) {
      const isValidCaptcha = await verifyRecaptcha(recaptchaToken);
      if (!isValidCaptcha) {
        return new Response(
          JSON.stringify({ error: "reCAPTCHA verification failed. Please try again." }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Check if user already exists
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      // Use same delay as successful registration to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 100));
      return new Response(
        JSON.stringify({ error: "Unable to create account. Please try a different email." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create user (not verified or approved yet)
    const user = await createUser(email, password, name);
    const autoApprove = signupCheck.autoApprove;

    if (autoApprove) {
      setUserApproved(user.id, true);
      createUserBoard(user.id);
    }

    logAudit({
      actor: { id: user.id, email: user.email },
      action: "user.registered",
      entityType: "user",
      entityId: user.id,
      summary: `${name} <${user.email}> signed up${autoApprove ? " (auto-approved)" : " (pending approval)"}`,
      metadata: { autoApproved: autoApprove },
      request,
    });

    // Create verification token and send email
    const verificationToken = createEmailVerificationToken(user.id);
    await sendVerificationEmail(email, name, verificationToken);

    // Ask admins to approve the account
    if (!autoApprove) {
      const adminEmails = getAdminRecipientEmails();
      await sendAdminApprovalEmail(user.id, email, name, adminEmails.length ? adminEmails : undefined);
    }

    // Return success - user needs to verify email (and possibly wait for approval)
    return new Response(
      JSON.stringify({
        message: autoApprove
          ? "Registration successful! Please check your email to verify your account, then sign in."
          : "Registration successful! Please check your email to verify your account. Your account will also need admin approval before you can log in.",
        requiresVerification: true,
        requiresApproval: !autoApprove,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Log sanitized error info server-side only
    console.error("Registration error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Failed to register" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
