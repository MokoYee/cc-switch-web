import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import type {
  AppBinding,
  McpHostSyncBatchPreview,
  McpHostSyncState,
  McpHostSyncPreview
} from "@cc-switch-web/shared";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";

const cleanupServerIds = ["pw-filesystem", "pw-broken"] as const;
const cleanupBindingIds = ["codex-pw-filesystem", "codex-pw-broken"] as const;

const loginToDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();
  await expect(page.getByTestId("quick-asset-delivery")).toBeVisible();
};

const upsertMcpServer = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly transport: "stdio" | "http";
    readonly command: string | null;
    readonly args: readonly string[];
    readonly url: string | null;
    readonly env: Record<string, string>;
    readonly headers: Record<string, string>;
    readonly enabled: boolean;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/mcp/servers", {
    data: payload
  });
  expect(response.ok()).toBeTruthy();
};

const upsertMcpBinding = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly appCode: AppBinding["appCode"];
    readonly serverId: string;
    readonly enabled: boolean;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/mcp/app-bindings", {
    data: payload
  });
  expect(response.ok()).toBeTruthy();
};

const deleteMcpBinding = async (request: APIRequestContext, id: string): Promise<void> => {
  const response = await request.delete(`/api/v1/mcp/app-bindings/${encodeURIComponent(id)}`);
  expect([200, 204, 404]).toContain(response.status());
};

const deleteMcpServer = async (request: APIRequestContext, id: string): Promise<void> => {
  const response = await request.delete(`/api/v1/mcp/servers/${encodeURIComponent(id)}`);
  expect([200, 204, 404]).toContain(response.status());
};

const rollbackAllMcpHostSync = async (request: APIRequestContext): Promise<void> => {
  const response = await request.post("/api/v1/mcp/host-sync/rollback-all", {
    data: {}
  });
  expect(response.ok()).toBeTruthy();
};

const cleanupKnownMcpArtifacts = async (request: APIRequestContext): Promise<void> => {
  await rollbackAllMcpHostSync(request);

  for (const bindingId of cleanupBindingIds) {
    await deleteMcpBinding(request, bindingId);
  }
  for (const serverId of cleanupServerIds) {
    await deleteMcpServer(request, serverId);
  }
};

const loadMcpHostBatchPreview = async (
  request: APIRequestContext
): Promise<McpHostSyncBatchPreview> => {
  const response = await request.get("/api/v1/mcp/host-sync/preview-all");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: McpHostSyncBatchPreview };
  return payload.item;
};

const loadMcpHostSyncPreview = async (
  request: APIRequestContext,
  appCode: AppBinding["appCode"]
): Promise<McpHostSyncPreview> => {
  const response = await request.get(`/api/v1/mcp/host-sync/${encodeURIComponent(appCode)}/preview-apply`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: McpHostSyncPreview };
  return payload.item;
};

const loadMcpHostSyncStates = async (
  request: APIRequestContext
): Promise<McpHostSyncState[]> => {
  const response = await request.get("/api/v1/mcp/host-sync/states");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly items: McpHostSyncState[] };
  return payload.items;
};

const expectSummaryCount = async (
  page: Page,
  summaryName: string,
  expectedCount: number
): Promise<void> => {
  await expect(page.getByTestId(`mcp-host-sync-summary-${summaryName}`).locator("strong")).toHaveText(
    String(expectedCount)
  );
};

test("mcp host sync panel applies and rolls back managed host sync across codex and claude-code", async ({
  page
}) => {
  const request = page.context().request;
  const createdServerIds = ["pw-mcp-host-codex-fs", "pw-mcp-host-claude-http"] as const;
  const createdBindingIds = ["pw-mcp-host-binding-codex", "pw-mcp-host-binding-claude"] as const;

  await loginToDashboard(page);
  await cleanupKnownMcpArtifacts(request);

  try {
    await upsertMcpServer(request, {
      id: createdServerIds[0],
      name: "Playwright MCP Codex Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
      url: null,
      env: {
        ROOT_PATH: "/tmp"
      },
      headers: {},
      enabled: true
    });
    await upsertMcpServer(request, {
      id: createdServerIds[1],
      name: "Playwright MCP Claude HTTP",
      transport: "http",
      command: null,
      args: [],
      url: "https://playwright-mcp-claude.example.com/mcp",
      env: {},
      headers: {
        Authorization: "Bearer playwright"
      },
      enabled: true
    });
    await upsertMcpBinding(request, {
      id: createdBindingIds[0],
      appCode: "codex",
      serverId: createdServerIds[0],
      enabled: true
    });
    await upsertMcpBinding(request, {
      id: createdBindingIds[1],
      appCode: "claude-code",
      serverId: createdServerIds[1],
      enabled: true
    });

    await page.reload();
    const expandAdvancedPanelsButton = page
      .getByRole("button", { name: /展开高级面板|Show Advanced Panels/ })
      .first();
    await expandAdvancedPanelsButton.click();

    await expect(page.getByTestId("mcp-host-sync-panel")).toBeVisible();
    await expect(page.getByTestId("mcp-host-sync-card-codex")).toBeVisible();
    await expect(page.getByTestId("mcp-host-sync-card-claude-code")).toBeVisible();

    const batchApplyButton = page.getByTestId("mcp-host-sync-apply-all-button");
    const batchRollbackButton = page.getByTestId("mcp-host-sync-rollback-all-button");
    const codexDangerConfirm = page.getByTestId("mcp-host-sync-danger-confirm-codex");

    await expectSummaryCount(page, "apps-to-sync", 2);
    await expectSummaryCount(page, "added-entries", 2);
    await expectSummaryCount(page, "removed-entries", 1);
    await expect(batchApplyButton).toBeDisabled();
    await expect(codexDangerConfirm).toBeVisible();

    const previewBeforeApply = await loadMcpHostBatchPreview(request);
    expect(previewBeforeApply.syncableApps).toBe(2);
    expect(previewBeforeApply.items.map((item) => item.appCode).sort()).toEqual([
      "claude-code",
      "codex"
    ]);
    expect(
      previewBeforeApply.items.some(
        (item) => item.appCode === "codex" && item.removedServerIds.includes("old")
      )
    ).toBeTruthy();
    expect(
      previewBeforeApply.items.some(
        (item) =>
          item.appCode === "claude-code" &&
          item.addedServerIds.includes(createdServerIds[1]) &&
          item.removedServerIds.length === 0
      )
    ).toBeTruthy();

    await codexDangerConfirm.check();
    await expect(batchApplyButton).toBeEnabled();
    await batchApplyButton.click();

    await expect(
      page.getByRole("heading", { name: /整批宿主机同步已执行|Batch Host Sync Applied/ })
    ).toBeVisible();
    await expectSummaryCount(page, "apps-to-sync", 0);
    await expect(batchRollbackButton).toBeVisible();
    await expect(batchRollbackButton).toBeEnabled();

    await expect
      .poll(async () => (await loadMcpHostSyncPreview(request, "codex")).addedServerIds.length)
      .toBe(0);
    await expect
      .poll(async () => (await loadMcpHostSyncPreview(request, "claude-code")).addedServerIds.length)
      .toBe(0);

    const previewAfterApply = await loadMcpHostBatchPreview(request);
    expect(previewAfterApply.syncableApps).toBe(0);

    const syncStates = await loadMcpHostSyncStates(request);
    expect(
      syncStates.some(
        (item) =>
          item.appCode === "codex" &&
          item.configPath.endsWith("/.codex/config.toml") &&
          item.syncedServerIds.includes(createdServerIds[0])
      )
    ).toBeTruthy();
    expect(
      syncStates.some(
        (item) =>
          item.appCode === "claude-code" &&
          item.configPath.endsWith("/.claude.json") &&
          item.syncedServerIds.includes(createdServerIds[1])
      )
    ).toBeTruthy();

    await batchRollbackButton.click();

    await expect(
      page.getByRole("heading", { name: /整批宿主机 MCP 已回滚|Batch Host MCP Rolled Back/ })
    ).toBeVisible();
    await expectSummaryCount(page, "apps-to-sync", 2);
    await expect(batchApplyButton).toBeEnabled();
    await expect(codexDangerConfirm).toBeVisible();

    const previewAfterRollback = await loadMcpHostBatchPreview(request);
    expect(previewAfterRollback.syncableApps).toBe(2);
    expect(
      previewAfterRollback.items.some(
        (item) =>
          item.appCode === "codex" &&
          item.currentManagedServerIds.includes("old") &&
          item.addedServerIds.includes(createdServerIds[0])
      )
    ).toBeTruthy();
    expect(
      previewAfterRollback.items.some(
        (item) =>
          item.appCode === "claude-code" &&
          item.configExists === false &&
          item.addedServerIds.includes(createdServerIds[1])
      )
    ).toBeTruthy();

    const syncStatesAfterRollback = await loadMcpHostSyncStates(request);
    expect(syncStatesAfterRollback).toEqual([]);
  } finally {
    await rollbackAllMcpHostSync(request);
    for (const bindingId of createdBindingIds) {
      await deleteMcpBinding(request, bindingId);
    }
    for (const serverId of createdServerIds) {
      await deleteMcpServer(request, serverId);
    }
  }
});
