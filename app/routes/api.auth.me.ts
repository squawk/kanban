import { getSession, findUserById } from "~/lib/auth";

export async function loader({ request }: { request: Request }) {
  try {
    const session = await getSession(request);

    if (!session.userId) {
      return new Response(
        JSON.stringify({ user: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const user = findUserById(session.userId);
    if (!user) {
      return new Response(
        JSON.stringify({ user: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get user error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get user" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
