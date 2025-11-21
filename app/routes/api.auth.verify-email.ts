import { verifyEmailToken, setEmailVerified, getFullUser } from "~/lib/auth";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { token } = await request.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Verification token is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify the token
    const result = verifyEmailToken(token);
    if (!result) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification token" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark email as verified
    setEmailVerified(result.userId, true);

    // Get user to check approval status
    const user = getFullUser(result.userId);

    return new Response(
      JSON.stringify({
        message: "Email verified successfully!",
        approved: user?.approved ?? false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Email verification error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to verify email" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Also handle GET requests for clicking links in emails
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  // Redirect to the verify-email page with the token
  return new Response(null, {
    status: 302,
    headers: { Location: `/verify-email?token=${token}` },
  });
}
