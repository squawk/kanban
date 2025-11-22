import crypto from "crypto";
import {
  getFullUser,
  setUserApproved,
  createUserBoard,
  deleteUser,
} from "~/lib/auth";
import { sendApprovalNotificationEmail } from "~/lib/email";

const ADMIN_SECRET = process.env.ADMIN_APPROVAL_SECRET || process.env.SESSION_SECRET;

// Generate HMAC token for approval URL
export function generateApprovalToken(userId: string, action: string): string {
  if (!ADMIN_SECRET) {
    throw new Error("ADMIN_APPROVAL_SECRET or SESSION_SECRET must be configured");
  }
  const data = `${userId}:${action}`;
  return crypto.createHmac("sha256", ADMIN_SECRET).update(data).digest("hex");
}

// Verify HMAC token
function verifyApprovalToken(userId: string, action: string, token: string): boolean {
  if (!ADMIN_SECRET) return false;
  const expectedToken = generateApprovalToken(userId, action);
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
  } catch {
    return false;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Handle GET requests from email links
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const action = url.searchParams.get("action");
  const token = url.searchParams.get("token");

  if (!userId || !action || !token) {
    return new Response(
      generateHtmlResponse("Error", "Missing required parameters.", false),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  if (action !== "approve" && action !== "reject") {
    return new Response(
      generateHtmlResponse("Error", "Invalid action.", false),
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  // Verify the HMAC token
  if (!verifyApprovalToken(userId, action, token)) {
    return new Response(
      generateHtmlResponse("Error", "Invalid or expired approval link.", false),
      { status: 403, headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const user = getFullUser(userId);
    if (!user) {
      return new Response(
        generateHtmlResponse("Error", "User not found.", false),
        { status: 404, headers: { "Content-Type": "text/html" } }
      );
    }

    // Check if already processed
    if (user.approved && action === "approve") {
      return new Response(
        generateHtmlResponse("Already Processed", "This user has already been approved.", true),
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    }

    if (action === "approve") {
      // Approve the user
      setUserApproved(userId, true);

      // Create their board now that they're approved
      createUserBoard(userId);

      // Send notification email
      await sendApprovalNotificationEmail(user.email, user.name, true);

      return new Response(
        generateHtmlResponse(
          "User Approved",
          `${escapeHtml(user.name)} (${escapeHtml(user.email)}) has been approved and notified.`,
          true
        ),
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    } else {
      // Reject the user - send notification then delete
      await sendApprovalNotificationEmail(user.email, user.name, false);

      // Delete the user
      deleteUser(userId);

      return new Response(
        generateHtmlResponse(
          "User Rejected",
          `${escapeHtml(user.name)} (${escapeHtml(user.email)}) has been rejected and their account has been removed.`,
          true
        ),
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    }
  } catch (error) {
    console.error("Approval error:", error);
    return new Response(
      generateHtmlResponse("Error", "Failed to process approval.", false),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}

function generateHtmlResponse(title: string, message: string, success: boolean): string {
  const color = success ? "#10b981" : "#ef4444";
  // Title is controlled by us, message may contain escaped user data
  const safeTitle = escapeHtml(title);
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${safeTitle} - Kanban Board</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f3f4f6;
    }
    .card {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    h1 {
      color: ${color};
      margin-bottom: 16px;
    }
    p {
      color: #4b5563;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${message}</p>
  </div>
</body>
</html>
  `;
}
