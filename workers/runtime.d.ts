/**
 * Minimal Cloudflare Workers runtime types used by the server code.
 *
 * The full @cloudflare/workers-types (or `wrangler types` with the runtime) override
 * DOM types such as Response.json(), which breaks the React client code that shares
 * this TypeScript project, so only what we use is declared here.
 */
interface Hyperdrive {
  readonly connectionString: string;
}

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}

interface ExportedHandler<E = unknown> {
  fetch?(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response>;
  scheduled?(controller: ScheduledController, env: E, ctx: ExecutionContext): void | Promise<void>;
}

declare module "virtual:react-router/server-build" {
  import type { ServerBuild } from "react-router";
  const build: ServerBuild;
  export = build;
}
