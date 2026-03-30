import { useEffect, useState } from "react";

import type {
  AppBinding,
  AppQuotaUpsert,
  AuditEventPage,
  ConfigDeletePreview,
  ConfigImportPreview,
  McpImportPreview,
  McpImportOptions,
  McpVerificationHistoryPage,
  ProviderUpsert,
  ProviderDiagnosticDetail,
  ProxyRequestLogPage,
  UsageRecordPage,
  UsageSummary,
  UsageTimeseries
} from "cc-switch-web-shared";

import {
  DASHBOARD_AUDIT_PREVIEW_LIMIT,
  DASHBOARD_REQUEST_LOG_PREVIEW_LIMIT,
  DASHBOARD_USAGE_PREVIEW_LIMIT,
  deleteAppMcpBinding,
  deleteAppQuota,
  deleteBinding,
  deleteFailoverChain,
  deleteMcpServer,
  deletePromptTemplate,
  deleteProvider,
  deleteSessionRecord,
  deleteSkill,
  deleteWorkspace,
  loadAuditEvents,
  loadDashboardSnapshot,
  loadMcpVerificationHistory,
  loadProviderDiagnosticDetail,
  loadProxyRequestLogs,
  loadSessionRuntimeDetail,
  loadUsageRecords,
  loadUsageSummary,
  loadUsageTimeseries,
  loadWorkspaceRuntimeDetail,
  previewDeleteAppMcpBinding,
  previewDeleteAppQuota,
  previewDeleteBinding,
  previewDeleteFailoverChain,
  previewDeleteMcpServer,
  previewDeletePromptTemplate,
  previewDeleteProvider,
  previewDeleteSessionRecord,
  previewDeleteSkill,
  previewDeleteWorkspace,
  previewImportConfigPackage,
  previewMcpImportFromHost,
  type DashboardSnapshot,
  type SessionRuntimeDetail,
  type WorkspaceRuntimeDetail
} from "../api/load-dashboard-snapshot.js";
import {
  UnauthorizedApiError
} from "../../../shared/lib/api.js";
import {
  resolveProxyPolicyFormFromBootstrap,
  syncAppQuotaFormWithBootstrap,
  syncProviderFormWithBootstrap,
  syncBindingFormWithBootstrap,
  syncFailoverFormWithBootstrap,
  syncMcpBindingFormWithBootstrap,
  syncPromptTemplateEditorWithBootstrap,
  syncSessionFormWithBootstrap,
  syncSkillEditorWithBootstrap,
  syncWorkspaceEditorWithBootstrap
} from "../lib/editorConsistency.js";
import { readDashboardEditorSelection } from "../lib/editorBootstrapStorage.js";

const toIsoDateTime = (value: string): string | undefined =>
  value.trim().length === 0 ? undefined : new Date(value).toISOString();

type RequestLogFilters = {
  readonly appCode: string;
  readonly providerId: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly outcome: string;
  readonly method: string;
  readonly limit: number;
  readonly offset: number;
};

type AuditFilters = {
  readonly source: string;
  readonly appCode: string;
  readonly providerId: string;
  readonly level: string;
  readonly limit: number;
  readonly offset: number;
};

type UsageFilters = {
  readonly appCode: string;
  readonly providerId: string;
  readonly model: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly bucket: "hour" | "day";
  readonly limit: number;
  readonly offset: number;
};

type PendingDeleteReview = {
  readonly kind: ConfigDeletePreview["targetType"];
  readonly id: string;
  readonly preview: ConfigDeletePreview;
};

type UseDashboardDataRuntimeParams = {
  readonly setErrorMessage: (message: string | null) => void;
  readonly setNoticeMessage: (message: string | null) => void;
  readonly importText: string;
  readonly mcpImportOptions: McpImportOptions;
  readonly setProviderForm: React.Dispatch<React.SetStateAction<ProviderUpsert>>;
  readonly setBindingForm: React.Dispatch<React.SetStateAction<{
    id: string;
    appCode: AppBinding["appCode"];
    providerId: string;
    mode: "managed" | "observe";
  }>>;
  readonly setAppQuotaForm: React.Dispatch<React.SetStateAction<AppQuotaUpsert>>;
  readonly setMcpBindingForm: React.Dispatch<React.SetStateAction<{
    id: string;
    appCode: AppBinding["appCode"];
    serverId: string;
    enabled: boolean;
  }>>;
  readonly setFailoverForm: React.Dispatch<React.SetStateAction<{
    id: string;
    appCode: AppBinding["appCode"];
    enabled: boolean;
    providerIds: string[];
    cooldownSeconds: number;
    maxAttempts: number;
  }>>;
  readonly setProxyForm: React.Dispatch<React.SetStateAction<{
    listenHost: string;
    listenPort: number;
    enabled: boolean;
    requestTimeoutMs: number;
    failureThreshold: number;
  }>>;
  readonly promptTemplateForm: {
    readonly id: string;
    readonly name: string;
    readonly appCode: AppBinding["appCode"] | null;
    readonly locale: "zh-CN" | "en-US";
    readonly content: string;
    readonly tags: string[];
    readonly enabled: boolean;
  };
  readonly promptTagsText: string;
  readonly setPromptTemplateForm: React.Dispatch<React.SetStateAction<{
    id: string;
    name: string;
    appCode: AppBinding["appCode"] | null;
    locale: "zh-CN" | "en-US";
    content: string;
    tags: string[];
    enabled: boolean;
  }>>;
  readonly setPromptTagsText: React.Dispatch<React.SetStateAction<string>>;
  readonly skillForm: {
    readonly id: string;
    readonly name: string;
    readonly appCode: AppBinding["appCode"] | null;
    readonly promptTemplateId: string | null;
    readonly content: string;
    readonly tags: string[];
    readonly enabled: boolean;
  };
  readonly skillTagsText: string;
  readonly setSkillForm: React.Dispatch<React.SetStateAction<{
    id: string;
    name: string;
    appCode: AppBinding["appCode"] | null;
    promptTemplateId: string | null;
    content: string;
    tags: string[];
    enabled: boolean;
  }>>;
  readonly setSkillTagsText: React.Dispatch<React.SetStateAction<string>>;
  readonly workspaceForm: {
    readonly id: string;
    readonly name: string;
    readonly rootPath: string;
    readonly appCode: AppBinding["appCode"] | null;
    readonly defaultProviderId: string | null;
    readonly defaultPromptTemplateId: string | null;
    readonly defaultSkillId: string | null;
    readonly tags: string[];
    readonly enabled: boolean;
  };
  readonly workspaceTagsText: string;
  readonly setWorkspaceForm: React.Dispatch<React.SetStateAction<{
    id: string;
    readonly name: string;
    readonly rootPath: string;
    readonly appCode: AppBinding["appCode"] | null;
    readonly defaultProviderId: string | null;
    readonly defaultPromptTemplateId: string | null;
    readonly defaultSkillId: string | null;
    readonly tags: string[];
    readonly enabled: boolean;
  }>>;
  readonly setWorkspaceTagsText: React.Dispatch<React.SetStateAction<string>>;
  readonly sessionForm: {
    readonly id: string;
    readonly workspaceId: string | null;
    readonly appCode: AppBinding["appCode"];
    readonly title: string;
    readonly cwd: string;
    readonly providerId: string | null;
    readonly promptTemplateId: string | null;
    readonly skillId: string | null;
    readonly status: "active" | "archived";
    readonly startedAt: string;
  };
  readonly setSessionForm: React.Dispatch<React.SetStateAction<{
    id: string;
    workspaceId: string | null;
    appCode: AppBinding["appCode"];
    title: string;
    cwd: string;
    providerId: string | null;
    promptTemplateId: string | null;
    skillId: string | null;
    status: "active" | "archived";
    startedAt: string;
  }>>;
};

const MCP_VERIFICATION_HISTORY_PAGE_SIZE = 5;

const mergeMcpVerificationHistoryPage = (
  currentPage: McpVerificationHistoryPage | null,
  nextPage: McpVerificationHistoryPage
): McpVerificationHistoryPage => {
  if (currentPage === null) {
    return nextPage;
  }

  const mergedItems = [
    ...currentPage.items,
    ...nextPage.items
  ].filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index
  );

  return {
    items: mergedItems,
    total: Math.max(currentPage.total, nextPage.total),
    limit: mergedItems.length,
    offset: 0
  };
};

export const useDashboardDataRuntime = ({
  setErrorMessage,
  setNoticeMessage,
  importText,
  mcpImportOptions,
  setProviderForm,
  setBindingForm,
  setAppQuotaForm,
  setMcpBindingForm,
  setFailoverForm,
  setProxyForm,
  promptTemplateForm,
  promptTagsText,
  setPromptTemplateForm,
  setPromptTagsText,
  skillForm,
  skillTagsText,
  setSkillForm,
  setSkillTagsText,
  workspaceForm,
  workspaceTagsText,
  setWorkspaceForm,
  setWorkspaceTagsText,
  sessionForm,
  setSessionForm
}: UseDashboardDataRuntimeParams) => {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [hasBootstrappedPreviewPages, setHasBootstrappedPreviewPages] = useState(false);
  const [requestLogPage, setRequestLogPage] = useState<ProxyRequestLogPage | null>(null);
  const [auditEventPage, setAuditEventPage] = useState<AuditEventPage | null>(null);
  const [usageRecordPage, setUsageRecordPage] = useState<UsageRecordPage | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [usageTimeseries, setUsageTimeseries] = useState<UsageTimeseries | null>(null);
  const [selectedWorkspaceRuntimeDetail, setSelectedWorkspaceRuntimeDetail] =
    useState<WorkspaceRuntimeDetail | null>(null);
  const [selectedSessionRuntimeDetail, setSelectedSessionRuntimeDetail] =
    useState<SessionRuntimeDetail | null>(null);
  const [selectedProviderDiagnosticId, setSelectedProviderDiagnosticId] = useState<string | null>(null);
  const [selectedProviderDiagnosticDetail, setSelectedProviderDiagnosticDetail] =
    useState<ProviderDiagnosticDetail | null>(null);
  const [selectedSnapshotVersion, setSelectedSnapshotVersion] = useState<number | null>(null);
  const [requestLogFilters, setRequestLogFilters] = useState<RequestLogFilters>({
    appCode: "",
    providerId: "",
    workspaceId: "",
    sessionId: "",
    outcome: "",
    method: "",
    limit: DASHBOARD_REQUEST_LOG_PREVIEW_LIMIT,
    offset: 0
  });
  const [auditFilters, setAuditFilters] = useState<AuditFilters>({
    source: "",
    appCode: "",
    providerId: "",
    level: "",
    limit: DASHBOARD_AUDIT_PREVIEW_LIMIT,
    offset: 0
  });
  const [usageFilters, setUsageFilters] = useState<UsageFilters>({
    appCode: "",
    providerId: "",
    model: "",
    startAt: "",
    endAt: "",
    bucket: "day",
    limit: DASHBOARD_USAGE_PREVIEW_LIMIT,
    offset: 0
  });
  const [importPreview, setImportPreview] = useState<ConfigImportPreview | null>(null);
  const [importPreviewSourceText, setImportPreviewSourceText] = useState("");
  const [pendingDeleteReview, setPendingDeleteReview] = useState<PendingDeleteReview | null>(null);
  const [mcpImportPreview, setMcpImportPreview] = useState<Record<string, McpImportPreview | null>>({});
  const [mcpVerificationHistoryByApp, setMcpVerificationHistoryByApp] =
    useState<Record<string, McpVerificationHistoryPage | null>>({});
  const [mcpVerificationHistoryLoadingByApp, setMcpVerificationHistoryLoadingByApp] =
    useState<Record<string, boolean>>({});

  const refreshSnapshot = (): void => {
    setNoticeMessage(null);

    void loadDashboardSnapshot()
      .then((result) => {
        setNeedsToken(false);
        setErrorMessage(null);
        setSnapshot(result);
        setSelectedProviderDiagnosticId((current) =>
          current !== null && result.providerDiagnostics.some((item) => item.providerId === current)
            ? current
            : null
        );
        setSelectedProviderDiagnosticDetail((current) =>
          current !== null &&
          result.providerDiagnostics.some((item) => item.providerId === current.diagnostic.providerId)
            ? current
            : null
        );
        setSelectedSnapshotVersion((current) =>
          current !== null && result.recentSnapshots.some((item) => item.version === current)
            ? current
            : null
        );
        setSelectedWorkspaceRuntimeDetail((current) =>
          current !== null &&
          result.runtimeContexts.workspaces.some((item) => item.workspaceId === current.summary.workspaceId)
            ? current
            : null
        );
        setSelectedSessionRuntimeDetail((current) =>
          current !== null &&
          result.runtimeContexts.sessions.some((item) => item.sessionId === current.summary.sessionId)
            ? current
            : null
        );
        setProviderForm((current) =>
          syncProviderFormWithBootstrap(
            current,
            result.providers,
            readDashboardEditorSelection("provider")
          )
        );
        setBindingForm((current) =>
          syncBindingFormWithBootstrap(current, result.bindings, result.providers)
        );
        setAppQuotaForm((current) =>
          syncAppQuotaFormWithBootstrap(
            current,
            result.appQuotas,
            readDashboardEditorSelection("app-quota")
          )
        );
        setMcpBindingForm((current) =>
          syncMcpBindingFormWithBootstrap(current, result.appMcpBindings, result.mcpServers)
        );
        setFailoverForm((current) =>
          syncFailoverFormWithBootstrap(current, result.failoverChains, result.providers)
        );
        setProxyForm(resolveProxyPolicyFormFromBootstrap(result.latestSnapshot));
        const promptEditorState = syncPromptTemplateEditorWithBootstrap(
          promptTemplateForm,
          promptTagsText,
          result.promptTemplates,
          readDashboardEditorSelection("prompt-template")
        );
        setPromptTemplateForm(promptEditorState.form);
        setPromptTagsText(promptEditorState.tagsText);
        const skillEditorState = syncSkillEditorWithBootstrap(
          skillForm,
          skillTagsText,
          result.skills,
          readDashboardEditorSelection("skill")
        );
        setSkillForm(skillEditorState.form);
        setSkillTagsText(skillEditorState.tagsText);
        const workspaceEditorState = syncWorkspaceEditorWithBootstrap(
          workspaceForm,
          workspaceTagsText,
          result.workspaces,
          readDashboardEditorSelection("workspace")
        );
        setWorkspaceForm(workspaceEditorState.form);
        setWorkspaceTagsText(workspaceEditorState.tagsText);
        setSessionForm(
          syncSessionFormWithBootstrap(
            sessionForm,
            result.sessionRecords,
            readDashboardEditorSelection("session")
          )
        );
      })
      .catch((error: unknown) => {
        if (error instanceof UnauthorizedApiError) {
          setNeedsToken(true);
          setErrorMessage(null);
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const refreshProviderDiagnosticDetail = (providerId: string): void => {
    void loadProviderDiagnosticDetail(providerId)
      .then((result) => {
        setSelectedProviderDiagnosticId(providerId);
        setSelectedProviderDiagnosticDetail(result);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const refreshWorkspaceRuntimeDetail = (workspaceId: string): void => {
    void loadWorkspaceRuntimeDetail(workspaceId)
      .then((result) => {
        setSelectedWorkspaceRuntimeDetail(result);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const refreshSessionRuntimeDetail = (sessionId: string): void => {
    void loadSessionRuntimeDetail(sessionId)
      .then((result) => {
        setSelectedSessionRuntimeDetail(result);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const refreshRequestLogs = (filters = requestLogFilters): void => {
    void loadProxyRequestLogs({
      appCode: filters.appCode.length > 0 ? (filters.appCode as AppBinding["appCode"]) : undefined,
      providerId: filters.providerId || undefined,
      workspaceId: filters.workspaceId || undefined,
      sessionId: filters.sessionId || undefined,
      outcome:
        filters.outcome.length > 0
          ? (filters.outcome as "success" | "error" | "rejected" | "failover")
          : undefined,
      method: filters.method || undefined,
      limit: filters.limit,
      offset: filters.offset
    })
      .then((result) => {
        setRequestLogPage(result);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const focusProviderFailureLogs = (providerId: string): void => {
    const nextFilters = {
      ...requestLogFilters,
      providerId,
      workspaceId: "",
      sessionId: "",
      outcome: "error",
      offset: 0
    };
    setRequestLogFilters(nextFilters);
    refreshRequestLogs(nextFilters);
  };

  const focusWorkspaceLogs = (workspaceId: string): void => {
    const nextFilters = {
      ...requestLogFilters,
      workspaceId,
      sessionId: "",
      offset: 0
    };
    setRequestLogFilters(nextFilters);
    refreshRequestLogs(nextFilters);
  };

  const focusSessionLogs = (sessionId: string): void => {
    const nextFilters = {
      ...requestLogFilters,
      workspaceId: "",
      sessionId,
      offset: 0
    };
    setRequestLogFilters(nextFilters);
    refreshRequestLogs(nextFilters);
  };

  const refreshAuditEvents = (filters = auditFilters): void => {
    void loadAuditEvents({
      source:
        filters.source.length > 0
          ? (filters.source as
              | "host-integration"
              | "provider-health"
              | "proxy-request"
              | "mcp"
              | "quota"
              | "config-snapshot"
              | "system-service")
          : undefined,
      appCode: filters.appCode.length > 0 ? (filters.appCode as AppBinding["appCode"]) : undefined,
      providerId: filters.providerId || undefined,
      level: filters.level.length > 0 ? (filters.level as "info" | "warn" | "error") : undefined,
      limit: filters.limit,
      offset: filters.offset
    })
      .then((result) => {
        setAuditEventPage(result);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const refreshUsage = (filters = usageFilters): void => {
    void Promise.all([
      loadUsageRecords({
        appCode: filters.appCode.length > 0 ? (filters.appCode as AppBinding["appCode"]) : undefined,
        providerId: filters.providerId || undefined,
        model: filters.model || undefined,
        startAt: toIsoDateTime(filters.startAt),
        endAt: toIsoDateTime(filters.endAt),
        limit: filters.limit,
        offset: filters.offset
      }),
      loadUsageSummary({
        appCode: filters.appCode.length > 0 ? (filters.appCode as AppBinding["appCode"]) : undefined,
        providerId: filters.providerId || undefined,
        model: filters.model || undefined,
        startAt: toIsoDateTime(filters.startAt),
        endAt: toIsoDateTime(filters.endAt)
      }),
      loadUsageTimeseries({
        appCode: filters.appCode.length > 0 ? (filters.appCode as AppBinding["appCode"]) : undefined,
        providerId: filters.providerId || undefined,
        model: filters.model || undefined,
        startAt: toIsoDateTime(filters.startAt),
        endAt: toIsoDateTime(filters.endAt),
        bucket: filters.bucket
      })
    ])
      .then(([records, summary, timeseries]) => {
        setUsageRecordPage(records);
        setUsageSummary(summary);
        setUsageTimeseries(timeseries);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const runAction = (task: () => Promise<void>, successMessage: string): void => {
    setIsWorking(true);
    setNoticeMessage(null);
    setErrorMessage(null);

    void Promise.resolve()
      .then(task)
      .then(() => {
        setNoticeMessage(successMessage);
        refreshSnapshot();
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => {
        setIsWorking(false);
      });
  };

  const loadImportPreview = (selectedVersionNotice: string): void => {
    setErrorMessage(null);
    try {
      const parsed = JSON.parse(importText) as unknown;
      void previewImportConfigPackage(parsed)
        .then((result) => {
          setImportPreview(result);
          setImportPreviewSourceText(importText);
          setNoticeMessage(selectedVersionNotice);
        })
        .catch((error: unknown) => {
          setImportPreview(null);
          setImportPreviewSourceText("");
          setErrorMessage(error instanceof Error ? error.message : "unknown error");
        });
    } catch (error) {
      setImportPreview(null);
      setImportPreviewSourceText("");
      setErrorMessage(error instanceof Error ? error.message : "unknown error");
    }
  };

  const loadDeleteReview = (kind: ConfigDeletePreview["targetType"], id: string): void => {
    setIsWorking(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    let task: Promise<ConfigDeletePreview>;
    switch (kind) {
      case "provider":
        task = previewDeleteProvider(id);
        break;
      case "binding":
        task = previewDeleteBinding(id);
        break;
      case "app-quota":
        task = previewDeleteAppQuota(id);
        break;
      case "failover-chain":
        task = previewDeleteFailoverChain(id);
        break;
      case "prompt-template":
        task = previewDeletePromptTemplate(id);
        break;
      case "skill":
        task = previewDeleteSkill(id);
        break;
      case "workspace":
        task = previewDeleteWorkspace(id);
        break;
      case "session":
        task = previewDeleteSessionRecord(id);
        break;
      case "mcp-server":
        task = previewDeleteMcpServer(id);
        break;
      case "mcp-app-binding":
        task = previewDeleteAppMcpBinding(id);
        break;
    }

    void task
      .then((preview) => {
        setPendingDeleteReview({
          kind,
          id,
          preview
        });
      })
      .catch((error: unknown) => {
        setPendingDeleteReview(null);
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => {
        setIsWorking(false);
      });
  };

  const executeDelete = (kind: ConfigDeletePreview["targetType"], id: string): Promise<void> => {
    switch (kind) {
      case "provider":
        return deleteProvider(id);
      case "binding":
        return deleteBinding(id);
      case "app-quota":
        return deleteAppQuota(id);
      case "failover-chain":
        return deleteFailoverChain(id);
      case "prompt-template":
        return deletePromptTemplate(id);
      case "skill":
        return deleteSkill(id);
      case "workspace":
        return deleteWorkspace(id);
      case "session":
        return deleteSessionRecord(id);
      case "mcp-server":
        return deleteMcpServer(id);
      case "mcp-app-binding":
        return deleteAppMcpBinding(id);
    }
  };

  const loadMcpImportPreview = (appCode: AppBinding["appCode"]): void => {
    void previewMcpImportFromHost(appCode, mcpImportOptions)
      .then((preview) => {
        setMcpImportPreview((current) => ({
          ...current,
          [appCode]: preview
        }));
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const refreshMcpVerificationHistories = (targetSnapshot: DashboardSnapshot | null): void => {
    if (targetSnapshot === null) {
      setMcpVerificationHistoryByApp({});
      setMcpVerificationHistoryLoadingByApp({});
      return;
    }

    const appCodes = Array.from(
      new Set([
        ...targetSnapshot.mcpRuntimeViews.map((item) => item.appCode),
        ...targetSnapshot.mcpHostSyncCapabilities.map((item) => item.appCode)
      ])
    ) as AppBinding["appCode"][];

    setMcpVerificationHistoryLoadingByApp(
      Object.fromEntries(appCodes.map((appCode) => [appCode, true]))
    );

    void Promise.allSettled(
      appCodes.map(async (appCode) => [
        appCode,
        await loadMcpVerificationHistory(appCode, {
          limit: MCP_VERIFICATION_HISTORY_PAGE_SIZE,
          offset: 0
        })
      ] as const)
    ).then((results) => {
      const nextState: Record<string, McpVerificationHistoryPage | null> = {};
      let firstError: string | null = null;

      results.forEach((result, index) => {
        const appCode = appCodes[index];
        if (!appCode) {
          return;
        }

        if (result.status === "fulfilled") {
          nextState[appCode] = result.value[1];
          return;
        }

        nextState[appCode] = null;
        if (firstError === null) {
          firstError =
            result.reason instanceof Error ? result.reason.message : "unknown error";
        }
      });

      setMcpVerificationHistoryByApp(nextState);
      setMcpVerificationHistoryLoadingByApp(
        Object.fromEntries(appCodes.map((appCode) => [appCode, false]))
      );
      if (firstError !== null) {
        setErrorMessage(firstError);
      }
    });
  };

  const loadMoreMcpVerificationHistory = (appCode: AppBinding["appCode"]): void => {
    if (mcpVerificationHistoryLoadingByApp[appCode]) {
      return;
    }

    const currentPage = mcpVerificationHistoryByApp[appCode] ?? null;
    if (currentPage !== null && currentPage.items.length >= currentPage.total) {
      return;
    }

    setMcpVerificationHistoryLoadingByApp((current) => ({
      ...current,
      [appCode]: true
    }));

    void loadMcpVerificationHistory(appCode, {
      limit: MCP_VERIFICATION_HISTORY_PAGE_SIZE,
      offset: currentPage?.items.length ?? 0
    })
      .then((nextPage) => {
        setMcpVerificationHistoryByApp((current) => ({
          ...current,
          [appCode]: mergeMcpVerificationHistoryPage(current[appCode] ?? null, nextPage)
        }));
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => {
        setMcpVerificationHistoryLoadingByApp((current) => ({
          ...current,
          [appCode]: false
        }));
      });
  };

  useEffect(() => {
    refreshSnapshot();
  }, []);

  useEffect(() => {
    if (snapshot === null || hasBootstrappedPreviewPages) {
      return;
    }

    setRequestLogPage(snapshot.initialRequestLogPage);
    setAuditEventPage(snapshot.initialAuditEventPage);
    setUsageRecordPage(snapshot.initialUsageRecordPage);
    setUsageSummary(snapshot.initialUsageSummary);
    setUsageTimeseries(snapshot.initialUsageTimeseries);
    setHasBootstrappedPreviewPages(true);
  }, [snapshot, hasBootstrappedPreviewPages]);

  useEffect(() => {
    if (snapshot === null || !hasBootstrappedPreviewPages) {
      return;
    }

    refreshRequestLogs();
    refreshAuditEvents();
    refreshUsage();
    refreshMcpVerificationHistories(snapshot);
  }, [snapshot]);

  return {
    snapshot,
    needsToken,
    isWorking,
    requestLogPage,
    auditEventPage,
    usageRecordPage,
    usageSummary,
    usageTimeseries,
    selectedWorkspaceRuntimeDetail,
    selectedSessionRuntimeDetail,
    selectedProviderDiagnosticId,
    selectedProviderDiagnosticDetail,
    selectedSnapshotVersion,
    requestLogFilters,
    auditFilters,
    usageFilters,
    importPreview,
    importPreviewSourceText,
    pendingDeleteReview,
    mcpImportPreview,
    mcpVerificationHistoryByApp,
    mcpVerificationHistoryLoadingByApp,
    setSelectedWorkspaceRuntimeDetail,
    setSelectedSessionRuntimeDetail,
    setSelectedProviderDiagnosticId,
    setSelectedProviderDiagnosticDetail,
    setSelectedSnapshotVersion,
    setRequestLogFilters,
    setAuditFilters,
    setUsageFilters,
    setImportPreview,
    setImportPreviewSourceText,
    setPendingDeleteReview,
    refreshSnapshot,
    refreshProviderDiagnosticDetail,
    refreshWorkspaceRuntimeDetail,
    refreshSessionRuntimeDetail,
    refreshRequestLogs,
    focusProviderFailureLogs,
    focusWorkspaceLogs,
    focusSessionLogs,
    refreshAuditEvents,
    refreshUsage,
    runAction,
    loadImportPreview,
    loadDeleteReview,
    executeDelete,
    loadMcpImportPreview,
    loadMoreMcpVerificationHistory
  };
};
