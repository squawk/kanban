import { createUser, findUserByEmail, getSessionWithResponse } from "~/lib/auth";
import { checkRateLimit, rateLimitResponse, getClientIP, isValidEmail, validatePassword, INPUT_LIMITS } from "~/lib/security";

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
    const { email, password, name } = await request.json();

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

    // Check if user already exists (use generic message to prevent user enumeration)
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      // Use same delay as successful registration to prevent timing attacks
      await new Promise(resolve => setTimeout(resolve, 100));
      return new Response(
        JSON.stringify({ error: "Unable to create account. Please try a different email." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create user
    const user = await createUser(email, password, name);

    // Create session
    const response = new Response(
      JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );

    const session = await getSessionWithResponse(request, response);
    session.userId = user.id;
    session.email = user.email;
    session.name = user.name;
    await session.save();

    return response;
  } catch (error) {
    // Log sanitized error info server-side only
    console.error("Registration error:", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "Failed to register" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
