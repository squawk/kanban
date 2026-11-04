import { bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  approved: boolean("approved").notNull().default(false),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  disabled: boolean("disabled").notNull().default(false),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("idx_email_verification_tokens_user_id").on(t.userId)]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("idx_password_reset_tokens_user_id").on(t.userId)]
);

export const boards = pgTable(
  "boards",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default("My Board"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_boards_user_id").on(t.userId)]
);

export const columns = pgTable(
  "columns",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    cardIds: text("card_ids").notNull().default("[]"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_columns_board_id").on(t.boardId)]
);

export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    generatedPrompt: text("generated_prompt"),
    dueDate: ts("due_date"),
    priority: text("priority").notNull().default("medium"),
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    archivedAt: ts("archived_at"),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_cards_board_id").on(t.boardId),
    index("idx_cards_due_date").on(t.dueDate),
    index("idx_cards_assignee_id").on(t.assigneeId),
  ]
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_comments_card_id").on(t.cardId)]
);

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const cardTags = pgTable(
  "card_tags",
  {
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.tagId] }), index("idx_card_tags_tag_id").on(t.tagId)]
);

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  priority: text("priority").notNull().default("medium"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Users (other than the owner) who can access a board
export const boardMembers = pgTable(
  "board_members",
  {
    boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addedById: text("added_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] }), index("idx_board_members_user_id").on(t.userId)]
);

// Admin-issued invitations. Only a SHA-256 hash of the token is stored.
export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedById: text("invited_by_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_invitations_email").on(t.email)]
);

// Append-only audit trail. `seq` gives a stable order for events in the same millisecond.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    boardId: text("board_id"),
    summary: text("summary").notNull().default(""),
    metadata: text("metadata").notNull().default("{}"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_audit_logs_created_at").on(t.createdAt),
    index("idx_audit_logs_entity").on(t.entityType, t.entityId),
    index("idx_audit_logs_board_id").on(t.boardId),
    index("idx_audit_logs_actor_id").on(t.actorId),
  ]
);

// Due-date reminders already sent. The due day is part of the key, so changing a
// card's due date re-arms its reminders; the primary key makes sends idempotent.
export const dueReminders = pgTable(
  "due_reminders",
  {
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["due_soon", "overdue"] }).notNull(),
    dueDay: text("due_day").notNull(), // YYYY-MM-DD
    userId: text("user_id").notNull(),
    sentAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.kind, t.dueDay] })]
);

// Edit locks: a lease held by whoever has the card's edit dialog open. Expired rows
// are treated as free (and overwritten), so a closed tab can't keep a card locked.
export const cardLocks = pgTable(
  "card_locks",
  {
    cardId: text("card_id").primaryKey().references(() => cards.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    acquiredAt: ts("acquired_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("idx_card_locks_user_id").on(t.userId)]
);

// Key/value app settings editable by admins (e.g. sign-up policy)
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
export type Column = typeof columns.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type CardTag = typeof cardTags.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type BoardMember = typeof boardMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type UserRole = User["role"];
export type CardLock = typeof cardLocks.$inferSelect;
