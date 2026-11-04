/**
 * Database access.
 *
 * On Cloudflare Workers each request gets its own postgres.js client connected
 * through Hyperdrive (which does the real pooling). The client lives in an
 * AsyncLocalStorage request context so library code can keep importing `db`.
 *
 * Outside a request (tests, scripts) a fallback database is used: one set with
 * `setFallbackDb` (tests use in-process PGlite) or `DATABASE_URL`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface RequestContext {
  db: Database;
  /** Cloudflare bindings (rate limiters etc.); empty outside Workers */
  env: Record<string, unknown>;
  /** Keep the Worker alive for background work (emails) after the response is sent */
  waitUntil: (promise: Promise<unknown>) => void;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 5,
    // Hyperdrive caches and pools; avoid an extra round trip on connect
    fetch_types: false,
  });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

let fallback: Database | null = null;

/** Use a specific database outside of request contexts (tests, scripts). */
export function setFallbackDb(database: Database | null) {
  fallback = database;
}

export function getDb(): Database {
  const ctx = storage.getStore();
  if (ctx) return ctx.db;
  if (fallback) return fallback;
  if (process.env.DATABASE_URL) {
    fallback = createDb(process.env.DATABASE_URL).db;
    return fallback;
  }
  throw new Error("No database available: run inside a request context or set DATABASE_URL");
}

/** Schedule background work that must finish even after the response is sent. */
export function waitUntil(promise: Promise<unknown>) {
  const ctx = storage.getStore();
  if (ctx) ctx.waitUntil(promise);
}

/** The current request's database. Resolved lazily on every property access. */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const current = getDb() as unknown as Record<string | symbol, unknown>;
    const value = current[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(current) : value;
  },
});

/** `.then(firstRow)` turns a select into "first row or undefined". */
export function firstRow<T>(rows: T[]): T | undefined {
  return rows[0];
}
