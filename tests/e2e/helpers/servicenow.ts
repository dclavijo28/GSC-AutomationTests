import { expect, type Locator, type Page } from "@playwright/test";

const refreshGsctestAuthMessage =
  "Saved GSCTEST auth state redirected to MFA. Refresh and save playwright/.auth/gsctest-state.json, then rerun this test.";

export type SidebarTool = {
  name: string;
  labels: string[];
  expectedContent: RegExp[];
};

export function exactTextPattern(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`, "i");
}

export async function waitForServiceNowReady(
  page: Page,
  readyLocator: Locator,
  timeoutMessage: string,
  timeoutMs = 30_000
): Promise<void> {
  const authenticatorHeading = page.getByRole("heading", { name: /Authenticator/i });

  const result = await Promise.race([
    readyLocator
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() => "ready")
      .catch(() => "timeout"),
    authenticatorHeading
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() => "mfa")
      .catch(() => "timeout")
  ]);

  if (result === "mfa") {
    throw new Error(refreshGsctestAuthMessage);
  }

  if (result === "timeout") {
    throw new Error(timeoutMessage);
  }
}

export async function clickFirstVisible(
  page: Page,
  candidates: Locator[],
  stepName: string
): Promise<void> {
  for (const locator of candidates) {
    const candidate = locator.first();
    try {
      await candidate.waitFor({ state: "visible", timeout: 5_000 });
      await candidate.click();
      return;
    } catch {
      // Try the next candidate.
    }
  }

  if (!page.isClosed()) {
    await page.screenshot({ path: `test-results/${slugify(stepName)}-not-found.png`, fullPage: true });
  }
  throw new Error(`Unable to find a visible clickable candidate for step: ${stepName}`);
}

export async function expectAnyVisible(
  page: Page,
  patterns: RegExp[],
  message: string
): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    for (const pattern of patterns) {
      const matches = page.getByText(pattern);
      const count = Math.min(await matches.count(), 50);

      for (let index = 0; index < count; index += 1) {
        if (await matches.nth(index).isVisible().catch(() => false)) {
          return;
        }
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error(message);
}

export function sidebarButtonCandidates(page: Page, tool: SidebarTool): Locator[] {
  const labelPattern = new RegExp(tool.labels.map(escapeRegExp).join("|"), "i");
  const attributeSelectors = tool.labels.flatMap((label) => [
    `[aria-label*=\"${escapeCssAttributeValue(label)}\" i]`,
    `[title*=\"${escapeCssAttributeValue(label)}\" i]`,
    `[data-tooltip*=\"${escapeCssAttributeValue(label)}\" i]`,
    `[data-original-title*=\"${escapeCssAttributeValue(label)}\" i]`
  ]);

  return [
    page.getByRole("tab", { name: labelPattern }),
    page.getByRole("button", { name: labelPattern }),
    page.getByLabel(labelPattern),
    page.locator(attributeSelectors.join(", "))
  ];
}

export async function expectSidebarButtonVisible(page: Page, tool: SidebarTool): Promise<void> {
  for (const locator of sidebarButtonCandidates(page, tool)) {
    try {
      await expect(locator.first()).toBeVisible({ timeout: 5_000 });
      return;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Right sidebar button was not visible: ${tool.name}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
