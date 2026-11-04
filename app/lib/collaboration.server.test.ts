// @vitest-environment node
/**
 * Integration tests for roles, invitations, sign-up policy, board sharing,
 * assignment, audit trail and notifications. Runs the real route handlers
 * against a throwaway SQLite database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test_secret_that_is_at_least_32_characters_long";
  process.env.ADMIN_EMAIL = "admin@acme.com";
  process.env.REMINDER_TIMEZONE = "UTC";
  process.env.REMINDER_HOUR = "8";
  process.env.CRON_SECRET = "cron-secret-for-tests";
  process.env.SENDGRID_API_KEY = ""; // email "not configured"
});

const sent = vi.hoisted(() => [] as { to: string | string[]; subject: string }[]);
vi.mock("~/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/email")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (msg: { to: string | string[]; subject: string }) => {
      sent.push(msg);
      return true;
    }),
    sendAdminApprovalEmail: vi.fn(async (_id: string, email: string, _name: string, recipients?: string[]) => {
      sent.push({ to: recipients ?? [], subject: `New user registration pending approval - ${email}` });
      return true;
    }),
  };
});

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "~/lib/db/schema";
import { setFallbackDb, type Database } from "~/lib/db";
import * as auth from "~/lib/auth";
import * as notifications from "~/lib/notifications.server";
import * as login_ from "~/routes/api.auth.login";
import * as register from "~/routes/api.auth.register";
import * as acceptInvite from "~/routes/api.auth.accept-invite";
import * as me from "~/routes/api.auth.me";
import * as adminUsers from "~/routes/api.admin.users";
import * as adminInvites from "~/routes/api.admin.invitations";
import * as adminSettings from "~/routes/api.admin.settings";
import * as adminAudit from "~/routes/api.admin.audit";
import * as board from "~/routes/api.board";
import * as boards from "~/routes/api.boards";
import * as members from "~/routes/api.boards.$boardId.members";
import * as cards from "~/routes/api.cards";
import * as card from "~/routes/api.cards.$cardId";
import * as comments from "~/routes/api.cards.$cardId.comments";
import * as activity from "~/routes/api.cards.$cardId.activity";
import * as column from "~/routes/api.columns.$columnId";
import * as myTasks from "~/routes/api.my-tasks";
import * as cron from "~/routes/api.cron.due-reminders";
import * as reminders from "~/lib/due-reminders.server";
import * as realtimeToken from "~/routes/api.realtime-token";
import * as cardLock from "~/routes/api.cards.$cardId.lock";
import * as locks from "~/lib/card-locks.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m: Record<string, any> = {
  auth, notifications, login: login_, register, acceptInvite, me, adminUsers, adminInvites, adminSettings,
  adminAudit, board, boards, members, cards, card, comments, activity, column, myTasks, cron, reminders, realtimeToken, cardLock, locks,
};
let ipCounter = 0;

function req(url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ "x-forwarded-for": `10.0.0.${++ipCounter % 250}` });
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  return new Request(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function body(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function createActiveUser(email: string, name: string) {
  const user = await m.auth.createUser(email, "Password1", name);
  await m.auth.setEmailVerified(user.id, true);
  await m.auth.setUserApproved(user.id, true);
  await m.auth.createUserBoard(user.id);
  return user as { id: string; email: string; name: string };
}

async function login(email: string, password = "Password1") {
  const res = await m.login.action({ request: req("/api/auth/login", { method: "POST", body: { email, password } }) });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return cookie;
}

let admin: { id: string; email: string };
let alice: { id: string; email: string };
let bob: { id: string; email: string };
let adminCookie: string, aliceCookie: string, bobCookie: string;

beforeAll(async () => {
  // Real Postgres (WASM, in-process) with the same migrations used in production
  const pg = new PGlite();
  const testDb = drizzle(pg, { schema });
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  setFallbackDb(testDb as unknown as Database);

  admin = await createActiveUser("admin@acme.com", "Ada Admin");
  alice = await createActiveUser("alice@acme.com", "Alice");
  bob = await createActiveUser("bob@acme.com", "Bob");
  adminCookie = await login(admin.email);
  aliceCookie = await login(alice.email);
  bobCookie = await login(bob.email);
});

beforeEach(() => {
  sent.length = 0;
});

describe("roles", () => {
  it("bootstraps ADMIN_EMAIL as admin and exposes role via /me", async () => {
    const res = await m.me.loader({ request: req("/api/auth/me", { cookie: adminCookie }) });
    expect((await body(res)).user.role).toBe("admin");
    const res2 = await m.me.loader({ request: req("/api/auth/me", { cookie: aliceCookie }) });
    expect((await body(res2)).user.role).toBe("member");
  });

  it("forbids non-admins from admin APIs", async () => {
    for (const mod of [m.adminUsers, m.adminInvites, m.adminSettings, m.adminAudit]) {
      const res = await mod.loader({ request: req("/x", { cookie: aliceCookie }) });
      expect(res.status).toBe(403);
    }
    const anon = await m.adminUsers.loader({ request: req("/x") });
    expect(anon.status).toBe(401);
  });

  it("prevents removing the last admin and self-demotion", async () => {
    const self = await m.adminUsers.action({
      request: req("/api/admin/users", { method: "PATCH", cookie: adminCookie, body: { userId: admin.id, role: "member" } }),
    });
    expect(self.status).toBe(400);
  });

  it("lets an admin promote and demote other users, with audit entries", async () => {
    const promote = await m.adminUsers.action({
      request: req("/api/admin/users", { method: "PATCH", cookie: adminCookie, body: { userId: bob.id, role: "admin" } }),
    });
    expect(promote.status).toBe(200);
    const demote = await m.adminUsers.action({
      request: req("/api/admin/users", { method: "PATCH", cookie: adminCookie, body: { userId: bob.id, role: "member" } }),
    });
    expect(demote.status).toBe(200);
    const audit = await body(await m.adminAudit.loader({ request: req("/api/admin/audit?action=user.role_changed", { cookie: adminCookie }) }));
    expect(audit.entries.map((e: any) => e.metadata.to)).toEqual(["member", "admin"]);
  });
});

describe("sign-up policy", () => {
  async function setPolicy(signup: unknown) {
    return m.adminSettings.action({ request: req("/api/admin/settings", { method: "PUT", cookie: adminCookie, body: { signup } }) });
  }
  function register(email: string) {
    return m.register.action({
      request: req("/api/auth/register", { method: "POST", body: { email, password: "Password1", name: "New Person" } }),
    });
  }

  it("rejects domain mode without domains", async () => {
    expect((await setPolicy({ mode: "domain", allowedDomains: [] })).status).toBe(400);
  });

  it("closes sign-up when invite-only", async () => {
    expect((await setPolicy({ mode: "invite_only", allowedDomains: [], requireApproval: true })).status).toBe(200);
    const res = await register("someone@acme.com");
    expect(res.status).toBe(403);
    expect((await body(res)).code).toBe("SIGNUP_RESTRICTED");
  });

  it("restricts to allowed domains and can auto-approve", async () => {
    await setPolicy({ mode: "domain", allowedDomains: "acme.com", requireApproval: false });
    expect((await register("outsider@gmail.com")).status).toBe(403);

    sent.length = 0;
    const ok = await register("insider@eng.acme.com");
    expect(ok.status).toBe(201);
    expect((await body(ok)).requiresApproval).toBe(false);
    const user = await m.auth.findUserByEmail("insider@eng.acme.com");
    expect(user.approved).toBe(true);
    // no admin approval email when auto-approved
    expect(sent.some((s) => s.subject.includes("pending approval"))).toBe(false);
  });

  it("emails admins for approval when approval is required", async () => {
    await setPolicy({ mode: "open", allowedDomains: [], requireApproval: true });
    expect((await register("pending@example.com")).status).toBe(201);
    const approval = sent.find((s) => s.subject.includes("pending approval"));
    expect(approval?.to).toEqual(["admin@acme.com"]);
    await setPolicy({ mode: "invite_only", allowedDomains: [], requireApproval: true });
  });

  it("always lets ADMIN_EMAIL register even when invite-only, so installs can't lock themselves out", async () => {
    // Policy is invite_only here. admin@acme.com already exists, so we expect the
    // generic duplicate error rather than the policy block.
    const res = await m.register.action({
      request: req("/api/auth/register", { method: "POST", body: { email: "ADMIN@acme.com", password: "Password1", name: "Dup" } }),
    });
    expect(res.status).toBe(400);
    expect((await body(res)).code).not.toBe("SIGNUP_RESTRICTED");
  });
});

describe("invitations", () => {
  it("lets an admin invite a user who then accepts and is signed in", async () => {
    const res = await m.adminInvites.action({
      request: req("/api/admin/invitations", { method: "POST", cookie: adminCookie, body: { email: "Carol@Acme.com", role: "member" } }),
    });
    expect(res.status).toBe(201);
    const { inviteUrl, email } = await body(res);
    expect(email).toBe("carol@acme.com");
    const token = new URL(inviteUrl).searchParams.get("token")!;

    const check = await m.acceptInvite.loader({ request: req(`/api/auth/accept-invite?token=${token}`) });
    expect((await body(check)).email).toBe("carol@acme.com");

    const weak = await m.acceptInvite.action({
      request: req("/api/auth/accept-invite", { method: "POST", body: { token, name: "Carol", password: "weak" } }),
    });
    expect(weak.status).toBe(400);

    const accept = await m.acceptInvite.action({
      request: req("/api/auth/accept-invite", { method: "POST", body: { token, name: "Carol", password: "Password1" } }),
    });
    expect(accept.status).toBe(201);
    expect(accept.headers.get("set-cookie")).toContain("kanban_session");

    // token is single-use
    const reuse = await m.acceptInvite.loader({ request: req(`/api/auth/accept-invite?token=${token}`) });
    expect(reuse.status).toBe(404);

    const list = await body(await m.adminInvites.loader({ request: req("/x", { cookie: adminCookie }) }));
    expect(list.find((i: any) => i.email === "carol@acme.com").status).toBe("accepted");
  });

  it("refuses to invite existing users and supports revocation", async () => {
    const dup = await m.adminInvites.action({
      request: req("/x", { method: "POST", cookie: adminCookie, body: { email: alice.email } }),
    });
    expect(dup.status).toBe(409);

    const created = await body(
      await m.adminInvites.action({ request: req("/x", { method: "POST", cookie: adminCookie, body: { email: "dan@acme.com" } }) })
    );
    const revoke = await m.adminInvites.action({ request: req("/x", { method: "DELETE", cookie: adminCookie, body: { id: created.id } }) });
    expect(revoke.status).toBe(200);
    const token = new URL(created.inviteUrl).searchParams.get("token")!;
    expect((await m.acceptInvite.loader({ request: req(`/x?token=${token}`) })).status).toBe(404);
  });

  it("forbids non-admins from inviting", async () => {
    const res = await m.adminInvites.action({ request: req("/x", { method: "POST", cookie: aliceCookie, body: { email: "eve@x.com" } }) });
    expect(res.status).toBe(403);
  });
});

describe("board sharing and assignment", () => {
  let aliceBoardId: string;
  let todoColumnId: string;
  let doneColumnId: string;
  let cardId: string;

  beforeAll(async () => {
    const data = await body(await m.board.loader({ request: req("/api/board", { cookie: aliceCookie }) }));
    aliceBoardId = data.board.id;
    expect(data.board.role).toBe("owner");
    todoColumnId = data.columns[0].id;
    doneColumnId = data.columns[2].id;
  });

  it("hides a board from non-members", async () => {
    const res = await m.board.loader({ request: req(`/api/board?boardId=${aliceBoardId}`, { cookie: bobCookie }) });
    expect(res.status).toBe(404);
  });

  it("won't assign cards to non-members", async () => {
    const res = await m.cards.action({
      request: req("/api/cards", { method: "POST", cookie: aliceCookie, body: { title: "X", columnId: todoColumnId, assigneeId: bob.id } }),
    });
    expect(res.status).toBe(400);
  });

  it("lets the owner share the board and assign work", async () => {
    const forbidden = await m.members.action({
      request: req("/x", { method: "POST", cookie: bobCookie, body: { userId: bob.id } }),
      params: { boardId: aliceBoardId },
    });
    expect(forbidden.status).toBe(404);

    const add = await m.members.action({
      request: req("/x", { method: "POST", cookie: aliceCookie, body: { userId: bob.id } }),
      params: { boardId: aliceBoardId },
    });
    expect(add.status).toBe(201);
    await m.notifications.flushNotifications();
    expect(sent.some((s) => s.to === bob.email && s.subject.includes("shared the board"))).toBe(true);

    const boards = await body(await m.boards.loader({ request: req("/api/boards", { cookie: bobCookie }) }));
    expect(boards.find((b: any) => b.id === aliceBoardId)).toMatchObject({ role: "member", ownerName: "Alice" });

    sent.length = 0;
    const created = await m.cards.action({
      request: req("/api/cards", {
        method: "POST",
        cookie: aliceCookie,
        body: { title: "Write <spec>", columnId: todoColumnId, assigneeId: bob.id, priority: "high" },
      }),
    });
    expect(created.status).toBe(201);
    const card = await body(created);
    cardId = card.id;
    expect(card.assignee).toMatchObject({ id: bob.id, name: "Bob" });
    expect(card.createdBy).toMatchObject({ id: alice.id });

    await m.notifications.flushNotifications();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: bob.email });
    expect(sent[0].subject).toContain("assigned you");
  });

  it("lets members see the board and their tasks", async () => {
    const data = await body(await m.board.loader({ request: req(`/api/board?boardId=${aliceBoardId}`, { cookie: bobCookie }) }));
    expect(data.board.role).toBe("member");
    expect(data.members.map((p: any) => p.id)).toEqual([alice.id, bob.id]);
    expect(data.cards[cardId].assigneeId).toBe(bob.id);

    const tasks = await body(await m.myTasks.loader({ request: req("/api/my-tasks", { cookie: bobCookie }) }));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: cardId, boardName: "My Board", columnTitle: "To Do" });
  });

  it("notifies the creator when the assignee comments, but never the actor", async () => {
    const res = await m.comments.action({
      request: req("/x", { method: "POST", cookie: bobCookie, body: { content: "On it" } }),
      params: { cardId },
    });
    expect(res.status).toBe(201);
    expect((await body(res)).author.name).toBe("Bob");
    await m.notifications.flushNotifications();
    expect(sent.map((s) => s.to)).toEqual([alice.email]);
  });

  it("respects the email notification preference", async () => {
    const pref = await m.me.action({ request: req("/api/auth/me", { method: "PATCH", cookie: aliceCookie, body: { emailNotifications: false } }) });
    expect(pref.status).toBe(200);
    await m.comments.action({ request: req("/x", { method: "POST", cookie: bobCookie, body: { content: "Again" } }), params: { cardId } });
    await m.notifications.flushNotifications();
    expect(sent).toHaveLength(0);
    await m.me.action({ request: req("/api/auth/me", { method: "PATCH", cookie: aliceCookie, body: { emailNotifications: true } }) });
  });

  it("audits moves and notifies on status change", async () => {
    const before = await body(await m.board.loader({ request: req(`/api/board?boardId=${aliceBoardId}`, { cookie: bobCookie }) }));
    const columns = before.columns.map((c: any) =>
      c.id === todoColumnId
        ? { ...c, cardIds: c.cardIds.filter((id: string) => id !== cardId) }
        : c.id === doneColumnId
          ? { ...c, cardIds: [...c.cardIds, cardId] }
          : c
    );
    const res = await m.board.action({
      request: req("/api/board", { method: "PUT", cookie: bobCookie, body: { boardId: aliceBoardId, columns } }),
    });
    expect(res.status).toBe(200);
    await m.notifications.flushNotifications();
    expect(sent.map((s) => s.to)).toEqual([alice.email]);
    expect(sent[0].subject).toContain("moved to Completed");

    const activity = await body(await m.activity.loader({ request: req("/x", { cookie: bobCookie }), params: { cardId } }));
    const actions = activity.map((a: any) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["card.created", "card.assigned", "comment.created", "card.moved"]));
    expect(activity[0]).not.toHaveProperty("ipAddress");
  });

  it("keeps cards a stale client didn't know about", async () => {
    const extra = await body(
      await m.cards.action({ request: req("/api/cards", { method: "POST", cookie: aliceCookie, body: { title: "New", columnId: todoColumnId } }) })
    );
    // Bob submits a layout without Alice's new card
    const stale = [{ id: todoColumnId, cardIds: [] }, { id: doneColumnId, cardIds: [cardId] }];
    await m.board.action({ request: req("/api/board", { method: "PUT", cookie: bobCookie, body: { boardId: aliceBoardId, columns: stale } }) });
    const after = await body(await m.board.loader({ request: req(`/api/board?boardId=${aliceBoardId}`, { cookie: aliceCookie }) }));
    expect(after.columns.find((c: any) => c.id === todoColumnId).cardIds).toContain(extra.id);
  });

  it("records field-level diffs on update", async () => {
    await m.card.action({
      request: req("/x", { method: "PUT", cookie: aliceCookie, body: { title: "Write spec", priority: "low" } }),
      params: { cardId },
    });
    const activity = await body(await m.activity.loader({ request: req("/x", { cookie: aliceCookie }), params: { cardId } }));
    const update = activity.find((a: any) => a.action === "card.updated");
    expect(update.metadata.changes.map((c: any) => c.field)).toEqual(["title", "priority"]);
  });

  it("only lets the owner delete columns", async () => {
    const res = await m.column.action({ request: req("/x", { method: "DELETE", cookie: bobCookie }), params: { columnId: doneColumnId } });
    expect(res.status).toBe(403);
  });

  it("unassigns cards when a member is removed", async () => {
    const res = await m.members.action({
      request: req("/x", { method: "DELETE", cookie: aliceCookie, body: { userId: bob.id } }),
      params: { boardId: aliceBoardId },
    });
    expect(res.status).toBe(200);
    const data = await body(await m.board.loader({ request: req(`/api/board?boardId=${aliceBoardId}`, { cookie: aliceCookie }) }));
    expect(data.cards[cardId].assigneeId).toBeNull();
    expect((await m.board.loader({ request: req(`/api/board?boardId=${aliceBoardId}`, { cookie: bobCookie }) })).status).toBe(404);
  });
});

describe("disabling users", () => {
  it("revokes API access immediately and blocks sign-in", async () => {
    const victim = await createActiveUser("victim@acme.com", "Victim");
    const cookie = await login(victim.email);
    expect((await m.board.loader({ request: req("/api/board", { cookie }) })).status).toBe(200);

    const res = await m.adminUsers.action({
      request: req("/x", { method: "PATCH", cookie: adminCookie, body: { userId: victim.id, disabled: true } }),
    });
    expect(res.status).toBe(200);

    expect((await m.board.loader({ request: req("/api/board", { cookie }) })).status).toBe(401);
    const loginRes = await m.login.action({
      request: req("/api/auth/login", { method: "POST", body: { email: victim.email, password: "Password1" } }),
    });
    expect(loginRes.status).toBe(403);
  });
});

describe("audit log API", () => {
  it("filters, searches, paginates and exports CSV", async () => {
    const page1 = await body(await m.adminAudit.loader({ request: req("/api/admin/audit?limit=3", { cookie: adminCookie }) }));
    expect(page1.entries).toHaveLength(3);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await body(
      await m.adminAudit.loader({ request: req(`/api/admin/audit?limit=3&before=${encodeURIComponent(page1.nextCursor)}`, { cookie: adminCookie }) })
    );
    expect(page2.entries[0].createdAt <= page1.entries[2].createdAt).toBe(true);

    const search = await body(await m.adminAudit.loader({ request: req("/api/admin/audit?q=carol", { cookie: adminCookie }) }));
    expect(search.entries.length).toBeGreaterThan(0);

    const csv = await m.adminAudit.loader({ request: req("/api/admin/audit?format=csv", { cookie: adminCookie }) });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\n")[0]).toBe("time,actor,action,entity_type,entity_id,board_id,summary,ip");
  });
});

describe("due-date reminders", () => {
  const NOW = new Date("2026-11-05T15:00:00Z"); // 15:00 UTC, after the 08:00 send hour
  let owner: { id: string; email: string };
  let helper: { id: string; email: string };
  let ownerCookie: string;
  let boardId: string;
  let todo: string;
  let done: string;

  async function newCard(title: string, dueDate: string, assigneeId?: string, columnId = todo) {
    const res = await m.cards.action({
      request: req("/api/cards", { method: "POST", cookie: ownerCookie, body: { title, dueDate, columnId, assigneeId } }),
    });
    return (await body(res)).id as string;
  }

  beforeAll(async () => {
    owner = await createActiveUser("rita@acme.com", "Rita");
    helper = await createActiveUser("hal@acme.com", "Hal");
    ownerCookie = await login(owner.email);
    const data = await body(await m.board.loader({ request: req("/api/board", { cookie: ownerCookie }) }));
    boardId = data.board.id;
    todo = data.columns[0].id;
    done = data.columns[2].id;
    await m.members.action({ request: req("/x", { method: "POST", cookie: ownerCookie, body: { userId: helper.id } }), params: { boardId } });
  });

  it("does nothing before the configured send hour", async () => {
    const res = await m.reminders.runDueReminders(new Date("2026-11-05T06:00:00Z"));
    expect(res).toMatchObject({ ran: false, reason: "too_early" });
  });

  it("sends one digest per person, to the assignee or else the creator, exactly once", async () => {
    await newCard("Assigned due tomorrow", "2026-11-06", helper.id);
    await newCard("Unassigned overdue", "2026-11-03");
    await newCard("Already done", "2026-11-06", undefined, done);
    await newCard("Next month", "2026-12-06");
    await newCard("Ancient", "2026-09-01");
    sent.length = 0;

    const first = await m.reminders.runDueReminders(NOW);
    expect(first).toMatchObject({ ran: true, emailsSent: 2, remindersSent: 2 });
    const byTo = Object.fromEntries(sent.map((s) => [s.to as string, s.subject]));
    expect(byTo[helper.email]).toBe('Due tomorrow: "Assigned due tomorrow"');
    expect(byTo[owner.email]).toBe('Overdue: "Unassigned overdue"');

    sent.length = 0;
    const second = await m.reminders.runDueReminders(NOW);
    expect(second.remindersSent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("re-arms when the due date changes and respects the opt-out", async () => {
    const id = await newCard("Moving target", "2026-11-06");
    await m.reminders.runDueReminders(NOW);
    await m.card.action({ request: req("/x", { method: "PUT", cookie: ownerCookie, body: { dueDate: "2026-11-05" } }), params: { cardId: id } });

    await m.me.action({ request: req("/x", { method: "PATCH", cookie: ownerCookie, body: { emailNotifications: false } }) });
    sent.length = 0;
    expect((await m.reminders.runDueReminders(NOW)).remindersSent).toBe(0);

    await m.me.action({ request: req("/x", { method: "PATCH", cookie: ownerCookie, body: { emailNotifications: true } }) });
    const res = await m.reminders.runDueReminders(NOW);
    expect(res.remindersSent).toBe(1);
    expect(sent.at(-1)!.subject).toBe('Due today: "Moving target"');
  });

  it("protects the cron endpoint with CRON_SECRET", async () => {
    const noAuth = await m.cron.action({ request: req("/api/cron/due-reminders", { method: "POST" }) });
    expect(noAuth.status).toBe(401);
    const bad = new Request("http://localhost/api/cron/due-reminders", { method: "POST", headers: { Authorization: "Bearer nope" } });
    expect((await m.cron.action({ request: bad })).status).toBe(401);
    const good = new Request("http://localhost/api/cron/due-reminders", {
      method: "POST",
      headers: { Authorization: "Bearer cron-secret-for-tests" },
    });
    const res = await m.cron.action({ request: good });
    expect(res.status).toBe(200);
    expect(await body(res)).toHaveProperty("today");
  });
});

describe("realtime tokens", () => {
  let owner: { id: string; email: string };
  let ownerCookie: string;
  let outsiderCookie: string;
  let boardId: string;

  beforeAll(async () => {
    owner = await createActiveUser("rt-owner@acme.com", "RT Owner");
    const outsider = await createActiveUser("rt-outsider@acme.com", "RT Outsider");
    ownerCookie = await login(owner.email);
    outsiderCookie = await login(outsider.email);
    boardId = (await body(await m.board.loader({ request: req("/api/board", { cookie: ownerCookie }) }))).board.id;
  });

  afterEach(() => {
    for (const k of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_JWT_PRIVATE_KEY"]) delete process.env[k];
  });

  const tokenReq = (cookie?: string) =>
    m.realtimeToken.loader({ request: req(`/api/realtime-token?boardId=${boardId}`, { cookie }) });

  it("is disabled unless private channels are configured", async () => {
    expect((await tokenReq(ownerCookie)).status).toBe(404);
  });

  it("issues a token only to people who can see the board", async () => {
    const { privateKey } = await import("crypto").then((c) => c.generateKeyPairSync("ec", { namedCurve: "P-256" }));
    Object.assign(process.env, {
      SUPABASE_URL: "https://abc.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "pk",
      SUPABASE_SECRET_KEY: "sk",
      SUPABASE_JWT_PRIVATE_KEY: JSON.stringify({ ...(privateKey.export({ format: "jwk" }) as object), kid: "k1" }),
    });

    expect((await tokenReq()).status).toBe(401);
    expect((await tokenReq(outsiderCookie)).status).toBe(404);

    const res = await tokenReq(ownerCookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { token } = await body(res);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(claims.sub).toBe(owner.id);

    const boardRes = await body(await m.board.loader({ request: req("/api/board", { cookie: ownerCookie }) }));
    expect(boardRes.realtime).toMatchObject({ private: true, key: "pk", topic: claims.kanban_topic });
  });
});

describe("card locks", () => {
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let ownerCookie: string;
  let memberCookie: string;
  let boardId: string;
  let cardId: string;

  const lock = (cookie: string, body?: unknown) =>
    m.cardLock.action({ request: req("/x", { method: "POST", cookie, body: body ?? {} }), params: { cardId } });
  const unlock = (cookie: string) => m.cardLock.action({ request: req("/x", { method: "DELETE", cookie }), params: { cardId } });
  const edit = (cookie: string, body: unknown) => m.card.action({ request: req("/x", { method: "PUT", cookie, body }), params: { cardId } });

  beforeAll(async () => {
    owner = await createActiveUser("lock-owner@acme.com", "Lena Owner");
    member = await createActiveUser("lock-member@acme.com", "Max Member");
    ownerCookie = await login(owner.email);
    memberCookie = await login(member.email);
    const data = await body(await m.board.loader({ request: req("/api/board", { cookie: ownerCookie }) }));
    boardId = data.board.id;
    await m.members.action({ request: req("/x", { method: "POST", cookie: ownerCookie, body: { userId: member.id } }), params: { boardId } });
    cardId = (await body(await m.cards.action({
      request: req("/api/cards", { method: "POST", cookie: ownerCookie, body: { title: "Lockable", columnId: data.columns[0].id } }),
    }))).id;
  });

  it("gives the lock to the first editor and tells others who holds it", async () => {
    const first = await lock(memberCookie);
    expect(first.status).toBe(200);
    expect(await body(first)).toMatchObject({ locked: true, ttlMs: locks.LOCK_TTL_MS });

    const second = await lock(ownerCookie);
    expect(second.status).toBe(409);
    expect(await body(second)).toMatchObject({ code: "CARD_LOCKED", lock: { userId: member.id, name: "Max Member" }, canTakeOver: true });

    // Renewal by the holder keeps working
    expect((await lock(memberCookie)).status).toBe(200);

    const board = await body(await m.board.loader({ request: req(`/api/board?boardId=${boardId}`, { cookie: ownerCookie }) }));
    expect(board.cards[cardId].lock).toMatchObject({ userId: member.id, name: "Max Member" });
  });

  it("blocks edits and archiving by anyone but the holder", async () => {
    const blocked = await edit(ownerCookie, { title: "Clobbered" });
    expect(blocked.status).toBe(423);
    expect((await body(blocked)).error).toBe("Max Member is editing this card right now");
    const archive = await m.card.action({ request: req("/x", { method: "DELETE", cookie: ownerCookie }), params: { cardId } });
    expect(archive.status).toBe(423);

    // Saving an AI prompt doesn't touch edited fields, so it's still allowed
    expect((await edit(ownerCookie, { generatedPrompt: "prompt" })).status).toBe(200);

    const ok = await edit(memberCookie, { title: "Edited by holder" });
    expect(ok.status).toBe(200);
  });

  it("only lets the board owner take over, and audits it", async () => {
    // Members can't force
    await unlock(memberCookie);
    await lock(ownerCookie);
    expect((await lock(memberCookie, { force: true })).status).toBe(403);
    await unlock(ownerCookie);

    await lock(memberCookie);
    const takeover = await lock(ownerCookie, { force: true });
    expect(takeover.status).toBe(200);
    // The previous holder's renewal now fails and their edits are refused
    expect((await lock(memberCookie)).status).toBe(409);
    expect((await edit(memberCookie, { title: "Too late" })).status).toBe(423);

    const activity = await body(await m.activity.loader({ request: req("/x", { cookie: ownerCookie }), params: { cardId } }));
    expect(activity.map((a: { action: string }) => a.action)).toContain("card.lock_taken_over");
  });

  it("frees the lock on release or expiry", async () => {
    // Releasing someone else's lock does nothing
    expect(await body(await unlock(memberCookie))).toEqual({ released: false });
    expect(await body(await unlock(ownerCookie))).toEqual({ released: true });
    expect((await lock(memberCookie)).status).toBe(200);

    // Simulate a closed tab: the lease runs out without renewal
    const later = new Date(Date.now() + locks.LOCK_TTL_MS + 1000);
    expect(await m.locks.getActiveLock(cardId, later)).toBeNull();
    const result = await m.locks.acquireCardLock(cardId, owner.id, { now: later });
    expect(result.ok).toBe(true);
  });

  it("keeps the original acquire time on renewal and resets it for a new holder", async () => {
    const { db } = await import("~/lib/db");
    const { cardLocks } = await import("~/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const acquiredAt = async () => (await db.select().from(cardLocks).where(eq(cardLocks.cardId, cardId)))[0]?.acquiredAt;
    await m.locks.releaseCardLock(cardId, owner.id);
    await m.locks.releaseCardLock(cardId, member.id);

    const t0 = new Date("2030-01-01T00:00:00Z");
    expect((await m.locks.acquireCardLock(cardId, member.id, { now: t0 })).ok).toBe(true);
    const t1 = new Date(t0.getTime() + 30_000);
    expect((await m.locks.acquireCardLock(cardId, member.id, { now: t1 })).ok).toBe(true); // renewal
    expect((await acquiredAt())?.toISOString()).toBe(t0.toISOString());

    const t2 = new Date(t1.getTime() + m.locks.LOCK_TTL_MS + 1); // expired, new holder
    expect((await m.locks.acquireCardLock(cardId, owner.id, { now: t2 })).ok).toBe(true);
    expect((await acquiredAt())?.toISOString()).toBe(t2.toISOString());
    await m.locks.releaseCardLock(cardId, owner.id);
  });

  it("resolves a race so exactly one editor wins", async () => {
    const racer = await createActiveUser("lock-racer@acme.com", "Rae Racer");
    await m.members.action({ request: req("/x", { method: "POST", cookie: ownerCookie, body: { userId: racer.id } }), params: { boardId } });
    const fresh = (await body(await m.cards.action({
      request: req("/api/cards", { method: "POST", cookie: ownerCookie, body: { title: "Race", columnId: (await body(await m.board.loader({ request: req(`/api/board?boardId=${boardId}`, { cookie: ownerCookie }) }))).columns[0].id } }),
    }))).id;
    const results = await Promise.all([
      m.locks.acquireCardLock(fresh, member.id),
      m.locks.acquireCardLock(fresh, racer.id),
    ]);
    expect(results.filter((r: { ok: boolean }) => r.ok)).toHaveLength(1);
  });
});
