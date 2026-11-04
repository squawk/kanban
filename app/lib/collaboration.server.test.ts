// @vitest-environment node
/**
 * Integration tests for roles, invitations, sign-up policy, board sharing,
 * assignment, audit trail and notifications. Runs the real route handlers
 * against a throwaway SQLite database.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  // Must run before the DB module is imported
  const os = require("os") as typeof import("os");
  const path = require("path") as typeof import("path");
  const fs = require("fs") as typeof import("fs");
  process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanban-test-")), "test.db");
  process.env.SESSION_SECRET = "test_secret_that_is_at_least_32_characters_long";
  process.env.ADMIN_EMAIL = "admin@acme.com";
  delete process.env.SENDGRID_API_KEY;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m: Record<string, any> = {
  auth, notifications, login: login_, register, acceptInvite, me, adminUsers, adminInvites, adminSettings,
  adminAudit, board, boards, members, cards, card, comments, activity, column, myTasks,
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
  m.auth.setEmailVerified(user.id, true);
  m.auth.setUserApproved(user.id, true);
  m.auth.createUserBoard(user.id);
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
    const user = m.auth.findUserByEmail("insider@eng.acme.com");
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
