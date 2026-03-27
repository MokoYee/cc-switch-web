import {
  assetGovernancePreviewSchema,
  assetGovernanceRepairResultSchema,
  appMcpBindingSchema,
  type AssetGovernancePreview,
  type AssetGovernanceRepairResult,
  type AppMcpBinding,
  type AppMcpBindingUpsert,
  type AuditEvent,
  auditEventPageSchema,
  type AppBinding,
  appBindingRoutingPreviewSchema,
  type AppBindingUpsert,
  type AppQuota,
  type AppQuotaSavePreview,
  type AppQuotaStatus,
  type AppQuotaUpsert,
  type AuditEventPage,
  type AuditEventQuery,
  type ConfigSnapshot,
  type ConfigDeletePreview,
  type ConfigSnapshotDiff,
  type ConfigImportPreview,
  type ConfigRestorePreview,
  type ConfigSnapshotSummary,
  type ContextRoutingExplanation,
  type ControlAuthRotateResult,
  type ControlAuthRuntimeView,
  contextFailureBreakdownSchema,
  contextModelBreakdownSchema,
  contextProviderBreakdownSchema,
  dashboardBootstrapSchema,
  type DashboardBootstrap,
  exportPackageSchema,
  type ExportPackage,
  type FailoverChain,
  failoverChainRoutingPreviewSchema,
  type FailoverChainUpsert,
  type HostCliDiscovery,
  type HostCliApplyPreview,
  hostMcpSyncCapabilitySchema,
  type HostMcpSyncCapability,
  type McpAppRuntimeView,
  type McpHostSyncState,
  type McpHostSyncPreview,
  type McpHostSyncBatchPreview,
  type McpHostSyncBatchResult,
  type HostMcpSyncResult,
  type HostIntegrationEvent,
  type HostCliMutationResult,
  type McpBindingSavePreview,
  type McpGovernanceBatchPreview,
  type McpGovernanceBatchResult,
  type McpGovernanceRepairPreview,
  type McpGovernanceRepairResult,
  type McpImportOptions,
  type McpImportPreview,
  type McpServerSavePreview,
  type McpServer,
  mcpServerSchema,
  type McpServerUpsert,
  type PromptTemplate,
  type PromptTemplateSavePreview,
  type PromptTemplateUpsert,
  type PromptTemplateVersion,
  quickContextAssetApplyResultSchema,
  quickContextAssetPreviewSchema,
  quickOnboardingApplyResultSchema,
  quickOnboardingPreviewSchema,
  type ProviderDiagnostic,
  providerDiagnosticDetailSchema,
  type ProviderDiagnosticDetail,
  providerRoutingPreviewSchema,
  type ProviderRoutingPreview,
  type ProviderHealthEvent,
  type ProxyRequestLog,
  type ProxyRequestLogPage,
  proxyRequestLogPageSchema,
  type ProxyRequestLogQuery,
  type ProviderUpsert,
  type QuickOnboardingApplyInput,
  type QuickOnboardingApplyResult,
  type QuickContextAssetApplyResult,
  type QuickContextAssetInput,
  type QuickContextAssetPreview,
  type QuickOnboardingPreview,
  type QuickOnboardingPreviewInput,
  type AppBindingRoutingPreview,
  type Provider,
  type ProxyPolicy,
  type ProxyPolicySavePreview,
  type PromptHostImportPreview,
  type PromptHostImportResult,
  type PromptHostSyncCapability,
  type PromptHostSyncBatchPreview,
  type PromptHostSyncBatchResult,
  type PromptHostSyncPreview,
  type PromptHostSyncResult,
  type PromptHostSyncState,
  runtimeContextOverviewSchema,
  type RuntimeContextOverview,
  type SessionRuntimeDetail,
  sessionRuntimeDetailSchema,
  type ActiveContextState,
  type EffectiveAppContext,
  type ResolvedSessionContext,
  type ResolvedWorkspaceContext,
  type SessionArchiveResult,
  type SessionEnsureInput,
  type SessionEnsureResult,
  type SessionRecord,
  type SessionSavePreview,
  type SessionGovernanceStatus,
  type SessionRecordUpsert,
  type Skill,
  type SkillSavePreview,
  type SkillUpsert,
  type SkillVersion,
  type SystemMetadata,
  systemServiceDoctorSchema,
  type SystemServiceDoctor,
  systemServiceMutationResultSchema,
  type SystemServiceMutationResult,
  usageRecordPageSchema,
  type UsageRecordPage,
  type UsageRecordQuery,
  usageTimeseriesSchema,
  type UsageTimeseries,
  type UsageTimeseriesQuery,
  usageSummarySchema,
  type UsageSummary,
  type WorkspaceRuntimeDetail,
  type Workspace,
  type WorkspaceSavePreview,
  workspaceRuntimeDetailSchema,
  type WorkspaceDiscoveryImport,
  type WorkspaceDiscoveryBatchImport,
  type WorkspaceDiscoveryBatchImportResult,
  type WorkspaceDiscoveryImportResult,
  type WorkspaceDiscoveryItem,
  type WorkspaceUpsert,
  type FailoverChainRoutingPreview,
} from "@cc-switch-web/shared";

declare global {
  interface Window {
    AICLI_SWITCH_API_BASE_URL?: string;
  }
}

const CONTROL_TOKEN_STORAGE_KEY = "ai-cli-switch.control-token";

const resolveApiBaseUrl = (): string =>
  window.AICLI_SWITCH_API_BASE_URL ?? import.meta.env.VITE_AICLI_SWITCH_API_BASE_URL ?? "http://127.0.0.1:8787";

export class UnauthorizedApiError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export const readStoredControlToken = (): string | null =>
  window.localStorage.getItem(CONTROL_TOKEN_STORAGE_KEY);

export const writeStoredControlToken = (token: string): void => {
  window.localStorage.setItem(CONTROL_TOKEN_STORAGE_KEY, token);
};

const readJson = async <T>(path: string): Promise<T> => {
  return requestJson<T>(path, { method: "GET" });
};

const requestJson = async <T>(
  path: string,
  init: RequestInit
): Promise<T> => {
  const token = readStoredControlToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const body = (await response.json()) as { message?: string };
      if (typeof body.message === "string" && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // 非 JSON 响应保留状态码即可。
    }

    throw new ApiRequestError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

const writeJson = async <T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown
): Promise<T> =>
  requestJson<T>(path, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

const deleteJson = async <T>(path: string): Promise<T> =>
  requestJson<T>(path, { method: "DELETE" });

export type DashboardSnapshot = DashboardBootstrap;
export type {
  QuickOnboardingApplyInput,
  QuickOnboardingApplyResult,
  QuickOnboardingPreview,
  QuickOnboardingPreviewInput
};

export const DASHBOARD_REQUEST_LOG_PREVIEW_LIMIT = 20;
export const DASHBOARD_AUDIT_PREVIEW_LIMIT = 20;
export const DASHBOARD_USAGE_PREVIEW_LIMIT = 20;

export const loadDashboardSnapshot = async (): Promise<DashboardSnapshot> =>
  dashboardBootstrapSchema.parse(
    await readJson<DashboardBootstrap>("/api/v1/dashboard/bootstrap")
  );

export const rotateControlAuthToken = async (): Promise<ControlAuthRotateResult> =>
  writeJson<ControlAuthRotateResult>("/api/v1/system/control-auth/rotate", "POST", {});

export const syncSystemServiceEnv = async (): Promise<SystemServiceMutationResult> => {
  const result = await writeJson<SystemServiceMutationResult>("/api/v1/system/service/sync-env", "POST", {});
  return systemServiceMutationResultSchema.parse(result);
};

export const installSystemUserService = async (): Promise<SystemServiceMutationResult> => {
  const result = await writeJson<SystemServiceMutationResult>("/api/v1/system/service/install", "POST", {});
  return systemServiceMutationResultSchema.parse(result);
};

const toQueryString = (query: Record<string, string | number | undefined>): string => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
};

export const saveProvider = async (input: ProviderUpsert): Promise<void> => {
  await writeJson("/api/v1/providers", "POST", input);
};

export const previewQuickOnboarding = async (
  input: QuickOnboardingPreviewInput
): Promise<QuickOnboardingPreview> => {
  const result = await writeJson<{ item: QuickOnboardingPreview }>(
    "/api/v1/onboarding/quick-start/preview",
    "POST",
    input
  );
  return quickOnboardingPreviewSchema.parse(result.item);
};

export const applyQuickOnboarding = async (
  input: QuickOnboardingApplyInput
): Promise<QuickOnboardingApplyResult> => {
  const result = await writeJson<{ item: QuickOnboardingApplyResult }>(
    "/api/v1/onboarding/quick-start/apply",
    "POST",
    input
  );
  return quickOnboardingApplyResultSchema.parse(result.item);
};

export const previewQuickContextAsset = async (
  input: QuickContextAssetInput
): Promise<QuickContextAssetPreview> => {
  const result = await writeJson<{ item: QuickContextAssetPreview }>(
    "/api/v1/onboarding/quick-context/preview",
    "POST",
    input
  );
  return quickContextAssetPreviewSchema.parse(result.item);
};

export const applyQuickContextAsset = async (
  input: QuickContextAssetInput
): Promise<QuickContextAssetApplyResult> => {
  const result = await writeJson<{ item: QuickContextAssetApplyResult }>(
    "/api/v1/onboarding/quick-context/apply",
    "POST",
    input
  );
  return quickContextAssetApplyResultSchema.parse(result.item);
};

export const previewProviderUpsert = async (
  input: ProviderUpsert
): Promise<ProviderRoutingPreview> => {
  const result = await writeJson<{ item: ProviderRoutingPreview }>(
    "/api/v1/providers/preview",
    "POST",
    input
  );
  return providerRoutingPreviewSchema.parse(result.item);
};

export const savePromptTemplate = async (input: PromptTemplateUpsert): Promise<void> => {
  await writeJson("/api/v1/prompts", "POST", input);
};

export const previewPromptTemplateUpsert = async (
  input: PromptTemplateUpsert
): Promise<PromptTemplateSavePreview> => {
  const result = await writeJson<{ item: PromptTemplateSavePreview }>(
    "/api/v1/prompts/preview",
    "POST",
    input
  );
  return result.item;
};

export const loadPromptTemplateVersions = async (
  id: string
): Promise<PromptTemplateVersion[]> => {
  const result = await readJson<{ items: PromptTemplateVersion[] }>(
    `/api/v1/prompts/${encodeURIComponent(id)}/versions`
  );
  return result.items;
};

export const restorePromptTemplateVersion = async (
  id: string,
  versionNumber: number
): Promise<void> => {
  await writeJson(
    `/api/v1/prompts/${encodeURIComponent(id)}/restore/${versionNumber}`,
    "POST",
    {}
  );
};

export const deletePromptTemplate = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/prompts/${encodeURIComponent(id)}`);
};

export const previewDeletePromptTemplate = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/prompts/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const saveSkill = async (input: SkillUpsert): Promise<void> => {
  await writeJson("/api/v1/skills", "POST", input);
};

export const previewSkillUpsert = async (
  input: SkillUpsert
): Promise<SkillSavePreview> => {
  const result = await writeJson<{ item: SkillSavePreview }>(
    "/api/v1/skills/preview",
    "POST",
    input
  );
  return result.item;
};

export const loadSkillVersions = async (id: string): Promise<SkillVersion[]> => {
  const result = await readJson<{ items: SkillVersion[] }>(
    `/api/v1/skills/${encodeURIComponent(id)}/versions`
  );
  return result.items;
};

export const restoreSkillVersion = async (
  id: string,
  versionNumber: number
): Promise<void> => {
  await writeJson(
    `/api/v1/skills/${encodeURIComponent(id)}/restore/${versionNumber}`,
    "POST",
    {}
  );
};

export const deleteSkill = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/skills/${encodeURIComponent(id)}`);
};

export const previewDeleteSkill = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/skills/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const previewAssetGovernance = async (
  appCode?: AppBinding["appCode"]
): Promise<AssetGovernancePreview> => {
  const result = await readJson<{ item: AssetGovernancePreview }>(
    appCode === undefined
      ? "/api/v1/assets/governance/preview-all"
      : `/api/v1/assets/governance/${encodeURIComponent(appCode)}/preview`
  );
  return assetGovernancePreviewSchema.parse(result.item);
};

export const applyAssetGovernanceRepair = async (
  appCode?: AppBinding["appCode"]
): Promise<AssetGovernanceRepairResult> => {
  const result = await writeJson<{ item: AssetGovernanceRepairResult }>(
    appCode === undefined
      ? "/api/v1/assets/governance/repair-all"
      : `/api/v1/assets/governance/${encodeURIComponent(appCode)}/repair`,
    "POST",
    {}
  );
  return assetGovernanceRepairResultSchema.parse(result.item);
};

export const saveWorkspace = async (input: WorkspaceUpsert): Promise<void> => {
  await writeJson("/api/v1/workspaces", "POST", input);
};

export const previewWorkspaceUpsert = async (
  input: WorkspaceUpsert
): Promise<WorkspaceSavePreview> => {
  const result = await writeJson<{ item: WorkspaceSavePreview }>(
    "/api/v1/workspaces/preview",
    "POST",
    input
  );
  return result.item;
};

export const importWorkspaceDiscoveryItem = async (
  input: WorkspaceDiscoveryImport
): Promise<WorkspaceDiscoveryImportResult> => {
  return writeJson<WorkspaceDiscoveryImportResult>("/api/v1/workspace-discovery/import", "POST", input);
};

export const importWorkspaceDiscoveryItems = async (
  input: WorkspaceDiscoveryBatchImport
): Promise<WorkspaceDiscoveryBatchImportResult & { readonly snapshotVersion: number }> => {
  return writeJson<WorkspaceDiscoveryBatchImportResult & { readonly snapshotVersion: number }>(
    "/api/v1/workspace-discovery/import-batch",
    "POST",
    input
  );
};

export const deleteWorkspace = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/workspaces/${encodeURIComponent(id)}`);
};

export const previewDeleteWorkspace = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/workspaces/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const saveSessionRecord = async (input: SessionRecordUpsert): Promise<void> => {
  await writeJson("/api/v1/sessions", "POST", input);
};

export const previewSessionRecordUpsert = async (
  input: SessionRecordUpsert
): Promise<SessionSavePreview> => {
  const result = await writeJson<{ item: SessionSavePreview }>(
    "/api/v1/sessions/preview",
    "POST",
    input
  );
  return result.item;
};

export const deleteSessionRecord = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/sessions/${encodeURIComponent(id)}`);
};

export const previewDeleteSessionRecord = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/sessions/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const archiveSessionRecord = async (id: string): Promise<SessionArchiveResult> => {
  const result = await writeJson<SessionArchiveResult>(
    `/api/v1/sessions/${encodeURIComponent(id)}/archive`,
    "POST",
    {}
  );
  return result;
};

export const ensureSessionRecord = async (
  input: SessionEnsureInput
): Promise<SessionEnsureResult> => {
  return writeJson<SessionEnsureResult>("/api/v1/sessions/ensure", "POST", input);
};

export const archiveStaleSessionRecords = async (limit?: number): Promise<SessionArchiveResult> => {
  const result = await writeJson<SessionArchiveResult>("/api/v1/sessions/archive-stale", "POST", {
    ...(limit === undefined ? {} : { limit })
  });
  return result;
};

export const activateWorkspace = async (workspaceId: string | null): Promise<void> => {
  await writeJson("/api/v1/active-context/workspace", "POST", { workspaceId });
};

export const activateSession = async (sessionId: string | null): Promise<void> => {
  await writeJson("/api/v1/active-context/session", "POST", { sessionId });
};

export const saveBinding = async (input: AppBindingUpsert): Promise<void> => {
  await writeJson("/api/v1/app-bindings", "POST", input);
};

export const previewBindingUpsert = async (
  input: AppBindingUpsert
): Promise<AppBindingRoutingPreview> => {
  const result = await writeJson<{ item: AppBindingRoutingPreview }>(
    "/api/v1/app-bindings/preview",
    "POST",
    input
  );
  return appBindingRoutingPreviewSchema.parse(result.item);
};

export const saveAppQuota = async (input: AppQuotaUpsert): Promise<void> => {
  await writeJson("/api/v1/app-quotas", "POST", input);
};

export const previewAppQuotaUpsert = async (
  input: AppQuotaUpsert
): Promise<AppQuotaSavePreview> => {
  const result = await writeJson<{ item: AppQuotaSavePreview }>(
    "/api/v1/app-quotas/preview",
    "POST",
    input
  );
  return result.item;
};

export const saveFailoverChain = async (input: FailoverChainUpsert): Promise<void> => {
  await writeJson("/api/v1/failover-chains", "POST", input);
};

export const previewFailoverChainUpsert = async (
  input: FailoverChainUpsert
): Promise<FailoverChainRoutingPreview> => {
  const result = await writeJson<{ item: FailoverChainRoutingPreview }>(
    "/api/v1/failover-chains/preview",
    "POST",
    input
  );
  return failoverChainRoutingPreviewSchema.parse(result.item);
};

export const saveMcpServer = async (input: McpServerUpsert): Promise<void> => {
  await writeJson("/api/v1/mcp/servers", "POST", input);
};

export const deleteMcpServer = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/mcp/servers/${encodeURIComponent(id)}`);
};

export const previewDeleteMcpServer = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/mcp/servers/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const previewMcpServerUpsert = async (
  input: McpServerUpsert
): Promise<McpServerSavePreview> => {
  const result = await writeJson<{ item: McpServerSavePreview }>(
    "/api/v1/mcp/servers/preview",
    "POST",
    input
  );
  return result.item;
};

export const saveAppMcpBinding = async (input: AppMcpBindingUpsert): Promise<void> => {
  await writeJson("/api/v1/mcp/app-bindings", "POST", input);
};

export const deleteAppMcpBinding = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/mcp/app-bindings/${encodeURIComponent(id)}`);
};

export const previewDeleteAppMcpBinding = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/mcp/app-bindings/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const previewAppMcpBindingUpsert = async (
  input: AppMcpBindingUpsert
): Promise<McpBindingSavePreview> => {
  const result = await writeJson<{ item: McpBindingSavePreview }>(
    "/api/v1/mcp/app-bindings/preview",
    "POST",
    input
  );
  return result.item;
};

export const previewMcpGovernanceRepair = async (
  appCode: AppBinding["appCode"]
): Promise<McpGovernanceRepairPreview> => {
  const result = await readJson<{ item: McpGovernanceRepairPreview }>(
    `/api/v1/mcp/governance/${encodeURIComponent(appCode)}/preview`
  );
  return result.item;
};

export const applyMcpGovernanceRepair = async (
  appCode: AppBinding["appCode"]
): Promise<McpGovernanceRepairResult> => {
  const result = await writeJson<{ item: McpGovernanceRepairResult }>(
    `/api/v1/mcp/governance/${encodeURIComponent(appCode)}/repair`,
    "POST",
    {}
  );
  return result.item;
};

export const previewMcpGovernanceRepairAll = async (): Promise<McpGovernanceBatchPreview> => {
  const result = await readJson<{ item: McpGovernanceBatchPreview }>(
    "/api/v1/mcp/governance/preview-all"
  );
  return result.item;
};

export const applyMcpGovernanceRepairAll = async (): Promise<McpGovernanceBatchResult> => {
  const result = await writeJson<{ item: McpGovernanceBatchResult }>(
    "/api/v1/mcp/governance/repair-all",
    "POST",
    {}
  );
  return result.item;
};

export const importMcpFromHost = async (
  appCode: AppBinding["appCode"],
  options: McpImportOptions
): Promise<void> => {
  await writeJson(`/api/v1/mcp/import/${encodeURIComponent(appCode)}`, "POST", options);
};

export const previewMcpImportFromHost = async (
  appCode: AppBinding["appCode"],
  options: McpImportOptions
): Promise<McpImportPreview> => {
  const query = toQueryString(options);
  const result = await readJson<{ item: McpImportPreview }>(
    `/api/v1/mcp/import/${encodeURIComponent(appCode)}/preview${query}`
  );
  return result.item;
};

export const previewPromptHostImport = async (
  appCode: AppBinding["appCode"]
): Promise<PromptHostImportPreview> => {
  const result = await readJson<{ item: PromptHostImportPreview }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/preview-import`
  );
  return result.item;
};

export const importPromptFromHost = async (
  appCode: AppBinding["appCode"]
): Promise<{ readonly item: PromptHostImportResult; readonly snapshotVersion: number | null }> =>
  writeJson(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/import`,
    "POST",
    {}
  );

export const previewPromptHostSyncApplyAll = async (): Promise<PromptHostSyncBatchPreview> => {
  const result = await readJson<{ item: PromptHostSyncBatchPreview }>(
    "/api/v1/prompt-host-sync/preview-all"
  );
  return result.item;
};

export const applyPromptHostSyncAll = async (): Promise<PromptHostSyncBatchResult> => {
  const result = await writeJson<{ item: PromptHostSyncBatchResult }>(
    "/api/v1/prompt-host-sync/apply-all",
    "POST",
    {}
  );
  return result.item;
};

export const previewPromptHostSyncApply = async (
  appCode: AppBinding["appCode"]
): Promise<PromptHostSyncPreview> => {
  const result = await readJson<{ item: PromptHostSyncPreview }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/preview-apply`
  );
  return result.item;
};

export const applyPromptHostSync = async (
  appCode: AppBinding["appCode"]
): Promise<PromptHostSyncResult> => {
  const result = await writeJson<{ item: PromptHostSyncResult }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/apply`,
    "POST",
    {}
  );
  return result.item;
};

export const rollbackPromptHostSync = async (
  appCode: AppBinding["appCode"]
): Promise<PromptHostSyncResult> => {
  const result = await writeJson<{ item: PromptHostSyncResult }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/rollback`,
    "POST",
    {}
  );
  return result.item;
};

export const applyHostMcpSync = async (appCode: AppBinding["appCode"]): Promise<HostMcpSyncResult> => {
  const result = await writeJson<{ item: HostMcpSyncResult }>(
    `/api/v1/mcp/host-sync/${encodeURIComponent(appCode)}/apply`,
    "POST",
    {}
  );
  return result.item;
};

export const previewHostMcpSyncApplyAll = async (): Promise<McpHostSyncBatchPreview> => {
  const result = await readJson<{ item: McpHostSyncBatchPreview }>(
    "/api/v1/mcp/host-sync/preview-all"
  );
  return result.item;
};

export const applyHostMcpSyncAll = async (): Promise<McpHostSyncBatchResult> => {
  const result = await writeJson<{ item: McpHostSyncBatchResult }>(
    "/api/v1/mcp/host-sync/apply-all",
    "POST",
    {}
  );
  return result.item;
};

export const rollbackHostMcpSync = async (appCode: AppBinding["appCode"]): Promise<HostMcpSyncResult> => {
  const result = await writeJson<{ item: HostMcpSyncResult }>(
    `/api/v1/mcp/host-sync/${encodeURIComponent(appCode)}/rollback`,
    "POST",
    {}
  );
  return result.item;
};

export const previewApplyHostCliManagedConfig = async (
  appCode: AppBinding["appCode"]
): Promise<HostCliApplyPreview> => {
  const result = await readJson<{ item: HostCliApplyPreview }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/preview-apply`
  );
  return result.item;
};

export const previewHostMcpSyncApply = async (
  appCode: AppBinding["appCode"]
): Promise<McpHostSyncPreview> => {
  const result = await readJson<{ item: McpHostSyncPreview }>(
    `/api/v1/mcp/host-sync/${encodeURIComponent(appCode)}/preview-apply`
  );
  return result.item;
};

export const saveProxyPolicy = async (policy: ProxyPolicy): Promise<void> => {
  await writeJson("/api/v1/proxy-policy", "PUT", policy);
};

export const previewProxyPolicyUpdate = async (
  policy: ProxyPolicy
): Promise<ProxyPolicySavePreview> => {
  const result = await writeJson<{ item: ProxyPolicySavePreview }>(
    "/api/v1/proxy-policy/preview",
    "POST",
    policy
  );
  return result.item;
};

export const deleteProvider = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/providers/${encodeURIComponent(id)}`);
};

export const previewDeleteProvider = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/providers/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const deleteBinding = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/app-bindings/${encodeURIComponent(id)}`);
};

export const previewDeleteBinding = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/app-bindings/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const deleteAppQuota = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/app-quotas/${encodeURIComponent(id)}`);
};

export const previewDeleteAppQuota = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/app-quotas/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const deleteFailoverChain = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/failover-chains/${encodeURIComponent(id)}`);
};

export const previewDeleteFailoverChain = async (id: string): Promise<ConfigDeletePreview> => {
  const result = await readJson<{ item: ConfigDeletePreview }>(`/api/v1/failover-chains/${encodeURIComponent(id)}/delete-preview`);
  return result.item;
};

export const exportCurrentConfig = async (): Promise<ExportPackage> => {
  const result = await readJson<ExportPackage>("/api/v1/import-export/export");
  return exportPackageSchema.parse(result);
};

export const loadProxyRequestLogs = async (
  query: Partial<ProxyRequestLogQuery> = {}
): Promise<ProxyRequestLogPage> => {
  const result = await readJson<ProxyRequestLogPage>(
    `/api/v1/proxy-request-logs${toQueryString(query as Record<string, string | number | undefined>)}`
  );
  return proxyRequestLogPageSchema.parse(result);
};

export const loadAuditEvents = async (
  query: Partial<AuditEventQuery> = {}
): Promise<AuditEventPage> => {
  const result = await readJson<AuditEventPage>(
    `/api/v1/audit/events${toQueryString(query as Record<string, string | number | undefined>)}`
  );
  return auditEventPageSchema.parse(result);
};

export const loadUsageRecords = async (
  query: Partial<UsageRecordQuery> = {}
): Promise<UsageRecordPage> => {
  const result = await readJson<UsageRecordPage>(
    `/api/v1/usage/records${toQueryString(query as Record<string, string | number | undefined>)}`
  );
  return usageRecordPageSchema.parse(result);
};

export const loadUsageSummary = async (
  query: Partial<UsageRecordQuery> = {}
): Promise<UsageSummary> => {
  const result = await readJson<UsageSummary>(
    `/api/v1/usage/summary${toQueryString(query as Record<string, string | number | undefined>)}`
  );
  return usageSummarySchema.parse(result);
};

export const loadUsageTimeseries = async (
  query: Partial<UsageTimeseriesQuery> = {}
): Promise<UsageTimeseries> => {
  const result = await readJson<UsageTimeseries>(
    `/api/v1/usage/timeseries${toQueryString(query as Record<string, string | number | undefined>)}`
  );
  return usageTimeseriesSchema.parse(result);
};

export const importConfigPackage = async (input: unknown): Promise<ExportPackage> => {
  const result = await writeJson<ExportPackage>("/api/v1/import-export/import", "POST", input);
  return exportPackageSchema.parse(result);
};

export const previewImportConfigPackage = async (input: unknown): Promise<ConfigImportPreview> => {
  const result = await writeJson<{ item: ConfigImportPreview }>("/api/v1/import-export/import/preview", "POST", input);
  return result.item;
};

export const restoreLatestSnapshot = async (version?: number): Promise<void> => {
  await writeJson("/api/v1/snapshots/latest/restore", "POST", version === undefined ? {} : { version });
};

export const loadSnapshotByVersion = async (version: number): Promise<ConfigSnapshot> => {
  const result = await readJson<{ item: ConfigSnapshot }>(`/api/v1/snapshots/${version}`);
  return result.item;
};

export const loadSnapshotDiffByVersion = async (version: number): Promise<ConfigSnapshotDiff> => {
  const result = await readJson<{ item: ConfigSnapshotDiff }>(`/api/v1/snapshots/${version}/diff`);
  return result.item;
};

export const restoreSnapshotVersion = async (version: number): Promise<void> => {
  await writeJson(`/api/v1/snapshots/${version}/restore`, "POST", {});
};

export const previewRestoreSnapshotVersion = async (version: number): Promise<ConfigRestorePreview> => {
  const result = await readJson<{ item: ConfigRestorePreview }>(`/api/v1/snapshots/${version}/restore-preview`);
  return result.item;
};

export const applyHostCliManagedConfig = async (appCode: AppBinding["appCode"]): Promise<HostCliMutationResult> => {
  const result = await writeJson<{ item: HostCliMutationResult }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/apply`,
    "POST",
    {}
  );
  return result.item;
};

export const rollbackHostCliManagedConfig = async (
  appCode: AppBinding["appCode"]
): Promise<HostCliMutationResult> => {
  const result = await writeJson<{ item: HostCliMutationResult }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/rollback`,
    "POST",
    {}
  );
  return result.item;
};

export const probeProviderHealth = async (providerId: string): Promise<void> => {
  await writeJson(`/api/v1/provider-health/${encodeURIComponent(providerId)}/probe`, "POST", {});
};

export const recoverProviderHealth = async (providerId: string): Promise<void> => {
  await writeJson(`/api/v1/provider-health/${encodeURIComponent(providerId)}/recover`, "POST", {});
};

export const isolateProviderHealth = async (
  providerId: string,
  input: { reason?: string; cooldownSeconds?: number } = {}
): Promise<void> => {
  await writeJson(`/api/v1/provider-health/${encodeURIComponent(providerId)}/isolate`, "POST", input);
};

export const resetProviderHealth = async (
  providerId: string,
  input: { reason?: string } = {}
): Promise<void> => {
  await writeJson(`/api/v1/provider-health/${encodeURIComponent(providerId)}/reset`, "POST", input);
};

export const loadProviderDiagnosticDetail = async (
  providerId: string
): Promise<ProviderDiagnosticDetail> => {
  const result = await readJson<{ item: ProviderDiagnosticDetail }>(
    `/api/v1/providers/${encodeURIComponent(providerId)}/diagnostics`
  );
  return providerDiagnosticDetailSchema.parse(result.item);
};

export const loadWorkspaceRuntimeDetail = async (
  workspaceId: string
): Promise<WorkspaceRuntimeDetail> => {
  const result = await readJson<{ item: WorkspaceRuntimeDetail }>(
    `/api/v1/runtime-contexts/workspaces/${encodeURIComponent(workspaceId)}`
  );
  return workspaceRuntimeDetailSchema.parse({
    ...result.item,
    providerBreakdown: result.item.providerBreakdown.map((item) => contextProviderBreakdownSchema.parse(item)),
    failureBreakdown: result.item.failureBreakdown.map((item) => contextFailureBreakdownSchema.parse(item)),
    modelBreakdown: result.item.modelBreakdown.map((item) => contextModelBreakdownSchema.parse(item))
  });
};

export const loadSessionRuntimeDetail = async (
  sessionId: string
): Promise<SessionRuntimeDetail> => {
  const result = await readJson<{ item: SessionRuntimeDetail }>(
    `/api/v1/runtime-contexts/sessions/${encodeURIComponent(sessionId)}`
  );
  return sessionRuntimeDetailSchema.parse({
    ...result.item,
    providerBreakdown: result.item.providerBreakdown.map((item) => contextProviderBreakdownSchema.parse(item)),
    failureBreakdown: result.item.failureBreakdown.map((item) => contextFailureBreakdownSchema.parse(item)),
    modelBreakdown: result.item.modelBreakdown.map((item) => contextModelBreakdownSchema.parse(item))
  });
};

export type {
  ProviderDiagnosticDetail,
  QuickContextAssetApplyResult,
  QuickContextAssetInput,
  QuickContextAssetPreview,
  SessionRuntimeDetail,
  WorkspaceRuntimeDetail
};
