import { expect, test, type Page } from "@playwright/test";
import {
  clickFirstVisible,
  expectAnyVisible,
  expectSidebarButtonVisible,
  sidebarButtonCandidates,
  type SidebarTool,
  waitForServiceNowReady
} from "./helpers/servicenow";

test.setTimeout(180_000);

type CaseFixture = {
  name: string;
  url: string;
  readyPattern: RegExp;
};

const cslusCase: CaseFixture = {
  name: "CSLUS baseline case",
  url: "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/x_tcoj2_church_ct_case_lus/1ff3fdeb47ec8f10514da04f116d432f",
  readyPattern: /CSLUS\d+|Record Information|Activity/i
};

const csasCase: CaseFixture = {
  name: "CSAS target case",
  url: "https://sn-gsctest.churchofjesuschrist.org/now/cwf/agent/record/x_tcoj2_church_ct_case_as/9ee8658993accf10dd89b43efaba1075",
  readyPattern: /CSAS0001028/i
};

const sidebarTools: SidebarTool[] = [
  {
    name: "Record Information",
    labels: ["Record Information", "Record info"],
    expectedContent: [/Record Information/i, /Consumer/i, /Requested for/i]
  },
  {
    name: "Recommended Actions",
    labels: ["Recommended Actions", "Recommended actions"],
    expectedContent: [/Recommended Actions/i, /recommended/i, /action/i]
  },
  {
    name: "Attachments",
    labels: ["Attachments", "Attachment"],
    expectedContent: [/Attachments?/i, /Upload/i, /Choose file/i, /Drag/i]
  },
  {
    name: "Template",
    labels: ["Template", "Templates"],
    expectedContent: [/Templates?/i, /Apply template/i, /Select template/i]
  },
  {
    name: "Quick Response",
    labels: ["Quick Response", "Quick Responses", "Response Template"],
    expectedContent: [/Response Template/i, /Quick Responses?/i, /predefined/i, /response/i]
  },
  {
    name: "Related Lists",
    labels: ["Related Lists", "Related List"],
    expectedContent: [/Related Lists?/i, /Related/i]
  }
];

test.describe("CSAS Workspace case right sidebar", () => {
  test("displays the same configured right sidebar buttons as the CSLUS case type", async ({ page }) => {
    await test.step("baseline CSLUS case shows expected sidebar tools", async () => {
      await openWorkspaceCase(page, cslusCase);
      await expectSidebarToolsVisible(page);
    });

    await test.step("target CSAS case shows expected sidebar tools", async () => {
      await openWorkspaceCase(page, csasCase);
      await expectSidebarToolsVisible(page);
    });
  });

  test("opens the corresponding sidebar action as the CSLUS case type", async ({ page }) => {
    await test.step("baseline CSLUS case opens expected sidebar actions", async () => {
      await openWorkspaceCase(page, cslusCase);
      await expectSidebarToolActions(page, cslusCase.name);
    });

    await test.step("target CSAS case opens expected sidebar actions", async () => {
      await openWorkspaceCase(page, csasCase);
      await expectSidebarToolActions(page, csasCase.name);
    });
  });
});

async function openWorkspaceCase(page: Page, fixture: CaseFixture): Promise<void> {
  await page.goto(fixture.url, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/sn-gsctest\.churchofjesuschrist\.org/);
  await waitForServiceNowReady(
    page,
    page.getByText(fixture.readyPattern).first(),
    `${fixture.name} did not load within 60 seconds.`,
    60_000
  );
}

async function expectSidebarToolsVisible(page: Page): Promise<void> {
  for (const tool of sidebarTools) {
    await test.step(`shows ${tool.name}`, async () => {
      await expectSidebarButtonVisible(page, tool);
    });
  }
}

async function expectSidebarToolActions(page: Page, caseName: string): Promise<void> {
  for (const tool of sidebarTools) {
    await test.step(`opens ${tool.name}`, async () => {
      await openSidebarTool(page, tool);
      await expectAnyVisible(
        page,
        tool.expectedContent,
        `${tool.name} did not show the expected panel or action content on ${caseName}.`
      );
    });
  }
}

async function openSidebarTool(page: Page, tool: SidebarTool): Promise<void> {
  await clickFirstVisible(page, sidebarButtonCandidates(page, tool), `Open ${tool.name}`);
}
