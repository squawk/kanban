import { test as base, expect, type Page } from "@playwright/test";
import postgres from "postgres";

/**
 * Shared e2e helpers. The suite runs against a real dev server (`npm run dev`) and a
 * local Postgres (DATABASE_URL, migrated with `npm run db:migrate`). Every spec signs in
 * as one test user (see auth.setup.ts) and starts from a freshly created board.
 */
export const E2E_USER = {
  email: process.env.E2E_EMAIL ?? "e2e@example.com",
  password: process.env.E2E_PASSWORD ?? "E2e-test-Passw0rd!",
  name: "E2E User",
};

export const STORAGE_STATE = "e2e/.auth/user.json";

let sql: postgres.Sql | undefined;
function db() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must point at the dev server's Postgres (the same database as " +
        "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE)"
    );
  }
  sql ??= postgres(url, { max: 1, onnotice: () => {} });
  return sql;
}

/** Mark the test user's email as verified (sign-up sends a verification email). */
export async function verifyTestUser() {
  await db()`UPDATE users SET email_verified = true WHERE email = ${E2E_USER.email.toLowerCase()}`;
}

/**
 * Delete the test user's board (columns and cards cascade). The app recreates a fresh
 * "My Board" with the default columns on the next request, so each test starts clean.
 */
export async function resetBoard() {
  await db()`DELETE FROM boards WHERE user_id = (SELECT id FROM users WHERE email = ${E2E_USER.email.toLowerCase()})`;
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * `test` with a clean board: each test resets the e2e user's board in the database,
 * opens the app (already signed in via the setup project) and waits for the board.
 */
export const test = base.extend<{ board: Page }>({
  board: async ({ page }, use) => {
    await resetBoard();
    await page.goto("/");
    await expect(column(page, "To Do")).toBeVisible();
    await use(page);
  },
});
export { expect };

export const DEFAULT_COLUMNS = ["To Do", "In Progress", "Completed"] as const;

/** A board column, by its exact title */
export const column = (page: Page, title: string) =>
  page
    .getByTestId("kanban-column")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/** A card on the board, by its exact title */
export const card = (page: Page, title: string) =>
  page.getByTestId("kanban-card").filter({ has: page.getByText(title, { exact: true }) });

/** The open card/column dialog */
export const dialog = (page: Page) => page.getByRole("dialog");

/** YYYY-MM-DD for today + `offsetDays`, in local time (what <input type="date"> takes) */
export function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: d,
    value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

export async function openNewCardDialog(page: Page, columnTitle = "To Do") {
  await column(page, columnTitle).getByRole("button", { name: "Add Card" }).click();
  await expect(dialog(page).getByText("Create New Card")).toBeVisible();
}

export async function openEditCardDialog(page: Page, title: string) {
  const target = card(page, title);
  await target.hover();
  await target.getByRole("button", { name: "Edit card" }).click();
  await expect(dialog(page).getByText("Edit Card")).toBeVisible();
}

/** Fill the open card dialog's fields */
export async function fillCardFields(
  page: Page,
  fields: {
    title?: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
    dueDate?: string;
    toggleTags?: string[];
  }
) {
  const d = dialog(page);
  if (fields.title !== undefined) await d.getByPlaceholder("Enter card title...").fill(fields.title);
  if (fields.notes !== undefined) await d.getByPlaceholder("Add notes or description...").fill(fields.notes);
  if (fields.priority) await d.locator("select#priority").selectOption(fields.priority);
  if (fields.dueDate) await d.locator("input#dueDate").fill(fields.dueDate);
  for (const tag of fields.toggleTags ?? []) {
    await d.getByRole("button", { name: tag, exact: true }).click();
  }
}

/** Create a card through the UI and wait for it to appear */
export async function createCard(
  page: Page,
  fields: {
    title: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
    dueDate?: string;
    tags?: string[];
    column?: string;
  }
) {
  await openNewCardDialog(page, fields.column);
  await fillCardFields(page, { ...fields, toggleTags: fields.tags });
  await dialog(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(card(page, fields.title)).toBeVisible();
  return card(page, fields.title);
}

export async function createColumn(page: Page, title: string) {
  await page.getByRole("button", { name: "Add Column" }).click();
  await expect(dialog(page).getByText("Create New Column")).toBeVisible();
  await dialog(page).getByPlaceholder("Enter column title...").fill(title);
  await dialog(page).getByRole("button", { name: "Create", exact: true }).click();
  await expect(column(page, title)).toBeVisible();
  return column(page, title);
}

/**
 * Drag a card with real pointer moves: dnd-kit's PointerSensor only starts a drag after
 * the pointer moves 8px, which a single jump (locator.dragTo) doesn't always produce.
 */
export async function dragCard(page: Page, title: string, target: ReturnType<typeof column>) {
  const from = await card(page, title).boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag source or target is not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}
