import { describe, it, expect } from "vitest";
import { checkSignupAllowed, getEmailDomain, isDomainAllowed, normalizeDomains } from "./signup-policy";

describe("signup policy", () => {
  it("normalizes domain lists", () => {
    expect(normalizeDomains("@Acme.com, foo.org  bar.co.uk,not a domain,,acme.com")).toEqual([
      "acme.com",
      "foo.org",
      "bar.co.uk",
    ]);
  });

  it("extracts email domains", () => {
    expect(getEmailDomain("Jane@Example.COM")).toBe("example.com");
    expect(getEmailDomain("nope")).toBe("");
  });

  it("matches exact domains and subdomains only", () => {
    expect(isDomainAllowed("acme.com", ["acme.com"])).toBe(true);
    expect(isDomainAllowed("eng.acme.com", ["acme.com"])).toBe(true);
    expect(isDomainAllowed("notacme.com", ["acme.com"])).toBe(false);
    expect(isDomainAllowed("acme.com.evil.io", ["acme.com"])).toBe(false);
  });

  it("allows anyone in open mode, honoring the approval flag", () => {
    expect(checkSignupAllowed("a@b.com", { mode: "open", allowedDomains: [], requireApproval: true })).toEqual({
      allowed: true,
      autoApprove: false,
    });
    expect(checkSignupAllowed("a@b.com", { mode: "open", allowedDomains: [], requireApproval: false })).toEqual({
      allowed: true,
      autoApprove: true,
    });
  });

  it("restricts by domain", () => {
    const policy = { mode: "domain" as const, allowedDomains: ["acme.com"], requireApproval: false };
    expect(checkSignupAllowed("x@acme.com", policy)).toMatchObject({ allowed: true, autoApprove: true });
    const blocked = checkSignupAllowed("x@gmail.com", policy);
    expect(blocked).toMatchObject({ allowed: false, reason: "domain" });
    if (!blocked.allowed) expect(blocked.message).toContain("@acme.com");
  });

  it("blocks everyone when invite-only", () => {
    expect(checkSignupAllowed("x@acme.com", { mode: "invite_only", allowedDomains: ["acme.com"], requireApproval: false }))
      .toMatchObject({ allowed: false, reason: "closed" });
  });
});
