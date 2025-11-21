import { verifyPasswordResetToken, updatePassword, getFullUser } from "~/lib/auth";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return new Response(
        JSON.stringify({ error: "Token and password are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify the token
    const result = verifyPasswordResetToken(token);
    if (!result) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired reset token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update the password
    await updatePassword(result.userId, password);

    // Get user info
    const user = getFullUser(result.userId);

    return new Response(
      JSON.stringify({
        message: "Password reset successfully!",
        email: user?.email,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Password reset error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to reset password" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
