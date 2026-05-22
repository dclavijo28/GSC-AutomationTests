import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/latest-results.json" }]
  ],
  expect: {
    timeout: 15_000
  },
  use: {
    browserName: "chromium",
    channel: "chrome",
    headless: false,
    storageState: process.env.SN_GSCTEST_STORAGE_STATE ?? "playwright/.auth/gsctest-state.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: null,
    launchOptions: {
      args: ["--start-maximized", "--window-position=0,0"]
    }
  }
});
