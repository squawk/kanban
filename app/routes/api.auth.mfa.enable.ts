import { requireAuth, enableMFA, verifyTOTP } from "~/lib/auth";

// POST /api/auth/mfa/enable - Enable MFA for user (requires TOTP verification)
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { userId } = await requireAuth(request);
    const { secret, code } = await request.json();

    // Validation
    if (!secret || !code) {
      return new Response(
        JSON.stringify({ error: "Secret and verification code are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify the code before enabling
    const isValid = verifyTOTP(secret, code);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Enable MFA
    enableMFA(userId, secret);

    return new Response(
      JSON.stringify({ message: "Two-factor authentication enabled successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("MFA enable error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to enable two-factor authentication" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
