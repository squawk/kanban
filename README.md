# kanban

A modern kanban board application built with React Router 7, Tailwind CSS, and shadcn/ui.

## Features

- **React Router 7**: Modern routing solution with built-in data loading and actions
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- **shadcn/ui**: Beautiful and accessible UI components built with Radix UI and Tailwind CSS
- **TypeScript**: Full type safety throughout the application
- **Vite**: Lightning-fast development experience

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