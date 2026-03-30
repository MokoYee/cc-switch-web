import type { Dispatch, SetStateAction } from "react";

import type { ProxyRequestLogPage, UsageRecordPage, UsageSummary, UsageTimeseries } from "@cc-switch-web/shared";

import { MetricCard } from "./MetricCard.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";
import { ProgressiveList } from "../../../shared/components/ProgressiveList.js";
import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import {
  buildRequestPrimaryCause,
  renderRoutingPrimaryCauseLabel
} from "../lib/buildRoutingPrimaryCause.js";
import {
  buildTrafficTakeoverEntries,
  type TrafficTakeoverActionKind
} from "../lib/buildTrafficTakeoverEntries.js";
import { buildTrafficGovernanceNotices, type TrafficGovernanceAction } from "../lib/buildTrafficGovernanceNotices.js";

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

type RequestDecisionReason = Exclude<ProxyRequestLogPage["items"][number]["decisionReason"], null>;

const formatBucketLabel = (value: string): string =>
  value.replace("T", " ").replace(".000Z", "Z");

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const renderRequestDecisionReason = (
  locale: "zh-CN" | "en-US",
  reason: ProxyRequestLogPage["items"][number]["decisionReason"]
): string => {
  switch (reason) {
    case "policy-disabled":
      return localize(locale, "代理策略已关闭", "Proxy policy disabled");
    case "context-invalid":
      return localize(locale, "请求上下文无效", "Invalid request context");
    case "no-binding":
      return localize(locale, "缺少 Binding", "No binding configured");
    case "quota-rejected":
      return localize(locale, "配额拒绝", "Quota rejected");
    case "provider-disabled":
      return localize(locale, "Provider 已禁用", "Provider disabled");
    case "unsupported-provider-type":
      return localize(locale, "Provider 类型暂不支持", "Unsupported provider type");
    case "missing-credential":
      return localize(locale, "缺少凭证", "Missing credential");
    case "auth":
      return localize(locale, "鉴权失败", "Authentication failure");
    case "invalid-request":
      return localize(locale, "无效请求", "Invalid request");
    case "rate-limit":
      return localize(locale, "上游限流", "Upstream rate limit");
    case "upstream-unavailable":
      return localize(locale, "上游不可用", "Upstream unavailable");
    case "timeout":
      return localize(locale, "请求超时", "Request timeout");
    case "network":
      return localize(locale, "网络异常", "Network error");
    case "unknown":
      return localize(locale, "未知原因", "Unknown reason");
    case null:
      return localize(locale, "正常完成", "Completed normally");
  }
};

const pickTopValue = (items: readonly string[]): string | null => {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  return sorted[0]?.[0] ?? null;
};

const pickTopCount = <T extends string>(items: readonly T[]): { readonly value: T; readonly count: number } | null => {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  const target = sorted[0];
  return target ? { value: target[0], count: target[1] } : null;
};

const renderTakeoverActionLabel = (
  action: TrafficTakeoverActionKind,
  locale: "zh-CN" | "en-US"
): string => {
  switch (action) {
    case "open-traffic":
      return localize(locale, "查看请求结果", "Open Requests");
    case "open-runtime":
      return localize(locale, "打开运行态", "Open Runtime");
    case "edit-binding":
      return localize(locale, "补 Binding", "Fix Binding");
    case "edit-failover":
      return localize(locale, "查故障转移", "Review Failover");
    case "preview-host-takeover":
      return localize(locale, "打开接管预检", "Open Takeover Preview");
  }
};

type TrafficObservabilityPanelsProps = {
  readonly snapshot: DashboardSnapshot;
  readonly usageFilters: UsageFilters;
  readonly setUsageFilters: Dispatch<SetStateAction<UsageFilters>>;
  readonly usageRecordPage: UsageRecordPage | null;
  readonly usageSummary: UsageSummary | null;
  readonly usageTimeseries: UsageTimeseries | null;
  readonly refreshUsage: (filters?: UsageFilters) => void;
  readonly requestLogFilters: RequestLogFilters;
  readonly setRequestLogFilters: Dispatch<SetStateAction<RequestLogFilters>>;
  readonly requestLogPage: ProxyRequestLogPage | null;
  readonly refreshRequestLogs: (filters?: RequestLogFilters) => void;
  readonly isWorking: boolean;
  readonly formatNumber: (value: number) => string;
  readonly onEditProvider: (providerId: string) => void;
  readonly onEditBinding: (appCode: string) => void;
  readonly onEditAppQuota: (appCode: string) => void;
  readonly onEditFailover: (appCode: string) => void;
  readonly onEditWorkspace: (workspaceId: string) => void;
  readonly onEditSession: (sessionId: string) => void;
  readonly onOpenProviderRuntime: (providerId: string) => void;
  readonly onOpenWorkspaceRuntime: (workspaceId: string) => void;
  readonly onOpenSessionRuntime: (sessionId: string) => void;
  readonly onOpenRoutingForms: () => void;
  readonly onOpenAssetForms: () => void;
  readonly onOpenRecoveryPanel: () => void;
  readonly onOpenMcpForms: () => void;
  readonly onOpenAuditEvents: (filters: {
    readonly source?: string;
    readonly appCode?: string;
    readonly providerId?: string;
    readonly level?: string;
  }) => void;
};

export const TrafficObservabilityPanels = ({
  snapshot,
  usageFilters,
  setUsageFilters,
  usageRecordPage,
  usageSummary,
  usageTimeseries,
  refreshUsage,
  requestLogFilters,
  setRequestLogFilters,
  requestLogPage,
  refreshRequestLogs,
  isWorking,
  formatNumber,
  onEditProvider,
  onEditBinding,
  onEditAppQuota,
  onEditFailover,
  onEditWorkspace,
  onEditSession,
  onOpenProviderRuntime,
  onOpenWorkspaceRuntime,
  onOpenSessionRuntime,
  onOpenRoutingForms,
  onOpenAssetForms,
  onOpenRecoveryPanel,
  onOpenMcpForms,
  onOpenAuditEvents
}: TrafficObservabilityPanelsProps): JSX.Element => {
  const { t, locale } = useI18n();
  const visibleRequestLogs = requestLogPage?.items ?? snapshot.proxyRequestLogs;
  const visibleUsageRecords = usageRecordPage?.items ?? [];
  const actionableRequestLogs = visibleRequestLogs.filter(
    (item) => item.outcome === "error" || item.outcome === "failover" || item.outcome === "rejected"
  );
  const dominantFailureProviderId = pickTopValue(
    actionableRequestLogs
      .map((item) => item.providerId)
      .filter((item): item is string => item !== null)
  );
  const dominantFailureAppCode = pickTopValue(actionableRequestLogs.map((item) => item.appCode));
  const dominantQuotaRejectedAppCode = pickTopValue(
    actionableRequestLogs
      .filter((item) => item.decisionReason === "quota-rejected")
      .map((item) => item.appCode)
  );
  const dominantFailoverAppCode = pickTopValue(
    visibleRequestLogs
      .filter((item) => item.outcome === "failover")
      .map((item) => item.appCode)
  );
  const dominantRepairReason = pickTopCount(
    actionableRequestLogs
      .map((item) => item.decisionReason)
      .filter((item): item is RequestDecisionReason => item !== null)
  );
  const dominantWorkspaceId = pickTopValue(
    visibleRequestLogs
      .map((item) => item.workspaceId)
      .filter((item): item is string => item !== null)
  );

  const applyUsageFilter = (updates: Partial<UsageFilters>): void => {
    const nextFilters = {
      ...usageFilters,
      ...updates,
      offset: 0
    };
    setUsageFilters(nextFilters);
    refreshUsage(nextFilters);
  };

  const applyRequestLogFilter = (updates: Partial<RequestLogFilters>): void => {
    const nextFilters = {
      ...requestLogFilters,
      ...updates,
      offset: 0
    };
    setRequestLogFilters(nextFilters);
    refreshRequestLogs(nextFilters);
  };

  const trafficGovernanceNotices = buildTrafficGovernanceNotices({
    locale,
    snapshot,
    requestLogs: visibleRequestLogs,
    usageRecords: visibleUsageRecords
  });
  const trafficPrimaryCause = buildRequestPrimaryCause(actionableRequestLogs, locale);
  const takeoverEntries = buildTrafficTakeoverEntries(snapshot, locale).filter(
    (item) => item.level !== "low" || item.verificationState !== "managed-verified"
  );

  const trafficRepairPath = (() => {
    if (trafficPrimaryCause === null) {
      return null;
    }

    if (trafficPrimaryCause.code === "auth-credentials") {
      return {
        summary: trafficPrimaryCause.summary,
        actions: [
          ...(dominantFailureProviderId
            ? [
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-auth-runtime"
                  disabled={isWorking}
                  onClick={() => onOpenProviderRuntime(dominantFailureProviderId)}
                >
                  {localize(locale, "1. 打开运行时", "1. Open Runtime")}
                </button>,
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-auth-provider"
                  disabled={isWorking}
                  onClick={() => onEditProvider(dominantFailureProviderId)}
                >
                  {localize(locale, "2. 修 Provider", "2. Fix Provider")}
                </button>
              ]
            : []),
          ...(dominantFailureAppCode
            ? [
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-auth-binding"
                  disabled={isWorking}
                  onClick={() => onEditBinding(dominantFailureAppCode)}
                >
                  {localize(locale, "3. 看 Binding", "3. Review Binding")}
                </button>
              ]
            : []),
          <button
            className="inline-action"
            type="button"
            key="traffic-repair-auth-audit"
            disabled={isWorking}
            onClick={() =>
              onOpenAuditEvents({
                source: "proxy-request",
                ...(dominantFailureProviderId ? { providerId: dominantFailureProviderId } : {}),
                ...(dominantFailureAppCode ? { appCode: dominantFailureAppCode } : {}),
                level: "error"
              })
            }
          >
            {localize(locale, "4. 回看审计", "4. Review Audit")}
          </button>
        ]
      };
    }

    if (trafficPrimaryCause.code === "quota-policy") {
      return {
        summary: trafficPrimaryCause.summary,
        actions: [
          ...(dominantQuotaRejectedAppCode
            ? [
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-quota"
                  disabled={isWorking}
                  onClick={() => onEditAppQuota(dominantQuotaRejectedAppCode)}
                >
                  {localize(locale, "1. 调整配额", "1. Adjust Quota")}
                </button>,
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-quota-binding"
                  disabled={isWorking}
                  onClick={() => onEditBinding(dominantQuotaRejectedAppCode)}
                >
                  {localize(locale, "2. 看 Binding", "2. Review Binding")}
                </button>
              ]
            : []),
          <button
            className="inline-action"
            type="button"
            key="traffic-repair-quota-audit"
            disabled={isWorking}
            onClick={() =>
              onOpenAuditEvents({
                source: "quota",
                ...(dominantQuotaRejectedAppCode ? { appCode: dominantQuotaRejectedAppCode } : {}),
                level: "error"
              })
            }
          >
            {localize(locale, "3. 看配额审计", "3. Open Quota Audit")}
          </button>
        ]
      };
    }

    if (trafficPrimaryCause.code === "upstream-availability") {
      return {
        summary: trafficPrimaryCause.summary,
        actions: [
          ...(dominantFailureProviderId
            ? [
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-upstream-runtime"
                  disabled={isWorking}
                  onClick={() => onOpenProviderRuntime(dominantFailureProviderId)}
                >
                  {localize(locale, "1. 打开运行时", "1. Open Runtime")}
                </button>,
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-upstream-provider"
                  disabled={isWorking}
                  onClick={() => onEditProvider(dominantFailureProviderId)}
                >
                  {localize(locale, "2. 查 Provider", "2. Review Provider")}
                </button>
              ]
            : []),
          ...(dominantFailoverAppCode
            ? [
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-upstream-failover"
                  disabled={isWorking}
                  onClick={() => onEditFailover(dominantFailoverAppCode)}
                >
                  {localize(locale, "3. 查故障转移", "3. Review Failover")}
                </button>
              ]
            : []),
          <button
            className="inline-action"
            type="button"
            key="traffic-repair-upstream-recovery"
            disabled={isWorking}
            onClick={onOpenRecoveryPanel}
          >
            {localize(locale, "4. 打开恢复面板", "4. Open Recovery")}
          </button>
        ]
      };
    }

    if (trafficPrimaryCause.code === "binding-contract") {
      return {
        summary: trafficPrimaryCause.summary,
        actions: [
          ...(dominantFailureAppCode
            ? [
                <button
                  className="inline-action"
                  type="button"
                  key="traffic-repair-binding"
                  disabled={isWorking}
                  onClick={() => onEditBinding(dominantFailureAppCode)}
                >
                  {localize(locale, "1. 补 Binding", "1. Fix Binding")}
                </button>
              ]
            : []),
          <button
            className="inline-action"
            type="button"
            key="traffic-repair-routing"
            disabled={isWorking}
            onClick={onOpenRoutingForms}
          >
            {localize(locale, "2. 看路由", "2. Review Routing")}
          </button>
        ]
      };
    }

    return {
      summary: trafficPrimaryCause.summary,
      actions: [
        <button
          className="inline-action"
          type="button"
          key="traffic-repair-generic-routing"
          disabled={isWorking}
          onClick={onOpenRoutingForms}
        >
          {localize(locale, "1. 看路由", "1. Review Routing")}
        </button>,
        <button
          className="inline-action"
          type="button"
          key="traffic-repair-generic-runtime"
          disabled={isWorking}
          onClick={onOpenRecoveryPanel}
        >
          {localize(locale, "2. 看恢复", "2. Review Recovery")}
        </button>
      ]
    };
  })();

  const runTrafficAction = (action: TrafficGovernanceAction): void => {
    if (action.kind === "request-filter") {
      applyRequestLogFilter(action.filters);
      return;
    }
    if (action.kind === "usage-filter") {
      applyUsageFilter(action.filters);
      return;
    }
    if (action.kind === "edit-provider") {
      onEditProvider(action.providerId);
      return;
    }
    if (action.kind === "edit-binding") {
      onEditBinding(action.appCode);
      return;
    }
    if (action.kind === "edit-app-quota") {
      onEditAppQuota(action.appCode);
      return;
    }
    if (action.kind === "edit-failover") {
      onEditFailover(action.appCode);
      return;
    }
    if (action.kind === "edit-workspace") {
      onEditWorkspace(action.workspaceId);
      return;
    }
    if (action.kind === "edit-session") {
      onEditSession(action.sessionId);
      return;
    }
    if (action.kind === "open-provider-runtime") {
      onOpenProviderRuntime(action.providerId);
      return;
    }
    if (action.kind === "open-workspace-runtime") {
      onOpenWorkspaceRuntime(action.workspaceId);
      return;
    }
    if (action.kind === "open-session-runtime") {
      onOpenSessionRuntime(action.sessionId);
      return;
    }
    if (action.kind === "open-routing") {
      onOpenRoutingForms();
      return;
    }
    if (action.kind === "open-assets") {
      onOpenAssetForms();
      return;
    }
    if (action.kind === "open-recovery") {
      onOpenRecoveryPanel();
      return;
    }
    if (action.kind === "open-mcp") {
      onOpenMcpForms();
      return;
    }
    onOpenAuditEvents(action.filters);
  };

  const runTakeoverAction = (
    appCode: DashboardSnapshot["discoveries"][number]["appCode"],
    action: TrafficTakeoverActionKind
  ): void => {
    if (action === "open-runtime") {
      const providerId =
        snapshot.providerDiagnostics.find((item) => item.bindingAppCodes.includes(appCode))?.providerId ??
        snapshot.providerDiagnostics.find((item) => item.failoverAppCodes.includes(appCode))?.providerId ??
        null;
      if (providerId !== null) {
        onOpenProviderRuntime(providerId);
      }
      return;
    }

    if (action === "edit-binding") {
      onEditBinding(appCode);
      return;
    }

    if (action === "edit-failover") {
      onEditFailover(appCode);
      return;
    }

    onEditBinding(appCode);
    applyRequestLogFilter({ appCode });
  };

  const usageFilterSummary = [
    usageFilters.appCode ? `${localize(locale, "应用", "App")}: ${usageFilters.appCode}` : null,
    usageFilters.providerId ? `${localize(locale, "供应商", "Provider")}: ${usageFilters.providerId}` : null,
    usageFilters.model ? `${localize(locale, "模型", "Model")}: ${usageFilters.model}` : null,
    usageFilters.startAt ? `${localize(locale, "开始", "Start")}: ${usageFilters.startAt}` : null,
    usageFilters.endAt ? `${localize(locale, "结束", "End")}: ${usageFilters.endAt}` : null
  ].filter((item): item is string => item !== null);

  const requestLogFilterSummary = [
    requestLogFilters.appCode ? `${localize(locale, "应用", "App")}: ${requestLogFilters.appCode}` : null,
    requestLogFilters.providerId ? `${localize(locale, "供应商", "Provider")}: ${requestLogFilters.providerId}` : null,
    requestLogFilters.workspaceId ? `${localize(locale, "工作区", "Workspace")}: ${requestLogFilters.workspaceId}` : null,
    requestLogFilters.sessionId ? `${localize(locale, "会话", "Session")}: ${requestLogFilters.sessionId}` : null,
    requestLogFilters.outcome ? `${localize(locale, "结果", "Outcome")}: ${requestLogFilters.outcome}` : null,
    requestLogFilters.method ? `${localize(locale, "方法", "Method")}: ${requestLogFilters.method}` : null
  ].filter((item): item is string => item !== null);

  return (
    <>
      <article className="panel panel-span-2" data-testid="usage-panel">
        <h2>{t("dashboard.panels.usage")}</h2>
        {(dominantFailureProviderId || dominantFailureAppCode || dominantQuotaRejectedAppCode || dominantFailoverAppCode || dominantWorkspaceId) ? (
          <div className="quick-action-row">
            {dominantFailureProviderId ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => onOpenProviderRuntime(dominantFailureProviderId)}
              >
                {locale === "zh-CN"
                  ? `打开热点 Provider ${dominantFailureProviderId}`
                  : `Open Hot Provider ${dominantFailureProviderId}`}
              </button>
            ) : null}
            {dominantFailureAppCode ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => onEditBinding(dominantFailureAppCode)}
              >
                {locale === "zh-CN"
                  ? `检查应用 ${dominantFailureAppCode} Binding`
                  : `Check ${dominantFailureAppCode} Binding`}
              </button>
            ) : null}
            {dominantQuotaRejectedAppCode ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => onEditAppQuota(dominantQuotaRejectedAppCode)}
              >
                {locale === "zh-CN"
                  ? `调整 ${dominantQuotaRejectedAppCode} 配额`
                  : `Adjust ${dominantQuotaRejectedAppCode} Quota`}
              </button>
            ) : null}
            {dominantFailoverAppCode ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => onEditFailover(dominantFailoverAppCode)}
              >
                {locale === "zh-CN"
                  ? `检查 ${dominantFailoverAppCode} 故障转移`
                  : `Check ${dominantFailoverAppCode} Failover`}
              </button>
            ) : null}
            {dominantWorkspaceId ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => onOpenWorkspaceRuntime(dominantWorkspaceId)}
              >
                {locale === "zh-CN"
                  ? `打开工作区 ${dominantWorkspaceId}`
                  : `Open Workspace ${dominantWorkspaceId}`}
              </button>
            ) : null}
          </div>
        ) : null}
        {trafficRepairPath ? (
          <div className="governance-notice governance-medium">
            <div className="governance-notice-header">
              <strong>{localize(locale, "当前主修复路径", "Current Repair Path")}</strong>
              <span className="governance-notice-badge">
                {renderRoutingPrimaryCauseLabel(trafficPrimaryCause, locale)}
              </span>
            </div>
            <ul className="governance-suggestion-list">
              <li>{trafficRepairPath.summary}</li>
            </ul>
            <div className="quick-action-row">{trafficRepairPath.actions}</div>
          </div>
        ) : null}
        {takeoverEntries.length > 0 ? (
          <div className="note-block">
            <strong>{localize(locale, "接管闭环验证", "Takeover Verification Loop")}</strong>
            <div className="traffic-governance-stack">
              {takeoverEntries.slice(0, 4).map((entry) => (
                <div
                  className={`governance-notice governance-${entry.level}`}
                  key={`traffic-takeover-${entry.appCode}`}
                >
                  <div className="governance-notice-header">
                    <strong>{entry.appCode}</strong>
                    <span className="governance-notice-badge">
                      {entry.verificationState === "managed-verified"
                        ? localize(locale, "已验证", "Verified")
                        : entry.verificationState === "managed-failing"
                          ? localize(locale, "验证失败", "Verification Failed")
                          : entry.verificationState === "managed-no-traffic"
                            ? localize(locale, "待流量验证", "Needs Traffic")
                            : localize(locale, "未接管", "Not Managed")}
                    </span>
                  </div>
                  <ul className="governance-suggestion-list">
                    <li>{entry.summary}</li>
                    <li>
                      {localize(locale, "请求验证", "Request Validation")}: {entry.successLikeCount}/{entry.requestCount}
                      {entry.failureLikeCount > 0
                        ? ` / ${localize(locale, "失败", "Failures")} ${entry.failureLikeCount}`
                        : ""}
                    </li>
                    {entry.recentEventSummary ? (
                      <li>
                        {localize(locale, "最近接管事件", "Recent Takeover Event")}: {entry.recentEventSummary}
                      </li>
                    ) : null}
                  </ul>
                  <div className="quick-action-row">
                    {entry.recommendedActions
                      .filter((action) => action !== "preview-host-takeover")
                      .slice(0, 3)
                      .map((action) => (
                      <button
                        className="inline-action"
                        type="button"
                        key={`traffic-takeover-action-${entry.appCode}-${action}`}
                        disabled={isWorking}
                        onClick={() => runTakeoverAction(entry.appCode, action)}
                      >
                        {renderTakeoverActionLabel(action, locale)}
                      </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {trafficGovernanceNotices.length > 0 ? (
          <div className="traffic-governance-stack">
            {trafficGovernanceNotices.map((notice) => (
              <div key={notice.id}>
                <GovernanceNoticeCard notice={notice} locale={locale} />
                {notice.actions.length > 0 ? (
                  <div className="quick-action-row">
                    {notice.actions.map((action) => (
                      <button
                        className="inline-action"
                        type="button"
                        key={`${notice.id}-${action.id}`}
                        disabled={isWorking}
                        onClick={() => runTrafficAction(action)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="request-log-toolbar" data-testid="usage-filter-toolbar">
          <select
            data-testid="usage-filter-app"
            value={usageFilters.appCode}
            onChange={(event) =>
              setUsageFilters((current) => ({
                ...current,
                appCode: event.target.value,
                offset: 0
              }))
            }
          >
            <option value="">{t("dashboard.usage.filterApp")}</option>
            <option value="codex">codex</option>
            <option value="claude-code">claude-code</option>
            <option value="gemini-cli">gemini-cli</option>
            <option value="opencode">opencode</option>
            <option value="openclaw">openclaw</option>
          </select>
          <input
            data-testid="usage-filter-provider"
            value={usageFilters.providerId}
            onChange={(event) =>
              setUsageFilters((current) => ({
                ...current,
                providerId: event.target.value,
                offset: 0
              }))
            }
            placeholder={t("dashboard.usage.filterProvider")}
          />
          <input
            data-testid="usage-filter-model"
            value={usageFilters.model}
            onChange={(event) =>
              setUsageFilters((current) => ({
                ...current,
                model: event.target.value,
                offset: 0
              }))
            }
            placeholder={t("dashboard.usage.filterModel")}
          />
          <input
            data-testid="usage-filter-start-at"
            type="datetime-local"
            aria-label={t("dashboard.usage.filterStartAt")}
            value={usageFilters.startAt}
            onChange={(event) =>
              setUsageFilters((current) => ({
                ...current,
                startAt: event.target.value,
                offset: 0
              }))
            }
          />
          <input
            data-testid="usage-filter-end-at"
            type="datetime-local"
            aria-label={t("dashboard.usage.filterEndAt")}
            value={usageFilters.endAt}
            onChange={(event) =>
              setUsageFilters((current) => ({
                ...current,
                endAt: event.target.value,
                offset: 0
              }))
            }
          />
          <select
            data-testid="usage-filter-bucket"
            value={usageFilters.bucket}
            onChange={(event) =>
              setUsageFilters((current) => ({
                ...current,
                bucket: event.target.value as "hour" | "day",
                offset: 0
              }))
            }
          >
            <option value="day">{t("dashboard.usage.bucket.day")}</option>
            <option value="hour">{t("dashboard.usage.bucket.hour")}</option>
          </select>
          <select
            data-testid="usage-filter-limit"
            value={usageFilters.limit}
            onChange={(event) =>
              setUsageFilters((current) => ({
                ...current,
                limit: Number(event.target.value),
                offset: 0
              }))
            }
          >
            <option value={10}>{t("dashboard.usage.filterLimit")}: 10</option>
            <option value={20}>{t("dashboard.usage.filterLimit")}: 20</option>
            <option value={50}>{t("dashboard.usage.filterLimit")}: 50</option>
          </select>
          <button
            className="inline-action"
            data-testid="usage-refresh-button"
            type="button"
            disabled={isWorking}
            onClick={() => refreshUsage()}
          >
            {t("common.refresh")}
          </button>
          <button
            className="inline-action"
            data-testid="usage-clear-button"
            type="button"
            disabled={isWorking}
            onClick={() => {
              const nextFilters: UsageFilters = {
                appCode: "",
                providerId: "",
                model: "",
                startAt: "",
                endAt: "",
                bucket: "day",
                limit: 20,
                offset: 0
              };
              setUsageFilters(nextFilters);
              refreshUsage(nextFilters);
            }}
          >
            {t("dashboard.usage.clear")}
          </button>
        </div>
        {usageFilterSummary.length > 0 ? (
          <div className="quick-action-row" data-testid="usage-filter-summary">
            {usageFilterSummary.map((item) => (
              <span className="filter-summary-chip" key={`usage-filter-${item}`}>
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="panel-supporting-copy">
            {localize(locale, "当前展示全量用量视图，可从分布项或记录行直接带入筛选。", "Showing the full usage view. Apply filters directly from breakdown items or records.")}
          </p>
        )}
        <div className="metrics-grid usage-summary-grid">
          <div data-testid="usage-summary-total-requests">
            <MetricCard
              label={t("dashboard.usage.totalRequests")}
              value={formatNumber(usageSummary?.totalRequests ?? 0)}
              hint={t("dashboard.panels.usage")}
            />
          </div>
          <div data-testid="usage-summary-total-tokens">
            <MetricCard
              label={t("dashboard.usage.totalTokens")}
              value={formatNumber(usageSummary?.totalTokens ?? 0)}
              hint={t("dashboard.metrics.usageHint")}
            />
          </div>
          <div data-testid="usage-summary-input-tokens">
            <MetricCard
              label={t("dashboard.usage.inputTokens")}
              value={formatNumber(usageSummary?.totalInputTokens ?? 0)}
              hint={t("dashboard.panels.usage")}
            />
          </div>
          <div data-testid="usage-summary-output-tokens">
            <MetricCard
              label={t("dashboard.usage.outputTokens")}
              value={formatNumber(usageSummary?.totalOutputTokens ?? 0)}
              hint={t("dashboard.panels.usage")}
            />
          </div>
        </div>
        <div className="usage-breakdown-grid">
          <div className="list" data-testid="usage-timeseries">
            <strong>{t("dashboard.usage.timeseries")}</strong>
            <div className="usage-trend-list">
              {(usageTimeseries?.points ?? []).length === 0 ? (
                <div className="list-row">
                  <div>
                    <strong>{t("dashboard.usage.timeseries")}</strong>
                    <p>{t("dashboard.usage.empty")}</p>
                  </div>
                </div>
              ) : (
                usageTimeseries?.points.map((point) => {
                  const maxTokens = Math.max(...usageTimeseries.points.map((item) => item.totalTokens), 1);
                  const widthPercent = Math.max(6, Math.round((point.totalTokens / maxTokens) * 100));

                  return (
                    <div className="usage-trend-row" key={point.bucketStart}>
                      <div className="usage-trend-meta">
                        <strong>{formatBucketLabel(point.bucketStart)}</strong>
                        <span>
                          {t("dashboard.usage.totalTokens")}: {formatNumber(point.totalTokens)} /{" "}
                          {t("dashboard.usage.totalRequests")}: {formatNumber(point.requestCount)}
                        </span>
                      </div>
                      <div className="usage-trend-bar-shell">
                        <div className="usage-trend-bar" style={{ width: `${widthPercent}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="list" data-testid="usage-breakdown-by-app">
            <strong>{t("dashboard.usage.breakdownByApp")}</strong>
            {(usageSummary?.byApp ?? []).slice(0, 5).map((item) => (
              <div className="list-row" data-testid={`usage-breakdown-app-${item.appCode}`} key={`usage-app-${item.appCode}`}>
                <div>
                  <strong>{item.appCode}</strong>
                  <p>{t("dashboard.usage.totalRequests")}: {formatNumber(item.requestCount)}</p>
                </div>
                <div className="row-meta">
                  <span>{t("dashboard.usage.totalTokens")}</span>
                  <code>{formatNumber(item.totalTokens)}</code>
                  <button
                    className="inline-action"
                    data-testid={`usage-breakdown-app-filter-${item.appCode}`}
                    type="button"
                    disabled={isWorking}
                    onClick={() => applyUsageFilter({ appCode: item.appCode })}
                  >
                    {localize(locale, "筛选应用", "Filter App")}
                  </button>
                  <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyRequestLogFilter({ appCode: item.appCode })}>
                    {localize(locale, "查请求日志", "Open Logs")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="list" data-testid="usage-breakdown-by-provider">
            <strong>{t("dashboard.usage.breakdownByProvider")}</strong>
            {(usageSummary?.byProvider ?? []).slice(0, 5).map((item, index) => (
              <div
                className="list-row"
                data-testid={`usage-breakdown-provider-${item.providerId ?? "unknown"}`}
                key={`usage-provider-${item.providerId ?? index}`}
              >
                <div>
                  <strong>{item.providerId ?? t("common.notFound")}</strong>
                  <p>{t("dashboard.usage.totalRequests")}: {formatNumber(item.requestCount)}</p>
                </div>
                <div className="row-meta">
                  <span>{t("dashboard.usage.totalTokens")}</span>
                  <code>{formatNumber(item.totalTokens)}</code>
                  {item.providerId ? (
                    <button
                      className="inline-action"
                      data-testid={`usage-breakdown-provider-filter-${item.providerId}`}
                      type="button"
                      disabled={isWorking}
                      onClick={() => applyUsageFilter({ providerId: item.providerId as string })}
                    >
                      {localize(locale, "筛选供应商", "Filter Provider")}
                    </button>
                  ) : null}
                  {item.providerId ? (
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyRequestLogFilter({ providerId: item.providerId as string })}>
                      {localize(locale, "查请求日志", "Open Logs")}
                    </button>
                  ) : null}
                  {item.providerId ? (
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditProvider(item.providerId as string)}>
                      Edit Provider
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="list" data-testid="usage-breakdown-by-model">
            <strong>{t("dashboard.usage.breakdownByModel")}</strong>
            {(usageSummary?.byModel ?? []).slice(0, 5).map((item) => (
              <div className="list-row" data-testid={`usage-breakdown-model-${item.model}`} key={`usage-model-${item.model}`}>
                <div>
                  <strong>{item.model}</strong>
                  <p>{t("dashboard.usage.totalRequests")}: {formatNumber(item.requestCount)}</p>
                </div>
                <div className="row-meta">
                  <span>{t("dashboard.usage.totalTokens")}</span>
                  <code>{formatNumber(item.totalTokens)}</code>
                  <button
                    className="inline-action"
                    data-testid={`usage-breakdown-model-filter-${item.model}`}
                    type="button"
                    disabled={isWorking}
                    onClick={() => applyUsageFilter({ model: item.model })}
                  >
                    {localize(locale, "筛选模型", "Filter Model")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="request-log-meta">
          <span>
            {t("dashboard.usage.totalRequests")}: {usageRecordPage?.total ?? snapshot.proxyRuntime.usageRecordCount}
          </span>
        </div>
        <div className="list" data-testid="usage-records-list">
          {visibleUsageRecords.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.usage")}</strong>
                <p>{t("dashboard.usage.empty")}</p>
              </div>
            </div>
          ) : (
            <ProgressiveList
              items={visibleUsageRecords}
              locale={locale}
              initialVisibleCount={12}
              step={12}
              totalCount={usageRecordPage?.total ?? snapshot.proxyRuntime.usageRecordCount}
              renderItem={(record) => (
                <div className="list-row" data-testid={`usage-record-${record.id}`} key={record.id}>
                  <div>
                    <strong>{record.model}</strong>
                    <p>{record.appCode} / {record.providerId ?? t("common.notFound")}</p>
                    <p>{record.createdAt}</p>
                  </div>
                  <div className="row-meta">
                    <span>
                      {t("dashboard.usage.inputTokens")}: {formatNumber(record.inputTokens)} /{" "}
                      {t("dashboard.usage.outputTokens")}: {formatNumber(record.outputTokens)}
                    </span>
                    <code>{formatNumber(record.totalTokens)}</code>
                    <button
                      className="inline-action"
                      data-testid={`usage-record-focus-${record.id}`}
                      type="button"
                      disabled={isWorking}
                      onClick={() => applyUsageFilter({
                        appCode: record.appCode,
                        providerId: record.providerId ?? "",
                        model: record.model
                      })}
                    >
                      {localize(locale, "聚焦用量", "Focus Usage")}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyRequestLogFilter({
                      appCode: record.appCode,
                      providerId: record.providerId ?? ""
                    })}>
                      {localize(locale, "关联日志", "Related Logs")}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditBinding(record.appCode)}>
                      Edit Binding
                    </button>
                    {record.providerId ? (
                      <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditProvider(record.providerId as string)}>
                        Edit Provider
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            />
          )}
        </div>
        {usageRecordPage !== null ? (
          <div className="request-log-pagination">
            <button
              className="inline-action"
              type="button"
              disabled={usageFilters.offset === 0}
              onClick={() => {
                const nextFilters = {
                  ...usageFilters,
                  offset: Math.max(0, usageFilters.offset - usageFilters.limit)
                };
                setUsageFilters(nextFilters);
                refreshUsage(nextFilters);
              }}
            >
              {t("dashboard.usage.previous")}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={usageFilters.offset + usageFilters.limit >= (usageRecordPage?.total ?? 0)}
              onClick={() => {
                const nextFilters = {
                  ...usageFilters,
                  offset: usageFilters.offset + usageFilters.limit
                };
                setUsageFilters(nextFilters);
                refreshUsage(nextFilters);
              }}
            >
              {t("dashboard.usage.next")}
            </button>
          </div>
        ) : null}
      </article>

      <article className="panel panel-span-2">
        <h2>{t("dashboard.panels.requestLogs")}</h2>
        <div className="request-log-toolbar">
          <select
            data-testid="request-log-filter-app"
            value={requestLogFilters.appCode}
            onChange={(event) =>
              setRequestLogFilters((current) => ({
                ...current,
                appCode: event.target.value,
                offset: 0
              }))
            }
          >
            <option value="">{t("dashboard.requestLogs.filterApp")}</option>
            <option value="codex">codex</option>
            <option value="claude-code">claude-code</option>
            <option value="gemini-cli">gemini-cli</option>
            <option value="opencode">opencode</option>
            <option value="openclaw">openclaw</option>
          </select>
          <input
            value={requestLogFilters.providerId}
            onChange={(event) =>
              setRequestLogFilters((current) => ({
                ...current,
                providerId: event.target.value,
                offset: 0
              }))
            }
            placeholder={t("dashboard.requestLogs.filterProvider")}
          />
          <input
            value={requestLogFilters.workspaceId}
            onChange={(event) =>
              setRequestLogFilters((current) => ({
                ...current,
                workspaceId: event.target.value,
                offset: 0
              }))
            }
            placeholder={t("dashboard.requestLogs.filterWorkspace")}
          />
          <input
            value={requestLogFilters.sessionId}
            onChange={(event) =>
              setRequestLogFilters((current) => ({
                ...current,
                sessionId: event.target.value,
                offset: 0
              }))
            }
            placeholder={t("dashboard.requestLogs.filterSession")}
          />
          <select
            value={requestLogFilters.outcome}
            onChange={(event) =>
              setRequestLogFilters((current) => ({
                ...current,
                outcome: event.target.value,
                offset: 0
              }))
            }
          >
            <option value="">{t("dashboard.requestLogs.filterOutcome")}</option>
            <option value="success">success</option>
            <option value="error">error</option>
            <option value="rejected">rejected</option>
            <option value="failover">failover</option>
          </select>
          <input
            value={requestLogFilters.method}
            onChange={(event) =>
              setRequestLogFilters((current) => ({
                ...current,
                method: event.target.value.toUpperCase(),
                offset: 0
              }))
            }
            placeholder={t("dashboard.requestLogs.filterMethod")}
          />
          <select
            value={requestLogFilters.limit}
            onChange={(event) =>
              setRequestLogFilters((current) => ({
                ...current,
                limit: Number(event.target.value),
                offset: 0
              }))
            }
          >
            <option value={10}>{t("dashboard.requestLogs.filterLimit")}: 10</option>
            <option value={20}>{t("dashboard.requestLogs.filterLimit")}: 20</option>
            <option value={50}>{t("dashboard.requestLogs.filterLimit")}: 50</option>
          </select>
          <button className="inline-action" type="button" disabled={isWorking} onClick={() => refreshRequestLogs()}>
            {t("common.refresh")}
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => {
              const nextFilters: RequestLogFilters = {
                appCode: "",
                providerId: "",
                workspaceId: "",
                sessionId: "",
                outcome: "",
                method: "",
                limit: 20,
                offset: 0
              };
              setRequestLogFilters(nextFilters);
              refreshRequestLogs(nextFilters);
            }}
          >
            {t("dashboard.requestLogs.clear")}
          </button>
        </div>
        {requestLogFilterSummary.length > 0 ? (
          <div className="quick-action-row">
            {requestLogFilterSummary.map((item) => (
              <span className="filter-summary-chip" key={`request-filter-${item}`}>
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="panel-supporting-copy">
            {localize(locale, "当前展示全量请求日志，可从行项目直接收窄到应用、供应商、工作区或会话。", "Showing the full request log view. Narrow it directly from rows by app, provider, workspace, or session.")}
          </p>
        )}
        <div className="request-log-meta">
          <span>
            {t("dashboard.requestLogs.total")}: {requestLogPage?.total ?? snapshot.proxyRuntime.requestLogCount}
          </span>
        </div>
        <div className="list">
          {visibleRequestLogs.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>
                  {requestLogPage !== null && requestLogPage.total === 0
                    ? t("dashboard.requestLogs.emptyFiltered")
                    : t("dashboard.runtime.noProxyTraffic")}
                </strong>
                <p>
                  {requestLogPage !== null && requestLogPage.total === 0
                    ? t("dashboard.requestLogs.emptyFiltered")
                    : t("dashboard.runtime.noProxyTrafficHint")}
                </p>
              </div>
            </div>
          ) : (
            <ProgressiveList
              items={visibleRequestLogs}
              locale={locale}
              initialVisibleCount={15}
              step={15}
              totalCount={requestLogPage?.total ?? snapshot.proxyRuntime.requestLogCount}
              renderItem={(log) => (
                <div className="list-row" key={log.id}>
                  <div>
                    <strong>{log.method} {log.appCode}</strong>
                    <p>{log.path}</p>
                    <p>
                      {log.workspaceId ?? "no-workspace"} / {log.sessionId ?? "no-session"} /{" "}
                      {log.contextSource ?? "none"}
                    </p>
                    <p>
                      {localize(locale, "决策", "Decision")}: {renderRequestDecisionReason(locale, log.decisionReason)}
                      {log.nextProviderId ? ` -> ${log.nextProviderId}` : ""}
                    </p>
                    <p>{log.createdAt}</p>
                  </div>
                  <div className="row-meta">
                    <span>
                      {log.outcome} / {log.statusCode ?? "n/a"} / {log.latencyMs}ms
                    </span>
                    <code>{log.providerId ?? "unbound"}</code>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyRequestLogFilter({
                      appCode: log.appCode,
                      providerId: log.providerId ?? "",
                      workspaceId: log.workspaceId ?? "",
                      sessionId: log.sessionId ?? ""
                    })}>
                      {localize(locale, "聚焦此流量", "Focus Traffic")}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyUsageFilter({
                      appCode: log.appCode,
                      providerId: log.providerId ?? ""
                    })}>
                      {localize(locale, "查看用量", "View Usage")}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditBinding(log.appCode)}>
                      Edit Binding
                    </button>
                    {log.providerId ? (
                      <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditProvider(log.providerId as string)}>
                        Edit Provider
                      </button>
                    ) : null}
                    {log.workspaceId ? (
                      <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditWorkspace(log.workspaceId as string)}>
                        Edit Workspace
                      </button>
                    ) : null}
                    {log.sessionId ? (
                      <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditSession(log.sessionId as string)}>
                        Edit Session
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            />
          )}
        </div>
        {requestLogPage !== null ? (
          <div className="request-log-pagination">
            <button
              className="inline-action"
              type="button"
              disabled={requestLogFilters.offset === 0}
              onClick={() => {
                const nextFilters = {
                  ...requestLogFilters,
                  offset: Math.max(0, requestLogFilters.offset - requestLogFilters.limit)
                };
                setRequestLogFilters(nextFilters);
                refreshRequestLogs(nextFilters);
              }}
            >
              {t("dashboard.requestLogs.previous")}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={requestLogFilters.offset + requestLogFilters.limit >= requestLogPage.total}
              onClick={() => {
                const nextFilters = {
                  ...requestLogFilters,
                  offset: requestLogFilters.offset + requestLogFilters.limit
                };
                setRequestLogFilters(nextFilters);
                refreshRequestLogs(nextFilters);
              }}
            >
              {t("dashboard.requestLogs.next")}
            </button>
          </div>
        ) : null}
      </article>
    </>
  );
};
