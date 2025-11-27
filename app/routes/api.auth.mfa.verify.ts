import { findUserByEmail, verifyTOTP, getSessionWithResponse } from "~/lib/auth";

// POST /api/auth/mfa/verify - Verify TOTP code during login
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { email, code } = await request.json();

    // Validation
    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: "Email and verification code are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find user
    const user = findUserByEmail(email);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify TOTP code
    const isValid = verifyTOTP(user.mfaSecret, code);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create session
    const response = new Response(
      JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    const session = await getSessionWithResponse(request, response);
    session.userId = user.id;
    session.email = user.email;
    session.name = user.name;
    await session.save();

    return response;
  } catch (error) {
    console.error("MFA verification error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to verify code" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
