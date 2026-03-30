import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import type { McpHostSyncPreview, McpImportPreview } from "@cc-switch-web/shared";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";

const importedServerId = "old";
const importedBindingId = "codex-old";

const loginToDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();
  await expect(page.getByTestId("quick-asset-delivery")).toBeVisible();
};

const deleteMcpBinding = async (request: APIRequestContext, id: string): Promise<void> => {
  const response = await request.delete(`/api/v1/mcp/app-bindings/${encodeURIComponent(id)}`);
  expect([200, 204, 404]).toContain(response.status());
};

const deleteMcpServer = async (request: APIRequestContext, id: string): Promise<void> => {
  const response = await request.delete(`/api/v1/mcp/servers/${encodeURIComponent(id)}`);
  expect([200, 204, 404]).toContain(response.status());
};

const cleanupImportedCodexMcp = async (request: APIRequestContext): Promise<void> => {
  await deleteMcpBinding(request, importedBindingId);
  await deleteMcpServer(request, importedServerId);
};

const loadMcpImportPreview = async (
  request: APIRequestContext,
  appCode: "codex"
): Promise<McpImportPreview> => {
  const response = await request.get(`/api/v1/mcp/import/${encodeURIComponent(appCode)}/preview`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: McpImportPreview };
  return payload.item;
};

const loadMcpHostSyncPreview = async (
  request: APIRequestContext,
  appCode: "codex"
): Promise<McpHostSyncPreview> => {
  const response = await request.get(`/api/v1/mcp/host-sync/${encodeURIComponent(appCode)}/preview-apply`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: McpHostSyncPreview };
  return payload.item;
};

const loadDashboardBootstrap = async (
  request: APIRequestContext
): Promise<{
  readonly mcpServers: Array<{
    readonly id: string;
    readonly command: string | null;
    readonly transport: "stdio" | "http";
    readonly enabled: boolean;
  }>;
  readonly appMcpBindings: Array<{
    readonly id: string;
    readonly appCode: string;
    readonly serverId: string;
    readonly enabled: boolean;
  }>;
}> => {
  const response = await request.get("/api/v1/dashboard/bootstrap?refresh=1");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    readonly mcpServers: Array<{
      readonly id: string;
      readonly command: string | null;
      readonly transport: "stdio" | "http";
      readonly enabled: boolean;
    }>;
    readonly appMcpBindings: Array<{
      readonly id: string;
      readonly appCode: string;
      readonly serverId: string;
      readonly enabled: boolean;
    }>;
  };
};

test("mcp import preview stays consistent with import result and bootstrap reload", async ({ page }) => {
  const request = page.context().request;

  await loginToDashboard(page);
  await cleanupImportedCodexMcp(request);

  try {
    await page.reload();
    await page
      .getByRole("button", { name: /展开高级面板|Show Advanced Panels/ })
      .first()
      .click();

    await expect(page.getByTestId("mcp-host-sync-card-codex")).toBeVisible();

    const previewButton = page.getByTestId("mcp-import-preview-button-codex");
    const importButton = page.getByTestId("mcp-import-button-codex");

    await expect(previewButton).toBeEnabled();
    await expect(importButton).toBeEnabled();
    await previewButton.click();

    await expect(page.getByTestId("mcp-import-preview-card-codex")).toBeVisible();
    await expect(page.getByTestId("mcp-import-preview-item-codex-old")).toBeVisible();

    const previewBeforeImport = await loadMcpImportPreview(request, "codex");
    expect(previewBeforeImport.totalDiscovered).toBe(1);
    expect(previewBeforeImport.newServerIds).toEqual([importedServerId]);
    expect(previewBeforeImport.existingServerIds).toEqual([]);
    expect(previewBeforeImport.bindingToCreateServerIds).toEqual([importedServerId]);
    expect(previewBeforeImport.bindingAlreadyEnabledServerIds).toEqual([]);
    expect(
      previewBeforeImport.items.some(
        (item) =>
          item.serverId === importedServerId &&
          item.status === "new" &&
          item.bindingStatus === "create"
      )
    ).toBeTruthy();

    const hostSyncBeforeImport = await loadMcpHostSyncPreview(request, "codex");
    expect(hostSyncBeforeImport.currentManagedServerIds).toContain(importedServerId);
    expect(hostSyncBeforeImport.removedServerIds).toContain(importedServerId);

    await importButton.click();

    await expect(page.getByRole("heading", { name: /宿主机 MCP 已导入|Host MCP Imported/ })).toBeVisible();

    const bootstrapAfterImport = await loadDashboardBootstrap(request);
    expect(
      bootstrapAfterImport.mcpServers.some(
        (item) =>
          item.id === importedServerId &&
          item.transport === "stdio" &&
          item.command === "npx" &&
          item.enabled
      )
    ).toBeTruthy();
    expect(
      bootstrapAfterImport.appMcpBindings.some(
        (item) =>
          item.id === importedBindingId &&
          item.appCode === "codex" &&
          item.serverId === importedServerId &&
          item.enabled
      )
    ).toBeTruthy();

    const previewAfterImport = await loadMcpImportPreview(request, "codex");
    expect(previewAfterImport.totalDiscovered).toBe(1);
    expect(previewAfterImport.newServerIds).toEqual([]);
    expect(previewAfterImport.existingServerIds).toEqual([importedServerId]);
    expect(previewAfterImport.bindingToCreateServerIds).toEqual([]);
    expect(previewAfterImport.bindingAlreadyEnabledServerIds).toEqual([importedServerId]);
    expect(
      previewAfterImport.items.some(
        (item) =>
          item.serverId === importedServerId &&
          item.status === "binding-only" &&
          item.bindingStatus === "already-enabled" &&
          item.changedFields.length === 0
      )
    ).toBeTruthy();

    const hostSyncAfterImport = await loadMcpHostSyncPreview(request, "codex");
    expect(hostSyncAfterImport.addedServerIds).toEqual([]);
    expect(hostSyncAfterImport.removedServerIds).toEqual([]);
    expect(hostSyncAfterImport.unchangedServerIds).toContain(importedServerId);

    await page.reload();
    await page
      .getByRole("button", { name: /展开高级面板|Show Advanced Panels/ })
      .first()
      .click();
    await expect(page.getByTestId("mcp-host-sync-card-codex")).toBeVisible();
    await page.getByTestId("mcp-import-preview-button-codex").click();
    await expect(page.getByTestId("mcp-import-preview-card-codex")).toBeVisible();
    await expect(page.getByTestId("mcp-import-preview-item-codex-old")).toBeVisible();
  } finally {
    await cleanupImportedCodexMcp(request);
  }
});
