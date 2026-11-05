import type { Page } from "@playwright/test";
import { test, expect, card, column, createCard, dragCard } from "./support";

/** Collect the app's console messages (KanbanBoard logs each move and confetti) */
function captureConsole(page: Page) {
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(msg.text()));
  return logs;
}

test.describe("Confetti Animation", () => {
  test("should trigger confetti when moving card to Completed column", async ({ board: page }) => {
    await createCard(page, { title: "Confetti Test Card" });
    const logs = captureConsole(page);

    await dragCard(page, "Confetti Test Card", column(page, "Completed"));

    await expect(column(page, "Completed").getByText("Confetti Test Card", { exact: true })).toBeVisible();
    await expect(column(page, "To Do").getByTestId("kanban-card")).toHaveCount(0);
    await expect.poll(() => logs.some((l) => l.includes("Triggering confetti"))).toBe(true);
    // canvas-confetti draws on a canvas it adds to the page
    await expect(page.locator("body > canvas")).toHaveCount(1);

    // The move is saved
    await page.reload();
    await expect(column(page, "Completed").getByText("Confetti Test Card", { exact: true })).toBeVisible();
  });

  test("should NOT trigger confetti when moving card within same column", async ({ board: page }) => {
    await createCard(page, { title: "Card A" });
    await createCard(page, { title: "Card B" });
    const logs = captureConsole(page);

    // Reorder within To Do: drop Card A onto Card B
    const todoCards = column(page, "To Do").getByTestId("kanban-card");
    await expect(todoCards).toHaveText([/Card A/, /Card B/]);
    await dragCard(page, "Card A", card(page, "Card B"));

    await expect(todoCards).toHaveText([/Card B/, /Card A/]);
    expect(logs.some((l) => l.includes("Triggering confetti"))).toBe(false);
  });

  test("should NOT trigger confetti when moving card to In Progress", async ({ board: page }) => {
    await createCard(page, { title: "No Confetti Card" });
    const logs = captureConsole(page);

    await dragCard(page, "No Confetti Card", column(page, "In Progress"));

    await expect(column(page, "In Progress").getByText("No Confetti Card", { exact: true })).toBeVisible();
    await expect
      .poll(() => logs.some((l) => l.includes("Move detected:") && l.includes("In Progress")))
      .toBe(true);
    expect(logs.some((l) => l.includes("Triggering confetti"))).toBe(false);
    await expect(page.locator("body > canvas")).toHaveCount(0);
  });
});
