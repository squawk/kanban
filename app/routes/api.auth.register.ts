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

  try {
    const { email, password, name, recaptchaToken } = await request.json();

    // Validation
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Email, password, and name are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
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
      return new Response(
        JSON.stringify({ error: "Email already registered" }),
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
    console.error("Registration error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to register" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
