/**
 * Central runtime configuration read from environment variables.
 */

const DEFAULT_ADMIN_EMAIL = "brad@vanskyhawk.com";

/** Emails that are always treated as admins (comma-separated ADMIN_EMAIL). */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.trim().toLowerCase());
}

export function getAppUrl(): string {
  return (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
}

export type SignupMode = "open" | "domain" | "invite_only";

export const SIGNUP_MODES: SignupMode[] = ["open", "domain", "invite_only"];

/** Defaults for the sign-up policy until an admin changes it in the UI. */
export function getSignupDefaults(): { mode: SignupMode; allowedDomains: string[]; requireApproval: boolean } {
  const envMode = process.env.SIGNUP_MODE as SignupMode | undefined;
  return {
    mode: envMode && SIGNUP_MODES.includes(envMode) ? envMode : "open",
    allowedDomains: (process.env.SIGNUP_ALLOWED_DOMAINS || "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    requireApproval: process.env.SIGNUP_REQUIRE_APPROVAL !== "false",
  };
}

export const INVITATION_TTL_DAYS = 7;

/** Due-date reminder settings. */
export function getReminderConfig() {
  const tz = process.env.REMINDER_TIMEZONE || "UTC";
  let timeZone = tz;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    console.warn(`Invalid REMINDER_TIMEZONE "${tz}", falling back to UTC`);
    timeZone = "UTC";
  }
  const hour = Number(process.env.REMINDER_HOUR ?? 8);
  return {
    enabled: process.env.DUE_REMINDERS_ENABLED !== "false",
    timeZone,
    /** Local hour (0-23) before which no reminders are sent, so nobody gets mail at midnight */
    sendAfterHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    cronSecret: process.env.CRON_SECRET || "",
  };
}
