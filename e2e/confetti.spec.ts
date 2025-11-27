import { test, expect } from "@playwright/test";

test.describe("Confetti Animation", () => {
  test.beforeEach(async ({ page }) => {
    // Login first (assuming test user exists)
    await page.goto("/login");

    // Check if we're on login page or already logged in
    const isLoginPage = await page.locator("text=Sign In").isVisible().catch(() => false);

    if (isLoginPage) {
      // Fill login form - adjust credentials as needed for your test environment
      await page.fill('input[type="email"]', "test@example.com");
      await page.fill('input[type="password"]', "password123");
      await page.click('button[type="submit"]');

      // Wait for redirect to home
      await page.waitForURL("/", { timeout: 10000 }).catch(() => {
        // If login fails, we might already be on home page
      });
    }
  });

  test("should trigger confetti when moving card to Completed column", async ({ page }) => {
    await page.goto("/");

    // Wait for the board to load
    await expect(page.locator("text=Kanban Board").first()).toBeVisible({ timeout: 10000 });

    // Wait for columns to be visible
    await expect(page.locator("text=To Do").first()).toBeVisible();
    await expect(page.locator("text=Completed").first()).toBeVisible();

    // Create a card in To Do column if none exists
    const todoColumn = page.locator("h3:has-text('To Do')").locator("../..");
    const addCardButton = todoColumn.locator("text=Add Card");

    await addCardButton.click();

    // Wait for dialog
    await expect(page.locator("text=Create New Card")).toBeVisible();

    // Fill in card details
    await page.fill('input[placeholder="Enter card title..."]', "Confetti Test Card");
    await page.click('button:has-text("Create")');

    // Wait for card to appear
    await expect(page.locator("text=Confetti Test Card")).toBeVisible();

    // Set up console listener to capture confetti trigger
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Also intercept the canvas-confetti call by checking for canvas creation
    const confettiTriggered = page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        // Store original confetti function if it exists
        const originalConfetti = (window as any).confetti;

        // Create a promise that resolves when confetti is called
        let triggered = false;

        // Watch for canvas elements being created (confetti creates a canvas)
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node instanceof HTMLCanvasElement) {
                triggered = true;
                resolve(true);
              }
            }
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Timeout after 5 seconds
        setTimeout(() => {
          observer.disconnect();
          resolve(triggered);
        }, 5000);
      });
    });

    // Get the card element
    const card = page.locator("text=Confetti Test Card").first();

    // Get the Completed column drop zone
    const completedColumn = page.locator("h3:has-text('Completed')").locator("../..").locator("div.min-h-\\[200px\\]");

    // Perform drag and drop
    await card.dragTo(completedColumn);

    // Wait a moment for the animation
    await page.waitForTimeout(1000);

    // Check console logs for our debug message
    const moveDetected = consoleLogs.some(log => log.includes("Move detected:"));
    const confettiLog = consoleLogs.some(log => log.includes("Triggering confetti"));

    console.log("Console logs:", consoleLogs);
    console.log("Move detected:", moveDetected);
    console.log("Confetti triggered:", confettiLog);

    // Verify the card moved to Completed
    const completedCards = completedColumn.locator("text=Confetti Test Card");
    await expect(completedCards).toBeVisible();

    // Check if confetti was triggered via console log
    expect(confettiLog).toBe(true);
  });

  test("should NOT trigger confetti when moving card within same column", async ({ page }) => {
    await page.goto("/");

    // Wait for the board to load
    await expect(page.locator("text=Kanban Board").first()).toBeVisible({ timeout: 10000 });

    // Create two cards in To Do
    const todoColumn = page.locator("h3:has-text('To Do')").locator("../..");
    const addCardButton = todoColumn.locator("text=Add Card");

    await addCardButton.click();
    await page.fill('input[placeholder="Enter card title..."]', "Card A");
    await page.click('button:has-text("Create")');
    await expect(page.locator("text=Card A")).toBeVisible();

    await addCardButton.click();
    await page.fill('input[placeholder="Enter card title..."]', "Card B");
    await page.click('button:has-text("Create")');
    await expect(page.locator("text=Card B")).toBeVisible();

    // Set up console listener
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Drag Card A to Card B position (reorder within same column)
    const cardA = page.locator("text=Card A").first();
    const cardB = page.locator("text=Card B").first();

    await cardA.dragTo(cardB);

    await page.waitForTimeout(500);

    // Confetti should NOT be triggered
    const confettiLog = consoleLogs.some(log => log.includes("Triggering confetti"));
    expect(confettiLog).toBe(false);
  });

  test("should NOT trigger confetti when moving card to In Progress", async ({ page }) => {
    await page.goto("/");

    // Wait for the board to load
    await expect(page.locator("text=Kanban Board").first()).toBeVisible({ timeout: 10000 });

    // Create a card in To Do
    const todoColumn = page.locator("h3:has-text('To Do')").locator("../..");
    const addCardButton = todoColumn.locator("text=Add Card");

    await addCardButton.click();
    await page.fill('input[placeholder="Enter card title..."]', "No Confetti Card");
    await page.click('button:has-text("Create")');
    await expect(page.locator("text=No Confetti Card")).toBeVisible();

    // Set up console listener
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      consoleLogs.push(msg.text());
    });

    // Get the card and In Progress column
    const card = page.locator("text=No Confetti Card").first();
    const inProgressColumn = page.locator("h3:has-text('In Progress')").locator("../..").locator("div.min-h-\\[200px\\]");

    // Drag to In Progress
    await card.dragTo(inProgressColumn);

    await page.waitForTimeout(500);

    // Check move was detected but confetti was NOT triggered
    const moveDetected = consoleLogs.some(log => log.includes("Move detected:") && log.includes("In Progress"));
    const confettiLog = consoleLogs.some(log => log.includes("Triggering confetti"));

    expect(moveDetected).toBe(true);
    expect(confettiLog).toBe(false);
  });
});
