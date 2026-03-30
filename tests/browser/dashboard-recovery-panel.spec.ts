import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureDashboardAdvancedTargetVisible } from "./support/advanced-panels.js";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";
const EDITOR_SELECTION_PREFIX = "cc-switch-web.dashboard.editor-selection";
type AppCode = "codex" | "claude-code" | "gemini-cli" | "opencode" | "openclaw";

const loginToDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();
  await expect(
    page.getByRole("button", { name: /展开高级面板|Show Advanced Panels/ }).first()
  ).toBeVisible();
};

const ensureRecoveryPanelVisible = async (page: Page): Promise<void> => {
  const exportPanel = page.getByTestId("recovery-export-panel");
  await ensureDashboardAdvancedTargetVisible(page, exportPanel);
};

const ensureRoutingFormsVisible = async (page: Page): Promise<void> => {
  const bindingForm = page.getByTestId("binding-form");
  await ensureDashboardAdvancedTargetVisible(page, bindingForm);
};

const setProviderEditorSelection = async (page: Page, providerId: string): Promise<void> => {
  await page.evaluate(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    {
      key: `${EDITOR_SELECTION_PREFIX}.provider`,
      value: providerId
    }
  );
};

const upsertProvider = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly baseUrl: string;
  }
): Promise<number> => {
  const response = await request.post("/api/v1/providers", {
    data: {
      ...payload,
      providerType: "openai-compatible",
      apiKey: `sk-${payload.id}`,
      enabled: true,
      timeoutMs: 30000
    }
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    readonly snapshotVersion: number;
  };
  return body.snapshotVersion;
};

const upsertBinding = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly appCode: AppCode;
    readonly providerId: string;
  }
): Promise<number> => {
  const response = await request.post("/api/v1/app-bindings", {
    data: {
      ...payload,
      mode: "managed",
      promptTemplateId: null,
      skillId: null
    }
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    readonly snapshotVersion: number;
  };
  return body.snapshotVersion;
};

const checkIfVisible = async (page: Page, testId: string): Promise<void> => {
  const checkbox = page.getByTestId(testId);
  if (await checkbox.isVisible()) {
    await checkbox.check();
  }
};

const loadExistingBindingId = async (
  request: APIRequestContext,
  appCode: AppCode
): Promise<string | null> => {
  const response = await request.get("/api/v1/app-bindings");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    readonly items: Array<{
      readonly id: string;
      readonly appCode: AppCode;
    }>;
  };

  return payload.items.find((item) => item.appCode === appCode)?.id ?? null;
};

test("recovery panel keeps masked export safe and requires explicit confirmation before exporting a secret-bearing bundle", async ({
  page
}) => {
  const request = page.context().request;
  const providerId = "pw-provider-recovery";
  const originalName = "Playwright Provider Recovery";
  const updatedName = "Playwright Provider Recovery Updated";

  await loginToDashboard(page);
  const bindingId = (await loadExistingBindingId(request, "codex")) ?? "binding-codex";

  await upsertProvider(request, {
    id: providerId,
    name: originalName,
    baseUrl: "https://playwright-provider-recovery.example.com/v1"
  });
  await upsertBinding(request, {
    id: bindingId,
    appCode: "codex",
    providerId
  });

  await page.reload();
  await ensureRecoveryPanelVisible(page);

  const exportTextarea = page.getByTestId("recovery-export-textarea");
  const exportButton = page.getByTestId("recovery-export-button");
  const includeSecretsCheckbox = page.getByTestId("recovery-export-include-secrets-checkbox");
  const exportSecretsConfirm = page.getByTestId("recovery-export-secrets-confirm");
  const importTextarea = page.getByTestId("recovery-import-textarea");
  const previewImportButton = page.getByTestId("recovery-preview-import-button");
  const importPreview = page.getByTestId("recovery-import-preview");

  await exportButton.click();

  await expect.poll(async () => {
    const raw = await exportTextarea.inputValue();
    if (!raw.trim().startsWith("{")) {
      return "empty";
    }
    const parsed = JSON.parse(raw) as {
      readonly providers: Array<{
        readonly id: string;
        readonly apiKey?: string;
      }>;
    };
    return parsed.providers.find((item) => item.id === providerId)?.apiKey ?? "__masked__";
  }).toBe("__masked__");

  const maskedExportRaw = await exportTextarea.inputValue();
  const maskedExport = JSON.parse(maskedExportRaw) as {
    readonly providers: Array<{
      readonly id: string;
      readonly apiKey?: string;
    }>;
  };
  expect(maskedExport.providers.find((item) => item.id === providerId)?.apiKey).toBeUndefined();

  await importTextarea.fill(maskedExportRaw);
  await previewImportButton.click();
  await expect(importPreview).toContainText("omits plaintext credentials for enabled providers");
  await expect(importPreview).toContainText(providerId);

  await includeSecretsCheckbox.check();
  await expect(exportButton).toBeDisabled();
  await exportSecretsConfirm.check();
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  await expect.poll(async () => {
    const raw = await exportTextarea.inputValue();
    if (!raw.trim().startsWith("{")) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      readonly providers: Array<{
        readonly id: string;
        readonly name: string;
        readonly apiKey?: string;
      }>;
    };
    return parsed.providers.find((item) => item.id === providerId)?.apiKey;
  }).toBe(`sk-${providerId}`);

  const secretExportRaw = await exportTextarea.inputValue();
  const secretExport = JSON.parse(secretExportRaw) as {
    readonly providers: Array<{
      readonly id: string;
      readonly name: string;
      readonly apiKey?: string;
    }>;
  };

  const nextPackage = {
    ...secretExport,
    providers: secretExport.providers.map((item) =>
      item.id === providerId
        ? {
            ...item,
            name: updatedName
          }
        : item
    )
  };

  await importTextarea.fill(JSON.stringify(nextPackage, null, 2));
  await previewImportButton.click();
  await expect(importPreview).toBeVisible();
  await page.getByTestId("recovery-import-confirm").check();
  await page.getByTestId("recovery-import-button").click();

  await setProviderEditorSelection(page, providerId);
  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(page.getByTestId("provider-id-input")).toHaveValue(providerId);
  await expect(page.getByTestId("provider-name-input")).toHaveValue(updatedName);
});

test("recovery restore previews a historical snapshot and reloads the provider editor back to the restored values", async ({
  page
}) => {
  const request = page.context().request;
  const providerId = "pw-provider-recovery-restore";
  const originalName = "Playwright Provider Restore Original";
  const originalBaseUrl = "https://playwright-provider-restore-original.example.com/v1";
  const updatedName = "Playwright Provider Restore Updated";
  const updatedBaseUrl = "https://playwright-provider-restore-updated.example.com/v1";

  await loginToDashboard(page);
  const bindingId = (await loadExistingBindingId(request, "codex")) ?? "binding-codex";

  await upsertProvider(request, {
    id: providerId,
    name: originalName,
    baseUrl: originalBaseUrl
  });
  const originalSnapshotVersion = await upsertBinding(request, {
    id: bindingId,
    appCode: "codex",
    providerId
  });
  await upsertProvider(request, {
    id: providerId,
    name: updatedName,
    baseUrl: updatedBaseUrl
  });

  await page.reload();
  await ensureRecoveryPanelVisible(page);

  await page.getByTestId(`recovery-snapshot-restore-${originalSnapshotVersion}`).click();

  const restorePreview = page.getByTestId("recovery-restore-preview");
  await expect(restorePreview).toBeVisible();
  await expect(restorePreview).toContainText(`v${originalSnapshotVersion}`);

  await checkIfVisible(page, "recovery-restore-confirm");
  await page.getByTestId("recovery-restore-button").click();
  await expect(page.getByRole("heading", { name: /快照已恢复|Snapshot Restored/ })).toBeVisible();

  await setProviderEditorSelection(page, providerId);
  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(page.getByTestId("provider-id-input")).toHaveValue(providerId);
  await expect(page.getByTestId("provider-name-input")).toHaveValue(originalName);
  await expect(page.getByTestId("provider-base-url-input")).toHaveValue(originalBaseUrl);
});
