import { test, expect } from "@playwright/test";

test.describe("Kanban Board E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("should load the kanban board", async ({ page }) => {
    await page.goto("/");

    // Check for main title
    await expect(page.getByText("Vibe Coding Kanban")).toBeVisible();

    // Check for default columns
    await expect(page.getByText("TODO").first()).toBeVisible();
    await expect(page.getByText("In Progress").first()).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();
  });

  test("should create a new card", async ({ page }) => {
    await page.goto("/");

    // Click Add Card in TODO column
    const addCardButtons = page.getByText("Add Card");
    await addCardButtons.first().click();

    // Wait for dialog to open
    await expect(page.getByText("Create New Card")).toBeVisible();

    // Fill in card details
    await page.getByPlaceholder("Enter card title...").fill("E2E Test Task");
    await page
      .getByPlaceholder("Add notes or description...")
      .fill("This is an end-to-end test");

    // Click Create
    await page.getByRole("button", { name: "Create" }).click();

    // Verify card appears
    await expect(page.getByText("E2E Test Task")).toBeVisible();
    await expect(page.getByText("This is an end-to-end test")).toBeVisible();
  });

  test("should edit a card", async ({ page }) => {
    await page.goto("/");

    // Create a card first
    await page.getByText("Add Card").first().click();
    await page.getByPlaceholder("Enter card title...").fill("Original Title");
    await page.getByRole("button", { name: "Create" }).click();

    // Wait for card to appear
    await expect(page.getByText("Original Title")).toBeVisible();

    // Hover over card to show edit button
    const card = page.locator("text=Original Title").locator("..");
    await card.hover();

    // Click edit button
    await card.getByLabel("Edit card").click();

    // Wait for edit dialog
    await expect(page.getByText("Edit Card")).toBeVisible();

    // Update title
    const titleInput = page.getByPlaceholder("Enter card title...");
    await titleInput.clear();
    await titleInput.fill("Updated Title");

    // Click Update
    await page.getByRole("button", { name: "Update" }).click();

    // Verify card is updated
    await expect(page.getByText("Updated Title")).toBeVisible();
    await expect(page.getByText("Original Title")).not.toBeVisible();
  });

  test("should delete a card", async ({ page }) => {
    await page.goto("/");

    // Create a card
    await page.getByText("Add Card").first().click();
    await page.getByPlaceholder("Enter card title...").fill("Card to Delete");
    await page.getByRole("button", { name: "Create" }).click();

    // Wait for card to appear
    await expect(page.getByText("Card to Delete")).toBeVisible();

    // Hover and click delete
    const card = page.locator("text=Card to Delete").locator("..");
    await card.hover();
    await card.getByLabel("Delete card").click();

    // Verify card is removed
    await expect(page.getByText("Card to Delete")).not.toBeVisible();
  });

  test("should create a custom column", async ({ page }) => {
    await page.goto("/");

    // Click Add Column
    await page.getByText("Add Column").click();

    // Wait for dialog
    await expect(page.getByText("Create New Column")).toBeVisible();

    // Fill in column title
    await page.getByPlaceholder("Enter column title...").fill("Review");

    // Click Create
    await page.getByRole("button", { name: "Create" }).click();

    // Verify column appears
    await expect(page.getByText("Review").first()).toBeVisible();

    // Verify it has an Add Card button
    const reviewColumn = page.locator("text=Review").locator("..");
    await expect(reviewColumn.getByText("Add Card")).toBeVisible();
  });

  test("should delete a custom column", async ({ page }) => {
    await page.goto("/");

    // Create a custom column
    await page.getByText("Add Column").click();
    await page.getByPlaceholder("Enter column title...").fill("Custom Column");
    await page.getByRole("button", { name: "Create" }).click();

    // Wait for column to appear
    await expect(page.getByText("Custom Column").first()).toBeVisible();

    // Hover to show delete button
    const column = page.locator("text=Custom Column").first().locator("..");
    await column.hover();

    // Click delete
    await column.getByLabel("Delete column").click();

    // Verify column is removed
    await expect(page.getByText("Custom Column")).not.toBeVisible();
  });

  test("should not allow deleting default columns", async ({ page }) => {
    await page.goto("/");

    // Try to find delete button on TODO column (should not exist)
    const todoColumn = page.locator("text=TODO").first().locator("..");
    await todoColumn.hover();

    // Delete button should not be visible for default columns
    await expect(todoColumn.getByLabel("Delete column")).not.toBeVisible();
  });

  test("should persist data to localStorage", async ({ page }) => {
    await page.goto("/");

    // Create a card
    await page.getByText("Add Card").first().click();
    await page.getByPlaceholder("Enter card title...").fill("Persistent Card");
    await page.getByRole("button", { name: "Create" }).click();

    // Wait for card to appear
    await expect(page.getByText("Persistent Card")).toBeVisible();

    // Reload page
    await page.reload();

    // Verify card still exists
    await expect(page.getByText("Persistent Card")).toBeVisible();
  });

  test("should show card count in column header", async ({ page }) => {
    await page.goto("/");

    // Initially should show 0
    const todoColumn = page.locator("text=TODO").first().locator("..");
    await expect(todoColumn.getByText("0")).toBeVisible();

    // Add a card
    await page.getByText("Add Card").first().click();
    await page.getByPlaceholder("Enter card title...").fill("Count Test");
    await page.getByRole("button", { name: "Create" }).click();

    // Should now show 1
    await expect(todoColumn.getByText("1")).toBeVisible();
  });

  test("should handle keyboard shortcuts in card dialog", async ({ page }) => {
    await page.goto("/");

    // Open card dialog
    await page.getByText("Add Card").first().click();

    // Fill in title
    await page.getByPlaceholder("Enter card title...").fill("Keyboard Test");

    // Press Cmd/Ctrl + Enter to save
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+Enter" : "Control+Enter");

    // Card should be created
    await expect(page.getByText("Keyboard Test")).toBeVisible();
  });

  test("should display card notes preview", async ({ page }) => {
    await page.goto("/");

    // Create card with notes
    await page.getByText("Add Card").first().click();
    await page.getByPlaceholder("Enter card title...").fill("Card with Notes");
    await page
      .getByPlaceholder("Add notes or description...")
      .fill("These are detailed notes for the card");
    await page.getByRole("button", { name: "Create" }).click();

    // Verify both title and notes are visible
    await expect(page.getByText("Card with Notes")).toBeVisible();
    await expect(
      page.getByText("These are detailed notes for the card")
    ).toBeVisible();
  });

  test("should show AI button on card hover", async ({ page }) => {
    await page.goto("/");

    // Create a card
    await page.getByText("Add Card").first().click();
    await page.getByPlaceholder("Enter card title...").fill("AI Test Card");
    await page.getByRole("button", { name: "Create" }).click();

    // Wait for card
    await expect(page.getByText("AI Test Card")).toBeVisible();

    // Hover over card
    const card = page.locator("text=AI Test Card").locator("..");
    await card.hover();

    // AI button should be visible
    await expect(card.getByLabel("Generate AI prompt")).toBeVisible();
  });

  test("should validate empty card title", async ({ page }) => {
    await page.goto("/");

    // Open card dialog
    await page.getByText("Add Card").first().click();

    // Try to create without title
    const createButton = page.getByRole("button", { name: "Create" });
    await expect(createButton).toBeDisabled();

    // Type and delete title
    await page.getByPlaceholder("Enter card title...").fill("Test");
    await expect(createButton).toBeEnabled();

    await page.getByPlaceholder("Enter card title...").clear();
    await expect(createButton).toBeDisabled();
  });
});
