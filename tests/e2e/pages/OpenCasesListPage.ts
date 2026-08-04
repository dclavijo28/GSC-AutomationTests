import { clickFirstVisible, waitForServiceNowReady } from "../helpers/servicenow";
import { configuredUrl } from "../helpers/servicenow-config";
import { serviceNowLoginOptionsForEnvironment } from "../helpers/servicenow-login";
import { ServiceNowWorkspacePage } from "./ServiceNowWorkspacePage";

export class OpenCasesListPage extends ServiceNowWorkspacePage {
  async openNewestCaseFromSearch(searchText: string): Promise<string> {
    const gscdevLogin = serviceNowLoginOptionsForEnvironment("gscdev");
    await this.openOpenCasesList();

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const row = await this.findMatchingRow(searchText);
      if (row) {
        const rowText = (await row.innerText().catch(() => "")) || (await row.textContent().catch(() => "")) || "";
        const caseNumber = rowText.match(/\bCSLUS\d+\b/i)?.[0] ?? "";

        await clickFirstVisible(
          this.page,
          [row.getByRole("link", { name: /CSLUS\d+/i }), row.getByText(/\bCSLUS\d+\b/i), row],
          `Open created case for ${searchText}`
        );

        await waitForServiceNowReady(
          this.page,
          this.page.getByText(new RegExp(this.escapeRegExpForPattern(caseNumber || searchText), "i")).first(),
          `The created case for ${searchText} did not open from the list.`,
          60_000,
          {
            ...gscdevLogin,
            resumeUrl: this.page.url(),
          }
        );

        return caseNumber;
      }

      await this.page.reload({ waitUntil: "domcontentloaded" });
      await this.applyWorkspaceZoom();
      await this.waitForGridReady("The Open cases list did not reload while waiting for the created case.");
      await this.openDefaultOpenList();
      await this.page.waitForTimeout(5_000);
    }

    throw new Error(`A case with search text ${searchText} was not visible in the Open cases list.`);
  }

  async readCallParameterIdFromGrid(searchText: string): Promise<string> {
    await this.openOpenCasesList();
    await this.filterOpenCasesIfAvailable(searchText);
    await this.ensureCallParameterIdColumn();

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const row = await this.findMatchingRow(searchText);
      if (row) {
        const callParameterId = await this.readGridCellValue(row, /Call (?:id parameter|parameter id)/i);
        if (callParameterId && this.isGeneratedCallId(callParameterId)) {
          return callParameterId;
        }
      }

      await this.page.reload({ waitUntil: "domcontentloaded" });
      await this.applyWorkspaceZoom();
      await this.waitForGridReady("The Open cases list did not reload while waiting for the Call id parameter.");
      await this.openDefaultOpenList();
      await this.filterOpenCasesIfAvailable(searchText);
      await this.ensureCallParameterIdColumn();
      await this.page.waitForTimeout(5_000);
    }

    throw new Error(`Call id parameter was not visible in the Open cases list for ${searchText}.`);
  }

  private async openOpenCasesList(): Promise<void> {
    const openCasesListUrl = configuredUrl("SN_GSCDEV_OPEN_CASES_LIST_URL");
    const gscdevLogin = serviceNowLoginOptionsForEnvironment("gscdev");
    await this.prepareWorkspaceViewport();
    await this.page.goto(openCasesListUrl, { waitUntil: "domcontentloaded" });
    await this.applyWorkspaceZoom();
    await waitForServiceNowReady(
      this.page,
      this.page.getByRole("tab", { name: /^List$/i }).first(),
      "The Open cases workspace list did not load within 60 seconds.",
      60_000,
      {
        ...gscdevLogin,
        resumeUrl: openCasesListUrl,
      }
    );

    await this.openDefaultOpenList();
  }

  private async openDefaultOpenList(): Promise<void> {
    const defaultListsTab = this.page.getByRole("tab", { name: /Default lists/i }).first();
    if (await defaultListsTab.isVisible().catch(() => false)) {
      await defaultListsTab.click({ timeout: 5_000 }).catch(() => undefined);
      await this.page.waitForTimeout(500);
    }

    const openTreeItem = this.page.getByRole("treeitem", { name: /^Open$/i }).first();
    if (await openTreeItem.isVisible().catch(() => false)) {
      await openTreeItem.click({ timeout: 5_000 }).catch(() => undefined);
      await this.page.waitForTimeout(1_000);
    } else {
      await clickFirstVisible(
        this.page,
        [
          this.page.getByText(/^Open$/i).locator('xpath=ancestor::*[@role="treeitem" or self::button or self::a][1]').first(),
          this.page.getByText(/^Open$/i).first()
        ],
        "Open Default lists > Open"
      );
      await this.page.waitForTimeout(1_000);
    }

    await this.waitForGridReady("The default Open list did not load within 60 seconds.");
  }

  private async waitForGridReady(message: string): Promise<void> {
    const openCasesListUrl = configuredUrl("SN_GSCDEV_OPEN_CASES_LIST_URL");
    const gscdevLogin = serviceNowLoginOptionsForEnvironment("gscdev");
    await waitForServiceNowReady(
      this.page,
      this.page.getByRole("grid").first(),
      message,
      60_000,
      {
        ...gscdevLogin,
        resumeUrl: openCasesListUrl,
      }
    );
  }

  private async filterOpenCasesIfAvailable(searchText: string): Promise<void> {
    const candidates = [
      this.page.getByPlaceholder(/filter/i).first(),
      this.page.getByRole("textbox", { name: /filter/i }).first(),
      this.page.locator('input[aria-label*="Filter" i]').first(),
      this.page.locator('input[placeholder*="Filter" i]').first(),
      this.page.locator('[role="searchbox"]').first()
    ];

    for (const candidate of candidates) {
      if (!(await candidate.isVisible().catch(() => false))) continue;
      await this.clearAndType(candidate, searchText);
      await candidate.press("Enter").catch(async () => this.page.keyboard.press("Enter"));
      await this.page.waitForTimeout(2_000);
      return;
    }
  }

  private async ensureCallParameterIdColumn(): Promise<void> {
    if (await this.hasColumn(/Call (?:id parameter|parameter id)/i)) return;

    const personalizeButton = await this.firstVisible(
      [
        this.page.locator('[aria-label="Personalize Fields"]').first(),
        this.page.getByRole("button", { name: /Personalize Fields/i }).first(),
        this.page.locator('button[aria-label*="Personalize" i]').first()
      ],
      "Find Personalize Fields button",
      10_000
    );

    await personalizeButton.click({ timeout: 5_000 });

    const dialog = await this.firstVisible(
      [this.page.getByRole("dialog").first(), this.page.locator('[aria-modal="true"]').first()],
      "Find Personalize Fields dialog",
      10_000
    );

    const searchField = await this.firstVisible(
      [
        dialog.getByPlaceholder(/search/i).first(),
        dialog.getByRole("textbox", { name: /search/i }).first(),
        dialog.locator('input[placeholder*="Search" i]').first(),
        dialog.locator('input[aria-label*="Search" i]').first()
      ],
      "Find Personalize Fields search",
      10_000
    );

    await this.clearAndType(searchField, "Call id parameter");
    await this.page.waitForTimeout(1_000);

    const fieldOption = await this.firstVisible(
      [
        dialog.getByText(/^Call id parameter$/i).first(),
        dialog.getByText(/Call (?:id parameter|parameter id)/i).first(),
        dialog.locator('[role="option"]').filter({ hasText: /Call (?:id parameter|parameter id)/i }).first(),
        dialog.locator('[role="row"]').filter({ hasText: /Call (?:id parameter|parameter id)/i }).first()
      ],
      "Find Call id parameter field option",
      10_000
    );

    await fieldOption.click({ timeout: 5_000 }).catch(() => undefined);
    await clickFirstVisible(
      this.page,
      [
        dialog.getByRole("button", { name: /^Add$/i }),
        dialog.getByRole("button", { name: /Move right/i }),
        dialog.getByRole("button", { name: /^>$/i }),
        dialog.getByRole("button", { name: /include|show/i })
      ],
      "Add Call id parameter field"
    );

    await clickFirstVisible(
      this.page,
      [
        dialog.getByRole("button", { name: /^Apply$/i }),
        dialog.getByRole("button", { name: /^OK$/i }),
        dialog.getByRole("button", { name: /^Done$/i }),
        dialog.getByRole("button", { name: /^Save$/i })
      ],
      "Apply Personalize Fields changes"
    );

    await this.page.waitForTimeout(2_000);
  }

  private async hasColumn(pattern: RegExp): Promise<boolean> {
    const headers = this.page.locator('[role="columnheader"], th');
    const count = await headers.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const text = (await headers.nth(index).innerText().catch(() => "")) || (await headers.nth(index).textContent().catch(() => "")) || "";
      if (pattern.test(text)) return true;
    }
    return false;
  }

  private async readGridCellValue(row: any, headerPattern: RegExp): Promise<string> {
    const headers = this.page.locator('[role="columnheader"], th');
    const headerCount = await headers.count().catch(() => 0);
    let columnIndex = -1;

    for (let index = 0; index < headerCount; index += 1) {
      const text = (await headers.nth(index).innerText().catch(() => "")) || (await headers.nth(index).textContent().catch(() => "")) || "";
      if (headerPattern.test(text)) {
        columnIndex = index;
        break;
      }
    }

    if (columnIndex === -1) return "";

    const cells = row.locator('[role="gridcell"], td, [role="cell"]');
    const cellText =
      (await cells.nth(columnIndex).innerText().catch(() => "")) ||
      (await cells.nth(columnIndex).textContent().catch(() => "")) ||
      "";

    return cellText.trim();
  }

  private async findMatchingRow(searchText: string) {
    const pattern = new RegExp(this.escapeRegExpForPattern(searchText), "i");
    const rowCandidates = [
      this.page.getByRole("row", { name: pattern }).first(),
      this.page.locator("[role='row']").filter({ hasText: pattern }).first(),
      this.page.getByText(pattern).locator('xpath=ancestor::*[@role="row" or self::a or @role="link"][1]').first()
    ];

    for (const row of rowCandidates) {
      if (await row.isVisible().catch(() => false)) {
        return row;
      }
    }

    return null;
  }

  private escapeRegExpForPattern(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
