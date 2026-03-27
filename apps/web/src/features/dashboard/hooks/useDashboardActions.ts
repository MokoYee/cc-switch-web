import type {
  AppBinding,
  AppBindingUpsert,
  AppMcpBindingUpsert,
  AppQuotaUpsert,
  ExportPackage,
  FailoverChainUpsert,
  McpImportOptions,
  McpServerUpsert,
  PromptTemplateUpsert,
  ProxyPolicy,
  ProviderUpsert,
  SessionRecordUpsert,
  SkillUpsert,
  WorkspaceUpsert
} from "@cc-switch-web/shared";

import {
  applyAssetGovernanceRepair,
  applyPromptHostSync,
  applyPromptHostSyncAll,
  activateSession,
  activateWorkspace,
  applyHostMcpSyncAll,
  applyMcpGovernanceRepairAll,
  applyMcpGovernanceRepair,
  applyHostCliManagedConfig,
  applyHostMcpSync,
  archiveSessionRecord,
  archiveStaleSessionRecords,
  ensureSessionRecord,
  exportCurrentConfig,
  importConfigPackage,
  importMcpFromHost,
  importPromptFromHost,
  importWorkspaceDiscoveryItems,
  importWorkspaceDiscoveryItem,
  isolateProviderHealth,
  probeProviderHealth,
  recoverProviderHealth,
  resetProviderHealth,
  restorePromptTemplateVersion,
  restoreSkillVersion,
  restoreSnapshotVersion,
  rollbackHostCliManagedConfig,
  rollbackHostMcpSync,
  rollbackPromptHostSync,
  saveAppMcpBinding,
  saveAppQuota,
  saveBinding,
  saveFailoverChain,
  saveMcpServer,
  savePromptTemplate,
  saveProvider,
  saveProxyPolicy,
  saveSessionRecord,
  saveSkill,
  saveWorkspace
} from "../api/load-dashboard-snapshot.js";

export type DashboardFollowUpAction =
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "provider-runtime" | "provider-logs";
      readonly providerId: string;
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "workspace-runtime" | "workspace-logs";
      readonly workspaceId: string;
      readonly appCode?: AppBinding["appCode"];
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "session-runtime" | "session-logs";
      readonly sessionId: string;
      readonly appCode?: AppBinding["appCode"];
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "app-logs";
      readonly appCode: AppBinding["appCode"];
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "audit";
      readonly filters: {
        readonly source?: "host-integration" | "provider-health" | "proxy-request" | "mcp" | "quota";
        readonly appCode?: AppBinding["appCode"];
        readonly providerId?: string;
        readonly level?: "info" | "warn" | "error";
      };
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "section";
      readonly section: "routing" | "assets" | "mcp" | "runtime" | "traffic" | "recovery";
    };

export type DashboardFollowUpNotice = {
  readonly category:
    | "provider"
    | "workspace"
    | "session"
    | "asset"
    | "app-traffic"
    | "mcp"
    | "recovery"
    | "delete";
  readonly title: string;
  readonly summary: string;
  readonly actions: readonly DashboardFollowUpAction[];
};

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
  readonly loadDeleteReview: (
    kind:
      | "provider"
      | "binding"
      | "app-quota"
      | "failover-chain"
      | "prompt-template"
      | "skill"
      | "workspace"
      | "session"
      | "mcp-server"
      | "mcp-app-binding",
    id: string
  ) => void;
  readonly loadImportPreview: (selectedVersionNotice: string) => void;
  readonly executeDelete: (
    kind:
      | "provider"
      | "binding"
      | "app-quota"
      | "failover-chain"
      | "prompt-template"
      | "skill"
      | "workspace"
      | "session"
      | "mcp-server"
      | "mcp-app-binding",
    id: string
  ) => Promise<void>;
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
  readonly splitProviderIds: (rawValue: string) => string[];
  readonly parseJsonRecord: (raw: string) => Record<string, string>;
  readonly toJsonString: (value: ExportPackage) => string;
};

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

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
  splitProviderIds,
  parseJsonRecord,
  toJsonString
}: UseDashboardActionsParams) => {
  const ensureSessionFromDiscovery = async (
    item: {
      readonly rootPath: string;
      readonly name: string;
      readonly appCodeSuggestion: AppBinding["appCode"] | null;
    },
    activate: boolean
  ): Promise<void> => {
    const result = await ensureSessionRecord({
      appCode: item.appCodeSuggestion ?? "codex",
      cwd: item.rootPath,
      title: item.name,
      activate
    });
    setFollowUpNotice({
      category: "session",
      title: activate
        ? localize(locale, "会话已建档并激活", "Session Created And Activated")
        : localize(locale, "会话已自动建档", "Session Auto-Created"),
      summary: activate
        ? localize(
            locale,
            "该项目已经切到当前激活上下文，下一步应确认运行态和真实请求是否已经命中这条链路。",
            "This project has been switched into the active context. Next, confirm runtime and live traffic are hitting this path."
          )
        : result.createdWorkspace
          ? localize(
              locale,
              "已自动补齐工作区和会话建档，下一步应确认运行态是否命中正确上下文。",
              "Workspace and session records were created automatically. Next, confirm runtime is resolving to the right context."
            )
          : localize(
              locale,
              "已基于现有工作区补齐会话建档，下一步应确认运行态是否已经挂到正确对象。",
              "A session record was created from the existing workspace. Next, confirm runtime is attached to the right object."
            ),
      actions: [
        {
          id: `session-ensure-runtime-${result.session.id}`,
          label: localize(locale, "查看会话运行态", "Open Session Runtime"),
          kind: "session-runtime",
          sessionId: result.session.id,
          appCode: result.session.appCode
        },
        {
          id: `session-ensure-workspace-${result.workspace.id}`,
          label: localize(locale, "查看工作区运行态", "Open Workspace Runtime"),
          kind: "workspace-runtime",
          workspaceId: result.workspace.id,
          ...(result.workspace.appCode ? { appCode: result.workspace.appCode } : {})
        },
        {
          id: `session-ensure-logs-${result.session.id}`,
          label: localize(locale, "查看应用请求", "Open App Requests"),
          kind: "app-logs",
          appCode: result.session.appCode
        }
      ]
    });
  };

  return {
  confirmDelete: (
    kind:
      | "provider"
      | "binding"
      | "app-quota"
      | "failover-chain"
      | "prompt-template"
      | "skill"
      | "workspace"
      | "session"
      | "mcp-server"
      | "mcp-app-binding",
    id: string
  ) =>
    runAction(async () => {
      await executeDelete(kind, id);
      setPendingDeleteReview(null);
      openAuditFocus({
        source:
          kind === "mcp-server" || kind === "mcp-app-binding"
            ? "mcp"
            : kind === "app-quota"
              ? "quota"
              : "proxy-request"
      });
      setFollowUpNotice({
        category: "delete",
        title: localize(locale, "删除已执行", "Delete Completed"),
        summary: localize(locale, "下一步应回到对应治理面板，确认引用链和运行态是否已经收敛。", "Next, return to the relevant governance panel and confirm references and runtime state have converged."),
        actions: [
          {
            id: `delete-follow-${kind}`,
            label:
              kind === "provider" || kind === "binding" || kind === "app-quota" || kind === "failover-chain"
                ? localize(locale, "返回路由面板", "Back To Routing")
                : kind === "mcp-server" || kind === "mcp-app-binding"
                  ? localize(locale, "返回 MCP 面板", "Back To MCP")
                  : localize(locale, "返回上下文资产", "Back To Context Assets"),
            kind: "section",
            section:
              kind === "provider" || kind === "binding" || kind === "app-quota" || kind === "failover-chain"
                ? "routing"
                : kind === "mcp-server" || kind === "mcp-app-binding"
                  ? "mcp"
                  : "assets"
          },
          {
            id: `delete-follow-recovery-${kind}`,
            label: localize(locale, "查看恢复面板", "Open Recovery"),
            kind: "section",
            section: "recovery"
          }
        ]
      });
    }, t("dashboard.forms.deleteSuccess")),
  clearActiveWorkspace: () =>
    runAction(() => activateWorkspace(null), t("dashboard.workspace.activationCleared")),
  clearActiveSession: () =>
    runAction(() => activateSession(null), t("dashboard.workspace.activationCleared")),
  archiveStaleSessions: () =>
    runAction(async () => {
      await archiveStaleSessionRecords();
    }, t("dashboard.workspace.archiveSuccess")),
  deleteProviderReview: (id: string) => loadDeleteReview("provider", id),
  deleteBindingReview: (id: string) => loadDeleteReview("binding", id),
  deleteAppQuotaReview: (id: string) => loadDeleteReview("app-quota", id),
  contextResources: {
    deletePromptTemplateReview: (id: string) => loadDeleteReview("prompt-template", id),
    deleteSkillReview: (id: string) => loadDeleteReview("skill", id),
    activateWorkspace: (id: string) =>
      runAction(() => activateWorkspace(id), t("dashboard.workspace.activationSuccess")),
    deleteWorkspaceReview: (id: string) => loadDeleteReview("workspace", id),
    importWorkspaceDiscovery: (item: {
      readonly rootPath: string;
      readonly name: string;
      readonly appCodeSuggestion: AppBinding["appCode"] | null;
    }) =>
      runAction(
        async () => {
          const result = await importWorkspaceDiscoveryItem({
            rootPath: item.rootPath,
            name: item.name,
            appCode: item.appCodeSuggestion ?? "codex",
            tags: ["auto-imported"],
            enabled: true
          });
          setFollowUpNotice({
            category: "workspace",
            title: localize(locale, "工作区候选已归档", "Workspace Candidate Imported"),
            summary:
              result.linkedSessionIds.length > 0
                ? localize(
                    locale,
                    `已自动挂回 ${result.linkedSessionIds.length} 个历史会话，下一步应确认工作区运行态是否已收敛。`,
                    `Automatically linked ${result.linkedSessionIds.length} historical sessions. Next, confirm the workspace runtime has converged.`
                  )
                : localize(
                    locale,
                    "工作区已建档，下一步应确认默认上下文配置和运行态是否正确。",
                    "The workspace is now recorded. Next, confirm the default context and runtime are correct."
                  ),
            actions: [
              {
                id: `workspace-import-runtime-${result.item.id}`,
                label: localize(locale, "查看工作区运行态", "Open Workspace Runtime"),
                kind: "workspace-runtime",
                workspaceId: result.item.id,
                ...(result.item.appCode ? { appCode: result.item.appCode } : {})
              },
              ...(result.linkedSessionIds[0]
                ? [
                    {
                      id: `workspace-import-session-${result.linkedSessionIds[0]}`,
                      label: localize(locale, "查看关联会话", "Open Linked Session"),
                      kind: "session-runtime" as const,
                      sessionId: result.linkedSessionIds[0],
                      ...(result.item.appCode ? { appCode: result.item.appCode } : {})
                    }
                  ]
                : [])
            ]
          });
        },
        t("dashboard.workspace.discoveryImportSuccess")
      ),
    importAllWorkspaceDiscovery: () =>
      runAction(
        async () => {
          const result = await importWorkspaceDiscoveryItems({
            tags: ["auto-imported"],
            enabled: true
          });
          setFollowUpNotice({
            category: "workspace",
            title: localize(locale, "工作区候选已整批归档", "Workspace Candidates Imported"),
            summary:
              result.importedCount === 0
                ? localize(
                    locale,
                    "当前没有新的工作区候选需要归档，发现列表与工作区档案已经基本一致。",
                    "There are no new workspace candidates to import right now. Discovery and workspace inventory are already aligned."
                  )
                : localize(
                    locale,
                    `已归档 ${result.importedCount} 个候选，并自动挂回 ${result.linkedSessionIds.length} 个历史会话。下一步应检查上下文运行态是否已经收敛。`,
                    `Imported ${result.importedCount} candidate(s) and linked ${result.linkedSessionIds.length} historical session(s). Next, confirm context runtime has converged.`
                  ),
            actions: [
              {
                id: "workspace-discovery-batch-assets",
                label: localize(locale, "返回上下文资产", "Back To Context Assets"),
                kind: "section",
                section: "assets"
              },
              {
                id: "workspace-discovery-batch-runtime",
                label: localize(locale, "查看运行态", "Open Runtime"),
                kind: "section",
                section: "runtime"
              }
            ]
          });
        },
        localize(locale, "工作区候选已整批归档", "Workspace candidates imported")
      ),
    ensureSessionFromDiscovery: (item: {
      readonly rootPath: string;
      readonly name: string;
      readonly appCodeSuggestion: AppBinding["appCode"] | null;
    }) =>
      runAction(
        () => ensureSessionFromDiscovery(item, false),
        localize(locale, "会话已自动建档", "Session auto-created")
      ),
    ensureSessionAndActivateFromDiscovery: (item: {
      readonly rootPath: string;
      readonly name: string;
      readonly appCodeSuggestion: AppBinding["appCode"] | null;
    }) =>
      runAction(
        () => ensureSessionFromDiscovery(item, true),
        localize(locale, "会话已建档并激活", "Session created and activated")
      ),
    activateSession: (id: string) =>
      runAction(() => activateSession(id), t("dashboard.workspace.activationSuccess")),
    archiveSession: (id: string) =>
      runAction(async () => {
        await archiveSessionRecord(id);
      }, t("dashboard.workspace.archiveSuccess")),
    deleteSessionReview: (id: string) => loadDeleteReview("session", id),
    deleteFailoverReview: (id: string) => loadDeleteReview("failover-chain", id),
    deleteMcpServerReview: (id: string) => loadDeleteReview("mcp-server", id),
    deleteMcpBindingReview: (id: string) => loadDeleteReview("mcp-app-binding", id)
  },
  mcpHost: {
    repairGovernanceAll: () =>
      runAction(async () => {
        const result = await applyMcpGovernanceRepairAll();
        openAuditFocus({
          source: "mcp"
        });
        setFollowUpNotice({
          category: "mcp",
          title: localize(locale, "整批 MCP 治理已执行", "Batch MCP Governance Applied"),
          summary:
            result.repairedApps === 0
              ? localize(
                  locale,
                  "当前治理队列里没有可自动执行的整批修复动作，剩余问题更可能需要手工编辑或宿主机同步。",
                  "There was no auto-repair action to execute across the queue. Remaining issues likely need manual edits or host sync."
                )
              : result.hostSyncRequiredApps.length > 0
                ? localize(
                    locale,
                    `已先收敛 ${result.repairedApps} 个应用的控制台配置，但其中 ${result.hostSyncRequiredApps.length} 个应用仍需要继续做宿主机同步。`,
                    `Console-side repair was applied to ${result.repairedApps} app(s), but ${result.hostSyncRequiredApps.length} app(s) still require host sync.`
                  )
                : localize(
                    locale,
                    `已对 ${result.repairedApps} 个应用执行整批 MCP 治理，下一步应确认 runtime、审计和真实请求是否一起收敛。`,
                    `Batch MCP governance was applied to ${result.repairedApps} app(s). Next, confirm runtime, audit, and live requests are converging together.`
                  ),
          actions: [
            {
              id: "mcp-governance-batch-open-panel",
              label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
              kind: "section",
              section: "mcp"
            },
            {
              id: "mcp-governance-batch-open-audit",
              label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
              kind: "audit",
              filters: {
                source: "mcp"
              }
            }
          ]
        });
      }, localize(locale, "整批 MCP 治理已执行", "Batch MCP governance applied")),
    repairGovernance: (appCode: AppBinding["appCode"]) =>
      runAction(async () => {
        const result = await applyMcpGovernanceRepair(appCode);
        openAuditFocus({
          source: "mcp",
          appCode
        });
        setFollowUpNotice({
          category: "mcp",
          title: localize(locale, "MCP 治理修复已执行", "MCP Governance Repair Applied"),
          summary: result.requiresHostSync
            ? localize(
                locale,
                "控制台内的 MCP 冲突已经先做止损，但宿主机托管配置可能仍需重新同步。",
                "Console-side MCP conflicts were contained first, but managed host config may still need to be synced."
              )
            : localize(
                locale,
                "控制台内的 MCP 冲突已经收敛，下一步应确认 runtime 和真实请求是否一起恢复。",
                "Console-side MCP conflicts have converged. Next, confirm runtime and live requests recover together."
              ),
          actions: [
            {
              id: `mcp-governance-follow-section-${appCode}`,
              label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
              kind: "section",
              section: "mcp"
            },
            {
              id: `mcp-governance-follow-audit-${appCode}`,
              label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
              kind: "audit",
              filters: {
                source: "mcp",
                appCode
              }
            },
            {
              id: `mcp-governance-follow-logs-${appCode}`,
              label: localize(locale, "查看该应用请求", "Open App Requests"),
              kind: "app-logs",
              appCode
            }
          ]
        });
      }, localize(locale, "MCP 治理修复已执行", "MCP governance repair applied")),
    importFromHost: (appCode: AppBinding["appCode"]) =>
      runAction(async () => {
        await importMcpFromHost(appCode, mcpImportOptions);
        openAuditFocus({
          source: "mcp",
          appCode
        });
        setFollowUpNotice({
          category: "mcp",
          title: localize(locale, "宿主机 MCP 已导入", "Host MCP Imported"),
          summary: localize(locale, "下一步应检查 MCP 面板和相关审计，确认导入结果与控制台状态一致。", "Next, inspect the MCP panel and related audit events to confirm the imported result matches the console state."),
          actions: [
            {
              id: `mcp-import-follow-section-${appCode}`,
              label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
              kind: "section",
              section: "mcp"
            },
            {
              id: `mcp-import-follow-audit-${appCode}`,
              label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
              kind: "audit",
              filters: {
                source: "mcp",
                appCode
              }
            }
          ]
        });
      }, t("dashboard.mcp.importSuccess")),
    applyHostSync: (appCode: AppBinding["appCode"]) =>
      runAction(async () => {
        await applyHostMcpSync(appCode);
        openAuditFocus({
          source: "mcp",
          appCode
        });
        setFollowUpNotice({
          category: "mcp",
          title: localize(locale, "宿主机 MCP 已同步", "Host MCP Applied"),
          summary: localize(locale, "下一步应检查 MCP runtime、宿主机漂移状态和相关审计事件。", "Next, inspect MCP runtime, host drift state, and related audit events."),
          actions: [
            {
              id: `mcp-apply-follow-section-${appCode}`,
              label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
              kind: "section",
              section: "mcp"
            },
            {
              id: `mcp-apply-follow-audit-${appCode}`,
              label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
              kind: "audit",
              filters: {
                source: "mcp",
                appCode
              }
            }
          ]
        });
      }, t("dashboard.mcp.applySuccess")),
    applyHostSyncAll: () =>
      runAction(async () => {
        const result = await applyHostMcpSyncAll();
        openAuditFocus({
          source: "mcp"
        });
        setFollowUpNotice({
          category: "mcp",
          title: localize(locale, "整批宿主机同步已执行", "Batch Host Sync Applied"),
          summary:
            result.appliedApps.length === 0
              ? localize(
                  locale,
                  "当前没有待同步的宿主机 MCP 变更，控制台与宿主机托管配置看起来已经一致。",
                  "There are no pending host MCP sync changes right now. Console state and managed host config already look aligned."
                )
              : localize(
                  locale,
                  `已对 ${result.appliedApps.length} 个应用执行宿主机同步，下一步应检查 runtime、漂移状态和 MCP 审计是否一起收敛。`,
                  `Host sync was applied for ${result.appliedApps.length} app(s). Next, confirm runtime, drift state, and MCP audit converge together.`
                ),
          actions: [
            {
              id: "mcp-host-sync-batch-open-panel",
              label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
              kind: "section",
              section: "mcp"
            },
            {
              id: "mcp-host-sync-batch-open-audit",
              label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
              kind: "audit",
              filters: {
                source: "mcp"
              }
            }
          ]
        });
      }, localize(locale, "整批宿主机同步已执行", "Batch host sync applied")),
    rollbackHostSync: (appCode: AppBinding["appCode"]) =>
      runAction(async () => {
        await rollbackHostMcpSync(appCode);
        openAuditFocus({
          source: "mcp",
          appCode
        });
        setFollowUpNotice({
          category: "mcp",
          title: localize(locale, "宿主机 MCP 已回滚", "Host MCP Rolled Back"),
          summary: localize(locale, "下一步应确认宿主机配置是否已回到预期状态，并检查 MCP 漂移是否清除。", "Next, confirm the host config has returned to the expected state and verify MCP drift is cleared."),
          actions: [
            {
              id: `mcp-rollback-follow-section-${appCode}`,
              label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
              kind: "section",
              section: "mcp"
            },
            {
              id: `mcp-rollback-follow-audit-${appCode}`,
              label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
              kind: "audit",
              filters: {
                source: "mcp",
                appCode
              }
            }
          ]
        });
      }, t("dashboard.mcp.rollbackSuccess"))
  },
  promptHost: {
    importFromHost: (appCode: AppBinding["appCode"]) =>
      runAction(async () => {
        const result = await importPromptFromHost(appCode);
        setFollowUpNotice({
          category: "asset",
          title: localize(locale, "宿主机 Prompt 已导入", "Host Prompt Imported"),
          summary:
            result.item.status === "matched-existing"
              ? localize(
                  locale,
                  "宿主机 Prompt 内容已与现有资产匹配，没有创建重复 Prompt。下一步应回到资产区确认该对象，再决定是否继续发布到宿主机。",
                  "The host prompt already matches an existing asset, so no duplicate prompt was created. Review that asset in the console before publishing it back to the host."
                )
              : localize(
                  locale,
                  "宿主机 Prompt 已导入为禁用资产，当前不会隐式改变运行态。下一步应审阅这份资产，再决定是否启用或继续下发。",
                  "The host prompt was imported as a disabled asset, so runtime behavior does not change implicitly. Review the asset before enabling or syncing it."
                ),
          actions: [
            {
              id: `prompt-host-import-assets-${appCode}`,
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            },
            {
              id: `prompt-host-import-runtime-${appCode}`,
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            {
              id: `prompt-host-import-audit-${appCode}`,
              label: localize(locale, "查看宿主机审计", "Open Host Audit"),
              kind: "audit",
              filters: {
                source: "host-integration",
                appCode
              }
            }
          ]
        });
      }, localize(locale, "宿主机 Prompt 已导入", "Host prompt imported")),
    applyHostSyncAll: () =>
      runAction(async () => {
        const result = await applyPromptHostSyncAll();
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "整批 Prompt 宿主机同步已执行", "Batch Prompt Host Sync Applied"),
          summary:
            result.appliedApps.length === 0
              ? localize(
                  locale,
                  "当前没有额外 Prompt 宿主机差异需要下发，控制台与宿主机文件已基本一致。",
                  "There is no additional prompt host diff to apply right now. The console and host files are already largely aligned."
                )
              : localize(
                  locale,
                  `已完成 ${result.appliedApps.length} 个应用的 Prompt 宿主机同步。下一步应按应用检查宿主机文件、运行态与审计是否一起收敛。`,
                  `Prompt host sync was applied for ${result.appliedApps.length} app(s). Next, verify host files, runtime, and audit converge together for each app.`
                ),
          actions: [
            {
              id: "prompt-host-apply-all-assets",
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            },
            {
              id: "prompt-host-apply-all-runtime",
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            {
              id: "prompt-host-apply-all-audit",
              label: localize(locale, "查看宿主机审计", "Open Host Audit"),
              kind: "audit",
              filters: {
                source: "host-integration"
              }
            }
          ]
        });
      }, localize(locale, "整批 Prompt 宿主机同步已执行", "Batch prompt host sync applied")),
    applyHostSync: (appCode: AppBinding["appCode"]) =>
      runAction(async () => {
        const result = await applyPromptHostSync(appCode);
        openAuditFocus({
          source: "host-integration",
          appCode
        });
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "宿主机 Prompt 已同步", "Host Prompt Applied"),
          summary:
            result.ignoredSkillId !== null
              ? localize(
                  locale,
                  "Prompt 已写入宿主机文件，但关联 Skill 仍保持代理侧注入。下一步应同时验证宿主机文件、运行态与真实请求。",
                  "The prompt was written to the host file, but the linked skill still remains proxy-only. Validate the host file, runtime, and live requests together next."
                )
              : localize(
                  locale,
                  "Prompt 已写入宿主机文件。下一步应确认当前 CLI 已读取新的宿主机 Prompt，并检查运行态和审计事件是否一致。",
                  "The prompt was written to the host file. Confirm the CLI is now reading the new host prompt and check that runtime and audit events stay aligned."
                ),
          actions: [
            {
              id: `prompt-host-apply-assets-${appCode}`,
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            },
            {
              id: `prompt-host-apply-runtime-${appCode}`,
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            {
              id: `prompt-host-apply-audit-${appCode}`,
              label: localize(locale, "查看宿主机审计", "Open Host Audit"),
              kind: "audit",
              filters: {
                source: "host-integration",
                appCode
              }
            }
          ]
        });
      }, localize(locale, "宿主机 Prompt 已同步", "Host prompt applied")),
    rollbackHostSync: (appCode: AppBinding["appCode"]) =>
      runAction(async () => {
        await rollbackPromptHostSync(appCode);
        openAuditFocus({
          source: "host-integration",
          appCode
        });
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "宿主机 Prompt 已回滚", "Host Prompt Rolled Back"),
          summary: localize(
            locale,
            "宿主机 Prompt 文件已恢复到上一份状态。下一步应确认 CLI 行为、宿主机文件与回滚审计是否一致。",
            "The host prompt file was restored to its previous state. Confirm CLI behavior, the host file, and rollback audit events stay aligned."
          ),
          actions: [
            {
              id: `prompt-host-rollback-assets-${appCode}`,
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            },
            {
              id: `prompt-host-rollback-runtime-${appCode}`,
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            {
              id: `prompt-host-rollback-audit-${appCode}`,
              label: localize(locale, "查看宿主机审计", "Open Host Audit"),
              kind: "audit",
              filters: {
                source: "host-integration",
                appCode
              }
            }
          ]
        });
      }, localize(locale, "宿主机 Prompt 已回滚", "Host prompt rolled back"))
  },
  runtime: {
    recoverProvider: (providerId: string) =>
      runAction(async () => {
        await recoverProviderHealth(providerId);
        refreshProviderDiagnosticDetail(providerId);
        focusProviderFailureLogs(providerId);
        openAuditFocus({
          source: "provider-health",
          providerId
        });
        setFollowUpNotice({
          category: "provider",
          title: localize(locale, "Provider 已恢复", "Provider Recovered"),
          summary: localize(locale, "下一步应回到接管闭环验证路径，确认 Provider runtime、健康事件和真实请求结果正在一起改善。", "Next, return to the takeover verification loop and confirm provider runtime, health events, and real request outcomes are improving together."),
          actions: [
            {
              id: `runtime-recover-provider-${providerId}`,
              label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
              kind: "provider-runtime",
              providerId
            },
            {
              id: `runtime-recover-logs-${providerId}`,
              label: localize(locale, "查看失败请求", "Open Failure Logs"),
              kind: "provider-logs",
              providerId
            },
            {
              id: `runtime-recover-traffic-${providerId}`,
              label: localize(locale, "回到流量验证", "Back To Traffic Verification"),
              kind: "section",
              section: "traffic"
            }
          ]
        });
      }, t("dashboard.runtime.recoverSuccess")),
    isolateProvider: (providerId: string) =>
      runAction(async () => {
        await isolateProviderHealth(providerId, {
          reason: `Operator isolated ${providerId} from dashboard`
        });
        refreshProviderDiagnosticDetail(providerId);
        focusProviderFailureLogs(providerId);
        openAuditFocus({
          source: "provider-health",
          providerId
        });
        setFollowUpNotice({
          category: "provider",
          title: localize(locale, "Provider 已隔离", "Provider Isolated"),
          summary: localize(locale, "下一步应确认请求是否已经停止继续命中该 Provider，并观察故障转移是否接管。", "Next, confirm requests have stopped hitting this provider and verify failover is taking over."),
          actions: [
            {
              id: `runtime-isolate-provider-${providerId}`,
              label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
              kind: "provider-runtime",
              providerId
            },
            {
              id: `runtime-isolate-logs-${providerId}`,
              label: localize(locale, "查看失败请求", "Open Failure Logs"),
              kind: "provider-logs",
              providerId
            }
          ]
        });
      }, t("dashboard.runtime.isolateSuccess")),
    resetProvider: (providerId: string) =>
      runAction(async () => {
        await resetProviderHealth(providerId, {
          reason: `Operator reset ${providerId} from dashboard`
        });
        refreshProviderDiagnosticDetail(providerId);
        focusProviderFailureLogs(providerId);
        openAuditFocus({
          source: "provider-health",
          providerId
        });
        setFollowUpNotice({
          category: "provider",
          title: localize(locale, "Provider 已重置", "Provider Reset"),
          summary: localize(locale, "下一步应确认熔断状态是否已清空，并观察新的请求结果。", "Next, confirm the circuit state is cleared and inspect new request outcomes."),
          actions: [
            {
              id: `runtime-reset-provider-${providerId}`,
              label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
              kind: "provider-runtime",
              providerId
            },
            {
              id: `runtime-reset-logs-${providerId}`,
              label: localize(locale, "查看失败请求", "Open Failure Logs"),
              kind: "provider-logs",
              providerId
            }
          ]
        });
      }, t("dashboard.runtime.resetSuccess")),
    probeProvider: (providerId: string) =>
      runAction(async () => {
        await probeProviderHealth(providerId);
        refreshProviderDiagnosticDetail(providerId);
        openAuditFocus({
          source: "provider-health",
          providerId
        });
        setFollowUpNotice({
          category: "provider",
          title: localize(locale, "Provider 已探测", "Provider Probed"),
          summary: localize(locale, "下一步应回到接管闭环验证路径，确认探测结果、运行态和真实请求结果是否一致。", "Next, return to the takeover verification loop and confirm the probe result, runtime, and real request outcomes are aligned."),
          actions: [
            {
              id: `runtime-probe-provider-${providerId}`,
              label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
              kind: "provider-runtime",
              providerId
            },
            {
              id: `runtime-probe-audit-${providerId}`,
              label: localize(locale, "查看健康审计", "Open Health Audit"),
              kind: "audit",
              filters: {
                source: "provider-health",
                providerId
              }
            },
            {
              id: `runtime-probe-traffic-${providerId}`,
              label: localize(locale, "回到流量验证", "Back To Traffic Verification"),
              kind: "section",
              section: "traffic"
            }
          ]
        });
      }, t("dashboard.runtime.probeSuccess")),
    closeProviderDetail: () => {
      setSelectedProviderDiagnosticId(null);
      setSelectedProviderDiagnosticDetail(null);
    },
    applyHostCliManagedConfig: (appCode: string) =>
      runAction(async () => {
        await applyHostCliManagedConfig(appCode as AppBinding["appCode"]);
        openAuditFocus({
          source: "host-integration",
          appCode: appCode as AppBinding["appCode"]
        });
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "宿主机接管已应用", "Host Takeover Applied"),
          summary:
            appCode === "claude-code"
              ? localize(
                  locale,
                  "下一步应进入接管闭环验证，确认 Claude Code 已切到本地网关、真实请求已进入代理，并验证初次安装确认已被跳过。",
                  "Next, enter the takeover verification loop and confirm Claude Code is pointed at the local gateway, real requests are reaching the proxy, and the first-run confirmation is bypassed."
                )
              : localize(
                  locale,
                  "下一步应进入接管闭环验证，确认宿主机配置已切到本地网关，并检查真实请求与接管事件是否一致。",
                  "Next, enter the takeover verification loop and confirm the host configuration points to the local gateway while real requests and takeover events stay aligned."
                ),
          actions: [
            {
              id: `host-apply-audit-${appCode}`,
              label: localize(locale, "查看宿主机审计", "Open Host Audit"),
              kind: "audit",
              filters: {
                source: "host-integration",
                appCode: appCode as AppBinding["appCode"]
              }
            },
            {
              id: `host-apply-runtime-${appCode}`,
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            {
              id: `host-apply-traffic-${appCode}`,
              label: localize(locale, "查看流量验证", "Open Traffic Verification"),
              kind: "app-logs",
              appCode: appCode as AppBinding["appCode"]
            }
          ]
        });
      }, t("dashboard.discovery.applySuccess")),
    rollbackHostCliManagedConfig: (appCode: string) =>
      runAction(async () => {
        await rollbackHostCliManagedConfig(appCode as AppBinding["appCode"]);
        openAuditFocus({
          source: "host-integration",
          appCode: appCode as AppBinding["appCode"]
        });
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "宿主机接管已回滚", "Host Takeover Rolled Back"),
          summary:
            appCode === "claude-code"
              ? localize(
                  locale,
                  "下一步应确认 Claude Code 已恢复原始配置，并验证初次安装确认状态也已恢复。",
                  "Next, confirm Claude Code is back on its original configuration and verify the first-run confirmation state is restored."
                )
              : localize(
                  locale,
                  "下一步应确认宿主机配置已经回到原始状态，并检查回滚事件是否落库。",
                  "Next, confirm the host configuration has been restored and inspect the recorded rollback event."
                ),
          actions: [
            {
              id: `host-rollback-audit-${appCode}`,
              label: localize(locale, "查看宿主机审计", "Open Host Audit"),
              kind: "audit",
              filters: {
                source: "host-integration",
                appCode: appCode as AppBinding["appCode"]
              }
            },
            {
              id: `host-rollback-runtime-${appCode}`,
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            }
          ]
        });
      }, t("dashboard.discovery.rollbackSuccess")),
    activateWorkspace: (workspaceId: string) =>
      runAction(async () => {
        await activateWorkspace(workspaceId);
        refreshWorkspaceRuntimeDetail(workspaceId);
      }, t("dashboard.workspace.activationSuccess")),
    closeWorkspaceRuntimeDetail: () => setSelectedWorkspaceRuntimeDetail(null),
    activateSession: (sessionId: string) =>
      runAction(async () => {
        await activateSession(sessionId);
        refreshSessionRuntimeDetail(sessionId);
      }, t("dashboard.workspace.activationSuccess")),
    archiveSession: (sessionId: string) =>
      runAction(async () => {
        await archiveSessionRecord(sessionId);
        setSelectedSessionRuntimeDetail(null);
      }, t("dashboard.workspace.archiveSuccess")),
    closeSessionRuntimeDetail: () => setSelectedSessionRuntimeDetail(null)
  },
  assets: {
    repairGovernance: (appCode?: AppBinding["appCode"]) =>
      runAction(async () => {
        const result = await applyAssetGovernanceRepair(appCode);
        if (appCode) {
          focusAppLogs(appCode);
        }
        setFollowUpNotice({
          category: "asset",
          title: localize(locale, "资产治理修复已执行", "Asset Governance Repair Applied"),
          summary:
            result.repairedItems === 0
              ? result.remainingManualItems > 0
                ? localize(
                    locale,
                    "当前高风险资产里没有适合自动执行的保守修复动作，剩余问题需要人工确认 Prompt / Skill 继承链。",
                    "No conservative auto-repair action was safe to apply. Remaining issues still need manual prompt/skill review."
                  )
                : localize(
                    locale,
                    "当前资产治理队列里没有需要修复的高风险项。",
                    "There are no high-risk asset issues that require repair right now."
                  )
              : result.remainingManualItems > 0
                ? localize(
                    locale,
                    `已自动修复 ${result.repairedItems} 个高风险资产，但仍有 ${result.remainingManualItems} 个问题需要人工处理。`,
                    `Automatically repaired ${result.repairedItems} high-risk asset(s), but ${result.remainingManualItems} item(s) still need manual handling.`
                  )
                : localize(
                    locale,
                    `已自动修复 ${result.repairedItems} 个高风险资产，下一步应确认工作区、会话和真实流量是否一起收敛。`,
                    `Automatically repaired ${result.repairedItems} high-risk asset(s). Next, confirm workspaces, sessions, and live traffic converge together.`
                  ),
          actions: [
            {
              id: `asset-governance-assets-${appCode ?? "all"}`,
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            },
            {
              id: `asset-governance-runtime-${appCode ?? "all"}`,
              label: localize(locale, "查看运行态", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            ...(appCode
              ? [
                  {
                    id: `asset-governance-logs-${appCode}`,
                    label: localize(locale, "查看该应用请求", "Open App Logs"),
                    kind: "app-logs" as const,
                    appCode
                  }
                ]
              : [])
          ]
        });
      }, localize(locale, "资产治理修复已执行", "Asset governance repair applied")),
    saveWorkspace: () =>
      runAction(
        async () => {
          await saveWorkspace({
            ...workspaceForm,
            tags: splitProviderIds(workspaceTagsText)
          });
          refreshWorkspaceRuntimeDetail(workspaceForm.id);
          focusWorkspaceLogs(workspaceForm.id);
          setFollowUpNotice({
            category: "workspace",
            title: localize(locale, "工作区已保存", "Workspace Saved"),
            summary: localize(locale, "下一步应验证工作区运行态和相关请求是否恢复到预期上下文。", "Next, validate workspace runtime and related requests to confirm the expected context has been restored."),
            actions: [
              {
                id: "workspace-follow-runtime",
                label: localize(locale, "打开工作区运行态", "Open Workspace Runtime"),
                kind: "workspace-runtime",
                workspaceId: workspaceForm.id,
                ...(workspaceForm.appCode ? { appCode: workspaceForm.appCode } : {})
              },
              {
                id: "workspace-follow-logs",
                label: localize(locale, "查看工作区请求", "Open Workspace Logs"),
                kind: "workspace-logs",
                workspaceId: workspaceForm.id,
                ...(workspaceForm.appCode ? { appCode: workspaceForm.appCode } : {})
              },
              {
                id: "workspace-follow-assets",
                label: localize(locale, "返回上下文资产", "Back To Context Assets"),
                kind: "section",
                section: "assets"
              }
            ]
          });
        },
        t("dashboard.forms.saveSuccess")
      ),
    saveSession: () =>
      runAction(async () => {
        await saveSessionRecord(sessionForm);
        refreshSessionRuntimeDetail(sessionForm.id);
        focusSessionLogs(sessionForm.id);
        setFollowUpNotice({
          category: "session",
          title: localize(locale, "会话已保存", "Session Saved"),
          summary: localize(locale, "下一步应确认会话是否重新命中了正确工作区、Provider 和上下文资产。", "Next, confirm the session is again resolving to the correct workspace, provider, and context assets."),
          actions: [
            {
              id: "session-follow-runtime",
              label: localize(locale, "打开会话运行态", "Open Session Runtime"),
              kind: "session-runtime",
              sessionId: sessionForm.id,
              appCode: sessionForm.appCode
            },
            {
              id: "session-follow-logs",
              label: localize(locale, "查看会话请求", "Open Session Logs"),
              kind: "session-logs",
              sessionId: sessionForm.id,
              appCode: sessionForm.appCode
            },
            {
              id: "session-follow-assets",
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess")),
    savePromptTemplate: () =>
      runAction(
        async () => {
          await savePromptTemplate({
            ...promptTemplateForm,
            tags: splitProviderIds(promptTagsText),
            appCode: promptTemplateForm.appCode
          });
          if (promptTemplateForm.appCode) {
            focusAppLogs(promptTemplateForm.appCode);
          }
          setFollowUpNotice({
            category: "app-traffic",
            title: localize(locale, "Prompt 已保存", "Prompt Saved"),
            summary: localize(locale, "下一步应验证引用它的技能和对应应用流量是否仍命中正确 Prompt。", "Next, validate that referencing skills and app traffic still resolve to the correct prompt."),
            actions: [
              ...(promptTemplateForm.appCode
                ? [
                    {
                      id: "prompt-follow-logs",
                      label: localize(locale, "查看该应用请求", "Open App Logs"),
                      kind: "app-logs" as const,
                      appCode: promptTemplateForm.appCode
                    }
                  ]
                : []),
              {
                id: "prompt-follow-assets",
                label: localize(locale, "检查 Prompt / Skill 资产", "Review Prompt / Skill Assets"),
                kind: "section",
                section: "assets"
              }
            ]
          });
        },
        t("dashboard.forms.saveSuccess")
      ),
    savePromptTemplateItem: (input: PromptTemplateUpsert) =>
      runAction(
        async () => {
          await savePromptTemplate(input);
          if (input.appCode) {
            focusAppLogs(input.appCode);
          }
          setFollowUpNotice({
            category: "asset",
            title: localize(locale, "Prompt 治理动作已执行", "Prompt Governance Action Applied"),
            summary: localize(
              locale,
              "共享 Prompt 已按治理动作更新，下一步应确认关联 Skill、工作区和真实请求是否一起收敛。",
              "The shared prompt has been updated through a governance action. Next, confirm linked skills, workspaces, and live requests converge together."
            ),
            actions: [
              ...(input.appCode
                ? [
                    {
                      id: `prompt-governance-logs-${input.id}`,
                      label: localize(locale, "查看该应用请求", "Open App Logs"),
                      kind: "app-logs" as const,
                      appCode: input.appCode
                    }
                  ]
                : []),
              {
                id: `prompt-governance-assets-${input.id}`,
                label: localize(locale, "返回上下文资产", "Back To Context Assets"),
                kind: "section",
                section: "assets"
              }
            ]
          });
        },
        t("dashboard.forms.saveSuccess")
      ),
    restorePromptTemplateVersion: (promptTemplateId: string, versionNumber: number) =>
      runAction(async () => {
        await restorePromptTemplateVersion(promptTemplateId, versionNumber);
        const restoredPromptAppCode =
          promptTemplateForm.id === promptTemplateId ? promptTemplateForm.appCode : null;
        if (restoredPromptAppCode) {
          focusAppLogs(restoredPromptAppCode);
        }
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "Prompt 版本已恢复", "Prompt Version Restored"),
          summary: localize(locale, "下一步应确认引用该 Prompt 链路的技能、工作区和请求流量是否已经重新收敛。", "Next, confirm skills, workspaces, and request traffic that rely on this prompt chain have converged again."),
          actions: [
            ...(restoredPromptAppCode
              ? [
                  {
                    id: "prompt-restore-follow-logs",
                    label: localize(locale, "查看该应用请求", "Open App Logs"),
                    kind: "app-logs" as const,
                    appCode: restoredPromptAppCode
                  }
                ]
              : []),
            {
              id: "prompt-restore-follow-assets",
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess")),
    saveSkill: () =>
      runAction(
        async () => {
          await saveSkill({
            ...skillForm,
            tags: splitProviderIds(skillTagsText)
          });
          if (skillForm.appCode) {
            focusAppLogs(skillForm.appCode);
          }
          setFollowUpNotice({
            category: "app-traffic",
            title: localize(locale, "Skill 已保存", "Skill Saved"),
            summary: localize(locale, "下一步应验证工作区、会话和目标应用流量是否仍解析到正确 Skill。", "Next, validate that workspaces, sessions, and target app traffic still resolve to the correct skill."),
            actions: [
              ...(skillForm.appCode
                ? [
                    {
                      id: "skill-follow-logs",
                      label: localize(locale, "查看该应用请求", "Open App Logs"),
                      kind: "app-logs" as const,
                      appCode: skillForm.appCode
                    }
                  ]
                : []),
              {
                id: "skill-follow-assets",
                label: localize(locale, "检查 Skill 资产", "Review Skill Assets"),
                kind: "section",
                section: "assets"
              }
            ]
          });
        },
        t("dashboard.forms.saveSuccess")
      ),
    saveSkillItem: (input: SkillUpsert) =>
      runAction(
        async () => {
          await saveSkill(input);
          if (input.appCode) {
            focusAppLogs(input.appCode);
          }
          setFollowUpNotice({
            category: "asset",
            title: localize(locale, "Skill 治理动作已执行", "Skill Governance Action Applied"),
            summary: localize(
              locale,
              "Skill 已按治理动作更新，下一步应确认工作区、会话和目标应用流量是否重新解析到正确链路。",
              "The skill has been updated through a governance action. Next, confirm workspaces, sessions, and target app traffic resolve back to the right chain."
            ),
            actions: [
              ...(input.appCode
                ? [
                    {
                      id: `skill-governance-logs-${input.id}`,
                      label: localize(locale, "查看该应用请求", "Open App Logs"),
                      kind: "app-logs" as const,
                      appCode: input.appCode
                    }
                  ]
                : []),
              {
                id: `skill-governance-assets-${input.id}`,
                label: localize(locale, "返回上下文资产", "Back To Context Assets"),
                kind: "section",
                section: "assets"
              }
            ]
          });
        },
        t("dashboard.forms.saveSuccess")
      ),
    restoreSkillVersion: (skillId: string, versionNumber: number) =>
      runAction(async () => {
        await restoreSkillVersion(skillId, versionNumber);
        const restoredSkillAppCode = skillForm.id === skillId ? skillForm.appCode : null;
        if (restoredSkillAppCode) {
          focusAppLogs(restoredSkillAppCode);
        }
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "Skill 版本已恢复", "Skill Version Restored"),
          summary: localize(locale, "下一步应确认工作区、会话和目标应用流量是否重新解析到恢复后的 Skill。", "Next, confirm workspaces, sessions, and target app traffic resolve to the restored skill again."),
          actions: [
            ...(restoredSkillAppCode
              ? [
                  {
                    id: "skill-restore-follow-logs",
                    label: localize(locale, "查看该应用请求", "Open App Logs"),
                    kind: "app-logs" as const,
                    appCode: restoredSkillAppCode
                  }
                ]
              : []),
            {
              id: "skill-restore-follow-assets",
              label: localize(locale, "返回上下文资产", "Back To Context Assets"),
              kind: "section",
              section: "assets"
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess"))
  },
  mcpForms: {
    saveMcpServer: () =>
      runAction(
        async () => {
          await saveMcpServer({
            ...mcpServerForm,
            env: parseJsonRecord(mcpEnvText),
            headers: parseJsonRecord(mcpHeadersText),
            command: mcpServerForm.transport === "stdio" ? mcpServerForm.command : null,
            url: mcpServerForm.transport === "http" ? mcpServerForm.url : null
          });
          openAuditFocus({
            source: "mcp"
          });
          setFollowUpNotice({
            category: "mcp",
            title: localize(locale, "MCP Server 已保存", "MCP Server Saved"),
            summary: localize(locale, "下一步应验证 MCP 运行态、宿主机差异和相关审计事件是否一致。", "Next, validate MCP runtime, host drift preview, and related audit events for consistency."),
            actions: [
              {
                id: "mcp-server-follow-section",
                label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
                kind: "section",
                section: "mcp"
              },
              {
                id: "mcp-server-follow-audit",
                label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
                kind: "audit",
                filters: {
                  source: "mcp"
                }
              }
            ]
          });
        },
        t("dashboard.forms.saveSuccess")
      ),
    saveMcpBinding: () => {
      if (snapshotMcpServersLength === 0) {
        setErrorMessage(t("dashboard.mcp.bindingRequiresServer"));
        return;
      }
      return runAction(
        async () => {
          await saveAppMcpBinding(mcpBindingForm);
          openAuditFocus({
            source: "mcp",
            appCode: mcpBindingForm.appCode
          });
          setFollowUpNotice({
            category: "mcp",
            title: localize(locale, "MCP Binding 已保存", "MCP Binding Saved"),
            summary: localize(locale, "下一步应验证该应用的 MCP 运行态和宿主机同步结果。", "Next, validate MCP runtime and host sync result for this app."),
            actions: [
              {
                id: "mcp-binding-follow-section",
                label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
                kind: "section",
                section: "mcp"
              },
              {
                id: "mcp-binding-follow-audit",
                label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
                kind: "audit",
                filters: {
                  source: "mcp",
                  appCode: mcpBindingForm.appCode
                }
              }
            ]
          });
        },
        t("dashboard.forms.saveSuccess")
      );
    }
  },
  routing: {
    saveProvider: () =>
      runAction(async () => {
        await saveProvider(providerForm);
        refreshProviderDiagnosticDetail(providerForm.id);
        focusProviderFailureLogs(providerForm.id);
        openAuditFocus({
          source: "provider-health",
          providerId: providerForm.id
        });
        setFollowUpNotice({
          category: "provider",
          title: localize(locale, "Provider 已保存", "Provider Saved"),
          summary: localize(locale, "下一步应验证 Provider 运行态、失败请求和健康事件是否同步恢复。", "Next, validate provider runtime, failure requests, and health events to confirm recovery."),
          actions: [
            {
              id: "provider-follow-runtime",
              label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
              kind: "provider-runtime",
              providerId: providerForm.id
            },
            {
              id: "provider-follow-logs",
              label: localize(locale, "查看失败请求", "Open Failure Logs"),
              kind: "provider-logs",
              providerId: providerForm.id
            },
            {
              id: "provider-follow-audit",
              label: localize(locale, "查看健康审计", "Open Health Audit"),
              kind: "audit",
              filters: {
                source: "provider-health",
                providerId: providerForm.id
              }
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess")),
    saveBinding: () => {
      if (!hasProviders) {
        setErrorMessage(t("dashboard.onboarding.bindingRequiresProvider"));
        return;
      }
      return runAction(async () => {
        await saveBinding(bindingForm);
        focusAppLogs(bindingForm.appCode);
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "Binding 已保存", "Binding Saved"),
          summary: localize(locale, "下一步应回到接管闭环验证，确认目标应用流量已经命中新主路由、上下文对象和本地代理。", "Next, return to the takeover verification loop and confirm target app traffic is hitting the new primary route, context objects, and local proxy."),
          actions: [
            {
              id: "binding-follow-logs",
              label: localize(locale, "查看流量验证", "Open Traffic Verification"),
              kind: "app-logs",
              appCode: bindingForm.appCode
            },
            {
              id: "binding-follow-runtime",
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            {
              id: "binding-follow-routing",
              label: localize(locale, "返回路由面板", "Back To Routing"),
              kind: "section",
              section: "routing"
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess"));
    },
    saveAppQuota: () =>
      runAction(async () => {
        await saveAppQuota(appQuotaForm);
        focusAppLogs(appQuotaForm.appCode);
        openAuditFocus({
          source: "quota",
          appCode: appQuotaForm.appCode
        });
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "配额已保存", "Quota Saved"),
          summary: localize(locale, "下一步应验证配额审计和目标应用流量是否已经回到健康窗口。", "Next, validate quota audit and target app traffic to confirm the window has returned to a healthy state."),
          actions: [
            {
              id: "quota-follow-audit",
              label: localize(locale, "查看配额审计", "Open Quota Audit"),
              kind: "audit",
              filters: {
                source: "quota",
                appCode: appQuotaForm.appCode
              }
            },
            {
              id: "quota-follow-logs",
              label: localize(locale, "查看该应用请求", "Open App Logs"),
              kind: "app-logs",
              appCode: appQuotaForm.appCode
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess")),
    saveProxyPolicy: () =>
      runAction(async () => {
        await saveProxyPolicy(proxyForm);
        openAuditFocus({
          source: "proxy-request"
        });
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "代理策略已保存", "Proxy Policy Saved"),
          summary: localize(locale, "下一步应验证流量面板和恢复面板，确认新的代理策略正在按预期生效。", "Next, validate the traffic and recovery panels to confirm the new proxy policy is taking effect as expected."),
          actions: [
            {
              id: "proxy-follow-traffic",
              label: localize(locale, "打开流量面板", "Open Traffic Panel"),
              kind: "section",
              section: "traffic"
            },
            {
              id: "proxy-follow-recovery",
              label: localize(locale, "打开恢复面板", "Open Recovery"),
              kind: "section",
              section: "recovery"
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess")),
    saveFailover: () => {
      if (!hasProviders) {
        setErrorMessage(t("dashboard.onboarding.failoverRequiresProvider"));
        return;
      }
      return runAction(async () => {
        await saveFailoverChain(failoverForm);
        focusAppLogs(failoverForm.appCode);
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "故障转移链已保存", "Failover Chain Saved"),
          summary: localize(locale, "下一步应回到接管闭环验证，确认目标应用请求、Provider 运行态和故障转移链正在一起兜底。", "Next, return to the takeover verification loop and confirm target app requests, provider runtime, and failover behavior are protecting traffic together."),
          actions: [
            {
              id: "failover-follow-logs",
              label: localize(locale, "查看流量验证", "Open Traffic Verification"),
              kind: "app-logs",
              appCode: failoverForm.appCode
            },
            {
              id: "failover-follow-recovery",
              label: localize(locale, "打开恢复面板", "Open Recovery"),
              kind: "section",
              section: "recovery"
            },
            {
              id: "failover-follow-routing",
              label: localize(locale, "返回路由面板", "Back To Routing"),
              kind: "section",
              section: "routing"
            }
          ]
        });
      }, t("dashboard.forms.saveSuccess"));
    }
  },
  recovery: {
    onImportTextChange: (value: string) => {
      setImportText(value);
      setImportPreview(null);
      setImportPreviewSourceText("");
    },
    exportConfig: () =>
      runAction(async () => {
        const configPackage = await exportCurrentConfig();
        setExportText(toJsonString(configPackage));
      }, t("dashboard.forms.exportSuccess")),
    previewImport: () => loadImportPreview(t("dashboard.snapshots.selectedVersionNotice")),
    importConfig: () =>
      runAction(async () => {
        const parsed = JSON.parse(importText) as unknown;
        await importConfigPackage(parsed);
        openAuditFocus({
          source: "proxy-request"
        });
        setFollowUpNotice({
          category: "recovery",
          title: localize(locale, "配置已导入", "Config Imported"),
          summary: localize(locale, "下一步应优先查看恢复面板、运行时和流量面板，确认导入后的真实生效状态。", "Next, inspect recovery, runtime, and traffic panels to confirm the real post-import state."),
          actions: [
            {
              id: "recovery-import-follow-recovery",
              label: localize(locale, "打开恢复面板", "Open Recovery"),
              kind: "section",
              section: "recovery"
            },
            {
              id: "recovery-import-follow-runtime",
              label: localize(locale, "打开运行时面板", "Open Runtime Panel"),
              kind: "section",
              section: "runtime"
            },
            {
              id: "recovery-import-follow-traffic",
              label: localize(locale, "打开流量面板", "Open Traffic Panel"),
              kind: "section",
              section: "traffic"
            }
          ]
        });
      }, t("dashboard.forms.importSuccess")),
    restoreSnapshot: () =>
      runAction(async () => {
        if (selectedSnapshotVersion === null) {
          return;
        }
        await restoreSnapshotVersion(selectedSnapshotVersion);
        setSelectedSnapshotVersion(null);
        openAuditFocus({
          source: "proxy-request"
        });
        setFollowUpNotice({
          category: "recovery",
          title: localize(locale, "快照已恢复", "Snapshot Restored"),
          summary: localize(locale, "下一步应检查恢复后的运行态、流量和相关编辑面板，确认系统已回到预期状态。", "Next, inspect runtime, traffic, and related edit panels to confirm the system has returned to the expected state."),
          actions: [
            {
              id: "recovery-restore-follow-recovery",
              label: localize(locale, "打开恢复面板", "Open Recovery"),
              kind: "section",
              section: "recovery"
            },
            {
              id: "recovery-restore-follow-runtime",
              label: localize(locale, "打开运行时面板", "Open Runtime Panel"),
              kind: "section",
              section: "runtime"
            },
            {
              id: "recovery-restore-follow-traffic",
              label: localize(locale, "打开流量面板", "Open Traffic Panel"),
              kind: "section",
              section: "traffic"
            }
          ]
        });
      }, t("dashboard.forms.restoreSuccess")),
    inspectSnapshot: (version: number) => {
      setSelectedSnapshotVersion(version);
      setNoticeMessage(t("dashboard.snapshots.selectedVersionNotice"));
    },
    prepareRestoreSnapshot: (version: number) => {
      setSelectedSnapshotVersion(version);
      setNoticeMessage(t("dashboard.forms.restoreReviewReady"));
    }
  }
  };
};
