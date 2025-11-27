import { requireAuth, disableMFA, getFullUser, verifyTOTP } from "~/lib/auth";

// POST /api/auth/mfa/disable - Disable MFA for user (requires TOTP verification)
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { userId } = await requireAuth(request);
    const { code } = await request.json();

    // Get user to check current MFA settings
    const user = getFullUser(userId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return new Response(
        JSON.stringify({ error: "Two-factor authentication is not enabled" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validation
    if (!code) {
      return new Response(
        JSON.stringify({ error: "Verification code is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify the code before disabling
    const isValid = verifyTOTP(user.mfaSecret, code);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Disable MFA
    disableMFA(userId);

    return new Response(
      JSON.stringify({ message: "Two-factor authentication disabled successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("MFA disable error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to disable two-factor authentication" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
