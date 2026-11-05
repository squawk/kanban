import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/support";

/**
 * End-to-end tests against the dev server (`npm run dev`) and a local Postgres.
 *
 * Prerequisites (CI does these in .github/workflows/ci.yml):
 *   - Postgres, migrated: DATABASE_URL=... npm run db:migrate
 *   - CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE and DATABASE_URL set to it
 *   - .dev.vars with SESSION_SECRET, SIGNUP_MODE=open, SIGNUP_REQUIRE_APPROVAL=false
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  // Every spec signs in as the same user and resets that user's board, so run serially
  fullyParallel: false,
  workers: 1,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://localhost:5173",
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    // Optional: use an already installed Chromium instead of `npx playwright install`
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
