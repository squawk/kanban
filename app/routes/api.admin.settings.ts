import { api, requireAdmin } from "~/lib/access.server";
import { isEmailConfigured } from "~/lib/email";
import { json, readJson, jsonError } from "~/lib/http";
import { getSignupPolicy, saveSignupPolicy, validateSignupPolicyInput } from "~/lib/settings.server";
import { logAudit } from "~/lib/audit.server";

// GET /api/admin/settings
export const loader = api("load settings", async ({ request }: { request: Request }) => {
  await requireAdmin(request);
  return json({ signup: await getSignupPolicy(), emailConfigured: isEmailConfigured() });
});

// PUT /api/admin/settings { signup: { mode, allowedDomains, requireApproval } }
export const action = api("save settings", async ({ request }: { request: Request }) => {
  if (request.method !== "PUT") return jsonError("Method not allowed", 405);
  const admin = await requireAdmin(request);
  const body = await readJson<{ signup?: unknown }>(request);

  const result = validateSignupPolicyInput(body.signup);
  if (!result.ok) return jsonError(result.error, 400);

  const before = await getSignupPolicy();
  await saveSignupPolicy(result.policy);

  await logAudit({
    actor: admin,
    action: "settings.signup_updated",
    entityType: "settings",
    entityId: "signup_policy",
    summary: `Sign-up policy set to ${result.policy.mode.replace("_", " ")}${
      result.policy.mode === "domain" ? ` (${result.policy.allowedDomains.join(", ")})` : ""
    }, approval ${result.policy.requireApproval ? "required" : "not required"}`,
    metadata: { before, after: result.policy },
    request,
  });

  return json({ signup: result.policy });
});
