import { test as setup, expect } from "@playwright/test";
import { E2E_USER, STORAGE_STATE, verifyTestUser } from "./support";

/**
 * Create (once) and sign in the e2e user, then save the session for every spec.
 * Signing in once keeps the suite clear of the auth rate limiter (5 requests/minute).
 * The dev server must allow open sign-up without approval (SIGNUP_MODE=open,
 * SIGNUP_REQUIRE_APPROVAL=false), or list the user in ADMIN_EMAIL.
 */
setup("sign in as the e2e user", async ({ page }) => {
  setup.setTimeout(120_000);
  const register = await page.request.post("/api/auth/register", {
    data: { email: E2E_USER.email, password: E2E_USER.password, name: E2E_USER.name },
  });
  // 400 = the account already exists from an earlier run
  expect([200, 201, 400], await register.text()).toContain(register.status());
  await verifyTestUser();

  const login = await page.request.post("/api/auth/login", {
    data: { email: E2E_USER.email, password: E2E_USER.password },
  });
  expect(login.ok(), await login.text()).toBe(true);

  // Warm up the dev server: on a cold start Vite discovers and optimizes the client's
  // dependencies on the first page load, then reloads the page. Let that happen here
  // rather than in the middle of the first spec.
  await page.goto("/");
  await expect(page.getByTestId("kanban-column").first()).toBeVisible({ timeout: 60_000 });

  await page.context().storageState({ path: STORAGE_STATE });
});
