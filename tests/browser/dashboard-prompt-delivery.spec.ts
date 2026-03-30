import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import type {
  AppBinding,
  PromptHostImportPreview,
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

test("quick asset delivery closes the prompt publish and rollback loop against managed host state", async ({
  page
}) => {
  const request = page.context().request;
  const providerId = "pw-delivery-provider-codex";
  const bindingId = "binding-codex";
  const promptMarker = "Playwright prompt delivery marker";
  const skillMarker = "Playwright skill delivery marker";

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: providerId,
    name: "Playwright Delivery Provider",
    baseUrl: "https://playwright-delivery-provider.example.com/v1"
  });
  await upsertBinding(request, {
    id: bindingId,
    appCode: "codex",
    providerId
  });

  await page.reload();

  const codexCard = page.getByTestId("quick-asset-card-codex");
  const promptInput = page.getByTestId("quick-context-prompt-input-codex");
  const skillInput = page.getByTestId("quick-context-skill-input-codex");
  const previewButton = page.getByTestId("quick-context-preview-button-codex");
  const applyButton = page.getByTestId("quick-context-apply-button-codex");
  const previewPanel = page.getByTestId("quick-context-preview-codex");
  const notice = page.getByTestId("quick-context-notice-codex");
  const promptStatus = page.getByTestId("quick-prompt-status-codex");
  const publishButton = page.getByTestId("quick-prompt-publish-button-codex");
  const rollbackButton = page.getByTestId("quick-prompt-rollback-button-codex");

  await expect(codexCard).toBeVisible();
  await promptInput.fill(promptMarker);
  await skillInput.fill(skillMarker);

  await previewButton.click();
  await expect(previewPanel).toBeVisible();
  await expect(previewPanel).toContainText(bindingId);

  await applyButton.click();
  await expect(notice).toContainText(/已保存|have been saved/);

  await expect(promptStatus).toContainText("prompt-quick-codex");
  await expect(promptStatus).toContainText("skill-quick-codex");
  await expect(publishButton).toBeEnabled();

  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "codex")).applyReady).toBe(true);
  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "codex")).hasDiff).toBe(true);

  const previewBeforePublish = await loadPromptHostSyncPreview(request, "codex");
  expect(previewBeforePublish.promptTemplateId).toBe("prompt-quick-codex");
  expect(previewBeforePublish.ignoredSkillId).toBe("skill-quick-codex");
  expect(previewBeforePublish.selectionSource).toBe("active-context");

  await publishButton.click();

  await expect(promptStatus).toContainText(/最近已下发|Last Applied/);
  await expect(rollbackButton).toBeEnabled();
  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "codex")).hasDiff).toBe(false);

  const previewAfterPublish = await loadPromptHostSyncPreview(request, "codex");
  expect(previewAfterPublish.promptFileExists).toBeTruthy();
  expect(previewAfterPublish.promptTemplateId).toBe("prompt-quick-codex");
  expect(previewAfterPublish.promptPath.endsWith("/.codex/AGENTS.md")).toBeTruthy();
  expect(previewAfterPublish.selectionSource).toBe("active-context");

  const importPreview = await loadPromptHostImportPreview(request, "codex");
  expect(importPreview.promptFileExists).toBeTruthy();
  expect(importPreview.hasContent).toBeTruthy();
  expect(importPreview.status).toBe("ready-match");
  expect(importPreview.matchedPromptTemplateId).toBe("prompt-quick-codex");

  const syncStates = await loadPromptHostSyncStates(request);
  expect(
    syncStates.some(
      (item) =>
        item.appCode === "codex" &&
        item.promptTemplateId === "prompt-quick-codex" &&
        item.promptPath.endsWith("/.codex/AGENTS.md")
    )
  ).toBeTruthy();

  await rollbackButton.click();

  await expect(rollbackButton).toBeDisabled();
  await expect(publishButton).toBeEnabled();
  await expect
    .poll(async () => (await loadPromptHostSyncPreview(request, "codex")).promptFileExists)
    .toBe(false);
  await expect.poll(async () => (await loadPromptHostSyncPreview(request, "codex")).hasDiff).toBe(true);

  const previewAfterRollback = await loadPromptHostSyncPreview(request, "codex");
  expect(previewAfterRollback.promptTemplateId).toBe("prompt-quick-codex");
  expect(previewAfterRollback.promptFileExists).toBe(false);
  expect(previewAfterRollback.hasDiff).toBe(true);
  expect(previewAfterRollback.rollbackAction).toBe("delete");

  const importPreviewAfterRollback = await loadPromptHostImportPreview(request, "codex");
  expect(importPreviewAfterRollback.promptFileExists).toBe(false);
  expect(importPreviewAfterRollback.status).toBe("missing-file");

  const syncStatesAfterRollback = await loadPromptHostSyncStates(request);
  expect(syncStatesAfterRollback.some((item) => item.appCode === "codex")).toBe(false);
});
