import { expect, type Locator, type Page } from "@playwright/test";

const advancedPanelsToggleLabel = /展开高级面板|Show Advanced Panels/;

export const ensureDashboardAdvancedTargetVisible = async (
  page: Page,
  target: Locator
): Promise<void> => {
  const expandButton = page.getByRole("button", { name: advancedPanelsToggleLabel }).first();

  await expect
    .poll(async () => (await target.isVisible()) || (await expandButton.isVisible()), {
      timeout: 15_000
    })
    .toBe(true);

  if (!(await target.isVisible()) && (await expandButton.isVisible())) {
    await expandButton.click();
  }

  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
};
