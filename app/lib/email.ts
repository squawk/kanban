import sgMail from "@sendgrid/mail";
import { generateApprovalToken } from "~/routes/api.auth.approve";
import { getAdminEmails, getAppUrl } from "~/lib/config";

// Initialize SendGrid with API key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@example.com";
const APP_URL = getAppUrl();

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export function isEmailConfigured(): boolean {
  return !!SENDGRID_API_KEY;
}

// Escape HTML to prevent XSS in emails
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}

/**
 * Send an email via SendGrid. When SendGrid isn't configured, the message is
 * logged in development (so links such as invitations can still be tested) and
 * skipped in production. Never throws.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:dev] To: ${[msg.to].flat().join(", ")}\nSubject: ${msg.subject}\n${msg.text}\n`);
    } else {
      console.warn(`SendGrid not configured, skipping email: ${msg.subject}`);
    }
    return false;
  }
  try {
    await sgMail.send({ ...msg, from: FROM_EMAIL });
    return true;
  } catch (error) {
    console.error(`Error sending email "${msg.subject}":`, error instanceof Error ? error.message : error);
    return false;
  }
}

/** Shared HTML layout for transactional emails. `bodyHtml` must already be escaped. */
export function emailLayout(opts: {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footer?: string;
}): string {
  const button = opts.cta
    ? `<p style="margin: 30px 0;">
          <a href="${opts.cta.url}"
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            ${escapeHtml(opts.cta.label)}
          </a>
        </p>`
    : "";
  const footer = opts.footer
    ? `<p style="color: #666; font-size: 12px; margin-top: 32px;">${escapeHtml(opts.footer)}</p>`
    : "";
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${escapeHtml(opts.heading)}</h2>
        ${opts.bodyHtml}
        ${button}
        ${footer}
      </div>
    `;
}

export const NOTIFICATION_FOOTER =
  "You're receiving this because email notifications are on for your Kanban Board account. You can turn them off from the account menu.";

export async function sendInvitationEmail(opts: {
  email: string;
  inviterName: string;
  token: string;
  expiresAt: Date;
}): Promise<boolean> {
  const url = `${APP_URL}/accept-invite?token=${opts.token}`;
  const expires = opts.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return sendEmail({
    to: opts.email,
    subject: `${opts.inviterName} invited you to Kanban Board`,
    text: `${opts.inviterName} invited you to join Kanban Board.\n\nAccept the invitation and set your password:\n${url}\n\nThis invitation expires on ${expires}.`,
    html: emailLayout({
      heading: "You're invited",
      bodyHtml: `<p><strong>${escapeHtml(opts.inviterName)}</strong> invited you to join Kanban Board.</p>
        <p>Click below to choose your name and password.</p>`,
      cta: { label: "Accept Invitation", url },
      footer: `This invitation expires on ${expires}. If you weren't expecting it, you can ignore this email.`,
    }),
  });
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  token: string
): Promise<boolean> {
  const safeName = escapeHtml(name);
  const verificationUrl = `${APP_URL}/verify-email?token=${token}`;

  const msg = {
    to: email,
    subject: "Verify your email - Kanban Board",
    text: `Hi ${name},\n\nPlease verify your email by clicking the link below:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verify your email</h2>
        <p>Hi ${safeName},</p>
        <p>Please verify your email by clicking the button below:</p>
        <p style="margin: 30px 0;">
          <a href="${verificationUrl}"
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
        <p style="color: #666; font-size: 14px;">If you didn't create an account, you can ignore this email.</p>
      </div>
    `,
  };

  return sendEmail(msg);
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
): Promise<boolean> {
  const safeName = escapeHtml(name);
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  const msg = {
    to: email,
    subject: "Reset your password - Kanban Board",
    text: `Hi ${name},\n\nYou requested to reset your password. Click the link below:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Reset your password</h2>
        <p>Hi ${safeName},</p>
        <p>You requested to reset your password. Click the button below:</p>
        <p style="margin: 30px 0;">
          <a href="${resetUrl}"
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
        <p style="color: #666; font-size: 14px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  };

  return sendEmail(msg);
}

export async function sendAdminApprovalEmail(
  userId: string,
  userEmail: string,
  userName: string,
  adminRecipients?: string[]
): Promise<boolean> {
  const safeName = escapeHtml(userName);
  const safeEmail = escapeHtml(userEmail);

  // Generate secure HMAC tokens for approve/reject actions
  const approveToken = generateApprovalToken(userId, "approve");
  const rejectToken = generateApprovalToken(userId, "reject");

  const recipients = adminRecipients && adminRecipients.length > 0 ? adminRecipients : getAdminEmails();

  const approveUrl = `${APP_URL}/api/auth/approve?userId=${userId}&action=approve&token=${approveToken}`;
  const rejectUrl = `${APP_URL}/api/auth/approve?userId=${userId}&action=reject&token=${rejectToken}`;

  const msg = {
    to: recipients,
    subject: `New user registration pending approval - ${userName}`,
    text: `A new user has registered and is awaiting approval:\n\nName: ${userName}\nEmail: ${userEmail}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New User Registration</h2>
        <p>A new user has registered and is awaiting your approval:</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Name:</strong> ${safeName}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${safeEmail}</p>
        </div>
        <p style="margin: 30px 0;">
          <a href="${approveUrl}"
             style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 12px;">
            Approve
          </a>
          <a href="${rejectUrl}"
             style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Reject
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">You can also manage pending users from the Admin page: ${APP_URL}/admin</p>
      </div>
    `,
  };

  return sendEmail(msg);
}

export async function sendApprovalNotificationEmail(
  email: string,
  name: string,
  approved: boolean
): Promise<boolean> {
  const safeName = escapeHtml(name);
  const loginUrl = `${APP_URL}/login`;

  const msg = {
    to: email,
    subject: approved
      ? "Your account has been approved - Kanban Board"
      : "Your account registration update - Kanban Board",
    text: approved
      ? `Hi ${name},\n\nGreat news! Your account has been approved. You can now log in at:\n\n${loginUrl}`
      : `Hi ${name},\n\nUnfortunately, your account registration was not approved at this time.`,
    html: approved
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Account Approved!</h2>
          <p>Hi ${safeName},</p>
          <p>Great news! Your account has been approved. You can now log in and start using the Kanban Board.</p>
          <p style="margin: 30px 0;">
            <a href="${loginUrl}"
               style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Log In
            </a>
          </p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Account Registration Update</h2>
          <p>Hi ${safeName},</p>
          <p>Unfortunately, your account registration was not approved at this time.</p>
          <p>If you believe this was a mistake, please contact the administrator.</p>
        </div>
      `,
  };

  return sendEmail(msg);
}
