import { defineConfig, devices } from "@playwright/test";

// The reference-only runs (recording reference.json, checking the tests against the reference itself)
// don't need the new build, so skip starting the preview server for them.
const needsBuild = process.env.PARITY_TARGET !== "reference";

export default defineConfig({
  testDir: "tests",
  timeout: 15 * 60_000, // the parity run plays the whole game in one test
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // A step that can't act (hidden element, wrong selector) should fail in seconds, not hang until the test timeout.
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173", actionTimeout: 10_000 },
  projects: [
    { name: "parity", testMatch: "parity/*.spec.ts" },
    { name: "visual", testMatch: "visual/*.spec.ts" },
    { name: "loading", testMatch: "loading/*.spec.ts" },
    // The game plus a test-only World 5, served by the dev server with the test entry (tests/pack/vite.config.ts).
    { name: "pack", testMatch: "pack/*.spec.ts", use: { baseURL: "http://localhost:5174" } },
  ],
  webServer: needsBuild
    ? [
        {
          command: "npm run build && npm run preview",
          url: "http://localhost:4173",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: "npx vite --config tests/pack/vite.config.ts --port 5174 --strictPort",
          url: "http://localhost:5174",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ]
    : undefined,
});
