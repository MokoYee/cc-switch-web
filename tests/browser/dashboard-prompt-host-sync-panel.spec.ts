import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import type {
  AppBinding,
  PromptHostImportPreview,
  PromptHostSyncBatchPreview,
  PromptHostSyncPreview,
  PromptHostSyncState
} from "@cc-switch-web/shared";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";

const loginToDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();
  await expect(page.getByTestId("quick-asset-delivery")).toBeVisible();
};

const upsertProvider = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly baseUrl: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/providers", {
    data: {
      ...payload,
      providerType: "openai-compatible",
      apiKey: `sk-${payload.id}`,
      enabled: true,
      timeoutMs: 30_000
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertBinding = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly appCode: AppBinding["appCode"];
    readonly providerId: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/app-bindings", {
    data: {
      ...payload,
      mode: "managed",
      promptTemplateId: null,
      skillId: null
    }
  });
  expect(response.ok()).toBeTruthy();
};

const applyQuickContextAsset = async (
  page: Page,
  payload: {
    readonly appCode: AppBinding["appCode"];
    readonly bindingId: string;
    readonly promptMarker: string;
  }
): Promise<void> => {
  const { appCode, bindingId, promptMarker } = payload;
  const card = page.getByTestId(`quick-asset-card-${appCode}`);
  const promptInput = page.getByTestId(`quick-context-prompt-input-${appCode}`);
  const previewButton = page.getByTestId(`quick-context-preview-button-${appCode}`);
  const previewPanel = page.getByTestId(`quick-context-preview-${appCode}`);
  const applyButton = page.getByTestId(`quick-context-apply-button-${appCode}`);
  const notice = page.getByTestId(`quick-context-notice-${appCode}`);
  const promptStatus = page.getByTestId(`quick-prompt-status-${appCode}`);

  await expect(card).toBeVisible();
  await promptInput.fill(promptMarker);
  await previewButton.click();
  await expect(previewPanel).toBeVisible();
  await expect(previewPanel).toContainText(bindingId);

  await applyButton.click();
  await expect(notice).toContainText(/已保存|have been saved/);
  await expect(promptStatus).toContainText(`prompt-quick-${appCode}`);
};

const loadPromptHostBatchPreview = async (
  request: APIRequestContext
): Promise<PromptHostSyncBatchPreview> => {
  const response = await request.get("/api/v1/prompt-host-sync/preview-all");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: PromptHostSyncBatchPreview };
  return payload.item;
};

const loadPromptHostSyncPreview = async (
  request: APIRequestContext,
  appCode: AppBinding["appCode"]
): Promise<PromptHostSyncPreview> => {
  const response = await request.get(`/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/preview-apply`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: PromptHostSyncPreview };
  return payload.item;
};

const loadPromptHostImportPreview = async (
  request: APIRequestContext,
  appCode: AppBinding["appCode"]
): Promise<PromptHostImportPreview> => {
  const response = await request.get(`/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/preview-import`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: PromptHostImportPreview };
  return payload.item;
};

const loadPromptHostSyncStates = async (
  request: APIRequestContext
): Promise<PromptHostSyncState[]> => {
  const response = await request.get("/api/v1/prompt-host-sync/states");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly items: PromptHostSyncState[] };
  return payload.items;
};

const expectSummaryCount = async (
  page: Page,
  summaryName: string,
  expectedCount: number
): Promise<void> => {
  await expect(
    page.getByTestId(`prompt-host-sync-summary-${summaryName}`).locator("strong")
  ).toHaveText(String(expectedCount));
};

test("prompt host sync panel applies and rolls back managed host prompt files across codex and claude-code", async ({
  page
}) => {
  const request = page.context().request;
  const providerId = "pw-batch-prompt-provider";

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: providerId,
    name: "Playwright Batch Prompt Provider",
    baseUrl: "https://playwright-batch-prompt-provider.example.com/v1"
  });
  await upsertBinding(request, {
    id: "binding-codex",
    appCode: "codex",
    providerId
  });
  await upsertBinding(request, {
    id: "pw-binding-claude-code",
    appCode: "claude-code",
    providerId
  });

  await page.reload();

  await applyQuickContextAsset(page, {
    appCode: "codex",
    bindingId: "binding-codex",
    promptMarker: "Playwright batch prompt marker for codex"
  });
  await applyQuickContextAsset(page, {
    appCode: "claude-code",
    bindingId: "pw-binding-claude-code",
    promptMarker: "Playwright batch prompt marker for claude-code"
  });

  const panel = page.getByTestId("prompt-host-sync-panel");
  const batchApplyButton = page.getByTestId("prompt-host-sync-apply-all-button");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("prompt-host-sync-card-codex")).toBeVisible();
  await expect(page.getByTestId("prompt-host-sync-card-claude-code")).toBeVisible();
  await expect(batchApplyButton).toBeEnabled();

  await expectSummaryCount(page, "managed-apps", 2);
  await expectSummaryCount(page, "currently-applied", 0);
  await expectSummaryCount(page, "batch-ready", 2);
  await expectSummaryCount(page, "blocked", 0);

  const previewBeforeApply = await loadPromptHostBatchPreview(request);
  expect(previewBeforeApply.totalApps).toBe(2);
  expect(previewBeforeApply.syncableApps).toBe(2);
  expect(previewBeforeApply.blockedApps).toEqual([]);
  expect(previewBeforeApply.items.map((item) => item.appCode).sort()).toEqual([
    "claude-code",
    "codex"
  ]);

  await batchApplyButton.click();

  await expect(
    page.getByRole("heading", { name: /整批 Prompt 宿主机同步已执行|Batch Prompt Host Sync Applied/ })
  ).toBeVisible();
  await expectSummaryCount(page, "currently-applied", 2);
  await expectSummaryCount(page, "batch-ready", 0);
  await expect(batchApplyButton).toBeDisabled();
  await expect(page.getByTestId("prompt-host-sync-rollback-button-codex")).toBeEnabled();
  await expect(page.getByTestId("prompt-host-sync-rollback-button-claude-code")).toBeEnabled();

  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "codex")).hasDiff).toBe(false);
  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "claude-code")).hasDiff).toBe(
    false
  );

  const previewAfterApply = await loadPromptHostBatchPreview(request);
  expect(previewAfterApply.totalApps).toBe(2);
  expect(previewAfterApply.syncableApps).toBe(0);
  expect(previewAfterApply.blockedApps).toEqual([]);

  const syncStates = await loadPromptHostSyncStates(request);
  expect(
    syncStates.some(
      (item) =>
        item.appCode === "codex" &&
        item.promptTemplateId === "prompt-quick-codex" &&
        item.promptPath.endsWith("/.codex/AGENTS.md")
    )
  ).toBeTruthy();
  expect(
    syncStates.some(
      (item) =>
        item.appCode === "claude-code" &&
        item.promptTemplateId === "prompt-quick-claude-code" &&
        item.promptPath.endsWith("/.claude/CLAUDE.md")
    )
  ).toBeTruthy();

  await page.getByTestId("prompt-host-sync-rollback-button-codex").click();
  await page.getByTestId("prompt-host-sync-rollback-button-claude-code").click();

  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "codex")).promptFileExists).toBe(false);
  await expect
    .poll(async () => (await loadPromptHostSyncPreview(request, "claude-code")).promptFileExists)
    .toBe(false);
  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "codex")).hasDiff).toBe(true);
  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "claude-code")).hasDiff).toBe(
    true
  );

  await expectSummaryCount(page, "currently-applied", 0);
  await expectSummaryCount(page, "batch-ready", 2);
  await expect(batchApplyButton).toBeEnabled();
  await expect(page.getByTestId("prompt-host-sync-rollback-button-codex")).toBeDisabled();
  await expect(page.getByTestId("prompt-host-sync-rollback-button-claude-code")).toBeDisabled();

  const codexPreviewAfterRollback = await loadPromptHostSyncPreview(request, "codex");
  expect(codexPreviewAfterRollback.rollbackAction).toBe("delete");
  expect(codexPreviewAfterRollback.promptTemplateId).toBe("prompt-quick-codex");
  expect(codexPreviewAfterRollback.promptFileExists).toBe(false);
  expect(codexPreviewAfterRollback.hasDiff).toBe(true);

  const claudePreviewAfterRollback = await loadPromptHostSyncPreview(request, "claude-code");
  expect(claudePreviewAfterRollback.rollbackAction).toBe("delete");
  expect(claudePreviewAfterRollback.promptTemplateId).toBe("prompt-quick-claude-code");
  expect(claudePreviewAfterRollback.promptFileExists).toBe(false);
  expect(claudePreviewAfterRollback.hasDiff).toBe(true);

  const codexImportPreviewAfterRollback = await loadPromptHostImportPreview(request, "codex");
  expect(codexImportPreviewAfterRollback.promptFileExists).toBe(false);
  expect(codexImportPreviewAfterRollback.status).toBe("missing-file");

  const claudeImportPreviewAfterRollback = await loadPromptHostImportPreview(request, "claude-code");
  expect(claudeImportPreviewAfterRollback.promptFileExists).toBe(false);
  expect(claudeImportPreviewAfterRollback.status).toBe("missing-file");

  const syncStatesAfterRollback = await loadPromptHostSyncStates(request);
  expect(syncStatesAfterRollback.some((item) => item.appCode === "codex")).toBe(false);
  expect(syncStatesAfterRollback.some((item) => item.appCode === "claude-code")).toBe(false);
});
