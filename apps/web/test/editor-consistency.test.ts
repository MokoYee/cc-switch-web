import assert from "node:assert/strict";
import test from "node:test";

import type {
  AppQuota,
  AppQuotaUpsert,
  AppBinding,
  AppBindingUpsert,
  AppMcpBinding,
  AppMcpBindingUpsert,
  FailoverChain,
  FailoverChainUpsert,
  McpServer,
  McpServerUpsert,
  PromptTemplate,
  Provider,
  ProviderUpsert,
  ProxyPolicy,
  SessionRecord,
  Skill,
  Workspace
} from "@cc-switch-web/shared";

import {
  buildAppQuotaEditorState,
  buildBindingEditorState,
  buildFailoverEditorState,
  buildMcpBindingEditorState,
  buildMcpServerEditorState,
  buildProviderEditorState,
  buildPromptTemplateEditorState,
  buildSessionEditorState,
  buildSkillEditorState,
  buildMcpServerEditorInput,
  buildMcpServerEditorSignature,
  buildPreviewSignature,
  buildWorkspaceEditorState,
  createDefaultAppQuotaForm,
  createDefaultBindingForm,
  createDefaultFailoverForm,
  createDefaultPromptTemplateForm,
  createDefaultProviderForm,
  createDefaultSessionForm,
  createDefaultSkillForm,
  createDefaultWorkspaceForm,
  formatJsonRecord,
  formatTagsText,
  isPreviewInSync,
  normalizeTagText,
  parseJsonRecord,
  resolveProxyPolicyFormFromBootstrap,
  resolveDeleteEditorResetPlan,
  resolveVersionedEditorSyncPlan,
  syncBindingFormWithBootstrap,
  syncFailoverFormWithBootstrap,
  syncMcpBindingFormWithBootstrap,
  withNormalizedTags
} from "../src/features/dashboard/lib/editorConsistency.js";
import {
  buildArchiveStaleSessionsFollowUpNotice,
  buildAssetGovernanceRepairFollowUpNotice,
  buildBatchMcpGovernanceAppliedFollowUpNotice,
  buildConfigImportedFollowUpNotice,
  buildDeleteCompletedFollowUpNotice,
  buildForegroundHostTakeoversRolledBackFollowUpNotice,
  buildHostTakeoverAppliedFollowUpNotice,
  buildMcpGovernanceRepairFollowUpNotice,
  buildPromptSavedFollowUpNotice,
  buildPromptHostImportedFollowUpNotice,
  buildPromptHostSyncAppliedFollowUpNotice,
  buildProjectIntakeConvergedFollowUpNotice,
  buildProjectIntakeStableFollowUpNotice,
  buildProviderRecoveredFollowUpNotice,
  buildProxyPolicySavedFollowUpNotice,
  buildSessionDiscoveryFollowUpNotice,
  buildSnapshotRestoredFollowUpNotice,
  buildWorkspaceDiscoveryBatchImportedFollowUpNotice,
  buildWorkspaceDiscoveryImportedFollowUpNotice,
  buildWorkspaceSavedFollowUpNotice
} from "../src/features/dashboard/lib/dashboardFollowUp.js";
import { createDashboardOrchestrationActions } from "../src/features/dashboard/hooks/dashboardOrchestrationActions.js";
import {
  buildPromptTemplateSaveInput,
  buildPromptTemplateVersionedEditorEcho,
  buildSkillSaveInput,
  buildSkillVersionedEditorEcho,
  buildWorkspaceSaveInput
} from "../src/features/dashboard/lib/editorPersistence.js";
import {
  buildPromptTemplatePreviewState,
  buildSkillPreviewState,
  buildWorkspacePreviewState,
  isPromptTemplateEditorStateInSync,
  isPromptTemplatePreviewInSync,
  isSkillEditorStateInSync,
  isSkillPreviewInSync,
  isWorkspaceEditorStateInSync,
  isWorkspacePreviewInSync
} from "../src/features/dashboard/lib/previewConsistency.js";
import type { DashboardSnapshot } from "../src/shared/lib/api.js";

const ISO_TIME = "2026-03-28T10:00:00.000Z";

const createProvider = (id: string): Provider => ({
  id,
  name: id,
  providerType: "openai-compatible",
  baseUrl: `https://${id}.example.com/v1`,
  apiKeyMasked: "sk-***",
  enabled: true,
  timeoutMs: 30000,
  createdAt: ISO_TIME,
  updatedAt: ISO_TIME
});

const createBinding = (
  input: Pick<AppBinding, "id" | "appCode" | "providerId" | "mode">
): AppBinding => ({
  ...input,
  promptTemplateId: null,
  skillId: null,
  updatedAt: ISO_TIME
});

const createAppQuota = (
  input: Pick<AppQuota, "id" | "appCode" | "enabled" | "period" | "maxRequests" | "maxTokens">
): AppQuota => ({
  ...input,
  updatedAt: ISO_TIME
});

const createMcpServer = (id: string): McpServer => ({
  id,
  name: id,
  transport: "stdio",
  command: "npx",
  args: [],
  url: null,
  env: {},
  headers: {},
  enabled: true,
  createdAt: ISO_TIME,
  updatedAt: ISO_TIME
});

const createMcpBinding = (
  input: Pick<AppMcpBinding, "id" | "appCode" | "serverId" | "enabled">
): AppMcpBinding => ({
  ...input,
  updatedAt: ISO_TIME
});

const createFailoverChain = (
  input: Pick<
    FailoverChain,
    "id" | "appCode" | "enabled" | "providerIds" | "cooldownSeconds" | "maxAttempts"
  >
): FailoverChain => ({
  ...input,
  updatedAt: ISO_TIME
});

const createPromptTemplate = (
  input: Pick<PromptTemplate, "id" | "name" | "appCode" | "locale" | "content" | "tags" | "enabled">
): PromptTemplate => ({
  ...input,
  updatedAt: ISO_TIME
});

const createSkill = (
  input: Pick<Skill, "id" | "name" | "appCode" | "promptTemplateId" | "content" | "tags" | "enabled">
): Skill => ({
  ...input,
  updatedAt: ISO_TIME
});

const createWorkspace = (
  input: Pick<
    Workspace,
    | "id"
    | "name"
    | "rootPath"
    | "appCode"
    | "defaultProviderId"
    | "defaultPromptTemplateId"
    | "defaultSkillId"
    | "tags"
    | "enabled"
  >
): Workspace => ({
  ...input,
  updatedAt: ISO_TIME
});

const createSessionRecord = (
  input: Pick<
    SessionRecord,
    | "id"
    | "workspaceId"
    | "appCode"
    | "title"
    | "cwd"
    | "providerId"
    | "promptTemplateId"
    | "skillId"
    | "status"
    | "startedAt"
  >
): SessionRecord => ({
  ...input,
  updatedAt: ISO_TIME
});

const createDeleteResetPlanInput = () => ({
  providerFormId: "provider-a",
  bindingFormId: "binding-codex",
  appQuotaFormId: "quota-codex",
  failoverFormId: "failover-codex",
  promptTemplateFormId: "prompt-review",
  skillFormId: "skill-review",
  workspaceFormId: "workspace-api",
  sessionFormId: "session-api",
  editingMcpServerId: "mcp-filesystem",
  editingMcpBindingId: "binding-mcp-codex"
});

const createDispatchRecorder = <T>(initialValue: T) => {
  let currentValue = initialValue;
  const calls: T[] = [];
  const dispatch = (value: T | ((current: T) => T)) => {
    currentValue = typeof value === "function" ? (value as (current: T) => T)(currentValue) : value;
    calls.push(currentValue);
  };

  return {
    calls,
    dispatch
  };
};

const createStableDashboardSnapshot = (): DashboardSnapshot =>
  ({
    workspaceDiscovery: [],
    sessionGovernance: {
      staleSessionIds: []
    },
    activeContext: {
      activeWorkspaceId: "workspace-api",
      activeSessionId: null,
      workspaceContext: {
        effectiveAppCode: "codex"
      },
      sessionContext: null
    }
  }) as DashboardSnapshot;

test("marks preview as current only when editor input still matches the preview signature", () => {
  const providerForm: ProviderUpsert = {
    id: "provider-b",
    name: "Provider B",
    providerType: "openai-compatible",
    baseUrl: "https://provider-b.example.com/v1",
    apiKey: "sk-live",
    enabled: true,
    timeoutMs: 45000
  };
  const preview = {
    providerId: "provider-b"
  };
  const signature = buildPreviewSignature(providerForm);

  assert.equal(isPreviewInSync(preview, signature, providerForm), true);
  assert.equal(
    isPreviewInSync(preview, signature, {
      ...providerForm,
      timeoutMs: 60000
    }),
    false
  );
});

test("keeps the saved binding provider in the editor after bootstrap refresh instead of falling back to the first provider", () => {
  const current: AppBindingUpsert = {
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-b",
    mode: "managed",
    promptTemplateId: null,
    skillId: null
  };
  const providers = [createProvider("provider-a"), createProvider("provider-b")];
  const bindings = [
    createBinding({
      id: "binding-codex",
      appCode: "codex",
      providerId: "provider-b",
      mode: "managed"
    })
  ];

  const synced = syncBindingFormWithBootstrap(current, bindings, providers);

  assert.equal(synced.providerId, "provider-b");
  assert.equal(synced.mode, "managed");
});

test("falls back to the first available provider only when the current binding target no longer exists", () => {
  const current: AppBindingUpsert = {
    id: "binding-codex-draft",
    appCode: "codex",
    providerId: "provider-stale",
    mode: "managed",
    promptTemplateId: null,
    skillId: null
  };
  const providers = [createProvider("provider-a"), createProvider("provider-b")];

  const synced = syncBindingFormWithBootstrap(current, [], providers);

  assert.equal(synced.providerId, "provider-a");
  assert.equal(synced.id, "binding-codex-draft");
});

test("keeps the saved MCP binding server in the editor after bootstrap refresh", () => {
  const current: AppMcpBindingUpsert = {
    id: "codex-filesystem",
    appCode: "codex",
    serverId: "server-b",
    enabled: true
  };
  const servers = [createMcpServer("server-a"), createMcpServer("server-b")];
  const bindings = [
    createMcpBinding({
      id: "codex-filesystem",
      appCode: "codex",
      serverId: "server-b",
      enabled: true
    })
  ];

  const synced = syncMcpBindingFormWithBootstrap(current, bindings, servers);

  assert.equal(synced.serverId, "server-b");
});

test("prefers the saved failover chain from bootstrap and otherwise filters removed providers from drafts", () => {
  const current: FailoverChainUpsert = {
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-stale", "provider-b"],
    cooldownSeconds: 30,
    maxAttempts: 2
  };
  const providers = [createProvider("provider-a"), createProvider("provider-b")];

  const draftSynced = syncFailoverFormWithBootstrap(current, [], providers);
  assert.deepEqual(draftSynced.providerIds, ["provider-b"]);

  const savedSynced = syncFailoverFormWithBootstrap(
    current,
    [
      createFailoverChain({
        id: "failover-codex",
        appCode: "codex",
        enabled: true,
        providerIds: ["provider-b", "provider-a"],
        cooldownSeconds: 45,
        maxAttempts: 3
      })
    ],
    providers
  );

  assert.deepEqual(savedSynced.providerIds, ["provider-b", "provider-a"]);
  assert.equal(savedSynced.cooldownSeconds, 45);
  assert.equal(savedSynced.maxAttempts, 3);
});

test("echoes the saved proxy policy from bootstrap back into the editor", () => {
  const savedPolicy: ProxyPolicy = {
    listenHost: "127.0.0.1",
    listenPort: 8799,
    enabled: true,
    requestTimeoutMs: 45000,
    failureThreshold: 5
  };

  const synced = resolveProxyPolicyFormFromBootstrap({
    payload: {
      proxyPolicy: savedPolicy
    }
  });

  assert.deepEqual(synced, savedPolicy);
});

test("resets the current deleted editor and clears dependent version state", () => {
  const promptPlan = resolveDeleteEditorResetPlan({
    ...createDeleteResetPlanInput(),
    kind: "prompt-template",
    deletedId: "prompt-review"
  });

  assert.equal(promptPlan.resetPromptTemplate, true);
  assert.equal(promptPlan.clearPromptTemplateVersions, true);
  assert.equal(promptPlan.resetSkill, false);
  assert.equal(promptPlan.resetMcpServer, false);

  const mcpServerPlan = resolveDeleteEditorResetPlan({
    ...createDeleteResetPlanInput(),
    kind: "mcp-server",
    deletedId: "mcp-filesystem"
  });

  assert.equal(mcpServerPlan.resetMcpServer, true);
  assert.equal(mcpServerPlan.resetMcpBinding, false);
  assert.equal(mcpServerPlan.resetPromptTemplate, false);
});

test("keeps the current editor intact when another item is deleted", () => {
  const plan = resolveDeleteEditorResetPlan({
    ...createDeleteResetPlanInput(),
    kind: "workspace",
    deletedId: "workspace-other"
  });

  assert.deepEqual(plan, {
    resetProvider: false,
    resetBinding: false,
    resetAppQuota: false,
    resetFailover: false,
    resetPromptTemplate: false,
    clearPromptTemplateVersions: false,
    resetSkill: false,
    clearSkillVersions: false,
    resetWorkspace: false,
    resetSession: false,
    resetMcpServer: false,
    resetMcpBinding: false
  });
});

test("only refreshes versioned asset editors when the persisted item matches the current editor", () => {
  assert.deepEqual(resolveVersionedEditorSyncPlan("prompt-review", "prompt-review"), {
    syncCurrentEditor: true,
    refreshVersions: true
  });

  assert.deepEqual(resolveVersionedEditorSyncPlan("prompt-review", "prompt-other"), {
    syncCurrentEditor: false,
    refreshVersions: false
  });
});

test("builds versioned asset editor echoes only for the active editor", () => {
  const promptItem = createPromptTemplate({
    id: "prompt-review",
    name: "Review",
    appCode: "codex",
    locale: "zh-CN",
    content: "请检查回归风险。",
    tags: ["review", "backend"],
    enabled: true
  });

  assert.deepEqual(
    buildPromptTemplateVersionedEditorEcho("prompt-review", promptItem),
    {
      editorState: {
        form: {
          id: "prompt-review",
          name: "Review",
          appCode: "codex",
          locale: "zh-CN",
          content: "请检查回归风险。",
          tags: ["review", "backend"],
          enabled: true
        },
        tagsText: "review, backend"
      },
      refreshVersions: true
    }
  );

  assert.deepEqual(buildPromptTemplateVersionedEditorEcho("prompt-other", promptItem), {
    editorState: null,
    refreshVersions: false
  });

  const skillItem = createSkill({
    id: "skill-review",
    name: "Review Skill",
    appCode: "codex",
    promptTemplateId: "prompt-review",
    content: "遵循 Prompt 审查。",
    tags: ["review", "critical"],
    enabled: true
  });

  assert.deepEqual(
    buildSkillVersionedEditorEcho("skill-review", skillItem),
    {
      editorState: {
        form: {
          id: "skill-review",
          name: "Review Skill",
          appCode: "codex",
          promptTemplateId: "prompt-review",
          content: "遵循 Prompt 审查。",
          tags: ["review", "critical"],
          enabled: true
        },
        tagsText: "review, critical"
      },
      refreshVersions: true
    }
  );

  assert.deepEqual(buildSkillVersionedEditorEcho("skill-other", skillItem), {
    editorState: null,
    refreshVersions: false
  });
});

test("builds saved follow-up notices from dedicated builders without losing action routing", () => {
  const workspaceNotice = buildWorkspaceSavedFollowUpNotice(
    "zh-CN",
    createWorkspace({
      id: "workspace-api",
      name: "API",
      rootPath: "/srv/api",
      appCode: "codex",
      defaultProviderId: null,
      defaultPromptTemplateId: null,
      defaultSkillId: null,
      tags: ["backend"],
      enabled: true
    })
  );

  assert.equal(workspaceNotice.title, "工作区已保存");
  assert.deepEqual(workspaceNotice.actions, [
    {
      id: "workspace-follow-runtime",
      label: "打开工作区运行态",
      kind: "workspace-runtime",
      workspaceId: "workspace-api",
      appCode: "codex"
    },
    {
      id: "workspace-follow-logs",
      label: "查看工作区请求",
      kind: "workspace-logs",
      workspaceId: "workspace-api",
      appCode: "codex"
    },
    {
      id: "workspace-follow-assets",
      label: "返回上下文资产",
      kind: "section",
      section: "assets"
    }
  ]);

  const promptNotice = buildPromptSavedFollowUpNotice(
    "en-US",
    createPromptTemplate({
      id: "prompt-review",
      name: "Review",
      appCode: "codex",
      locale: "zh-CN",
      content: "请检查回归风险。",
      tags: ["review"],
      enabled: true
    })
  );

  assert.equal(promptNotice.title, "Prompt Saved");
  assert.equal(promptNotice.actions[0]?.kind, "app-logs");
  assert.equal(promptNotice.actions[1]?.kind, "section");

  const proxyNotice = buildProxyPolicySavedFollowUpNotice("en-US");
  assert.equal(proxyNotice.title, "Proxy Policy Saved");
  assert.deepEqual(proxyNotice.actions, [
    {
      id: "proxy-follow-traffic",
      label: "Open Traffic Panel",
      kind: "section",
      section: "traffic"
    },
    {
      id: "proxy-follow-recovery",
      label: "Open Recovery",
      kind: "section",
      section: "recovery"
    }
  ]);
});

test("builds discovery and intake follow-up notices with stable action routing", () => {
  const sessionNotice = buildSessionDiscoveryFollowUpNotice("zh-CN", {
    activate: false,
    createdWorkspace: true,
    session: {
      id: "session-api",
      appCode: "codex"
    },
    workspace: {
      id: "workspace-api",
      appCode: "codex"
    }
  });

  assert.equal(sessionNotice.title, "会话已自动建档");
  assert.match(sessionNotice.summary, /自动补齐工作区和会话建档/);
  assert.equal(sessionNotice.actions[2]?.kind, "app-logs");

  const stableNotice = buildProjectIntakeStableFollowUpNotice("en-US");
  assert.equal(stableNotice.title, "Project Intake Queue Stable");
  assert.deepEqual(stableNotice.actions, [
    {
      id: "project-intake-stable-assets",
      label: "Back To Context Resources",
      kind: "section",
      section: "assets"
    },
    {
      id: "project-intake-stable-runtime",
      label: "Open Runtime",
      kind: "section",
      section: "runtime"
    }
  ]);

  const convergedNotice = buildProjectIntakeConvergedFollowUpNotice("zh-CN", {
    category: "workspace",
    summary: "已完成项目接入收敛。",
    actions: stableNotice.actions
  });
  assert.equal(convergedNotice.title, "项目接入收敛已执行");
  assert.deepEqual(convergedNotice.actions, stableNotice.actions);

  const importedWorkspaceNotice = buildWorkspaceDiscoveryImportedFollowUpNotice("zh-CN", {
    item: {
      id: "workspace-api",
      appCode: "codex"
    },
    linkedSessionCount: 2,
    firstLinkedSessionId: "session-api"
  });
  assert.match(importedWorkspaceNotice.summary, /自动挂回 2 个历史会话/);
  assert.equal(importedWorkspaceNotice.actions[1]?.kind, "session-runtime");

  const batchNotice = buildWorkspaceDiscoveryBatchImportedFollowUpNotice("en-US", {
    importedCount: 0,
    linkedSessionCount: 0
  });
  assert.match(batchNotice.summary, /already aligned/);

  const archiveNotice = buildArchiveStaleSessionsFollowUpNotice("en-US", 3);
  assert.match(archiveNotice.summary, /3 stale session/);
});

test("builds governance and host sync notices with branch-specific summaries", () => {
  const mcpBatchNotice = buildBatchMcpGovernanceAppliedFollowUpNotice("zh-CN", {
    repairedAppCount: 2,
    hostSyncRequiredAppCount: 1
  });
  assert.match(mcpBatchNotice.summary, /仍需要继续做宿主机同步/);

  const mcpRepairNotice = buildMcpGovernanceRepairFollowUpNotice("en-US", {
    appCode: "codex",
    requiresHostSync: true
  });
  assert.equal(mcpRepairNotice.actions[2]?.kind, "app-logs");
  assert.match(mcpRepairNotice.summary, /may still need to be synced/);

  const promptImportNotice = buildPromptHostImportedFollowUpNotice("en-US", {
    appCode: "claude-code",
    matchedExisting: true
  });
  assert.match(promptImportNotice.summary, /no duplicate prompt was created/);

  const promptSyncNotice = buildPromptHostSyncAppliedFollowUpNotice("zh-CN", {
    appCode: "codex",
    ignoredSkillId: "skill-review"
  });
  assert.match(promptSyncNotice.summary, /关联 Skill 仍保持代理侧注入/);

  const deleteNotice = buildDeleteCompletedFollowUpNotice("en-US", "mcp-server");
  assert.deepEqual(deleteNotice.actions, [
    {
      id: "delete-follow-mcp-server",
      label: "Back To MCP",
      kind: "section",
      section: "mcp"
    },
    {
      id: "delete-follow-recovery-mcp-server",
      label: "Open Recovery",
      kind: "section",
      section: "recovery"
    }
  ]);
});

test("builds runtime, host takeover, and recovery notices without losing special-case actions", () => {
  const providerNotice = buildProviderRecoveredFollowUpNotice("en-US", "provider-a");
  assert.equal(providerNotice.actions[0]?.kind, "provider-runtime");
  assert.equal(providerNotice.actions[2]?.kind, "section");

  const claudeTakeoverNotice = buildHostTakeoverAppliedFollowUpNotice("zh-CN", "claude-code");
  assert.match(claudeTakeoverNotice.summary, /初次安装确认已被跳过/);

  const foregroundRollbackNotice = buildForegroundHostTakeoversRolledBackFollowUpNotice("zh-CN", {
    rolledBackAppCount: 2,
    failedAppCount: 1
  });
  assert.match(foregroundRollbackNotice.summary, /人工检查宿主机文件与备份/);

  const assetNotice = buildAssetGovernanceRepairFollowUpNotice("en-US", {
    appCode: "codex",
    repairedItems: 1,
    remainingManualItems: 0
  });
  assert.equal(assetNotice.actions[2]?.kind, "app-logs");

  const configNotice = buildConfigImportedFollowUpNotice("zh-CN");
  assert.equal(configNotice.actions[0]?.section, "recovery");

  const snapshotNotice = buildSnapshotRestoredFollowUpNotice("en-US");
  assert.equal(snapshotNotice.title, "Snapshot Restored");
});

test("orchestration delete resets the active prompt editor and emits the correct delete follow-up", async () => {
  const providerFormRecorder = createDispatchRecorder(createDefaultProviderForm());
  const bindingFormRecorder = createDispatchRecorder(createDefaultBindingForm());
  const appQuotaFormRecorder = createDispatchRecorder(createDefaultAppQuotaForm());
  const failoverFormRecorder = createDispatchRecorder(createDefaultFailoverForm());
  const workspaceFormRecorder = createDispatchRecorder(createDefaultWorkspaceForm());
  const workspaceTagsRecorder = createDispatchRecorder("");
  const sessionFormRecorder = createDispatchRecorder(createDefaultSessionForm());
  const promptTemplateFormRecorder = createDispatchRecorder({
    ...createDefaultPromptTemplateForm(),
    id: "prompt-review",
    tags: ["review", "critical"]
  });
  const promptTagsRecorder = createDispatchRecorder("review, critical");
  const promptVersionsRecorder = createDispatchRecorder([{ versionNumber: 1 }] as unknown[]);
  const skillFormRecorder = createDispatchRecorder(createDefaultSkillForm());
  const skillTagsRecorder = createDispatchRecorder("");
  const skillVersionsRecorder = createDispatchRecorder([{ versionNumber: 1 }] as unknown[]);

  const followUpNotices: unknown[] = [];
  const auditCalls: unknown[] = [];
  const pendingDeleteValues: unknown[] = [];
  const deleteCalls: Array<{ kind: string; id: string }> = [];
  let resetMcpServerCalled = false;
  let resetMcpBindingCalled = false;
  let pendingTask: Promise<void> | null = null;

  const actions = createDashboardOrchestrationActions({
    locale: "zh-CN",
    t: (key) => key,
    runAction: (task) => {
      pendingTask = task();
    },
    setFollowUpNotice: (value) => {
      followUpNotices.push(value);
    },
    executeDelete: async (kind, id) => {
      deleteCalls.push({ kind, id });
    },
    openAuditFocus: (filters) => {
      auditCalls.push(filters);
    },
    loadDeleteReview: () => undefined,
    dashboardSnapshot: null,
    editingMcpServerId: "mcp-filesystem",
    editingMcpBindingId: "binding-mcp-codex",
    providerForm: createDefaultProviderForm(),
    bindingForm: createDefaultBindingForm(),
    appQuotaForm: createDefaultAppQuotaForm(),
    failoverForm: createDefaultFailoverForm(),
    promptTemplateForm: promptTemplateFormRecorder.calls[0] ?? {
      ...createDefaultPromptTemplateForm(),
      id: "prompt-review",
      tags: ["review", "critical"]
    },
    skillForm: createDefaultSkillForm(),
    workspaceForm: createDefaultWorkspaceForm(),
    sessionForm: createDefaultSessionForm(),
    setPendingDeleteReview: (value) => {
      pendingDeleteValues.push(value);
    },
    setBindingForm: bindingFormRecorder.dispatch,
    setAppQuotaForm: appQuotaFormRecorder.dispatch,
    setFailoverForm: failoverFormRecorder.dispatch,
    setWorkspaceForm: workspaceFormRecorder.dispatch,
    setWorkspaceTagsText: workspaceTagsRecorder.dispatch,
    setSessionForm: sessionFormRecorder.dispatch,
    setProviderForm: providerFormRecorder.dispatch,
    setPromptTemplateForm: promptTemplateFormRecorder.dispatch,
    setPromptTagsText: promptTagsRecorder.dispatch,
    setPromptTemplateVersions: promptVersionsRecorder.dispatch as never,
    setSkillForm: skillFormRecorder.dispatch,
    setSkillTagsText: skillTagsRecorder.dispatch,
    setSkillVersions: skillVersionsRecorder.dispatch as never,
    resetMcpServerEditor: () => {
      resetMcpServerCalled = true;
    },
    resetMcpBindingEditor: () => {
      resetMcpBindingCalled = true;
    }
  });

  actions.commonActions.confirmDelete("prompt-template", "prompt-review");
  await pendingTask;

  assert.deepEqual(deleteCalls, [{ kind: "prompt-template", id: "prompt-review" }]);
  assert.deepEqual(auditCalls, [{ source: "proxy-request" }]);
  assert.deepEqual(pendingDeleteValues, [null]);
  assert.deepEqual(promptTemplateFormRecorder.calls.at(-1), createDefaultPromptTemplateForm());
  assert.deepEqual(promptTagsRecorder.calls.at(-1), formatTagsText(createDefaultPromptTemplateForm().tags));
  assert.deepEqual(promptVersionsRecorder.calls.at(-1), []);
  assert.equal(resetMcpServerCalled, false);
  assert.equal(resetMcpBindingCalled, false);
  assert.deepEqual(followUpNotices.at(-1), buildDeleteCompletedFollowUpNotice("zh-CN", "prompt-template"));
});

test("orchestration project intake convergence emits the stable notice when no action is needed", async () => {
  const followUpNotices: unknown[] = [];

  const actions = createDashboardOrchestrationActions({
    locale: "en-US",
    t: (key) => key,
    runAction: () => undefined,
    setFollowUpNotice: (value) => {
      followUpNotices.push(value);
    },
    executeDelete: async () => undefined,
    openAuditFocus: () => undefined,
    loadDeleteReview: () => undefined,
    dashboardSnapshot: createStableDashboardSnapshot(),
    editingMcpServerId: null,
    editingMcpBindingId: null,
    providerForm: createDefaultProviderForm(),
    bindingForm: createDefaultBindingForm(),
    appQuotaForm: createDefaultAppQuotaForm(),
    failoverForm: createDefaultFailoverForm(),
    promptTemplateForm: createDefaultPromptTemplateForm(),
    skillForm: createDefaultSkillForm(),
    workspaceForm: createDefaultWorkspaceForm(),
    sessionForm: createDefaultSessionForm(),
    setPendingDeleteReview: () => undefined,
    setBindingForm: () => undefined,
    setAppQuotaForm: () => undefined,
    setFailoverForm: () => undefined,
    setWorkspaceForm: () => undefined,
    setWorkspaceTagsText: () => undefined,
    setSessionForm: () => undefined,
    setProviderForm: () => undefined,
    setPromptTemplateForm: () => undefined,
    setPromptTagsText: () => undefined,
    setPromptTemplateVersions: () => undefined,
    setSkillForm: () => undefined,
    setSkillTagsText: () => undefined,
    setSkillVersions: () => undefined,
    resetMcpServerEditor: () => undefined,
    resetMcpBindingEditor: () => undefined
  });

  await actions.runProjectIntakeConvergence();

  assert.deepEqual(followUpNotices, [buildProjectIntakeStableFollowUpNotice("en-US")]);
});

test("normalizes tag text into the same payload shape used by preview and save", () => {
  assert.deepEqual(normalizeTagText(" review, backend , ,critical "), [
    "review",
    "backend",
    "critical"
  ]);

  const promptForm = {
    id: "prompt-review",
    name: "Review",
    appCode: "codex" as const,
    locale: "zh-CN" as const,
    content: "请检查回归风险。",
    tags: [],
    enabled: true
  };

  assert.deepEqual(withNormalizedTags(promptForm, " review, backend "), {
    ...promptForm,
    tags: ["review", "backend"]
  });

  assert.deepEqual(buildPromptTemplateSaveInput(promptForm, " review, backend "), {
    ...promptForm,
    tags: ["review", "backend"]
  });

  const skillForm = {
    id: "skill-review",
    name: "Review Skill",
    appCode: "codex" as const,
    promptTemplateId: "prompt-review",
    content: "遵循 Prompt 审查。",
    tags: [],
    enabled: true
  };

  assert.deepEqual(buildSkillSaveInput(skillForm, " review, critical "), {
    ...skillForm,
    tags: ["review", "critical"]
  });

  const workspaceForm = {
    id: "workspace-api",
    name: "API Service",
    rootPath: "/srv/api",
    appCode: "codex" as const,
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  };

  assert.deepEqual(buildWorkspaceSaveInput(workspaceForm, " backend, critical "), {
    ...workspaceForm,
    tags: ["backend", "critical"]
  });
});

test("keeps prompt, skill, and workspace preview state aligned across draft input, save echo, and bootstrap reload", () => {
  const promptDraft = {
    id: "prompt-review",
    name: "Review",
    appCode: "codex" as const,
    locale: "zh-CN" as const,
    content: "请检查回归风险。",
    tags: [],
    enabled: true
  };
  const promptPreviewState = buildPromptTemplatePreviewState(promptDraft, " review, backend ");
  assert.deepEqual(promptPreviewState.saveInput, {
    ...promptDraft,
    tags: ["review", "backend"]
  });
  assert.equal(
    isPromptTemplatePreviewInSync(
      promptPreviewState.saveInput,
      promptPreviewState.previewSignature,
      promptDraft,
      " review, backend "
    ),
    true
  );
  assert.equal(
    isPromptTemplateEditorStateInSync(
      promptPreviewState.previewSignature,
      createPromptTemplate({
        id: "prompt-review",
        name: "Review",
        appCode: "codex",
        locale: "zh-CN",
        content: "请检查回归风险。",
        tags: ["review", "backend"],
        enabled: true
      })
    ),
    true
  );
  assert.equal(
    isPromptTemplateEditorStateInSync(
      promptPreviewState.previewSignature,
      {
        ...createPromptTemplate({
          id: "prompt-review",
          name: "Review",
          appCode: "codex",
          locale: "zh-CN",
          content: "请检查回归风险。",
          tags: ["review", "backend"],
          enabled: true
        }),
        updatedAt: "2026-03-29T10:00:00.000Z"
      }
    ),
    true
  );
  assert.equal(
    isPromptTemplateEditorStateInSync(
      promptPreviewState.previewSignature,
      createPromptTemplate({
        id: "prompt-review",
        name: "Review",
        appCode: "codex",
        locale: "zh-CN",
        content: "内容已漂移",
        tags: ["review", "backend"],
        enabled: true
      })
    ),
    false
  );

  const skillDraft = {
    id: "skill-review",
    name: "Review Skill",
    appCode: "codex" as const,
    promptTemplateId: "prompt-review",
    content: "遵循 Prompt 审查。",
    tags: [],
    enabled: true
  };
  const skillPreviewState = buildSkillPreviewState(skillDraft, " review, critical ");
  assert.deepEqual(skillPreviewState.saveInput, {
    ...skillDraft,
    tags: ["review", "critical"]
  });
  assert.equal(
    isSkillPreviewInSync(
      skillPreviewState.saveInput,
      skillPreviewState.previewSignature,
      skillDraft,
      " review, critical "
    ),
    true
  );
  assert.equal(
    isSkillEditorStateInSync(
      skillPreviewState.previewSignature,
      createSkill({
        id: "skill-review",
        name: "Review Skill",
        appCode: "codex",
        promptTemplateId: "prompt-review",
        content: "遵循 Prompt 审查。",
        tags: ["review", "critical"],
        enabled: true
      })
    ),
    true
  );
  assert.equal(
    isSkillEditorStateInSync(
      skillPreviewState.previewSignature,
      {
        ...createSkill({
          id: "skill-review",
          name: "Review Skill",
          appCode: "codex",
          promptTemplateId: "prompt-review",
          content: "遵循 Prompt 审查。",
          tags: ["review", "critical"],
          enabled: true
        }),
        updatedAt: "2026-03-29T10:00:00.000Z"
      }
    ),
    true
  );

  const workspaceDraft = {
    id: "workspace-api",
    name: "API Service",
    rootPath: "/srv/api",
    appCode: "codex" as const,
    defaultProviderId: "provider-a",
    defaultPromptTemplateId: "prompt-review",
    defaultSkillId: "skill-review",
    tags: [],
    enabled: true
  };
  const workspacePreviewState = buildWorkspacePreviewState(workspaceDraft, " backend, critical ");
  assert.deepEqual(workspacePreviewState.saveInput, {
    ...workspaceDraft,
    tags: ["backend", "critical"]
  });
  assert.equal(
    isWorkspacePreviewInSync(
      workspacePreviewState.saveInput,
      workspacePreviewState.previewSignature,
      workspaceDraft,
      " backend, critical "
    ),
    true
  );
  assert.equal(
    isWorkspaceEditorStateInSync(
      workspacePreviewState.previewSignature,
      createWorkspace({
        id: "workspace-api",
        name: "API Service",
        rootPath: "/srv/api",
        appCode: "codex",
        defaultProviderId: "provider-a",
        defaultPromptTemplateId: "prompt-review",
        defaultSkillId: "skill-review",
        tags: ["backend", "critical"],
        enabled: true
      })
    ),
    true
  );
  assert.equal(
    isWorkspaceEditorStateInSync(
      workspacePreviewState.previewSignature,
      {
        ...createWorkspace({
          id: "workspace-api",
          name: "API Service",
          rootPath: "/srv/api",
          appCode: "codex",
          defaultProviderId: "provider-a",
          defaultPromptTemplateId: "prompt-review",
          defaultSkillId: "skill-review",
          tags: ["backend", "critical"],
          enabled: true
        }),
        updatedAt: "2026-03-29T10:00:00.000Z"
      }
    ),
    true
  );
});

test("rebuilds saved asset editor state so forms and tag text echo the persisted result", () => {
  assert.deepEqual(
    buildBindingEditorState(
      createBinding({
        id: "binding-codex",
        appCode: "codex",
        providerId: "provider-a",
        mode: "managed"
      })
    ),
    {
      id: "binding-codex",
      appCode: "codex",
      providerId: "provider-a",
      mode: "managed",
      promptTemplateId: null,
      skillId: null
    } satisfies AppBindingUpsert
  );

  assert.deepEqual(
    buildAppQuotaEditorState(
      createAppQuota({
        id: "quota-codex-day",
        appCode: "codex",
        enabled: true,
        period: "day",
        maxRequests: 1000,
        maxTokens: 200000
      })
    ),
    {
      id: "quota-codex-day",
      appCode: "codex",
      enabled: true,
      period: "day",
      maxRequests: 1000,
      maxTokens: 200000
    } satisfies AppQuotaUpsert
  );

  assert.deepEqual(
    buildFailoverEditorState(
      createFailoverChain({
        id: "failover-codex",
        appCode: "codex",
        enabled: true,
        providerIds: ["provider-b", "provider-a"],
        cooldownSeconds: 45,
        maxAttempts: 3
      })
    ),
    {
      id: "failover-codex",
      appCode: "codex",
      enabled: true,
      providerIds: ["provider-b", "provider-a"],
      cooldownSeconds: 45,
      maxAttempts: 3
    }
  );

  assert.deepEqual(buildProviderEditorState(createProvider("provider-a")), {
    id: "provider-a",
    name: "provider-a",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "",
    apiKeyMasked: "sk-***",
    enabled: true,
    timeoutMs: 30000
  });

  assert.deepEqual(
    buildPromptTemplateEditorState(
      createPromptTemplate({
        id: "prompt-review",
        name: "Review",
        appCode: "codex",
        locale: "zh-CN",
        content: "请检查回归风险。",
        tags: ["review", "backend"],
        enabled: true
      })
    ),
    {
      form: {
        id: "prompt-review",
        name: "Review",
        appCode: "codex",
        locale: "zh-CN",
        content: "请检查回归风险。",
        tags: ["review", "backend"],
        enabled: true
      },
      tagsText: "review, backend"
    }
  );

  assert.deepEqual(
    buildSkillEditorState(
      createSkill({
        id: "skill-review",
        name: "Review Skill",
        appCode: "codex",
        promptTemplateId: "prompt-review",
        content: "遵循 Prompt 审查。",
        tags: ["review", "critical"],
        enabled: true
      })
    ),
    {
      form: {
        id: "skill-review",
        name: "Review Skill",
        appCode: "codex",
        promptTemplateId: "prompt-review",
        content: "遵循 Prompt 审查。",
        tags: ["review", "critical"],
        enabled: true
      },
      tagsText: "review, critical"
    }
  );

  assert.deepEqual(
    buildWorkspaceEditorState(
      createWorkspace({
        id: "workspace-api",
        name: "API",
        rootPath: "/srv/api",
        appCode: "codex",
        defaultProviderId: "provider-a",
        defaultPromptTemplateId: "prompt-review",
        defaultSkillId: "skill-review",
        tags: ["backend", "critical"],
        enabled: true
      })
    ),
    {
      form: {
        id: "workspace-api",
        name: "API",
        rootPath: "/srv/api",
        appCode: "codex",
        defaultProviderId: "provider-a",
        defaultPromptTemplateId: "prompt-review",
        defaultSkillId: "skill-review",
        tags: ["backend", "critical"],
        enabled: true
      },
      tagsText: "backend, critical"
    }
  );

  assert.deepEqual(
    buildSessionEditorState(
      createSessionRecord({
        id: "session-api",
        workspaceId: "workspace-api",
        appCode: "codex",
        title: "API Session",
        cwd: "/srv/api",
        providerId: "provider-a",
        promptTemplateId: "prompt-review",
        skillId: "skill-review",
        status: "active",
        startedAt: ISO_TIME
      })
    ),
    {
      id: "session-api",
      workspaceId: "workspace-api",
      appCode: "codex",
      title: "API Session",
      cwd: "/srv/api",
      providerId: "provider-a",
      promptTemplateId: "prompt-review",
      skillId: "skill-review",
      status: "active",
      startedAt: ISO_TIME
    }
  );

  const savedMcpServer: McpServer = {
    ...createMcpServer("filesystem"),
    transport: "http",
    command: null,
    args: ["ignored-by-http"],
    url: "https://mcp.example.com",
    env: {
      ZETA: "2",
      ALPHA: "1"
    },
    headers: {
      "x-zeta": "2",
      "x-alpha": "1"
    }
  };

  assert.deepEqual(buildMcpServerEditorState(savedMcpServer), {
    form: {
      id: "filesystem",
      name: "filesystem",
      transport: "http",
      command: null,
      args: ["ignored-by-http"],
      url: "https://mcp.example.com",
      env: {
        ZETA: "2",
        ALPHA: "1"
      },
      headers: {
        "x-zeta": "2",
        "x-alpha": "1"
      },
      enabled: true
    },
    envText: '{\n  "ALPHA": "1",\n  "ZETA": "2"\n}',
    headersText: '{\n  "x-alpha": "1",\n  "x-zeta": "2"\n}'
  });

  assert.deepEqual(
    buildMcpBindingEditorState(
      createMcpBinding({
        id: "codex-filesystem",
        appCode: "codex",
        serverId: "filesystem",
        enabled: true
      })
    ),
    {
      id: "codex-filesystem",
      appCode: "codex",
      serverId: "filesystem",
      enabled: true
    } satisfies AppMcpBindingUpsert
  );

  assert.equal(formatTagsText(["review", "backend"]), "review, backend");
});

test("builds MCP server preview/save input from normalized JSON semantics instead of raw editor text", () => {
  const serverForm: McpServerUpsert = {
    id: "filesystem",
    name: "Filesystem",
    transport: "http",
    command: "npx",
    args: ["ignored"],
    url: "https://mcp.example.com",
    env: {},
    headers: {},
    enabled: true
  };

  assert.deepEqual(
    buildMcpServerEditorInput(
      serverForm,
      '{ "B": "2", "A": 1 }',
      '{ "X-Test": true, "Authorization": "Bearer token" }'
    ),
    {
      ...serverForm,
      command: null,
      env: {
        A: "1",
        B: "2"
      },
      headers: {
        Authorization: "Bearer token",
        "X-Test": "true"
      }
    }
  );
});

test("treats MCP server JSON formatting-only edits as in-sync because preview and save share one semantic signature", () => {
  const serverForm: McpServerUpsert = {
    id: "filesystem",
    name: "Filesystem",
    transport: "stdio",
    command: "npx",
    args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
    url: "https://ignored.example.com",
    env: {},
    headers: {},
    enabled: true
  };

  const firstSignature = buildMcpServerEditorSignature(
    serverForm,
    '{ "B": "2", "A": "1" }',
    '{ "X-Test": "ok", "Authorization": "Bearer token" }'
  );
  const secondSignature = buildMcpServerEditorSignature(
    serverForm,
    '{\n  "A": "1",\n  "B": "2"\n}',
    '{\n  "Authorization": "Bearer token",\n  "X-Test": "ok"\n}'
  );

  assert.equal(firstSignature, secondSignature);
  assert.equal(
    isPreviewInSync(
      { serverId: "filesystem" },
      firstSignature,
      buildMcpServerEditorInput(
        serverForm,
        '{\n  "A": "1",\n  "B": "2"\n}',
        '{\n  "Authorization": "Bearer token",\n  "X-Test": "ok"\n}'
      )
    ),
    true
  );
});

test("keeps MCP save echo in sync when the editor is rebuilt from the persisted server result", () => {
  const draftForm: McpServerUpsert = {
    id: "filesystem",
    name: "Filesystem",
    transport: "http",
    command: "npx",
    args: ["should-clear"],
    url: "https://mcp.example.com",
    env: {},
    headers: {},
    enabled: true
  };
  const envText = '{ "ZETA": "2", "ALPHA": "1" }';
  const headersText = '{ "x-zeta": "2", "x-alpha": "1" }';
  const previewInput = buildMcpServerEditorInput(draftForm, envText, headersText);
  const previewSignature = buildMcpServerEditorSignature(draftForm, envText, headersText);
  const savedEditorState = buildMcpServerEditorState({
    ...createMcpServer("filesystem"),
    name: "Filesystem",
    transport: "http",
    command: null,
    args: ["should-clear"],
    url: "https://mcp.example.com",
    env: {
      ALPHA: "1",
      ZETA: "2"
    },
    headers: {
      "x-alpha": "1",
      "x-zeta": "2"
    }
  });

  const echoedInput = buildMcpServerEditorInput(
    savedEditorState.form,
    savedEditorState.envText,
    savedEditorState.headersText
  );

  assert.deepEqual(echoedInput, previewInput);
  assert.equal(
    isPreviewInSync({ serverId: "filesystem" }, previewSignature, echoedInput),
    true
  );
});

test("formats MCP server records into stable editor JSON and rejects non-object JSON", () => {
  assert.deepEqual(parseJsonRecord('{ "ROOT_PATH": "/tmp", "DEBUG": false }'), {
    ROOT_PATH: "/tmp",
    DEBUG: "false"
  });
  assert.equal(
    formatJsonRecord({
      Z_KEY: "z",
      A_KEY: "a"
    }),
    '{\n  "A_KEY": "a",\n  "Z_KEY": "z"\n}'
  );
  assert.throws(() => parseJsonRecord('["bad"]'), /JSON object expected/);
});

test("tag text changes participate in preview consistency through normalized save payloads", () => {
  const workspaceForm = {
    id: "workspace-api",
    name: "API Service",
    rootPath: "/srv/api",
    appCode: "codex" as const,
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  };
  const normalizedInput = withNormalizedTags(workspaceForm, "backend, critical");
  const signature = buildPreviewSignature(normalizedInput);

  assert.equal(isPreviewInSync({ workspaceId: "workspace-api" }, signature, normalizedInput), true);
  assert.equal(
    isPreviewInSync(
      { workspaceId: "workspace-api" },
      signature,
      withNormalizedTags(workspaceForm, "backend, hotfix")
    ),
    false
  );
});
