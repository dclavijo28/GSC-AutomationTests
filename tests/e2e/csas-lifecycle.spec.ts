import { expect, test, type Locator, type Page } from "@playwright/test";
import { clickFirstVisible, setServiceNowWorkspaceWindowSize, waitForServiceNowReady } from "./helpers/servicenow";
import { serviceNowEnvironmentConfig } from "./helpers/servicenow-config";
import { serviceNowLoginOptionsForEnvironment } from "./helpers/servicenow-login";

test.setTimeout(240_000);

const gsctest = serviceNowEnvironmentConfig("gsctest");
const gsctestLogin = serviceNowLoginOptionsForEnvironment("gsctest");
const areaSupportRole = "x_tcoj2_church_ct.case_as_user";
const assignmentGroup = "GSD-ITS-EMP-CORE";

test.describe("STRY0431121 CSAS workflow and lifecycle", () => {
  test("creates and saves a CSAS case with an assigned consumer @writes-gsctest", async ({ page }) => {
    requireGsctestWriteConfirmation();

    const userName = await test.step("verify signed-in user has the Area Support role", async () => {
      const signedInUser = await getSignedInUserName(page);
      await verifyAreaSupportRole(page, signedInUser);
      return signedInUser;
    });

    const shortDescription = `Automation Test # ${Date.now()}`;
    const consumer = await test.step("create and save a new CSAS case", async () => {
      await openNewCsasCase(page);
      await fillShortDescription(page, shortDescription);
      await setAssignmentGroup(page, assignmentGroup);
      const selectedConsumer = await selectFirstAvailableConsumer(page);
      await saveCase(page);
      return selectedConsumer;
    });

    await test.step("validate the new case and consumer", async () => {
      const caseNumber = await waitForCreatedCsasCase(page, shortDescription);
      await expect.poll(async () => (await page.locator("body").innerText()).includes(consumer), {
        message: `Created CSAS case ${caseNumber} did not show the selected consumer ${consumer}.`,
      }).toBe(true);

      test.info().annotations.push(
        { type: "ServiceNow user", description: userName },
        { type: "Created CSAS case", description: caseNumber },
        { type: "Consumer", description: consumer }
      );
    });
  });
});

function requireGsctestWriteConfirmation(): void {
  if (process.env.CONFIRM_GSCTEST_WRITES !== "GSCTEST") {
    throw new Error(
      "This test creates a GSCTEST CSAS case. Set CONFIRM_GSCTEST_WRITES=GSCTEST or confirm the write run in GSC Regression Runner."
    );
  }
}

async function getSignedInUserName(page: Page): Promise<string> {
  const workspaceUrl = new URL("/now/cwf/agent", gsctest.baseUrl).toString();
  await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
  await waitForServiceNowReady(
    page,
    page.getByRole("button", { name: /:\s*(available|away|offline|busy)/i }).first(),
    "ServiceNow workspace did not load while identifying the signed-in user.",
    60_000,
    { ...gsctestLogin, resumeUrl: workspaceUrl }
  );

  const profileButton = page.getByRole("button", { name: /:\s*(available|away|offline|busy)/i }).first();
  const profileName = ((await profileButton.getAttribute("aria-label")) ?? (await profileButton.innerText())).trim();
  const userName = profileName.replace(/:\s*(available|away|offline|busy).*$/i, "").trim();
  if (!userName) {
    throw new Error("ServiceNow did not expose the signed-in user's name in the workspace header.");
  }

  return userName;
}

async function verifyAreaSupportRole(page: Page, userName: string): Promise<void> {
  const userListUrl = new URL("/sys_user_list.do", gsctest.baseUrl);
  userListUrl.searchParams.set("sysparm_query", `name=${userName}`);
  userListUrl.searchParams.set("sysparm_limit", "1");
  await page.goto(userListUrl.toString(), { waitUntil: "domcontentloaded" });
  await waitForServiceNowReady(
    page,
    page.getByText(exactTextPattern(userName)).first(),
    `The signed-in user ${userName} was not found in sys_user.list.`,
    60_000,
    { ...gsctestLogin, resumeUrl: userListUrl.toString() }
  );

  const roleListUrl = new URL("/sys_user_has_role_list.do", gsctest.baseUrl);
  roleListUrl.searchParams.set("sysparm_query", `user.name=${userName}^role.name=${areaSupportRole}`);
  roleListUrl.searchParams.set("sysparm_limit", "1");
  await page.goto(roleListUrl.toString(), { waitUntil: "domcontentloaded" });
  await waitForServiceNowReady(
    page,
    page.getByText(exactTextPattern(areaSupportRole)).first(),
    `User ${userName} does not have the required role ${areaSupportRole}.`,
    60_000,
    { ...gsctestLogin, resumeUrl: roleListUrl.toString() }
  );
}

async function openNewCsasCase(page: Page): Promise<void> {
  const workspaceUrl = new URL("/now/cwf/agent", gsctest.baseUrl).toString();
  await setServiceNowWorkspaceWindowSize(page);
  await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
  await waitForServiceNowReady(
    page,
    page.getByRole("button", { name: /^Add$/i }).first(),
    "ServiceNow workspace did not load the Add case menu.",
    60_000,
    { ...gsctestLogin, resumeUrl: workspaceUrl }
  );

  await page.getByRole("button", { name: /^Add$/i }).first().click();
  const newCsasCase = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("menuitem", { name: "New CSAS Case", exact: true }) })
    .last()
    .getByRole("menuitem", { name: "New CSAS Case", exact: true });
  await expect(newCsasCase).toBeVisible({ timeout: 30_000 });
  await newCsasCase.click();
  await expect(page.getByRole("tab", { name: "New CSAS Case", exact: true })).toBeVisible({ timeout: 30_000 });

  await expect(await editableField(page, [/Short description/i], ["short_description"], "Short description")).toBeVisible({
    timeout: 30_000,
  });
}

async function fillShortDescription(page: Page, value: string): Promise<void> {
  const field = await editableField(page, [/Short description/i], ["short_description"], "Short description");
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

async function setAssignmentGroup(page: Page, value: string): Promise<void> {
  const field = await editableField(page, [/Assignment group/i], ["assignment_group"], "Assignment group");
  await field.click();
  await field.fill(value);

  await clickFirstVisible(
    page,
    [
      page.getByRole("option", { name: exactTextPattern(value) }),
      page.locator('[role="option"]').filter({ hasText: exactTextPattern(value) }),
      page.getByText(exactTextPattern(value)),
    ],
    `Select assignment group ${value}`
  );
}

async function selectFirstAvailableConsumer(page: Page): Promise<string> {
  await clickFirstVisible(
    page,
    [page.getByRole("tab", { name: /Record Information/i })],
    "Open Record Information"
  );

  const consumerField = await editableField(
    page,
    [/Lookup by Church Account, Phone, Email/i],
    ["consumer", "caller", "requested_for"],
    "Consumer lookup"
  );
  await consumerField.fill("a");

  const consumerOption = await firstVisible(
    page,
    [
      page.getByRole("option").filter({ hasNotText: /No results|No matches/i }),
      page.locator('[role="listbox"] [role="row"]'),
      page.locator('[role="listbox"] [role="option"]'),
    ],
    "Find an available consumer"
  );
  const consumer = ((await consumerOption.innerText()) || (await consumerOption.textContent()) || "").trim();
  if (!consumer) {
    throw new Error("ServiceNow returned a consumer option without a visible name.");
  }

  await consumerOption.click();
  return consumer;
}

async function saveCase(page: Page): Promise<void> {
  const saveButton = page.getByRole("button", { name: /^Save$/i }).first();
  await saveButton.click();
  await expect.poll(async () => !(await saveButton.isVisible().catch(() => false)) || !/saving/i.test(await page.locator("body").innerText()), {
    message: "The new CSAS case did not finish saving.",
  }).toBe(true);
}

async function waitForCreatedCsasCase(page: Page, shortDescription: string): Promise<string> {
  const heading = page.getByRole("heading", { name: /CSAS\d+/i }).first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(shortDescription).first()).toBeVisible({ timeout: 15_000 });
  const caseNumber = (await heading.innerText()).match(/CSAS\d+/i)?.[0];
  if (!caseNumber) {
    throw new Error("ServiceNow saved the case, but did not display a CSAS case number.");
  }
  return caseNumber;
}

async function editableField(page: Page, labelPatterns: RegExp[], fieldNames: string[], stepName: string): Promise<Locator> {
  const labelPattern = new RegExp(labelPatterns.map((pattern) => pattern.source).join("|"), "i");
  const fieldSelectors = fieldNames.flatMap((name) => [
    `input[name*="${name}" i]`,
    `input[id*="${name}" i]`,
    `textarea[name*="${name}" i]`,
    `textarea[id*="${name}" i]`,
    `[data-field-name*="${name}" i] input`,
    `[data-field*="${name}" i] input`,
    `[data-name*="${name}" i] input`,
  ]);

  return firstVisibleEditable(
    page,
    [
      page.getByRole("textbox", { name: labelPattern }),
      page.getByLabel(labelPattern),
      page.locator(fieldSelectors.join(", ")),
    ],
    stepName
  );
}

async function firstVisibleEditable(page: Page, candidates: Locator[], stepName: string): Promise<Locator> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const locator of candidates) {
      const count = Math.min(await locator.count(), 20);
      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index);
        if (!(await candidate.isVisible().catch(() => false))) continue;

        const editable = await candidate
          .evaluate((element) => {
            const tagName = element.tagName.toLowerCase();
            return tagName === "input" || tagName === "textarea" || (element as HTMLElement).isContentEditable;
          })
          .catch(() => false);
        if (editable) return candidate;
      }
    }

    await page.waitForTimeout(250);
  }

  await page.screenshot({ path: `test-results/${stepName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-field-not-found.png`, fullPage: true });
  throw new Error(`Unable to find an editable field for step: ${stepName}`);
}

async function firstVisible(page: Page, candidates: Locator[], stepName: string): Promise<Locator> {
  for (const locator of candidates) {
    const candidate = locator.first();
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }

  await page.screenshot({ path: `test-results/${stepName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, fullPage: true });
  throw new Error(`Unable to find a visible consumer option for step: ${stepName}`);
}

function exactTextPattern(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
}
