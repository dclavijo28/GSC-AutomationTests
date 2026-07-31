import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { waitForServiceNowReady } from "../helpers/servicenow";
import { ServiceNowWorkspacePage } from "./ServiceNowWorkspacePage";

const inAppCaseUrl = "https://inappserver-test.churchofjesuschrist.org/testCaseUi";
const pureCloudLoginUrlPattern = /^https:\/\/login\.usw2\.pure\.cloud\//i;

export class GenesysLusCasePage extends ServiceNowWorkspacePage {
  async attachPureCloudPopupCloser(): Promise<void> {
    const context = this.page.context();
    context.on("page", (popup) => {
      void this.closePureCloudPopupPage(popup, this.page);
    });
    await this.closePureCloudPopupPages(context, this.page);
  }

  async createInAppCase(input: { shortDescription: string; longDescription: string; channel: string }): Promise<string> {
    await this.openInAppCaseCreator();

    const shortDescriptionField = this.page.locator("#caseTitle");
    const longDescriptionField = this.page.locator("#caseDescription");

    await shortDescriptionField.waitFor({ state: "visible", timeout: 30_000 });
    await shortDescriptionField.fill(input.shortDescription);
    await longDescriptionField.waitFor({ state: "visible", timeout: 30_000 });
    await longDescriptionField.fill(input.longDescription);

    const createCaseButton = this.page.getByRole("button", { name: /Create case/i }).first();
    await createCaseButton.click({ timeout: 15_000 });

    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
        const currentUrl = this.page.url();
        return (
          /created|success|submitted|case number|CSLUS\d+/i.test(bodyText) ||
          currentUrl !== inAppCaseUrl ||
          !(await createCaseButton.isVisible().catch(() => true))
        );
      }, {
        message: "The in-app case creation flow did not finish after clicking Create case.",
        timeout: 45_000
      })
      .toBe(true);

    const bodyText = await this.page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const caseNumber = bodyText.match(/\bCSLUS\d+\b/i)?.[0] ?? "";
    if (!caseNumber) {
      throw new Error("The in-app case creator did not show a CSLUS case number after Create case.");
    }

    await this.page.getByRole("button", { name: /^Close$/i }).first().click({ timeout: 5_000 }).catch(() => undefined);
    await this.page.waitForTimeout(1_000);
    return caseNumber;
  }

  async configureGenesysRouting(input: { assignmentGroup: string; replyTo: string }): Promise<void> {
    await this.prepareWorkspaceViewport();
    await this.applyWorkspaceZoom();
    await this.setReplyTo(input.replyTo);
    await this.saveRecord("Save Genesys routing fields");
  }

  async expectChannel(channel: string): Promise<void> {
    await this.expectFieldOrPageValue(["Channel"], channel);
  }

  async expectCallIdGenerated(readyText: string): Promise<void> {
    const labels = ["Call ID", "Call id", "Call Id", "Call ID parameter", "Call id parameter"];
    const deadline = Date.now() + 120_000;

    while (Date.now() < deadline) {
      const callId = await this.readFieldValue(labels);
      if (callId && this.isGeneratedCallId(callId)) {
        test.info().annotations.push({ type: "Genesys call id", description: callId });
        return;
      }

      await this.page.reload({ waitUntil: "domcontentloaded" });
      await waitForServiceNowReady(
        this.page,
        this.page.getByText(new RegExp(this.escapeForPattern(readyText), "i")).first(),
        `Created case ${readyText} did not reload while waiting for Genesys call id.`,
        60_000,
        {
          loginUrl: "https://sn-gscdev.churchofjesuschrist.org/login.do",
          resumeUrl: this.page.url(),
          storageStatePath: process.env.SN_GSCDEV_STORAGE_STATE ?? "playwright/.auth/gscdev-state.json"
        }
      );
      await this.page.waitForTimeout(5_000);
    }

    throw new Error(`Call id parameter was not filled for ${readyText} within 120 seconds.`);
  }

  async screenshotResult(name: string): Promise<void> {
    const screenshotPath = `test-results/${this.slugify(name)}-genesys-call-id-result.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    await test.info().attach("Genesys Call ID result", {
      path: screenshotPath,
      contentType: "image/png"
    });
  }

  slugFromText(value: string): string {
    return this.slugify(value);
  }

  private async openInAppCaseCreator(): Promise<void> {
    await this.closePureCloudPopupPages(this.page.context(), this.page);
    await this.prepareWorkspaceViewport();
    await this.page.goto(inAppCaseUrl, { waitUntil: "domcontentloaded" });
    await waitForServiceNowReady(
      this.page,
      this.page.locator("#caseTitle"),
      "The in-app test case UI did not load within 60 seconds.",
      60_000,
      {
        loginUrl: inAppCaseUrl,
        resumeUrl: inAppCaseUrl,
        storageStatePath: process.env.SN_GSCDEV_STORAGE_STATE ?? "playwright/.auth/gscdev-state.json"
      }
    );
  }

  private async setAssignmentGroup(value: string): Promise<void> {
    const field = await this.firstVisible(
      [
        this.page.locator('input[aria-label="Assignment group" i]').first(),
        this.page.locator('[role="combobox"][aria-label="Assignment group" i]').first(),
        this.page.getByRole('combobox', { name: /Assignment group/i }).first(),
        this.page.locator('[name*="assignment_group" i], [id*="assignment_group" i]').first()
      ],
      'Find Assignment group field',
      15_000
    );

    await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
    await field.click({ timeout: 5_000 }).catch(() => undefined);
    await this.clearAndType(field, value);
    await this.page.waitForTimeout(1_000);

    const optionCandidates = [
      this.page.getByRole('option', { name: this.exactTextPattern(value) }).first(),
      this.page.locator('[role="listbox"] [role="option"]').filter({ hasText: this.exactTextPattern(value) }).first(),
      this.page.locator('[role="presentation"] [role="option"]').filter({ hasText: this.exactTextPattern(value) }).first(),
      this.page.locator('[class*="suggest" i]').filter({ hasText: this.exactTextPattern(value) }).first(),
      this.page.getByText(this.exactTextPattern(value)).locator('xpath=ancestor-or-self::*[@role="option" or @role="row" or self::div or self::span][1]').first()
    ];

    let selected = false;
    for (const option of optionCandidates) {
      if (!(await option.isVisible().catch(() => false))) continue;
      try {
        await option.click({ timeout: 3_000 });
        selected = true;
        break;
      } catch {
        // Try the next visible option.
      }
    }

    if (!selected) {
      await field.press('ArrowDown').catch(async () => this.page.keyboard.press('ArrowDown'));
      await this.page.waitForTimeout(250);
      await field.press('Enter').catch(async () => this.page.keyboard.press('Enter'));
    }

    await field.press('Tab').catch(async () => this.page.keyboard.press('Tab'));
    await this.page.waitForTimeout(750);
    await this.expectControlValue(field, value, `Assignment group was not set to ${value}.`);
  }

  private async setReplyTo(value: string): Promise<void> {
    const field = await this.findFieldWithLeftPaneScroll(["Reply to", "Reply-to", "Reply To"], "Find Reply to field");

    try {
      await field.selectOption({ label: value }, { timeout: 2_000 });
      await this.page.waitForTimeout(300);
      return;
    } catch {
      // Continue with the visible dropdown path.
    }

    await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
    await field.click({ timeout: 3_000 }).catch(() => undefined);
    await this.page.waitForTimeout(200);
    await this.clearAndType(field, value);
    await this.page.waitForTimeout(400);

    await this.selectVisibleDropdownOption(value, `Select ${value} from Reply to dropdown`).catch(() => false);
    await field.press("Tab").catch(async () => this.page.keyboard.press("Tab").catch(() => undefined));
    await this.page.waitForTimeout(300);
  }

  private async findFieldWithLeftPaneScroll(labels: string[], stepName: string): Promise<Locator> {
    await this.ensureCaseSectionExpanded();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.firstVisible(this.fieldCandidates(labels), stepName, 2_500);
      } catch {
        await this.scrollLeftPaneDown();
      }
    }

    return this.firstVisible(this.fieldCandidates(labels), stepName, 5_000);
  }

  private async ensureCaseSectionExpanded(): Promise<void> {
    const toggle = this.page.getByRole("button", { name: /Case - Local Unit Support/i }).first();
    if (!(await toggle.isVisible().catch(() => false))) return;

    const expanded = await toggle.getAttribute("aria-expanded").catch(() => null);
    if (expanded === "false") {
      await toggle.click({ timeout: 3_000 }).catch(() => undefined);
      await this.page.waitForTimeout(400);
    }
  }

  private async scrollLeftPaneDown(): Promise<void> {
    const anchor = this.page.getByRole("button", { name: /Case - Local Unit Support/i }).first();
    const box = await anchor.boundingBox().catch(() => null);
    if (box) {
      const x = Math.max(box.x + Math.min(box.width / 2, 120), box.x + 20);
      const y = box.y + Math.min(box.height + 180, 420);
      await this.page.mouse.move(x, y).catch(() => undefined);
      await this.page.mouse.wheel(0, 700).catch(() => undefined);
      await this.page.waitForTimeout(350);
      return;
    }

    await this.page.keyboard.press("PageDown").catch(() => undefined);
    await this.page.waitForTimeout(350);
  }

  private async expectControlValue(field: Locator, value: string, message: string): Promise<void> {
    const pattern = new RegExp(this.escapeForPattern(value), "i");

    await expect
      .poll(async () => {
        const directValues = [
          await field.inputValue().catch(() => ""),
          (await field.getAttribute("value").catch(() => null)) ?? "",
          await field.innerText().catch(() => ""),
          (await field.textContent().catch(() => "")) ?? ""
        ]
          .map((entry) => entry.trim())
          .filter(Boolean);

        if (directValues.some((entry) => pattern.test(entry))) return true;

        const container = field.locator('xpath=ancestor::*[@role="combobox" or contains(@class,"select") or contains(@class,"reference") or contains(@class,"input")][1]').first();
        const containerText = ((await container.innerText().catch(() => "")) || (await container.textContent().catch(() => "")) || "").trim();
        return pattern.test(containerText);
      }, {
        message,
        timeout: 20_000
      })
      .toBe(true);
  }

  private async saveRecord(stepName: string): Promise<void> {
    const saveButton = this.page.getByRole("button", { name: /^Save$/i }).first();
    await saveButton.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
    await saveButton.waitFor({ state: "visible", timeout: 15_000 });
    await saveButton.click({ timeout: 15_000 });

    await this.page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await this.page.waitForTimeout(1_000);

    await expect
      .poll(async () => {
        const bodyText = await this.page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
        return !/saving/i.test(bodyText);
      }, {
        message: `Save did not settle for step: ${stepName}`,
        timeout: 20_000
      })
      .toBe(true);
  }

  private async closePureCloudPopupPages(context: BrowserContext, mainPage: Page): Promise<void> {
    for (const candidate of context.pages()) {
      await this.closePureCloudPopupPage(candidate, mainPage);
    }
  }

  private async closePureCloudPopupPage(candidate: Page, mainPage: Page): Promise<void> {
    if (candidate === mainPage || candidate.isClosed()) return;
    await candidate.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    if (pureCloudLoginUrlPattern.test(candidate.url())) {
      await candidate.close().catch(() => undefined);
    }
  }

  private escapeForPattern(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}



