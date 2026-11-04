import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getIronSession, type SessionOptions, type IronSession } from "iron-session";
import { db, firstRow } from "./db";
import { users, boards, columns, tags, emailVerificationTokens, passwordResetTokens } from "./db/schema";
import { eq, and, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { isBootstrapAdminEmail } from "./config";


// Session data type
export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
}

// Session options - require SESSION_SECRET in production
const getSessionSecret = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    // Development-only fallback with warning
    console.warn("⚠️  WARNING: Using default session secret. Set SESSION_SECRET env var for production.");
    return "dev_only_secret_32_chars_minimum_length";
  }
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return secret;
};

// Lazy-evaluate session options to access runtime env vars
const getSessionOptions = (): SessionOptions => ({
  password: getSessionSecret(),
  cookieName: "kanban_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict", // Upgraded from "lax" for better CSRF protection
    maxAge: 60 * 60 * 24, // 24 hours (reduced from 1 week)
  },
});

// Get session from request
export async function getSession(request: Request): Promise<IronSession<SessionData>> {
  // Create a mock response to get cookies
  const response = new Response();
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  return session;
}

// Get session with response (for setting cookies)
export async function getSessionWithResponse(
  request: Request,
  response: Response
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(request, response, getSessionOptions());
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create a new user (board created after approval)
export async function createUser(email: string, password: string, name: string) {
  const passwordHash = await hashPassword(password);
  const userId = nanoid();
  const now = new Date();

  // Create user (emailVerified and approved default to false)
  await db.insert(users).values({
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    name,
    emailVerified: false,
    approved: false,
    role: isBootstrapAdminEmail(email) ? "admin" : "member",
    createdAt: now,
    updatedAt: now,
  });

  // Create default tags if they don't exist
  const defaultTags = [
    { name: "Bug", color: "#ef4444" },
    { name: "Feature", color: "#3b82f6" },
    { name: "Urgent", color: "#f59e0b" },
    { name: "Enhancement", color: "#8b5cf6" },
    { name: "Documentation", color: "#10b981" },
    { name: "Design", color: "#ec4899" },
  ];

  await db
    .insert(tags)
    .values(defaultTags.map((tag) => ({ id: nanoid(), name: tag.name, color: tag.color, createdAt: now, updatedAt: now })))
    .onConflictDoNothing({ target: tags.name });

  return { id: userId, email, name };
}

// Find user by email
export async function findUserByEmail(email: string) {
  return await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1).then(firstRow);
}

// Find user by ID
export async function findUserById(id: string) {
  return await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    emailNotifications: users.emailNotifications,
    disabled: users.disabled,
    approved: users.approved,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, id)).limit(1).then(firstRow);
}

// Get user's board
export async function getUserBoard(userId: string) {
  return await db.select().from(boards).where(eq(boards.userId, userId)).limit(1).then(firstRow);
}

// True if the user exists, is approved, and isn't disabled
export async function isActiveUser(userId: string): Promise<boolean> {
  const u = await db.select({ approved: users.approved, disabled: users.disabled }).from(users).where(eq(users.id, userId)).limit(1).then(firstRow);
  return !!u && u.approved && !u.disabled;
}

// Check if user is authenticated
export async function requireAuth(request: Request): Promise<SessionData & { userId: string }> {
  const session = await getSession(request);

  if (!session.userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return session as SessionData & { userId: string };
}

// Verify reCAPTCHA token
export async function verifyRecaptcha(token: string): Promise<boolean> {
  const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
  if (!RECAPTCHA_SECRET_KEY) {
    console.warn("reCAPTCHA secret key not configured, skipping verification");
    return true;
  }

  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`,
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return false;
  }
}

// Generate a secure token
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Create email verification token
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  // Delete any existing tokens for this user
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));

  // Create new token
  await db.insert(emailVerificationTokens).values({
    id: nanoid(),
    userId,
    token,
    expiresAt,
    createdAt: now,
  });

  return token;
}

// Verify email verification token
export async function verifyEmailToken(token: string): Promise<{ userId: string } | null> {
  const now = new Date();
  const record = await db.select()
    .from(emailVerificationTokens)
    .where(and(
      eq(emailVerificationTokens.token, token),
      gt(emailVerificationTokens.expiresAt, now)
    ))
    .limit(1).then(firstRow);

  if (!record) return null;

  // Delete the token after use
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, record.id));

  return { userId: record.userId };
}

// Create password reset token
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  // Delete any existing tokens for this user
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));

  // Create new token
  await db.insert(passwordResetTokens).values({
    id: nanoid(),
    userId,
    token,
    expiresAt,
    createdAt: now,
  });

  return token;
}

// Verify password reset token
export async function verifyPasswordResetToken(token: string): Promise<{ userId: string } | null> {
  const now = new Date();
  const record = await db.select()
    .from(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.token, token),
      gt(passwordResetTokens.expiresAt, now)
    ))
    .limit(1).then(firstRow);

  if (!record) return null;

  // Delete the token after use
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, record.id));

  return { userId: record.userId };
}

// Update user's email verification status
export async function setEmailVerified(userId: string, verified: boolean) {
  await db.update(users)
    .set({ emailVerified: verified, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// Update user's approval status
export async function setUserApproved(userId: string, approved: boolean) {
  await db.update(users)
    .set({ approved, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// Update user's password
export async function updatePassword(userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  await db.update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// Create user's board (called after approval)
export async function createUserBoard(userId: string) {
  const boardId = nanoid();
  const now = new Date();

  // Check if user already has a board
  const existingBoard = await db.select().from(boards).where(eq(boards.userId, userId)).limit(1).then(firstRow);
  if (existingBoard) return existingBoard;

  // Create board
  await db.insert(boards).values({
    id: boardId,
    name: "My Board",
    userId,
    createdAt: now,
    updatedAt: now,
  });

  // Create default columns with unique IDs per user
  const defaultColumns = [
    { title: "To Do", position: 0 },
    { title: "In Progress", position: 1 },
    { title: "Completed", position: 2 },
  ];

  for (const col of defaultColumns) {
    await db.insert(columns).values({
      id: nanoid(),
      title: col.title,
      position: col.position,
      boardId,
      cardIds: "[]",
      createdAt: now,
      updatedAt: now,
    });
  }

  return { id: boardId };
}

// Get full user record including verification status
export async function getFullUser(userId: string) {
  return await db.select().from(users).where(eq(users.id, userId)).limit(1).then(firstRow);
}

// Emails of all active admins (falls back to ADMIN_EMAIL config when none exist yet)
export async function getAdminRecipientEmails(): Promise<string[]> {
  const admins = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.disabled, false)));
  return admins.map((u) => u.email);
}

// Delete user and all associated data
export async function deleteUser(userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}
