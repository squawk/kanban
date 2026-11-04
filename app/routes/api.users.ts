import { db } from "~/lib/db";
import { users } from "~/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { api, requireUser } from "~/lib/access.server";
import { json } from "~/lib/http";

// GET /api/users - Directory of active users (for sharing boards / assigning work)
export const loader = api("list users", async ({ request }: { request: Request }) => {
  await requireUser(request);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.approved, true), eq(users.disabled, false)))
    .orderBy(asc(users.name));
  return json(rows);
});
