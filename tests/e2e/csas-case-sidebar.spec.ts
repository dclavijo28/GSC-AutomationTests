import { expect, test, type Page } from "@playwright/test";
import { setServiceNowWorkspaceWindowSize, waitForServiceNowReady } from "./helpers/servicenow";
import { ensureServiceNowInteractiveLogin, serviceNowLoginOptionsForEnvironment } from "./helpers/servicenow-login";
import { optionalConfiguredUrl, serviceNowEnvironmentConfig } from "./helpers/servicenow-config";

test.setTimeout(180_000);

type CaseFixture = {
  name: string;
  urlEnvironmentVariable: string;
  tableName: string;
  readyPattern: RegExp;
};

const cslusCase: CaseFixture = {
  name: "CSLUS baseline case",
  urlEnvironmentVariable: "SN_GSCTEST_CSLUS_CASE_URL",
  tableName: "x_tcoj2_church_ct_case_lus",
  readyPattern: /CSLUS\d+|Record Information|Activity/i
};

const csasCase: CaseFixture = {
  name: "CSAS target case",
  urlEnvironmentVariable: "SN_GSCTEST_CSAS_CASE_URL",
  tableName: "x_tcoj2_church_ct_case_as",
  readyPattern: /CSAS\d+|Record Information|Activity/i
};

const gsctestLogin = serviceNowLoginOptionsForEnvironment("gsctest");

test.describe("CSAS Workspace case right sidebar", () => {
  test("displays the same configured right sidebar buttons as the CSLUS case type", async ({ page }) => {
    const cslusTabs = await test.step("read configured CSLUS sidebar tabs", async () => {
      await openWorkspaceCase(page, cslusCase);
      return getRightSidebarTabNames(page);
    });

    await test.step("CSAS sidebar matches configured CSLUS tabs", async () => {
      await openWorkspaceCase(page, csasCase);
      await expect(getRightSidebarTabNames(page)).resolves.toEqual(cslusTabs);
    });
  });

  test("opens the corresponding sidebar action as the CSLUS case type", async ({ page }) => {
    const cslusTabs = await test.step("read and open CSLUS sidebar actions", async () => {
      await openWorkspaceCase(page, cslusCase);
      const tabs = await getRightSidebarTabNames(page);
      await openRightSidebarTabs(page, tabs, cslusCase.name);
      return tabs;
    });

    await test.step("CSAS opens the same sidebar actions", async () => {
      await openWorkspaceCase(page, csasCase);
      await expect(getRightSidebarTabNames(page)).resolves.toEqual(cslusTabs);
      await openRightSidebarTabs(page, cslusTabs, csasCase.name);
    });
  });
});

async function openWorkspaceCase(page: Page, fixture: CaseFixture): Promise<void> {
  await setServiceNowWorkspaceWindowSize(page);
  const url = await resolveCaseUrl(page, fixture);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/sn-gsctest\.churchofjesuschrist\.org/);
  await waitForServiceNowReady(
    page,
    page.getByText(fixture.readyPattern).first(),
    `${fixture.name} did not load within 60 seconds.`,
    60_000,
    {
      ...gsctestLogin,
      resumeUrl: url,
    }
  );
}

async function resolveCaseUrl(page: Page, fixture: CaseFixture): Promise<string> {
  const configuredUrl = optionalConfiguredUrl(fixture.urlEnvironmentVariable);
  if (configuredUrl) return configuredUrl;

  const environment = serviceNowEnvironmentConfig("gsctest");
  const homeUrl = new URL("/now/nav/ui/classic/params/target/home.do", environment.baseUrl).toString();
  await page.goto(homeUrl, { waitUntil: "domcontentloaded" });
  await ensureServiceNowInteractiveLogin(page, { ...gsctestLogin, resumeUrl: homeUrl });

  const listUrl = new URL(`/${fixture.tableName}_list.do`, environment.baseUrl);
  listUrl.searchParams.set("sysparm_query", "active=true^ORDERBYDESCsys_updated_on");
  listUrl.searchParams.set("sysparm_limit", "1");
  await page.goto(listUrl.toString(), { waitUntil: "domcontentloaded" });

  const recordLink = page.locator(`a[href*="${fixture.tableName}.do"][href*="sys_id="]`).first();
  await waitForServiceNowReady(
    page,
    recordLink,
    `No active ${fixture.name} record was available in the ServiceNow list. Set ${fixture.urlEnvironmentVariable} to a valid workspace record URL instead.`,
    60_000,
    { ...gsctestLogin, resumeUrl: listUrl.toString() }
  );

  const href = await recordLink.getAttribute("href");
  const sysId = href ? new URL(href, environment.baseUrl).searchParams.get("sys_id") : null;
  if (!sysId) {
    throw new Error(
      `ServiceNow displayed an active ${fixture.name} row without a record identifier. Set ${fixture.urlEnvironmentVariable} to a valid workspace record URL instead.`
    );
  }

  return new URL(`/now/cwf/agent/record/${fixture.tableName}/${sysId}`, environment.baseUrl).toString();
}

function rightSidebarTabList(page: Page) {
  return page
    .getByRole("tablist")
    .filter({ has: page.getByRole("tab", { name: /Record Information/i }) })
    .first();
}

async function getRightSidebarTabNames(page: Page): Promise<string[]> {
  const tabList = rightSidebarTabList(page);
  await expect(tabList).toBeVisible({ timeout: 15_000 });
  await showMoreSidebarTabs(page);

  const tabs = tabList.getByRole("tab");
  const labels = await Promise.all(
    Array.from({ length: await tabs.count() }, async (_, index) => {
      const tab = tabs.nth(index);
      const label =
        (await tab.getAttribute("aria-label")) ??
        (await tab.getAttribute("title")) ??
        (await tab.textContent());
      return label?.trim() ?? "";
    })
  );

  const configuredTabs = labels.filter(Boolean);
  expect(configuredTabs, "The right sidebar must expose at least one configured tab.").not.toEqual([]);
  return configuredTabs;
}

async function openRightSidebarTabs(page: Page, tabNames: string[], caseName: string): Promise<void> {
  const tabList = rightSidebarTabList(page);

  for (const name of tabNames) {
    await test.step(`opens ${name} on ${caseName}`, async () => {
      const tab = tabList.getByRole("tab", { name: exactTextPattern(name) });
      if (!(await tab.isVisible().catch(() => false))) {
        await showMoreSidebarTabs(page);
      }

      await expect(tab, `${name} is not available on ${caseName}.`).toBeVisible();
      await tab.click();
    });
  }
}

async function showMoreSidebarTabs(page: Page): Promise<void> {
  const moreTabs = rightSidebarTabList(page).locator("xpath=following-sibling::*").getByRole("button", { name: "More tabs" });
  if (await moreTabs.isVisible().catch(() => false)) {
    await moreTabs.click({ force: true, timeout: 5_000 });
    await page.waitForTimeout(250);
  }
}

function exactTextPattern(value: string): RegExp {
  return new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
}
