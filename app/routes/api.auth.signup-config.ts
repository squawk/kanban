import { getSignupPolicy } from "~/lib/settings.server";
import { json } from "~/lib/http";

// GET /api/auth/signup-config - public: tells the login page whether sign-up is open
export async function loader() {
  const policy = await getSignupPolicy();
  return json({
    mode: policy.mode,
    // Only reveal allowed domains when domain-restricted (helps users pick the right email)
    allowedDomains: policy.mode === "domain" ? policy.allowedDomains : [],
    requireApproval: policy.requireApproval,
  });
}
