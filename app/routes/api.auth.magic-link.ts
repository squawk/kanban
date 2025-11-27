import { createMagicLinkToken, findUserByEmail } from "~/lib/auth";
import { sendMagicLinkEmail } from "~/lib/email";

// POST /api/auth/magic-link - Request a magic link for passwordless login
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { email } = await request.json();

    // Validation
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if user exists
    const user = findUserByEmail(email);
    if (!user) {
      // Don't reveal if user exists - return success anyway
      return new Response(
        JSON.stringify({
          message: "If an account exists with this email, you'll receive a login link shortly."
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return new Response(
        JSON.stringify({
          error: "Please verify your email before logging in. Check your inbox for the verification link.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if account is approved
    if (!user.approved) {
      return new Response(
        JSON.stringify({
          error: "Your account is pending admin approval. You will receive an email once approved.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create magic link token
    const token = createMagicLinkToken(email);

    // Send email
    await sendMagicLinkEmail(email, token);

    return new Response(
      JSON.stringify({
        message: "If an account exists with this email, you'll receive a login link shortly."
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Magic link request error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send magic link" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
