import { findUserByEmail, verifyPassword, getSessionWithResponse } from "~/lib/auth";
import { checkRateLimit, rateLimitResponse, getClientIP, isValidEmail, INPUT_LIMITS } from "~/lib/security";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Rate limiting to prevent brute force attacks
  const clientIP = getClientIP(request);
  const rateLimit = checkRateLimit(clientIP, "auth");
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
    const user = findUserByEmail(email);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Invalid email or password" }),
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
    // Log sanitized error info server-side only
    console.error("Login error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Failed to login" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
