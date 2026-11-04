import { defineConfig } from "drizzle-kit";

// Used by `npm run db:generate` (create a migration from schema changes) and
// `npm run db:migrate` (apply migrations to DATABASE_URL, e.g. your Supabase project).
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
