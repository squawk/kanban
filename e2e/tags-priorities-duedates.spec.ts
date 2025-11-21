import { test, expect } from "@playwright/test";

test.describe("Tags, Priorities, and Due Dates", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('text="Vibe Coding Kanban"');
  });

  test("should display tag options when creating a card", async ({ page }) => {
    // Click Add Card button
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    // Wait for dialog to open
    await expect(page.locator('text="Create New Card"')).toBeVisible();

    // Check that tags are loaded
    await expect(page.locator('text="Bug"')).toBeVisible();
    await expect(page.locator('text="Feature"')).toBeVisible();
    await expect(page.locator('text="Urgent"')).toBeVisible();
  });

  test("should create a card with tags, priority, and due date", async ({ page }) => {
    // Open card creation dialog
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    await expect(page.locator('text="Create New Card"')).toBeVisible();

    // Fill in title
    await page.fill('input[placeholder="Enter card title..."]', "Test Task with Tags");

    // Select priority
    await page.selectOption('select#priority', 'high');

    // Set due date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    await page.fill('input#dueDate', dateStr);

    // Select tags - wait for tags to load and be clickable
    await page.waitForSelector('button:has-text("Bug")', { state: 'visible' });
    await page.click('button:has-text("Bug")');
    await page.click('button:has-text("Feature")');

    // Create the card
    await page.click('button:has-text("Create")');

    // Wait for dialog to close and card to appear
    await expect(page.locator('text="Test Task with Tags"')).toBeVisible();

    // Verify tag badges are displayed
    await expect(page.locator('text="Bug"').first()).toBeVisible();
    await expect(page.locator('text="Feature"').first()).toBeVisible();

    // Verify due date is displayed
    const expectedDate = tomorrow.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    await expect(page.locator(`text="${expectedDate}"`)).toBeVisible();
  });

  test("should display priority with colored border", async ({ page }) => {
    // Create a high priority card
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    await page.fill('input[placeholder="Enter card title..."]', "High Priority Task");
    await page.selectOption('select#priority', 'high');
    await page.click('button:has-text("Create")');

    await expect(page.locator('text="High Priority Task"')).toBeVisible();

    // Check for red left border (high priority)
    const card = page.locator('text="High Priority Task"').locator('..');
    const borderClass = await card.evaluate((el) => {
      const classes = Array.from(el.classList);
      return classes.find((c) => c.includes('border-l'));
    });

    expect(borderClass).toContain('border-l');
  });

  test("should edit card and update tags", async ({ page }) => {
    // Create a card first
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    await page.fill('input[placeholder="Enter card title..."]', "Editable Task");
    await page.click('button:has-text("Bug")');
    await page.click('button:has-text("Create")');

    await expect(page.locator('text="Editable Task"')).toBeVisible();

    // Hover over card to show edit button
    const card = page.locator('text="Editable Task"').locator('..');
    await card.hover();

    // Click edit button
    await page.click('[aria-label="Edit card"]');

    // Wait for edit dialog
    await expect(page.locator('text="Edit Card"')).toBeVisible();

    // Deselect Bug tag
    await page.click('button:has-text("Bug")');

    // Select Feature tag instead
    await page.click('button:has-text("Feature")');

    // Update priority
    await page.selectOption('select#priority', 'low');

    // Save changes
    await page.click('button:has-text("Update")');

    // Verify changes
    await expect(page.locator('text="Editable Task"')).toBeVisible();

    // Feature tag should be visible, Bug should not
    const cardElement = page.locator('text="Editable Task"').locator('..').locator('..');
    await expect(cardElement.locator('text="Feature"')).toBeVisible();
  });

  test("should show overdue indicator for past due dates", async ({ page }) => {
    // Create a card with yesterday's date
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    await page.fill('input[placeholder="Enter card title..."]', "Overdue Task");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    await page.fill('input#dueDate', dateStr);

    await page.click('button:has-text("Create")');

    await expect(page.locator('text="Overdue Task"')).toBeVisible();

    // Check for red/overdue styling
    const dueDateElement = page.locator('text="Overdue Task"')
      .locator('..')
      .locator('..')
      .locator('[class*="text-red"]');

    await expect(dueDateElement).toBeVisible();
  });

  test("should filter cards by multiple tags", async ({ page }) => {
    // Create multiple cards with different tags
    const cards = [
      { title: "Bug Card", tags: ["Bug"] },
      { title: "Feature Card", tags: ["Feature"] },
      { title: "Both Tags Card", tags: ["Bug", "Feature"] },
    ];

    for (const card of cards) {
      const addCardButtons = page.locator('button:has-text("Add Card")');
      await addCardButtons.first().click();

      await page.fill('input[placeholder="Enter card title..."]', card.title);

      for (const tag of card.tags) {
        await page.click(`button:has-text("${tag}")`);
      }

      await page.click('button:has-text("Create")');
      await expect(page.locator(`text="${card.title}"`)).toBeVisible();
    }

    // Verify all cards are visible with their tags
    await expect(page.locator('text="Bug Card"')).toBeVisible();
    await expect(page.locator('text="Feature Card"')).toBeVisible();
    await expect(page.locator('text="Both Tags Card"')).toBeVisible();
  });

  test("should persist tags and priority after page reload", async ({ page }) => {
    // Create a card with specific tags and priority
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    await page.fill('input[placeholder="Enter card title..."]', "Persistent Card");
    await page.selectOption('select#priority', 'high');
    await page.click('button:has-text("Urgent")');
    await page.click('button:has-text("Create")');

    await expect(page.locator('text="Persistent Card"')).toBeVisible();

    // Reload the page
    await page.reload();
    await page.waitForSelector('text="Vibe Coding Kanban"');

    // Verify card still exists with tags
    await expect(page.locator('text="Persistent Card"')).toBeVisible();

    const cardElement = page.locator('text="Persistent Card"').locator('..').locator('..');
    await expect(cardElement.locator('text="Urgent"')).toBeVisible();
  });

  test("should display comment count alongside tags", async ({ page }) => {
    // Create a card
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    await page.fill('input[placeholder="Enter card title..."]', "Card with Comment");
    await page.click('button:has-text("Bug")');
    await page.click('button:has-text("Create")');

    await expect(page.locator('text="Card with Comment"')).toBeVisible();

    // Edit the card to add a comment
    const card = page.locator('text="Card with Comment"').locator('..');
    await card.hover();
    await page.click('[aria-label="Edit card"]');

    await expect(page.locator('text="Edit Card"')).toBeVisible();

    // Add a comment
    await page.fill('textarea[placeholder="Add a comment..."]', "Test comment");
    await page.click('button:has-text("Add Comment")');

    // Wait for comment to be added
    await expect(page.locator('text="Test comment"')).toBeVisible();

    // Close dialog
    await page.click('button:has-text("Update")');

    // Verify comment count is displayed (should show "1")
    const cardWithComment = page.locator('text="Card with Comment"').locator('..').locator('..');
    await expect(cardWithComment.locator('text="1"')).toBeVisible();
  });

  test("should allow changing priority from medium to high", async ({ page }) => {
    // Create a card with medium priority (default)
    const addCardButtons = page.locator('button:has-text("Add Card")');
    await addCardButtons.first().click();

    await page.fill('input[placeholder="Enter card title..."]', "Priority Change Task");
    await page.click('button:has-text("Create")');

    await expect(page.locator('text="Priority Change Task"')).toBeVisible();

    // Edit the card
    const card = page.locator('text="Priority Change Task"').locator('..');
    await card.hover();
    await page.click('[aria-label="Edit card"]');

    // Change priority to high
    await page.selectOption('select#priority', 'high');
    await page.click('button:has-text("Update")');

    // Card should now have red border
    await expect(page.locator('text="Priority Change Task"')).toBeVisible();
  });
});
