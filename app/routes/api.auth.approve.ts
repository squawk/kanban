import {
  getFullUser,
  setUserApproved,
  createUserBoard,
  deleteUser,
} from "~/lib/auth";
import { sendApprovalNotificationEmail } from "~/lib/email";

// Handle GET requests from email links
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const action = url.searchParams.get("action");

  if (!userId || !action) {
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

  try {
    const user = getFullUser(userId);
    if (!user) {
      return new Response(
        generateHtmlResponse("Error", "User not found.", false),
        { status: 404, headers: { "Content-Type": "text/html" } }
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
          `${user.name} (${user.email}) has been approved and notified.`,
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
          `${user.name} (${user.email}) has been rejected and their account has been removed.`,
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
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${title} - Kanban Board</title>
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
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>
  `;
}
