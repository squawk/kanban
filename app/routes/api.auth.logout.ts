import { getSessionWithResponse } from "~/lib/auth";
import { logAudit } from "~/lib/audit.server";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const response = new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    const session = await getSessionWithResponse(request, response);
    if (session.userId) {
      logAudit({
        actor: { id: session.userId, email: session.email ?? "" },
        action: "auth.logout",
        entityType: "auth",
        entityId: session.userId,
        summary: `${session.email ?? session.userId} signed out`,
        request,
      });
    }
    session.destroy();

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to logout" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
