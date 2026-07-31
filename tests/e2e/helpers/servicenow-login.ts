import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Page } from "@playwright/test";

const environments = {
  gsctest: {
    loginUrl: "https://sn-gsctest.churchofjesuschrist.org/login.do",
    storageStatePath: process.env.SN_GSCTEST_STORAGE_STATE ?? "playwright/.auth/gsctest-state.json",
  },
  gscdev: {
    loginUrl: "https://sn-gscdev.churchofjesuschrist.org/login.do",
    storageStatePath: process.env.SN_GSCDEV_STORAGE_STATE ?? "playwright/.auth/gscdev-state.json",
  },
} as const;

const defaultLoginIndicators = [
  /login/i,
  /signin/i,
  /auth_redirect\.do/i,
  /id\.churchofjesuschrist\.org/i,
  /sign in/i,
  /single sign-on/i,
  /church account/i,
  /logout successful/i,
  /error occurred while validating the sso response/i,
];

const loginViewport = {
  width: 1100,
  height: 620,
};

export type ServiceNowEnvironment = keyof typeof environments;

export type ServiceNowLoginOptions = {
  forceInteractiveLogin?: boolean;
  interactiveTimeoutMs?: number;
  loginUrl?: string;
  resumeUrl?: string;
  storageStatePath?: string;
};

export type ServiceNowLoginSnapshot = {
  url: string;
  title: string;
  bodyText: string;
};

export function serviceNowLoginOptionsForEnvironment(
  environment: ServiceNowEnvironment,
  overrides: Partial<ServiceNowLoginOptions> = {}
): ServiceNowLoginOptions {
  const config = environments[environment];
  return {
    loginUrl: config.loginUrl,
    storageStatePath: config.storageStatePath,
    ...overrides,
  };
}

export async function ensureServiceNowInteractiveLogin(page: Page, options: ServiceNowLoginOptions = {}): Promise<boolean> {
  const forceInteractiveLogin = options.forceInteractiveLogin ?? envFlag("SN_FORCE_INTERACTIVE_LOGIN");
  const interactiveTimeoutMs =
    options.interactiveTimeoutMs ?? numberFromEnv("SN_INTERACTIVE_LOGIN_TIMEOUT_MS", 300_000);
  const storageStatePath =
    options.storageStatePath ?? process.env.SN_GSCTEST_STORAGE_STATE ?? "playwright/.auth/gsctest-state.json";
  const resolvedStorageStatePath = path.resolve(process.cwd(), storageStatePath);
  const loginUrl = options.loginUrl ?? page.url();
  const resumeUrl = options.resumeUrl ?? page.url();

  if (!forceInteractiveLogin) {
    const snapshot = await getServiceNowLoginSnapshot(page);
    if (!isServiceNowLoginSnapshot(snapshot)) {
      return false;
    }
  }

  if (forceInteractiveLogin) {
    console.log("LOGIN REQUIRED: Force interactive login mode is enabled. Opening the ServiceNow login flow.");
    await page.context().clearCookies().catch(() => undefined);
    if (loginUrl) {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    }
  }

  console.log(
    "LOGIN REQUIRED: ServiceNow login is required. A browser window has been opened for login. Complete the sign-in in the opened browser window."
  );

  await prepareLoginWindow(page);
  await Promise.allSettled([showWindowsLoginReminder(), playWindowsAlert()]);

  const deadline = Date.now() + interactiveTimeoutMs;
  while (Date.now() < deadline) {
    await prepareLoginWindow(page);

    const snapshot = await getServiceNowLoginSnapshot(page);
    if (!isServiceNowLoginSnapshot(snapshot)) {
      if (resumeUrl && !sameUrl(snapshot.url, resumeUrl)) {
        await page.goto(resumeUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      }

      await fs.mkdir(path.dirname(resolvedStorageStatePath), { recursive: true });
      await page.context().storageState({ path: resolvedStorageStatePath });
      console.log(`Refreshed ServiceNow storage state at ${resolvedStorageStatePath}`);
      return true;
    }

    await fitLoginPage(page);
    await page.waitForTimeout(1_000);
  }

  throw new Error("Timed out waiting for interactive ServiceNow login to complete.");
}

export async function isServiceNowLoginPage(page: Page): Promise<boolean> {
  return isServiceNowLoginSnapshot(await getServiceNowLoginSnapshot(page));
}

export async function getServiceNowLoginSnapshot(page: Page): Promise<ServiceNowLoginSnapshot> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = await page
    .locator("body")
    .textContent({ timeout: 2_000 })
    .catch(async () => page.locator("html").textContent({ timeout: 2_000 }).catch(() => ""))
    .then((value) => value?.trim() ?? "");

  return { url, title, bodyText };
}

export function isServiceNowLoginSnapshot(snapshot: ServiceNowLoginSnapshot): boolean {
  const haystack = `${snapshot.url}\n${snapshot.title}\n${snapshot.bodyText}`;
  return defaultLoginIndicators.some((pattern) => pattern.test(haystack));
}

async function prepareLoginWindow(page: Page): Promise<void> {
  await bringBrowserWindowToFront(page);
  await applyLoginViewport(page);
  await fitLoginPage(page);
}

async function applyLoginViewport(page: Page): Promise<void> {
  await page.setViewportSize(loginViewport).catch(() => undefined);
  const session = await page.context().newCDPSession(page).catch(() => null);
  if (!session) return;

  const window = await session.send("Browser.getWindowForTarget").catch(() => null);
  if (!window?.windowId) return;

  await session.send("Browser.setWindowBounds", {
    windowId: window.windowId,
    bounds: {
      windowState: "normal",
      width: loginViewport.width,
      height: loginViewport.height,
      left: 40,
      top: 40,
    },
  }).catch(() => undefined);
}

async function fitLoginPage(page: Page): Promise<void> {
  const snapshot = await getServiceNowLoginSnapshot(page).catch(() => null);
  if (!snapshot || !isServiceNowLoginSnapshot(snapshot)) return;

  await page.evaluate(() => {
    document.documentElement.style.setProperty("zoom", "50%");
    document.body.style.setProperty("zoom", "50%");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }).catch(() => undefined);

  await page.keyboard.press("Control+0").catch(() => undefined);
  await page.mouse.wheel(0, 500).catch(() => undefined);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior: "instant" as ScrollBehavior })).catch(() => undefined);
  await page.waitForTimeout(150).catch(() => undefined);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior })).catch(() => undefined);
}

async function showWindowsLoginReminder(): Promise<void> {
  if (process.platform !== "win32") return;

  const popupText =
    "ServiceNow login is required. A browser window has been opened for login. Complete the sign-in in the opened browser window.";
  const scriptPath = path.join(os.tmpdir(), "servicenow-login-required.vbs");
  const scriptContent = [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Popup "${escapeVbs(popupText)}", 0, "ServiceNow Login Required", 64`,
  ].join("\r\n");

  await fs.writeFile(scriptPath, scriptContent, "utf8");
  spawn("wscript.exe", [scriptPath], {
    detached: true,
    shell: false,
    windowsHide: false,
    stdio: "ignore",
  }).unref();
}

async function playWindowsAlert(): Promise<void> {
  if (process.platform !== "win32") return;

  await new Promise<void>((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-Command", "[console]::Beep(1000,400); [console]::Beep(800,250)"],
      { shell: false, windowsHide: true, stdio: "ignore" }
    );

    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

async function bringBrowserWindowToFront(page: Page): Promise<void> {
  await page.bringToFront().catch(() => undefined);
  const session = await page.context().newCDPSession(page).catch(() => null);
  if (!session) return;

  const window = await session.send("Browser.getWindowForTarget").catch(() => null);
  if (!window?.windowId) return;

  await session.send("Browser.setWindowBounds", {
    windowId: window.windowId,
    bounds: {
      windowState: "normal",
      width: loginViewport.width,
      height: loginViewport.height,
      left: 40,
      top: 40,
    },
  }).catch(() => undefined);
}

function envFlag(name: string): boolean {
  return /^(1|true|yes)$/i.test(process.env[name] ?? "");
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sameUrl(left: string, right: string): boolean {
  if (!left || !right) return false;
  return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
}

function escapeVbs(value: string): string {
  return value.replace(/"/g, '""');
}



