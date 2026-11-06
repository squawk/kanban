// @vitest-environment node
/**
 * Clients: a shared list anyone can add to (name + color), admins manage it, and a
 * card can optionally be for one client, tracked in its history like any field.
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
import * as cards from "~/routes/api.cards";
import * as card from "~/routes/api.cards.$cardId";
import * as revisions from "~/routes/api.cards.$cardId.revisions";
import * as clientsRoute from "~/routes/api.clients";
import * as clientRoute from "~/routes/api.clients.$clientId";
import * as adminAudit from "~/routes/api.admin.audit";

let ipCounter = 0;
function req(url: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ "x-forwarded-for": `10.4.0.${++ipCounter % 250}` });
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

type ClientJson = { id: string; name: string; color: string; archived: boolean };

describe("clients", () => {
  let admin: Awaited<ReturnType<typeof activeUser>>;
  let bob: Awaited<ReturnType<typeof activeUser>>;
  let todo: string;
  let acme: ClientJson;

  const addClient = (cookie: string, body: Record<string, unknown>) =>
    clientsRoute.action({ request: req("/api/clients", { method: "POST", cookie, body }) } as never);
  const listClients = async (cookie: string, all = false): Promise<ClientJson[]> =>
    (await clientsRoute.loader({ request: req(`/api/clients${all ? "?all=1" : ""}`, { cookie }) } as never)).json();
  const patchClient = (cookie: string, id: string, body: Record<string, unknown>) =>
    clientRoute.action({ request: req(`/api/clients/${id}`, { method: "PATCH", cookie, body }), params: { clientId: id } } as never);
  const putCard = (cookie: string, id: string, body: Record<string, unknown>) =>
    card.action({ request: req(`/api/cards/${id}`, { method: "PUT", cookie, body }), params: { cardId: id } } as never);
  const cardOnBoard = async (cookie: string, id: string) =>
    (await (await board.loader({ request: req("/api/board", { cookie }) } as never)).json()).cards[id];

  beforeAll(async () => {
    const pg = new PGlite();
    const testDb = drizzle(pg, { schema });
    await migrate(testDb, { migrationsFolder: "./drizzle" });
    setFallbackDb(testDb as unknown as Database);
    admin = await activeUser("admin@acme.com", "Brad");
    bob = await activeUser("bob@acme.com", "Bob");
    todo = (await (await board.loader({ request: req("/api/board", { cookie: admin.cookie }) } as never)).json()).columns[0].id;
  });

  it("lets anyone add a client, and returns the existing one for the same name in any case", async () => {
    const res = await addClient(bob.cookie, { name: "  Acme   Corp ", color: "#3B82F6" });
    expect(res.status).toBe(201);
    acme = await res.json();
    expect(acme).toMatchObject({ name: "Acme Corp", color: "#3b82f6", archived: false });

    const again = await addClient(admin.cookie, { name: "acme corp", color: "#ff0000" });
    expect(again.status).toBe(200);
    expect((await again.json()).id).toBe(acme.id);
    expect(await listClients(bob.cookie)).toHaveLength(1);
  });

  it("rejects a missing name or a bad color", async () => {
    expect((await addClient(bob.cookie, { name: "  ", color: "#000000" })).status).toBe(400);
    expect((await addClient(bob.cookie, { name: "Globex", color: "red" })).status).toBe(400);
  });

  it("sets, shows and clears a card's client, and records it in the card's history", async () => {
    const created = await cards.action({
      request: req("/api/cards", { method: "POST", cookie: admin.cookie, body: { title: "Kickoff deck", columnId: todo, clientId: acme.id } }),
    } as never);
    expect(created.status).toBe(201);
    const c = await created.json();
    expect(c.client).toMatchObject({ id: acme.id, name: "Acme Corp", color: "#3b82f6" });
    expect((await cardOnBoard(admin.cookie, c.id)).client.name).toBe("Acme Corp");

    const cleared = await putCard(admin.cookie, c.id, { clientId: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).client).toBeNull();

    const history = await (await revisions.loader({ request: req(`/api/cards/${c.id}/revisions`, { cookie: admin.cookie }), params: { cardId: c.id } } as never)).json();
    const latest = history.revisions?.[0] ?? history[0];
    expect(latest.changedFields).toContain("client");
    expect(latest.client).toBeNull();

    // Restoring version 1 brings the client back
    const restored = await revisions.action({
      request: req(`/api/cards/${c.id}/revisions`, { method: "POST", cookie: admin.cookie, body: { version: 1 } }),
      params: { cardId: c.id },
    } as never);
    expect(restored.status).toBe(200);
    expect((await restored.json()).card.client.name).toBe("Acme Corp");

    const audit = JSON.stringify(await (await adminAudit.loader({ request: req("/api/admin/audit?limit=200", { cookie: admin.cookie }) } as never)).json());
    expect(audit).toContain("Updated client on");
    expect(audit).toContain('Added client \\"Acme Corp\\"');
  });

  it("refuses an unknown client", async () => {
    const res = await cards.action({
      request: req("/api/cards", { method: "POST", cookie: admin.cookie, body: { title: "x", columnId: todo, clientId: "nope" } }),
    } as never);
    expect(res.status).toBe(400);
  });

  it("only lets admins rename, recolor and archive; archived clients stay on cards but can't be picked", async () => {
    expect((await patchClient(bob.cookie, acme.id, { name: "Hijacked" })).status).toBe(403);

    const kept = await (await cards.action({
      request: req("/api/cards", { method: "POST", cookie: admin.cookie, body: { title: "Retainer", columnId: todo, clientId: acme.id } }),
    } as never)).json();

    const res = await patchClient(admin.cookie, acme.id, { name: "Acme Inc", color: "#16a34a", archived: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Acme Inc", color: "#16a34a", archived: true });

    // Gone from the picker, still listed for admins, still on the card
    expect(await listClients(bob.cookie)).toEqual([]);
    expect((await listClients(admin.cookie, true)).map((c) => c.name)).toEqual(["Acme Inc"]);
    expect((await cardOnBoard(admin.cookie, kept.id)).client).toMatchObject({ name: "Acme Inc", archived: true });

    // Editing that card without touching the client is fine; picking it for another isn't
    expect((await putCard(admin.cookie, kept.id, { title: "Retainer (Q1)", clientId: acme.id })).status).toBe(200);
    const other = await cards.action({
      request: req("/api/cards", { method: "POST", cookie: admin.cookie, body: { title: "New work", columnId: todo, clientId: acme.id } }),
    } as never);
    expect(other.status).toBe(400);

    // Adding the archived name again brings it back instead of making a duplicate
    const back = await addClient(bob.cookie, { name: "acme inc", color: "#000000" });
    expect(await back.json()).toMatchObject({ id: acme.id, archived: false });
  });

  it("refuses renaming a client to another client's name", async () => {
    const globex = await (await addClient(bob.cookie, { name: "Globex", color: "#7c3aed" })).json();
    expect((await patchClient(admin.cookie, globex.id, { name: "ACME INC" })).status).toBe(409);
  });
});
