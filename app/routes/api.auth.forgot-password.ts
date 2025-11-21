import { findUserByEmail, createPasswordResetToken } from "~/lib/auth";
import { sendPasswordResetEmail } from "~/lib/email";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find user by email
    const user = findUserByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return new Response(
        JSON.stringify({
          message: "If an account exists with this email, you will receive a password reset link.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create reset token and send email
    const resetToken = createPasswordResetToken(user.id);
    await sendPasswordResetEmail(email, user.name, resetToken);

    return new Response(
      JSON.stringify({
        message: "If an account exists with this email, you will receive a password reset link.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
