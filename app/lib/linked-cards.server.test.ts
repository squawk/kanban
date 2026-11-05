// @vitest-environment node
/**
 * Cards assigned to you on someone else's board also appear on your own board, in
 * the column with the same name, and moving them there moves them on their board.
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
import * as move from "~/routes/api.cards.$cardId.move";
import * as columnsRoute from "~/routes/api.columns";
import * as adminAudit from "~/routes/api.admin.audit";

let ipCounter = 0;
function req(url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ "x-forwarded-for": `10.2.0.${++ipCounter % 250}` });
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
  cards: Record<string, { id: string; title: string; linkedFrom?: { boardId: string; boardName: string; columnTitle: string | null } }>;
};
const getBoard = async (cookie: string, boardId?: string): Promise<BoardData> =>
  (await board.loader({ request: req(`/api/board${boardId ? `?boardId=${boardId}` : ""}`, { cookie }) } as never)).json();
const columnOf = (b: BoardData, cardId: string) => b.columns.find((c) => c.cardIds.includes(cardId))?.title;

describe("cards assigned to you on another board", () => {
  let admin: Awaited<ReturnType<typeof activeUser>>;
  let bob: Awaited<ReturnType<typeof activeUser>>;
  let eve: Awaited<ReturnType<typeof activeUser>>;
  let adminBoard: BoardData;
  let cardId: string;

  const createCard = async (title: string, columnId: string, assigneeId?: string) => {
    const res = await cards.action({
      request: req("/api/cards", { method: "POST", cookie: admin.cookie, body: { title, columnId, ...(assigneeId && { assigneeId }) } }),
    } as never);
    expect(res.status).toBe(201);
    return (await res.json()).id as string;
  };
  const moveCard = async (id: string, columnTitle: string, cookie = bob.cookie) =>
    move.action({ request: req(`/api/cards/${id}/move`, { method: "POST", cookie, body: { columnTitle } }), params: { cardId: id } } as never);

  beforeAll(async () => {
    const pg = new PGlite();
    const testDb = drizzle(pg, { schema });
    await migrate(testDb, { migrationsFolder: "./drizzle" });
    setFallbackDb(testDb as unknown as Database);
    admin = await activeUser("admin@acme.com", "Brad");
    bob = await activeUser("bob@acme.com", "Bob");
    eve = await activeUser("eve@acme.com", "Eve");
    adminBoard = await getBoard(admin.cookie);
    await members.action({
      request: req("/x", { method: "POST", cookie: admin.cookie, body: { userId: bob.id } }),
      params: { boardId: adminBoard.board.id },
    } as never);
    cardId = await createCard("Renew domain", adminBoard.columns[0].id, bob.id);
  });

  it("shows the card on the assignee's own board, in the column with the same name", async () => {
    const mine = await getBoard(bob.cookie);
    expect(columnOf(mine, cardId)).toBe("To Do");
    expect(mine.cards[cardId].linkedFrom).toEqual({ boardId: adminBoard.board.id, boardName: "Brad's board", columnTitle: "To Do" });

    // Still a normal card on the board it lives on, for everyone who opens that board
    const theirs = await getBoard(admin.cookie);
    expect(theirs.cards[cardId].linkedFrom).toBeUndefined();
    const asMember = await getBoard(bob.cookie, adminBoard.board.id);
    expect(asMember.cards[cardId].linkedFrom).toBeUndefined();
    expect(asMember.columns.flatMap((c) => c.cardIds).filter((id) => id === cardId)).toHaveLength(1);
  });

  it("moves the card on its own board when the assignee moves it", async () => {
    const res = await moveCard(cardId, "in progress"); // names match ignoring case
    expect(res.status).toBe(200);
    expect(columnOf(await getBoard(admin.cookie), cardId)).toBe("In Progress");
    expect(columnOf(await getBoard(bob.cookie), cardId)).toBe("In Progress");

    const audit = await (await adminAudit.loader({ request: req("/api/admin/audit", { cookie: admin.cookie }) } as never)).json();
    const entries: { summary: string }[] = audit.entries ?? audit;
    expect(entries.some((e) => e.summary === 'Moved "Renew domain" from To Do to In Progress')).toBe(true);
  });

  it("refuses a column the card's board doesn't have, and people without access", async () => {
    const missing = await moveCard(cardId, "Review");
    expect(missing.status).toBe(409);
    expect(columnOf(await getBoard(admin.cookie), cardId)).toBe("In Progress");
    expect((await moveCard(cardId, "Completed", eve.cookie)).status).toBe(404);
  });

  it("puts cards from a column the assignee doesn't have in their first column", async () => {
    const col = await (await columnsRoute.action({
      request: req("/api/columns", { method: "POST", cookie: admin.cookie, body: { title: "Review" } }),
    } as never)).json();
    const reviewCard = await createCard("Check copy", col.id, bob.id);
    const mine = await getBoard(bob.cookie);
    expect(columnOf(mine, reviewCard)).toBe("To Do");
    expect(mine.cards[reviewCard].linkedFrom?.columnTitle).toBe("Review");
  });

  it("lets the assignee keep saving their own board layout", async () => {
    const mine = await getBoard(bob.cookie);
    const ownOnly = mine.columns.map((c) => ({ id: c.id, cardIds: c.cardIds.filter((id) => !mine.cards[id].linkedFrom) }));
    const ok = await board.action({ request: req("/api/board", { method: "PUT", cookie: bob.cookie, body: { columns: ownOnly } }) } as never);
    expect(ok.status).toBe(200);
    // The linked card can't be saved into Bob's board
    const withLinked = await board.action({ request: req("/api/board", { method: "PUT", cookie: bob.cookie, body: { columns: mine.columns } }) } as never);
    expect(withLinked.status).toBe(403);
  });

  it("drops the card from the old assignee's board when it's reassigned or archived", async () => {
    const unassign = await card.action({
      request: req(`/api/cards/${cardId}`, { method: "PUT", cookie: admin.cookie, body: { assigneeId: null } }),
      params: { cardId },
    } as never);
    expect(unassign.status).toBe(200);
    expect((await getBoard(bob.cookie)).cards[cardId]).toBeUndefined();

    const other = await createCard("Archived soon", adminBoard.columns[0].id, bob.id);
    expect((await getBoard(bob.cookie)).cards[other]).toBeDefined();
    await card.action({ request: req(`/api/cards/${other}`, { method: "DELETE", cookie: admin.cookie }), params: { cardId: other } } as never);
    expect((await getBoard(bob.cookie)).cards[other]).toBeUndefined();
  });

  it("doesn't show your own cards twice", async () => {
    const mine = await getBoard(bob.cookie);
    const own = await cards.action({
      request: req("/api/cards", { method: "POST", cookie: bob.cookie, body: { title: "Mine", columnId: mine.columns[0].id, assigneeId: bob.id } }),
    } as never);
    const ownId = (await own.json()).id;
    const after = await getBoard(bob.cookie);
    expect(after.cards[ownId].linkedFrom).toBeUndefined();
    expect(after.columns.flatMap((c) => c.cardIds).filter((id) => id === ownId)).toHaveLength(1);
  });
});
