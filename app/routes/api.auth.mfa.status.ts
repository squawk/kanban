import { requireAuth, getFullUser } from "~/lib/auth";

// GET /api/auth/mfa/status - Check if MFA is enabled for current user
export async function loader({ request }: { request: Request }) {
  try {
    const { userId } = await requireAuth(request);

    const user = getFullUser(userId);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        mfaEnabled: user.mfaEnabled || false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("MFA status error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get MFA status" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
