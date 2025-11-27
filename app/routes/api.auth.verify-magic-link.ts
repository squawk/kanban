import { verifyMagicLinkToken, findUserByEmail, getSessionWithResponse } from "~/lib/auth";

// POST /api/auth/verify-magic-link - Verify magic link token and create session
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { token } = await request.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify token
    const result = verifyMagicLinkToken(token);
    if (!result) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired link" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user
    const user = findUserByEmail(result.email);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Double-check verification and approval status
    if (!user.emailVerified) {
      return new Response(
        JSON.stringify({ error: "Email not verified" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!user.approved) {
      return new Response(
        JSON.stringify({ error: "Account not approved" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create session
    const response = new Response(
      JSON.stringify({
        message: "Login successful",
        user: { id: user.id, email: user.email, name: user.name },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    const session = await getSessionWithResponse(request, response);
    session.userId = user.id;
    session.email = user.email;
    session.name = user.name;
    await session.save();

    return response;
  } catch (error) {
    console.error("Magic link verification error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to verify magic link" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
