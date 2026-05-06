import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const gsctestLoginUrl = "https://sn-gsctest.churchofjesuschrist.org/login.do";
const authStatePath = path.resolve(
  process.cwd(),
  process.env.SN_GSCTEST_STORAGE_STATE ?? "playwright/.auth/gsctest-state.json"
);

await fs.mkdir(path.dirname(authStatePath), { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log("### GSCTEST ### ServiceNow login session");
console.log(`Opening ${gsctestLoginUrl}`);
await page.goto(gsctestLoginUrl, { waitUntil: "domcontentloaded" });

const rl = createInterface({ input, output });
await rl.question(
  "Complete login and MFA in the opened browser, wait until ServiceNow loads, then press Enter here to save the auth state. "
);
rl.close();

await context.storageState({ path: authStatePath });
console.log(`Saved auth state to ${authStatePath}`);
await browser.close();
