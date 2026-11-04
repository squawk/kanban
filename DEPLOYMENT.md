# Deployment: Cloudflare Workers + Supabase

The app runs on **Cloudflare Workers** at **https://kanban.skyhawklabs.dev**, with
**Supabase Postgres** as the database, reached through **Cloudflare Hyperdrive**
(connection pooling and caching close to the Worker).

| Piece | Where it's configured |
| --- | --- |
| Worker, custom domain, cron, rate limits, non-secret vars | `wrangler.jsonc` |
| Secrets | `npx wrangler secret put <NAME>` |
| Database schema | `app/lib/db/schema.ts` → migrations in `drizzle/` |
| CI deploy | `.github/workflows/deploy.yml` (push to `main`) |
| Due-date reminders | Cron Trigger `17 * * * *` → `workers/app.ts` `scheduled()` |

## One-time setup

### 1. Supabase project
1. Create a project (a US West region is closest to the old Fly `sjc` region).
2. **Project Settings → Database → Connection string**. Copy two strings:
   - **Direct connection**: used by Hyperdrive.
   - **Session pooler**: used from your machine and GitHub Actions for migrations
     (the direct connection is IPv6-only unless you buy Supabase's IPv4 add-on).
3. Create the tables. Migration `0001` enables Row Level Security on every table, which
   blocks Supabase's public Data API (the app connects as the table owner, so it isn't affected):
   ```bash
   DATABASE_URL="<session pooler string>" npm run db:migrate
   ```

### 2. Hyperdrive
```bash
npx wrangler hyperdrive create kanban-db --connection-string="<direct connection string>"
```
Paste the returned id into `wrangler.jsonc` → `hyperdrive[0].id`, then run `npm run cf-typegen`.

### 3. Secrets
Reuse the current production values, so `SESSION_SECRET` keeps old admin-approval email links working.
```bash
npx wrangler secret put SESSION_SECRET        # ≥ 32 chars
npx wrangler secret put SENDGRID_API_KEY
npx wrangler secret put FROM_EMAIL            # must be a verified SendGrid sender
npx wrangler secret put OPENAI_API_KEY        # AI prompt generation
npx wrangler secret put RECAPTCHA_SECRET_KEY  # optional
npx wrangler secret put CRON_SECRET           # optional: enables POST /api/cron/due-reminders
```
Non-secret settings (`APP_URL`, `ADMIN_EMAIL`, `SIGNUP_MODE`, `REMINDER_TIMEZONE`, …) are in
`wrangler.jsonc` → `vars`. The sign-up policy there is only a default: admins change it under
**Admin → Sign-up**.

If you send from `@skyhawklabs.dev`, complete SendGrid **domain authentication** and add its DNS
records in the Cloudflare dashboard.

### 4. GitHub Actions
Add repository secrets `CLOUDFLARE_API_TOKEN` (Workers edit permission), `CLOUDFLARE_ACCOUNT_ID`,
and optionally `DATABASE_URL` (session pooler) so migrations run before each deploy. If you use
reCAPTCHA, add a repository **variable** `VITE_RECAPTCHA_SITE_KEY`.

## Cutover from Fly.io

1. **Snapshot the SQLite database.** The backup API captures a consistent copy, including WAL contents:
   ```bash
   fly ssh console -a kanban-purple -C "node -e \"require('better-sqlite3')('/data/data.db').backup('/data/export.db').then(() => console.log('ok'))\""
   fly ssh sftp get /data/export.db ./data.db -a kanban-purple
   ```
2. **Import it into Supabase.** Run the dry run first: it reports per-table counts, plus orphaned
   rows (left over from when SQLite didn't enforce foreign keys) that will be skipped.
   ```bash
   DATABASE_URL="<session pooler>" npm run db:import-sqlite -- ./data.db --dry-run
   DATABASE_URL="<session pooler>" npm run db:import-sqlite -- ./data.db
   ```
   The import runs in one transaction and refuses to run if the target already has users.
3. **Deploy**: merge to `main`, or run `npm run deploy` locally. The `kanban.skyhawklabs.dev`
   custom domain, its DNS record, and its certificate are created automatically because the zone is
   on Cloudflare.
4. **Smoke test**: sign in (everyone has to sign in again), open a board, and check **Admin → Audit log**.
5. **Decommission Fly** once you're happy: `fly scale count 0 -a kanban-purple`, and later
   `fly apps destroy kanban-purple`. Until then Fly is your rollback.

Writes made on Fly after the snapshot are not copied over, so take the snapshot right before
deploying (or scale Fly to zero first).

## Local development

```bash
cp .dev.vars.example .dev.vars          # local secrets
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://postgres:postgres@localhost:5432/kanban"
DATABASE_URL="$CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE" npm run db:migrate
npm run dev                             # runs in workerd via @cloudflare/vite-plugin
```
Any Postgres works locally (Docker, Postgres.app, `supabase start`, or a dev Supabase project).
Without `SENDGRID_API_KEY`, emails are printed to the console in development.

To trigger the reminder cron locally:
`curl "http://localhost:5173/cdn-cgi/handler/scheduled?time=$(date +%s)000"`.

## Schema changes
1. Edit `app/lib/db/schema.ts`.
2. `npm run db:generate`, then review the SQL in `drizzle/`.
3. Commit. CI applies the migration before deploying (when `DATABASE_URL` is set), or run
   `npm run db:migrate` yourself.
