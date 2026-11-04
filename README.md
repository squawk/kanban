# kanban

A modern kanban board application built with React Router 7, Tailwind CSS, and shadcn/ui.

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
- **Email notifications** (SendGrid): when you're assigned a card, when someone comments on or moves a card you created or are assigned to, and when a board is shared with you. Users can turn these off from the account menu (click your avatar).

See `.env.example` for the related environment variables.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/squawk/kanban.git
cd kanban
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run start` - Start the production server
- `npm run typecheck` - Run TypeScript type checking

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

## License

MIT