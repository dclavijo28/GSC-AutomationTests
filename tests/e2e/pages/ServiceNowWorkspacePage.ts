import { expect, type Locator, type Page } from "@playwright/test";

export class ServiceNowWorkspacePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  protected async firstVisible(candidates: Locator[], stepName: string, timeoutMs = 30_000): Promise<Locator> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (const locator of candidates) {
        const candidate = locator.first();
        await candidate.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => undefined);
        if (await candidate.isVisible().catch(() => false)) {
          return candidate;
        }
      }

      await this.page.waitForTimeout(500);
    }

    await this.page.screenshot({ path: `test-results/${this.slugify(stepName)}-not-found.png`, fullPage: true });
    throw new Error(`Unable to find visible field for step: ${stepName}`);
  }

  protected async clickFirstVisibleOptional(candidates: Locator[], stepName: string): Promise<boolean> {
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

    if (!this.page.isClosed()) {
      await this.page.screenshot({ path: `test-results/${this.slugify(stepName)}-not-found.png`, fullPage: true });
    }
    return false;
  }

  protected async clearAndType(field: Locator, value: string): Promise<void> {
    await field.click();
    await field.fill("", { timeout: 2_000 }).catch(async () => {
      await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
      await this.page.keyboard.press("Backspace");
    });
    await field.fill(value, { timeout: 2_000 }).catch(async () => {
      await this.page.keyboard.type(value);
    });
  }

  protected async openChoiceDropdown(field: Locator): Promise<void> {
    await field.scrollIntoViewIfNeeded({ timeout: 1_000 }).catch(() => undefined);
    await field.click();
    await this.page.waitForTimeout(250);
    await field.press("Enter").catch(() => undefined);
    await this.page.waitForTimeout(250);
    await field.press("ArrowDown").catch(async () => this.page.keyboard.press("ArrowDown"));
    await this.page.waitForTimeout(500);
  }

  protected async openReferenceDropdown(field: Locator): Promise<void> {
    await field.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
    await field.click({ timeout: 5_000 }).catch(() => undefined);
    await this.page.waitForTimeout(250);

    const container = field.locator(
      'xpath=ancestor::*[@role="combobox" or contains(@class,"combobox") or contains(@class,"reference")][1]'
    ).first();
    const toggle = container
      .locator(
        'button[aria-label*="show" i], button[aria-label*="open" i], button[aria-label*="toggle" i], button[aria-haspopup="listbox"], button'
      )
      .first();

    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click({ timeout: 3_000 }).catch(() => undefined);
      await this.page.waitForTimeout(400);
    }

    await field.press("ArrowDown").catch(async () => this.page.keyboard.press("ArrowDown"));
    await this.page.waitForTimeout(500);
  }

  protected async selectVisibleDropdownOption(value: string, stepName: string): Promise<boolean> {
    const pattern = new RegExp(this.escapeRegExp(value), "i");
    return this.clickFirstVisibleOptional(
      [
        this.page.getByRole("option", { name: this.exactTextPattern(value) }),
        this.page.locator('[role="option"]').filter({ hasText: this.exactTextPattern(value) }),
        this.page.locator('[role="listbox"] [role="option"]').filter({ hasText: pattern }),
        this.page.locator('[role="menu"] [role="menuitem"]').filter({ hasText: pattern }),
        this.page.locator('[role="grid"] [role="row"]').filter({ hasText: pattern }),
        this.page.locator("[aria-selected]").filter({ hasText: this.exactTextPattern(value) }),
        this.page.locator('[class*="option" i]').filter({ hasText: this.exactTextPattern(value) }),
        this.page.locator('[aria-label*="suggest" i] [role="option"]').filter({ hasText: pattern }),
        this.page.locator('[class*="suggest" i]').filter({ hasText: pattern }),
        this.page.locator('[class*="dropdown" i]').filter({ hasText: pattern })
      ],
      stepName
    );
  }

  protected async selectChoiceOption(field: Locator, option: Locator): Promise<void> {
    try {
      await option.click({ timeout: 2_000 });
    } catch {
      await option.evaluate((element: Element) => {
        (element as HTMLElement).click();
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }).catch(() => undefined);
    }

    await this.page.waitForTimeout(250);
    await field.press("Enter").catch(() => undefined);
    await field.press("Tab").catch(() => undefined);
  }

  protected async commitFieldSelection(field: Locator): Promise<void> {
    await field.press("ArrowDown").catch(async () => this.page.keyboard.press("ArrowDown"));
    await this.page.waitForTimeout(250);
    await field.press("Enter").catch(async () => this.page.keyboard.press("Enter"));
    await this.page.waitForTimeout(250);
    await field.press("Tab").catch(async () => this.page.keyboard.press("Tab"));
    await this.page.waitForTimeout(500);
  }

  protected async readFieldValue(labels: string[]): Promise<string> {
    for (const field of this.fieldCandidates(labels)) {
      const candidate = field.first();
      if (!(await candidate.isVisible().catch(() => false))) continue;

      const values = [
        await candidate.inputValue().catch(() => ""),
        (await candidate.getAttribute("value").catch(() => null)) ?? "",
        await candidate.innerText().catch(() => ""),
        (await candidate.textContent().catch(() => "")) ?? "",
        await candidate.locator('[role="combobox"], .now-select-trigger, .now-form-field').first().innerText().catch(() => "")
      ]
        .map((value) => value.trim())
        .filter(Boolean);

      const directValue = values.find(
        (value) => !/^Channel$/i.test(value) && !/^Reply to$/i.test(value) && !/^Assignment group$/i.test(value)
      );
      if (directValue) return directValue;
    }

    const bodyText = await this.readPageText();
    const lines = bodyText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      if (!labels.some((label) => this.exactTextPattern(label).test(lines[index]))) continue;

      for (const candidate of lines.slice(index + 1, index + 4)) {
        if (!labels.some((label) => this.exactTextPattern(label).test(candidate)) && this.isGeneratedCallId(candidate)) {
          return candidate;
        }
        if (!labels.some((label) => this.exactTextPattern(label).test(candidate)) && candidate !== "-- None --") {
          return candidate;
        }
      }
    }

    return "";
  }

  protected async expectFieldOrPageValue(labels: string[], value: string): Promise<void> {
    const pattern = new RegExp(this.escapeRegExp(value), "i");

    await expect
      .poll(async () => {
        const fieldValue = await this.readFieldValue(labels);
        if (pattern.test(fieldValue)) return true;
        return pattern.test(await this.readPageText());
      }, {
        message: `${labels[0]} was not set to ${value}.`,
        timeout: 20_000
      })
      .toBe(true);
  }

  protected async expectPageText(pattern: RegExp, message: string): Promise<void> {
    await expect
      .poll(async () => pattern.test(await this.readPageText()), {
        message,
        timeout: 20_000
      })
      .toBe(true);
  }

  protected async readPageText(): Promise<string> {
    if (this.page.isClosed()) return "";

    const bodyText = await this.page.locator("body").textContent({ timeout: 2_000 }).catch(() => "");
    if (bodyText?.trim()) return bodyText;

    const mainText = await this.page.locator('main, [role="main"]').first().textContent({ timeout: 2_000 }).catch(() => "");
    if (mainText?.trim()) return mainText;

    const htmlText = await this.page.locator("html").textContent({ timeout: 2_000 }).catch(() => "");
    return htmlText?.trim() ?? "";
  }

  protected fieldCandidates(labels: string[]): Locator[] {
    return labels.flatMap((label) => {
      const pattern = new RegExp(this.escapeRegExp(label), "i");
      const escapedLabel = this.escapeCssAttributeValue(label);
      const names = this.fieldNamesForLabel(label);

      return [
        this.page.getByLabel(pattern),
        this.page.getByRole("textbox", { name: pattern }),
        this.page.getByRole("combobox", { name: pattern }),
        this.page.locator(`input[aria-label*="${escapedLabel}" i]`),
        this.page.locator(`textarea[aria-label*="${escapedLabel}" i]`),
        this.page.locator(`select[aria-label*="${escapedLabel}" i]`),
        this.page.locator(`[role="combobox"][aria-label*="${escapedLabel}" i]`),
        ...names.flatMap((name) => [
          this.page.locator(`input[name*="${name}" i]`),
          this.page.locator(`input[id*="${name}" i]`),
          this.page.locator(`textarea[name*="${name}" i]`),
          this.page.locator(`textarea[id*="${name}" i]`),
          this.page.locator(`select[name*="${name}" i]`),
          this.page.locator(`select[id*="${name}" i]`),
          this.page.locator(`[role="combobox"][name*="${name}" i]`),
          this.page.locator(`[role="combobox"][id*="${name}" i]`),
          this.page.locator(`[data-field-name*="${name}" i] input`),
          this.page.locator(`[data-field-name*="${name}" i] select`),
          this.page.locator(`[data-field*="${name}" i] input`),
          this.page.locator(`[data-field*="${name}" i] select`),
          this.page.locator(`[data-name*="${name}" i] input`),
          this.page.locator(`[data-name*="${name}" i] select`)
        ])
      ];
    });
  }

  protected async prepareWorkspaceViewport(): Promise<void> {
    const session = await this.page.context().newCDPSession(this.page).catch(() => null);
    if (!session) return;

    const { windowId } = await session.send("Browser.getWindowForTarget").catch(() => ({ windowId: 0 }));
    if (windowId) {
      await session
        .send("Browser.setWindowBounds", {
          windowId,
          bounds: { windowState: "maximized" }
        })
        .catch(() => undefined);
    }
  }

  protected async applyWorkspaceZoom(): Promise<void> {
    await this.page.evaluate(() => {
      document.documentElement.style.setProperty("zoom", "80%");
      document.body.style.setProperty("zoom", "80%");
    }).catch(() => undefined);
  }

  protected exactTextPattern(value: string): RegExp {
    return new RegExp(`^\\s*${this.escapeRegExp(value)}\\s*$`, "i");
  }

  protected isGeneratedCallId(value: string): boolean {
    const trimmed = value.trim();
    return /^[A-Za-z0-9][A-Za-z0-9_.:-]{5,}$/.test(trimmed) && !/^(empty|none|null|call id|call id parameter)$/i.test(trimmed);
  }

  private fieldNamesForLabel(label: string): string[] {
    if (/assignment group/i.test(label)) return ["assignment_group"];
    if (/channel/i.test(label)) return ["channel", "contact_type", "u_channel"];
    if (/reply/i.test(label)) return ["reply_to", "replyto", "u_reply_to"];
    if (/short description/i.test(label)) return ["short_description"];
    return [];
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private escapeCssAttributeValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  protected slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
}
