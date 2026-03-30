import { expect, test, type APIRequestContext } from "@playwright/test";

import type { McpHostSyncBatchPreview, McpHostSyncState } from "@cc-switch-web/shared";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";

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
    readonly appCode: "codex";
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

const loadMcpHostBatchPreview = async (
  request: APIRequestContext
): Promise<McpHostSyncBatchPreview> => {
  const response = await request.get("/api/v1/mcp/host-sync/preview-all");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { readonly item: McpHostSyncBatchPreview };
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

const loadDashboardBootstrap = async (
  request: APIRequestContext
): Promise<{
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
    readonly appMcpBindings: Array<{
      readonly id: string;
      readonly appCode: string;
      readonly serverId: string;
      readonly enabled: boolean;
    }>;
  };
};

test("browser flow logs in and closes the MCP convergence loop after removal confirmation", async ({
  page
}) => {
  const request = page.context().request;
  const createdServerIds = ["pw-filesystem", "pw-broken"] as const;
  const createdBindingIds = ["codex-pw-filesystem", "codex-pw-broken"] as const;
  const blockedPreviewPaths = new Set([
    "/api/v1/app-bindings/preview",
    "/api/v1/failover-chains/preview"
  ]);
  const previewServerErrors: string[] = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (blockedPreviewPaths.has(pathname) && response.status() >= 500) {
      previewServerErrors.push(`${pathname}:${response.status()}`);
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await expect(
    page.getByText("控制台默认只建议本地访问。Local access is recommended. 请输入控制令牌后进入管理界面。")
  ).toBeVisible();

  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();

  const expandAdvancedPanelsButton = page
    .getByRole("button", { name: /展开高级面板|Show Advanced Panels/ })
    .first();
  await expect(
    expandAdvancedPanelsButton
  ).toBeVisible();

  await rollbackAllMcpHostSync(request);
  for (const bindingId of createdBindingIds) {
    await deleteMcpBinding(request, bindingId);
  }
  for (const serverId of createdServerIds) {
    await deleteMcpServer(request, serverId);
  }

  try {
    await upsertMcpServer(request, {
      id: createdServerIds[0],
      name: "Playwright Filesystem",
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
      name: "Playwright Broken",
      transport: "stdio",
      command: null,
      args: [],
      url: null,
      env: {},
      headers: {},
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
      appCode: "codex",
      serverId: createdServerIds[1],
      enabled: true
    });

    await page.reload();
    await expandAdvancedPanelsButton.click();

    await expect(
      page.getByRole("heading", { name: /MCP 宿主机同步|MCP Host Sync/ })
    ).toBeVisible();

    const convergeButton = page.getByRole("button", { name: /整批收敛 MCP|Converge MCP Queue/ });
    await expect(convergeButton).toBeEnabled();
    await expect(
      page.getByText(/当前仍需确认移除项的应用|Apps Still Requiring Removal Review/)
    ).toBeVisible();

    await convergeButton.click();
    await expect(
      page.getByRole("heading", { name: /整批 MCP 已推进到宿主机确认|Batch MCP Advanced To Host Review/ })
    ).toBeVisible();

    const previewAfterReview = await loadMcpHostBatchPreview(request);
    expect(previewAfterReview.syncableApps).toBe(1);
    expect(
      previewAfterReview.items.some(
        (item) =>
          item.appCode === "codex" &&
          item.addedServerIds.includes(createdServerIds[0]) &&
          item.removedServerIds.includes("old") &&
          !item.addedServerIds.includes(createdServerIds[1])
      )
    ).toBeTruthy();

    const bootstrapAfterReview = await loadDashboardBootstrap(request);
    expect(
      bootstrapAfterReview.appMcpBindings.some(
        (item) =>
          item.id === createdBindingIds[0] &&
          item.appCode === "codex" &&
          item.serverId === createdServerIds[0] &&
          item.enabled
      )
    ).toBeTruthy();
    expect(
      bootstrapAfterReview.appMcpBindings.some(
        (item) =>
          item.id === createdBindingIds[1] &&
          item.appCode === "codex" &&
          item.serverId === createdServerIds[1] &&
          !item.enabled
      )
    ).toBeTruthy();

    await page
      .getByLabel(/我已确认允许移除上述宿主机托管 MCP 条目|I confirm that the managed host MCP entries above may be removed/)
      .check();
    await expect(convergeButton).toBeEnabled();
    await convergeButton.click();

    await expect(
      page.getByRole("heading", { name: /整批 MCP 收敛已执行|Batch MCP Converged/ })
    ).toBeVisible();
    await expect(
      page.getByText(/当前没有待执行的整批宿主机同步差异|There is no pending batch host sync diff right now/)
    ).toBeVisible();

    const previewAfterConverged = await loadMcpHostBatchPreview(request);
    expect(previewAfterConverged.syncableApps).toBe(0);

    const syncStates = await loadMcpHostSyncStates(request);
    expect(
      syncStates.some(
        (item) =>
          item.appCode === "codex" &&
          item.configPath.endsWith("/.codex/config.toml") &&
          item.syncedServerIds.includes(createdServerIds[0]) &&
          !item.syncedServerIds.includes("old")
      )
    ).toBeTruthy();

    await expect(previewServerErrors).toEqual([]);
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
