# kanban

A modern kanban board application built with React Router 7, Tailwind CSS, and shadcn/ui,
running on Cloudflare Workers (https://kanban.skyhawklabs.dev) with Supabase Postgres.
See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, deployment, and local development.

## Features

- **React Router 7**: Modern routing solution with built-in data loading and actions
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- **shadcn/ui**: Beautiful and accessible UI components built with Radix UI and Tailwind CSS
- **TypeScript**: Full type safety throughout the application
- **Vite**: Lightning-fast development experience

## Teams, Roles & Admin

- **Roles**: users are `admin` or `member`. Addresses in `ADMIN_EMAIL` are bootstrapped as admins; admins can promote or demote others from **Admin → Users** (the last active admin can't be removed).
- **Sign-up policy** (**Admin → Sign-up**): open, restricted to specific email domains, or invite only (closed). Optionally require admin approval for new sign-ups.
- **Invitations** (**Admin → Invitations**): admins invite people by email with a role. Invite links are single-use, expire after 7 days, and can be revoked or re-sent. If email isn't configured, the admin gets a copyable link instead.
- **User management**: approve or reject pending sign-ups, disable accounts (signs them out immediately), or delete them.
- **Shared boards & assignment**: board owners share their board with other users from the **Share** button. Anyone on a board can assign cards to board members, filter by "Assigned to me" or "Unassigned", and see everything assigned to them across boards in **My Tasks**.
- **Audit trail**: sign-ins, admin actions, sharing, and every card change (field-level diffs, moves, assignments, comments) are recorded. Admins can search, filter, and export the log as CSV; board members see a card's history under **Show activity**.
- **Due-date reminders**: a daily digest email to each person with cards due tomorrow or today and cards that have just become overdue (assignee first, otherwise the card's creator). Cards in a Completed/Done column are skipped, each reminder is sent once (changing the due date re-arms it), and the same opt-out applies. A Cloudflare Cron Trigger checks hourly (nothing is sent before `REMINDER_HOUR` in `REMINDER_TIMEZONE`); `POST /api/cron/due-reminders` with `CRON_SECRET` triggers a run on demand.
- **Live updates**: shared boards update instantly for everyone viewing them (Supabase Realtime Broadcast on private channels: browsers join with short-lived, board-scoped JWTs checked by RLS; a "Live" indicator shows the connection). **Presence** shows who is viewing the board right now (green dots on member avatars).
- **Edit history & undo**: every card save records a full version (who, when, which fields). After saving, a toast offers **Undo** (also Ctrl/⌘+Z), and then Redo. The card's **History** panel shows each version with a field-by-field diff and **Restore**. Restoring adds a new version, so it can be undone too. Saves and restores carry the version they were based on, so a change made from a stale copy is refused (with "Load latest version") instead of silently overwriting someone else's edit.
- **Card locking**: opening a card's editor takes a server-side lock (a 90-second lease the open dialog renews every 30 seconds), so a closed tab never leaves a card stuck. Others see "🔒 Bob is editing" on the card and get a read-only view; they can still comment, and the card unlocks for them automatically, with the latest version, once Bob is done. The board owner can **take over** (audited, and the previous editor is told). Edits and archiving by anyone but the holder are rejected by the server (HTTP 423). Updates wait while you're editing or dragging, and polling takes over if Realtime is unavailable.
- **Email notifications** (SendGrid): when you're assigned a card, when someone comments on or moves a card you created or are assigned to, and when a board is shared with you. Users can turn these off from the account menu (click your avatar).

Configuration lives in `wrangler.jsonc` (vars) and Worker secrets; see `.dev.vars.example`.

## Getting Started

```bash
npm install
cp .dev.vars.example .dev.vars
```

You need a Postgres database for local development. See [DEPLOYMENT.md](DEPLOYMENT.md#local-development).

## Available Scripts

- `npm run dev`: start the dev server (runs in the Workers runtime)
- `npm run build` / `npm run preview`: build, and preview the production build locally
- `npm run deploy`: build and deploy to Cloudflare
- `npm run typecheck`: generate types and run TypeScript
- `npm test`: run tests (server tests use in-process Postgres via PGlite)
- `npm run db:generate` / `npm run db:migrate`: create and apply Drizzle migrations
- `npm run db:import-sqlite -- <file>`: one-time import from the old SQLite database

## Project Structure

```
kanban/
├── app/
│   ├── components/
│   │   └── ui/          # shadcn/ui components
│   ├── lib/             # Utility functions
│   ├── routes/          # Application routes
│   ├── app.css          # Global styles with Tailwind
│   └── root.tsx         # Root layout
├── build/               # Production build output
├── public/              # Static assets
└── package.json
```

## Technology Stack

- [React Router 7](https://reactrouter.com) - Routing
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [shadcn/ui](https://ui.shadcn.com) - UI Components
- [TypeScript](https://www.typescriptlang.org) - Type Safety
- [Vite](https://vitejs.dev) - Build Tool
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) + [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) - Hosting
- [Supabase Postgres](https://supabase.com) + [Drizzle ORM](https://orm.drizzle.team) - Database

## License

MIT