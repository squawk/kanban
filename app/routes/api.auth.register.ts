import { createUser, findUserByEmail, getSessionWithResponse } from "~/lib/auth";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
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

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return new Response(
        JSON.stringify({ error: "Email already registered" }),
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
    console.error("Registration error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to register" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
