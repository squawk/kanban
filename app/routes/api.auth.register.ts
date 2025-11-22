import { checkRateLimit, rateLimitResponse, getClientIP, isValidEmail, validatePassword, INPUT_LIMITS } from "~/lib/security";
import {
  createUser,
  findUserByEmail,
  createEmailVerificationToken,
  verifyRecaptcha,
} from "~/lib/auth";
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

    // Create verification token and send email
    const verificationToken = createEmailVerificationToken(user.id);
    await sendVerificationEmail(email, name, verificationToken);

    // Send admin approval notification
    await sendAdminApprovalEmail(user.id, email, name);

    // Return success - user needs to verify email and wait for approval
    return new Response(
      JSON.stringify({
        message: "Registration successful! Please check your email to verify your account. Your account will also need admin approval before you can log in.",
        requiresVerification: true,
        requiresApproval: true,
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
