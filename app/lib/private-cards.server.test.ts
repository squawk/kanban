// @vitest-environment node
/**
 * Private cards: only the person who created one can see it. The board owner, other
 * members and admins never get its title, contents or id, through any route.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test_secret_that_is_at_least_32_characters_long";
  process.env.ADMIN_EMAIL = "admin@acme.com";
  process.env.SENDGRID_API_KEY = "";
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
import * as cards from "~/routes/api.cards";
import * as card from "~/routes/api.cards.$cardId";
import * as comments from "~/routes/api.cards.$cardId.comments";
import * as activity from "~/routes/api.cards.$cardId.activity";
import * as revisions from "~/routes/api.cards.$cardId.revisions";
import * as lock from "~/routes/api.cards.$cardId.lock";
import * as move from "~/routes/api.cards.$cardId.move";
import * as archived from "~/routes/api.archived-cards";
import * as adminAudit from "~/routes/api.admin.audit";

let ipCounter = 0;
function req(url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ "x-forwarded-for": `10.3.0.${++ipCounter % 250}` });
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

type BoardData = {
  board: { id: string };
  columns: { id: string; title: string; cardIds: string[] }[];
  cards: Record<string, { id: string; title: string; isPrivate?: boolean; assigneeId?: string | null }>;
};

const SECRET = "Surprise party for Brad";

describe("private cards", () => {
  let admin: Awaited<ReturnType<typeof activeUser>>; // board owner and admin
  let bob: Awaited<ReturnType<typeof activeUser>>; // member who creates the private card
  let boardId: string;
  let todo: string;
  let privateId: string;
  let publicA: string;
  let publicB: string;

  const getBoard = async (cookie: string, id = boardId): Promise<BoardData> =>
    (await board.loader({ request: req(`/api/board?boardId=${id}`, { cookie }) } as never)).json();
  const create = async (cookie: string, body: Record<string, unknown>) => {
    const res = await cards.action({ request: req("/api/cards", { method: "POST", cookie, body: { columnId: todo, ...body } }) } as never);
    expect(res.status).toBe(201);
    return res.json() as Promise<{ id: string; isPrivate: boolean; assigneeId: string | null }>;
  };
  const putCard = (cookie: string, id: string, body: Record<string, unknown>) =>
    card.action({ request: req(`/api/cards/${id}`, { method: "PUT", cookie, body }), params: { cardId: id } } as never);
  const auditText = async () =>
    JSON.stringify(await (await adminAudit.loader({ request: req("/api/admin/audit?limit=500", { cookie: admin.cookie }) } as never)).json());
  const todoIds = async (cookie: string) => (await getBoard(cookie)).columns.find((c) => c.id === todo)!.cardIds;

  beforeAll(async () => {
    const pg = new PGlite();
    const testDb = drizzle(pg, { schema });
    await migrate(testDb, { migrationsFolder: "./drizzle" });
    setFallbackDb(testDb as unknown as Database);
    admin = await activeUser("admin@acme.com", "Brad");
    bob = await activeUser("bob@acme.com", "Bob");
    const own = await (await board.loader({ request: req("/api/board", { cookie: admin.cookie }) } as never)).json();
    boardId = own.board.id;
    todo = own.columns[0].id;
    await members.action({
      request: req("/x", { method: "POST", cookie: admin.cookie, body: { userId: bob.id } }),
      params: { boardId },
    } as never);

    publicA = (await create(admin.cookie, { title: "Public A" })).id;
    const created = await create(bob.cookie, { title: SECRET, notes: "Cake at 3", isPrivate: true, assigneeId: admin.id });
    privateId = created.id;
    expect(created.isPrivate).toBe(true);
    expect(created.assigneeId).toBeNull(); // a private card is never assigned
    publicB = (await create(admin.cookie, { title: "Public B" })).id;
    await comments.action({
      request: req(`/api/cards/${privateId}/comments`, { method: "POST", cookie: bob.cookie, body: { content: "Buy balloons" } }),
      params: { cardId: privateId },
    } as never);
  });

  it("shows the card to its creator", async () => {
    const mine = await getBoard(bob.cookie);
    expect(mine.cards[privateId]).toMatchObject({ title: SECRET, isPrivate: true });
    expect(await todoIds(bob.cookie)).toEqual([publicA, privateId, publicB]);
  });

  it("leaves no trace of it on the board for anyone else, including the owner", async () => {
    const theirs = await getBoard(admin.cookie);
    expect(theirs.cards[privateId]).toBeUndefined();
    expect(theirs.columns.flatMap((c) => c.cardIds)).not.toContain(privateId);
    const raw = JSON.stringify(theirs);
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain(privateId);

    const everyone = JSON.stringify(await getBoard(admin.cookie, "all"));
    expect(everyone).not.toContain(SECRET);
    expect(everyone).not.toContain(privateId);
  });

  it("answers 404 on every card route for anyone else", async () => {
    const params = { cardId: privateId };
    const c = admin.cookie;
    const statuses = await Promise.all([
      putCard(c, privateId, { title: "Peek" }),
      card.action({ request: req(`/api/cards/${privateId}`, { method: "DELETE", cookie: c }), params } as never),
      comments.loader({ request: req(`/api/cards/${privateId}/comments`, { cookie: c }), params } as never),
      comments.action({ request: req(`/api/cards/${privateId}/comments`, { method: "POST", cookie: c, body: { content: "hi" } }), params } as never),
      activity.loader({ request: req(`/api/cards/${privateId}/activity`, { cookie: c }), params } as never),
      revisions.loader({ request: req(`/api/cards/${privateId}/revisions`, { cookie: c }), params } as never),
      lock.action({ request: req(`/api/cards/${privateId}/lock`, { method: "POST", cookie: c }), params } as never),
      move.action({ request: req(`/api/cards/${privateId}/move`, { method: "POST", cookie: c, body: { columnTitle: "Completed" } }), params } as never),
    ]);
    expect(statuses.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404]);
  });

  it("keeps the title and comment out of the admin audit log", async () => {
    const text = await auditText();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("Buy balloons");
    expect(text).toContain("Created a private card in To Do");
    expect(text).toContain("Commented on a private card");
  });

  it("keeps the card in place when someone else reorders the column", async () => {
    const seen = await todoIds(admin.cookie);
    expect(seen).toEqual([publicA, publicB]);
    const columns = (await getBoard(admin.cookie)).columns.map((col) =>
      col.id === todo ? { id: col.id, cardIds: [publicB, publicA] } : { id: col.id, cardIds: col.cardIds }
    );
    const res = await board.action({ request: req("/api/board", { method: "PUT", cookie: admin.cookie, body: { boardId, columns } }) } as never);
    expect(res.status).toBe(200);
    // It sat right after Public A, so it still does
    expect(await todoIds(bob.cookie)).toEqual([publicB, publicA, privateId]);
  });

  it("refuses a layout from someone else that includes the card", async () => {
    const columns = (await getBoard(admin.cookie)).columns.map((col) =>
      col.id === todo ? { id: col.id, cardIds: [privateId, ...col.cardIds] } : { id: col.id, cardIds: col.cardIds }
    );
    const res = await board.action({ request: req("/api/board", { method: "PUT", cookie: admin.cookie, body: { boardId, columns } }) } as never);
    expect(res.status).toBe(403);
  });

  it("can't be assigned while private", async () => {
    const res = await putCard(bob.cookie, privateId, { assigneeId: admin.id });
    expect(res.status).toBe(400);
  });

  it("hides the card's archive entry from others", async () => {
    const res = await card.action({ request: req(`/api/cards/${privateId}`, { method: "DELETE", cookie: bob.cookie }), params: { cardId: privateId } } as never);
    expect(res.status).toBe(200);
    const theirs = JSON.stringify(await (await archived.loader({ request: req(`/api/archived-cards?boardId=${boardId}`, { cookie: admin.cookie }) } as never)).json());
    expect(theirs).not.toContain(privateId);
    const mine = await (await archived.loader({ request: req(`/api/archived-cards?boardId=${boardId}`, { cookie: bob.cookie }) } as never)).json();
    expect(mine.map((c: { id: string }) => c.id)).toContain(privateId);
    await archived.action({ request: req("/api/archived-cards", { method: "POST", cookie: bob.cookie, body: { action: "restore", cardId: privateId, columnId: todo } }) } as never);
  });

  it("only lets the creator change who can see it", async () => {
    const made = await putCard(bob.cookie, privateId, { isPrivate: false });
    expect(made.status).toBe(200);
    expect((await getBoard(admin.cookie)).cards[privateId]).toMatchObject({ title: SECRET, isPrivate: false });

    // Now visible, but the owner still can't make Bob's card private
    const res = await putCard(admin.cookie, privateId, { isPrivate: true });
    expect(res.status).toBe(403);

    // Making it private again clears any assignee
    expect((await putCard(bob.cookie, privateId, { assigneeId: admin.id })).status).toBe(200);
    const again = await putCard(bob.cookie, privateId, { isPrivate: true });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ isPrivate: true, assigneeId: null });
    expect((await getBoard(admin.cookie)).cards[privateId]).toBeUndefined();
  });
});
