import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureDashboardAdvancedTargetVisible } from "./support/advanced-panels.js";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";
const EDITOR_SELECTION_PREFIX = "cc-switch-web.dashboard.editor-selection";
const DEFAULT_PROXY_POLICY = {
  listenHost: "127.0.0.1",
  listenPort: 8788,
  enabled: false,
  requestTimeoutMs: 60000,
  failureThreshold: 3
} as const;

const loginToDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();
  await expect(
    page.getByRole("button", { name: /展开高级面板|Show Advanced Panels/ }).first()
  ).toBeVisible();
};

const ensureRoutingFormsVisible = async (page: Page): Promise<void> => {
  const bindingForm = page.getByTestId("binding-form");
  await ensureDashboardAdvancedTargetVisible(page, bindingForm);
};

const setEditorSelection = async (
  page: Page,
  kind: "provider" | "binding" | "app-quota" | "failover",
  id: string
): Promise<void> => {
  await page.evaluate(
    ({ key, value }) => window.sessionStorage.setItem(key, value),
    {
      key: `${EDITOR_SELECTION_PREFIX}.${kind}`,
      value: id
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
): Promise<void> => {
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
};

const upsertAppQuota = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly appCode: "codex" | "claude-code" | "gemini-cli" | "opencode" | "openclaw";
    readonly enabled: boolean;
    readonly maxRequests: number | null;
    readonly maxTokens: number | null;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/app-quotas", {
    data: {
      ...payload,
      period: "day"
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertBinding = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly appCode: "codex" | "claude-code" | "gemini-cli" | "opencode" | "openclaw";
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

const loadCurrentProxyPolicy = async (
  request: APIRequestContext
): Promise<{
  readonly listenHost: string;
  readonly listenPort: number;
  readonly enabled: boolean;
  readonly requestTimeoutMs: number;
  readonly failureThreshold: number;
}> => {
  const response = await request.get("/api/v1/dashboard/bootstrap");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    readonly latestSnapshot?: {
      readonly payload?: {
        readonly proxyPolicy?: {
          readonly listenHost: string;
          readonly listenPort: number;
          readonly enabled: boolean;
          readonly requestTimeoutMs: number;
          readonly failureThreshold: number;
        };
      };
    } | null;
  };

  return body.latestSnapshot?.payload?.proxyPolicy ?? DEFAULT_PROXY_POLICY;
};

test("provider editor keeps preview requests, save echo, and bootstrap reload in sync for the selected provider", async ({
  page
}) => {
  const request = page.context().request;
  const providerPreviewStatuses: number[] = [];
  const providerPreviewPayloads: Array<{
    readonly id: string;
    readonly baseUrl: string;
  }> = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/providers/preview") {
      providerPreviewStatuses.push(response.status());
    }
  });
  page.on("request", (outgoingRequest) => {
    const { pathname } = new URL(outgoingRequest.url());
    if (pathname === "/api/v1/providers/preview" && outgoingRequest.method() !== "GET") {
      providerPreviewPayloads.push(
        outgoingRequest.postDataJSON() as {
          readonly id: string;
          readonly baseUrl: string;
        }
      );
    }
  });

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: "pw-provider-sync-a",
    name: "Playwright Provider Sync A",
    baseUrl: "https://playwright-provider-sync-a.example.com/v1"
  });
  await upsertProvider(request, {
    id: "pw-provider-sync-b",
    name: "Playwright Provider Sync B",
    baseUrl: "https://playwright-provider-sync-b.example.com/v1"
  });

  await setEditorSelection(page, "provider", "pw-provider-sync-b");
  await page.reload();
  await ensureRoutingFormsVisible(page);

  const providerIdInput = page.getByTestId("provider-id-input");
  const providerBaseUrlInput = page.getByTestId("provider-base-url-input");
  const providerSaveButton = page.getByTestId("provider-save-button");
  const providerPreview = page.getByTestId("provider-preview");
  const nextBaseUrl = "https://playwright-provider-sync-b-updated.example.com/v1";

  await expect(providerIdInput).toHaveValue("pw-provider-sync-b");
  await expect(providerBaseUrlInput).toHaveValue("https://playwright-provider-sync-b.example.com/v1");
  await expect(providerPreview).toBeVisible();

  const previewCountBeforeChange = providerPreviewStatuses.length;
  const payloadCountBeforeChange = providerPreviewPayloads.length;
  await providerBaseUrlInput.fill(nextBaseUrl);

  await expect
    .poll(() =>
      providerPreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200)
    )
    .toBe(true);
  await expect
    .poll(() =>
      providerPreviewPayloads
        .slice(payloadCountBeforeChange)
        .some((payload) => payload.id === "pw-provider-sync-b" && payload.baseUrl === nextBaseUrl)
    )
    .toBe(true);
  await expect(page.getByTestId("provider-danger-confirm")).toHaveCount(0);
  await expect(providerSaveButton).toBeEnabled();

  await providerSaveButton.click();

  await expect(
    page.getByRole("heading", { name: /Provider 已保存|Provider Saved/ })
  ).toBeVisible();
  await expect(providerBaseUrlInput).toHaveValue(nextBaseUrl);
  expect(providerPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(providerIdInput).toHaveValue("pw-provider-sync-b");
  await expect(providerBaseUrlInput).toHaveValue(nextBaseUrl);
});

test("new provider without credential exposes the danger state and the disable-first recovery path", async ({
  page
}) => {
  const providerPreviewStatuses: number[] = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/providers/preview") {
      providerPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);
  await ensureRoutingFormsVisible(page);

  const providerIdInput = page.getByTestId("provider-id-input");
  const providerNameInput = page.getByTestId("provider-name-input");
  const providerBaseUrlInput = page.getByTestId("provider-base-url-input");
  const providerEnabledCheckbox = page.getByTestId("provider-enabled-checkbox");
  const providerSaveButton = page.getByTestId("provider-save-button");

  const previewCountBeforeRisk = providerPreviewStatuses.length;
  await providerIdInput.fill("pw-provider-no-key");
  await providerNameInput.fill("Playwright Provider No Key");
  await providerBaseUrlInput.fill("https://playwright-provider-no-key.example.com/v1");

  await expect
    .poll(() =>
      providerPreviewStatuses.slice(previewCountBeforeRisk).some((status) => status === 200)
    )
    .toBe(true);
  await expect(page.getByTestId("provider-danger-confirm")).toBeVisible();
  await expect(providerSaveButton).toBeDisabled();

  const previewCountBeforeDisable = providerPreviewStatuses.length;
  await page.getByTestId("provider-disable-first-button").click();

  await expect
    .poll(() =>
      providerPreviewStatuses.slice(previewCountBeforeDisable).some((status) => status === 200)
    )
    .toBe(true);
  await expect(page.getByTestId("provider-danger-confirm")).toHaveCount(0);
  await expect(providerEnabledCheckbox).not.toBeChecked();
  await expect(providerSaveButton).toBeEnabled();

  await providerSaveButton.click();

  await expect(
    page.getByRole("heading", { name: /Provider 已保存|Provider Saved/ })
  ).toBeVisible();
  await setEditorSelection(page, "provider", "pw-provider-no-key");
  expect(providerPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(providerIdInput).toHaveValue("pw-provider-no-key");
  await expect(providerEnabledCheckbox).not.toBeChecked();
});

test("binding editor keeps preview, save echo, and bootstrap reload in sync", async ({
  page
}) => {
  const request = page.context().request;
  const bindingPreviewStatuses: number[] = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/app-bindings/preview") {
      bindingPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: "pw-provider-a",
    name: "Playwright Provider A",
    baseUrl: "https://playwright-provider-a.example.com/v1"
  });
  await upsertProvider(request, {
    id: "pw-provider-b",
    name: "Playwright Provider B",
    baseUrl: "https://playwright-provider-b.example.com/v1"
  });
  await upsertBinding(request, {
    id: "binding-codex",
    appCode: "codex",
    providerId: "pw-provider-a"
  });

  await page.reload();
  await ensureRoutingFormsVisible(page);

  const providerSelect = page.getByTestId("binding-provider-select");
  const saveButton = page.getByTestId("binding-save-button");
  const preview = page.getByTestId("binding-preview");

  await expect(providerSelect).toHaveValue("pw-provider-a");
  await expect(preview).toContainText("pw-provider-a");

  const previewCountBeforeChange = bindingPreviewStatuses.length;
  await providerSelect.selectOption("pw-provider-b");

  await expect
    .poll(() => bindingPreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200))
    .toBe(true);
  await expect(preview).toContainText("pw-provider-b");
  await expect(saveButton).toBeEnabled();

  await saveButton.click();

  await expect(
    page.getByRole("heading", { name: /Binding 已保存|Binding Saved/ })
  ).toBeVisible();
  await expect(providerSelect).toHaveValue("pw-provider-b");
  expect(bindingPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(providerSelect).toHaveValue("pw-provider-b");
  await expect(preview).toContainText("pw-provider-b");
});

test("binding duplicate conflict stays blocked before save instead of exposing a fake override path", async ({
  page
}) => {
  const request = page.context().request;
  const bindingPreviewStatuses: number[] = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/app-bindings/preview") {
      bindingPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: "pw-binding-risk-provider-a",
    name: "Playwright Binding Risk Provider A",
    baseUrl: "https://playwright-binding-risk-provider-a.example.com/v1"
  });
  await upsertBinding(request, {
    id: "binding-openclaw-primary",
    appCode: "openclaw",
    providerId: "pw-binding-risk-provider-a"
  });

  await page.reload();
  await ensureRoutingFormsVisible(page);

  const bindingIdInput = page.getByTestId("binding-id-input");
  const appSelect = page.getByTestId("binding-app-select");
  const saveButton = page.getByTestId("binding-save-button");
  const preview = page.getByTestId("binding-preview");

  const previewCountBeforeConflict = bindingPreviewStatuses.length;
  await bindingIdInput.fill("binding-openclaw-duplicate");
  await appSelect.selectOption("openclaw");

  await expect
    .poll(() =>
      bindingPreviewStatuses.slice(previewCountBeforeConflict).some((status) => status === 200)
    )
    .toBe(true);
  await expect(preview).toBeVisible();
  await expect(page.getByTestId("binding-danger-confirm")).toHaveCount(0);
  await expect(saveButton).toBeDisabled();
  expect(bindingPreviewStatuses.every((status) => status < 500)).toBeTruthy();
});

test("app quota editor keeps preview requests, save echo, and bootstrap reload in sync for the selected quota", async ({
  page
}) => {
  const request = page.context().request;
  const appQuotaPreviewStatuses: number[] = [];
  const appQuotaPreviewPayloads: Array<{
    readonly id: string;
    readonly appCode: string;
    readonly maxRequests: number | null;
  }> = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/app-quotas/preview") {
      appQuotaPreviewStatuses.push(response.status());
    }
  });
  page.on("request", (outgoingRequest) => {
    const { pathname } = new URL(outgoingRequest.url());
    if (pathname === "/api/v1/app-quotas/preview" && outgoingRequest.method() !== "GET") {
      appQuotaPreviewPayloads.push(
        outgoingRequest.postDataJSON() as {
          readonly id: string;
          readonly appCode: string;
          readonly maxRequests: number | null;
        }
      );
    }
  });

  await loginToDashboard(page);

  await upsertAppQuota(request, {
    id: "pw-quota-codex",
    appCode: "codex",
    enabled: true,
    maxRequests: 100,
    maxTokens: 1000
  });
  await upsertAppQuota(request, {
    id: "pw-quota-claude-code",
    appCode: "claude-code",
    enabled: false,
    maxRequests: 50,
    maxTokens: 500
  });

  await setEditorSelection(page, "app-quota", "pw-quota-claude-code");
  await page.reload();
  await ensureRoutingFormsVisible(page);

  const appQuotaIdInput = page.getByTestId("app-quota-id-input");
  const appQuotaAppSelect = page.getByTestId("app-quota-app-select");
  const appQuotaMaxRequestsInput = page.getByTestId("app-quota-max-requests-input");
  const appQuotaSaveButton = page.getByTestId("app-quota-save-button");
  const appQuotaPreview = page.getByTestId("app-quota-preview");

  await expect(appQuotaIdInput).toHaveValue("pw-quota-claude-code");
  await expect(appQuotaAppSelect).toHaveValue("claude-code");
  await expect(appQuotaMaxRequestsInput).toHaveValue("50");
  await expect(appQuotaPreview).toContainText("claude-code");

  const previewCountBeforeChange = appQuotaPreviewStatuses.length;
  const payloadCountBeforeChange = appQuotaPreviewPayloads.length;
  await appQuotaMaxRequestsInput.fill("75");

  await expect
    .poll(() =>
      appQuotaPreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200)
    )
    .toBe(true);
  await expect
    .poll(() =>
      appQuotaPreviewPayloads.slice(payloadCountBeforeChange).some(
        (payload) =>
          payload.id === "pw-quota-claude-code" &&
          payload.appCode === "claude-code" &&
          payload.maxRequests === 75
      )
    )
    .toBe(true);
  await expect(appQuotaSaveButton).toBeEnabled();

  await appQuotaSaveButton.click();

  await expect(
    page.getByRole("heading", { name: /配额已保存|Quota Saved/ })
  ).toBeVisible();
  await expect(appQuotaMaxRequestsInput).toHaveValue("75");
  expect(appQuotaPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(appQuotaIdInput).toHaveValue("pw-quota-claude-code");
  await expect(appQuotaAppSelect).toHaveValue("claude-code");
  await expect(appQuotaMaxRequestsInput).toHaveValue("75");
  await expect(appQuotaPreview).toContainText("claude-code");
});

test("proxy policy editor keeps preview requests, save echo, and bootstrap reload in sync", async ({
  page
}) => {
  const request = page.context().request;
  const proxyPolicyPreviewStatuses: number[] = [];
  const proxyPolicyPreviewPayloads: Array<{
    readonly listenPort: number;
    readonly enabled: boolean;
  }> = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/proxy-policy/preview") {
      proxyPolicyPreviewStatuses.push(response.status());
    }
  });
  page.on("request", (outgoingRequest) => {
    const { pathname } = new URL(outgoingRequest.url());
    if (pathname === "/api/v1/proxy-policy/preview" && outgoingRequest.method() !== "GET") {
      proxyPolicyPreviewPayloads.push(
        outgoingRequest.postDataJSON() as {
          readonly listenPort: number;
          readonly enabled: boolean;
        }
      );
    }
  });

  await loginToDashboard(page);

  const originalPolicy = await loadCurrentProxyPolicy(request);
  const nextListenPort = originalPolicy.listenPort === 8899 ? 8901 : 8899;
  const nextEnabled = true;

  try {
    await page.reload();
    await ensureRoutingFormsVisible(page);

    const proxyPolicyListenPortInput = page.getByTestId("proxy-policy-listen-port-input");
    const proxyPolicyEnabledCheckbox = page.getByTestId("proxy-policy-enabled-checkbox");
    const proxyPolicySaveButton = page.getByTestId("proxy-policy-save-button");
    const proxyPolicyPreview = page.getByTestId("proxy-policy-preview");

    await expect(proxyPolicyListenPortInput).toHaveValue(String(originalPolicy.listenPort));
    if (originalPolicy.enabled) {
      await expect(proxyPolicyEnabledCheckbox).toBeChecked();
    } else {
      await expect(proxyPolicyEnabledCheckbox).not.toBeChecked();
    }
    await expect(proxyPolicyPreview).toBeVisible();

    const previewCountBeforeChange = proxyPolicyPreviewStatuses.length;
    const payloadCountBeforeChange = proxyPolicyPreviewPayloads.length;
    await proxyPolicyListenPortInput.fill(String(nextListenPort));
    if (!originalPolicy.enabled) {
      await proxyPolicyEnabledCheckbox.check();
    }

    await expect
      .poll(() =>
        proxyPolicyPreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200)
      )
      .toBe(true);
    await expect
      .poll(() =>
        proxyPolicyPreviewPayloads.slice(payloadCountBeforeChange).some(
          (payload) => payload.listenPort === nextListenPort && payload.enabled === nextEnabled
        )
      )
      .toBe(true);
    await expect(proxyPolicySaveButton).toBeEnabled();

    await proxyPolicySaveButton.click();

    await expect(
      page.getByRole("heading", { name: /代理策略已保存|Proxy Policy Saved/ })
    ).toBeVisible();
    await expect(proxyPolicyListenPortInput).toHaveValue(String(nextListenPort));
    await expect(proxyPolicyEnabledCheckbox).toBeChecked();
    expect(proxyPolicyPreviewStatuses.every((status) => status < 500)).toBeTruthy();

    await page.reload();
    await ensureRoutingFormsVisible(page);

    await expect(proxyPolicyListenPortInput).toHaveValue(String(nextListenPort));
    await expect(proxyPolicyEnabledCheckbox).toBeChecked();
  } finally {
    const restoreResponse = await request.put("/api/v1/proxy-policy", {
      data: originalPolicy
    });
    expect(restoreResponse.ok()).toBeTruthy();
  }
});

test("failover editor keeps preview normalization, save echo, and bootstrap reload in sync", async ({
  page
}) => {
  const request = page.context().request;
  const failoverPreviewStatuses: number[] = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/failover-chains/preview") {
      failoverPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: "pw-failover-provider-a",
    name: "Playwright Failover Provider A",
    baseUrl: "https://playwright-failover-provider-a.example.com/v1"
  });
  await upsertProvider(request, {
    id: "pw-failover-provider-b",
    name: "Playwright Failover Provider B",
    baseUrl: "https://playwright-failover-provider-b.example.com/v1"
  });
  await upsertBinding(request, {
    id: "pw-binding-claude-code",
    appCode: "claude-code",
    providerId: "pw-failover-provider-b"
  });

  await page.reload();
  await ensureRoutingFormsVisible(page);

  const candidateSelect = page.getByTestId("failover-candidate-select");
  const appSelect = page.getByTestId("failover-app-select");
  const addProviderButton = page.getByTestId("failover-add-provider-button");
  const setPrimaryButton = page.getByTestId("failover-set-primary-button");
  const saveButton = page.getByTestId("failover-save-button");
  const preview = page.getByTestId("failover-preview");

  await appSelect.selectOption("claude-code");
  await candidateSelect.selectOption("pw-failover-provider-a");
  await addProviderButton.click();
  await candidateSelect.selectOption("pw-failover-provider-b");
  await addProviderButton.click();

  const previewCountBeforeReorder = failoverPreviewStatuses.length;
  await setPrimaryButton.click();

  await expect
    .poll(() => failoverPreviewStatuses.slice(previewCountBeforeReorder).some((status) => status === 200))
    .toBe(true);
  await expect(preview).toContainText("pw-failover-provider-b, pw-failover-provider-a");
  await expect(saveButton).toBeEnabled();

  await saveButton.click();

  await expect(
    page.getByRole("heading", { name: /故障转移链已保存|Failover Chain Saved/ })
  ).toBeVisible();
  expect(failoverPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(appSelect).toHaveValue("claude-code");
  await expect(preview).toContainText("pw-failover-provider-b, pw-failover-provider-a");
});

test("failover missing-primary risk can be repaired from the preview before save", async ({
  page
}) => {
  const request = page.context().request;
  const failoverPreviewStatuses: number[] = [];

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/failover-chains/preview") {
      failoverPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: "pw-failover-risk-primary",
    name: "Playwright Failover Risk Primary",
    baseUrl: "https://playwright-failover-risk-primary.example.com/v1"
  });
  await upsertProvider(request, {
    id: "pw-failover-risk-fallback",
    name: "Playwright Failover Risk Fallback",
    baseUrl: "https://playwright-failover-risk-fallback.example.com/v1"
  });
  await upsertBinding(request, {
    id: "binding-opencode-primary",
    appCode: "opencode",
    providerId: "pw-failover-risk-primary"
  });

  await page.reload();
  await ensureRoutingFormsVisible(page);

  const candidateSelect = page.getByTestId("failover-candidate-select");
  const appSelect = page.getByTestId("failover-app-select");
  const addProviderButton = page.getByTestId("failover-add-provider-button");
  const setPrimaryButton = page.getByTestId("failover-set-primary-button");
  const saveButton = page.getByTestId("failover-save-button");
  const preview = page.getByTestId("failover-preview");

  await appSelect.selectOption("opencode");
  const previewCountBeforeRisk = failoverPreviewStatuses.length;
  await candidateSelect.selectOption("pw-failover-risk-fallback");
  await addProviderButton.click();

  await expect
    .poll(() =>
      failoverPreviewStatuses.slice(previewCountBeforeRisk).some((status) => status === 200)
    )
    .toBe(true);
  await expect(preview).toContainText("pw-failover-risk-fallback");
  await expect(page.getByTestId("failover-danger-confirm")).toBeVisible();
  await expect(saveButton).toBeDisabled();

  const previewCountBeforeRepair = failoverPreviewStatuses.length;
  await setPrimaryButton.click();

  await expect
    .poll(() =>
      failoverPreviewStatuses.slice(previewCountBeforeRepair).some((status) => status === 200)
    )
    .toBe(true);
  await expect(page.getByTestId("failover-danger-confirm")).toHaveCount(0);
  await expect(preview).toContainText("pw-failover-risk-primary");
  await expect(preview).toContainText("pw-failover-risk-fallback");
  await expect(saveButton).toBeEnabled();

  await saveButton.click();

  await expect(
    page.getByRole("heading", { name: /故障转移链已保存|Failover Chain Saved/ })
  ).toBeVisible();
  await setEditorSelection(page, "failover", "failover-opencode");
  expect(failoverPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureRoutingFormsVisible(page);

  await expect(appSelect).toHaveValue("opencode");
  await expect(preview).toContainText("pw-failover-risk-primary");
  await expect(preview).toContainText("pw-failover-risk-fallback");
});
