import { useState, useCallback } from "react";

const GITHUB_OWNER = "dclavijo28";
const GITHUB_REPO = "GSC-AutomationTests";

const TEST_TEMPLATES = {
  sprint_management: {
    label: "Sprint Management Dashboard",
    icon: "ti-layout-dashboard",
    description: "Validates Sprint Management dashboard loads with key tabs and widgets",
    fields: [
      { id: "dashboardUrl", label: "Dashboard URL", type: "text", placeholder: "https://sn-gsctest.churchofjesuschrist.org/...", required: true },
      { id: "dashboardTitle", label: "Dashboard Heading Text", type: "text", placeholder: "Sprint Management - GSD", required: true },
      { id: "tabs", label: "Expected Tabs (comma-separated)", type: "text", placeholder: "Sprint Status, CSM Epics, Sprint Stats", required: true },
      { id: "widgets", label: "Expected Widgets (comma-separated)", type: "text", placeholder: "Points, Stories", required: true },
    ],
  },
  lus_case: {
    label: "LUS Case Creation + Open List",
    icon: "ti-file-plus",
    description: "Creates a LUS case, sets Genesys routing fields, and validates Call ID in Open List",
    fields: [
      { id: "createCaseUrl", label: "Create Case URL", type: "text", placeholder: "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/...", required: true },
      { id: "openListUrl", label: "Open List URL", type: "text", placeholder: "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/list/...", required: true },
      { id: "assignmentGroup", label: "Assignment Group", type: "text", placeholder: "GSD-Genesys", required: true },
      { id: "replyTo", label: "Reply To Email", type: "text", placeholder: "mlssupport@churchofjesuschrist.org", required: true },
      { id: "consumerSearch", label: "Consumer Search Value", type: "text", placeholder: "Debeach", required: true },
      { id: "channelOption", label: "Channel Option", type: "text", placeholder: "In-App", required: true },
      { id: "descriptionPrefix", label: "Short Description Prefix", type: "text", placeholder: "Test Automation STRY0482100", required: true },
      { id: "confirmLane", label: "Confirm Lane Value (SN_CONFIRM_LANE)", type: "text", placeholder: "GSCTEST", required: true },
      { id: "storyNumber", label: "Story Number", type: "text", placeholder: "STRY0482100", required: true },
    ],
  },
  fsm_workspace: {
    label: "FSM Configurable Workspace",
    icon: "ti-layout-2",
    description: "Navigates to FSM workspace home and validates the add flow shows CSAS Case option",
    fields: [
      { id: "workspaceUrl", label: "Workspace Home URL", type: "text", placeholder: "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/home", required: true },
      { id: "workspaceName", label: "Workspace Name", type: "text", placeholder: "CSM/FSM Configurable Workspace", required: true },
      { id: "newCaseOption", label: "New Case Option Text", type: "text", placeholder: "New CSAS Case", required: true },
    ],
  },
  custom: {
    label: "Custom ServiceNow Test",
    icon: "ti-code",
    description: "Generate a custom Playwright test with Page Object Model for any ServiceNow page",
    fields: [
      { id: "testDescription", label: "Test Description", type: "textarea", placeholder: "Describe what this test should do...", required: true },
      { id: "url", label: "Target URL", type: "text", placeholder: "https://sn-gsctest.churchofjesuschrist.org/...", required: true },
      { id: "storyNumber", label: "Story / Task Number", type: "text", placeholder: "STRY0000000", required: false },
    ],
  },
};

// ---------------------------------------------------------------------------
// Code generators – use plain string concatenation to avoid JSX parser issues
// ---------------------------------------------------------------------------

function generateSprintManagementTest(fields) {
  const tabs = fields.tabs.split(",").map((t) => t.trim());
  const widgets = fields.widgets.split(",").map((w) => w.trim());

  const tabAssertions = tabs
    .map((t) => "    await dashboardPage.expectTabVisible('" + t + "');")
    .join("\n");
  const widgetAssertions = widgets
    .map((w) => "    await dashboardPage.expectWidgetVisible('" + w + "');")
    .join("\n");

  const pageObject = [
    "import { Page, Locator, expect } from '@playwright/test';",
    "",
    "export class SprintManagementPage {",
    "  readonly page: Page;",
    "  readonly heading: Locator;",
    "  readonly editButton: Locator;",
    "",
    "  constructor(page: Page) {",
    "    this.page = page;",
    "    this.heading = page.getByRole('heading', { name: '" + fields.dashboardTitle + "' });",
    "    this.editButton = page.getByRole('button', { name: 'Edit' });",
    "  }",
    "",
    "  async goto(): Promise<void> {",
    "    await this.page.goto('" + fields.dashboardUrl + "', { waitUntil: 'domcontentloaded' });",
    "  }",
    "",
    "  async waitForReady(timeoutMs = 30_000): Promise<void> {",
    "    const mfa = this.page.getByRole('heading', { name: /Authenticator/i });",
    "    const result = await Promise.race([",
    "      this.heading.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'ready').catch(() => 'timeout'),",
    "      mfa.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'mfa').catch(() => 'timeout'),",
    "    ]);",
    "    if (result === 'mfa') throw new Error('Auth state redirected to MFA – refresh session.');",
    "    if (result === 'timeout') throw new Error('Dashboard did not load within timeout.');",
    "  }",
    "",
    "  async expectTabVisible(tabName: string): Promise<void> {",
    "    await expect(this.page.getByRole('tab', { name: tabName })).toBeVisible();",
    "  }",
    "",
    "  async expectWidgetVisible(widgetText: string): Promise<void> {",
    "    await expect(this.page.getByText(widgetText, { exact: true })).toBeVisible();",
    "  }",
    "",
    "  async expectEditButtonVisible(): Promise<void> {",
    "    await expect(this.editButton).toBeVisible();",
    "  }",
    "}",
  ].join("\n");

  const spec = [
    "import { test, expect } from '@playwright/test';",
    "import { SprintManagementPage } from '../pages/SprintManagementPage';",
    "",
    "test.describe('Sprint Management dashboard', () => {",
    "  test.use({ storageState: 'playwright/.auth/gsctest-state.json' });",
    "",
    "  test('loads the dashboard with key widgets visible', async ({ page }) => {",
    "    const dashboardPage = new SprintManagementPage(page);",
    "    await dashboardPage.goto();",
    "    await expect(page).toHaveURL(/sn-gsctest\\.churchofjesuschrist\\.org/);",
    "    await dashboardPage.waitForReady();",
    tabAssertions,
    "    await dashboardPage.expectEditButtonVisible();",
    widgetAssertions,
    "  });",
    "});",
  ].join("\n");

  return { pageObject, spec, pageName: "SprintManagementPage" };
}

function generateLusCaseTest(fields) {
  const pageObject = [
    "import { Page, Locator, expect } from '@playwright/test';",
    "",
    "function escapeRegex(value: string): RegExp {",
    "  return new RegExp(value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i');",
    "}",
    "",
    "function exactTextPattern(value: string): RegExp {",
    "  return new RegExp('^\\\\s*' + value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\s*$', 'i');",
    "}",
    "",
    "export class LusCasePage {",
    "  readonly page: Page;",
    "",
    "  constructor(page: Page) {",
    "    this.page = page;",
    "  }",
    "",
    "  async gotoCreate(): Promise<void> {",
    "    await this.page.goto('" + fields.createCaseUrl + "', { waitUntil: 'domcontentloaded' });",
    "  }",
    "",
    "  async gotoOpenList(): Promise<void> {",
    "    await this.page.goto('" + fields.openListUrl + "', { waitUntil: 'domcontentloaded' });",
    "  }",
    "",
    "  async waitForCaseForm(timeoutMs = 30_000): Promise<void> {",
    "    const ready = this.page.getByText(exactTextPattern('Short Description')).first();",
    "    const mfa = this.page.getByRole('heading', { name: /Authenticator/i });",
    "    const result = await Promise.race([",
    "      ready.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'ready').catch(() => 'timeout'),",
    "      mfa.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'mfa').catch(() => 'timeout'),",
    "    ]);",
    "    if (result === 'mfa') throw new Error('Auth state redirected to MFA.');",
    "    if (result === 'timeout') throw new Error('LUS case form did not load within timeout.');",
    "  }",
    "",
    "  private async firstVisible(locators: Locator[], ms = 5_000): Promise<Locator | null> {",
    "    for (const loc of locators) {",
    "      try { await loc.waitFor({ state: 'visible', timeout: ms }); return loc; } catch { /* next */ }",
    "    }",
    "    return null;",
    "  }",
    "",
    "  async fillField(label: string, value: string): Promise<Locator> {",
    "    const pat = new RegExp(label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i');",
    "    const field = await this.firstVisible([",
    "      this.page.getByLabel(pat).first(),",
    "      this.page.getByRole('textbox', { name: pat }).first(),",
    "      this.page.getByRole('combobox', { name: pat }).first(),",
    "      this.page.locator('[aria-label=\"' + label + '\"]').first(),",
    "    ]);",
    "    if (!field) throw new Error('Unable to locate field: ' + label);",
    "    await field.click({ force: true });",
    "    await field.fill('');",
    "    await field.fill(value);",
    "    return field;",
    "  }",
    "",
    "  async selectReferenceValue(label: string, value: string): Promise<void> {",
    "    const field = await this.fillField(label, value);",
    "    const pat = new RegExp(value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i');",
    "    for (const loc of [",
    "      this.page.getByRole('option', { name: exactTextPattern(value) }),",
    "      this.page.getByRole('option', { name: pat }),",
    "      this.page.locator('[role=\"option\"]').filter({ hasText: pat }),",
    "      this.page.locator('li').filter({ hasText: pat }),",
    "    ]) {",
    "      try {",
    "        await loc.first().waitFor({ state: 'visible', timeout: 5_000 });",
    "        await loc.first().click();",
    "        await expect(field).toHaveValue(pat);",
    "        return;",
    "      } catch { /* next */ }",
    "    }",
    "    throw new Error('Could not select ' + value + ' for ' + label);",
    "  }",
    "",
    "  async clickSave(): Promise<void> {",
    "    for (const loc of [",
    "      this.page.getByRole('button', { name: /^Save$/i }),",
    "      this.page.locator('button:has-text(\"Save\")'),",
    "    ]) {",
    "      try { await loc.first().waitFor({ state: 'visible', timeout: 5_000 }); await loc.first().click(); return; } catch { /* next */ }",
    "    }",
    "    throw new Error('Save button not found.');",
    "  }",
    "",
    "  async waitForSave(desc: string): Promise<void> {",
    "    await expect(this.page.getByText(escapeRegex(desc)).first()).toBeVisible({ timeout: 30_000 });",
    "  }",
    "",
    "  async searchAndSelectConsumer(searchValue: string): Promise<void> {",
    "    const region = await this.firstVisible([",
    "      this.page.getByRole('complementary', { name: /record information/i }).first(),",
    "      this.page.getByRole('region', { name: /record information/i }).first(),",
    "      this.page.locator('[aria-label*=\"Record information\" i]').first(),",
    "      this.page.locator('section').filter({ hasText: /Record information/i }).first(),",
    "    ]);",
    "    if (!region) throw new Error('Cannot find Record information sidebar.');",
    "    const sf = await this.firstVisible([",
    "      region.getByRole('combobox').first(),",
    "      region.getByRole('textbox').first(),",
    "      region.locator('input').first(),",
    "    ]);",
    "    if (!sf) throw new Error('Cannot find consumer search field.');",
    "    await sf.click({ force: true });",
    "    await sf.fill('');",
    "    await sf.fill(searchValue);",
    "    for (const loc of [this.page.getByRole('option').first(), this.page.locator('[role=\"option\"]').first()]) {",
    "      try { await loc.waitFor({ state: 'visible', timeout: 5_000 }); await loc.click(); break; } catch { /* next */ }",
    "    }",
    "    await expect(region.getByText(escapeRegex(searchValue)).first()).toBeVisible({ timeout: 30_000 });",
    "  }",
    "",
    "  async searchOpenList(value: string): Promise<void> {",
    "    const sf = await this.firstVisible([",
    "      this.page.getByRole('searchbox').first(),",
    "      this.page.getByPlaceholder(/Search/i).first(),",
    "      this.page.locator('input[type=\"search\"]').first(),",
    "    ]);",
    "    if (!sf) throw new Error('Cannot find Open List search field.');",
    "    await sf.click({ force: true });",
    "    await sf.fill('');",
    "    await sf.fill(value);",
    "    await sf.press('Enter');",
    "  }",
    "",
    "  async findMatchingRow(value: string): Promise<Locator> {",
    "    const pat = escapeRegex(value);",
    "    const row = this.page.locator('[role=\"row\"], tr').filter({ hasText: pat }).first();",
    "    await expect(row).toBeVisible({ timeout: 30_000 });",
    "    return row;",
    "  }",
    "",
    "  async expectCallIdInRow(row: Locator): Promise<void> {",
    "    const header = this.page.locator('[role=\"columnheader\"], th').filter({ hasText: /Call id/i }).first();",
    "    await expect(header).toBeVisible({ timeout: 30_000 });",
    "    const headers = await this.page.locator('[role=\"columnheader\"], th').allTextContents();",
    "    const idx = headers.findIndex((t) => /call id/i.test(t));",
    "    if (idx >= 0) {",
    "      const cell = row.locator('[role=\"gridcell\"], td').nth(idx);",
    "      await expect(cell).toBeVisible({ timeout: 10_000 });",
    "      await expect(cell).not.toHaveText(/^\\s*$/);",
    "    } else {",
    "      await expect(row).toContainText(/Call id/i);",
    "    }",
    "  }",
    "",
    "  makeCaseDescription(): string {",
    "    const stamp = new Date().toISOString().replace(/[:.]/g, '-');",
    "    return '" + fields.descriptionPrefix + " ' + stamp;",
    "  }",
    "}",
  ].join("\n");

  const spec = [
    "// Story: " + fields.storyNumber,
    "import { test, expect } from '@playwright/test';",
    "import { LusCasePage } from '../pages/LusCasePage';",
    "",
    "const CONFIRM_LANE = '" + fields.confirmLane + "';",
    "",
    "test.describe('GSCTEST LUS case creation for " + fields.assignmentGroup + "', () => {",
    "  test.use({ storageState: 'playwright/.auth/gsctest-state.json', viewport: { width: 1600, height: 900 } });",
    "",
    "  test.beforeEach(() => {",
    "    test.skip(process.env.SN_CONFIRM_LANE !== CONFIRM_LANE, 'Set SN_CONFIRM_LANE=' + CONFIRM_LANE + ' before running this test.');",
    "  });",
    "",
    "  test('creates a LUS case, sets Genesys routing fields, and validates Call id in Open List', async ({ page }, testInfo) => {",
    "    test.slow();",
    "    const casePage = new LusCasePage(page);",
    "    const shortDescription = casePage.makeCaseDescription();",
    "",
    "    await test.step('Open the new LUS case form', async () => {",
    "      await casePage.gotoCreate();",
    "      await expect(page).toHaveURL(/sn-gsctest\\.churchofjesuschrist\\.org/);",
    "      await casePage.waitForCaseForm();",
    "      expect(page.viewportSize()?.width ?? 0).toBeGreaterThanOrEqual(1280);",
    "    });",
    "",
    "    await test.step('Populate the case header details', async () => {",
    "      await casePage.fillField('Short Description', shortDescription);",
    "      await casePage.selectReferenceValue('Assignment group', '" + fields.assignmentGroup + "');",
    "      await casePage.fillField('Reply to', '" + fields.replyTo + "');",
    "    });",
    "",
    "    await test.step('Save the draft case', async () => {",
    "      await casePage.clickSave();",
    "      await casePage.waitForSave(shortDescription);",
    "    });",
    "",
    "    await test.step('Search for the consumer in Record information', async () => {",
    "      await casePage.searchAndSelectConsumer('" + fields.consumerSearch + "');",
    "    });",
    "",
    "    await test.step('Set Channel and save again', async () => {",
    "      await casePage.selectReferenceValue('Channel', '" + fields.channelOption + "');",
    "      await casePage.clickSave();",
    "      await casePage.waitForSave(shortDescription);",
    "    });",
    "",
    "    await test.step('Open the Open List and search for the created case', async () => {",
    "      await casePage.gotoOpenList();",
    "      await expect(page).toHaveURL(/now\\/cwf\\/agent\\/list/);",
    "      await casePage.searchOpenList(shortDescription);",
    "    });",
    "",
    "    await test.step('Validate the row includes a Call id value', async () => {",
    "      const row = await casePage.findMatchingRow(shortDescription);",
    "      await casePage.expectCallIdInRow(row);",
    "    });",
    "",
    "    await test.step('Capture the final Open List screenshot', async () => {",
    "      await page.screenshot({ path: testInfo.outputPath('gsctest-lus-open-list.png'), fullPage: true });",
    "    });",
    "  });",
    "});",
  ].join("\n");

  return { pageObject, spec, pageName: "LusCasePage" };
}

function generateFsmWorkspaceTest(fields) {
  const pageObject = [
    "import { Page, Locator, expect } from '@playwright/test';",
    "",
    "function exactTextPattern(value: string): RegExp {",
    "  return new RegExp('^\\\\s*' + value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\s*$', 'i');",
    "}",
    "",
    "export class FsmWorkspacePage {",
    "  readonly page: Page;",
    "  readonly workspaceTitle: Locator;",
    "",
    "  constructor(page: Page) {",
    "    this.page = page;",
    "    this.workspaceTitle = page.getByText(exactTextPattern('" + fields.workspaceName + "')).first();",
    "  }",
    "",
    "  async goto(): Promise<void> {",
    "    await this.page.goto('" + fields.workspaceUrl + "', { waitUntil: 'domcontentloaded' });",
    "  }",
    "",
    "  async waitForHome(timeoutMs = 30_000): Promise<void> {",
    "    const mfa = this.page.getByRole('heading', { name: /Authenticator/i });",
    "    const result = await Promise.race([",
    "      this.workspaceTitle.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'ready').catch(() => 'timeout'),",
    "      mfa.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'mfa').catch(() => 'timeout'),",
    "    ]);",
    "    if (result === 'mfa') throw new Error('Auth state redirected to MFA.');",
    "    if (result === 'timeout') throw new Error('Workspace home did not load within timeout.');",
    "  }",
    "",
    "  async openAddFlow(): Promise<void> {",
    "    const nav = this.page.getByRole('navigation', { name: /^Tabs$/i });",
    "    await expect(nav).toBeVisible();",
    "    const candidates = [",
    "      nav.getByRole('button', { name: /add|create|new/i }),",
    "      nav.locator(\"button[aria-label*='add' i]\"),",
    "      nav.locator(\"button[aria-label*='new' i]\"),",
    "      nav.locator(\"button:has-text('+')\"),",
    "      nav.locator(\"[title*='add' i]\"),",
    "    ];",
    "    for (const loc of candidates) {",
    "      try { await loc.first().waitFor({ state: 'visible', timeout: 5_000 }); await loc.first().click(); return; } catch { /* next */ }",
    "    }",
    "    // Fallback: click just past the Home tab",
    "    const homeTab = this.page.getByRole('tab', { name: /^Home$/i }).first();",
    "    await expect(homeTab).toBeVisible();",
    "    const box = await homeTab.boundingBox();",
    "    if (!box) throw new Error('Cannot locate Home tab for fallback click.');",
    "    await this.page.mouse.click(box.x + box.width + 14, box.y + box.height / 2);",
    "  }",
    "",
    "  async expectNewCaseOptionVisible(): Promise<void> {",
    "    await expect(this.page.getByRole('menuitem', { name: /^" + fields.newCaseOption + "$/i })).toBeVisible();",
    "  }",
    "}",
  ].join("\n");

  const spec = [
    "import { test, expect } from '@playwright/test';",
    "import { FsmWorkspacePage } from '../pages/FsmWorkspacePage';",
    "",
    "test.describe('GSCTEST FSM Configurable Workspace navigation', () => {",
    "  test.use({ storageState: 'playwright/.auth/gsctest-state.json', viewport: { width: 1600, height: 900 } });",
    "",
    "  test('opens FSM Configurable Workspace home add flow and shows the CSAS case option', async ({ page }) => {",
    "    const workspacePage = new FsmWorkspacePage(page);",
    "    await workspacePage.goto();",
    "    await expect(page).toHaveURL(/sn-gsctest\\.churchofjesuschrist\\.org/);",
    "    await workspacePage.waitForHome();",
    "    await workspacePage.openAddFlow();",
    "    await workspacePage.expectNewCaseOptionVisible();",
    "  });",
    "});",
  ].join("\n");

  return { pageObject, spec, pageName: "FsmWorkspacePage" };
}

async function generateCustomTest(fields) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content:
          "Generate a TypeScript Playwright Page Object class and spec file for this ServiceNow test.\n\n" +
          "Test description: " + fields.testDescription + "\n" +
          "Target URL: " + fields.url + "\n" +
          "Story number: " + (fields.storyNumber || "N/A") + "\n\n" +
          "Rules:\n" +
          "- Strict TypeScript with @playwright/test\n" +
          "- Page Object class exported from a file named CustomPage.ts\n" +
          "- Spec imports from '../pages/CustomPage'\n" +
          "- storageState: 'playwright/.auth/gsctest-state.json'\n" +
          "- Race between readyLocator and MFA heading (Promise.race pattern)\n" +
          "- Use test.step() for logical steps\n" +
          "- ARIA-first selectors\n\n" +
          "Respond ONLY with valid JSON (no markdown fences):\n" +
          "{\"pageObject\": \"...\", \"spec\": \"...\", \"pageName\": \"CustomPage\"}"
      }],
    }),
  });
  const data = await response.json();
  const text = data.content.map((i) => i.text || "").join("\n");
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return { pageObject: text, spec: "// Could not parse spec separately", pageName: "CustomPage" };
  }
}

async function pushToGitHub(token, branchName, pageName, pageObject, spec, templateKey) {
  const base = "https://api.github.com/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO;
  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const refRes = await fetch(base + "/git/ref/heads/main", { headers });
  if (!refRes.ok) {
    const e = await refRes.json().catch(() => ({}));
    throw new Error("Failed to get main branch SHA: " + refRes.status + " — " + (e.message || refRes.statusText));
  }
  const { object: { sha: mainSha } } = await refRes.json();

  const branchRes = await fetch(base + "/git/refs", {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: "refs/heads/" + branchName, sha: mainSha }),
  });
  if (!branchRes.ok && branchRes.status !== 422) {
    const e = await branchRes.json().catch(() => ({}));
    throw new Error("Failed to create branch: " + branchRes.status + " — " + (e.message || branchRes.statusText));
  }

  const specFilename = "gsctest-" + templateKey.replace(/_/g, "-") + ".spec.ts";
  const pageFilename = pageName + ".ts";

  const files = [
    { path: "tests/e2e/" + specFilename, content: spec },
    { path: "tests/pages/" + pageFilename, content: pageObject },
  ];

  for (const file of files) {
    const existingRes = await fetch(base + "/contents/" + file.path + "?ref=" + branchName, { headers });
    let sha;
    if (existingRes.ok) { sha = (await existingRes.json()).sha; }

    const body = {
      message: "feat: add " + file.path + " for " + branchName,
      content: btoa(unescape(encodeURIComponent(file.content))),
      branch: branchName,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(base + "/contents/" + file.path, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!putRes.ok) {
      const e = await putRes.json().catch(() => ({}));
      throw new Error("Failed to push " + file.path + ": " + putRes.status + " — " + (e.message || putRes.statusText));
    }
  }

  return "https://github.com/" + GITHUB_OWNER + "/" + GITHUB_REPO + "/tree/" + branchName;
}

// ---------------------------------------------------------------------------
// React UI
// ---------------------------------------------------------------------------

export default function App() {
  const [step, setStep] = useState("select");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [fields, setFields] = useState({});
  const [branchName, setBranchName] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [generatedFiles, setGeneratedFiles] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState("");
  const [pushResult, setPushResult] = useState(null);
  const [activeTab, setActiveTab] = useState("spec");
  const [showToken, setShowToken] = useState(false);

  const handleTemplateSelect = (key) => {
    setSelectedTemplate(key);
    const defaults = {};
    TEST_TEMPLATES[key].fields.forEach((f) => { defaults[f.id] = ""; });
    setFields(defaults);
    setBranchName("");
    setGeneratedFiles(null);
    setPushResult(null);
    setError("");
    setStep("configure");
  };

  const handleGenerate = useCallback(async () => {
    setError("");
    setIsGenerating(true);
    try {
      let result;
      if (selectedTemplate === "custom") {
        result = await generateCustomTest(fields);
      } else if (selectedTemplate === "sprint_management") {
        result = generateSprintManagementTest(fields);
      } else if (selectedTemplate === "lus_case") {
        result = generateLusCaseTest(fields);
      } else {
        result = generateFsmWorkspaceTest(fields);
      }
      setGeneratedFiles(result);
      setStep("review");
    } catch (e) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedTemplate, fields]);

  const handlePush = useCallback(async () => {
    if (!branchName.trim()) { setError("Branch name is required."); return; }
    if (!githubToken.trim()) { setError("GitHub token is required."); return; }
    setError("");
    setIsPushing(true);
    try {
      const url = await pushToGitHub(
        githubToken, branchName.trim(),
        generatedFiles.pageName, generatedFiles.pageObject, generatedFiles.spec,
        selectedTemplate
      );
      setPushResult(url);
      setStep("done");
    } catch (e) {
      setError(e.message);
    } finally {
      setIsPushing(false);
    }
  }, [branchName, githubToken, generatedFiles, selectedTemplate]);

  const reset = () => {
    setStep("select"); setSelectedTemplate(null); setFields({});
    setBranchName(""); setGeneratedFiles(null); setPushResult(null); setError("");
  };

  const template = selectedTemplate ? TEST_TEMPLATES[selectedTemplate] : null;
  const steps = ["select", "configure", "review", "done"];

  const card = {
    background: "var(--color-bg, #fff)",
    border: "1px solid var(--color-border, #e5e7eb)",
    borderRadius: 12,
    padding: "20px",
    marginBottom: 14,
  };

  const mono = { fontFamily: "'IBM Plex Mono', 'Fira Mono', monospace" };
  const sans = { fontFamily: "'IBM Plex Sans', system-ui, sans-serif" };

  return (
    <div style={{ ...sans, minHeight: "100vh", background: "#f9fafb", color: "#111" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-test-pipe" style={{ fontSize: 16, color: "#2563eb" }} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, ...mono }}>GSC Automation Generator</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{GITHUB_OWNER}/{GITHUB_REPO}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {steps.map((s, i) => (
            <div key={s} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: step === s ? "#2563eb" : steps.indexOf(step) > i ? "#93c5fd" : "#e5e7eb"
            }} />
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>

        {/* STEP 1: SELECT */}
        {step === "select" && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>Select a test template</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 20px" }}>
              Each test generates TypeScript Playwright files with Page Object Model, pushed to a new branch in {GITHUB_OWNER}/{GITHUB_REPO}.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
              {Object.entries(TEST_TEMPLATES).map(([key, tmpl]) => (
                <button key={key} onClick={() => handleTemplateSelect(key)} style={{
                  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
                  padding: 16, cursor: "pointer", textAlign: "left",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <i className={"ti " + tmpl.icon} style={{ fontSize: 15, color: "#2563eb" }} aria-hidden="true" />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{tmpl.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>{tmpl.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: CONFIGURE */}
        {step === "configure" && template && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <button onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6b7280", display: "flex" }}>
                <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{template.label}</h2>
            </div>

            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Test configuration</div>
              {template.fields.map((f) => (
                <div key={f.id} style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                    {f.label}{f.required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea value={fields[f.id] || ""} onChange={(e) => setFields((p) => ({ ...p, [f.id]: e.target.value }))}
                      placeholder={f.placeholder} rows={3}
                      style={{ width: "100%", ...mono, fontSize: 12, resize: "vertical", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px" }} />
                  ) : (
                    <input type="text" value={fields[f.id] || ""} onChange={(e) => setFields((p) => ({ ...p, [f.id]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: "100%", ...mono, fontSize: 12, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px" }} />
                  )}
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>GitHub branch</div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                Branch name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)}
                placeholder="feat/STRY0482100-lus-case-genesys"
                style={{ width: "100%", ...mono, fontSize: 12, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px" }} />
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                Branches from <code style={mono}>main</code> in {GITHUB_OWNER}/{GITHUB_REPO}
              </div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#dc2626", ...mono }}>
                <i className="ti ti-alert-circle" style={{ marginRight: 6 }} aria-hidden="true" />{error}
              </div>
            )}

            <button onClick={handleGenerate} disabled={isGenerating || !branchName.trim()}
              style={{ width: "100%", padding: "11px", ...sans, fontSize: 13, fontWeight: 600, cursor: isGenerating || !branchName.trim() ? "not-allowed" : "pointer", opacity: isGenerating || !branchName.trim() ? 0.5 : 1, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8 }}>
              {isGenerating
                ? <span><i className="ti ti-loader-2" style={{ marginRight: 6 }} aria-hidden="true" />Generating…</span>
                : <span><i className="ti ti-wand" style={{ marginRight: 6 }} aria-hidden="true" />Generate TypeScript files</span>}
            </button>
          </div>
        )}

        {/* STEP 3: REVIEW */}
        {step === "review" && generatedFiles && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <button onClick={() => setStep("configure")} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6b7280", display: "flex" }}>
                <i className="ti ti-arrow-left" style={{ fontSize: 18 }} aria-hidden="true" />
              </button>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Review generated files</h2>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
                {[["spec", "gsctest-" + (selectedTemplate || "").replace(/_/g, "-") + ".spec.ts"], ["page", generatedFiles.pageName + ".ts"]].map(([tab, label]) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    padding: "10px 16px", fontSize: 11, fontWeight: activeTab === tab ? 600 : 400,
                    color: activeTab === tab ? "#2563eb" : "#6b7280",
                    background: activeTab === tab ? "#eff6ff" : "transparent",
                    border: "none", cursor: "pointer",
                    borderBottom: activeTab === tab ? "2px solid #2563eb" : "2px solid transparent",
                    ...mono,
                  }}>
                    <i className="ti ti-file-type-ts" style={{ marginRight: 5, fontSize: 13 }} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
              <pre style={{
                margin: 0, padding: 16, fontSize: 11, lineHeight: 1.6,
                overflowX: "auto", color: "#111", ...mono,
                maxHeight: 340, overflowY: "auto", background: "#f8fafc",
              }}>
                {activeTab === "spec" ? generatedFiles.spec : generatedFiles.pageObject}
              </pre>
            </div>

            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Push to GitHub</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>Branch</div>
                <code style={{ ...mono, fontSize: 12, color: "#2563eb" }}>{branchName}</code>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                  GitHub Personal Access Token <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type={showToken ? "text" : "password"} value={githubToken} onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    style={{ flex: 1, ...mono, fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px" }} />
                  <button onClick={() => setShowToken((p) => !p)} style={{ padding: "0 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer" }}>
                    <i className={"ti " + (showToken ? "ti-eye-off" : "ti-eye")} style={{ fontSize: 15 }} aria-hidden="true" />
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  Needs <code style={mono}>repo</code> scope —{" "}
                  <a href="https://github.com/settings/tokens/new?scopes=repo" style={{ color: "#2563eb" }} target="_blank" rel="noreferrer">create one here</a>
                </div>
              </div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#dc2626", ...mono }}>
                <i className="ti ti-alert-circle" style={{ marginRight: 6 }} aria-hidden="true" />{error}
              </div>
            )}

            <button onClick={handlePush} disabled={isPushing || !githubToken.trim()}
              style={{ width: "100%", padding: "11px", ...sans, fontSize: 13, fontWeight: 600, cursor: isPushing || !githubToken.trim() ? "not-allowed" : "pointer", opacity: isPushing || !githubToken.trim() ? 0.5 : 1, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8 }}>
              {isPushing
                ? <span><i className="ti ti-loader-2" style={{ marginRight: 6 }} aria-hidden="true" />Pushing to GitHub…</span>
                : <span><i className="ti ti-brand-github" style={{ marginRight: 6 }} aria-hidden="true" />Push to {GITHUB_OWNER}/{GITHUB_REPO}</span>}
            </button>
          </div>
        )}

        {/* STEP 4: DONE */}
        {step === "done" && pushResult && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <i className="ti ti-check" style={{ fontSize: 26, color: "#16a34a" }} aria-hidden="true" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Files pushed successfully</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>
              Branch <code style={{ ...mono, color: "#111" }}>{branchName}</code> is ready in {GITHUB_OWNER}/{GITHUB_REPO}
            </p>

            <div style={{ ...card, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Files created</div>
              {[
                "tests/e2e/gsctest-" + (selectedTemplate || "").replace(/_/g, "-") + ".spec.ts",
                "tests/pages/" + (generatedFiles && generatedFiles.pageName) + ".ts",
              ].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <i className="ti ti-file-type-ts" style={{ fontSize: 14, color: "#2563eb" }} aria-hidden="true" />
                  <code style={{ ...mono, fontSize: 12 }}>{f}</code>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <a href={pushResult} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#111", textDecoration: "none", fontWeight: 500 }}>
                <i className="ti ti-brand-github" aria-hidden="true" />View on GitHub
              </a>
              <button onClick={reset}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                <i className="ti ti-plus" aria-hidden="true" />New test
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
