import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureDashboardAdvancedTargetVisible } from "./support/advanced-panels.js";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";
const EDITOR_SELECTION_PREFIX = "cc-switch-web.dashboard.editor-selection";
const ISO_TIME = "2026-03-28T10:00:00.000Z";

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

const setEditorSelection = async (
  page: Page,
  kind: "workspace" | "session" | "prompt-template" | "skill",
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

const confirmDangerIfVisible = async (page: Page, testId: string): Promise<void> => {
  const checkbox = page.getByTestId(testId);
  if (await checkbox.isVisible()) {
    await checkbox.check();
  }
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

const upsertPrompt = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly appCode: "codex";
    readonly content: string;
    readonly enabled: boolean;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/prompts", {
    data: {
      ...payload,
      locale: "zh-CN",
      tags: ["browser"]
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertSkill = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly appCode: "codex";
    readonly promptTemplateId: string | null;
    readonly content: string;
    readonly enabled: boolean;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/skills", {
    data: {
      ...payload,
      tags: ["browser"]
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
    readonly appCode: "codex";
    readonly defaultProviderId: string | null;
    readonly defaultPromptTemplateId: string | null;
    readonly defaultSkillId: string | null;
    readonly enabled: boolean;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/workspaces", {
    data: {
      ...payload,
      tags: ["browser"]
    }
  });
  expect(response.ok()).toBeTruthy();
};

const upsertSession = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly workspaceId: string | null;
    readonly appCode: "codex";
    readonly title: string;
    readonly cwd: string;
    readonly providerId: string | null;
    readonly promptTemplateId: string | null;
    readonly skillId: string | null;
    readonly status: "active" | "archived";
  }
): Promise<void> => {
  const response = await request.post("/api/v1/sessions", {
    data: {
      ...payload,
      startedAt: ISO_TIME
    }
  });
  expect(response.ok()).toBeTruthy();
};

test("workspace editor keeps preview, save echo, and bootstrap reload in sync", async ({
  page
}) => {
  const request = page.context().request;
  const workspacePreviewStatuses: number[] = [];
  const workspaceId = "pw-workspace-shared";
  const providerId = "pw-workspace-provider";

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/workspaces/preview") {
      workspacePreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertProvider(request, {
    id: providerId,
    name: "Playwright Workspace Provider",
    baseUrl: "https://playwright-workspace-provider.example.com/v1"
  });
  await upsertWorkspace(request, {
    id: workspaceId,
    name: "Playwright Workspace",
    rootPath: "/tmp/pw-workspace-shared",
    appCode: "codex",
    defaultProviderId: providerId,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    enabled: true
  });
  await upsertSession(request, {
    id: "pw-workspace-session",
    workspaceId,
    appCode: "codex",
    title: "Workspace Session",
    cwd: "/tmp/pw-workspace-shared",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active"
  });

  await setEditorSelection(page, "workspace", workspaceId);
  await page.reload();
  await ensureAssetFormsVisible(page);

  const workspaceIdInput = page.getByTestId("workspace-id-input");
  const workspaceEnabledCheckbox = page.getByTestId("workspace-enabled-checkbox");
  const workspaceSaveButton = page.getByTestId("workspace-save-button");
  const workspacePreview = page.getByTestId("workspace-preview");

  await expect(workspaceIdInput).toHaveValue(workspaceId);
  await expect(workspacePreview).toContainText("1");

  const previewCountBeforeChange = workspacePreviewStatuses.length;
  await workspaceEnabledCheckbox.uncheck();

  await expect
    .poll(() => workspacePreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200))
    .toBe(true);
  await expect(workspacePreview).toContainText(workspaceId);
  await confirmDangerIfVisible(page, "workspace-danger-confirm");
  await expect(workspaceSaveButton).toBeEnabled();

  await workspaceSaveButton.click();

  await expect(page.getByRole("heading", { name: /工作区已保存|Workspace Saved/ })).toBeVisible();
  expect(workspacePreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureAssetFormsVisible(page);

  await expect(workspaceIdInput).toHaveValue(workspaceId);
  await expect(workspaceEnabledCheckbox).not.toBeChecked();
  await expect(workspacePreview).toContainText(workspaceId);
});

test("session editor keeps preview, save echo, and bootstrap reload in sync", async ({
  page
}) => {
  const request = page.context().request;
  const sessionPreviewStatuses: number[] = [];
  const workspaceId = "pw-session-workspace";
  const sessionId = "pw-session-shared";

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/sessions/preview") {
      sessionPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertWorkspace(request, {
    id: workspaceId,
    name: "Session Workspace",
    rootPath: "/tmp/pw-session-workspace",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    enabled: true
  });
  await upsertSession(request, {
    id: sessionId,
    workspaceId,
    appCode: "codex",
    title: "Playwright Session",
    cwd: "/tmp/pw-session-workspace",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active"
  });

  await setEditorSelection(page, "session", sessionId);
  await page.reload();
  await ensureAssetFormsVisible(page);

  const sessionIdInput = page.getByTestId("session-id-input");
  const sessionStatusSelect = page.getByTestId("session-status-select");
  const sessionSaveButton = page.getByTestId("session-save-button");
  const sessionPreview = page.getByTestId("session-preview");

  await expect(sessionIdInput).toHaveValue(sessionId);
  await expect(sessionStatusSelect).toHaveValue("active");
  await expect(sessionPreview).toContainText(/Enabled|启用/);

  const previewCountBeforeChange = sessionPreviewStatuses.length;
  await sessionStatusSelect.selectOption("archived");

  await expect
    .poll(() => sessionPreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200))
    .toBe(true);
  await expect(sessionSaveButton).toBeEnabled();
  expect(sessionPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await sessionSaveButton.click();

  await expect(page.getByRole("heading", { name: /会话已保存|Session Saved/ })).toBeVisible();

  await page.reload();
  await ensureAssetFormsVisible(page);

  await expect(sessionIdInput).toHaveValue(sessionId);
  await expect(sessionStatusSelect).toHaveValue("archived");
  await expect(sessionPreview).toContainText(/Enabled|启用/);
});

test("prompt editor keeps preview, save echo, and bootstrap reload in sync", async ({
  page
}) => {
  const request = page.context().request;
  const promptPreviewStatuses: number[] = [];
  const promptId = "pw-prompt-shared";
  const linkedSkillId = "pw-prompt-linked-skill";

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/prompts/preview") {
      promptPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertPrompt(request, {
    id: promptId,
    name: "Playwright Prompt",
    appCode: "codex",
    content: "请先确认预览链路。",
    enabled: true
  });
  await upsertSkill(request, {
    id: linkedSkillId,
    name: "Prompt Linked Skill",
    appCode: "codex",
    promptTemplateId: promptId,
    content: "Prompt linked skill content",
    enabled: true
  });

  await setEditorSelection(page, "prompt-template", promptId);
  await page.reload();
  await ensureAssetFormsVisible(page);

  const promptIdInput = page.getByTestId("prompt-id-input");
  const promptEnabledCheckbox = page.getByTestId("prompt-enabled-checkbox");
  const promptSaveButton = page.getByTestId("prompt-save-button");
  const promptPreview = page.getByTestId("prompt-preview");

  await expect(promptIdInput).toHaveValue(promptId);
  await expect(promptPreview).toContainText(linkedSkillId);

  const previewCountBeforeChange = promptPreviewStatuses.length;
  await promptEnabledCheckbox.uncheck();

  await expect
    .poll(() => promptPreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200))
    .toBe(true);
  await expect(promptPreview).toContainText(linkedSkillId);
  await expect(promptPreview).toContainText(promptId);
  await confirmDangerIfVisible(page, "prompt-danger-confirm");
  await expect(promptSaveButton).toBeEnabled();

  await promptSaveButton.click();

  await expect(page.getByRole("heading", { name: /Prompt 已保存|Prompt Saved/ })).toBeVisible();
  expect(promptPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureAssetFormsVisible(page);

  await expect(promptIdInput).toHaveValue(promptId);
  await expect(promptEnabledCheckbox).not.toBeChecked();
  await expect(promptPreview).toContainText(linkedSkillId);
});

test("skill editor keeps preview, save echo, and bootstrap reload in sync", async ({
  page
}) => {
  const request = page.context().request;
  const skillPreviewStatuses: number[] = [];
  const promptId = "pw-skill-prompt";
  const skillId = "pw-skill-shared";
  const linkedWorkspaceId = "pw-skill-linked-workspace";

  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname === "/api/v1/skills/preview") {
      skillPreviewStatuses.push(response.status());
    }
  });

  await loginToDashboard(page);

  await upsertPrompt(request, {
    id: promptId,
    name: "Playwright Skill Prompt",
    appCode: "codex",
    content: "请先确认 Skill 预览。",
    enabled: true
  });
  await upsertSkill(request, {
    id: skillId,
    name: "Playwright Skill",
    appCode: "codex",
    promptTemplateId: promptId,
    content: "Skill content",
    enabled: true
  });
  await upsertWorkspace(request, {
    id: linkedWorkspaceId,
    name: "Skill Linked Workspace",
    rootPath: "/tmp/pw-skill-linked-workspace",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: skillId,
    enabled: true
  });

  await setEditorSelection(page, "skill", skillId);
  await page.reload();
  await ensureAssetFormsVisible(page);

  const skillIdInput = page.getByTestId("skill-id-input");
  const skillEnabledCheckbox = page.getByTestId("skill-enabled-checkbox");
  const skillSaveButton = page.getByTestId("skill-save-button");
  const skillPreview = page.getByTestId("skill-preview");

  await expect(skillIdInput).toHaveValue(skillId);
  await expect(skillPreview).toContainText(linkedWorkspaceId);

  const previewCountBeforeChange = skillPreviewStatuses.length;
  await skillEnabledCheckbox.uncheck();

  await expect
    .poll(() => skillPreviewStatuses.slice(previewCountBeforeChange).some((status) => status === 200))
    .toBe(true);
  await expect(skillPreview).toContainText(linkedWorkspaceId);
  await confirmDangerIfVisible(page, "skill-danger-confirm");
  await expect(skillSaveButton).toBeEnabled();

  await skillSaveButton.click();

  await expect(page.getByRole("heading", { name: /Skill 已保存|Skill Saved/ })).toBeVisible();
  expect(skillPreviewStatuses.every((status) => status < 500)).toBeTruthy();

  await page.reload();
  await ensureAssetFormsVisible(page);

  await expect(skillIdInput).toHaveValue(skillId);
  await expect(skillEnabledCheckbox).not.toBeChecked();
  await expect(skillPreview).toContainText(linkedWorkspaceId);
});
