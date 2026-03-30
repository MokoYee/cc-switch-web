import { once } from "node:events";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage
} from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

import type {
  ActiveContextState,
  AppBinding,
  EffectiveAppContext,
  ProxyRequestLogPage,
  ResolvedSessionContext,
  ResolvedWorkspaceContext,
  SessionRuntimeDetail,
  UsageRecordPage,
  WorkspaceRuntimeDetail
} from "cc-switch-web-shared";
import { ensureDashboardAdvancedTargetVisible } from "./support/advanced-panels.js";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";
const EDITOR_SELECTION_PREFIX = "cc-switch-web.dashboard.editor-selection";
const ISO_TIME = "2026-03-28T10:00:00.000Z";

type CapturedUpstreamRequest = {
  readonly model: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: {
    readonly model?: string;
    readonly messages?: Array<{
      readonly role?: string;
      readonly content?: unknown;
    }>;
  } | null;
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

const ensureAssetFormsVisible = async (page: Page): Promise<void> => {
  const workspaceForm = page.getByTestId("workspace-form");
  await ensureDashboardAdvancedTargetVisible(page, workspaceForm);
};

const ensureRuntimePanelVisible = async (page: Page): Promise<void> => {
  const runtimePanel = page.getByTestId("context-runtime-panel");
  await ensureDashboardAdvancedTargetVisible(page, runtimePanel);
};

const setEditorSelection = async (
  page: Page,
  kind: "workspace" | "session",
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

const parseJsonResponse = async <T>(response: APIResponse): Promise<T> => {
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBeTruthy();
  return JSON.parse(responseBody) as T;
};

const buildQueryString = (
  params: Record<string, string | number | null | undefined>
): string => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    const normalizedValue = String(value);
    if (normalizedValue.length === 0) {
      continue;
    }

    searchParams.set(key, normalizedValue);
  }

  const queryString = searchParams.toString();
  return queryString.length === 0 ? "" : `?${queryString}`;
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

const upsertPrompt = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly content: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/prompts", {
    data: {
      ...payload,
      appCode: "codex",
      locale: "zh-CN",
      enabled: true,
      tags: ["browser", "runtime-context"]
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertSkill = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly promptTemplateId: string;
    readonly content: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/skills", {
    data: {
      ...payload,
      appCode: "codex",
      enabled: true,
      tags: ["browser", "runtime-context"]
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertWorkspace = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly rootPath: string;
    readonly defaultProviderId: string | null;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/workspaces", {
    data: {
      ...payload,
      appCode: "codex",
      defaultPromptTemplateId: null,
      defaultSkillId: null,
      enabled: true,
      tags: ["browser", "runtime-context"]
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertSession = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly workspaceId: string;
    readonly title: string;
    readonly cwd: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/sessions", {
    data: {
      ...payload,
      appCode: "codex",
      providerId: null,
      promptTemplateId: null,
      skillId: null,
      status: "active",
      startedAt: ISO_TIME
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertBinding = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly providerId: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/app-bindings", {
    data: {
      ...payload,
      appCode: "codex",
      mode: "managed",
      promptTemplateId: null,
      skillId: null
    }
  });
  expect(response.ok()).toBeTruthy();
};

const loadBindingByAppCode = async (
  request: APIRequestContext,
  appCode: AppBinding["appCode"]
): Promise<AppBinding | null> => {
  const payload = await parseJsonResponse<{ readonly items: AppBinding[] }>(
    await request.get("/api/v1/app-bindings")
  );
  return payload.items.find((item) => item.appCode === appCode) ?? null;
};

const loadActiveContextState = async (
  request: APIRequestContext
): Promise<ActiveContextState> =>
  parseJsonResponse<ActiveContextState>(await request.get("/api/v1/active-context"));

const deleteBinding = async (
  request: APIRequestContext,
  bindingId: string
): Promise<void> => {
  const response = await request.delete(`/api/v1/app-bindings/${encodeURIComponent(bindingId)}`);
  expect(response.ok()).toBeTruthy();
};

const loadProxyPolicy = async (
  request: APIRequestContext
): Promise<{
  readonly policy: {
    readonly listenHost: string;
    readonly listenPort: number;
    readonly enabled: boolean;
    readonly requestTimeoutMs: number;
    readonly failureThreshold: number;
  };
}> =>
  parseJsonResponse<{
    readonly policy: {
      readonly listenHost: string;
      readonly listenPort: number;
      readonly enabled: boolean;
      readonly requestTimeoutMs: number;
      readonly failureThreshold: number;
    };
  }>(await request.get("/api/v1/proxy-policy"));

const saveProxyPolicy = async (
  request: APIRequestContext,
  policy: {
    readonly listenHost: string;
    readonly listenPort: number;
    readonly enabled: boolean;
    readonly requestTimeoutMs: number;
    readonly failureThreshold: number;
  }
): Promise<void> => {
  const response = await request.put("/api/v1/proxy-policy", {
    data: policy
  });
  expect(response.ok()).toBeTruthy();
};

const loadWorkspaceContext = async (
  request: APIRequestContext,
  workspaceId: string
): Promise<ResolvedWorkspaceContext> => {
  const payload = await parseJsonResponse<{ readonly item: ResolvedWorkspaceContext }>(
    await request.get(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/context`)
  );
  return payload.item;
};

const loadSessionContext = async (
  request: APIRequestContext,
  sessionId: string
): Promise<ResolvedSessionContext> => {
  const payload = await parseJsonResponse<{ readonly item: ResolvedSessionContext }>(
    await request.get(`/api/v1/sessions/${encodeURIComponent(sessionId)}/context`)
  );
  return payload.item;
};

const loadEffectiveContext = async (
  request: APIRequestContext,
  overrides: {
    readonly workspaceId?: string | null;
    readonly sessionId?: string | null;
    readonly cwd?: string | null;
  }
): Promise<EffectiveAppContext> =>
  parseJsonResponse<EffectiveAppContext>(
    await request.get(
      `/api/v1/active-context/effective/codex${buildQueryString({
        workspaceId: overrides.workspaceId,
        sessionId: overrides.sessionId,
        cwd: overrides.cwd
      })}`
    )
  );

const loadWorkspaceRuntimeDetail = async (
  request: APIRequestContext,
  workspaceId: string
): Promise<WorkspaceRuntimeDetail> => {
  const payload = await parseJsonResponse<{ readonly item: WorkspaceRuntimeDetail }>(
    await request.get(`/api/v1/runtime-contexts/workspaces/${encodeURIComponent(workspaceId)}`)
  );
  return payload.item;
};

const loadSessionRuntimeDetail = async (
  request: APIRequestContext,
  sessionId: string
): Promise<SessionRuntimeDetail> => {
  const payload = await parseJsonResponse<{ readonly item: SessionRuntimeDetail }>(
    await request.get(`/api/v1/runtime-contexts/sessions/${encodeURIComponent(sessionId)}`)
  );
  return payload.item;
};

const loadRequestLogs = async (
  request: APIRequestContext,
  filters: {
    readonly appCode?: string;
    readonly providerId?: string;
    readonly workspaceId?: string;
    readonly sessionId?: string;
    readonly limit?: number;
    readonly offset?: number;
  }
): Promise<ProxyRequestLogPage> =>
  parseJsonResponse<ProxyRequestLogPage>(
    await request.get(
      `/api/v1/proxy-request-logs${buildQueryString({
        appCode: filters.appCode,
        providerId: filters.providerId,
        workspaceId: filters.workspaceId,
        sessionId: filters.sessionId,
        limit: filters.limit ?? 20,
        offset: filters.offset ?? 0
      })}`
    )
  );

const loadUsageRecords = async (
  request: APIRequestContext,
  filters: {
    readonly appCode?: string;
    readonly providerId?: string;
    readonly model?: string;
    readonly limit?: number;
    readonly offset?: number;
  }
): Promise<UsageRecordPage> =>
  parseJsonResponse<UsageRecordPage>(
    await request.get(
      `/api/v1/usage/records${buildQueryString({
        appCode: filters.appCode,
        providerId: filters.providerId,
        model: filters.model,
        limit: filters.limit ?? 20,
        offset: filters.offset ?? 0
      })}`
    )
  );

const readRequestBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const createContextAwareUpstream = async (): Promise<{
  readonly baseUrl: string;
  readonly capturedRequests: CapturedUpstreamRequest[];
  readonly close: () => Promise<void>;
}> => {
  const usageByModel = new Map<
    string,
    {
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  >([
    ["pw-context-model-workspace", { inputTokens: 12, outputTokens: 8 }],
    ["pw-context-model-session", { inputTokens: 20, outputTokens: 10 }]
  ]);
  const capturedRequests: CapturedUpstreamRequest[] = [];

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "Not Found" }));
      return;
    }

    const body = (await readRequestBody(request)) as CapturedUpstreamRequest["body"];
    const model = typeof body?.model === "string" ? body.model : "unknown-model";
    const usage = usageByModel.get(model) ?? { inputTokens: 1, outputTokens: 1 };
    capturedRequests.push({
      model,
      headers: request.headers,
      body
    });

    const responseBody = JSON.stringify({
      id: `chatcmpl-${model}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: `reply for ${model}`
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: usage.inputTokens,
        completion_tokens: usage.outputTokens,
        total_tokens: usage.inputTokens + usage.outputTokens
      }
    });

    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(responseBody))
    });
    response.end(responseBody);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    capturedRequests,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
};

const postProxyCompletion = async (
  request: APIRequestContext,
  model: string
): Promise<void> => {
  const response = await request.post("/proxy/codex/v1/chat/completions", {
    data: {
      model,
      messages: [
        {
          role: "user",
          content: `runtime smoke ${model}`
        }
      ]
    }
  });
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBeTruthy();
};

const findCapturedRequest = (
  capturedRequests: readonly CapturedUpstreamRequest[],
  model: string
): CapturedUpstreamRequest | null => {
  for (let index = capturedRequests.length - 1; index >= 0; index -= 1) {
    if (capturedRequests[index]?.model === model) {
      return capturedRequests[index] ?? null;
    }
  }

  return null;
};

const extractSystemInstruction = (capture: CapturedUpstreamRequest | null): string => {
  const systemMessage = capture?.body?.messages?.find((message) => message.role === "system");
  if (typeof systemMessage?.content === "string") {
    return systemMessage.content;
  }

  if (Array.isArray(systemMessage?.content)) {
    return systemMessage.content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (typeof item === "object" && item !== null && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .filter((item) => item.length > 0)
      .join("\n");
  }

  return "";
};

test("workspace and session runtime stay aligned with edited context, active selection, proxy logs, and usage", async ({
  page
}) => {
  const upstream = await createContextAwareUpstream();
  let originalCodexBinding: AppBinding | null = null;
  let originalActiveContext: ActiveContextState | null = null;
  let originalProxyPolicy:
    | {
        readonly listenHost: string;
        readonly listenPort: number;
        readonly enabled: boolean;
        readonly requestTimeoutMs: number;
        readonly failureThreshold: number;
      }
    | null = null;

  try {
    const request = page.context().request;
    const workspacePreviewStatuses: number[] = [];
    const sessionPreviewStatuses: number[] = [];
    const workspaceId = "pw-context-workspace";
    const sessionId = "pw-context-session";
    const bindingId = "pw-context-binding-codex";
    const baseWorkspaceProviderId = "pw-context-provider-base";
    const workspaceProviderId = "pw-context-provider-workspace";
    const sessionProviderId = "pw-context-provider-session";
    const workspacePromptId = "pw-context-prompt-workspace";
    const sessionPromptId = "pw-context-prompt-session";
    const workspaceSkillId = "pw-context-skill-workspace";
    const sessionSkillId = "pw-context-skill-session";
    const workspacePromptMarker = "PLAYWRIGHT_WORKSPACE_PROMPT_MARKER";
    const sessionPromptMarker = "PLAYWRIGHT_SESSION_PROMPT_MARKER";
    const workspaceSkillMarker = "PLAYWRIGHT_WORKSPACE_SKILL_MARKER";
    const sessionSkillMarker = "PLAYWRIGHT_SESSION_SKILL_MARKER";
    const workspaceModel = "pw-context-model-workspace";
    const sessionModel = "pw-context-model-session";

    page.on("response", (response) => {
      const { pathname } = new URL(response.url());
      if (pathname === "/api/v1/workspaces/preview") {
        workspacePreviewStatuses.push(response.status());
      }
      if (pathname === "/api/v1/sessions/preview") {
        sessionPreviewStatuses.push(response.status());
      }
    });

    await loginToDashboard(page);
    originalCodexBinding = await loadBindingByAppCode(request, "codex");
    originalActiveContext = await loadActiveContextState(request);
    originalProxyPolicy = (await loadProxyPolicy(request)).policy;
    await saveProxyPolicy(request, {
      ...originalProxyPolicy,
      enabled: true
    });

    await upsertProvider(request, {
      id: baseWorkspaceProviderId,
      name: "Playwright Base Workspace Provider",
      baseUrl: upstream.baseUrl
    });
    await upsertProvider(request, {
      id: workspaceProviderId,
      name: "Playwright Workspace Provider",
      baseUrl: upstream.baseUrl
    });
    await upsertProvider(request, {
      id: sessionProviderId,
      name: "Playwright Session Provider",
      baseUrl: upstream.baseUrl
    });
    await upsertPrompt(request, {
      id: workspacePromptId,
      name: "Playwright Workspace Prompt",
      content: `workspace prompt ${workspacePromptMarker}`
    });
    await upsertPrompt(request, {
      id: sessionPromptId,
      name: "Playwright Session Prompt",
      content: `session prompt ${sessionPromptMarker}`
    });
    await upsertSkill(request, {
      id: workspaceSkillId,
      name: "Playwright Workspace Skill",
      promptTemplateId: workspacePromptId,
      content: `workspace skill ${workspaceSkillMarker}`
    });
    await upsertSkill(request, {
      id: sessionSkillId,
      name: "Playwright Session Skill",
      promptTemplateId: sessionPromptId,
      content: `session skill ${sessionSkillMarker}`
    });
    await upsertWorkspace(request, {
      id: workspaceId,
      name: "Playwright Runtime Workspace",
      rootPath: "/tmp/pw-context-workspace",
      defaultProviderId: baseWorkspaceProviderId
    });
    await upsertBinding(request, {
      id: originalCodexBinding?.id ?? bindingId,
      providerId: baseWorkspaceProviderId
    });
    await upsertSession(request, {
      id: sessionId,
      workspaceId,
      title: "Playwright Runtime Session",
      cwd: "/tmp/pw-context-workspace"
    });

    await setEditorSelection(page, "workspace", workspaceId);
    await page.reload();
    await ensureAssetFormsVisible(page);

    const workspaceProviderSelect = page.getByTestId("workspace-provider-select");
    const workspacePromptSelect = page.getByTestId("workspace-prompt-select");
    const workspaceSkillSelect = page.getByTestId("workspace-skill-select");
    const workspaceSaveButton = page.getByTestId("workspace-save-button");
    const workspacePreview = page.getByTestId("workspace-preview");

    await expect(workspaceProviderSelect).toHaveValue(baseWorkspaceProviderId);
    const workspacePreviewCountBeforeChange = workspacePreviewStatuses.length;
    await workspaceProviderSelect.selectOption(workspaceProviderId);
    await workspacePromptSelect.selectOption(workspacePromptId);
    await workspaceSkillSelect.selectOption(workspaceSkillId);
    await expect
      .poll(() => workspacePreviewStatuses.slice(workspacePreviewCountBeforeChange).some((status) => status === 200))
      .toBe(true);
    await expect(workspacePreview).toBeVisible();
    await expect(workspaceSaveButton).toBeEnabled();
    await workspaceSaveButton.click();
    await expect(page.getByRole("heading", { name: /工作区已保存|Workspace Saved/ })).toBeVisible();

    const workspaceContext = await loadWorkspaceContext(request, workspaceId);
    expect(workspaceContext.provider.id).toBe(workspaceProviderId);
    expect(workspaceContext.promptTemplate.id).toBe(workspacePromptId);
    expect(workspaceContext.skill.id).toBe(workspaceSkillId);

    await setEditorSelection(page, "session", sessionId);
    await page.reload();
    await ensureAssetFormsVisible(page);

    const sessionProviderSelect = page.getByTestId("session-provider-select");
    const sessionPromptSelect = page.getByTestId("session-prompt-select");
    const sessionSkillSelect = page.getByTestId("session-skill-select");
    const sessionSaveButton = page.getByTestId("session-save-button");
    const sessionPreview = page.getByTestId("session-preview");

    const sessionPreviewCountBeforeChange = sessionPreviewStatuses.length;
    await sessionProviderSelect.selectOption(sessionProviderId);
    await sessionPromptSelect.selectOption(sessionPromptId);
    await sessionSkillSelect.selectOption(sessionSkillId);
    await expect
      .poll(() => sessionPreviewStatuses.slice(sessionPreviewCountBeforeChange).some((status) => status === 200))
      .toBe(true);
    await expect(sessionPreview).toBeVisible();
    await expect(sessionSaveButton).toBeEnabled();
    await sessionSaveButton.click();
    await expect(page.getByRole("heading", { name: /会话已保存|Session Saved/ })).toBeVisible();

    const sessionContext = await loadSessionContext(request, sessionId);
    expect(sessionContext.provider.id).toBe(sessionProviderId);
    expect(sessionContext.promptTemplate.id).toBe(sessionPromptId);
    expect(sessionContext.skill.id).toBe(sessionSkillId);

    await page.reload();
    await ensureRuntimePanelVisible(page);

    await page.getByTestId(`workspace-runtime-view-detail-${workspaceId}`).click();
    const workspaceRuntimeDetailCard = page.getByTestId(`workspace-runtime-detail-${workspaceId}`);
    await expect(workspaceRuntimeDetailCard).toBeVisible();
    await expect(page.getByTestId(`workspace-runtime-effective-provider-${workspaceId}`)).toContainText(workspaceProviderId);
    await expect(page.getByTestId(`workspace-runtime-effective-prompt-${workspaceId}`)).toContainText(workspacePromptId);
    await expect(page.getByTestId(`workspace-runtime-effective-skill-${workspaceId}`)).toContainText(workspaceSkillId);

    await page.getByTestId(`workspace-runtime-activate-${workspaceId}`).click();

    await expect
      .poll(async () => (await loadEffectiveContext(request, {})).source)
      .toBe("active-workspace");
    await expect
      .poll(async () => (await loadEffectiveContext(request, {})).provider.id)
      .toBe(workspaceProviderId);

    const workspaceEffectiveContext = await loadEffectiveContext(request, {});
    expect(workspaceEffectiveContext.promptTemplate.id).toBe(workspacePromptId);
    expect(workspaceEffectiveContext.skill.id).toBe(workspaceSkillId);

    await postProxyCompletion(request, workspaceModel);

    await expect
      .poll(() => findCapturedRequest(upstream.capturedRequests, workspaceModel)?.headers["x-cc-switch-web-context-source"] ?? null)
      .toBe("active-workspace");
    await expect
      .poll(() => findCapturedRequest(upstream.capturedRequests, workspaceModel)?.headers["x-cc-switch-web-context-provider"] ?? null)
      .toBe(workspaceProviderId);

    const capturedWorkspaceRequest = findCapturedRequest(upstream.capturedRequests, workspaceModel);
    expect(capturedWorkspaceRequest?.headers["x-cc-switch-web-workspace"]).toBe(workspaceId);
    expect(capturedWorkspaceRequest?.headers["x-cc-switch-web-session"] ?? null).toBe(null);
    expect(capturedWorkspaceRequest?.headers["x-cc-switch-web-context-prompt"]).toBe(workspacePromptId);
    expect(capturedWorkspaceRequest?.headers["x-cc-switch-web-context-skill"]).toBe(workspaceSkillId);
    expect(extractSystemInstruction(capturedWorkspaceRequest)).toContain(workspacePromptMarker);
    expect(extractSystemInstruction(capturedWorkspaceRequest)).toContain(workspaceSkillMarker);

    await expect
      .poll(async () => {
        const pageData = await loadRequestLogs(request, {
          appCode: "codex",
          workspaceId,
          limit: 10
        });
        return pageData.items.find((item) => item.sessionId === null)?.id ?? null;
      })
      .not.toBeNull();

    const workspaceRequestLogs = await loadRequestLogs(request, {
      appCode: "codex",
      workspaceId,
      limit: 10
    });
    const workspaceRequestLog = workspaceRequestLogs.items.find((item) => item.sessionId === null);
    expect(workspaceRequestLog).toBeDefined();
    expect(workspaceRequestLog?.providerId).toBe(workspaceProviderId);
    expect(workspaceRequestLog?.contextSource).toBe("active-workspace");
    expect(workspaceRequestLog?.promptTemplateId).toBe(workspacePromptId);
    expect(workspaceRequestLog?.skillId).toBe(workspaceSkillId);

    const workspaceUsageRecords = await loadUsageRecords(request, {
      appCode: "codex",
      providerId: workspaceProviderId,
      model: workspaceModel,
      limit: 10
    });
    expect(workspaceUsageRecords.items[0]?.requestLogId).toBe(workspaceRequestLog?.id ?? null);

    const workspaceRuntimeDetail = await loadWorkspaceRuntimeDetail(request, workspaceId);
    expect(workspaceRuntimeDetail.recentRequestLogs.some((item) => item.id === workspaceRequestLog?.id)).toBeTruthy();
    expect(workspaceRuntimeDetail.modelBreakdown.some((item) => item.model === workspaceModel)).toBeTruthy();
    expect(workspaceRuntimeDetail.resolvedContext.provider.id).toBe(workspaceProviderId);
    expect(workspaceRuntimeDetail.resolvedContext.promptTemplate.id).toBe(workspacePromptId);
    expect(workspaceRuntimeDetail.resolvedContext.skill.id).toBe(workspaceSkillId);

    await page.getByTestId(`session-runtime-view-detail-${sessionId}`).click();
    const sessionRuntimeDetailCard = page.getByTestId(`session-runtime-detail-${sessionId}`);
    await expect(sessionRuntimeDetailCard).toBeVisible();
    await expect(page.getByTestId(`session-runtime-effective-provider-${sessionId}`)).toContainText(sessionProviderId);
    await expect(page.getByTestId(`session-runtime-effective-prompt-${sessionId}`)).toContainText(sessionPromptId);
    await expect(page.getByTestId(`session-runtime-effective-skill-${sessionId}`)).toContainText(sessionSkillId);

    await page.getByTestId(`session-runtime-activate-${sessionId}`).click();

    await expect
      .poll(async () => (await loadEffectiveContext(request, {})).source)
      .toBe("active-session");
    await expect
      .poll(async () => (await loadEffectiveContext(request, {})).provider.id)
      .toBe(sessionProviderId);

    const sessionEffectiveContext = await loadEffectiveContext(request, {});
    expect(sessionEffectiveContext.activeWorkspaceId).toBe(workspaceId);
    expect(sessionEffectiveContext.activeSessionId).toBe(sessionId);
    expect(sessionEffectiveContext.promptTemplate.id).toBe(sessionPromptId);
    expect(sessionEffectiveContext.skill.id).toBe(sessionSkillId);

    await postProxyCompletion(request, sessionModel);

    await expect
      .poll(() => findCapturedRequest(upstream.capturedRequests, sessionModel)?.headers["x-cc-switch-web-context-source"] ?? null)
      .toBe("active-session");
    await expect
      .poll(() => findCapturedRequest(upstream.capturedRequests, sessionModel)?.headers["x-cc-switch-web-context-provider"] ?? null)
      .toBe(sessionProviderId);

    const capturedSessionRequest = findCapturedRequest(upstream.capturedRequests, sessionModel);
    expect(capturedSessionRequest?.headers["x-cc-switch-web-workspace"]).toBe(workspaceId);
    expect(capturedSessionRequest?.headers["x-cc-switch-web-session"]).toBe(sessionId);
    expect(capturedSessionRequest?.headers["x-cc-switch-web-context-prompt"]).toBe(sessionPromptId);
    expect(capturedSessionRequest?.headers["x-cc-switch-web-context-skill"]).toBe(sessionSkillId);
    expect(extractSystemInstruction(capturedSessionRequest)).toContain(sessionPromptMarker);
    expect(extractSystemInstruction(capturedSessionRequest)).toContain(sessionSkillMarker);

    await expect
      .poll(async () => {
        const pageData = await loadRequestLogs(request, {
          appCode: "codex",
          sessionId,
          limit: 10
        });
        return pageData.items[0]?.id ?? null;
      })
      .not.toBeNull();

    const sessionLogPage = await loadRequestLogs(request, {
      appCode: "codex",
      sessionId,
      limit: 10
    });
    const sessionRequestLog = sessionLogPage.items[0];
    expect(sessionRequestLog?.providerId).toBe(sessionProviderId);
    expect(sessionRequestLog?.workspaceId).toBe(workspaceId);
    expect(sessionRequestLog?.sessionId).toBe(sessionId);
    expect(sessionRequestLog?.contextSource).toBe("active-session");
    expect(sessionRequestLog?.promptTemplateId).toBe(sessionPromptId);
    expect(sessionRequestLog?.skillId).toBe(sessionSkillId);

    const sessionUsageRecords = await loadUsageRecords(request, {
      appCode: "codex",
      providerId: sessionProviderId,
      model: sessionModel,
      limit: 10
    });
    expect(sessionUsageRecords.items[0]?.requestLogId).toBe(sessionRequestLog?.id ?? null);

    const sessionRuntimeDetail = await loadSessionRuntimeDetail(request, sessionId);
    expect(sessionRuntimeDetail.isActive).toBeTruthy();
    expect(sessionRuntimeDetail.recentRequestLogs.some((item) => item.id === sessionRequestLog?.id)).toBeTruthy();
    expect(sessionRuntimeDetail.modelBreakdown.some((item) => item.model === sessionModel)).toBeTruthy();
    expect(sessionRuntimeDetail.resolvedContext.provider.id).toBe(sessionProviderId);
    expect(sessionRuntimeDetail.resolvedContext.promptTemplate.id).toBe(sessionPromptId);
    expect(sessionRuntimeDetail.resolvedContext.skill.id).toBe(sessionSkillId);

    await expect(page.getByTestId(`session-runtime-effective-provider-${sessionId}`)).toContainText(sessionProviderId);
    await expect(page.getByTestId(`session-runtime-effective-prompt-${sessionId}`)).toContainText(sessionPromptId);
    await expect(page.getByTestId(`session-runtime-effective-skill-${sessionId}`)).toContainText(sessionSkillId);
  } finally {
    const request = page.context().request;
    const currentCodexBinding = await loadBindingByAppCode(request, "codex");

    if (originalCodexBinding !== null) {
      const needsRestore =
        currentCodexBinding?.id !== originalCodexBinding.id ||
        currentCodexBinding.providerId !== originalCodexBinding.providerId ||
        currentCodexBinding.mode !== originalCodexBinding.mode ||
        currentCodexBinding.promptTemplateId !== originalCodexBinding.promptTemplateId ||
        currentCodexBinding.skillId !== originalCodexBinding.skillId;

      if (needsRestore) {
        const response = await request.post("/api/v1/app-bindings", {
          data: originalCodexBinding
        });
        expect(response.ok()).toBeTruthy();
      }
    } else if (currentCodexBinding !== null) {
      await deleteBinding(request, currentCodexBinding.id);
    }

    if (originalActiveContext?.activeSessionId !== null) {
      const response = await request.post("/api/v1/active-context/session", {
        data: {
          sessionId: originalActiveContext.activeSessionId
        }
      });
      expect(response.ok()).toBeTruthy();
    } else if (originalActiveContext?.activeWorkspaceId !== null) {
      const clearSessionResponse = await request.post("/api/v1/active-context/session", {
        data: {
          sessionId: null
        }
      });
      expect(clearSessionResponse.ok()).toBeTruthy();

      const restoreWorkspaceResponse = await request.post("/api/v1/active-context/workspace", {
        data: {
          workspaceId: originalActiveContext.activeWorkspaceId
        }
      });
      expect(restoreWorkspaceResponse.ok()).toBeTruthy();
    } else if (originalActiveContext !== null) {
      const clearWorkspaceResponse = await request.post("/api/v1/active-context/workspace", {
        data: {
          workspaceId: null
        }
      });
      expect(clearWorkspaceResponse.ok()).toBeTruthy();
    }

    if (originalProxyPolicy !== null) {
      await saveProxyPolicy(request, originalProxyPolicy);
    }
    await upstream.close();
  }
});
