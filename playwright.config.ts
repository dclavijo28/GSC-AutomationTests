import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
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
    viewport: { width: 1600, height: 900 }
  }
});
