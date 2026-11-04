/**
 * Cloudflare Worker entry: serves the React Router app and runs scheduled jobs.
 *
 * Every request/cron run gets its own Postgres client (via Hyperdrive) in an
 * AsyncLocalStorage context; the client is closed after background work such as
 * notification emails has finished.
 */
import { createRequestHandler } from "react-router";
import { createDb, runWithContext, type RequestContext } from "../app/lib/db";
import { runDueReminders } from "../app/lib/due-reminders.server";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

/** Expose string vars/secrets on process.env for code that reads configuration there. */
function populateProcessEnv(env: Env) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") process.env[key] = value;
  }
}

async function withRequestContext<T>(env: Env, ctx: ExecutionContext, fn: () => Promise<T>): Promise<T> {
  populateProcessEnv(env);
  const { db, close } = createDb(env.HYPERDRIVE.connectionString);
  const background: Promise<unknown>[] = [];
  const context: RequestContext = {
    db,
    env: env as unknown as Record<string, unknown>,
    waitUntil: (promise) => {
      background.push(promise);
      ctx.waitUntil(promise);
    },
  };
  try {
    return await runWithContext(context, fn);
  } finally {
    // Close the connection once any background work (emails) is done
    ctx.waitUntil(Promise.allSettled(background).then(() => close()));
  }
}

export default {
  async fetch(request, env, ctx) {
    return withRequestContext(env, ctx, () => requestHandler(request, { cloudflare: { env, ctx } }));
  },

  // Cron Trigger (wrangler.jsonc): hourly due-date reminder check
  async scheduled(controller, env, ctx) {
    await withRequestContext(env, ctx, async () => {
      const result = await runDueReminders(new Date(controller.scheduledTime));
      console.log("Due reminders:", JSON.stringify(result));
    });
  },
} satisfies ExportedHandler<Env>;
