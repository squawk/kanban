import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getIronSession, type SessionOptions, type IronSession } from "iron-session";
import { db } from "./db";
import { users, boards, columns, tags, emailVerificationTokens, passwordResetTokens } from "./db/schema";
import { eq, and, gt } from "drizzle-orm";
import { nanoid } from "nanoid";

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

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

const sessionOptions: SessionOptions = {
  password: getSessionSecret(),
  cookieName: "kanban_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict", // Upgraded from "lax" for better CSRF protection
    maxAge: 60 * 60 * 24, // 24 hours (reduced from 1 week)
  },
};

// Get session from request
export async function getSession(request: Request): Promise<IronSession<SessionData>> {
  // Create a mock response to get cookies
  const response = new Response();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  return session;
}

// Get session with response (for setting cookies)
export async function getSessionWithResponse(
  request: Request,
  response: Response
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(request, response, sessionOptions);
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
  db.insert(users).values({
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    name,
    emailVerified: false,
    approved: false,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Create default tags if they don't exist
  const defaultTags = [
    { name: "Bug", color: "#ef4444" },
    { name: "Feature", color: "#3b82f6" },
    { name: "Urgent", color: "#f59e0b" },
    { name: "Enhancement", color: "#8b5cf6" },
    { name: "Documentation", color: "#10b981" },
    { name: "Design", color: "#ec4899" },
  ];

  for (const tag of defaultTags) {
    try {
      db.insert(tags).values({
        id: nanoid(),
        name: tag.name,
        color: tag.color,
        createdAt: now,
        updatedAt: now,
      }).run();
    } catch {
      // Tag already exists, ignore
    }
  }

  return { id: userId, email, name };
}

// Find user by email
export function findUserByEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
}

// Find user by ID
export function findUserById(id: string) {
  return db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, id)).get();
}

// Get user's board
export function getUserBoard(userId: string) {
  return db.select().from(boards).where(eq(boards.userId, userId)).get();
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
export function createEmailVerificationToken(userId: string): string {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  // Delete any existing tokens for this user
  db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId)).run();

  // Create new token
  db.insert(emailVerificationTokens).values({
    id: nanoid(),
    userId,
    token,
    expiresAt,
    createdAt: now,
  }).run();

  return token;
}

// Verify email verification token
export function verifyEmailToken(token: string): { userId: string } | null {
  const now = new Date();
  const record = db.select()
    .from(emailVerificationTokens)
    .where(and(
      eq(emailVerificationTokens.token, token),
      gt(emailVerificationTokens.expiresAt, now)
    ))
    .get();

  if (!record) return null;

  // Delete the token after use
  db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, record.id)).run();

  return { userId: record.userId };
}

// Create password reset token
export function createPasswordResetToken(userId: string): string {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  // Delete any existing tokens for this user
  db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId)).run();

  // Create new token
  db.insert(passwordResetTokens).values({
    id: nanoid(),
    userId,
    token,
    expiresAt,
    createdAt: now,
  }).run();

  return token;
}

// Verify password reset token
export function verifyPasswordResetToken(token: string): { userId: string } | null {
  const now = new Date();
  const record = db.select()
    .from(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.token, token),
      gt(passwordResetTokens.expiresAt, now)
    ))
    .get();

  if (!record) return null;

  // Delete the token after use
  db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, record.id)).run();

  return { userId: record.userId };
}

// Update user's email verification status
export function setEmailVerified(userId: string, verified: boolean) {
  db.update(users)
    .set({ emailVerified: verified, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .run();
}

// Update user's approval status
export function setUserApproved(userId: string, approved: boolean) {
  db.update(users)
    .set({ approved, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .run();
}

// Update user's password
export async function updatePassword(userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  db.update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .run();
}

// Create user's board (called after approval)
export function createUserBoard(userId: string) {
  const boardId = nanoid();
  const now = new Date();

  // Check if user already has a board
  const existingBoard = db.select().from(boards).where(eq(boards.userId, userId)).get();
  if (existingBoard) return existingBoard;

  // Create board
  db.insert(boards).values({
    id: boardId,
    name: "My Board",
    userId,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Create default columns with unique IDs per user
  const defaultColumns = [
    { title: "To Do", position: 0 },
    { title: "In Progress", position: 1 },
    { title: "Completed", position: 2 },
  ];

  for (const col of defaultColumns) {
    db.insert(columns).values({
      id: nanoid(),
      title: col.title,
      position: col.position,
      boardId,
      cardIds: "[]",
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  return { id: boardId };
}

// Get full user record including verification status
export function getFullUser(userId: string) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

// Delete user and all associated data
export function deleteUser(userId: string) {
  db.delete(users).where(eq(users.id, userId)).run();
}
