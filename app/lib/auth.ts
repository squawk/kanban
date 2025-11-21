import bcrypt from "bcryptjs";
import { getIronSession, type SessionOptions, type IronSession } from "iron-session";
import { db } from "./db";
import { users, boards, columns, tags } from "./db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Session data type
export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
}

// Session options - in production, use a proper secret from env vars
const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long_for_iron_session",
  cookieName: "kanban_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
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

// Create a new user with default board
export async function createUser(email: string, password: string, name: string) {
  const passwordHash = await hashPassword(password);
  const userId = nanoid();
  const boardId = nanoid();
  const now = new Date();

  // Create user
  db.insert(users).values({
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    name,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Create default board for user
  db.insert(boards).values({
    id: boardId,
    name: "My Board",
    userId,
    createdAt: now,
    updatedAt: now,
  }).run();

  // Create default columns
  const defaultColumns = [
    { id: nanoid(), title: "To Do", position: 0 },
    { id: nanoid(), title: "In Progress", position: 1 },
    { id: nanoid(), title: "Completed", position: 2 },
  ];

  for (const col of defaultColumns) {
    db.insert(columns).values({
      id: col.id,
      title: col.title,
      position: col.position,
      boardId,
      cardIds: "[]",
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  // Create default tags
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
