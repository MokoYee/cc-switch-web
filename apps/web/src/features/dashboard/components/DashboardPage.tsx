import { Suspense, lazy, startTransition, useEffect, useRef, useState } from "react";

import type {
  AppBinding,
  AppBindingRoutingPreview,
  AppBindingUpsert,
  AppQuotaUpsert,
  AppMcpBindingUpsert,
  ConfigSnapshotDiff,
  ConfigSnapshotDiffBucket,
  ContextRoutingExplanation,
  ExportPackage,
  FailoverChainUpsert,
  FailoverChainRoutingPreview,
  HostCliApplyPreview,
  McpHostSyncState,
  McpImportOptions,
  McpServerUpsert,
  Provider,
  ProviderRoutingPreview,
  ProviderUpsert,
  PromptTemplateVersion,
  PromptTemplateUpsert,
  ProxyPolicy,
  SessionRecordUpsert,
  SkillUpsert,
  SkillVersion,
  WorkspaceUpsert
} from "cc-switch-web-shared";

import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher.js";
import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import {
  type DashboardSnapshot
} from "../api/load-dashboard-snapshot.js";
import { MetricCard } from "./MetricCard.js";
import { writeStoredControlToken } from "../../../shared/lib/api.js";
import { ConfigImpactSummary } from "./ConfigImpactSummary.js";
import { DeleteReviewPanel } from "./DeleteReviewPanel.js";
import type { ActiveGovernanceCampaign } from "./OverviewGovernancePanels.js";
import { QuickStartPanel } from "./QuickStartPanel.js";
import type {
  DashboardFollowUpAction,
  DashboardFollowUpNotice
} from "../lib/dashboardFollowUp.js";
import { useDashboardActions } from "../hooks/useDashboardActions.js";
import { useDashboardEditors } from "../hooks/useDashboardEditors.js";
import { useDashboardDerivedState } from "../hooks/useDashboardDerivedState.js";
import { useDashboardPreviewState } from "../hooks/useDashboardPreviewState.js";
import { useDashboardDataRuntime } from "../hooks/useDashboardDataRuntime.js";
import {
  buildAppQuotaEditorState,
  buildBindingEditorState,
  buildFailoverEditorState,
  buildProviderEditorState,
  createDefaultAppQuotaForm,
  createDefaultBindingForm,
  createDefaultFailoverForm,
  createDefaultPromptTemplateForm,
  createDefaultProviderForm,
  createDefaultSessionForm,
  createDefaultSkillForm,
  createDefaultWorkspaceForm
} from "../lib/editorConsistency.js";
import { writeDashboardEditorSelection } from "../lib/editorBootstrapStorage.js";
import {
  buildRequestPrimaryCause,
  renderRoutingPrimaryCauseLabel
} from "../lib/buildRoutingPrimaryCause.js";
import { buildMcpVerificationPlan } from "../lib/buildMcpVerificationPlan.js";
import { buildTrafficTakeoverEntries } from "../lib/buildTrafficTakeoverEntries.js";
import {
  installSystemUserService,
  previewApplyHostCliManagedConfig,
  rotateControlAuthToken,
  syncSystemServiceEnv
} from "../api/load-dashboard-snapshot.js";

const loadOverviewGovernancePanels = () => import("./OverviewGovernancePanels.js");
const loadContextResourcePanels = () => import("./ContextResourcePanels.js");
const loadPromptHostSyncPanel = () => import("./PromptHostSyncPanel.js");
const loadMcpHostSyncPanel = () => import("./McpHostSyncPanel.js");
const loadRuntimeGovernancePanels = () => import("./RuntimeGovernancePanels.js");
const loadTrafficObservabilityPanels = () => import("./TrafficObservabilityPanels.js");
const loadAssetContextFormsPanel = () => import("./AssetContextFormsPanel.js");
const loadMcpFormsPanel = () => import("./McpFormsPanel.js");
const loadRoutingPolicyFormsPanel = () => import("./RoutingPolicyFormsPanel.js");
const loadRecoveryPanel = () => import("./RecoveryPanel.js");

let advancedPanelPreloadPromise: Promise<void> | null = null;

const preloadAdvancedPanels = (): void => {
  if (advancedPanelPreloadPromise !== null) {
    return;
  }

  advancedPanelPreloadPromise = Promise.all([
    loadOverviewGovernancePanels(),
    loadContextResourcePanels(),
    loadPromptHostSyncPanel(),
    loadMcpHostSyncPanel(),
    loadRuntimeGovernancePanels(),
    loadTrafficObservabilityPanels(),
    loadAssetContextFormsPanel(),
    loadMcpFormsPanel(),
    loadRoutingPolicyFormsPanel(),
    loadRecoveryPanel()
  ]).then(() => undefined);
};

const LazyOverviewGovernancePanels = lazy(async () => ({
  default: (await loadOverviewGovernancePanels()).OverviewGovernancePanels
}));
const LazyContextResourcePanels = lazy(async () => ({
  default: (await loadContextResourcePanels()).ContextResourcePanels
}));
const LazyPromptHostSyncPanel = lazy(async () => ({
  default: (await loadPromptHostSyncPanel()).PromptHostSyncPanel
}));
const LazyMcpHostSyncPanel = lazy(async () => ({
  default: (await loadMcpHostSyncPanel()).McpHostSyncPanel
}));
const LazyRuntimeGovernancePanels = lazy(async () => ({
  default: (await loadRuntimeGovernancePanels()).RuntimeGovernancePanels
}));
const LazyTrafficObservabilityPanels = lazy(async () => ({
  default: (await loadTrafficObservabilityPanels()).TrafficObservabilityPanels
}));
const LazyAssetContextFormsPanel = lazy(async () => ({
  default: (await loadAssetContextFormsPanel()).AssetContextFormsPanel
}));
const LazyMcpFormsPanel = lazy(async () => ({
  default: (await loadMcpFormsPanel()).McpFormsPanel
}));
const LazyRoutingPolicyFormsPanel = lazy(async () => ({
  default: (await loadRoutingPolicyFormsPanel()).RoutingPolicyFormsPanel
}));
const LazyRecoveryPanel = lazy(async () => ({
  default: (await loadRecoveryPanel()).RecoveryPanel
}));

const renderProviderType = (provider: Provider): string => provider.providerType;

const renderBindingMode = (
  binding: AppBinding,
  t: (key: "common.managed" | "common.observe") => string
): string => (binding.mode === "managed" ? t("common.managed") : t("common.observe"));

const toJsonString = (value: ExportPackage): string => JSON.stringify(value, null, 2);
const joinProviderIds = (providerIds: string[]): string => providerIds.join(", ");

const formatNumber = (value: number): string => new Intl.NumberFormat().format(value);
const formatPercent = (value: number | null): string =>
  value === null ? "n/a" : `${Math.round(value * 100)}%`;
const formatDateTime = (value: string): string => value.replace("T", " ").replace(".000Z", "Z");
const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const AdvancedPanelFallback = ({
  locale,
  title
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly title: string;
}): JSX.Element => (
  <article className="panel panel-span-2 panel-loading">
    <h2>{title}</h2>
    <p className="panel-lead">
      {localize(
        locale,
        "正在按需加载高级控制台模块，首屏会更轻一些。",
        "Loading the advanced console module on demand to keep the initial screen lighter."
      )}
    </p>
  </article>
);

const formatSnapshotDiffItems = (
  bucket: ConfigSnapshotDiffBucket,
  emptyLabel: string
): string => {
  const renderItems = (items: string[]): string => (items.length > 0 ? items.join(", ") : emptyLabel);
  return `+${renderItems(bucket.added)} / ~${renderItems(bucket.changed)} / -${renderItems(bucket.removed)}`;
};

type FollowUpValidationItem = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly level: "low" | "medium" | "high";
};

type FollowUpVerdict = {
  readonly level: "low" | "medium" | "high";
  readonly title: string;
  readonly summary: string;
};

type BatchFollowUpProgress = {
  readonly title: string;
  readonly summary: string;
  readonly currentIndex: number;
  readonly visitedCount: number;
  readonly total: number;
  readonly remaining: number;
  readonly progressPercent: number;
  readonly level: "low" | "medium";
};

type BatchFollowUpCompletion = {
  readonly level: "low" | "medium" | "high";
  readonly title: string;
  readonly summary: string;
};

type ScrollSectionTarget =
  | HTMLDivElement
  | null
  | { readonly current: HTMLDivElement | null };

type McpHostSyncFocusRequest = {
  readonly appCode: AppBinding["appCode"];
  readonly target: "history";
  readonly nonce: number;
};

const resolveScrollSectionTarget = (target: ScrollSectionTarget): HTMLDivElement | null => {
  if (target !== null && typeof target === "object" && "current" in target) {
    return target.current;
  }
  return target;
};

const buildFollowUpNoticeKey = (notice: DashboardFollowUpNotice): string =>
  [
    notice.category,
    notice.title,
    ...notice.actions.map((action) => {
      if (action.kind === "workspace-runtime" || action.kind === "workspace-logs") {
        return `${action.kind}:${action.workspaceId}`;
      }
      if (action.kind === "session-runtime" || action.kind === "session-logs") {
        return `${action.kind}:${action.sessionId}`;
      }
      if (action.kind === "app-logs") {
        return `${action.kind}:${action.appCode}`;
      }
      if (action.kind === "audit") {
        return `${action.kind}:${action.filters.source ?? ""}:${action.filters.appCode ?? ""}:${action.filters.providerId ?? ""}`;
      }
      if (action.kind === "section") {
        return `${action.kind}:${action.section}`;
      }
      return action.kind;
    })
  ].join("|");

const buildFollowUpRunbook = (
  locale: "zh-CN" | "en-US",
  notice: DashboardFollowUpNotice | null,
  snapshot: DashboardSnapshot | null
): string[] => {
  if (notice === null) {
    return [];
  }

  const auditFollowUpAction = notice.actions.find(
    (action): action is Extract<DashboardFollowUpAction, { readonly kind: "audit" }> => action.kind === "audit"
  );
  const targetAppCode =
    notice.actions.find((action) => action.kind === "app-logs")?.appCode ??
    auditFollowUpAction?.filters.appCode ??
    null;
  const targetAppLogs =
    targetAppCode === null || snapshot === null
      ? []
      : snapshot.proxyRequestLogs.filter((item) => item.appCode === targetAppCode);
  const trafficPrimaryCause =
    targetAppCode === null ? null : buildRequestPrimaryCause(targetAppLogs, locale);
  const targetTakeoverEntry =
    targetAppCode === null || snapshot === null
      ? null
      : buildTrafficTakeoverEntries(snapshot, locale).find((item) => item.appCode === targetAppCode) ?? null;

  switch (notice.category) {
    case "provider":
      return [
        localize(locale, "先看 Provider runtime，确认诊断状态和熔断状态是否恢复。", "Check provider runtime first and confirm diagnosis and circuit state have recovered."),
        localize(locale, "再看 health audit，确认最近探测或恢复事件是否已经转绿。", "Review health audit next and confirm recent probe or recovery events are green."),
        localize(locale, "最后看 failure logs，确认新请求不再继续失败或故障转移。", "Finally inspect failure logs to confirm new requests are no longer failing or falling through.")
      ];
    case "workspace":
      return [
        localize(locale, "先看工作区 runtime，确认错误数和有效 Provider 是否恢复。", "Open workspace runtime first and confirm error count and effective provider have recovered."),
        localize(locale, "再看工作区请求，确认流量已经重新带上正确上下文。", "Then inspect workspace requests and confirm traffic is carrying the correct context again."),
        localize(locale, "最后再回到上下文资产，确认默认项配置已经收敛。", "Finally return to context assets and confirm the default configuration has converged.")
      ];
    case "session":
      return [
        localize(locale, "先看会话 runtime，确认会话是否重新命中正确工作区和默认对象。", "Open session runtime first and confirm the session resolves to the correct workspace and defaults."),
        localize(locale, "再看会话请求，确认上下文缺失或错误覆盖是否消失。", "Then inspect session requests to confirm missing context or bad overrides are gone."),
        localize(locale, "最后回到上下文资产，检查会话级覆盖是否还有必要保留。", "Finally return to context assets and decide whether session-level overrides are still necessary.")
      ];
    case "asset":
      return [
        localize(locale, "先看受影响工作区或会话的 runtime，确认问题是否已经传导到运行态。", "Open affected workspace or session runtime first and confirm the issue has propagated into runtime."),
        trafficPrimaryCause
          ? localize(locale, `再看关联请求，确认主因 ${trafficPrimaryCause.label} 是否已经缓解。`, `Then inspect related requests and confirm the primary cause ${trafficPrimaryCause.label} is easing.`)
          : localize(locale, "再看关联请求，确认错误、拒绝或错误上下文是否仍在继续出现。", "Then inspect related requests and confirm whether failures, rejections, or bad context are still appearing."),
        localize(locale, "最后回到上下文资产统一修 Prompt / Skill 继承关系。", "Finally return to context assets and repair prompt or skill inheritance consistently.")
      ];
    case "app-traffic":
      return [
        targetTakeoverEntry
          ? localize(locale, `先看接管闭环状态，确认当前已到 ${targetTakeoverEntry.verificationState} 之后的哪一步。`, `Check the takeover loop state first and confirm which step after ${targetTakeoverEntry.verificationState} you are currently on.`)
          : localize(locale, "先看目标应用请求，确认错误、拒绝或 failover 是否下降。", "Inspect target app requests first and confirm errors, rejections, or failovers are dropping."),
        trafficPrimaryCause
          ? localize(locale, `再围绕主因 ${trafficPrimaryCause.label} 验证请求与审计是否同步改善。`, `Then validate whether requests and audit are improving together around the primary cause ${trafficPrimaryCause.label}.`)
          : localize(locale, "再看相关审计，确认配额、健康或治理事件已经同步改善。", "Review related audit events next and confirm quota, health, or governance signals are improving too."),
        localize(locale, "必要时回到路由/资产面板，继续修正上游配置。", "Return to routing or asset panels if upstream configuration still needs correction.")
      ];
    case "mcp":
      if (targetAppCode !== null && snapshot !== null) {
        return buildMcpVerificationPlan({
          snapshot,
          appCode: targetAppCode,
          locale
        }).nextActions.slice(0, 3);
      }
      return [
        localize(locale, "先看 MCP runtime，确认 issue code 和 host drift 是否收敛。", "Check MCP runtime first and confirm issue codes and host drift are converging."),
        trafficPrimaryCause
          ? localize(locale, `再对照真实请求主因 ${trafficPrimaryCause.label}，确认 MCP 冲突是否已经不再传导到流量面。`, `Then compare against the live request primary cause ${trafficPrimaryCause.label} and confirm MCP conflicts are no longer propagating into traffic.`)
          : localize(locale, "再看 MCP audit，确认导入、同步或绑定事件结果符合预期。", "Review MCP audit next and confirm import, sync, or binding events match expectations."),
        localize(locale, "如果仍异常，再回到 MCP 面板继续修 server、binding 或宿主机同步。", "If issues remain, return to the MCP panel and keep repairing server, binding, or host sync.")
      ];
    case "recovery":
      return [
        localize(locale, "先看 recovery 面板，确认差异桶和恢复目标是否符合预期。", "Inspect the recovery panel first and confirm diff buckets and restore target match expectations."),
        localize(locale, "再看 runtime 面板，确认核心运行态是否恢复。", "Then open runtime and confirm core operational state has recovered."),
        localize(locale, "最后看 traffic 面板，确认真实请求结果已经回到健康范围。", "Finally inspect traffic and confirm real request outcomes have returned to a healthy range.")
      ];
    case "delete":
      return [
        localize(locale, "先回到对应治理面板，确认被删对象的引用链已经断开。", "Return to the relevant governance panel first and confirm references to the deleted object are gone."),
        localize(locale, "再看 recovery 或审计，确认删除后的风险没有继续扩大。", "Then inspect recovery or audit data to confirm the deletion has not expanded risk."),
        localize(locale, "如果仍有残留对象或异常流量，再补充清理或恢复。", "If residual objects or anomalous traffic remain, continue cleanup or recovery.")
      ];
  }
};

const buildFollowUpValidationItems = ({
  locale,
  snapshot,
  followUpNotice,
  selectedProviderDiagnosticDetail,
  selectedWorkspaceRuntimeDetail,
  selectedSessionRuntimeDetail,
  requestLogPage,
  auditEventPage
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly snapshot: DashboardSnapshot | null;
  readonly followUpNotice: DashboardFollowUpNotice | null;
  readonly selectedProviderDiagnosticDetail: ReturnType<typeof useDashboardDataRuntime>["selectedProviderDiagnosticDetail"];
  readonly selectedWorkspaceRuntimeDetail: ReturnType<typeof useDashboardDataRuntime>["selectedWorkspaceRuntimeDetail"];
  readonly selectedSessionRuntimeDetail: ReturnType<typeof useDashboardDataRuntime>["selectedSessionRuntimeDetail"];
  readonly requestLogPage: ReturnType<typeof useDashboardDataRuntime>["requestLogPage"];
  readonly auditEventPage: ReturnType<typeof useDashboardDataRuntime>["auditEventPage"];
}): FollowUpValidationItem[] => {
  if (followUpNotice === null) {
    return [];
  }

  const items: FollowUpValidationItem[] = [];
  const auditFollowUpAction = followUpNotice.actions.find(
    (action): action is Extract<DashboardFollowUpAction, { readonly kind: "audit" }> => action.kind === "audit"
  );
  const targetAppCode =
    followUpNotice.actions.find((action) => action.kind === "app-logs")?.appCode ??
    auditFollowUpAction?.filters.appCode ??
    null;
  const workspaceRuntimeIds: string[] = [];
  const sessionRuntimeIds: string[] = [];
  for (const action of followUpNotice.actions) {
    if (action.kind === "workspace-runtime") {
      workspaceRuntimeIds.push(action.workspaceId);
      continue;
    }
    if (action.kind === "session-runtime") {
      sessionRuntimeIds.push(action.sessionId);
    }
  }
  const targetMcpRuntime =
    targetAppCode === null || snapshot === null
      ? null
      : snapshot.mcpRuntimeViews.find((item) => item.appCode === targetAppCode) ?? null;
  const targetAppLogs =
    targetAppCode === null || snapshot === null
      ? []
      : snapshot.proxyRequestLogs.filter((item) => item.appCode === targetAppCode);
  const trafficPrimaryCause =
    targetAppCode === null ? null : buildRequestPrimaryCause(targetAppLogs, locale);
  const targetTakeoverEntry =
    targetAppCode === null || snapshot === null
      ? null
      : buildTrafficTakeoverEntries(snapshot, locale).find((item) => item.appCode === targetAppCode) ?? null;

  if (snapshot && (followUpNotice.category === "recovery" || followUpNotice.category === "delete")) {
    items.push({
      id: "global-health-status",
      label: localize(locale, "服务健康", "Service Health"),
      value: snapshot.health.status,
      level:
        snapshot.health.status === "healthy"
          ? "low"
          : snapshot.health.status === "degraded"
            ? "medium"
            : "high"
    });
    items.push({
      id: "proxy-runtime-state",
      label: localize(locale, "代理运行态", "Proxy Runtime"),
      value: snapshot.proxyRuntime.runtimeState,
      level:
        snapshot.proxyRuntime.runtimeState === "running"
          ? "low"
          : "high"
    });
  }

  if (selectedProviderDiagnosticDetail && followUpNotice.category === "provider") {
    const diagnostic = selectedProviderDiagnosticDetail.diagnostic;
    items.push({
      id: `provider-status-${diagnostic.providerId}`,
      label: localize(locale, "Provider 状态", "Provider Status"),
      value: diagnostic.diagnosisStatus,
      level:
        diagnostic.diagnosisStatus === "healthy" || diagnostic.diagnosisStatus === "idle"
          ? "low"
          : diagnostic.diagnosisStatus === "degraded" || diagnostic.diagnosisStatus === "recovering"
            ? "medium"
            : "high"
    });
    items.push({
      id: `provider-health-events-${diagnostic.providerId}`,
      label: localize(locale, "最近健康事件", "Recent Health Events"),
      value: String(selectedProviderDiagnosticDetail.recentHealthEvents.length),
      level:
        selectedProviderDiagnosticDetail.recentHealthEvents.length === 0
          ? "low"
          : selectedProviderDiagnosticDetail.recentHealthEvents.some((item) => item.status === "unhealthy")
            ? "high"
            : "medium"
    });
  }

  if (selectedWorkspaceRuntimeDetail && followUpNotice.category === "workspace") {
    items.push({
      id: `workspace-errors-${selectedWorkspaceRuntimeDetail.summary.workspaceId}`,
      label: localize(locale, "工作区错误", "Workspace Errors"),
      value: String(selectedWorkspaceRuntimeDetail.summary.errorCount),
      level:
        selectedWorkspaceRuntimeDetail.summary.errorCount === 0
          ? "low"
          : selectedWorkspaceRuntimeDetail.summary.errorCount >= 5
            ? "high"
            : "medium"
    });
  }

  if (followUpNotice.category === "workspace" && workspaceRuntimeIds.length > 1) {
    const selectedWorkspaceId = selectedWorkspaceRuntimeDetail?.summary.workspaceId ?? null;
    const isFocusedWorkspaceInBatch =
      selectedWorkspaceId !== null &&
      workspaceRuntimeIds.includes(selectedWorkspaceId);
    items.push({
      id: "workspace-batch-size",
      label: localize(locale, "工作区批次规模", "Workspace Batch Size"),
      value: String(workspaceRuntimeIds.length),
      level: workspaceRuntimeIds.length >= 5 ? "medium" : "low"
    });
    items.push({
      id: "workspace-batch-focus",
      label: localize(locale, "当前批次焦点", "Current Batch Focus"),
      value:
        isFocusedWorkspaceInBatch && selectedWorkspaceId !== null
          ? selectedWorkspaceId
          : localize(locale, "尚未打开批次对象", "No batch item opened yet"),
      level: isFocusedWorkspaceInBatch ? "low" : "medium"
    });
  }

  if (selectedSessionRuntimeDetail && followUpNotice.category === "session") {
    items.push({
      id: `session-errors-${selectedSessionRuntimeDetail.summary.sessionId}`,
      label: localize(locale, "会话错误", "Session Errors"),
      value: String(selectedSessionRuntimeDetail.summary.errorCount),
      level:
        selectedSessionRuntimeDetail.summary.errorCount === 0
          ? "low"
          : selectedSessionRuntimeDetail.summary.errorCount >= 4
            ? "high"
            : "medium"
    });
  }

  if (followUpNotice.category === "session" && sessionRuntimeIds.length > 1) {
    const selectedSessionId = selectedSessionRuntimeDetail?.summary.sessionId ?? null;
    const isFocusedSessionInBatch =
      selectedSessionId !== null &&
      sessionRuntimeIds.includes(selectedSessionId);
    items.push({
      id: "session-batch-size",
      label: localize(locale, "会话批次规模", "Session Batch Size"),
      value: String(sessionRuntimeIds.length),
      level: sessionRuntimeIds.length >= 5 ? "medium" : "low"
    });
    items.push({
      id: "session-batch-focus",
      label: localize(locale, "当前批次焦点", "Current Batch Focus"),
      value:
        isFocusedSessionInBatch && selectedSessionId !== null
          ? selectedSessionId
          : localize(locale, "尚未打开批次对象", "No batch item opened yet"),
      level: isFocusedSessionInBatch ? "low" : "medium"
    });
  }

  if (followUpNotice.category === "asset") {
    const assetRuntimeIds = [
      ...workspaceRuntimeIds.map((id) => `workspace:${id}`),
      ...sessionRuntimeIds.map((id) => `session:${id}`)
    ];
    if (assetRuntimeIds.length > 1) {
      const focusedAssetTarget =
        selectedWorkspaceRuntimeDetail?.summary.workspaceId
          ? `workspace:${selectedWorkspaceRuntimeDetail.summary.workspaceId}`
          : selectedSessionRuntimeDetail?.summary.sessionId
            ? `session:${selectedSessionRuntimeDetail.summary.sessionId}`
            : null;
      items.push({
        id: "asset-batch-size",
        label: localize(locale, "资产批次规模", "Asset Batch Size"),
        value: String(assetRuntimeIds.length),
        level: assetRuntimeIds.length >= 5 ? "medium" : "low"
      });
      items.push({
        id: "asset-batch-focus",
        label: localize(locale, "当前批次焦点", "Current Batch Focus"),
        value:
          focusedAssetTarget === null
            ? localize(locale, "尚未打开批次对象", "No batch item opened yet")
            : focusedAssetTarget.startsWith("workspace:")
              ? focusedAssetTarget.replace("workspace:", "")
              : focusedAssetTarget.replace("session:", ""),
        level: focusedAssetTarget === null ? "medium" : "low"
      });
    }
  }

  if (
    requestLogPage &&
    (followUpNotice.category === "provider" ||
      followUpNotice.category === "workspace" ||
      followUpNotice.category === "session" ||
      followUpNotice.category === "asset" ||
      followUpNotice.category === "app-traffic" ||
      followUpNotice.category === "recovery" ||
      followUpNotice.category === "delete")
  ) {
    const errorLikeCount = requestLogPage.items.filter(
      (item) => item.outcome === "error" || item.outcome === "rejected" || item.outcome === "failover"
    ).length;
    items.push({
      id: "request-log-errors",
      label: localize(locale, "当前日志异常", "Visible Log Failures"),
      value: `${errorLikeCount}/${requestLogPage.items.length}`,
      level:
        errorLikeCount === 0
          ? "low"
          : errorLikeCount >= Math.max(3, Math.ceil(requestLogPage.items.length / 2))
            ? "high"
            : "medium"
    });
  }

  if (
    targetAppCode !== null &&
    (followUpNotice.category === "app-traffic" ||
      followUpNotice.category === "asset" ||
      followUpNotice.category === "mcp")
  ) {
    items.push({
      id: `traffic-primary-cause-${targetAppCode}`,
      label: localize(locale, "当前主因", "Current Primary Cause"),
      value: renderRoutingPrimaryCauseLabel(trafficPrimaryCause, locale),
      level: trafficPrimaryCause?.level ?? "low"
    });
  }

  if (
    targetAppCode !== null &&
    targetTakeoverEntry !== null &&
    (followUpNotice.category === "app-traffic" || followUpNotice.category === "mcp")
  ) {
    items.push({
      id: `takeover-state-${targetAppCode}`,
      label: localize(locale, "接管闭环", "Takeover Loop"),
      value:
        targetTakeoverEntry.verificationState === "managed-verified"
          ? localize(locale, "已验证", "Verified")
          : targetTakeoverEntry.verificationState === "managed-failing"
            ? localize(locale, "验证失败", "Verification Failed")
            : targetTakeoverEntry.verificationState === "managed-no-traffic"
              ? localize(locale, "待流量验证", "Needs Traffic")
              : localize(locale, "未接管", "Not Managed"),
      level: targetTakeoverEntry.level
    });
  }

  if (auditEventPage) {
    const errorAuditCount = auditEventPage.items.filter((item) => item.level === "error").length;
    items.push({
      id: "audit-errors",
      label: localize(locale, "当前审计错误", "Visible Audit Errors"),
      value: `${errorAuditCount}/${auditEventPage.items.length}`,
      level:
        errorAuditCount === 0
          ? "low"
          : errorAuditCount >= Math.max(2, Math.ceil(auditEventPage.items.length / 2))
            ? "high"
            : "medium"
    });
  }

  if (followUpNotice.category === "mcp" && targetMcpRuntime) {
    const mcpVerificationPlan =
      snapshot === null
        ? null
        : buildMcpVerificationPlan({
            snapshot,
            appCode: targetMcpRuntime.appCode,
            locale
          });
    if (mcpVerificationPlan !== null) {
      items.push({
        id: `mcp-verification-status-${targetMcpRuntime.appCode}`,
        label: localize(locale, "自动验证状态", "Auto Verification Status"),
        value: mcpVerificationPlan.verificationStatusLabel,
        level:
          mcpVerificationPlan.verificationStatus === "verified"
            ? "low"
            : mcpVerificationPlan.verificationStatus === "regressed" ||
                mcpVerificationPlan.verificationStatus === "pending-runtime"
              ? "high"
              : "medium"
      });
    }
    items.push({
      id: `mcp-runtime-${targetMcpRuntime.appCode}`,
      label: localize(locale, "MCP 运行态", "MCP Runtime"),
      value: `${targetMcpRuntime.status}${targetMcpRuntime.hostState.drifted ? " / drifted" : ""}`,
      level:
        targetMcpRuntime.status === "healthy" && targetMcpRuntime.hostState.drifted === false
          ? "low"
          : targetMcpRuntime.status === "warning" || targetMcpRuntime.hostState.drifted
            ? "medium"
            : "high"
    });
    items.push({
      id: `mcp-issues-${targetMcpRuntime.appCode}`,
      label: localize(locale, "MCP Issue 数", "MCP Issue Count"),
      value: String(targetMcpRuntime.issueCodes.length),
      level:
        targetMcpRuntime.issueCodes.length === 0
          ? "low"
          : targetMcpRuntime.issueCodes.length >= 2
            ? "high"
            : "medium"
    });
  }

  return items.slice(0, 4);
};

const buildFollowUpVerdict = (
  locale: "zh-CN" | "en-US",
  notice: DashboardFollowUpNotice | null,
  items: readonly FollowUpValidationItem[],
  snapshot: DashboardSnapshot | null
): FollowUpVerdict | null => {
  if (notice === null || items.length === 0) {
    return null;
  }

  const highCount = items.filter((item) => item.level === "high").length;
  const mediumCount = items.filter((item) => item.level === "medium").length;
  const providerItem = items.find((item) => item.id.startsWith("provider-status-")) ?? null;
  const requestItem = items.find((item) => item.id === "request-log-errors") ?? null;
  const auditItem = items.find((item) => item.id === "audit-errors") ?? null;
  const workspaceItem = items.find((item) => item.id.startsWith("workspace-errors-")) ?? null;
  const sessionItem = items.find((item) => item.id.startsWith("session-errors-")) ?? null;
  const primaryCauseItem = items.find((item) => item.id.startsWith("traffic-primary-cause-")) ?? null;
  const takeoverItem = items.find((item) => item.id.startsWith("takeover-state-")) ?? null;
  const targetAppCode =
    notice.actions.find((action) => action.kind === "app-logs")?.appCode ??
    notice.actions.find(
      (action): action is Extract<DashboardFollowUpAction, { readonly kind: "audit" }> =>
        action.kind === "audit"
    )?.filters.appCode ??
    null;

  const buildSummary = (healthy: string, partial: string, degraded: string): FollowUpVerdict => {
    if (highCount === 0 && mediumCount === 0) {
      return {
        level: "low",
        title: localize(locale, "已恢复", "Recovered"),
        summary: healthy
      };
    }

    if (highCount === 0) {
      return {
        level: "medium",
        title: localize(locale, "部分改善", "Partially Improved"),
        summary: partial
      };
    }

    return {
      level: "high",
      title: localize(locale, "仍然异常", "Still Degraded"),
      summary: degraded
    };
  };

  if (notice.category === "provider") {
    return buildSummary(
      localize(
        locale,
        `Provider runtime 与健康信号当前趋于健康${providerItem ? `（${providerItem.value}）` : ""}，可以继续观察请求是否稳定。`,
        `Provider runtime and health signals are healthy again${providerItem ? ` (${providerItem.value})` : ""}. Continue observing request stability.`
      ),
      localize(
        locale,
        `Provider 已不再高危，但 runtime / health / 请求三者还没有完全收敛${providerItem ? `（当前 ${providerItem.value}）` : ""}。`,
        `The provider is no longer in a high-risk state, but runtime, health, and requests have not fully converged yet${providerItem ? ` (currently ${providerItem.value})` : ""}.`
      ),
      localize(
        locale,
        `Provider runtime 或健康信号仍异常${providerItem ? `（当前 ${providerItem.value}）` : ""}，修复尚未真正闭环。`,
        `Provider runtime or health signals are still degraded${providerItem ? ` (currently ${providerItem.value})` : ""}, so the repair has not truly closed the loop.`
      )
    );
  }

  if (notice.category === "workspace" || notice.category === "session") {
    const contextItem = notice.category === "workspace" ? workspaceItem : sessionItem;
    return buildSummary(
      localize(
        locale,
        `${notice.category === "workspace" ? "工作区" : "会话"}上下文错误已基本清零${contextItem ? `（${contextItem.value}）` : ""}，可以继续观察请求是否稳定关联。`,
        `${notice.category === "workspace" ? "Workspace" : "Session"} context errors are nearly cleared${contextItem ? ` (${contextItem.value})` : ""}. Continue observing whether requests stay correctly associated.`
      ),
      localize(
        locale,
        `${notice.category === "workspace" ? "工作区" : "会话"}上下文已有改善，但仍有残留错误${contextItem ? `（${contextItem.value}）` : ""}。`,
        `${notice.category === "workspace" ? "Workspace" : "Session"} context is improving, but residual errors remain${contextItem ? ` (${contextItem.value})` : ""}.`
      ),
      localize(
        locale,
        `${notice.category === "workspace" ? "工作区" : "会话"}上下文错误仍明显存在${contextItem ? `（${contextItem.value}）` : ""}，说明当前修复还没有真正生效。`,
        `${notice.category === "workspace" ? "Workspace" : "Session"} context errors are still clearly present${contextItem ? ` (${contextItem.value})` : ""}, which means the repair is not yet effective.`
      )
    );
  }

  if (notice.category === "asset") {
    return buildSummary(
      localize(
        locale,
        `相关资产链路当前看起来已基本恢复${requestItem ? `（${requestItem.value}）` : ""}，可以继续观察是否稳定。`,
        `The related asset chain now looks mostly recovered${requestItem ? ` (${requestItem.value})` : ""}. Continue observing for stability.`
      ),
      localize(
        locale,
        `相关资产链路已有改善，但仍有残留异常${requestItem ? `（${requestItem.value}）` : ""}。`,
        `The related asset chain is improving, but residual anomalies remain${requestItem ? ` (${requestItem.value})` : ""}.`
      ),
      localize(
        locale,
        `相关资产链路仍显示明显异常${requestItem ? `（${requestItem.value}）` : ""}，说明 Prompt / Skill 治理还没有真正闭环。`,
        `The related asset chain still shows clear anomalies${requestItem ? ` (${requestItem.value})` : ""}, which means prompt or skill governance has not truly converged yet.`
      )
    );
  }

  if (notice.category === "mcp") {
    if (targetAppCode !== null && snapshot !== null) {
      const plan = buildMcpVerificationPlan({
        snapshot,
        appCode: targetAppCode,
        locale
      });
      return {
        level:
          plan.verificationStatus === "verified"
            ? "low"
            : plan.verificationStatus === "regressed" ||
                plan.verificationStatus === "pending-runtime"
              ? "high"
              : "medium",
        title:
          plan.verificationStatus === "verified"
            ? localize(locale, "已验证", "Verified")
            : plan.verificationStatus === "regressed"
              ? localize(locale, "存在回退风险", "Regression Risk")
              : plan.verificationStatus === "pending-runtime"
                ? localize(locale, "先收敛 Runtime", "Fix Runtime First")
                : localize(locale, "待继续验证", "Needs More Verification"),
        summary: plan.verificationStatusSummary
      };
    }

    return buildSummary(
      localize(
        locale,
        `当前 MCP 相关审计已趋于稳定${auditItem ? `（${auditItem.value}）` : ""}${takeoverItem ? `，接管状态 ${takeoverItem.value}` : ""}，建议继续确认宿主机与控制台状态是否一致。`,
        `Current MCP audit signals look stable${auditItem ? ` (${auditItem.value})` : ""}${takeoverItem ? `, with takeover state ${takeoverItem.value}` : ""}. Continue confirming host and console state stay aligned.`
      ),
      localize(
        locale,
        `当前 MCP 冲突已有缓解，但审计里仍有残留异常${auditItem ? `（${auditItem.value}）` : ""}${primaryCauseItem ? `，主因仍是 ${primaryCauseItem.value}` : ""}。`,
        `Current MCP conflicts are easing, but residual audit anomalies remain${auditItem ? ` (${auditItem.value})` : ""}${primaryCauseItem ? `, and the primary cause is still ${primaryCauseItem.value}` : ""}.`
      ),
      localize(
        locale,
        `当前 MCP 相关审计仍显示高风险异常${auditItem ? `（${auditItem.value}）` : ""}${primaryCauseItem ? `，主因仍指向 ${primaryCauseItem.value}` : ""}，宿主机与控制台可能还未收敛。`,
        `Current MCP audit signals still show high-risk anomalies${auditItem ? ` (${auditItem.value})` : ""}${primaryCauseItem ? `, and the primary cause still points to ${primaryCauseItem.value}` : ""}, so host and console state may still be divergent.`
      )
    );
  }

  if (notice.category === "recovery") {
    return buildSummary(
      localize(
        locale,
        "恢复后的全局信号当前看起来基本健康，可以继续验证关键路径请求。",
        "Post-recovery global signals now look healthy overall. Continue validating key-path requests."
      ),
      localize(
        locale,
        "恢复后的全局状态已有改善，但仍存在需要继续核对的中等风险信号。",
        "The post-recovery global state is improving, but medium-risk signals still need verification."
      ),
      localize(
        locale,
        "恢复后的全局信号仍存在高风险项，说明恢复结果和当前运行态可能还未对齐。",
        "High-risk global signals are still present after recovery, which suggests the restored state and current runtime are not yet aligned."
      )
    );
  }

  if (notice.category === "app-traffic") {
    return buildSummary(
      localize(
        locale,
        `当前请求结果已基本恢复健康${requestItem ? `（${requestItem.value}）` : ""}${takeoverItem ? `，接管状态 ${takeoverItem.value}` : ""}，可以继续观察是否稳定。`,
        `Current request outcomes have mostly recovered${requestItem ? ` (${requestItem.value})` : ""}${takeoverItem ? `, with takeover state ${takeoverItem.value}` : ""}. Continue observing for stability.`
      ),
      localize(
        locale,
        `当前请求结果已有改善，但仍存在残留异常${requestItem ? `（${requestItem.value}）` : ""}${primaryCauseItem ? `，主因仍是 ${primaryCauseItem.value}` : ""}。`,
        `Current request outcomes are improving, but residual anomalies remain${requestItem ? ` (${requestItem.value})` : ""}${primaryCauseItem ? `, and the primary cause is still ${primaryCauseItem.value}` : ""}.`
      ),
      localize(
        locale,
        `当前请求结果仍显示明显异常${requestItem ? `（${requestItem.value}）` : ""}${primaryCauseItem ? `，主因仍指向 ${primaryCauseItem.value}` : ""}${takeoverItem ? `，接管状态 ${takeoverItem.value}` : ""}，路由或接入修复尚未真正闭环。`,
        `Current request outcomes still show clear anomalies${requestItem ? ` (${requestItem.value})` : ""}${primaryCauseItem ? `, and the primary cause still points to ${primaryCauseItem.value}` : ""}${takeoverItem ? ` with takeover state ${takeoverItem.value}` : ""}, so routing or integration repairs have not truly closed the loop.`
      )
    );
  }

  return buildSummary(
    localize(
      locale,
      "当前已刷新的验证信号基本健康，可以继续观察是否稳定。",
      "The refreshed validation signals look healthy overall. Continue observing for stability."
    ),
    localize(
      locale,
      "当前没有明显高危阻断，但仍有中等级信号需要继续确认。",
      "There is no obvious high-risk blocker right now, but medium-level signals still need verification."
    ),
    localize(
      locale,
      "当前已刷新的验证信号里仍有高风险项，修复还没有真正闭环。",
      "High-risk signals are still visible in the refreshed validation data, so the repair has not actually closed the loop yet."
    )
  );
};

const buildBatchFollowUpProgress = ({
  locale,
  notice,
  visitedIds,
  selectedWorkspaceRuntimeDetail,
  selectedSessionRuntimeDetail
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly notice: DashboardFollowUpNotice | null;
  readonly visitedIds: readonly string[];
  readonly selectedWorkspaceRuntimeDetail: ReturnType<typeof useDashboardDataRuntime>["selectedWorkspaceRuntimeDetail"];
  readonly selectedSessionRuntimeDetail: ReturnType<typeof useDashboardDataRuntime>["selectedSessionRuntimeDetail"];
}): BatchFollowUpProgress | null => {
  if (notice === null) {
    return null;
  }

  if (notice.category === "workspace") {
    const ids = notice.actions.flatMap((action) =>
      action.kind === "workspace-runtime" ? [action.workspaceId] : []
    );
    if (ids.length <= 1) {
      return null;
    }
    const activeId = selectedWorkspaceRuntimeDetail?.summary.workspaceId ?? null;
    const activeIndex = activeId === null ? -1 : ids.indexOf(activeId);
    const currentIndex = activeIndex >= 0 ? activeIndex + 1 : 0;
    const visitedCount = ids.filter((id) => visitedIds.includes(id)).length;
    const progressPercent = visitedCount === 0 ? 0 : Math.round((visitedCount / ids.length) * 100);
    return {
      title: localize(locale, "工作区批次进度", "Workspace Batch Progress"),
      summary:
        activeIndex >= 0
          ? localize(
              locale,
              `当前正在处理第 ${currentIndex} 个工作区，已查看 ${visitedCount} / ${ids.length}，剩余 ${Math.max(ids.length - visitedCount, 0)} 个待确认。`,
              `You are currently on workspace ${currentIndex}, with ${visitedCount}/${ids.length} reviewed and ${Math.max(ids.length - visitedCount, 0)} remaining.`
            )
          : localize(
              locale,
              `当前批次共有 ${ids.length} 个工作区，尚未开始逐项查看。`,
              `This batch contains ${ids.length} workspaces and has not been reviewed item by item yet.`
            ),
      currentIndex,
      visitedCount,
      total: ids.length,
      remaining: Math.max(ids.length - visitedCount, 0),
      progressPercent,
      level: ids.length >= 5 ? "medium" : "low"
    };
  }

  if (notice.category === "session") {
    const ids = notice.actions.flatMap((action) =>
      action.kind === "session-runtime" ? [action.sessionId] : []
    );
    if (ids.length <= 1) {
      return null;
    }
    const activeId = selectedSessionRuntimeDetail?.summary.sessionId ?? null;
    const activeIndex = activeId === null ? -1 : ids.indexOf(activeId);
    const currentIndex = activeIndex >= 0 ? activeIndex + 1 : 0;
    const visitedCount = ids.filter((id) => visitedIds.includes(id)).length;
    const progressPercent = visitedCount === 0 ? 0 : Math.round((visitedCount / ids.length) * 100);
    return {
      title: localize(locale, "会话批次进度", "Session Batch Progress"),
      summary:
        activeIndex >= 0
          ? localize(
              locale,
              `当前正在处理第 ${currentIndex} 个会话，已查看 ${visitedCount} / ${ids.length}，剩余 ${Math.max(ids.length - visitedCount, 0)} 个待确认。`,
              `You are currently on session ${currentIndex}, with ${visitedCount}/${ids.length} reviewed and ${Math.max(ids.length - visitedCount, 0)} remaining.`
            )
          : localize(
              locale,
              `当前批次共有 ${ids.length} 个会话，尚未开始逐项查看。`,
              `This batch contains ${ids.length} sessions and has not been reviewed item by item yet.`
            ),
      currentIndex,
      visitedCount,
      total: ids.length,
      remaining: Math.max(ids.length - visitedCount, 0),
      progressPercent,
      level: ids.length >= 5 ? "medium" : "low"
    };
  }

  if (notice.category === "asset") {
    const ids = notice.actions.flatMap((action) => {
      if (action.kind === "workspace-runtime") {
        return [`workspace:${action.workspaceId}`];
      }
      if (action.kind === "session-runtime") {
        return [`session:${action.sessionId}`];
      }
      return [];
    });
    if (ids.length <= 1) {
      return null;
    }
    const activeWorkspaceId = selectedWorkspaceRuntimeDetail?.summary.workspaceId ?? null;
    const activeSessionId = selectedSessionRuntimeDetail?.summary.sessionId ?? null;
    const activeTargetId =
      activeWorkspaceId !== null
        ? `workspace:${activeWorkspaceId}`
        : activeSessionId !== null
          ? `session:${activeSessionId}`
          : null;
    const activeIndex = activeTargetId === null ? -1 : ids.indexOf(activeTargetId);
    const currentIndex = activeIndex >= 0 ? activeIndex + 1 : 0;
    const visitedCount = ids.filter((id) => visitedIds.includes(id)).length;
    const progressPercent = visitedCount === 0 ? 0 : Math.round((visitedCount / ids.length) * 100);
    return {
      title: localize(locale, "资产治理批次进度", "Asset Governance Batch Progress"),
      summary:
        activeIndex >= 0
          ? localize(
              locale,
              `当前正在处理第 ${currentIndex} 个受影响对象，已查看 ${visitedCount} / ${ids.length}，剩余 ${Math.max(ids.length - visitedCount, 0)} 个待确认。`,
              `You are currently on impacted object ${currentIndex}, with ${visitedCount}/${ids.length} reviewed and ${Math.max(ids.length - visitedCount, 0)} remaining.`
            )
          : localize(
              locale,
              `当前资产治理批次共有 ${ids.length} 个受影响对象，尚未开始逐项查看。`,
              `This asset governance batch contains ${ids.length} impacted objects and has not been reviewed item by item yet.`
            ),
      currentIndex,
      visitedCount,
      total: ids.length,
      remaining: Math.max(ids.length - visitedCount, 0),
      progressPercent,
      level: ids.length >= 5 ? "medium" : "low"
    };
  }

  return null;
};

const buildBatchFollowUpCompletion = ({
  locale,
  progress,
  verdict
}: {
  readonly locale: "zh-CN" | "en-US";
  readonly progress: BatchFollowUpProgress | null;
  readonly verdict: FollowUpVerdict | null;
}): BatchFollowUpCompletion | null => {
  if (progress === null) {
    return null;
  }

  if (progress.visitedCount < progress.total) {
    return {
      level: "medium",
      title: localize(locale, "批次仍在处理中", "Batch Still In Progress"),
      summary: localize(
        locale,
        `这批对象还没有逐项看完，当前还剩 ${progress.remaining} 个待确认，暂时不适合收尾。`,
        `${progress.remaining} objects in this batch still need review, so it is too early to close this batch.`
      )
    };
  }

  if (verdict?.level === "high") {
    return {
      level: "high",
      title: localize(locale, "批次已看完但未收敛", "Batch Reviewed But Not Converged"),
      summary: localize(
        locale,
        "这批对象已经逐项查看，但当前验证信号仍显示高风险，说明问题还没有真正闭环。",
        "Every object in this batch has been reviewed, but validation signals are still high-risk, so the issue has not truly converged."
      )
    };
  }

  if (verdict?.level === "medium") {
    return {
      level: "medium",
      title: localize(locale, "批次接近收尾", "Batch Nearing Closure"),
      summary: localize(
        locale,
        "这批对象已经逐项查看完毕，当前只剩中等风险信号，建议做最后一轮确认后再结束。",
        "This batch has been fully reviewed, and only medium-risk signals remain. Run one final verification pass before closing it."
      )
    };
  }

  return {
    level: "low",
    title: localize(locale, "批次可以结束", "Batch Ready To Close"),
    summary: localize(
      locale,
      "这批对象已经逐项查看完毕，当前验证信号也已基本恢复，可以考虑切到下一批或结束本轮治理。",
      "This batch has been fully reviewed and validation signals look healthy enough to move on or close the current governance loop."
    )
  };
};

const renderQuotaState = (
  state: "healthy" | "warning" | "exceeded" | "disabled",
  t: (
    key:
      | "dashboard.quota.state.healthy"
      | "dashboard.quota.state.warning"
      | "dashboard.quota.state.exceeded"
      | "dashboard.quota.state.disabled"
  ) => string
): string => {
  if (state === "warning") {
    return t("dashboard.quota.state.warning");
  }
  if (state === "exceeded") {
    return t("dashboard.quota.state.exceeded");
  }
  if (state === "disabled") {
    return t("dashboard.quota.state.disabled");
  }
  return t("dashboard.quota.state.healthy");
};

const renderEffectiveContextSource = (
  source:
    | "request-session"
    | "request-workspace"
    | "request-auto-session"
    | "request-auto-workspace"
    | "active-session"
    | "active-workspace"
    | "none",
  t: (
    key:
      | "dashboard.workspace.source.requestSession"
      | "dashboard.workspace.source.requestWorkspace"
      | "dashboard.workspace.source.requestAutoSession"
      | "dashboard.workspace.source.requestAutoWorkspace"
      | "dashboard.workspace.source.activeSession"
      | "dashboard.workspace.source.activeWorkspace"
      | "dashboard.workspace.source.none"
  ) => string
): string => {
  switch (source) {
    case "request-session":
      return t("dashboard.workspace.source.requestSession");
    case "request-workspace":
      return t("dashboard.workspace.source.requestWorkspace");
    case "request-auto-session":
      return t("dashboard.workspace.source.requestAutoSession");
    case "request-auto-workspace":
      return t("dashboard.workspace.source.requestAutoWorkspace");
    case "active-session":
      return t("dashboard.workspace.source.activeSession");
    case "active-workspace":
      return t("dashboard.workspace.source.activeWorkspace");
    default:
      return t("dashboard.workspace.source.none");
  }
};

const renderContextRoutingStepKind = (
  kind: ContextRoutingExplanation["steps"][number]["kind"],
  t: (
    key:
      | "dashboard.contextRouting.step.activeSessionContext"
      | "dashboard.contextRouting.step.activeWorkspaceContext"
      | "dashboard.contextRouting.step.sessionOverride"
      | "dashboard.contextRouting.step.workspaceDefault"
      | "dashboard.contextRouting.step.appBinding"
      | "dashboard.contextRouting.step.failoverChain"
  ) => string
): string => {
  switch (kind) {
    case "active-session-context":
      return t("dashboard.contextRouting.step.activeSessionContext");
    case "active-workspace-context":
      return t("dashboard.contextRouting.step.activeWorkspaceContext");
    case "session-override":
      return t("dashboard.contextRouting.step.sessionOverride");
    case "workspace-default":
      return t("dashboard.contextRouting.step.workspaceDefault");
    case "app-binding":
      return t("dashboard.contextRouting.step.appBinding");
    case "failover-chain":
      return t("dashboard.contextRouting.step.failoverChain");
  }
};

const renderRoutingIssueCode = (
  issueCode:
    | ProviderRoutingPreview["issueCodes"][number]
    | AppBindingRoutingPreview["issueCodes"][number]
    | FailoverChainRoutingPreview["issueCodes"][number],
  t: (
    key:
      | "dashboard.routing.issue.providerMissing"
      | "dashboard.routing.issue.providerDisabled"
      | "dashboard.routing.issue.credentialMissing"
      | "dashboard.routing.issue.duplicateAppBinding"
      | "dashboard.routing.issue.failoverProviderMissing"
      | "dashboard.routing.issue.failoverProviderDuplicate"
      | "dashboard.routing.issue.failoverMissingPrimary"
      | "dashboard.routing.issue.failoverMaxAttemptsExceeded"
      | "dashboard.routing.issue.observeModeWithFailover"
      | "dashboard.routing.issue.noRoutableProvider"
      | "dashboard.routing.issue.circuitOpen"
  ) => string
): string => {
  switch (issueCode) {
    case "provider-missing":
      return t("dashboard.routing.issue.providerMissing");
    case "provider-disabled":
      return t("dashboard.routing.issue.providerDisabled");
    case "credential-missing":
      return t("dashboard.routing.issue.credentialMissing");
    case "duplicate-app-binding":
      return t("dashboard.routing.issue.duplicateAppBinding");
    case "failover-provider-missing":
      return t("dashboard.routing.issue.failoverProviderMissing");
    case "failover-provider-duplicate":
      return t("dashboard.routing.issue.failoverProviderDuplicate");
    case "failover-missing-primary":
      return t("dashboard.routing.issue.failoverMissingPrimary");
    case "failover-max-attempts-exceeds-candidates":
      return t("dashboard.routing.issue.failoverMaxAttemptsExceeded");
    case "observe-mode-with-failover":
      return t("dashboard.routing.issue.observeModeWithFailover");
    case "no-routable-provider":
      return t("dashboard.routing.issue.noRoutableProvider");
    case "circuit-open":
      return t("dashboard.routing.issue.circuitOpen");
  }
};

const defaultMcpServerForm = (): McpServerUpsert => ({
  id: "filesystem",
  name: "Filesystem",
  transport: "stdio",
  command: "npx",
  args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
  url: null,
  env: {},
  headers: {},
  enabled: true
});

const defaultMcpBindingForm = (): AppMcpBindingUpsert => ({
  id: "codex-filesystem",
  appCode: "codex",
  serverId: "",
  enabled: true
});

type SnapshotDiffBucketKey =
  | "providers"
  | "promptTemplates"
  | "skills"
  | "workspaces"
  | "sessionRecords"
  | "bindings"
  | "appQuotas"
  | "failoverChains"
  | "mcpServers"
  | "appMcpBindings";

const renderSnapshotDiffBucketLabel = (
  key: SnapshotDiffBucketKey,
  t: (
    key:
      | "dashboard.snapshots.bucket.providers"
      | "dashboard.snapshots.bucket.promptTemplates"
      | "dashboard.snapshots.bucket.skills"
      | "dashboard.snapshots.bucket.workspaces"
      | "dashboard.snapshots.bucket.sessionRecords"
      | "dashboard.snapshots.bucket.bindings"
      | "dashboard.snapshots.bucket.appQuotas"
      | "dashboard.snapshots.bucket.failoverChains"
      | "dashboard.snapshots.bucket.mcpServers"
      | "dashboard.snapshots.bucket.appMcpBindings"
  ) => string
): string => {
  switch (key) {
    case "providers":
      return t("dashboard.snapshots.bucket.providers");
    case "promptTemplates":
      return t("dashboard.snapshots.bucket.promptTemplates");
    case "skills":
      return t("dashboard.snapshots.bucket.skills");
    case "workspaces":
      return t("dashboard.snapshots.bucket.workspaces");
    case "sessionRecords":
      return t("dashboard.snapshots.bucket.sessionRecords");
    case "bindings":
      return t("dashboard.snapshots.bucket.bindings");
    case "appQuotas":
      return t("dashboard.snapshots.bucket.appQuotas");
    case "failoverChains":
      return t("dashboard.snapshots.bucket.failoverChains");
    case "mcpServers":
      return t("dashboard.snapshots.bucket.mcpServers");
    case "appMcpBindings":
      return t("dashboard.snapshots.bucket.appMcpBindings");
  }
};

const buildSnapshotDiffItems = (
  diff: ConfigSnapshotDiff | null
): Array<{
  readonly key: SnapshotDiffBucketKey;
  readonly bucket: ConfigSnapshotDiffBucket;
}> => {
  if (diff === null) {
    return [];
  }

  const keys: SnapshotDiffBucketKey[] = [
    "providers",
    "promptTemplates",
    "skills",
    "workspaces",
    "sessionRecords",
    "bindings",
    "appQuotas",
    "failoverChains",
    "mcpServers",
    "appMcpBindings"
  ];

  return keys
    .map((key) => ({ key, bucket: diff[key] }))
    .filter(
      ({ bucket }) =>
        bucket.added.length > 0 || bucket.removed.length > 0 || bucket.changed.length > 0
    );
};

export const DashboardPage = (): JSX.Element => {
  const { t, locale } = useI18n();
  const assetFormsRef = useRef<HTMLDivElement | null>(null);
  const contextResourcesRef = useRef<HTMLDivElement | null>(null);
  const mcpHostSyncPanelRef = useRef<HTMLDivElement | null>(null);
  const mcpFormsRef = useRef<HTMLDivElement | null>(null);
  const routingFormsRef = useRef<HTMLDivElement | null>(null);
  const runtimePanelsRef = useRef<HTMLDivElement | null>(null);
  const trafficPanelsRef = useRef<HTMLDivElement | null>(null);
  const recoveryPanelRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollResolverRef = useRef<(() => HTMLDivElement | null) | null>(null);
  const startupRecoveryNoticeRef = useRef<string | null>(null);
  const mcpHostSyncFocusNonceRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [followUpNotice, setFollowUpNotice] = useState<DashboardFollowUpNotice | null>(null);
  const [followUpVisitedTargets, setFollowUpVisitedTargets] = useState<Record<string, string[]>>({});
  const [activeGovernanceCampaign, setActiveGovernanceCampaign] = useState<ActiveGovernanceCampaign | null>(null);
  const [showAdvancedPanels, setShowAdvancedPanels] = useState(false);
  const [mcpHostSyncFocusRequest, setMcpHostSyncFocusRequest] =
    useState<McpHostSyncFocusRequest | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [authActionError, setAuthActionError] = useState<string | null>(null);
  const [authActionNotice, setAuthActionNotice] = useState<string | null>(null);
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [providerForm, setProviderForm] = useState<ProviderUpsert>(createDefaultProviderForm);
  const [bindingForm, setBindingForm] = useState<AppBindingUpsert>(createDefaultBindingForm);
  const [proxyForm, setProxyForm] = useState<ProxyPolicy>({
    listenHost: "127.0.0.1",
    listenPort: 8788,
    enabled: false,
    requestTimeoutMs: 60000,
    failureThreshold: 3
  });
  const [failoverForm, setFailoverForm] = useState<FailoverChainUpsert>(createDefaultFailoverForm);
  const [mcpServerForm, setMcpServerForm] = useState<McpServerUpsert>(defaultMcpServerForm);
  const [mcpBindingForm, setMcpBindingForm] = useState<AppMcpBindingUpsert>(defaultMcpBindingForm);
  const [appQuotaForm, setAppQuotaForm] = useState<AppQuotaUpsert>(createDefaultAppQuotaForm);
  const [promptTemplateForm, setPromptTemplateForm] =
    useState<PromptTemplateUpsert>(createDefaultPromptTemplateForm);
  const [skillForm, setSkillForm] = useState<SkillUpsert>(createDefaultSkillForm);
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceUpsert>(createDefaultWorkspaceForm);
  const [sessionForm, setSessionForm] = useState<SessionRecordUpsert>(createDefaultSessionForm);
  const [mcpEnvText, setMcpEnvText] = useState('{\n  "ROOT_PATH": "/tmp"\n}');
  const [mcpHeadersText, setMcpHeadersText] = useState("{}");
  const [promptTagsText, setPromptTagsText] = useState("review");
  const [skillTagsText, setSkillTagsText] = useState("review");
  const [workspaceTagsText, setWorkspaceTagsText] = useState("backend");
  const [promptTemplateVersions, setPromptTemplateVersions] = useState<PromptTemplateVersion[]>([]);
  const [skillVersions, setSkillVersions] = useState<SkillVersion[]>([]);
  const [mcpImportOptions, setMcpImportOptions] = useState<McpImportOptions>({
    existingServerStrategy: "overwrite",
    missingBindingStrategy: "create"
  });
  const [hostApplyPreviewByApp, setHostApplyPreviewByApp] = useState<Record<string, HostCliApplyPreview | null>>({});

  const {
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
  } = useDashboardDataRuntime({
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
  });

  useEffect(() => {
    if (snapshot === null) {
      return;
    }

    setHostApplyPreviewByApp((current) => {
      const next = { ...current };
      let changed = false;

      for (const discovery of snapshot.discoveries) {
        if (discovery.integrationState === "managed" || discovery.takeoverSupported === false) {
          if (next[discovery.appCode] !== undefined) {
            delete next[discovery.appCode];
            changed = true;
          }
        }
      }

      return changed ? next : current;
    });
  }, [snapshot]);

  useEffect(() => {
    const startupRecovery = snapshot?.hostStartupRecovery;

    if (startupRecovery === null || startupRecovery === undefined) {
      return;
    }

    if (startupRecoveryNoticeRef.current === startupRecovery.executedAt) {
      return;
    }

    startupRecoveryNoticeRef.current = startupRecovery.executedAt;

    const targetAppCode =
      startupRecovery.rolledBackApps.length === 1
        ? startupRecovery.rolledBackApps[0]
        : undefined;

    setFollowUpNotice({
      category: "app-traffic",
      title:
        startupRecovery.failedApps.length === 0
          ? localize(locale, "已自动恢复残留临时接管", "Temporary Host Takeover Recovered Automatically")
          : localize(locale, "已自动恢复部分残留临时接管", "Temporary Host Takeover Partially Recovered"),
      summary:
        startupRecovery.failedApps.length === 0
          ? localize(
              locale,
              `系统在本次启动时自动恢复了上次异常退出残留的临时宿主机接管：${startupRecovery.rolledBackApps.join(", ")}。这些 CLI 现在应已恢复原始宿主机配置。`,
              `During this startup, the system automatically recovered stale temporary host takeovers left by the previous abnormal exit: ${startupRecovery.rolledBackApps.join(", ")}. Those CLIs should now be back on their original host configuration.`
            )
          : localize(
              locale,
              `系统在本次启动时自动恢复了 ${startupRecovery.rolledBackApps.length} 个残留临时接管，但仍有 ${startupRecovery.failedApps.length} 个应用需要人工检查宿主机配置与备份。`,
              `During this startup, the system automatically recovered ${startupRecovery.rolledBackApps.length} stale temporary takeover(s), but ${startupRecovery.failedApps.length} app(s) still need manual host-config and backup review.`
            ),
      actions: [
        {
          id: "startup-recovery-host-audit",
          label: localize(locale, "查看宿主机审计", "Open Host Audit"),
          kind: "audit",
          filters: {
            source: "host-integration"
          }
        },
        {
          id: "startup-recovery-runtime",
          label: localize(locale, "打开运行时", "Open Runtime"),
          kind: "section",
          section: "runtime"
        },
        ...(targetAppCode
          ? [
              {
                id: `startup-recovery-app-${targetAppCode}`,
                label: localize(locale, "查看该应用流量", "Open App Traffic"),
                kind: "app-logs" as const,
                appCode: targetAppCode
              }
            ]
          : [])
      ]
    });
  }, [locale, snapshot?.hostStartupRecovery, setFollowUpNotice]);

  const {
    promptTemplatePreview,
    skillPreview,
    workspacePreview,
    sessionPreview,
    appQuotaPreview,
    proxyPolicyPreview,
    restorePreview,
    restorePreviewVersion,
    selectedSnapshotDetail,
    selectedSnapshotDiff,
    mcpServerPreview,
    mcpBindingPreview,
    mcpHostSyncPreview,
    promptHostSyncPreview,
    promptHostImportPreview,
    mcpGovernancePreview,
    providerPreview,
    bindingPreview,
    failoverPreview,
    mcpServerPreviewError,
    canSaveWorkspace,
    canSaveSession,
    canSavePromptTemplate,
    canSaveSkill,
    canSaveMcpServer,
    canSaveMcpBinding,
    canSaveProvider,
    canSaveBinding,
    canSaveAppQuota,
    canSaveProxyPolicy,
    canSaveFailover,
    setMcpServerPreview,
    setMcpServerPreviewSignature,
    setMcpServerPreviewError,
    setMcpBindingPreview,
    setMcpBindingPreviewSignature
  } = useDashboardPreviewState({
    snapshot,
    selectedSnapshotVersion,
    setErrorMessage,
    promptTemplateForm,
    promptTagsText,
    skillForm,
    skillTagsText,
    workspaceForm,
    workspaceTagsText,
    sessionForm,
    appQuotaForm,
    proxyForm,
    providerForm,
    bindingForm,
    failoverForm,
    mcpServerForm,
    mcpEnvText,
    mcpHeadersText,
    mcpBindingForm,
    mcpImportOptions
  });

  const {
    editingMcpServerId,
    editingMcpBindingId,
    resetMcpServerEditor,
    resetMcpBindingEditor,
    loadPromptTemplateToEditor,
    loadSkillToEditor,
    loadWorkspaceToEditor,
    loadSessionToEditor,
    startEditMcpServer,
    startEditMcpBinding
  } = useDashboardEditors({
    setPromptTemplateForm,
    setPromptTagsText,
    setPromptTemplateVersions,
    setSkillForm,
    setSkillTagsText,
    setSkillVersions,
    setWorkspaceForm,
    setWorkspaceTagsText,
    setSessionForm,
    setMcpServerForm,
    setMcpEnvText,
    setMcpHeadersText,
    setMcpServerPreview,
    setMcpServerPreviewSignature,
    setMcpServerPreviewError,
    setMcpBindingForm,
    setMcpBindingPreview,
    setMcpBindingPreviewSignature,
    createDefaultMcpServerForm: defaultMcpServerForm,
    createDefaultMcpBindingForm: defaultMcpBindingForm
  });

  const {
    hasProviders,
    hasBindings,
    hasFailoverChains,
    effectiveSnapshotDiff,
    snapshotDiffItems,
    latestSnapshotReason,
    importPreviewIsCurrent,
    restorePreviewIsCurrent,
    mcpAuditItems,
    quotaAuditItems,
    quotaStatusByApp,
    resolvedWorkspaceContextById,
    resolvedSessionContextById,
    mcpRuntimeViewByApp,
    mcpRuntimeItemByBindingId,
    mcpHostSyncStateByApp,
    promptHostSyncStateByApp,
    mcpBindingUsage
  } = useDashboardDerivedState({
    snapshot,
    auditEventPageItems: auditEventPage?.items ?? [],
    selectedSnapshotVersion,
    selectedSnapshotDiff,
    selectedSnapshotDetail,
    restorePreview,
    restorePreviewVersion,
    importPreview,
    importPreviewSourceText,
    importText,
    buildSnapshotDiffItems
  });

  const focusAppLogs = (appCode: AppBinding["appCode"]): void => {
    const nextFilters = {
      ...requestLogFilters,
      appCode,
      providerId: "",
      workspaceId: "",
      sessionId: "",
      offset: 0
    };
    setRequestLogFilters(nextFilters);
    refreshRequestLogs(nextFilters);
  };

  const applyUsageFocus = (updates: Partial<typeof usageFilters>): void => {
    const nextFilters = {
      ...usageFilters,
      ...updates,
      offset: 0
    };
    setUsageFilters(nextFilters);
    refreshUsage(nextFilters);
  };

  const openAuditFocus = (filters: {
    readonly source?: "host-integration" | "provider-health" | "proxy-request" | "mcp" | "quota";
    readonly appCode?: AppBinding["appCode"];
    readonly providerId?: string;
    readonly level?: "info" | "warn" | "error";
  }): void => {
    const nextFilters = {
      ...auditFilters,
      source: filters.source ?? "",
      appCode: filters.appCode ?? "",
      providerId: filters.providerId ?? "",
      level: filters.level ?? "",
      offset: 0
    };
    setAuditFilters(nextFilters);
    refreshAuditEvents(nextFilters);
  };

  const syncProviderEvidence = (providerId: string): void => {
    refreshProviderDiagnosticDetail(providerId);
    focusProviderFailureLogs(providerId);
    openAuditFocus({
      source: "provider-health",
      providerId
    });
    applyUsageFocus({
      appCode: "",
      providerId,
      model: ""
    });
  };

  const syncWorkspaceEvidence = (workspaceId: string, appCode?: AppBinding["appCode"] | null): void => {
    refreshWorkspaceRuntimeDetail(workspaceId);
    focusWorkspaceLogs(workspaceId);
    if (appCode) {
      openAuditFocus({
        source: "proxy-request",
        appCode,
        level: "error"
      });
      applyUsageFocus({
        appCode,
        providerId: "",
        model: ""
      });
    }
  };

  const syncSessionEvidence = (sessionId: string, appCode?: AppBinding["appCode"] | null): void => {
    refreshSessionRuntimeDetail(sessionId);
    focusSessionLogs(sessionId);
    if (appCode) {
      openAuditFocus({
        source: "proxy-request",
        appCode,
        level: "error"
      });
      applyUsageFocus({
        appCode,
        providerId: "",
        model: ""
      });
    }
  };

  const syncAppEvidence = (
    appCode: AppBinding["appCode"],
    options?: {
      readonly source?: "host-integration" | "provider-health" | "proxy-request" | "mcp" | "quota";
      readonly providerId?: string;
      readonly level?: "info" | "warn" | "error";
    }
  ): void => {
    focusAppLogs(appCode);
    openAuditFocus({
      source: options?.source ?? "proxy-request",
      appCode,
      ...(options?.providerId ? { providerId: options.providerId } : {}),
      ...(options?.level ? { level: options.level } : {})
    });
    applyUsageFocus({
      appCode,
      providerId: options?.providerId ?? "",
      model: ""
    });
  };

  const openMcpRuntimeFocus = (appCode: AppBinding["appCode"]): void => {
    syncAppEvidence(appCode, {
      source: "mcp"
    });
    scrollToSection(runtimePanelsRef);
  };

  const openMcpAuditFocus = (appCode: AppBinding["appCode"]): void => {
    openAuditFocus({
      source: "mcp",
      appCode
    });
    scrollToSection(runtimePanelsRef);
  };

  const openAppTrafficFocus = (appCode: AppBinding["appCode"]): void => {
    focusAppLogs(appCode);
    scrollToSection(trafficPanelsRef);
  };

  const clearEvidenceFocus = (): void => {
    setSelectedProviderDiagnosticId(null);
    setSelectedProviderDiagnosticDetail(null);
    setSelectedWorkspaceRuntimeDetail(null);
    setSelectedSessionRuntimeDetail(null);
    const clearedRequestFilters = {
      ...requestLogFilters,
      appCode: "",
      providerId: "",
      workspaceId: "",
      sessionId: "",
      outcome: "",
      method: "",
      offset: 0
    };
    setRequestLogFilters(clearedRequestFilters);
    refreshRequestLogs(clearedRequestFilters);
    const clearedAuditFilters = {
      ...auditFilters,
      source: "",
      appCode: "",
      providerId: "",
      level: "",
      offset: 0
    };
    setAuditFilters(clearedAuditFilters);
    refreshAuditEvents(clearedAuditFilters);
    const clearedUsageFilters = {
      ...usageFilters,
      appCode: "",
      providerId: "",
      model: "",
      offset: 0
    };
    setUsageFilters(clearedUsageFilters);
    refreshUsage(clearedUsageFilters);
  };

  const actions = useDashboardActions({
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
    loadMcpServerToEditor: startEditMcpServer,
    loadMcpBindingToEditor: startEditMcpBinding,
    dashboardSnapshot: snapshot,
    selectedSnapshotVersion,
    snapshotMcpServersLength: snapshot?.mcpServers.length ?? 0,
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
  });

  const scrollToSection = (target: ScrollSectionTarget): void => {
    preloadAdvancedPanels();
    startTransition(() => {
      setShowAdvancedPanels(true);
    });
    const resolveTarget = () => resolveScrollSectionTarget(target);
    const nextTarget = resolveTarget();
    if (nextTarget === null) {
      pendingScrollResolverRef.current = resolveTarget;
      return;
    }
    pendingScrollResolverRef.current = null;
    if (typeof window === "undefined") {
      nextTarget.scrollIntoView();
      return;
    }
    window.requestAnimationFrame(() => {
      nextTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    if (!showAdvancedPanels) {
      return;
    }

    const resolveTarget = pendingScrollResolverRef.current;
    if (resolveTarget === null) {
      return;
    }

    const target = resolveTarget();
    if (target === null) {
      return;
    }

    pendingScrollResolverRef.current = null;
    if (typeof window === "undefined") {
      target.scrollIntoView();
      return;
    }

    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [showAdvancedPanels]);

  const openAdvancedPanels = (): void => {
    preloadAdvancedPanels();
    startTransition(() => {
      setShowAdvancedPanels(true);
    });
  };

  const openMcpVerificationHistory = (appCode: AppBinding["appCode"]): void => {
    mcpHostSyncFocusNonceRef.current += 1;
    setMcpHostSyncFocusRequest({
      appCode,
      target: "history",
      nonce: mcpHostSyncFocusNonceRef.current
    });
    scrollToSection(mcpHostSyncPanelRef);
  };

  const toggleAdvancedPanels = (): void => {
    if (!showAdvancedPanels) {
      preloadAdvancedPanels();
    }
    startTransition(() => {
      setShowAdvancedPanels((current) => !current);
    });
  };

  const editPromptTemplateAndFocus = (item: DashboardSnapshot["promptTemplates"][number]): void => {
    loadPromptTemplateToEditor(item);
    scrollToSection(assetFormsRef.current);
  };

  const editSkillAndFocus = (item: DashboardSnapshot["skills"][number]): void => {
    loadSkillToEditor(item);
    scrollToSection(assetFormsRef.current);
  };

  const editWorkspaceAndFocus = (item: DashboardSnapshot["workspaces"][number]): void => {
    loadWorkspaceToEditor(item);
    scrollToSection(assetFormsRef.current);
  };

  const editSessionAndFocus = (item: DashboardSnapshot["sessionRecords"][number]): void => {
    loadSessionToEditor(item);
    scrollToSection(assetFormsRef.current);
  };

  const editMcpServerAndFocus = (item: DashboardSnapshot["mcpServers"][number]): void => {
    startEditMcpServer(item);
    scrollToSection(mcpFormsRef.current);
  };

  const editMcpBindingAndFocus = (item: DashboardSnapshot["appMcpBindings"][number]): void => {
    startEditMcpBinding(item);
    scrollToSection(mcpFormsRef.current);
  };

  const editProviderAndFocus = (item: DashboardSnapshot["providers"][number]): void => {
    writeDashboardEditorSelection("provider", item.id);
    setProviderForm(buildProviderEditorState(item));
    scrollToSection(routingFormsRef.current);
  };

  const editBindingAndFocus = (item: DashboardSnapshot["bindings"][number]): void => {
    setBindingForm(buildBindingEditorState(item));
    scrollToSection(routingFormsRef.current);
  };

  const editAppQuotaAndFocus = (item: DashboardSnapshot["appQuotas"][number]): void => {
    writeDashboardEditorSelection("app-quota", item.id);
    setAppQuotaForm(buildAppQuotaEditorState(item));
    scrollToSection(routingFormsRef.current);
  };

  const editFailoverAndFocus = (item: DashboardSnapshot["failoverChains"][number]): void => {
    setFailoverForm(buildFailoverEditorState(item));
    scrollToSection(routingFormsRef.current);
  };

  const editProviderByIdAndFocus = (providerId: string): void => {
    const provider = snapshot?.providers.find((item) => item.id === providerId);
    if (provider) {
      editProviderAndFocus(provider);
    } else {
      scrollToSection(routingFormsRef.current);
    }
  };

  const openContextBatchFollowUp = (
    kind: "workspace" | "session",
    ids: string[],
    sourceLabel: string,
    appCode: AppBinding["appCode"] | null
  ): void => {
    const uniqueIds = Array.from(new Set(ids)).slice(0, 6);
    if (uniqueIds.length === 0) {
      return;
    }
    setFollowUpNotice({
      category: kind === "workspace" ? "workspace" : "session",
      title:
        kind === "workspace"
          ? localize(locale, `${sourceLabel} 影响的工作区批次`, `${sourceLabel} Workspace Batch`)
          : localize(locale, `${sourceLabel} 影响的会话批次`, `${sourceLabel} Session Batch`),
      summary:
        kind === "workspace"
          ? localize(
              locale,
              `当前共有 ${uniqueIds.length} 个工作区受 ${sourceLabel} 影响。建议先逐个看运行态，再回到资产区修正继承关系。`,
              `${uniqueIds.length} workspaces are affected by ${sourceLabel}. Review runtime first, then return to context assets to repair inheritance.`
            )
          : localize(
              locale,
              `当前共有 ${uniqueIds.length} 个会话受 ${sourceLabel} 影响。建议先逐个看运行态与请求，再决定是否保留会话级覆盖。`,
              `${uniqueIds.length} sessions are affected by ${sourceLabel}. Review runtime and request evidence first, then decide whether session-level overrides should remain.`
            ),
      actions: [
        ...uniqueIds.map((id) =>
          kind === "workspace"
            ? {
                id: `batch-workspace-runtime-${id}`,
                label: localize(locale, `打开工作区 ${id}`, `Open Workspace ${id}`),
                kind: "workspace-runtime" as const,
                workspaceId: id
              }
            : {
                id: `batch-session-runtime-${id}`,
                label: localize(locale, `打开会话 ${id}`, `Open Session ${id}`),
                kind: "session-runtime" as const,
                sessionId: id
              }
        ),
        ...(appCode
          ? [
              {
                id: `batch-app-logs-${kind}-${sourceLabel}`,
                label: localize(locale, "查看关联应用请求", "Open Related App Logs"),
                kind: "app-logs" as const,
                appCode
              }
            ]
          : []),
        {
          id: `batch-assets-${kind}-${sourceLabel}`,
          label: localize(locale, "返回上下文资产", "Back To Context Assets"),
          kind: "section" as const,
          section: "assets" as const
        }
      ]
    });
    const firstTargetId = uniqueIds[0];
    if (firstTargetId) {
      if (kind === "workspace") {
        syncWorkspaceEvidence(firstTargetId, appCode);
      } else {
        syncSessionEvidence(firstTargetId, appCode);
      }
    }
    scrollToSection(runtimePanelsRef.current);
  };

  const editBindingByAppCodeAndFocus = (appCode: string): void => {
    const binding = snapshot?.bindings.find((item) => item.appCode === appCode);
    if (binding) {
      editBindingAndFocus(binding);
    } else {
      scrollToSection(routingFormsRef.current);
    }
  };

  const editAppQuotaByAppCodeAndFocus = (appCode: string): void => {
    const quota = snapshot?.appQuotas.find((item) => item.appCode === appCode);
    if (quota) {
      editAppQuotaAndFocus(quota);
    } else {
      scrollToSection(routingFormsRef.current);
    }
  };

  const editFailoverByAppCodeAndFocus = (appCode: string): void => {
    const failover = snapshot?.failoverChains.find((item) => item.appCode === appCode);
    if (failover) {
      editFailoverAndFocus(failover);
    } else {
      scrollToSection(routingFormsRef.current);
    }
  };

  const editWorkspaceByIdAndFocus = (workspaceId: string): void => {
    const workspace = snapshot?.workspaces.find((item) => item.id === workspaceId);
    if (workspace) {
      editWorkspaceAndFocus(workspace);
    } else {
      scrollToSection(assetFormsRef.current);
    }
  };

  const editSessionByIdAndFocus = (sessionId: string): void => {
    const session = snapshot?.sessionRecords.find((item) => item.id === sessionId);
    if (session) {
      editSessionAndFocus(session);
    } else {
      scrollToSection(assetFormsRef.current);
    }
  };

  const loadHostApplyPreview = (
    appCode: string,
    mode?: HostCliApplyPreview["takeoverMode"]
  ): void =>
    runAction(
      async () => {
        const item = await previewApplyHostCliManagedConfig(
          appCode as AppBinding["appCode"],
          mode
        );
        setHostApplyPreviewByApp((current) => ({
          ...current,
          [appCode]: item
        }));
        setFollowUpNotice({
          category: "app-traffic",
          title: localize(locale, "宿主机接管预检已就绪", "Host Takeover Preview Ready"),
          summary:
            item.summary[0] ??
            localize(
              locale,
              "宿主机接管预检已生成，下一步应核对风险、回滚路径与请求验证顺序。",
              "The host takeover preview is ready. Review risk, rollback coverage, and validation order next."
            ),
          actions: [
            {
              id: `host-preview-runtime-${appCode}`,
              label: localize(locale, "打开运行时", "Open Runtime"),
              kind: "section",
              section: "runtime"
            },
            {
              id: `host-preview-audit-${appCode}`,
              label: localize(locale, "查看宿主机审计", "Open Host Audit"),
              kind: "audit",
              filters: {
                source: "host-integration",
                appCode: appCode as AppBinding["appCode"]
              }
            },
            {
              id: `host-preview-logs-${appCode}`,
              label: localize(locale, "查看应用请求", "Open App Requests"),
              kind: "app-logs",
              appCode: appCode as AppBinding["appCode"]
            }
          ]
        });
      },
      localize(locale, "宿主机接管预检已更新", "Host takeover preview updated")
    );

  const editMcpServerByIdAndFocus = (serverId: string): void => {
    const server = snapshot?.mcpServers.find((item) => item.id === serverId);
    if (server) {
      editMcpServerAndFocus(server);
    } else {
      scrollToSection(mcpFormsRef.current);
    }
  };

  const editMcpBindingByIdAndFocus = (bindingId: string): void => {
    const binding = snapshot?.appMcpBindings.find((item) => item.id === bindingId);
    if (binding) {
      editMcpBindingAndFocus(binding);
    } else {
      scrollToSection(mcpFormsRef.current);
    }
  };

  const followUpNoticeKey = followUpNotice ? buildFollowUpNoticeKey(followUpNotice) : null;

  useEffect(() => {
    if (followUpNoticeKey === null) {
      return;
    }

    if (followUpNotice?.category === "workspace") {
      const workspaceId = selectedWorkspaceRuntimeDetail?.summary.workspaceId;
      if (!workspaceId) {
        return;
      }
      setFollowUpVisitedTargets((current) => {
        const existing = current[followUpNoticeKey] ?? [];
        if (existing.includes(workspaceId)) {
          return current;
        }
        return {
          ...current,
          [followUpNoticeKey]: [...existing, workspaceId]
        };
      });
      return;
    }

    if (followUpNotice?.category === "session") {
      const sessionId = selectedSessionRuntimeDetail?.summary.sessionId;
      if (!sessionId) {
        return;
      }
      setFollowUpVisitedTargets((current) => {
        const existing = current[followUpNoticeKey] ?? [];
        if (existing.includes(sessionId)) {
          return current;
        }
        return {
          ...current,
          [followUpNoticeKey]: [...existing, sessionId]
        };
      });
      return;
    }

    if (followUpNotice?.category === "asset") {
      const nextTargetId = selectedWorkspaceRuntimeDetail?.summary.workspaceId
        ? `workspace:${selectedWorkspaceRuntimeDetail.summary.workspaceId}`
        : selectedSessionRuntimeDetail?.summary.sessionId
          ? `session:${selectedSessionRuntimeDetail.summary.sessionId}`
          : null;
      if (!nextTargetId) {
        return;
      }
      setFollowUpVisitedTargets((current) => {
        const existing = current[followUpNoticeKey] ?? [];
        if (existing.includes(nextTargetId)) {
          return current;
        }
        return {
          ...current,
          [followUpNoticeKey]: [...existing, nextTargetId]
        };
      });
    }
  }, [
    followUpNotice?.category,
    followUpNoticeKey,
    selectedWorkspaceRuntimeDetail?.summary.workspaceId,
    selectedSessionRuntimeDetail?.summary.sessionId
  ]);

  const followUpValidationItems = buildFollowUpValidationItems({
    locale,
    snapshot,
    followUpNotice,
    selectedProviderDiagnosticDetail,
    selectedWorkspaceRuntimeDetail,
    selectedSessionRuntimeDetail,
    requestLogPage,
    auditEventPage
  });
  const followUpVerdict = buildFollowUpVerdict(
    locale,
    followUpNotice,
    followUpValidationItems,
    snapshot
  );
  const followUpRunbook = buildFollowUpRunbook(locale, followUpNotice, snapshot);
  const batchFollowUpProgress = buildBatchFollowUpProgress({
    locale,
    notice: followUpNotice,
    visitedIds: followUpNoticeKey ? followUpVisitedTargets[followUpNoticeKey] ?? [] : [],
    selectedWorkspaceRuntimeDetail,
    selectedSessionRuntimeDetail
  });
  const batchFollowUpCompletion = buildBatchFollowUpCompletion({
    locale,
    progress: batchFollowUpProgress,
    verdict: followUpVerdict
  });
  const activeCampaignEvidence =
    activeGovernanceCampaign === null ||
    followUpNotice === null ||
    followUpVerdict === null ||
    !(
      (activeGovernanceCampaign.id === "campaign-provider-runtime" && followUpNotice.category === "provider") ||
      (activeGovernanceCampaign.id === "campaign-traffic" &&
        (followUpNotice.category === "app-traffic" || followUpNotice.category === "mcp")) ||
      (activeGovernanceCampaign.id === "campaign-context" &&
        (followUpNotice.category === "workspace" ||
          followUpNotice.category === "session" ||
          followUpNotice.category === "asset"))
    )
      ? null
      : {
          level: followUpVerdict.level,
          title: localize(locale, "最近一轮验证信号", "Most Recent Validation Signals"),
          summary: followUpVerdict.summary,
          validationItems: followUpValidationItems.slice(0, 4)
        };
  const evidenceFocusChips = [
    selectedProviderDiagnosticId
      ? `${localize(locale, "运行时 Provider", "Runtime Provider")}: ${selectedProviderDiagnosticId}`
      : null,
    selectedWorkspaceRuntimeDetail
      ? `${localize(locale, "运行时工作区", "Runtime Workspace")}: ${selectedWorkspaceRuntimeDetail.summary.workspaceName}`
      : null,
    selectedSessionRuntimeDetail
      ? `${localize(locale, "运行时会话", "Runtime Session")}: ${selectedSessionRuntimeDetail.summary.title}`
      : null,
    requestLogFilters.appCode ? `${localize(locale, "请求应用", "Request App")}: ${requestLogFilters.appCode}` : null,
    requestLogFilters.providerId ? `${localize(locale, "请求 Provider", "Request Provider")}: ${requestLogFilters.providerId}` : null,
    requestLogFilters.workspaceId ? `${localize(locale, "请求工作区", "Request Workspace")}: ${requestLogFilters.workspaceId}` : null,
    requestLogFilters.sessionId ? `${localize(locale, "请求会话", "Request Session")}: ${requestLogFilters.sessionId}` : null,
    auditFilters.source ? `${localize(locale, "审计来源", "Audit Source")}: ${auditFilters.source}` : null,
    auditFilters.appCode ? `${localize(locale, "审计应用", "Audit App")}: ${auditFilters.appCode}` : null,
    auditFilters.providerId ? `${localize(locale, "审计 Provider", "Audit Provider")}: ${auditFilters.providerId}` : null,
    usageFilters.appCode ? `${localize(locale, "用量应用", "Usage App")}: ${usageFilters.appCode}` : null,
    usageFilters.providerId ? `${localize(locale, "用量 Provider", "Usage Provider")}: ${usageFilters.providerId}` : null
  ].filter((item): item is string => item !== null);

  const runFollowUpAction = (action: DashboardFollowUpAction): void => {
    if (action.kind === "provider-runtime") {
      syncProviderEvidence(action.providerId);
      scrollToSection(runtimePanelsRef.current);
      return;
    }
    if (action.kind === "provider-logs") {
      syncProviderEvidence(action.providerId);
      scrollToSection(trafficPanelsRef.current);
      return;
    }
    if (action.kind === "workspace-runtime") {
      syncWorkspaceEvidence(
        action.workspaceId,
        action.appCode ?? selectedWorkspaceRuntimeDetail?.summary.appCode ?? null
      );
      scrollToSection(runtimePanelsRef.current);
      return;
    }
    if (action.kind === "workspace-logs") {
      syncWorkspaceEvidence(
        action.workspaceId,
        action.appCode ?? selectedWorkspaceRuntimeDetail?.summary.appCode ?? null
      );
      scrollToSection(trafficPanelsRef.current);
      return;
    }
    if (action.kind === "session-runtime") {
      syncSessionEvidence(
        action.sessionId,
        action.appCode ?? selectedSessionRuntimeDetail?.summary.appCode ?? null
      );
      scrollToSection(runtimePanelsRef.current);
      return;
    }
    if (action.kind === "session-logs") {
      syncSessionEvidence(
        action.sessionId,
        action.appCode ?? selectedSessionRuntimeDetail?.summary.appCode ?? null
      );
      scrollToSection(trafficPanelsRef.current);
      return;
    }
    if (action.kind === "app-logs") {
      syncAppEvidence(action.appCode);
      scrollToSection(trafficPanelsRef.current);
      return;
    }
    if (action.kind === "audit") {
      openAuditFocus(action.filters);
      scrollToSection(runtimePanelsRef.current);
      return;
    }
    if (action.kind !== "section") {
      return;
    }
    if (action.section === "routing") {
      scrollToSection(routingFormsRef.current);
      return;
    }
    if (action.section === "assets") {
      scrollToSection(assetFormsRef.current);
      return;
    }
    if (action.section === "mcp") {
      scrollToSection(mcpFormsRef.current);
      return;
    }
    if (action.section === "runtime") {
      scrollToSection(runtimePanelsRef.current);
      return;
    }
    if (action.section === "traffic") {
      scrollToSection(trafficPanelsRef.current);
      return;
    }
    scrollToSection(recoveryPanelRef.current);
  };

  const primeFollowUpAction = (action: DashboardFollowUpAction): void => {
    if (action.kind === "provider-runtime") {
      syncProviderEvidence(action.providerId);
      return;
    }
    if (action.kind === "provider-logs") {
      syncProviderEvidence(action.providerId);
      return;
    }
    if (action.kind === "workspace-runtime") {
      syncWorkspaceEvidence(
        action.workspaceId,
        action.appCode ?? selectedWorkspaceRuntimeDetail?.summary.appCode ?? null
      );
      return;
    }
    if (action.kind === "workspace-logs") {
      syncWorkspaceEvidence(
        action.workspaceId,
        action.appCode ?? selectedWorkspaceRuntimeDetail?.summary.appCode ?? null
      );
      return;
    }
    if (action.kind === "session-runtime") {
      syncSessionEvidence(
        action.sessionId,
        action.appCode ?? selectedSessionRuntimeDetail?.summary.appCode ?? null
      );
      return;
    }
    if (action.kind === "session-logs") {
      syncSessionEvidence(
        action.sessionId,
        action.appCode ?? selectedSessionRuntimeDetail?.summary.appCode ?? null
      );
      return;
    }
    if (action.kind === "app-logs") {
      syncAppEvidence(action.appCode);
      return;
    }
    if (action.kind === "audit") {
      openAuditFocus(action.filters);
    }
  };

  const activateGovernanceQueueNotice = (notice: DashboardFollowUpNotice): void => {
    setFollowUpNotice(notice);
    notice.actions.forEach((action) => {
      primeFollowUpAction(action);
    });
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-topbar">
          <p className="eyebrow">{t("app.eyebrow")}</p>
          <LanguageSwitcher />
        </div>
        <h1>{t("app.title")}</h1>
        <p className="hero-copy">{t("app.description")}</p>
        <p className="hero-hint">{t("app.openSourceHint")}</p>
        <p className="hero-locale">
          {t("app.localeSummary")}: {snapshot?.metadata.supportedLocales.join(" / ") ?? "zh-CN / en-US"}
        </p>
        {snapshot ? (
          <div className="quick-action-row hero-actions">
            <button
              className="inline-action"
              type="button"
              onMouseEnter={preloadAdvancedPanels}
              onFocus={preloadAdvancedPanels}
              onClick={toggleAdvancedPanels}
            >
              {showAdvancedPanels
                ? localize(locale, "收起高级面板", "Hide Advanced Panels")
                : localize(locale, "展开高级面板", "Show Advanced Panels")}
            </button>
            <button
              className="inline-action"
              type="button"
              onClick={() => scrollToSection(runtimePanelsRef.current)}
            >
              {localize(locale, "打开运行态与审计", "Open Runtime And Audit")}
            </button>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <section className="panel error-panel">
          <h2>{t("dashboard.backendErrorTitle")}</h2>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {noticeMessage ? (
        <section className="panel success-panel">
          <p>{noticeMessage}</p>
        </section>
      ) : null}

      {followUpNotice ? (
        <section className="panel success-panel follow-up-panel" data-testid="follow-up-notice-panel">
          <h2>{followUpNotice.title}</h2>
          <p>{followUpNotice.summary}</p>
          {followUpVerdict ? (
            <div className={`governance-notice governance-${followUpVerdict.level}`}>
              <div className="governance-notice-header">
                <strong>{followUpVerdict.title}</strong>
                <span className="governance-notice-badge">
                  {followUpVerdict.level === "low"
                    ? localize(locale, "低风险", "Low Risk")
                    : followUpVerdict.level === "medium"
                      ? localize(locale, "中风险", "Medium Risk")
                      : localize(locale, "高风险", "High Risk")}
                </span>
              </div>
              <ul className="governance-suggestion-list">
                <li>{followUpVerdict.summary}</li>
              </ul>
            </div>
          ) : null}
          {followUpRunbook.length > 0 ? (
            <div className="governance-notice governance-low">
              <div className="governance-notice-header">
                <strong>{localize(locale, "推荐验证顺序", "Recommended Verification Order")}</strong>
                <span className="governance-notice-badge">{localize(locale, "Runbook", "Runbook")}</span>
              </div>
              <ul className="governance-suggestion-list">
                {followUpRunbook.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {batchFollowUpProgress ? (
            <div className={`governance-notice governance-${batchFollowUpProgress.level}`}>
              <div className="governance-notice-header">
                <strong>{batchFollowUpProgress.title}</strong>
                <span className="governance-notice-badge">
                  {batchFollowUpProgress.visitedCount > 0
                    ? `${batchFollowUpProgress.visitedCount}/${batchFollowUpProgress.total}`
                    : localize(locale, "待开始", "Not Started")}
                </span>
              </div>
              <p>{batchFollowUpProgress.summary}</p>
              <div className="quota-progress-block batch-progress-block">
                <div className="quota-progress-meta">
                  <span>
                    {localize(locale, "已查看", "Reviewed")}: {batchFollowUpProgress.visitedCount}
                  </span>
                  <span>
                    {localize(locale, "当前项", "Current")}:{" "}
                    {batchFollowUpProgress.currentIndex > 0
                      ? batchFollowUpProgress.currentIndex
                      : localize(locale, "未定位", "None")}
                  </span>
                  <span>
                    {localize(locale, "剩余", "Remaining")}: {batchFollowUpProgress.remaining}
                  </span>
                </div>
                <div className="quota-progress-bar-shell">
                  <div
                    className={`quota-progress-bar ${batchFollowUpProgress.level === "medium" ? "state-warning" : ""}`}
                    style={{ width: `${batchFollowUpProgress.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {batchFollowUpCompletion ? (
            <div className={`governance-notice governance-${batchFollowUpCompletion.level}`}>
              <div className="governance-notice-header">
                <strong>{batchFollowUpCompletion.title}</strong>
                <span className="governance-notice-badge">
                  {batchFollowUpCompletion.level === "low"
                    ? localize(locale, "可结束", "Ready")
                    : batchFollowUpCompletion.level === "medium"
                      ? localize(locale, "继续确认", "Keep Verifying")
                      : localize(locale, "未收敛", "Not Converged")}
                </span>
              </div>
              <ul className="governance-suggestion-list">
                <li>{batchFollowUpCompletion.summary}</li>
              </ul>
            </div>
          ) : null}
          {followUpValidationItems.length > 0 ? (
            <div className="preview-summary-grid">
              {followUpValidationItems.map((item) => (
                <div className={`preview-summary-tile risk-${item.level}`} key={item.id}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="quick-action-row">
            {followUpNotice.actions.map((action) => (
              <button
                className="inline-action"
                type="button"
                key={action.id}
                data-testid={`follow-up-action-${action.id}`}
                onClick={() => runFollowUpAction(action)}
              >
                {action.label}
              </button>
            ))}
            <button
              className="inline-action"
              type="button"
              onClick={() => {
                setFollowUpNotice(null);
                setActiveGovernanceCampaign(null);
              }}
            >
              {locale === "zh-CN" ? "关闭建议" : "Dismiss"}
            </button>
          </div>
        </section>
      ) : null}

      {evidenceFocusChips.length > 0 ? (
        <section className="panel">
          <h2>{localize(locale, "统一证据焦点", "Unified Evidence Focus")}</h2>
          <p className="panel-lead">
            {localize(
              locale,
              "当前 runtime、请求、审计、用量已经尽量对齐到同一批目标对象。继续排障时优先沿着这组焦点前进。",
              "Runtime, requests, audit, and usage are aligned to the same target set as much as possible. Continue debugging along this focus path first."
            )}
          </p>
          <div className="quick-action-row">
            {evidenceFocusChips.map((chip) => (
              <span className="filter-summary-chip" key={chip}>
                {chip}
              </span>
            ))}
          </div>
          <div className="quick-action-row">
            <button className="inline-action" type="button" onClick={() => scrollToSection(runtimePanelsRef.current)}>
              {localize(locale, "查看运行时", "Open Runtime")}
            </button>
            <button className="inline-action" type="button" onClick={() => scrollToSection(trafficPanelsRef.current)}>
              {localize(locale, "查看请求与用量", "Open Traffic & Usage")}
            </button>
            <button className="inline-action" type="button" onClick={() => scrollToSection(runtimePanelsRef.current)}>
              {localize(locale, "查看审计", "Open Audit")}
            </button>
            <button className="inline-action" type="button" onClick={clearEvidenceFocus}>
              {localize(locale, "清空证据焦点", "Clear Evidence Focus")}
            </button>
          </div>
        </section>
      ) : null}

      {pendingDeleteReview ? (
        <DeleteReviewPanel
          review={pendingDeleteReview}
          isWorking={isWorking}
          onConfirm={() => actions.confirmDelete(pendingDeleteReview.kind, pendingDeleteReview.id)}
          onCancel={() => setPendingDeleteReview(null)}
          locale={locale}
          t={t}
        />
      ) : null}

      {needsToken ? (
        <section className="panel auth-panel">
          <h2>{t("dashboard.controlTokenTitle")}</h2>
          <p>{t("dashboard.controlTokenDescription")}</p>
          <div className="auth-row">
            <input
              className="auth-input"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={t("dashboard.controlTokenPlaceholder")}
            />
            <button
              className="auth-button"
              type="button"
              onClick={() => {
                writeStoredControlToken(tokenInput);
                window.location.reload();
              }}
            >
              {t("dashboard.controlTokenSave")}
            </button>
          </div>
        </section>
      ) : null}

      {snapshot ? (
        <section className="panel auth-panel">
          <h2>{localize(locale, "控制台认证管理", "Console Auth Management")}</h2>
          <p className="panel-lead">
            {localize(
              locale,
              "这里展示 daemon 当前控制认证来源。数据库模式下可以直接旋转 token，环境变量模式下只能通过外部配置更新。",
              "This panel shows the daemon's current control auth source. In database mode you can rotate the token directly; env mode must be updated from external configuration."
            )}
          </p>
          <div className="preview-summary-grid">
            <div className="preview-summary-tile">
              <strong>{snapshot.controlAuth.source}</strong>
              <span>{localize(locale, "认证来源", "Auth Source")}</span>
            </div>
            <div className={`preview-summary-tile ${snapshot.controlAuth.canRotate ? "risk-medium" : "risk-low"}`}>
              <strong>{snapshot.controlAuth.canRotate ? localize(locale, "可旋转", "Rotatable") : localize(locale, "环境变量托管", "Env Managed")}</strong>
              <span>{localize(locale, "旋转能力", "Rotation Capability")}</span>
            </div>
            <div className="preview-summary-tile">
              <strong>{snapshot.controlAuth.maskedToken}</strong>
              <span>{localize(locale, "当前脱敏令牌", "Masked Token")}</span>
            </div>
            <div className="preview-summary-tile">
              <strong>{snapshot.controlAuth.updatedAt ? formatDateTime(snapshot.controlAuth.updatedAt) : t("common.notFound")}</strong>
              <span>{localize(locale, "最近更新时间", "Last Updated")}</span>
            </div>
          </div>
          {authActionNotice ? <p className="panel-supporting-copy">{authActionNotice}</p> : null}
          {authActionError ? <p className="form-hint">{authActionError}</p> : null}
          <div className="quick-action-row">
            <button
              className="inline-action"
              type="button"
              disabled={!snapshot.controlAuth.canRotate || isWorking}
              onClick={() => {
                setAuthActionError(null);
                setAuthActionNotice(null);
                runAction(async () => {
                  const result = await rotateControlAuthToken();
                  writeStoredControlToken(result.token);
                  setTokenInput(result.token);
                  setAuthActionNotice(
                    localize(
                      locale,
                      "控制令牌已旋转，并已写入当前浏览器存储。后续新会话请改用新令牌。",
                      "The control token has been rotated and written into browser storage. Use the new token for any future sessions."
                    )
                  );
                }, localize(locale, "控制令牌已旋转", "Control token rotated"));
              }}
            >
              {localize(locale, "旋转控制令牌", "Rotate Control Token")}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={isWorking}
              onClick={() => {
                setAuthActionError(null);
                setAuthActionNotice(
                  localize(
                    locale,
                    `当前浏览器持有的控制令牌已更新为 ${snapshot.controlAuth.maskedToken} 对应值。`,
                    `The browser now uses the token behind ${snapshot.controlAuth.maskedToken}.`
                  )
                );
              }}
            >
              {localize(locale, "确认当前浏览器令牌", "Confirm Browser Token")}
            </button>
          </div>
          {!snapshot.controlAuth.canRotate ? (
            <p className="panel-supporting-copy">
              {localize(
                locale,
                "当前认证由环境变量托管。若需换 token，请修改 daemon 启动环境中的 CCSW_CONTROL_TOKEN 后重启服务。",
                "Authentication is managed by environment variables. To rotate it, update CCSW_CONTROL_TOKEN in the daemon environment and restart the service."
              )}
            </p>
          ) : null}
        </section>
      ) : null}

      {snapshot ? (
        <>
          <QuickStartPanel
            snapshot={snapshot}
            locale={locale}
            isWorking={isWorking}
            hostApplyPreviewByApp={hostApplyPreviewByApp}
            followUpNotice={followUpNotice}
            followUpVerdict={followUpVerdict}
            followUpValidationItems={followUpValidationItems}
            onPreviewHostCliManagedConfig={loadHostApplyPreview}
            onApplyHostCliManagedConfig={actions.runtime.applyHostCliManagedConfig}
            onRollbackHostCliManagedConfig={actions.runtime.rollbackHostCliManagedConfig}
            onSyncServiceEnv={() => {
              runAction(
                async () => {
                  await syncSystemServiceEnv();
                },
                localize(locale, "服务环境文件已同步", "Service environment file synced")
              );
            }}
            onInstallSystemService={() => {
              runAction(
                async () => {
                  await installSystemUserService();
                },
                localize(locale, "User service 已安装", "User service installed")
              );
            }}
            onOpenRuntime={() => scrollToSection(runtimePanelsRef)}
            onOpenTraffic={openAppTrafficFocus}
            onOpenMcpRuntime={openMcpRuntimeFocus}
            onOpenMcpAudit={openMcpAuditFocus}
            onOpenMcpVerificationHistory={openMcpVerificationHistory}
            onOpenAssetForms={() => scrollToSection(assetFormsRef)}
            onOpenMcpForms={() => scrollToSection(mcpFormsRef)}
            onRefreshSnapshot={refreshSnapshot}
            promptHostSyncPreview={promptHostSyncPreview}
            promptHostImportPreview={promptHostImportPreview}
            promptHostSyncStateByApp={promptHostSyncStateByApp}
            mcpHostSyncPreview={mcpHostSyncPreview}
            mcpGovernancePreview={mcpGovernancePreview}
            mcpVerificationHistoryByApp={mcpVerificationHistoryByApp}
            mcpRuntimeViewByApp={mcpRuntimeViewByApp}
            mcpHostSyncStateByApp={mcpHostSyncStateByApp}
            onImportPromptFromHost={actions.promptHost.importFromHost}
            onApplyPromptHostSync={actions.promptHost.applyHostSync}
            onRollbackPromptHostSync={actions.promptHost.rollbackHostSync}
            onImportMcpFromHost={actions.mcpHost.importFromHost}
            onRepairMcpGovernance={actions.mcpHost.repairGovernance}
            onApplyMcpHostSync={actions.mcpHost.applyHostSync}
            onRollbackMcpHostSync={actions.mcpHost.rollbackHostSync}
            onOpenContextResources={() => scrollToSection(contextResourcesRef)}
            onImportAllWorkspaceDiscovery={actions.contextResources.importAllWorkspaceDiscovery}
            onEnsureSessionAndActivateFromDiscovery={
              actions.contextResources.ensureSessionAndActivateFromDiscovery
            }
            onRunIntakeConvergence={actions.contextResources.runIntakeConvergence}
            onClearActiveWorkspace={actions.clearActiveWorkspace}
            onClearActiveSession={actions.clearActiveSession}
            onArchiveStaleSessions={actions.archiveStaleSessions}
            onQuickContextApplied={(appCode, result) => {
              setFollowUpNotice({
                category: result.target.resolvedMode === "asset-only" ? "asset" : "app-traffic",
                title: localize(
                  locale,
                  `${appCode} 默认 Prompt / Skill 已就位`,
                  `${appCode} Default Prompt / Skill Ready`
                ),
                summary:
                  result.target.resolvedMode === "asset-only"
                    ? localize(
                        locale,
                        "资产已经创建，但还没有挂到即时运行态。下一步先回到上下文资产区确认挂载目标，再继续验证。",
                        "The assets were created, but they are not attached to a live runtime target yet. Review the target in context assets before verification."
                      )
                    : localize(
                        locale,
                        "默认 Prompt / Skill 已挂到运行链路。下一步直接验证运行态和真实请求是否已经命中新上下文。",
                        "The default prompt and skill are attached to runtime. Next, verify runtime and live requests are using the new context."
                      ),
                actions: [
                  {
                    id: `quick-context-assets-${appCode}`,
                    label: localize(locale, "返回上下文资产", "Back To Context Assets"),
                    kind: "section",
                    section: "assets"
                  },
                  {
                    id: `quick-context-runtime-${appCode}`,
                    label: localize(locale, "打开运行态", "Open Runtime"),
                    kind: "section",
                    section: "runtime"
                  },
                  {
                    id: `quick-context-logs-${appCode}`,
                    label: localize(locale, "查看请求结果", "Open Requests"),
                    kind: "app-logs",
                    appCode
                  }
                ]
              });
              startTransition(() => {
                setShowAdvancedPanels(true);
              });
            }}
            onQuickOnboardingApplied={(appCode, result) => {
              setFollowUpNotice({
                category: "app-traffic",
                title: localize(locale, `${appCode} 已完成一键接入`, `${appCode} Quick Onboarding Complete`),
                summary:
                  result.hostTakeoverError === null
                    ? localize(
                        locale,
                        "下一步直接发起一次真实 CLI 请求，确认代理命中、Provider 运行态和故障转移链已经一起工作。",
                        "Next, trigger a real CLI request and confirm proxy routing, provider runtime, and failover are working together."
                      )
                    : localize(
                        locale,
                        "配置和代理已生效，但宿主机接管未完全完成。先确认本机 CLI 配置，再做真实请求验证。",
                        "Configuration and proxy are live, but host takeover did not finish cleanly. Verify host CLI config before live request validation."
                      ),
                actions: [
                  {
                    id: `quick-onboarding-traffic-${appCode}`,
                    label: localize(locale, "查看请求结果", "Open Requests"),
                    kind: "app-logs",
                    appCode
                  },
                  {
                    id: `quick-onboarding-runtime-${appCode}`,
                    label: localize(locale, "查看运行态", "Open Runtime"),
                    kind: "section",
                    section: "runtime"
                  },
                  {
                    id: `quick-onboarding-audit-${appCode}`,
                    label: localize(locale, "查看审计", "Open Audit"),
                    kind: "audit",
                    filters: {
                      appCode,
                      source: "host-integration"
                    }
                  }
                ]
              });
              if (result.hostTakeoverApplied || result.hostTakeoverError !== null) {
                loadHostApplyPreview(appCode);
              }
              startTransition(() => {
                setShowAdvancedPanels(true);
              });
            }}
            onRunFollowUpAction={runFollowUpAction}
          />
          {showAdvancedPanels ? (
            <>
          <section className="metrics-grid">
            <MetricCard
              label={t("dashboard.metrics.serviceStatus")}
              value={snapshot.health.status}
              hint={snapshot.health.service}
            />
            <MetricCard
              label={t("dashboard.metrics.providerCount")}
              value={snapshot.providers.length}
              hint={t("dashboard.metrics.providerHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.bindingCount")}
              value={snapshot.bindings.length}
              hint={t("dashboard.metrics.bindingHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.discoveryCount")}
              value={snapshot.discoveries.filter((item) => item.discovered).length}
              hint={t("dashboard.metrics.discoveryHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.proxyRequestCount")}
              value={snapshot.proxyRuntime.requestLogCount}
              hint={t("dashboard.metrics.proxyRequestHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.mcpServerCount")}
              value={snapshot.mcpServers.length}
              hint={t("dashboard.metrics.mcpServerHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.usageTokenCount")}
              value={formatNumber(usageSummary?.totalTokens ?? 0)}
              hint={t("dashboard.metrics.usageHint")}
            />
          </section>

          <section className="content-grid">
            <Suspense
              fallback={
                <AdvancedPanelFallback
                  locale={locale}
                  title={localize(locale, "治理概览", "Governance Overview")}
                />
              }
            >
              <LazyOverviewGovernancePanels
                snapshot={snapshot}
                hasProviders={hasProviders}
                hasBindings={hasBindings}
                hasFailoverChains={hasFailoverChains}
                isWorking={isWorking}
                quotaStatusByApp={quotaStatusByApp}
                formatNumber={formatNumber}
                formatPercent={formatPercent}
                renderProviderType={renderProviderType}
                renderBindingMode={(binding) => renderBindingMode(binding, t)}
                renderQuotaState={(state) => renderQuotaState(state, t)}
                renderEffectiveContextSource={(source) => renderEffectiveContextSource(source, t)}
                renderContextRoutingStepKind={(kind) => renderContextRoutingStepKind(kind, t)}
                locale={locale}
                onEditProvider={editProviderAndFocus}
                onDeleteProvider={actions.deleteProviderReview}
                onEditBinding={editBindingAndFocus}
                onDeleteBinding={actions.deleteBindingReview}
                onEditAppQuota={editAppQuotaAndFocus}
                onDeleteAppQuota={actions.deleteAppQuotaReview}
                onOpenRoutingForms={() => scrollToSection(routingFormsRef.current)}
                onOpenAssetForms={() => scrollToSection(assetFormsRef.current)}
                onOpenMcpForms={() => scrollToSection(mcpFormsRef.current)}
                onOpenRecoveryPanel={() => scrollToSection(recoveryPanelRef.current)}
                onOpenProviderRuntime={refreshProviderDiagnosticDetail}
                onPreviewHostCliManagedConfig={loadHostApplyPreview}
                onApplyHostCliManagedConfig={actions.runtime.applyHostCliManagedConfig}
                onEditFailoverChain={editFailoverAndFocus}
                onEditWorkspace={editWorkspaceAndFocus}
                onEditSession={editSessionAndFocus}
                onEditPromptTemplate={editPromptTemplateAndFocus}
                onEditSkill={editSkillAndFocus}
                onClearActiveWorkspace={actions.clearActiveWorkspace}
                onClearActiveSession={actions.clearActiveSession}
                onArchiveStaleSessions={actions.archiveStaleSessions}
                onActivateGovernanceQueueNotice={activateGovernanceQueueNotice}
                activeCampaignId={activeGovernanceCampaign?.id ?? null}
                activeCampaignEvidence={activeCampaignEvidence}
                onActivateCampaign={setActiveGovernanceCampaign}
                hostApplyPreviewByApp={hostApplyPreviewByApp}
                t={(key) => t(key as never)}
              />
            </Suspense>

            <Suspense
              fallback={
                <AdvancedPanelFallback
                  locale={locale}
                  title={localize(locale, "上下文资源", "Context Resources")}
                />
              }
            >
              <div ref={contextResourcesRef} className="panel-scroll-target">
                <LazyContextResourcePanels
                  snapshot={snapshot}
                  resolvedWorkspaceContextById={resolvedWorkspaceContextById}
                  resolvedSessionContextById={resolvedSessionContextById}
                  mcpRuntimeItemByBindingId={mcpRuntimeItemByBindingId}
                  mcpBindingUsage={mcpBindingUsage}
                  isWorking={isWorking}
                  onEditPromptTemplate={editPromptTemplateAndFocus}
                  onDeletePromptTemplate={actions.contextResources.deletePromptTemplateReview}
                  onOpenWorkspaceBatchReview={(workspaceIds, sourceLabel, appCode) =>
                    openContextBatchFollowUp("workspace", workspaceIds, sourceLabel, appCode)
                  }
                  onOpenSessionBatchReview={(sessionIds, sourceLabel, appCode) =>
                    openContextBatchFollowUp("session", sessionIds, sourceLabel, appCode)
                  }
                  onEditSkill={editSkillAndFocus}
                  onDeleteSkill={actions.contextResources.deleteSkillReview}
                  onEditWorkspace={editWorkspaceAndFocus}
                  onActivateWorkspace={actions.contextResources.activateWorkspace}
                  onDeleteWorkspace={actions.contextResources.deleteWorkspaceReview}
                  onImportAllWorkspaceDiscovery={actions.contextResources.importAllWorkspaceDiscovery}
                  onImportWorkspaceDiscovery={actions.contextResources.importWorkspaceDiscovery}
                  onEnsureSessionFromDiscovery={actions.contextResources.ensureSessionFromDiscovery}
                  onEnsureSessionAndActivateFromDiscovery={
                    actions.contextResources.ensureSessionAndActivateFromDiscovery
                  }
                  onEditSession={editSessionAndFocus}
                  onActivateSession={actions.contextResources.activateSession}
                  onArchiveSession={actions.contextResources.archiveSession}
                  onDeleteSession={actions.contextResources.deleteSessionReview}
                  onEditFailoverChain={editFailoverAndFocus}
                  onDeleteFailoverChain={actions.contextResources.deleteFailoverReview}
                  onEditMcpServer={editMcpServerAndFocus}
                  onDeleteMcpServer={actions.contextResources.deleteMcpServerReview}
                  onEditMcpBinding={editMcpBindingAndFocus}
                  onDeleteMcpBinding={actions.contextResources.deleteMcpBindingReview}
                />
              </div>
            </Suspense>

            <Suspense
              fallback={
                <AdvancedPanelFallback
                  locale={locale}
                  title={localize(locale, "Prompt 宿主机同步", "Prompt Host Sync")}
                />
              }
            >
              <LazyPromptHostSyncPanel
                snapshot={snapshot}
                promptHostSyncPreview={promptHostSyncPreview}
                promptHostImportPreview={promptHostImportPreview}
                promptHostSyncStateByApp={promptHostSyncStateByApp}
                isWorking={isWorking}
                onImportFromHost={actions.promptHost.importFromHost}
                onApplyHostSyncAll={actions.promptHost.applyHostSyncAll}
                onApplyHostSync={actions.promptHost.applyHostSync}
                onRollbackHostSync={actions.promptHost.rollbackHostSync}
                onEditPromptTemplate={editPromptTemplateAndFocus}
                onOpenAssetForms={() => scrollToSection(assetFormsRef.current)}
              />
            </Suspense>

            <Suspense
              fallback={
                <AdvancedPanelFallback
                  locale={locale}
                  title={localize(locale, "MCP 宿主机同步", "MCP Host Sync")}
                />
              }
            >
              <div ref={mcpHostSyncPanelRef} className="panel-scroll-target">
                <LazyMcpHostSyncPanel
                  snapshot={snapshot}
                  focusRequest={mcpHostSyncFocusRequest}
                  mcpImportOptions={mcpImportOptions}
                  setMcpImportOptions={setMcpImportOptions}
                  mcpHostSyncPreview={mcpHostSyncPreview}
                  mcpGovernancePreview={mcpGovernancePreview}
                  mcpImportPreview={mcpImportPreview}
                  mcpVerificationHistoryByApp={mcpVerificationHistoryByApp}
                  mcpVerificationHistoryLoadingByApp={mcpVerificationHistoryLoadingByApp}
                  mcpRuntimeViewByApp={mcpRuntimeViewByApp}
                  mcpHostSyncStateByApp={mcpHostSyncStateByApp}
                  isWorking={isWorking}
                  onLoadImportPreview={loadMcpImportPreview}
                  onLoadMoreVerificationHistory={loadMoreMcpVerificationHistory}
                  onConvergeAll={actions.mcpHost.convergeAll}
                  onRepairGovernanceAll={actions.mcpHost.repairGovernanceAll}
                  onRepairGovernance={actions.mcpHost.repairGovernance}
                  onImportFromHost={actions.mcpHost.importFromHost}
                  onApplyHostSyncAll={actions.mcpHost.applyHostSyncAll}
                  onRollbackHostSyncAll={actions.mcpHost.rollbackHostSyncAll}
                  onApplyHostSync={actions.mcpHost.applyHostSync}
                  onRollbackHostSync={actions.mcpHost.rollbackHostSync}
                  onEditMcpServer={editMcpServerAndFocus}
                  onEditMcpBinding={editMcpBindingAndFocus}
                  onOpenMcpForms={() => scrollToSection(mcpFormsRef)}
                  onOpenRuntime={openMcpRuntimeFocus}
                  onOpenAudit={openMcpAuditFocus}
                  onOpenTraffic={openAppTrafficFocus}
                />
              </div>
            </Suspense>

            <div ref={runtimePanelsRef} className="panel-scroll-target">
              <Suspense
                fallback={
                  <AdvancedPanelFallback
                    locale={locale}
                    title={localize(locale, "运行态治理", "Runtime Governance")}
                  />
                }
              >
                <LazyRuntimeGovernancePanels
                  snapshot={snapshot}
                  isWorking={isWorking}
                  selectedProviderDiagnosticId={selectedProviderDiagnosticId}
                  selectedProviderDiagnosticDetail={selectedProviderDiagnosticDetail}
                  selectedWorkspaceRuntimeDetail={selectedWorkspaceRuntimeDetail}
                  selectedSessionRuntimeDetail={selectedSessionRuntimeDetail}
                  auditEventPage={auditEventPage}
                  auditFilters={auditFilters}
                  setAuditFilters={setAuditFilters}
                  mcpAuditItems={mcpAuditItems}
                  quotaAuditItems={quotaAuditItems}
                  refreshProviderDiagnosticDetail={refreshProviderDiagnosticDetail}
                  onRecoverProvider={actions.runtime.recoverProvider}
                  onIsolateProvider={actions.runtime.isolateProvider}
                  onResetProvider={actions.runtime.resetProvider}
                  onProbeProvider={actions.runtime.probeProvider}
                  onEditProvider={editProviderByIdAndFocus}
                  onEditBinding={editBindingByAppCodeAndFocus}
                  onEditFailover={editFailoverByAppCodeAndFocus}
                  onEditMcpServer={editMcpServerByIdAndFocus}
                  onEditMcpBinding={editMcpBindingByIdAndFocus}
                  focusProviderFailureLogs={focusProviderFailureLogs}
                  closeProviderDetail={actions.runtime.closeProviderDetail}
                  onOpenRoutingForms={() => scrollToSection(routingFormsRef.current)}
                  onOpenMcpForms={() => scrollToSection(mcpFormsRef.current)}
                  onOpenAssetForms={() => scrollToSection(assetFormsRef.current)}
                  onApplyHostCliManagedConfig={actions.runtime.applyHostCliManagedConfig}
                  onRollbackHostCliManagedConfig={actions.runtime.rollbackHostCliManagedConfig}
                  onRollbackForegroundHostCliManagedConfigs={
                    actions.runtime.rollbackForegroundHostCliManagedConfigs
                  }
                  hostApplyPreviewByApp={hostApplyPreviewByApp}
                  onPreviewHostCliManagedConfig={loadHostApplyPreview}
                  refreshWorkspaceRuntimeDetail={refreshWorkspaceRuntimeDetail}
                  focusWorkspaceLogs={focusWorkspaceLogs}
                  refreshSessionRuntimeDetail={refreshSessionRuntimeDetail}
                  focusSessionLogs={focusSessionLogs}
                  onOpenAppTraffic={focusAppLogs}
                  onEditWorkspace={editWorkspaceByIdAndFocus}
                  onActivateWorkspace={actions.runtime.activateWorkspace}
                  closeWorkspaceRuntimeDetail={actions.runtime.closeWorkspaceRuntimeDetail}
                  onEditSession={editSessionByIdAndFocus}
                  onActivateSession={actions.runtime.activateSession}
                  onArchiveSession={actions.runtime.archiveSession}
                  closeSessionRuntimeDetail={actions.runtime.closeSessionRuntimeDetail}
                  refreshAuditEvents={refreshAuditEvents}
                  onSyncServiceEnv={() =>
                    runAction(
                      async () => {
                        await syncSystemServiceEnv();
                      },
                      localize(locale, "服务环境文件已同步", "Service environment synchronized")
                    )
                  }
                  onInstallSystemService={() =>
                    runAction(
                      async () => {
                        await installSystemUserService();
                      },
                      localize(locale, "User service 已安装", "User service installed")
                    )
                  }
                  formatNumber={formatNumber}
                />
              </Suspense>
            </div>

            <div ref={trafficPanelsRef} className="panel-scroll-target">
              <Suspense
                fallback={
                  <AdvancedPanelFallback
                    locale={locale}
                    title={localize(locale, "流量与观测", "Traffic and Observability")}
                  />
                }
              >
                <LazyTrafficObservabilityPanels
                  snapshot={snapshot}
                  usageFilters={usageFilters}
                  setUsageFilters={setUsageFilters}
                  usageRecordPage={usageRecordPage}
                  usageSummary={usageSummary}
                  usageTimeseries={usageTimeseries}
                  refreshUsage={refreshUsage}
                  requestLogFilters={requestLogFilters}
                  setRequestLogFilters={setRequestLogFilters}
                  requestLogPage={requestLogPage}
                  refreshRequestLogs={refreshRequestLogs}
                  isWorking={isWorking}
                  formatNumber={formatNumber}
                  onEditProvider={editProviderByIdAndFocus}
                  onEditBinding={editBindingByAppCodeAndFocus}
                  onEditAppQuota={editAppQuotaByAppCodeAndFocus}
                  onEditFailover={editFailoverByAppCodeAndFocus}
                  onEditWorkspace={editWorkspaceByIdAndFocus}
                  onEditSession={editSessionByIdAndFocus}
                  onOpenProviderRuntime={refreshProviderDiagnosticDetail}
                  onOpenWorkspaceRuntime={(workspaceId) =>
                    syncWorkspaceEvidence(
                      workspaceId,
                      snapshot.runtimeContexts.workspaces.find((item) => item.workspaceId === workspaceId)?.appCode ?? null
                    )}
                  onOpenSessionRuntime={(sessionId) =>
                    syncSessionEvidence(
                      sessionId,
                      snapshot.runtimeContexts.sessions.find((item) => item.sessionId === sessionId)?.appCode ?? null
                    )}
                  onOpenRoutingForms={() => scrollToSection(routingFormsRef.current)}
                  onOpenAssetForms={() => scrollToSection(assetFormsRef.current)}
                  onOpenRecoveryPanel={() => scrollToSection(recoveryPanelRef.current)}
                  onOpenMcpForms={() => scrollToSection(mcpFormsRef.current)}
                  onOpenAuditEvents={(filters) => {
                    if (filters.appCode) {
                      syncAppEvidence(filters.appCode as AppBinding["appCode"], {
                        ...(filters.source
                          ? {
                              source: filters.source as
                                | "host-integration"
                                | "provider-health"
                                | "proxy-request"
                                | "mcp"
                                | "quota"
                            }
                          : {}),
                        ...(filters.providerId ? { providerId: filters.providerId } : {}),
                        ...(filters.level
                          ? { level: filters.level as "info" | "warn" | "error" }
                          : {})
                      });
                    } else {
                      openAuditFocus({
                        ...(filters.source
                          ? {
                              source: filters.source as
                                | "host-integration"
                                | "provider-health"
                                | "proxy-request"
                                | "mcp"
                                | "quota"
                            }
                          : {}),
                        ...(filters.providerId ? { providerId: filters.providerId } : {}),
                        ...(filters.level
                          ? { level: filters.level as "info" | "warn" | "error" }
                          : {})
                      });
                    }
                    scrollToSection(runtimePanelsRef.current);
                  }}
                />
              </Suspense>
            </div>

            <article className="panel panel-span-2">
              <h2>{t("dashboard.panels.actions")}</h2>
              <div className="quick-action-row">
                <button className="inline-action" type="button" onClick={() => scrollToSection(assetFormsRef.current)}>
                  {localize(locale, "资产 / 上下文", "Assets / Context")}
                </button>
                <button className="inline-action" type="button" onClick={() => scrollToSection(mcpFormsRef.current)}>
                  MCP
                </button>
                <button className="inline-action" type="button" onClick={() => scrollToSection(routingFormsRef.current)}>
                  {localize(locale, "路由 / 代理", "Routing / Proxy")}
                </button>
                <button className="inline-action" type="button" onClick={() => scrollToSection(recoveryPanelRef.current)}>
                  {localize(locale, "恢复 / 导入", "Recovery")}
                </button>
              </div>
              <div className="write-grid">
                <div className="panel-scroll-target" ref={assetFormsRef}>
                  <Suspense
                    fallback={
                      <AdvancedPanelFallback
                        locale={locale}
                        title={localize(locale, "资产与上下文编辑", "Assets and Context")}
                      />
                    }
                  >
                    <LazyAssetContextFormsPanel
                      providers={snapshot.providers}
                      promptTemplates={snapshot.promptTemplates}
                      skills={snapshot.skills}
                      workspaces={snapshot.workspaces}
                      sessionRecords={snapshot.sessionRecords}
                      workspaceForm={workspaceForm}
                      setWorkspaceForm={setWorkspaceForm}
                      workspaceTagsText={workspaceTagsText}
                      setWorkspaceTagsText={setWorkspaceTagsText}
                      canSaveWorkspace={canSaveWorkspace}
                      workspacePreview={workspacePreview}
                      onSaveWorkspace={actions.assets.saveWorkspace}
                      sessionForm={sessionForm}
                      setSessionForm={setSessionForm}
                      canSaveSession={canSaveSession}
                      sessionPreview={sessionPreview}
                      onSaveSession={actions.assets.saveSession}
                      promptTemplateForm={promptTemplateForm}
                      setPromptTemplateForm={setPromptTemplateForm}
                      promptTagsText={promptTagsText}
                      setPromptTagsText={setPromptTagsText}
                      canSavePromptTemplate={canSavePromptTemplate}
                      promptTemplatePreview={promptTemplatePreview}
                      promptTemplateVersions={promptTemplateVersions}
                      onSavePromptTemplate={actions.assets.savePromptTemplate}
                      onQuickSavePromptTemplate={actions.assets.savePromptTemplateItem}
                      onRepairGovernance={actions.assets.repairGovernance}
                      onRestorePromptTemplateVersion={actions.assets.restorePromptTemplateVersion}
                      onLoadPromptTemplateToEditor={loadPromptTemplateToEditor}
                      onInspectWorkspaceRuntime={(workspaceId) => {
                        const workspace = snapshot.workspaces.find((item) => item.id === workspaceId) ?? null;
                        syncWorkspaceEvidence(workspaceId, workspace?.appCode ?? null);
                        scrollToSection(runtimePanelsRef.current);
                      }}
                      onInspectSessionRuntime={(sessionId) => {
                        const session = snapshot.sessionRecords.find((item) => item.id === sessionId) ?? null;
                        syncSessionEvidence(sessionId, session?.appCode ?? null);
                        scrollToSection(runtimePanelsRef.current);
                      }}
                      onOpenWorkspaceBatchReview={(workspaceIds, sourceLabel, appCode) =>
                        openContextBatchFollowUp("workspace", workspaceIds, sourceLabel, appCode)
                      }
                      onOpenSessionBatchReview={(sessionIds, sourceLabel, appCode) =>
                        openContextBatchFollowUp("session", sessionIds, sourceLabel, appCode)
                      }
                      skillForm={skillForm}
                      setSkillForm={setSkillForm}
                      skillTagsText={skillTagsText}
                      setSkillTagsText={setSkillTagsText}
                      canSaveSkill={canSaveSkill}
                      skillPreview={skillPreview}
                      skillVersions={skillVersions}
                      onSaveSkill={actions.assets.saveSkill}
                      onQuickSaveSkill={actions.assets.saveSkillItem}
                      onRestoreSkillVersion={actions.assets.restoreSkillVersion}
                      onLoadSkillToEditor={loadSkillToEditor}
                      isWorking={isWorking}
                      formatNumber={formatNumber}
                    />
                  </Suspense>
                </div>

                <div className="panel-scroll-target" ref={mcpFormsRef}>
                  <Suspense
                    fallback={
                      <AdvancedPanelFallback
                        locale={locale}
                        title={localize(locale, "MCP 编辑", "MCP Forms")}
                      />
                    }
                  >
                    <LazyMcpFormsPanel
                      snapshot={snapshot}
                      mcpServers={snapshot.mcpServers}
                      mcpServerForm={mcpServerForm}
                      setMcpServerForm={setMcpServerForm}
                      mcpEnvText={mcpEnvText}
                      setMcpEnvText={setMcpEnvText}
                      mcpHeadersText={mcpHeadersText}
                      setMcpHeadersText={setMcpHeadersText}
                      editingMcpServerId={editingMcpServerId}
                      canSaveMcpServer={canSaveMcpServer}
                      mcpServerPreviewError={mcpServerPreviewError}
                      mcpServerPreview={mcpServerPreview}
                      onSaveMcpServer={actions.mcpForms.saveMcpServer}
                      onResetMcpServer={resetMcpServerEditor}
                      mcpBindingForm={mcpBindingForm}
                      setMcpBindingForm={setMcpBindingForm}
                      editingMcpBindingId={editingMcpBindingId}
                      canSaveMcpBinding={canSaveMcpBinding}
                      mcpBindingPreview={mcpBindingPreview}
                      onSaveMcpBinding={actions.mcpForms.saveMcpBinding}
                      onResetMcpBinding={resetMcpBindingEditor}
                      isWorking={isWorking}
                    />
                  </Suspense>
                </div>

                <div className="panel-scroll-target" ref={routingFormsRef}>
                  <Suspense
                    fallback={
                      <AdvancedPanelFallback
                        locale={locale}
                        title={localize(locale, "路由与代理编辑", "Routing and Proxy")}
                      />
                    }
                  >
                    <LazyRoutingPolicyFormsPanel
                      providers={snapshot.providers}
                      bindings={snapshot.bindings}
                      providerForm={providerForm}
                      setProviderForm={setProviderForm}
                      canSaveProvider={canSaveProvider}
                      providerPreview={providerPreview}
                      onSaveProvider={actions.routing.saveProvider}
                      bindingForm={bindingForm}
                      setBindingForm={setBindingForm}
                      canSaveBinding={canSaveBinding}
                      bindingPreview={bindingPreview}
                      onSaveBinding={actions.routing.saveBinding}
                      hasProviders={hasProviders}
                      appQuotaForm={appQuotaForm}
                      setAppQuotaForm={setAppQuotaForm}
                      canSaveAppQuota={canSaveAppQuota}
                      appQuotaPreview={appQuotaPreview}
                      onSaveAppQuota={actions.routing.saveAppQuota}
                      proxyForm={proxyForm}
                      setProxyForm={setProxyForm}
                      canSaveProxyPolicy={canSaveProxyPolicy}
                      proxyPolicyPreview={proxyPolicyPreview}
                      onSaveProxyPolicy={actions.routing.saveProxyPolicy}
                      failoverForm={failoverForm}
                      setFailoverForm={setFailoverForm}
                      canSaveFailover={canSaveFailover}
                      failoverPreview={failoverPreview}
                      onSaveFailover={actions.routing.saveFailover}
                      isWorking={isWorking}
                    />
                  </Suspense>
                </div>
              </div>
            </article>

            <div className="panel-scroll-target" ref={recoveryPanelRef}>
              <Suspense
                fallback={
                  <AdvancedPanelFallback
                    locale={locale}
                    title={localize(locale, "恢复与导入", "Recovery")}
                  />
                }
              >
                <LazyRecoveryPanel
                  exportText={exportText}
                  importText={importText}
                  importPreview={importPreview}
                  importPreviewIsCurrent={importPreviewIsCurrent}
                  restorePreview={restorePreview}
                  restorePreviewIsCurrent={restorePreviewIsCurrent}
                  selectedSnapshotVersion={selectedSnapshotVersion}
                  effectiveSnapshotDiff={effectiveSnapshotDiff}
                  latestSnapshotReason={latestSnapshotReason}
                  snapshotDiffItems={snapshotDiffItems}
                  recentSnapshots={snapshot.recentSnapshots}
                  isWorking={isWorking}
                  onImportTextChange={actions.recovery.onImportTextChange}
                  onExport={actions.recovery.exportConfig}
                  onPreviewImport={actions.recovery.previewImport}
                  onImport={actions.recovery.importConfig}
                  onRestore={actions.recovery.restoreSnapshot}
                  onInspectSnapshot={actions.recovery.inspectSnapshot}
                  onPrepareRestoreSnapshot={actions.recovery.prepareRestoreSnapshot}
                  onOpenAssetForms={() => scrollToSection(assetFormsRef.current)}
                  onOpenRoutingForms={() => scrollToSection(routingFormsRef.current)}
                  onOpenMcpForms={() => scrollToSection(mcpFormsRef.current)}
                  formatNumber={formatNumber}
                  formatDateTime={formatDateTime}
                  formatSnapshotDiffItems={formatSnapshotDiffItems}
                  renderSnapshotDiffBucketLabel={renderSnapshotDiffBucketLabel}
                  t={t}
                />
              </Suspense>
            </div>
          </section>
            </>
          ) : (
            <section className="panel panel-span-2 compact-mode-panel">
              <h2>{localize(locale, "高级面板已折叠", "Advanced Panels Hidden")}</h2>
              <p className="panel-lead">
                {localize(
                  locale,
                  "当前优先展示安装、接管与验证主流程。需要排障、审计、MCP、恢复或高级路由时，再展开下面的高级面板。",
                  "The install, takeover, and verification flow is prioritized right now. Expand advanced panels only when you need diagnostics, audit, MCP, recovery, or advanced routing."
                )}
              </p>
              <div className="quick-action-row">
                <button
                  className="inline-action"
                  type="button"
                  onMouseEnter={preloadAdvancedPanels}
                  onFocus={preloadAdvancedPanels}
                  onClick={openAdvancedPanels}
                >
                  {localize(locale, "展开高级面板", "Show Advanced Panels")}
                </button>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="panel">
          <h2>{t("dashboard.loadingTitle")}</h2>
          <p>{t("dashboard.loadingDescription")}</p>
        </section>
      )}
    </main>
  );
};
