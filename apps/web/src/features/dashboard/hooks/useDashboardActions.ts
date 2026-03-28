import type {
  AppBinding,
  AppMcpBinding,
  AppBindingUpsert,
  AppMcpBindingUpsert,
  AppQuotaUpsert,
  ExportPackage,
  FailoverChainUpsert,
  McpServer,
  McpImportOptions,
  McpServerUpsert,
  PromptTemplateVersion,
  PromptTemplateUpsert,
  ProxyPolicy,
  ProviderUpsert,
  SessionRecordUpsert,
  SkillUpsert,
  SkillVersion,
  WorkspaceUpsert
} from "@cc-switch-web/shared";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import type { DashboardFollowUpNotice } from "../lib/dashboardFollowUp.js";
import {
  type ConfigDeleteTargetKind,
} from "../lib/editorConsistency.js";
import { createDashboardAssetActions } from "./dashboardAssetActions.js";
import {
  createDashboardRoutingActions,
  createDashboardMcpFormActions
} from "./dashboardConfigActions.js";
import { createDashboardContextResourceActions } from "./dashboardContextActions.js";
import {
  createDashboardMcpHostActions,
  createDashboardPromptHostActions
} from "./dashboardHostActions.js";
import { createDashboardOrchestrationActions } from "./dashboardOrchestrationActions.js";
import { createDashboardRecoveryActions } from "./dashboardRecoveryActions.js";
import { createDashboardRuntimeActions } from "./dashboardRuntimeActions.js";

type TranslationKey =
  | "dashboard.workspace.activationCleared"
  | "dashboard.workspace.archiveSuccess"
  | "dashboard.workspace.activationSuccess"
  | "dashboard.workspace.discoveryImportSuccess"
  | "dashboard.mcp.importSuccess"
  | "dashboard.mcp.applySuccess"
  | "dashboard.mcp.rollbackSuccess"
  | "dashboard.runtime.recoverSuccess"
  | "dashboard.runtime.isolateSuccess"
  | "dashboard.runtime.resetSuccess"
  | "dashboard.runtime.probeSuccess"
  | "dashboard.discovery.applySuccess"
  | "dashboard.discovery.rollbackSuccess"
  | "dashboard.forms.saveSuccess"
  | "dashboard.forms.exportSuccess"
  | "dashboard.forms.importSuccess"
  | "dashboard.forms.restoreSuccess"
  | "dashboard.snapshots.selectedVersionNotice"
  | "dashboard.forms.restoreReviewReady"
  | "dashboard.mcp.bindingRequiresServer"
  | "dashboard.onboarding.bindingRequiresProvider"
  | "dashboard.onboarding.failoverRequiresProvider"
  | "dashboard.forms.deleteSuccess";

type UseDashboardActionsParams = {
  readonly locale: "zh-CN" | "en-US";
  readonly t: (key: TranslationKey) => string;
  readonly runAction: (task: () => Promise<void>, successMessage: string) => void;
  readonly setFollowUpNotice: (value: DashboardFollowUpNotice | null) => void;
  readonly loadDeleteReview: (kind: ConfigDeleteTargetKind, id: string) => void;
  readonly loadImportPreview: (selectedVersionNotice: string) => void;
  readonly executeDelete: (kind: ConfigDeleteTargetKind, id: string) => Promise<void>;
  readonly refreshProviderDiagnosticDetail: (providerId: string) => void;
  readonly refreshWorkspaceRuntimeDetail: (workspaceId: string) => void;
  readonly refreshSessionRuntimeDetail: (sessionId: string) => void;
  readonly focusProviderFailureLogs: (providerId: string) => void;
  readonly focusWorkspaceLogs: (workspaceId: string) => void;
  readonly focusSessionLogs: (sessionId: string) => void;
  readonly focusAppLogs: (appCode: AppBinding["appCode"]) => void;
  readonly openAuditFocus: (filters: {
    readonly source?: "host-integration" | "provider-health" | "proxy-request" | "mcp" | "quota";
    readonly appCode?: AppBinding["appCode"];
    readonly providerId?: string;
    readonly level?: "info" | "warn" | "error";
  }) => void;
  readonly setSelectedProviderDiagnosticId: (value: string | null) => void;
  readonly setSelectedProviderDiagnosticDetail: (value: null) => void;
  readonly setSelectedWorkspaceRuntimeDetail: (value: null) => void;
  readonly setSelectedSessionRuntimeDetail: (value: null) => void;
  readonly setSelectedSnapshotVersion: (value: number | null) => void;
  readonly setNoticeMessage: (value: string | null) => void;
  readonly setErrorMessage: (value: string | null) => void;
  readonly setImportPreview: (value: null) => void;
  readonly setImportPreviewSourceText: (value: string) => void;
  readonly setPendingDeleteReview: (value: null) => void;
  readonly setExportText: (value: string) => void;
  readonly setImportText: (value: string) => void;
  readonly setBindingForm: React.Dispatch<React.SetStateAction<AppBindingUpsert>>;
  readonly setAppQuotaForm: React.Dispatch<React.SetStateAction<AppQuotaUpsert>>;
  readonly setFailoverForm: React.Dispatch<React.SetStateAction<FailoverChainUpsert>>;
  readonly setProxyForm: React.Dispatch<React.SetStateAction<ProxyPolicy>>;
  readonly setWorkspaceForm: React.Dispatch<React.SetStateAction<WorkspaceUpsert>>;
  readonly setWorkspaceTagsText: React.Dispatch<React.SetStateAction<string>>;
  readonly setSessionForm: React.Dispatch<React.SetStateAction<SessionRecordUpsert>>;
  readonly setProviderForm: React.Dispatch<React.SetStateAction<ProviderUpsert>>;
  readonly setPromptTemplateForm: React.Dispatch<React.SetStateAction<PromptTemplateUpsert>>;
  readonly setPromptTagsText: React.Dispatch<React.SetStateAction<string>>;
  readonly setPromptTemplateVersions: React.Dispatch<React.SetStateAction<PromptTemplateVersion[]>>;
  readonly setSkillForm: React.Dispatch<React.SetStateAction<SkillUpsert>>;
  readonly setSkillTagsText: React.Dispatch<React.SetStateAction<string>>;
  readonly setSkillVersions: React.Dispatch<React.SetStateAction<SkillVersion[]>>;
  readonly editingMcpServerId: string | null;
  readonly editingMcpBindingId: string | null;
  readonly resetMcpServerEditor: () => void;
  readonly resetMcpBindingEditor: () => void;
  readonly loadMcpServerToEditor: (item: McpServer) => void;
  readonly loadMcpBindingToEditor: (item: AppMcpBinding) => void;
  readonly dashboardSnapshot: DashboardSnapshot | null;
  readonly selectedSnapshotVersion: number | null;
  readonly snapshotMcpServersLength: number;
  readonly hasProviders: boolean;
  readonly mcpImportOptions: McpImportOptions;
  readonly workspaceForm: WorkspaceUpsert;
  readonly workspaceTagsText: string;
  readonly sessionForm: SessionRecordUpsert;
  readonly promptTemplateForm: PromptTemplateUpsert;
  readonly promptTagsText: string;
  readonly skillForm: SkillUpsert;
  readonly skillTagsText: string;
  readonly mcpServerForm: McpServerUpsert;
  readonly mcpEnvText: string;
  readonly mcpHeadersText: string;
  readonly mcpBindingForm: AppMcpBindingUpsert;
  readonly providerForm: ProviderUpsert;
  readonly bindingForm: AppBindingUpsert;
  readonly appQuotaForm: AppQuotaUpsert;
  readonly proxyForm: ProxyPolicy;
  readonly failoverForm: FailoverChainUpsert;
  readonly importText: string;
  readonly toJsonString: (value: ExportPackage) => string;
};

export const useDashboardActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  loadDeleteReview,
  loadImportPreview,
  executeDelete,
  refreshProviderDiagnosticDetail,
  refreshWorkspaceRuntimeDetail,
  refreshSessionRuntimeDetail,
  focusProviderFailureLogs,
  focusWorkspaceLogs,
  focusSessionLogs,
  focusAppLogs,
  openAuditFocus,
  setSelectedProviderDiagnosticId,
  setSelectedProviderDiagnosticDetail,
  setSelectedWorkspaceRuntimeDetail,
  setSelectedSessionRuntimeDetail,
  setSelectedSnapshotVersion,
  setNoticeMessage,
  setErrorMessage,
  setImportPreview,
  setImportPreviewSourceText,
  setPendingDeleteReview,
  setExportText,
  setImportText,
  setBindingForm,
  setAppQuotaForm,
  setFailoverForm,
  setProxyForm,
  setWorkspaceForm,
  setWorkspaceTagsText,
  setSessionForm,
  setProviderForm,
  setPromptTemplateForm,
  setPromptTagsText,
  setPromptTemplateVersions,
  setSkillForm,
  setSkillTagsText,
  setSkillVersions,
  editingMcpServerId,
  editingMcpBindingId,
  resetMcpServerEditor,
  resetMcpBindingEditor,
  loadMcpServerToEditor,
  loadMcpBindingToEditor,
  dashboardSnapshot,
  selectedSnapshotVersion,
  snapshotMcpServersLength,
  hasProviders,
  mcpImportOptions,
  workspaceForm,
  workspaceTagsText,
  sessionForm,
  promptTemplateForm,
  promptTagsText,
  skillForm,
  skillTagsText,
  mcpServerForm,
  mcpEnvText,
  mcpHeadersText,
  mcpBindingForm,
  providerForm,
  bindingForm,
  appQuotaForm,
  proxyForm,
  failoverForm,
  importText,
  toJsonString
}: UseDashboardActionsParams) => {
  const orchestrationActions = createDashboardOrchestrationActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    executeDelete,
    openAuditFocus,
    loadDeleteReview,
    dashboardSnapshot,
    editingMcpServerId,
    editingMcpBindingId,
    providerForm,
    bindingForm,
    appQuotaForm,
    failoverForm,
    promptTemplateForm,
    skillForm,
    workspaceForm,
    sessionForm,
    setPendingDeleteReview,
    setBindingForm,
    setAppQuotaForm,
    setFailoverForm,
    setWorkspaceForm,
    setWorkspaceTagsText,
    setSessionForm,
    setProviderForm,
    setPromptTemplateForm,
    setPromptTagsText,
    setPromptTemplateVersions,
    setSkillForm,
    setSkillTagsText,
    setSkillVersions,
    resetMcpServerEditor,
    resetMcpBindingEditor
  });

  const mcpHostActions = createDashboardMcpHostActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    openAuditFocus,
    mcpImportOptions
  });

  const promptHostActions = createDashboardPromptHostActions({
    locale,
    runAction,
    setFollowUpNotice,
    openAuditFocus
  });

  const runtimeActions = createDashboardRuntimeActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    openAuditFocus,
    refreshProviderDiagnosticDetail,
    refreshWorkspaceRuntimeDetail,
    refreshSessionRuntimeDetail,
    focusProviderFailureLogs,
    setSelectedProviderDiagnosticId,
    setSelectedProviderDiagnosticDetail,
    setSelectedWorkspaceRuntimeDetail,
    setSelectedSessionRuntimeDetail
  });

  const recoveryActions = createDashboardRecoveryActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    loadImportPreview,
    openAuditFocus,
    selectedSnapshotVersion,
    setSelectedSnapshotVersion,
    setNoticeMessage,
    setImportPreview,
    setImportPreviewSourceText,
    setExportText,
    setImportText,
    importText,
    toJsonString
  });

  const contextResourceActions = createDashboardContextResourceActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    loadDeleteReview,
    runProjectIntakeConvergence: orchestrationActions.runProjectIntakeConvergence,
    ensureSessionFromDiscovery: orchestrationActions.ensureSessionFromDiscovery
  });

  const assetActions = createDashboardAssetActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    focusAppLogs,
    focusWorkspaceLogs,
    focusSessionLogs,
    refreshWorkspaceRuntimeDetail,
    refreshSessionRuntimeDetail,
    refreshPromptTemplateVersionsFor: orchestrationActions.refreshPromptTemplateVersionsFor,
    refreshSkillVersionsFor: orchestrationActions.refreshSkillVersionsFor,
    workspaceForm,
    workspaceTagsText,
    sessionForm,
    promptTemplateForm,
    promptTagsText,
    skillForm,
    skillTagsText,
    setWorkspaceForm,
    setWorkspaceTagsText,
    setSessionForm,
    setPromptTemplateForm,
    setPromptTagsText,
    setSkillForm,
    setSkillTagsText
  });

  const mcpFormActions = createDashboardMcpFormActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    setErrorMessage,
    openAuditFocus,
    snapshotMcpServersLength,
    mcpServerForm,
    mcpEnvText,
    mcpHeadersText,
    mcpBindingForm,
    loadMcpServerToEditor,
    loadMcpBindingToEditor
  });

  const routingActions = createDashboardRoutingActions({
    locale,
    t,
    runAction,
    setFollowUpNotice,
    setErrorMessage,
    openAuditFocus,
    hasProviders,
    providerForm,
    bindingForm,
    appQuotaForm,
    proxyForm,
    failoverForm,
    setProviderForm,
    setBindingForm,
    setAppQuotaForm,
    setProxyForm,
    setFailoverForm,
    refreshProviderDiagnosticDetail,
    focusProviderFailureLogs,
    focusAppLogs
  });

  return {
    ...orchestrationActions.commonActions,
    contextResources: contextResourceActions,
    mcpHost: mcpHostActions,
    promptHost: promptHostActions,
    runtime: runtimeActions,
    assets: assetActions,
    mcpForms: mcpFormActions,
    routing: routingActions,
    recovery: recoveryActions
  };
};
