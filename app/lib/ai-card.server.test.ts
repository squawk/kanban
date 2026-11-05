// @vitest-environment node
/**
 * AI quick add: validation of Claude's draft, plus the route end to end against a
 * real (in-process) Postgres with the model call stubbed out.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test_secret_that_is_at_least_32_characters_long";
  process.env.ADMIN_EMAIL = "admin@acme.com";
  process.env.SENDGRID_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "test-key";
});

const model = vi.hoisted(() => ({
  calls: [] as { system: string; user: string }[],
  next: [] as unknown[],
}));
vi.mock("~/lib/ai-card.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/ai-card.server")>();
  return {
    ...actual,
    claudeCaller: () => async (system: string, user: string) => {
      model.calls.push({ system, user });
      const out = model.next.shift();
      if (out instanceof Error) throw out;
      return out;
    },
  };
});

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "~/lib/db/schema";
import { setFallbackDb, type Database } from "~/lib/db";
import * as auth from "~/lib/auth";
import * as login from "~/routes/api.auth.login";
import * as board from "~/routes/api.board";
import * as members from "~/routes/api.boards.$boardId.members";
import * as adminAudit from "~/routes/api.admin.audit";
import * as quickAdd from "~/routes/api.ai.quick-add";
import { normalizeOutput, buildUserMessage, type CardContext, type RawModelOutput } from "~/lib/ai-card.server";

const ctx: CardContext = {
  today: "2026-11-04",
  currentUser: { id: "u1", name: "Ada", email: "ada@acme.com" },
  columns: [
    { id: "c1", title: "To Do" },
    { id: "c2", title: "In Progress" },
  ],
  members: [
    { id: "u1", name: "Ada", email: "ada@acme.com" },
    { id: "u2", name: "Bob", email: "bob@acme.com" },
  ],
  tags: [{ id: "t1", name: "Bug" }],
};

function draft(card: Partial<RawModelOutput["card"]> = {}, rest: Partial<RawModelOutput> = {}): RawModelOutput {
  return {
    status: "ready",
    questions: [],
    skipped: [],
    card: { title: "Renew domain", notes: "", columnId: "c1", dueDate: null, priority: "medium", assigneeId: null, tagIds: [], ...card },
    ...rest,
  };
}

describe("normalizeOutput", () => {
  it("keeps a valid draft", () => {
    const out = normalizeOutput(draft({ columnId: "c2", dueDate: "2026-11-06", priority: "high", assigneeId: "u2", tagIds: ["t1"] }), ctx);
    expect(out).toEqual({
      status: "ready",
      skipped: [],
      card: { title: "Renew domain", notes: "", columnId: "c2", dueDate: "2026-11-06", priority: "high", assigneeId: "u2", tagIds: ["t1"] },
    });
  });

  it("drops ids that aren't on the board and falls back to the first column", () => {
    const out = normalizeOutput(draft({ columnId: "nope", assigneeId: "stranger", tagIds: ["t1", "t9", "t1"], priority: "urgent", dueDate: "2026-02-30" }), ctx);
    expect(out.status).toBe("ready");
    if (out.status !== "ready") return;
    expect(out.card).toMatchObject({ columnId: "c1", assigneeId: null, tagIds: ["t1"], priority: "medium", dueDate: null });
    expect(out.skipped[0]).toMatch(/assignee/i);
  });

  it("returns questions when Claude needs more information", () => {
    const out = normalizeOutput(draft({}, { status: "needs_info", questions: ["Which Alex?", "", "a", "b", "c"] }), ctx);
    expect(out).toEqual({ status: "needs_info", questions: ["Which Alex?", "a", "b"] });
  });

  it("asks for a title instead of creating an empty card", () => {
    const out = normalizeOutput(draft({ title: "   " }), ctx);
    expect(out.status).toBe("needs_info");
  });

  it("puts the board, today's weekday and the answers in the prompt", () => {
    const msg = buildUserMessage(ctx, "renew domain friday", [{ questions: ["Which Alex?"], answer: "Alex Kim" }]);
    expect(msg).toContain("2026-11-04 (Wednesday)");
    expect(msg).toContain('"title": "In Progress"');
    expect(msg).toContain("<request>\nrenew domain friday\n</request>");
    expect(msg).toContain("Which Alex?");
    expect(msg).toContain("Alex Kim");
  });
});

let ipCounter = 0;
function req(url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ "x-forwarded-for": `10.1.0.${++ipCounter % 250}` });
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  return new Request(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function activeUser(email: string, name: string) {
  const user = await auth.createUser(email, "Password1", name);
  await auth.setEmailVerified(user.id, true);
  await auth.setUserApproved(user.id, true);
  await auth.createUserBoard(user.id);
  const res = await login.action({ request: req("/api/auth/login", { method: "POST", body: { email, password: "Password1" } }) } as never);
  return { ...user, cookie: res.headers.get("set-cookie")!.split(";")[0] };
}

describe("POST /api/ai/quick-add", () => {
  let ada: Awaited<ReturnType<typeof activeUser>>;
  let bob: Awaited<ReturnType<typeof activeUser>>;
  let boardId: string;
  let columnIds: string[];

  const post = (b: unknown, cookie = ada.cookie) =>
    quickAdd.action({ request: req("/api/ai/quick-add", { method: "POST", cookie, body: b }) } as never);

  beforeAll(async () => {
    const pg = new PGlite();
    const testDb = drizzle(pg, { schema });
    await migrate(testDb, { migrationsFolder: "./drizzle" });
    setFallbackDb(testDb as unknown as Database);
    ada = await activeUser("admin@acme.com", "Ada");
    bob = await activeUser("bob@acme.com", "Bob");
    const data = await (await board.loader({ request: req("/api/board", { cookie: ada.cookie }) } as never)).json();
    boardId = data.board.id;
    columnIds = data.columns.map((c: { id: string }) => c.id);
    await members.action({ request: req("/x", { method: "POST", cookie: ada.cookie, body: { userId: bob.id } }), params: { boardId } } as never);
  });

  beforeEach(() => {
    model.calls.length = 0;
    model.next.length = 0;
  });

  it("requires sign-in and a request", async () => {
    expect((await quickAdd.action({ request: req("/api/ai/quick-add", { method: "POST", body: { request: "x" } }) } as never)).status).toBe(401);
    expect((await post({ boardId, request: "  " })).status).toBe(400);
    expect(model.calls).toHaveLength(0);
  });

  it("creates the card Claude drafted, using the person's date", async () => {
    model.next.push(draft({ columnId: columnIds[1], dueDate: "2026-11-06", priority: "high", assigneeId: bob.id, notes: "- step one" }));
    const res = await post({ boardId, request: "renew the domain friday, give it to bob, urgent", today: "2026-11-04" });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({
      status: "created",
      column: { id: columnIds[1] },
      card: { title: "Renew domain", priority: "high", assigneeId: bob.id, notes: "- step one" },
    });
    expect(data.card.dueDate.slice(0, 10)).toBe("2026-11-06");
    expect(model.calls[0].user).toContain("2026-11-04 (Wednesday)");
    expect(model.calls[0].user).toContain(bob.email);

    const fresh = await (await board.loader({ request: req(`/api/board?boardId=${boardId}`, { cookie: ada.cookie }) } as never)).json();
    expect(fresh.columns[1].cardIds).toContain(data.card.id);

    const audit = await (await adminAudit.loader({ request: req("/api/admin/audit", { cookie: ada.cookie }) } as never)).json();
    const entries = audit.entries ?? audit;
    expect(entries.some((e: { summary: string }) => e.summary.includes("(AI quick add)"))).toBe(true);
  });

  it("returns questions without creating anything, then uses the answers", async () => {
    model.next.push(draft({}, { status: "needs_info", questions: ["Who should it go to?"] }));
    const ask = await post({ boardId, request: "send the invoice to the client" });
    expect(ask.status).toBe(200);
    expect(await ask.json()).toEqual({ status: "needs_info", questions: ["Who should it go to?"] });

    model.next.push(draft({ title: "Send the invoice" }));
    const done = await post({
      boardId,
      request: "send the invoice to the client",
      followUps: [{ questions: ["Who should it go to?"], answer: "me" }],
    });
    expect(done.status).toBe(201);
    expect(model.calls[1].user).toContain("<their_answer>\nme\n</their_answer>");
  });

  it("refuses boards the person can't access", async () => {
    const stranger = await activeUser("eve@acme.com", "Eve");
    const res = await post({ boardId, request: "add a card" }, stranger.cookie);
    expect(res.status).toBe(404);
    expect(model.calls).toHaveLength(0);
  });

  it("reports a refusal and model errors without creating a card", async () => {
    model.next.push("refused");
    expect((await post({ boardId, request: "something" })).status).toBe(422);
    model.next.push(new Error("boom"));
    expect((await post({ boardId, request: "something" })).status).toBe(502);
  });
});
