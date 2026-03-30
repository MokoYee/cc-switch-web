import { expect, test, type Page } from "@playwright/test";

import type { DashboardBootstrap } from "@cc-switch-web/shared";
import { ensureDashboardAdvancedTargetVisible } from "./support/advanced-panels.js";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";

const startupRecovery: NonNullable<DashboardBootstrap["hostStartupRecovery"]> = {
  trigger: "startup-auto-rollback",
  executedAt: "2026-03-28T10:00:00.000Z",
  totalApps: 1,
  rolledBackApps: ["codex"],
  failedApps: [],
  items: [
    {
      appCode: "codex",
      action: "rollback",
      configPath: "/tmp/codex.json",
      backupPath: "/tmp/codex.bak",
      integrationState: "unmanaged",
      lifecycleMode: "foreground-session",
      message: "Managed config rolled back for codex"
    }
  ],
  failures: [],
  message: "Auto-recovered 1 stale foreground-session host takeover(s) during daemon startup"
};

const loginToDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();
  await expect(
    page.getByRole("button", { name: /展开高级面板|Show Advanced Panels/ }).first()
  ).toBeVisible();
};

const ensureRuntimePanelVisible = async (page: Page): Promise<void> => {
  const runtimePanel = page.getByTestId("context-runtime-panel");
  await ensureDashboardAdvancedTargetVisible(page, runtimePanel);
};

test("startup auto-recovery surfaces follow-up guidance and opens the right evidence focus", async ({
  page
}) => {
  await page.route("**/api/v1/dashboard/bootstrap", async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as DashboardBootstrap;
    const nextPayload: DashboardBootstrap = {
      ...payload,
      hostStartupRecovery: startupRecovery
    };

    await route.fulfill({
      response,
      json: nextPayload
    });
  });

  await loginToDashboard(page);

  const followUpPanel = page.getByTestId("follow-up-notice-panel");
  await expect(followUpPanel).toBeVisible();
  await expect(followUpPanel).toContainText(
    /已自动恢复残留临时接管|Temporary Host Takeover Recovered Automatically/
  );
  await expect(followUpPanel).toContainText("codex");
  await expect(page.getByTestId("follow-up-action-startup-recovery-host-audit")).toBeVisible();
  await expect(page.getByTestId("follow-up-action-startup-recovery-runtime")).toBeVisible();
  await expect(page.getByTestId("follow-up-action-startup-recovery-app-codex")).toBeVisible();

  await page.getByTestId("follow-up-action-startup-recovery-runtime").click();
  await ensureRuntimePanelVisible(page);

  const runtimeStartupRecoveryNotice = page.getByTestId("service-startup-recovery-notice");
  await expect(runtimeStartupRecoveryNotice).toBeVisible();
  await expect(runtimeStartupRecoveryNotice).toContainText(/启动自动恢复|Startup Auto-Recovery/);
  await expect(runtimeStartupRecoveryNotice).toContainText("codex");

  await page.getByTestId("follow-up-action-startup-recovery-host-audit").click();
  await ensureRuntimePanelVisible(page);
  await expect(page.getByTestId("audit-filter-source")).toHaveValue("host-integration");
  await expect(page.getByTestId("audit-filter-app")).toHaveValue("");

  await page.getByTestId("follow-up-action-startup-recovery-app-codex").click();
  await expect(page.getByTestId("request-log-filter-app")).toHaveValue("codex");
});
