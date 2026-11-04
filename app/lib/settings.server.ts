import { db, firstRow } from "./db";
import { appSettings } from "./db/schema";
import { eq } from "drizzle-orm";
import { getSignupDefaults, SIGNUP_MODES, type SignupMode } from "./config";
import { normalizeDomains, type SignupPolicy } from "./signup-policy";

const KEY_SIGNUP = "signup_policy";

export async function getSignupPolicy(): Promise<SignupPolicy> {
  const defaults = getSignupDefaults();
  const row = await db.select().from(appSettings).where(eq(appSettings.key, KEY_SIGNUP)).limit(1).then(firstRow);
  if (!row) return defaults;
  try {
    const parsed = JSON.parse(row.value) as Partial<SignupPolicy>;
    return {
      mode: parsed.mode && SIGNUP_MODES.includes(parsed.mode) ? parsed.mode : defaults.mode,
      allowedDomains: Array.isArray(parsed.allowedDomains) ? normalizeDomains(parsed.allowedDomains) : defaults.allowedDomains,
      requireApproval: typeof parsed.requireApproval === "boolean" ? parsed.requireApproval : defaults.requireApproval,
    };
  } catch {
    return defaults;
  }
}

export function validateSignupPolicyInput(
  input: unknown
): { ok: true; policy: SignupPolicy } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid settings" };
  const { mode, allowedDomains, requireApproval } = input as Record<string, unknown>;
  if (typeof mode !== "string" || !SIGNUP_MODES.includes(mode as SignupMode)) {
    return { ok: false, error: "Invalid sign-up mode" };
  }
  const domains = normalizeDomains(
    Array.isArray(allowedDomains) ? (allowedDomains as string[]) : typeof allowedDomains === "string" ? allowedDomains : []
  );
  if (mode === "domain" && domains.length === 0) {
    return { ok: false, error: "Add at least one allowed domain, or choose a different sign-up mode" };
  }
  return {
    ok: true,
    policy: {
      mode: mode as SignupMode,
      allowedDomains: domains,
      requireApproval: requireApproval !== false,
    },
  };
}

export async function saveSignupPolicy(policy: SignupPolicy) {
  const now = new Date();
  const value = JSON.stringify(policy);
  await db.insert(appSettings)
    .values({ key: KEY_SIGNUP, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}
