import {
  test,
  expect,
  card,
  createCard,
  dialog,
  fillCardFields,
  localDate,
  openEditCardDialog,
  openNewCardDialog,
} from "./support";

test.describe("Tags, Priorities, and Due Dates", () => {
  test("should display tag options when creating a card", async ({ board: page }) => {
    await openNewCardDialog(page);

    // Every new user starts with these default tags
    for (const tag of ["Bug", "Feature", "Urgent", "Enhancement", "Documentation", "Design"]) {
      await expect(dialog(page).getByRole("button", { name: tag, exact: true })).toBeVisible();
    }
  });

  test("should create a card with tags, priority, and due date", async ({ board: page }) => {
    const tomorrow = localDate(1);

    const created = await createCard(page, {
      title: "Test Task with Tags",
      priority: "high",
      dueDate: tomorrow.value,
      tags: ["Bug", "Feature"],
    });

    await expect(created.getByText("Bug", { exact: true })).toBeVisible();
    await expect(created.getByText("Feature", { exact: true })).toBeVisible();
    await expect(created.getByTitle("Due date")).toHaveText(tomorrow.label);
    await expect(created.locator(".border-l-destructive")).toHaveCount(1);
  });

  test("should display priority with colored border", async ({ board: page }) => {
    // Priority colors use theme tokens: high = destructive, medium = primary, low = muted
    const high = await createCard(page, { title: "High Priority Task", priority: "high" });
    const medium = await createCard(page, { title: "Medium Priority Task" });
    const low = await createCard(page, { title: "Low Priority Task", priority: "low" });

    await expect(high.locator(".border-l-destructive")).toHaveCount(1);
    await expect(medium.locator(".border-l-primary")).toHaveCount(1);
    await expect(low.locator(".border-l-muted")).toHaveCount(1);
  });

  test("should edit card and update tags", async ({ board: page }) => {
    await createCard(page, { title: "Editable Task", tags: ["Bug"] });

    await openEditCardDialog(page, "Editable Task");
    // Swap Bug for Feature and lower the priority
    await fillCardFields(page, { toggleTags: ["Bug", "Feature"], priority: "low" });
    await dialog(page).getByRole("button", { name: "Update", exact: true }).click();
    await expect(dialog(page)).toBeHidden();

    const edited = card(page, "Editable Task");
    await expect(edited.getByText("Feature", { exact: true })).toBeVisible();
    await expect(edited.getByText("Bug", { exact: true })).toHaveCount(0);
    await expect(edited.locator(".border-l-muted")).toHaveCount(1);
  });

  test("should show overdue indicator for past due dates", async ({ board: page }) => {
    const overdue = await createCard(page, { title: "Overdue Task", dueDate: localDate(-1).value });
    const today = await createCard(page, { title: "Due Today Task", dueDate: localDate(0).value });
    const future = await createCard(page, { title: "Future Task", dueDate: localDate(3).value });

    await expect(overdue.getByTitle("Overdue!")).toHaveClass(/text-destructive/);
    await expect(today.getByTitle("Due today")).toHaveClass(/text-primary/);
    await expect(future.getByTitle("Due date")).not.toHaveClass(/text-destructive|text-primary/);
  });

  test("should show each card's own combination of tags", async ({ board: page }) => {
    const cards = [
      { title: "Bug Card", tags: ["Bug"] },
      { title: "Feature Card", tags: ["Feature"] },
      { title: "Both Tags Card", tags: ["Bug", "Feature"] },
    ];

    for (const c of cards) {
      await createCard(page, c);
    }

    for (const c of cards) {
      const el = card(page, c.title);
      for (const tag of ["Bug", "Feature"]) {
        await expect(el.getByText(tag, { exact: true })).toHaveCount(c.tags.includes(tag) ? 1 : 0);
      }
    }
  });

  test("should persist tags and priority after page reload", async ({ board: page }) => {
    await createCard(page, { title: "Persistent Card", priority: "high", tags: ["Urgent"] });

    await page.reload();

    const persisted = card(page, "Persistent Card");
    await expect(persisted).toBeVisible();
    await expect(persisted.getByText("Urgent", { exact: true })).toBeVisible();
    await expect(persisted.locator(".border-l-destructive")).toHaveCount(1);
  });

  test("should display comment count alongside tags", async ({ board: page }) => {
    await createCard(page, { title: "Card with Comment", tags: ["Bug"] });

    await openEditCardDialog(page, "Card with Comment");
    await dialog(page).getByPlaceholder("Add a comment...").fill("Test comment");
    await dialog(page).getByRole("button", { name: "Add Comment" }).click();
    await expect(dialog(page).getByText("Test comment")).toBeVisible();

    await dialog(page).getByRole("button", { name: "Update", exact: true }).click();
    await expect(dialog(page)).toBeHidden();

    const withComment = card(page, "Card with Comment");
    await expect(withComment.getByText("Bug", { exact: true })).toBeVisible();
    await expect(withComment.getByText("1", { exact: true })).toBeVisible();
  });

  test("should allow changing priority from medium to high", async ({ board: page }) => {
    const created = await createCard(page, { title: "Priority Change Task" });
    await expect(created.locator(".border-l-primary")).toHaveCount(1);

    await openEditCardDialog(page, "Priority Change Task");
    await expect(dialog(page).locator("select#priority")).toHaveValue("medium");
    await fillCardFields(page, { priority: "high" });
    await dialog(page).getByRole("button", { name: "Update", exact: true }).click();
    await expect(dialog(page)).toBeHidden();

    await expect(card(page, "Priority Change Task").locator(".border-l-destructive")).toHaveCount(1);
  });
});
