import {
  test,
  expect,
  DEFAULT_COLUMNS,
  card,
  column,
  createCard,
  createColumn,
  dialog,
  openEditCardDialog,
  openNewCardDialog,
} from "./support";

test.describe("Kanban Board E2E Tests", () => {
  test("should load the kanban board", async ({ board: page }) => {
    await expect(page.getByRole("heading", { name: "Kanban Board", level: 1 })).toBeVisible();
    await expect(page.getByTestId("board-name")).toHaveText("My Board");

    for (const title of DEFAULT_COLUMNS) {
      await expect(column(page, title)).toBeVisible();
    }
  });

  test("should create a new card", async ({ board: page }) => {
    await openNewCardDialog(page);

    await dialog(page).getByPlaceholder("Enter card title...").fill("E2E Test Task");
    await dialog(page).getByPlaceholder("Add notes or description...").fill("This is an end-to-end test");
    await dialog(page).getByRole("button", { name: "Create", exact: true }).click();

    const created = card(page, "E2E Test Task");
    await expect(column(page, "To Do").getByTestId("kanban-card")).toHaveCount(1);
    await expect(created).toBeVisible();
    await expect(created.getByText("This is an end-to-end test")).toBeVisible();
  });

  test("should edit a card", async ({ board: page }) => {
    await createCard(page, { title: "Original Title" });

    await openEditCardDialog(page, "Original Title");
    await dialog(page).getByPlaceholder("Enter card title...").fill("Updated Title");
    await dialog(page).getByPlaceholder("Add notes or description...").fill("Updated notes");
    await dialog(page).getByRole("button", { name: "Update", exact: true }).click();
    await expect(dialog(page)).toBeHidden();

    await expect(card(page, "Updated Title")).toBeVisible();
    await expect(card(page, "Updated Title").getByText("Updated notes")).toBeVisible();
    await expect(card(page, "Original Title")).toHaveCount(0);
  });

  test("should delete a card", async ({ board: page }) => {
    const created = await createCard(page, { title: "Card to Delete" });

    await created.hover();
    await created.getByRole("button", { name: "Delete card" }).click();

    await expect(card(page, "Card to Delete")).toHaveCount(0);
    await page.reload();
    await expect(column(page, "To Do")).toBeVisible();
    await expect(card(page, "Card to Delete")).toHaveCount(0);
  });

  test("should create a custom column", async ({ board: page }) => {
    const review = await createColumn(page, "Review");

    await expect(review.getByRole("button", { name: "Add Card" })).toBeVisible();
    await expect(page.getByTestId("kanban-column")).toHaveCount(DEFAULT_COLUMNS.length + 1);
  });

  test("should delete a custom column", async ({ board: page }) => {
    const custom = await createColumn(page, "Custom Column");

    await custom.hover();
    await custom.getByRole("button", { name: "Delete column" }).click();

    await expect(column(page, "Custom Column")).toHaveCount(0);
    await expect(page.getByTestId("kanban-column")).toHaveCount(DEFAULT_COLUMNS.length);
  });

  test("should not allow deleting default columns", async ({ board: page }) => {
    for (const title of DEFAULT_COLUMNS) {
      const col = column(page, title);
      await col.hover();
      await expect(col.getByRole("button", { name: "Delete column" })).toHaveCount(0);
    }
  });

  test("should persist cards across page reloads", async ({ board: page }) => {
    await createCard(page, { title: "Persistent Card" });

    await page.reload();

    await expect(column(page, "To Do")).toBeVisible();
    await expect(card(page, "Persistent Card")).toBeVisible();
  });

  test("should show card count in column header", async ({ board: page }) => {
    const todo = column(page, "To Do");
    const count = todo.getByRole("heading", { name: "To Do" }).locator("xpath=following-sibling::span");

    await expect(count).toHaveText("0");

    await createCard(page, { title: "Count Test" });
    await expect(count).toHaveText("1");

    await createCard(page, { title: "Count Test 2" });
    await expect(count).toHaveText("2");
  });

  test("should handle keyboard shortcuts in card dialog", async ({ board: page }) => {
    await openNewCardDialog(page);
    await dialog(page).getByPlaceholder("Enter card title...").fill("Keyboard Test");

    // Cmd+Enter or Ctrl+Enter both save
    await page.keyboard.press("Control+Enter");

    await expect(dialog(page)).toBeHidden();
    await expect(card(page, "Keyboard Test")).toBeVisible();
  });

  test("should display card notes preview", async ({ board: page }) => {
    const created = await createCard(page, {
      title: "Card with Notes",
      notes: "These are detailed notes for the card",
    });

    await expect(created.getByText("These are detailed notes for the card")).toBeVisible();
  });

  test("should show AI button on card hover", async ({ board: page }) => {
    const created = await createCard(page, { title: "AI Test Card" });

    await created.hover();

    await expect(created.getByRole("button", { name: "Generate AI prompt" })).toBeVisible();
  });

  test("should validate empty card title", async ({ board: page }) => {
    await openNewCardDialog(page);

    const createButton = dialog(page).getByRole("button", { name: "Create", exact: true });
    const titleInput = dialog(page).getByPlaceholder("Enter card title...");
    await expect(createButton).toBeDisabled();

    await titleInput.fill("Test");
    await expect(createButton).toBeEnabled();

    await titleInput.clear();
    await expect(createButton).toBeDisabled();

    // Whitespace-only titles don't count either
    await titleInput.fill("   ");
    await expect(createButton).toBeDisabled();
  });
});
