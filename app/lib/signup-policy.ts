/**
 * Sign-up policy: who may self-register.
 *
 *  - open:        anyone may register (subject to admin approval if enabled)
 *  - domain:      only emails at one of `allowedDomains` may register
 *  - invite_only: self-registration is closed; admins invite users
 *
 * This file is pure (no DB access) so it can be shared with the client and unit tested.
 */
import type { SignupMode } from "./config";

export interface SignupPolicy {
  mode: SignupMode;
  allowedDomains: string[];
  requireApproval: boolean;
}

export function getEmailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

/** Normalize a user-entered domain list ("@Acme.com, foo.org") into ["acme.com", "foo.org"]. */
export function normalizeDomains(input: string[] | string): string[] {
  const list = Array.isArray(input) ? input : input.split(/[\s,]+/);
  const out = new Set<string>();
  for (const raw of list) {
    const d = String(raw).trim().toLowerCase().replace(/^@/, "");
    if (d && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
      out.add(d);
    }
  }
  return [...out];
}

/**
 * Returns true if `domain` equals an allowed domain or is a subdomain of one
 * (e.g. "eng.acme.com" matches "acme.com").
 */
export function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  const d = domain.toLowerCase();
  return allowedDomains.some((allowed) => d === allowed || d.endsWith(`.${allowed}`));
}

export type SignupCheck =
  | { allowed: true; autoApprove: boolean }
  | { allowed: false; reason: "closed" | "domain"; message: string };

export function checkSignupAllowed(email: string, policy: SignupPolicy): SignupCheck {
  if (policy.mode === "invite_only") {
    return {
      allowed: false,
      reason: "closed",
      message: "Sign-up is by invitation only. Ask an administrator to invite you.",
    };
  }

  if (policy.mode === "domain") {
    const domain = getEmailDomain(email);
    if (!domain || !isDomainAllowed(domain, policy.allowedDomains)) {
      return {
        allowed: false,
        reason: "domain",
        message:
          policy.allowedDomains.length > 0
            ? `Sign-up is limited to ${policy.allowedDomains.map((d) => `@${d}`).join(", ")} email addresses.`
            : "Sign-up is currently restricted. Ask an administrator to invite you.",
      };
    }
  }

  return { allowed: true, autoApprove: !policy.requireApproval };
}
