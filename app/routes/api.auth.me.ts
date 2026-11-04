import { getSession, findUserById } from "~/lib/auth";
import { db } from "~/lib/db";
import { users } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { api, requireUser } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { logAudit } from "~/lib/audit.server";

// GET /api/auth/me - current user (or null)
export async function loader({ request }: { request: Request }) {
  try {
    const session = await getSession(request);

    if (!session.userId) {
      return json({ user: null });
    }

    const user = findUserById(session.userId);
    if (!user || user.disabled || !user.approved) {
      return json({ user: null });
    }

    return json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailNotifications: user.emailNotifications,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return jsonError("Failed to get user", 500);
  }
}

// PATCH /api/auth/me - update own preferences
export const action = api("update preferences", async ({ request }: { request: Request }) => {
  if (request.method !== "PATCH") return jsonError("Method not allowed", 405);
  const user = await requireUser(request);
  const body = await readJson<{ emailNotifications?: unknown }>(request);

  if (typeof body.emailNotifications !== "boolean") {
    return jsonError("emailNotifications must be a boolean", 400);
  }

  db.update(users)
    .set({ emailNotifications: body.emailNotifications, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .run();

  logAudit({
    actor: user,
    action: "user.preferences_updated",
    entityType: "user",
    entityId: user.id,
    summary: `${user.email} turned email notifications ${body.emailNotifications ? "on" : "off"}`,
    metadata: { emailNotifications: body.emailNotifications },
    request,
  });

  return json({ emailNotifications: body.emailNotifications });
});
