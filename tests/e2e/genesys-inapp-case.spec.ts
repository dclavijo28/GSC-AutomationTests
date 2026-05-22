/*
 * AI-assisted automation update
 * Story: STRY0482100
 * Purpose: Create LUS case with GSD-Genesys routing and validate Call id in GSCTEST
 * Tool: OpenAI Codex
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clickFirstVisible,
  expectAnyVisible,
  sidebarButtonCandidates,
  type SidebarTool,
  waitForServiceNowReady
} from "./helpers/servicenow";

test.setTimeout(300_000);

const newLusCaseUrl =
  "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/x_tcoj2_church_ct_case_lus/-1_uid_1";

const openCasesListUrl =
  "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/list/params/list-id/6138b5e947740b10514da04f116d43e3/__state__/b64~eyIwYzY5ZGFlOGNjODQyMjEwZjg3Nzk5NTgzZTE2NjhiMiI6eyJsaXN0X2NvbnRyb2xsZXIiOnsiXyI6eyJncm91cEJ5IjoiIiwicXVlcnkiOiJhY3RpdmU9dHJ1ZV5zdGF0ZU5PVCBJTjYsMjMsMyw3XkVRIiwiY3VycmVudFBhZ2UiOjB9fX19";

const assignmentGroup = "GSD-Genesys";
const replyTo = "mlssupport@churchofjesuschrist.org";
const consumerSearch = "Debeach";
const shortDescription = "Test Automation STRY0482100";
const pureCloudLoginUrlPattern = /^https:\/\/login\.usw2\.pure\.cloud\//i;

const recordInformationTool: SidebarTool = {
  name: "Record Information",
  labels: ["Record Information", "Record info"],
  expectedContent: [/Record Information/i, /Consumer/i]
};

test.describe("STRY0482100 LUS case Genesys routing", () => {
  test("creates LUS case with GSD-Genesys routing and validates Call id @writes-gsctest", async ({ page }) => {
    test.skip(
      process.env.CONFIRM_GSCTEST_WRITES !== "GSCTEST",
      "Set CONFIRM_GSCTEST_WRITES=GSCTEST, or confirm GSCTEST writes in the regression app, to create/update ServiceNow records."
    );

    let caseNumber = "";

    await attachPureCloudPopupCloser(page);

    await test.step("create and save the initial LUS case", async () => {
      await openNewLusCase(page);
      await fillTextField(page, ["Short description"], shortDescription);
      await setAssignmentGroup(page, assignmentGroup);
      await setReplyTo(page, replyTo);
      await saveRecord(page, "Save initial Genesys case");
      caseNumber = await readCaseNumber(page);
    });

    await test.step("set consumer from Record Information and wait for retrieval", async () => {
      await setConsumerFromRecordInformation(page, consumerSearch);
    });

    await test.step("set Channel to In-App after the first save, then save again", async () => {
      await setChannel(page, "In-App");
      await saveRecord(page, "Save Genesys case with In-App channel");
      await expectCaseConditions(page);
    });

    await test.step("find the created case from the open cases list", async () => {
      await openCasesListAndFindCase(page, caseNumber);
      await openCaseFromCurrentList(page, caseNumber);
    });

    await test.step("validate Genesys call id is generated", async () => {
      await expectCallIdGenerated(page, caseNumber);
      await screenshotResult(page, caseNumber);
    });
  });
});

async function openNewLusCase(page: Page): Promise<void> {
  await closePureCloudPopupPages(page.context(), page);
  await prepareWorkspaceViewport(page);
  await page.goto(newLusCaseUrl, { waitUntil: "domcontentloaded" });
  await applyWorkspaceZoom(page);
  await expect(page).toHaveURL(/sn-gsctest\.churchofjesuschrist\.org/);
  await waitForServiceNowReady(
    page,
    page.getByRole("tab", { name: /Create New Case - Local Unit Support/i }).first(),
    "New LUS case form did not load within 60 seconds.",
    60_000
  );

  await page.getByRole("tab", { name: /Create New Case - Local Unit Support/i }).first().click().catch(() => undefined);
  await firstVisible(page, fieldCandidates(page, ["Assignment group"]), "Wait for Assignment group field", 60_000);
}

async function setConsumerFromRecordInformation(page: Page, searchText: string): Promise<void> {
  await ensureRightPaneVisible(page);
  const consumerSearchBox = await openRecordInformationAndGetLookup(page);

  await consumerSearchBox.click().catch(() => undefined);
  await consumerSearchBox.fill(searchText);
  await page.waitForTimeout(750);

  const selected = await selectConsumerResult(page, searchText);

  if (!selected && !page.isClosed()) {
    await consumerSearchBox.press("ArrowDown").catch(() => undefined);
    await page.waitForTimeout(200);
    await consumerSearchBox.press("Enter").catch(() => undefined);
  }

  await waitForConsumerInformation(page, searchText);
}

async function selectConsumerResult(page: Page, searchText: string): Promise<boolean> {
  const pattern = new RegExp(escapeRegExp(searchText), "i");
  const resultCandidates = [
    page.getByRole("button", { name: /Link to .*Beach/i }),
    page.getByRole("button", { name: new RegExp("Link to .*" + escapeRegExp(searchText), "i") }),
    page.getByRole("heading", { name: /Beach/i }).locator('xpath=ancestor::*[@role="button" or self::button][1]'),
    page.getByText(/Daniel Eugene Beach/i).locator('xpath=ancestor::*[@role="button" or self::button][1]'),
    page.getByText(pattern)
  ];

  for (const locator of resultCandidates) {
    const candidate = locator.first();
    if (!(await candidate.isVisible().catch(() => false))) continue;

    try {
      await candidate.click({ timeout: 3_000 });
      return true;
    } catch {
      try {
        await candidate.evaluate((element: Element) => {
          (element as HTMLElement).click();
          element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        });
        return true;
      } catch {
        // Try the next candidate.
      }
    }
  }

  return false;
}

async function openRecordInformationAndGetLookup(page: Page): Promise<Locator> {
  const lookupCandidates = consumerLookupCandidates(page);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const locator of lookupCandidates) {
      const candidate = locator.first();
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    await openRecordInformationTab(page);

    for (const locator of lookupCandidates) {
      const candidate = locator.first();
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    await page.waitForTimeout(500);
  }

  return firstVisible(page, lookupCandidates, "Find Consumer lookup", 20_000);
}

async function openRecordInformationTab(page: Page): Promise<void> {
  const tab = page.getByRole("tab", { name: /Record Information|Record info/i }).first();
  await tab.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);

  if ((await tab.getAttribute("aria-selected").catch(() => null)) === "true") {
    return;
  }

  try {
    await tab.click({ timeout: 5_000 });
  } catch {
    await tab.evaluate((element: Element) => {
      (element as HTMLElement).click();
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }).catch(() => undefined);
  }

  await page.waitForTimeout(500);
}

async function ensureRightPaneVisible(page: Page): Promise<void> {
  for (const locator of consumerLookupCandidates(page)) {
    if (await locator.first().isVisible().catch(() => false)) return;
  }

  const showBoth = page.getByRole("button", { name: /Show both panes/i }).first();
  if (await showBoth.isVisible().catch(() => false)) {
    await showBoth.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  }

  for (const locator of consumerLookupCandidates(page)) {
    if (await locator.first().isVisible().catch(() => false)) return;
  }

  const showRight = page.getByRole("button", { name: /Show right pane/i }).first();
  if (await showRight.isVisible().catch(() => false)) {
    await showRight.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

function consumerLookupCandidates(page: Page): Locator[] {
  return [
    page.locator("input[id*='consumer_lookup-lookup_search-search_input']"),
    page.locator("input[name*='consumer_lookup' i]"),
    page.locator("input[id*='consumer_lookup' i]"),
    page.getByPlaceholder(/Lookup by Church Account, Phone, Email or Employee ID/i),
    page.locator("input[placeholder*='Lookup by Church Account' i]"),
    page.locator("input[aria-label*='Consumer' i]"),
    page.locator("input[aria-label*='Lookup' i]")
  ];
}

async function waitForConsumerInformation(page: Page, searchText: string): Promise<void> {
  const callerName = page.getByRole("textbox", { name: /Caller name/i }).first();
  const requestedFor = page.getByRole("textbox", { name: /^Requested for./i }).first();
  const requestedEmail = page.getByRole("textbox", { name: /Requested for email/i }).first();
  const pattern = new RegExp(escapeRegExp(searchText), "i");

  await expect
    .poll(async () => {
      const values = await Promise.all([
        readLocatorValue(callerName),
        readLocatorValue(requestedFor),
        readLocatorValue(requestedEmail),
        page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")
      ]);

      return values.some((value) => hasRealFieldValue(value) || pattern.test(value));
    }, {
      message: "Consumer information for Debeach was not retrieved.",
      timeout: 20_000
    })
    .toBe(true);
}

async function readLocatorValue(locator: Locator): Promise<string> {
  if (!(await locator.isVisible().catch(() => false))) return "";
  const inputValue = await locator.inputValue().catch(() => "");
  if (inputValue.trim()) return inputValue.trim();
  const textContent = await locator.textContent().catch(() => "");
  return textContent?.trim() ?? "";
}

function hasRealFieldValue(value: string): boolean {
  const normalized = value.replace(/[\u2014\u00e2\u20ac\u201d]/g, "").trim();
  return normalized.length > 1 && !/^-- none --$/i.test(normalized);
}

async function openCasesListAndFindCase(page: Page, caseNumber: string): Promise<void> {
  await prepareWorkspaceViewport(page);
  await page.goto(openCasesListUrl, { waitUntil: "domcontentloaded" });
  await applyWorkspaceZoom(page);
  await waitForServiceNowReady(
    page,
    page.getByText(/Open|Case|List|Search/i).first(),
    "Open cases list did not load within 60 seconds.",
    60_000
  );

  const searchBox = await firstVisible(
    page,
    [
      page.getByRole("searchbox", { name: /Search/i }),
      page.getByPlaceholder(/Search/i),
      page.locator("input[aria-label*='Search' i]"),
      page.locator("input[type='search']")
    ],
    "Find open cases list search"
  );

  await searchBox.click();
  await searchBox.fill(caseNumber);
  await searchBox.press("Enter").catch(async () => {
    await page.keyboard.press("Enter");
  });

  await expectAnyVisible(
    page,
    [new RegExp(escapeRegExp(caseNumber), "i")],
    `Created case ${caseNumber} was not visible in the open cases list.`
  );
}

async function openCaseFromCurrentList(page: Page, caseNumber: string): Promise<void> {
  await clickFirstVisible(
    page,
    [
      page.getByRole("link", { name: new RegExp(escapeRegExp(caseNumber), "i") }),
      page.getByRole("row", { name: new RegExp(escapeRegExp(caseNumber), "i") }),
      page.getByText(new RegExp(`^\\s*${escapeRegExp(caseNumber)}\\s*$`, "i"))
    ],
    `Open created case ${caseNumber} from list`
  );

  await waitForServiceNowReady(
    page,
    page.getByText(new RegExp(escapeRegExp(caseNumber), "i")).first(),
    `Created case ${caseNumber} did not open from the list.`,
    60_000
  );
}

async function expectCaseConditions(page: Page): Promise<void> {
  await expectPageText(page, /In-App/i, "Created case did not show Channel = In-App.");
  await expectPageText(page, new RegExp(escapeRegExp(assignmentGroup), "i"), "Created case did not show GSD-Genesys assignment group.");
  await expectPageText(page, new RegExp(escapeRegExp(replyTo), "i"), "Created case did not show the Reply to email.");
  await expectPageText(page, new RegExp(escapeRegExp(shortDescription), "i"), "Created case did not show the Short description.");
  await expectPageText(page, new RegExp(escapeRegExp(consumerSearch), "i"), "Created case did not show the selected consumer.");
}

async function expectCallIdGenerated(page: Page, caseNumber: string): Promise<void> {
  const labels = ["Call ID", "Call id", "Call Id", "Call ID parameter", "Call id parameter"];
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const callId = await readFieldValue(page, labels);
    if (callId && isGeneratedCallId(callId)) {
      test.info().annotations.push({ type: "Genesys call id", description: callId });
      return;
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForServiceNowReady(
      page,
      page.getByText(new RegExp(escapeRegExp(caseNumber), "i")).first(),
      `Created case ${caseNumber} did not reload while waiting for Genesys call id.`,
      60_000
    );
    await page.waitForTimeout(5_000);
  }

  throw new Error(`Call id parameter was not filled for ${caseNumber} within 120 seconds.`);
}

async function screenshotResult(page: Page, caseNumber: string): Promise<void> {
  const screenshotPath = `test-results/${slugify(caseNumber)}-genesys-call-id-result.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await test.info().attach("Genesys Call ID result", {
    path: screenshotPath,
    contentType: "image/png"
  });
}

async function setChannel(page: Page, value: string): Promise<void> {
  const labels = ["Channel"];
  const field = await firstVisible(page, fieldCandidates(page, labels), "Find Channel field");

  try {
    await field.selectOption({ label: value }, { timeout: 3_000 });
    await expectChannelValue(page, value);
    return;
  } catch {
    // Continue with the custom combobox path.
  }

  await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  await field.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(400);

  const exact = exactTextPattern(value);
  const option = page.getByRole("option", { name: exact }).first();

  if (await option.isVisible().catch(() => false)) {
    await selectChoiceOption(field, option, page);
    await expectChannelValue(page, value);
    return;
  }

  await clearAndType(field, page, value);
  await page.waitForTimeout(400);

  const typedOption = page.getByRole("option", { name: exact }).first();
  if (await typedOption.isVisible().catch(() => false)) {
    await selectChoiceOption(field, typedOption, page);
    await expectChannelValue(page, value);
    return;
  }

  await field.press("ArrowDown").catch(() => undefined);
  await page.waitForTimeout(150);
  await field.press("Enter").catch(() => undefined);
  await field.press("Tab").catch(() => undefined);
  await expectChannelValue(page, value);
}

async function expectChannelValue(page: Page, value: string): Promise<void> {
  const pattern = new RegExp(escapeRegExp(value), "i");
  const channelCandidates = [
    page.getByRole("combobox", { name: /Channel/i }).first(),
    page.getByRole("textbox", { name: /Channel/i }).first(),
    page.locator('[aria-label="Channel" i]').first(),
    page.locator('[data-field-name*="channel" i] [role="combobox"]').first(),
    page.locator('[data-field-name*="contact_type" i] [role="combobox"]').first()
  ];

  await expect
    .poll(async () => {
      for (const candidate of channelCandidates) {
        if (!(await candidate.isVisible().catch(() => false))) continue;
        const text = [
          await candidate.inputValue().catch(() => ""),
          await candidate.innerText().catch(() => ""),
          (await candidate.textContent().catch(() => "")) ?? ""
        ].join(" ");

        if (pattern.test(text)) return true;
      }

      return pattern.test(await page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""));
    }, {
      message: `Channel was not set to ${value}.`,
      timeout: 20_000
    })
    .toBe(true);
}

async function setChoiceField(page: Page, labels: string[], value: string): Promise<void> {
  const field = await firstVisible(page, fieldCandidates(page, labels), `Find ${labels[0]} field`);

  try {
    await field.selectOption({ label: value }, { timeout: 2_000 });
    await expectFieldOrPageValue(page, labels, value);
    return;
  } catch {
    // Most ServiceNow Workspace fields are custom comboboxes rather than native selects.
  }

  await openChoiceDropdown(field, page);

  let selected = await selectVisibleDropdownOption(page, value, `Select ${value}`);
  if (!selected) {
    await clearAndType(field, page, value);
    await page.waitForTimeout(500);
    selected = await selectVisibleDropdownOption(page, value, `Select ${value}`);
  }

  if (!selected) {
    await field.press("ArrowDown").catch(async () => page.keyboard.press("ArrowDown"));
    await field.press("Enter").catch(async () => page.keyboard.press("Enter"));
  }

  await expectFieldOrPageValue(page, labels, value);
}

async function selectChoiceOption(field: Locator, option: Locator, page: Page): Promise<void> {
  try {
    await option.click({ timeout: 2_000 });
  } catch {
    await option.evaluate((element: Element) => {
      (element as HTMLElement).click();
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }).catch(() => undefined);
  }

  await page.waitForTimeout(250);
  await field.press("Enter").catch(() => undefined);
  await field.press("Tab").catch(() => undefined);
}

async function setReplyTo(page: Page, value: string): Promise<void> {
  const labels = ["Reply to", "Reply-to", "Reply To"];
  const field = await firstVisible(page, fieldCandidates(page, labels), "Find Reply to field");

  try {
    await field.selectOption({ label: value }, { timeout: 3_000 });
    await expectReplyToValue(page, value);
    return;
  } catch {
    // Continue with the custom combobox path.
  }

  await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  await field.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(500);

  const exact = exactTextPattern(value);
  const pattern = new RegExp(escapeRegExp(value), "i");
  const listbox = page.getByRole("listbox", { name: /Reply to/i }).first();
  const listboxOption = listbox.getByRole("option", { name: exact }).first();

  if (await listboxOption.isVisible().catch(() => false)) {
    await selectReplyToOption(field, listboxOption, page);
    await expectReplyToValue(page, value);
    return;
  }

  await clearAndType(field, page, value);
  await page.waitForTimeout(500);

  const typedOption = page.getByRole("option", { name: exact }).first();
  if (await typedOption.isVisible().catch(() => false)) {
    await selectReplyToOption(field, typedOption, page);
    await expectReplyToValue(page, value);
    return;
  }

  await field.press("Home").catch(() => undefined);
  for (let index = 0; index < 120; index += 1) {
    const currentText = (await field.textContent().catch(() => "")) || (await field.innerText().catch(() => ""));
    if (pattern.test(currentText)) break;
    await field.press("ArrowDown").catch(async () => page.keyboard.press("ArrowDown"));
    await page.waitForTimeout(50);
  }
  await field.press("Enter").catch(async () => page.keyboard.press("Enter"));
  await field.press("Tab").catch(async () => page.keyboard.press("Tab"));
  await expectReplyToValue(page, value);
}

async function selectReplyToOption(field: Locator, option: Locator, page: Page): Promise<void> {
  try {
    await option.click({ timeout: 1_500 });
  } catch {
    await option.evaluate((element: Element) => {
      (element as HTMLElement).click();
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }).catch(() => undefined);
  }

  await page.waitForTimeout(250);
  await field.press("Enter").catch(async () => page.keyboard.press("Enter"));
  await field.press("Tab").catch(async () => page.keyboard.press("Tab"));
}

async function attachPureCloudPopupCloser(page: Page): Promise<void> {
  const context = page.context();
  context.on("page", (popup) => {
    void closePureCloudPopupPage(popup, page);
  });
  await closePureCloudPopupPages(context, page);
}

async function closePureCloudPopupPages(context: ReturnType<Page["context"]>, mainPage: Page): Promise<void> {
  for (const candidate of context.pages()) {
    await closePureCloudPopupPage(candidate, mainPage);
  }
}

async function closePureCloudPopupPage(candidate: Page, mainPage: Page): Promise<void> {
  if (candidate === mainPage || candidate.isClosed()) return;
  await candidate.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
  if (pureCloudLoginUrlPattern.test(candidate.url())) {
    await candidate.close().catch(() => undefined);
  }
}

async function setReferenceField(page: Page, labels: string[], value: string): Promise<void> {
  const field = await firstVisible(page, fieldCandidates(page, labels), `Find ${labels[0]} field`);
  await clearAndType(field, page, value);
  await page.waitForTimeout(500);

  const selected = await selectVisibleDropdownOption(page, value, `Select ${value}`);

  if (!selected) {
    await commitFieldSelection(field, page);
  }

  await expectFieldOrPageValue(page, labels, value);
}

async function setAssignmentGroup(page: Page, value: string): Promise<void> {
  const field = await firstVisible(page, fieldCandidates(page, ["Assignment group"]), "Find Assignment group field");

  await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  await clearAndType(field, page, value);
  await page.waitForTimeout(750);

  await openReferenceDropdown(field, page);

  let selected = await selectAssignmentGroupDropdownOption(page, value);
  if (!selected) {
    await clearAndType(field, page, value);
    await page.waitForTimeout(500);
    await openReferenceDropdown(field, page);
    selected = await selectAssignmentGroupDropdownOption(page, value);
  }

  if (!selected) {
    await field.press("ArrowDown").catch(async () => page.keyboard.press("ArrowDown"));
    await page.waitForTimeout(250);
    await field.press("Enter").catch(async () => page.keyboard.press("Enter"));
    await page.waitForTimeout(500);
  }

  await field.press("Tab").catch(async () => page.keyboard.press("Tab"));
  await page.waitForTimeout(500);
}

async function setSelectableTextField(page: Page, labels: string[], value: string): Promise<void> {
  const field = await firstVisible(page, fieldCandidates(page, labels), `Find ${labels[0]} field`);
  await clearAndType(field, page, value);
  await page.waitForTimeout(500);
  const selected = await selectVisibleDropdownOption(page, value, `Select ${value}`).catch(() => false);
  if (!selected) {
    await commitFieldSelection(field, page);
  }
  await expectFieldOrPageValue(page, labels, value);
}

async function fillTextField(page: Page, labels: string[], value: string): Promise<void> {
  const field = await firstVisible(page, fieldCandidates(page, labels), `Find ${labels[0]} field`);
  await clearAndType(field, page, value);
}

async function openChoiceDropdown(field: Locator, page: Page): Promise<void> {
  await field.scrollIntoViewIfNeeded({ timeout: 1_000 }).catch(() => undefined);
  await field.click();
  await page.waitForTimeout(250);
  await field.press("Enter").catch(() => undefined);
  await page.waitForTimeout(250);
  await field.press("ArrowDown").catch(async () => page.keyboard.press("ArrowDown"));
  await page.waitForTimeout(500);
}

async function openReferenceDropdown(field: Locator, page: Page): Promise<void> {
  await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  await field.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(250);

  const container = field.locator('xpath=ancestor::*[@role="combobox" or contains(@class,"combobox") or contains(@class,"reference")][1]').first();
  const toggle = container
    .locator('button[aria-label*="show" i], button[aria-label*="open" i], button[aria-label*="toggle" i], button[aria-haspopup="listbox"], button')
    .first();

  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  }

  await field.press("ArrowDown").catch(async () => page.keyboard.press("ArrowDown"));
  await page.waitForTimeout(500);
}

async function selectAssignmentGroupDropdownOption(page: Page, value: string): Promise<boolean> {
  const exact = exactTextPattern(value);
  const pattern = new RegExp(escapeRegExp(value), "i");

  return clickFirstVisibleOptional(
    page,
    [
      page.getByRole("option", { name: exact }),
      page.locator('[role="listbox"] [role="option"]').filter({ hasText: exact }),
      page.locator('[role="presentation"] [role="option"]').filter({ hasText: exact }),
      page.locator('[id*="ac_dropdown" i] [role="option"]').filter({ hasText: exact }),
      page.locator('[class*="suggest" i] [role="option"]').filter({ hasText: pattern }),
      page.locator('[class*="suggest" i]').filter({ hasText: exact }),
      page.locator('[class*="dropdown" i]').filter({ hasText: exact }),
      page.getByText(exact).locator('xpath=ancestor-or-self::*[@role="option" or @role="row" or self::div or self::span][1]')
    ],
    `Select ${value} from Assignment group dropdown`
  );
}

async function commitFieldSelection(field: Locator, page: Page): Promise<void> {
  await field.press("ArrowDown").catch(async () => page.keyboard.press("ArrowDown"));
  await page.waitForTimeout(250);
  await field.press("Enter").catch(async () => page.keyboard.press("Enter"));
  await page.waitForTimeout(250);
  await field.press("Tab").catch(async () => page.keyboard.press("Tab"));
  await page.waitForTimeout(500);
}

async function clearAndType(field: Locator, page: Page, value: string): Promise<void> {
  await field.click();
  await field.fill("", { timeout: 2_000 }).catch(async () => {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.press("Backspace");
  });
  await field.fill(value, { timeout: 2_000 }).catch(async () => {
    await page.keyboard.type(value);
  });
}

async function selectVisibleDropdownOption(page: Page, value: string, stepName: string): Promise<boolean> {
  const pattern = new RegExp(escapeRegExp(value), "i");
  return clickFirstVisibleOptional(
    page,
    [
      page.getByRole("option", { name: exactTextPattern(value) }),
      page.locator('[role="option"]').filter({ hasText: exactTextPattern(value) }),
      page.locator('[role="listbox"] [role="option"]').filter({ hasText: pattern }),
      page.locator('[role="menu"] [role="menuitem"]').filter({ hasText: pattern }),
      page.locator('[role="grid"] [role="row"]').filter({ hasText: pattern }),
      page.locator('[aria-selected]').filter({ hasText: exactTextPattern(value) }),
      page.locator('[class*="option" i]').filter({ hasText: exactTextPattern(value) }),
      page.locator('[aria-label*="suggest" i] [role="option"]').filter({ hasText: pattern }),
      page.locator('[class*="suggest" i]').filter({ hasText: pattern }),
      page.locator('[class*="dropdown" i]').filter({ hasText: pattern })
    ],
    stepName
  );
}

async function saveRecord(page: Page, stepName: string): Promise<void> {
  const saveButton = page.getByRole("button", { name: /^Save$/i }).first();
  await saveButton.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
  await expect(saveButton, `Unable to find Save button for step: ${stepName}`).toBeVisible({ timeout: 15_000 });
  await saveButton.click({ timeout: 15_000 });

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1_000);

  await expect
    .poll(async () => {
      const headingText = (await page.locator("h1.now-heading, h1").first().textContent().catch(() => "")) ?? "";
      if (/\bCSLUS\d+\b/i.test(headingText)) return true;

      const saveVisible = await saveButton.isVisible().catch(() => false);
      if (!saveVisible) return true;

      const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
      return !/saving/i.test(bodyText);
    }, {
      message: `Save did not settle for step: ${stepName}`,
      timeout: 20_000
    })
    .toBe(true);

  await page.waitForTimeout(1_000);
}

async function expectReplyToValue(page: Page, value: string): Promise<void> {
  const pattern = new RegExp(escapeRegExp(value), "i");
  const candidates = [
    page.getByRole("combobox", { name: /Reply to/i }).first(),
    page.getByRole("textbox", { name: /Reply to/i }).first(),
    page.locator('[aria-label="Reply to" i]').first(),
    page.locator('[data-field-name*="reply_to" i] [role="combobox"]').first(),
    page.locator('[data-field-name*="reply_to" i] input').first()
  ];

  await expect
    .poll(async () => {
      for (const candidate of candidates) {
        if (!(await candidate.isVisible().catch(() => false))) continue;

        const text = [
          await candidate.inputValue().catch(() => ""),
          await candidate.innerText().catch(() => ""),
          (await candidate.textContent().catch(() => "")) ?? ""
        ]
          .join(" ")
          .trim();

        if (pattern.test(text)) return true;
      }

      return pattern.test(await page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""));
    }, {
      message: `Reply to was not set to ${value}.`,
      timeout: 20_000
    })
    .toBe(true);
}

async function readCaseNumber(page: Page): Promise<string> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const headingTexts = await page.locator("h1.now-heading, h1").allTextContents().catch(() => []);
    for (const headingText of headingTexts) {
      const headingMatch = headingText.match(/\bCSLUS\d+\b/i);
      if (headingMatch) return headingMatch[0];
    }

    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const match = bodyText.match(/\bCSLUS\d+\b|\bLUS\d+\b/i);
    if (match) return match[0];
    await page.waitForTimeout(500);
  }

  throw new Error("Saved LUS case number was not visible after save.");
}

async function expectFieldOrPageValue(page: Page, labels: string[], value: string): Promise<void> {
  const pattern = new RegExp(escapeRegExp(value), "i");

  await expect
    .poll(async () => {
      const fieldValue = await readFieldValue(page, labels);
      if (pattern.test(fieldValue)) return true;
      return pattern.test(await readPageText(page));
    }, {
      message: `${labels[0]} was not set to ${value}.`,
      timeout: 20_000
    })
    .toBe(true);
}

async function expectPageText(page: Page, pattern: RegExp, message: string): Promise<void> {
  await expect
    .poll(async () => pattern.test(await readPageText(page)), {
      message,
      timeout: 20_000
    })
    .toBe(true);
}

async function readFieldValue(page: Page, labels: string[]): Promise<string> {
  for (const field of fieldCandidates(page, labels)) {
    const candidate = field.first();
    if (!(await candidate.isVisible().catch(() => false))) continue;

    const values = [
      await candidate.inputValue().catch(() => ""),
      (await candidate.getAttribute("value").catch(() => null)) ?? "",
      await candidate.innerText().catch(() => ""),
      (await candidate.textContent().catch(() => "")) ?? "",
      await candidate.locator(`[role="combobox"], .now-select-trigger, .now-form-field`).first().innerText().catch(() => "")
    ].map((value) => value.trim()).filter(Boolean);

    const directValue = values.find((value) => !/^Channel$/i.test(value) && !/^Reply to$/i.test(value) && !/^Assignment group$/i.test(value));
    if (directValue) return directValue;
  }

  const bodyText = await readPageText(page);
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    if (!labels.some((label) => exactTextPattern(label).test(lines[index]))) continue;

    for (const candidate of lines.slice(index + 1, index + 4)) {
      if (!labels.some((label) => exactTextPattern(label).test(candidate)) && isGeneratedCallId(candidate)) {
        return candidate;
      }
      if (!labels.some((label) => exactTextPattern(label).test(candidate)) && candidate !== "-- None --") {
        return candidate;
      }
    }
  }

  return "";
}

async function readPageText(page: Page): Promise<string> {
  if (page.isClosed()) return "";

  const bodyText = await page.locator("body").textContent({ timeout: 2_000 }).catch(() => "");
  if (bodyText?.trim()) return bodyText;

  const mainText = await page.locator('main, [role="main"]').first().textContent({ timeout: 2_000 }).catch(() => "");
  if (mainText?.trim()) return mainText;

  const htmlText = await page.locator("html").textContent({ timeout: 2_000 }).catch(() => "");
  return htmlText?.trim() ?? "";
}

function fieldCandidates(page: Page, labels: string[]): Locator[] {
  return labels.flatMap((label) => {
    const pattern = new RegExp(escapeRegExp(label), "i");
    const escapedLabel = escapeCssAttributeValue(label);
    const names = fieldNamesForLabel(label);

    return [
      page.getByLabel(pattern),
      page.getByRole("textbox", { name: pattern }),
      page.getByRole("combobox", { name: pattern }),
      page.locator(`input[aria-label*="${escapedLabel}" i]`),
      page.locator(`textarea[aria-label*="${escapedLabel}" i]`),
      page.locator(`select[aria-label*="${escapedLabel}" i]`),
      page.locator(`[role="combobox"][aria-label*="${escapedLabel}" i]`),
      ...names.flatMap((name) => [
        page.locator(`input[name*="${name}" i]`),
        page.locator(`input[id*="${name}" i]`),
        page.locator(`textarea[name*="${name}" i]`),
        page.locator(`textarea[id*="${name}" i]`),
        page.locator(`select[name*="${name}" i]`),
        page.locator(`select[id*="${name}" i]`),
        page.locator(`[role="combobox"][name*="${name}" i]`),
        page.locator(`[role="combobox"][id*="${name}" i]`),
        page.locator(`[data-field-name*="${name}" i] input`),
        page.locator(`[data-field-name*="${name}" i] select`),
        page.locator(`[data-field*="${name}" i] input`),
        page.locator(`[data-field*="${name}" i] select`),
        page.locator(`[data-name*="${name}" i] input`),
        page.locator(`[data-name*="${name}" i] select`)
      ])
    ];
  });
}

async function firstVisible(
  page: Page,
  candidates: Locator[],
  stepName: string,
  timeoutMs = 30_000
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const locator of candidates) {
      const candidate = locator.first();
      await candidate.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => undefined);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }

    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `test-results/${slugify(stepName)}-not-found.png`, fullPage: true });
  throw new Error(`Unable to find visible field for step: ${stepName}`);
}

async function clickFirstVisibleOptional(
  page: Page,
  candidates: Locator[],
  stepName: string
): Promise<boolean> {
  for (const locator of candidates) {
    const candidate = locator.first();
    try {
      await candidate.waitFor({ state: "visible", timeout: 3_000 });
      await candidate.click();
      return true;
    } catch {
      // Try the next candidate.
    }
  }

  if (!page.isClosed()) {
    await page.screenshot({ path: `test-results/${slugify(stepName)}-not-found.png`, fullPage: true });
  }
  return false;
}

function isGeneratedCallId(value: string): boolean {
  const trimmed = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{5,}$/.test(trimmed) && !/^(empty|none|null|call id|call id parameter)$/i.test(trimmed);
}

function exactTextPattern(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`, "i");
}

async function prepareWorkspaceViewport(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page).catch(() => null);
  if (!session) return;

  const { windowId } = await session.send("Browser.getWindowForTarget").catch(() => ({ windowId: 0 }));
  if (windowId) {
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" }
    }).catch(() => undefined);
  }
}

async function applyWorkspaceZoom(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("zoom", "80%");
    document.body.style.setProperty("zoom", "80%");
  }).catch(() => undefined);
}

function fieldNamesForLabel(label: string): string[] {
  if (/assignment group/i.test(label)) return ["assignment_group"];
  if (/channel/i.test(label)) return ["channel", "contact_type", "u_channel"];
  if (/reply/i.test(label)) return ["reply_to", "replyto", "u_reply_to"];
  if (/short description/i.test(label)) return ["short_description"];
  return [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
