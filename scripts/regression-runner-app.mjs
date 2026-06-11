import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.join(repoRoot, "app", "regression");
const testsRoot = path.join(repoRoot, "tests", "e2e");
const reportRoot = path.join(repoRoot, "playwright-report");
const resultsRoot = path.join(repoRoot, "test-results");
const gsctestLoginUrl = "https://sn-gsctest.churchofjesuschrist.org/login.do";
const gsctestHost = new URL(gsctestLoginUrl).hostname;
const authStatePath = path.resolve(
  repoRoot,
  process.env.SN_GSCTEST_STORAGE_STATE ?? "playwright/.auth/gsctest-state.json"
);
const authStateDisplayPath = path.relative(repoRoot, authStatePath);
const latestJsonReport = path.join(resultsRoot, "latest-results.json");
const latestRunState = path.join(resultsRoot, "regression-app-last-run.json");
const playwrightCli = path.join(repoRoot, "node_modules", "@playwright", "test", "cli.js");
const port = Number(process.env.PORT || 4555);

let activeRun = null;
let lastRun = await readJson(latestRunState).catch(() => null);
let authSession = null;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      await serveFile(res, path.join(appRoot, "index.html"));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      await serveFile(res, path.join(appRoot, url.pathname.slice("/assets/".length)));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tests") {
      json(res, { tests: await discoverTests() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/run") {
      if (activeRun) {
        json(res, { error: "A regression run is already in progress.", run: serializeRun(activeRun) }, 409);
        return;
      }

      const body = await readRequestJson(req);
      const tests = await discoverTests();
      const selectedIds = Array.isArray(body.ids) ? new Set(body.ids) : new Set();
      const selectedTests = body.all ? tests : tests.filter((test) => selectedIds.has(test.id));
      const hasGsctestWrites = selectedTests.some((test) => test.writesGsctest);

      if (!selectedTests.length) {
        json(res, { error: "Select at least one test to run." }, 400);
        return;
      }

      if (hasGsctestWrites && body.confirmGsctestWrites !== true) {
        json(res, { error: "### GSCTEST ### This run creates or updates ServiceNow records. Confirm GSCTEST writes before running." }, 400);
        return;
      }

      activeRun = startRun(selectedTests, tests.length === selectedTests.length, { confirmGsctestWrites: hasGsctestWrites });
      json(res, { run: serializeRun(activeRun) }, 202);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rerun") {
      if (!lastRun?.selectedTests?.length) {
        json(res, { error: "There is no previous run to rerun." }, 400);
        return;
      }

      if (activeRun) {
        json(res, { error: "A regression run is already in progress.", run: serializeRun(activeRun) }, 409);
        return;
      }

      const hasGsctestWrites = lastRun.selectedTests.some((test) => test.writesGsctest);
      if (hasGsctestWrites && body.confirmGsctestWrites !== true) {
        json(res, { error: "### GSCTEST ### This rerun creates or updates ServiceNow records. Confirm GSCTEST writes before rerunning." }, 400);
        return;
      }

      activeRun = startRun(lastRun.selectedTests, lastRun.all === true, { confirmGsctestWrites: hasGsctestWrites });
      json(res, { run: serializeRun(activeRun) }, 202);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/run") {
      if (!activeRun && lastRun?.completedAt) {
        lastRun.summary = await summarizeLatestReport().catch(() => lastRun.summary);
      }

      json(res, { activeRun: activeRun ? serializeRun(activeRun) : null, lastRun });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/report-status") {
      json(res, { exists: await pathExists(path.join(reportRoot, "index.html")), url: "/report/index.html" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth") {
      json(res, { auth: await serializeAuthSession() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/start") {
      json(res, { auth: await startAuthSession() }, 202);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/save") {
      json(res, { auth: await saveAuthSession() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/cancel") {
      json(res, { auth: await closeAuthSession("cancelled") });
      return;
    }

    if (req.method === "GET" && url.pathname === "/report") {
      redirect(res, "/report/index.html");
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/report/")) {
      await serveFile(res, path.join(reportRoot, url.pathname.slice("/report/".length)));
      return;
    }

    json(res, { error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    json(res, { error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

server.listen(port, () => {
  console.log(`Regression runner app: http://localhost:${port}`);
  console.log(`Test folder: ${path.relative(repoRoot, testsRoot)}`);
});

async function discoverTests() {
  const { stdout } = await runCommand(process.execPath, [playwrightCli, "test", "--list"], { timeoutMs: 120_000 });
  return parsePlaywrightList(stdout);
}

async function startAuthSession() {
  if (authSession?.status === "open") {
    return serializeAuthSession();
  }

  await closeAuthSession("replaced");
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  authSession = {
    status: "open",
    browser,
    context,
    page,
    startedAt: new Date().toISOString(),
    completedAt: null,
    lastUrl: gsctestLoginUrl,
    message: "Complete login and MFA in the opened Chrome window, then click Save Auth here."
  };

  page.on("framenavigated", () => {
    if (authSession?.page === page) {
      authSession.lastUrl = page.url();
    }
  });

  await page.goto(gsctestLoginUrl, { waitUntil: "domcontentloaded" });
  authSession.lastUrl = page.url();
  return serializeAuthSession();
}

async function saveAuthSession() {
  if (!authSession?.context) {
    return {
      status: "idle",
      message: "No GSCTEST auth browser is open. Start auth refresh first.",
      details: authSessionDetails(null)
    };
  }

  authSession.lastUrl = authSession.page?.url() || authSession.lastUrl;
  await fs.mkdir(path.dirname(authStatePath), { recursive: true });
  await authSession.context.storageState({ path: authStatePath });
  await closeAuthSession("saved", "Saved GSCTEST auth state. You can run tests now.");
  return serializeAuthSession();
}

async function closeAuthSession(status = "closed", message = "") {
  const previous = authSession;
  if (previous?.browser) {
    await previous.browser.close().catch(() => undefined);
  }

  authSession = {
    status,
    browser: null,
    context: null,
    page: null,
    startedAt: previous?.startedAt || null,
    completedAt: new Date().toISOString(),
    lastUrl: previous?.lastUrl || null,
    message: message || titleCase(status),
    details: authSessionDetails(previous?.lastUrl || null)
  };

  return serializeAuthSession();
}

function startRun(selectedTests, all, options = {}) {
  const run = {
    id: new Date().toISOString().replace(/[-:.TZ]/g, ""),
    status: "running",
    all,
    selectedTests,
    startedAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
    command: "",
    stdout: "",
    stderr: "",
    summary: null,
    reportUrl: "/report/index.html"
  };

  const args = ["test"];
  if (!all) {
    args.push(...selectedTests.map(testTarget));
  }

  run.command = formatCommand(["npx", "playwright", ...args]);

  const child = spawn(process.execPath, [playwrightCli, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(options.confirmGsctestWrites ? { CONFIRM_GSCTEST_WRITES: "GSCTEST" } : {})
    },
    shell: false,
    windowsHide: true
  });

  child.stdout.on("data", (chunk) => {
    run.stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    run.stderr += chunk.toString();
  });

  child.on("close", async (code) => {
    run.status = code === 0 ? "passed" : "failed";
    run.exitCode = code;
    run.completedAt = new Date().toISOString();
    run.summary = await summarizeLatestReport().catch((error) => ({ error: error.message }));
    lastRun = serializeRun(run);
    activeRun = null;
    await fs.mkdir(resultsRoot, { recursive: true });
    await fs.writeFile(latestRunState, JSON.stringify(lastRun, null, 2));
  });

  child.on("error", async (error) => {
    run.status = "failed";
    run.stderr += `\n${error.message}`;
    run.completedAt = new Date().toISOString();
    lastRun = serializeRun(run);
    activeRun = null;
    await fs.mkdir(resultsRoot, { recursive: true });
    await fs.writeFile(latestRunState, JSON.stringify(lastRun, null, 2));
  });

  return run;
}

function parsePlaywrightList(output) {
  const tests = [];

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s+(.+):(\d+):(\d+)\s+›\s+(.+)$/);
    if (!match) {
      continue;
    }

    const [, file, lineNumber, column, fullTitle] = match;
    const parts = fullTitle.split(" › ");
    const rawTitle = parts.at(-1) || fullTitle;
    const writesGsctest = /@writes-gsctest/i.test(fullTitle);
    const title = rawTitle.replace(/\s+@writes-gsctest\b/gi, "");
    const suite = parts.slice(0, -1).join(" › ");
    const id = createHash("sha1")
      .update(`${file}:${lineNumber}:${column}:${fullTitle}`)
      .digest("hex");

    tests.push({
      id,
      file,
      line: Number(lineNumber),
      column: Number(column),
      suite,
      title,
      fullTitle,
      writesGsctest,
      path: `${file}:${lineNumber}:${column}`
    });
  }

  return tests.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function testTarget(test) {
  return `${test.file}:${test.line}`;
}

async function summarizeLatestReport() {
  const report = await readJson(latestJsonReport);
  const cases = [];
  collectCases(report.suites || [], cases);
  const summary = {
    total: cases.length,
    passed: cases.filter((test) => normalizedResultStatus(test) === "passed").length,
    failed: cases.filter((test) => normalizedResultStatus(test) === "failed").length,
    skipped: cases.filter((test) => normalizedResultStatus(test) === "skipped").length,
    flaky: cases.filter((test) => test.outcome === "flaky").length,
    durationMs: cases.reduce((sum, test) => sum + (test.duration || 0), 0),
    cases
  };

  return summary;
}

function normalizedResultStatus(test) {
  if (test.status === "passed") return "passed";
  if (["failed", "timedOut", "interrupted"].includes(test.status)) return "failed";
  if (test.status === "skipped") return "skipped";
  if (test.outcome === "expected") return "passed";
  if (test.outcome === "unexpected") return "failed";
  if (test.outcome === "skipped") return "skipped";
  return test.status || test.outcome || "unknown";
}

function collectCases(suites, cases, parentTitles = []) {
  for (const suite of suites) {
    const titles = suite.title ? [...parentTitles, suite.title] : parentTitles;

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const result = test.results?.at(-1) || {};
        cases.push({
          title: [...titles, spec.title].filter(Boolean).join(" › "),
          file: spec.file,
          line: spec.line,
          column: spec.column,
          outcome: test.outcome,
          status: result.status,
          duration: result.duration,
          error: result.error?.message || null
        });
      }
    }

    collectCases(suite.suites || [], cases, titles);
  }
}

function serializeRun(run) {
  return {
    id: run.id,
    status: run.status,
    all: run.all,
    selectedTests: run.selectedTests,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    exitCode: run.exitCode,
    command: run.command,
    stdout: tail(run.stdout, 20_000),
    stderr: tail(run.stderr, 20_000),
    summary: run.summary,
    reportUrl: run.reportUrl
  };
}

async function serializeAuthSession() {
  if (!authSession) {
    return {
      status: "idle",
      startedAt: null,
      completedAt: null,
      message: "GSCTEST auth refresh is idle.",
      details: authSessionDetails(null)
    };
  }

  if (authSession.page) {
    authSession.lastUrl = authSession.page.url();
  }

  return {
    status: authSession.status,
    startedAt: authSession.startedAt,
    completedAt: authSession.completedAt,
    message: authSession.message,
    details: authSessionDetails(authSession.lastUrl)
  };
}

function authSessionDetails(lastUrl) {
  return [
    { label: "Environment", value: "GSCTEST" },
    { label: "Host", value: gsctestHost },
    { label: "Auth state file", value: authStateDisplayPath },
    { label: "Last browser host", value: safeHost(lastUrl) || "Not open" }
  ];
}

function safeHost(value) {
  if (!value) return "";

  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function runCommand(command, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env: process.env, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out running ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `Command exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function readRequestJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  return body ? JSON.parse(body) : {};
}

async function serveFile(res, filePath) {
  const resolved = path.resolve(filePath);
  const allowedRoots = [appRoot, reportRoot];
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    json(res, { error: "Forbidden" }, 403);
    return;
  }

  if (!(await pathExists(resolved))) {
    json(res, { error: "File not found" }, 404);
    return;
  }

  const data = await fs.readFile(resolved);
  res.writeHead(200, { "content-type": contentType(resolved), "cache-control": "no-store" });
  res.end(data);
}

function json(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webm": "video/webm",
    ".zip": "application/zip"
  }[extension] || "application/octet-stream";
}

function formatCommand(parts) {
  return parts
    .map((part) => (/[\s"]/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part))
    .join(" ");
}

function titleCase(value) {
  return (value || "idle").replace(/^./, (letter) => letter.toUpperCase());
}

function tail(value, maxLength) {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}
