# Database Setup Guide

This guide will help you set up MySQL database persistence for your Kanban board application using Prisma.

## Prerequisites

- MySQL server running locally (or remotely)
- Node.js and npm installed
- Database credentials (username, password, host, port)

## Setup Steps

### 1. Configure Database Connection

Create a `.env` file in the project root (if it doesn't exist):

```bash
cp .env.example .env
```

Edit the `.env` file and update the `DATABASE_URL` with your MySQL credentials:

```env
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE"
```

**Example:**
```env
DATABASE_URL="mysql://root:mypassword@localhost:3306/kanban"
```

**Note:** Make sure the database exists. If not, create it in MySQL:
```sql
CREATE DATABASE kanban;
```

### 2. Generate Prisma Client

Generate the Prisma Client based on your schema:

```bash
npm run db:generate
```

This will create the Prisma Client with TypeScript types for your models.

### 3. Push Schema to Database

Push the Prisma schema to your MySQL database:

```bash
npm run db:push
```

This will create the necessary tables (`Board`, `Column`, `Card`) in your MySQL database.

**Alternative: Use Migrations (Recommended for Production)**

If you prefer to use migrations instead of db push:

```bash
npm run db:migrate
```

This will create a migration file and apply it to your database.

### 4. Seed the Database

Seed your database with the default board and columns:

```bash
npm run db:seed
```

This will create:
- A default board
- Three default columns: TODO, In Progress, Completed

### 5. Verify Setup

You can verify the setup using Prisma Studio:

```bash
npm run db:studio
```

This will open a browser window where you can view and manage your database.

## Database Schema

The application uses the following schema:

### Board
- `id`: Unique identifier
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp
- `columns`: Related columns
- `cards`: Related cards

### Column
- `id`: Unique identifier
- `title`: Column name
- `position`: Order in the board
- `cardIds`: JSON array of card IDs in this column
- `boardId`: Reference to the board
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

### Card
- `id`: Unique identifier
- `title`: Card title
- `notes`: Card notes/description (TEXT)
- `generatedPrompt`: AI-generated prompt (TEXT, optional)
- `boardId`: Reference to the board
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

## Available Database Scripts

- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema to database (development)
- `npm run db:migrate` - Create and run migrations (production)
- `npm run db:studio` - Open Prisma Studio
- `npm run db:seed` - Seed the database with default data

## API Endpoints

The application uses the following API endpoints:

- `GET /api/board` - Get the board with all columns and cards
- `PUT /api/board` - Update board structure (for drag & drop)
- `POST /api/cards` - Create a new card
- `PUT /api/cards/:cardId` - Update a card
- `DELETE /api/cards/:cardId` - Delete a card
- `POST /api/columns` - Create a new column
- `DELETE /api/columns/:columnId` - Delete a column

## Troubleshooting

### Connection Errors

If you get connection errors:
1. Verify MySQL is running
2. Check your credentials in `.env`
3. Ensure the database exists
4. Check firewall settings

### Migration Errors

If migrations fail:
1. Check your database connection
2. Ensure you have proper permissions
3. Try `npm run db:push` instead for development

### Seeding Errors

If seeding fails:
1. Make sure the schema is pushed to the database first
2. Check if a board already exists (seeding creates one board)
3. Check the console for detailed error messages

## Next Steps

After setup is complete:
1. Start the development server: `npm run dev`
2. The application will now use MySQL for data persistence instead of localStorage
3. All data will be stored in your MySQL database
4. You can manage data using Prisma Studio: `npm run db:studio`
