import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureInteractiveServiceNowLogin } from "./servicenow-interactive-login.mjs";
import { getServiceNowEnvironmentConfig } from "./servicenow-environment.mjs";

const launchArgs = ["--window-size=1120,700", "--window-position=40,40"];
const loginViewport = { width: 1100, height: 620 };

export async function saveServiceNowAuth(environment) {
  const config = getServiceNowEnvironmentConfig(environment);
  const overrideEnvVar = `SN_${config.environment.toUpperCase()}_STORAGE_STATE`;
  const authStatePath = path.resolve(process.cwd(), process.env[overrideEnvVar] ?? config.storageStatePath);

  await fs.mkdir(path.dirname(authStatePath), { recursive: true });

  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: launchArgs
  });
  const context = await browser.newContext({ viewport: loginViewport });
  const page = await context.newPage();

  console.log(`### ${config.label} ### ServiceNow login session`);
  console.log(`Opening ${config.loginUrl}`);
  await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });

  await ensureInteractiveServiceNowLogin(page, {
    forceInteractiveLogin: true,
    loginUrl: config.loginUrl,
    resumeUrl: config.homeUrl,
    storageStatePath: authStatePath
  });

  console.log(`Saved auth state to ${authStatePath}`);
  await browser.close();
}

