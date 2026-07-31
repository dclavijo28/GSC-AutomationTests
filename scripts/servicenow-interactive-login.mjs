import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const defaultLoginIndicators = [
  /login/i,
  /signin/i,
  /auth_redirect\.do/i,
  /id\.churchofjesuschrist\.org/i,
  /sign in/i,
  /single sign-on/i,
  /church account/i,
  /logout successful/i,
  /error occurred while validating the sso response/i
];

const loginViewport = {
  width: 1100,
  height: 620,
};

export async function ensureInteractiveServiceNowLogin(page, options = {}) {
  const forceInteractiveLogin = options.forceInteractiveLogin ?? envFlag("SN_FORCE_INTERACTIVE_LOGIN");
  const interactiveTimeoutMs = options.interactiveTimeoutMs ?? numberFromEnv("SN_INTERACTIVE_LOGIN_TIMEOUT_MS", 300_000);
  const storageStatePath = path.resolve(
    options.storageStatePath ?? process.env.SN_GSCTEST_STORAGE_STATE ?? "playwright/.auth/gsctest-state.json"
  );
  const loginUrl = options.loginUrl ?? page.url();
  const resumeUrl = options.resumeUrl ?? page.url();

  if (!forceInteractiveLogin) {
    const snapshot = await getLoginSnapshot(page);
    if (!isLoginRequired(snapshot)) {
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

    const snapshot = await getLoginSnapshot(page);
    if (!isLoginRequired(snapshot)) {
      if (resumeUrl && !sameUrl(snapshot.url, resumeUrl)) {
        await page.goto(resumeUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      }

      await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
      await page.context().storageState({ path: storageStatePath });
      console.log(`Refreshed ServiceNow storage state at ${storageStatePath}`);
      return true;
    }

    await fitLoginPage(page);
    await page.waitForTimeout(1_000);
  }

  throw new Error("Timed out waiting for interactive ServiceNow login to complete.");
}

export async function isServiceNowLoginPage(page) {
  return isLoginRequired(await getLoginSnapshot(page));
}

async function getLoginSnapshot(page) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = await page
    .locator("body")
    .textContent({ timeout: 2_000 })
    .catch(async () => page.locator("html").textContent({ timeout: 2_000 }).catch(() => ""))
    .then((value) => value?.trim() ?? "");

  return { url, title, bodyText };
}

function isLoginRequired(snapshot) {
  const haystack = `${snapshot.url}\n${snapshot.title}\n${snapshot.bodyText}`;
  return defaultLoginIndicators.some((pattern) => pattern.test(haystack));
}

async function prepareLoginWindow(page) {
  await bringBrowserWindowToFront(page);
  await applyLoginViewport(page);
  await fitLoginPage(page);
}

async function applyLoginViewport(page) {
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

async function fitLoginPage(page) {
  const snapshot = await getLoginSnapshot(page).catch(() => null);
  if (!snapshot || !isLoginRequired(snapshot)) return;

  await page.evaluate(() => {
    document.documentElement.style.setProperty("zoom", "50%");
    document.body.style.setProperty("zoom", "50%");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }).catch(() => undefined);

  await page.keyboard.press("Control+0").catch(() => undefined);
  await page.mouse.wheel(0, 500).catch(() => undefined);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior: "instant" })).catch(() => undefined);
  await page.waitForTimeout(150).catch(() => undefined);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })).catch(() => undefined);
}

async function showWindowsLoginReminder() {
  if (process.platform !== "win32") return;

  const popupText =
    "ServiceNow login is required. A browser window has been opened for login. Complete the sign-in in the opened browser window.";
  const scriptPath = path.join(os.tmpdir(), "servicenow-login-required.vbs");
  const scriptContent = [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Popup "${escapeVbs(popupText)}", 0, "ServiceNow Login Required", 64`
  ].join("\r\n");

  await fs.writeFile(scriptPath, scriptContent, "utf8");
  spawn("wscript.exe", [scriptPath], {
    detached: true,
    shell: false,
    windowsHide: false,
    stdio: "ignore"
  }).unref();
}

async function playWindowsAlert() {
  if (process.platform !== "win32") return;

  await new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-Command", "[console]::Beep(1000,400); [console]::Beep(800,250)"],
      { shell: false, windowsHide: true, stdio: "ignore" }
    );

    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

async function bringBrowserWindowToFront(page) {
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
    }
  }).catch(() => undefined);
}

function envFlag(name) {
  return /^(1|true|yes)$/i.test(process.env[name] ?? "");
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sameUrl(left, right) {
  if (!left || !right) return false;
  return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
}

function escapeVbs(value) {
  return value.replace(/"/g, '""');
}



