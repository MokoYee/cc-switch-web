import type { Dispatch, SetStateAction } from "react";

import type {
  AuditEvent,
  AuditEventPage,
  ContextTimelineEvent,
  HostCliApplyPreview,
  HostCliTakeoverMode,
  ProviderDiagnosticDetail,
  SessionRuntimeDetail,
  WorkspaceRuntimeDetail
} from "cc-switch-web-shared";

import { ProgressiveList } from "../../../shared/components/ProgressiveList.js";
import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import { buildDaemonAbsoluteUrl } from "../../../shared/lib/api.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildHostTakeoverPreviewNotice } from "../lib/buildHostTakeoverPreview.js";
import { buildRequestPrimaryCause } from "../lib/buildRoutingPrimaryCause.js";
import {
  buildTrafficTakeoverEntries,
  type TrafficTakeoverActionKind
} from "../lib/buildTrafficTakeoverEntries.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";

type AuditFilters = {
  readonly source: string;
  readonly appCode: string;
  readonly providerId: string;
  readonly level: string;
  readonly limit: number;
  readonly offset: number;
};

type RuntimeRunbookAction = "logs" | "probe" | "recover" | "reset" | "isolate";
type RequestDecisionReason = Exclude<ProviderDiagnosticDetail["recentRequestLogs"][number]["decisionReason"], null>;

type ContextRuntimeRepairPlan = {
  readonly summary: string;
  readonly suggestions: readonly string[];
  readonly dominantReasonLabel: string;
};

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const renderRequestDecisionReason = (
  locale: "zh-CN" | "en-US",
  reason: ProviderDiagnosticDetail["recentRequestLogs"][number]["decisionReason"]
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

const pickTopCount = <T extends string>(items: readonly T[]): { readonly value: T; readonly count: number } | null => {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  const target = sorted[0];
  return target ? { value: target[0], count: target[1] } : null;
};

const buildServiceValidationChecklist = (
  snapshot: DashboardSnapshot,
  locale: "zh-CN" | "en-US"
): string[] => {
  const items: string[] = [];

  items.push(
    snapshot.serviceDoctor.checks.files.envInSync
      ? localize(locale, "确认 env 文件已同步，没有残留配置漂移。", "Confirm the env file is synchronized with no remaining drift.")
      : localize(locale, "先修复 env 文件漂移，再做任何服务重启或接管动作。", "Resolve env file drift before any restart or takeover action.")
  );

  items.push(
    snapshot.serviceDoctor.checks.service.active
      ? localize(locale, "确认 cc-switch-web.service 当前处于 active 状态。", "Confirm cc-switch-web.service is currently active.")
      : localize(locale, "确认 user service 尚未启动时的预期状态，必要时再由宿主机手动启动。", "Confirm the expected inactive state before starting the user service from the host.")
  );

  items.push(
    snapshot.serviceDoctor.checks.runtime.daemonMatchesDesired
      ? localize(locale, "确认 daemon 运行参数与服务期望配置一致。", "Confirm the daemon runtime matches the desired service configuration.")
      : localize(locale, "重新核对 run mode、data dir、db path 与 daemon 当前运行态是否一致。", "Recheck run mode, data dir, and db path against the current daemon runtime.")
  );

  return items;
};

const buildServiceRecoveryRunbook = (
  snapshot: DashboardSnapshot,
  locale: "zh-CN" | "en-US"
): string[] => {
  const steps = [
    localize(
      locale,
      "先执行服务诊断，确认 systemd、unit、env、runtime 四类状态中的主异常点。",
      "Run service doctor first and identify the primary issue across systemd, unit, env, and runtime."
    )
  ];

  if (!snapshot.serviceDoctor.checks.files.envInSync) {
    steps.push(
      localize(
        locale,
        "执行“同步服务环境文件”，然后回看 Environment Drift 是否清零。",
        "Run Sync Service Env, then verify Environment Drift is cleared."
      )
    );
  }

  if (!snapshot.serviceDoctor.checks.files.unitExists) {
    steps.push(
      localize(
        locale,
        "如果 unit 尚未安装，执行“安装 User Service”生成 unit 与 env 文件。",
        "If the unit is missing, run Install User Service to create the unit and env files."
      )
    );
  }

  steps.push(
    localize(
      locale,
      "最后打开服务审计，确认最近动作已经落库，并按建议在宿主机执行启动或恢复动作。",
      "Finally open service audit, confirm the latest action is recorded, and execute any host-side start or recovery step as recommended."
    )
  );

  return steps;
};

const buildContextRuntimeRepairPlan = (
  logs:
    | ProviderDiagnosticDetail["recentRequestLogs"]
    | WorkspaceRuntimeDetail["recentRequestLogs"]
    | SessionRuntimeDetail["recentRequestLogs"],
  locale: "zh-CN" | "en-US"
): ContextRuntimeRepairPlan | null => {
  const cause = buildRequestPrimaryCause(logs, locale);
  if (cause === null) {
    return null;
  }

  const dominantNextProvider = pickTopCount(
    logs
      .filter((item) => item.outcome !== "success")
      .map((item) => item.nextProviderId)
      .filter((item): item is string => item !== null)
  );

  return {
    dominantReasonLabel: cause.label,
    summary: cause.summary,
    suggestions: [
      ...cause.suggestions.slice(0, 2),
      dominantNextProvider
        ? localize(locale, `最近还出现了流量继续切到 ${dominantNextProvider.value}，修复时要一并确认故障转移结果。`, `Requests are also falling through to ${dominantNextProvider.value}; confirm the failover result as part of the repair.`)
        : localize(locale, "修复后重新刷新运行时详情，看主因是否发生变化。", "Refresh the runtime detail after the fix and verify whether the dominant reason changes.")
    ]
  };
};

const buildProviderRunbook = (
  detail: ProviderDiagnosticDetail,
  locale: "zh-CN" | "en-US"
): {
  readonly notice: {
    readonly level: "low" | "medium" | "high";
    readonly summary: string;
    readonly suggestions: string[];
  };
  readonly actions: RuntimeRunbookAction[];
} => {
  switch (detail.failureCategory) {
    case "auth":
      return {
        notice: {
          level: "high",
          summary: localize(locale, "当前更像是凭证或权限异常，先止损再排查。", "This looks like an auth or permission issue. Contain it before recovery."),
          suggestions: [
            localize(locale, "先打开失败日志，确认是密钥失效、权限不足还是组织策略拒绝。", "Open the failure logs first to confirm whether the issue is invalid credentials, missing permissions, or an org policy denial."),
            localize(locale, "若该 Provider 仍在接流量，先临时隔离，避免继续放大失败。", "Temporarily isolate the provider if it is still receiving traffic."),
            localize(locale, "修复凭证后再执行探测或恢复，不要直接盲目 reset。", "Probe or recover only after the credentials are fixed instead of blindly resetting the circuit.")
          ]
        },
        actions: ["logs", "isolate", "probe"]
      };
    case "rate-limit":
      return {
        notice: {
          level: "medium",
          summary: localize(locale, "当前更像是上游限流，先观察窗口再恢复。", "This looks like upstream rate limiting. Observe the window before recovery."),
          suggestions: [
            localize(locale, "先查看失败日志，确认是否为 429 或配额耗尽。", "Check the failure logs first to confirm 429s or exhausted quota."),
            localize(locale, "优先等待冷却窗口或切换故障转移目标，再执行恢复。", "Prefer waiting for the cooldown window or switching failover targets before recovering."),
            localize(locale, "手动探测一次，用来判断当前窗口是否已经恢复。", "Run a manual probe to verify whether the current rate-limit window has recovered.")
          ]
        },
        actions: ["logs", "probe", "recover"]
      };
    case "upstream-unavailable":
    case "network":
    case "timeout":
      return {
        notice: {
          level: "high",
          summary: localize(locale, "当前更像是可达性或上游可用性问题，先确认连通性。", "This looks like reachability or upstream availability trouble. Confirm connectivity first."),
          suggestions: [
            localize(locale, "先执行探测，确认故障仍然存在还是已经恢复。", "Probe first to confirm whether the fault is still active or has already recovered."),
            localize(locale, "如果探测恢复，再执行 recover 让流量逐步回到该 Provider。", "If the probe succeeds, recover to gradually return traffic to the provider."),
            localize(locale, "若仍失败，再打开失败日志定位超时、DNS、TLS 或上游故障。", "If it still fails, inspect failure logs for timeout, DNS, TLS, or upstream issues.")
          ]
        },
        actions: ["probe", "recover", "logs"]
      };
    case "manual-isolation":
      return {
        notice: {
          level: "medium",
          summary: localize(locale, "该 Provider 处于人工隔离状态，恢复前先确认隔离原因。", "This provider is manually isolated. Confirm the reason before bringing it back."),
          suggestions: [
            localize(locale, "先查看失败日志或变更背景，确认隔离是否仍然必要。", "Review failure logs or change context to verify whether isolation is still necessary."),
            localize(locale, "确认可以放量后，先 reset 再 recover，避免保持旧的熔断状态。", "Once it is safe to re-enable traffic, reset first and then recover to avoid keeping stale circuit state.")
          ]
        },
        actions: ["logs", "reset", "recover"]
      };
    default:
      return {
        notice: {
          level: detail.recommendation === "ready" ? "low" : "medium",
          summary: localize(locale, "当前没有明确阻断项，可以按顺序做一次轻量确认。", "There is no obvious blocker right now. Run a light confirmation flow."),
          suggestions: [
            localize(locale, "先做一次手动探测，确认实时健康状态。", "Start with a manual probe to confirm live health."),
            localize(locale, "如果最近仍有失败，再查看失败日志核对趋势。", "Open the failure logs if recent failures still exist."),
            localize(locale, "必要时再执行 recover 或 reset，不要把操作顺序反过来。", "Use recover or reset only when needed, and keep that order.")
          ]
        },
        actions: ["probe", "logs", "recover"]
      };
  }
};

const renderDiscoveryPath = (
  discovery: DashboardSnapshot["discoveries"][number],
  t: (key: "common.notFound") => string
): string => discovery.executablePath ?? t("common.notFound");

const buildProxyEndpoint = (
  daemonHost: string,
  daemonPort: number,
  proxyBasePath: string
): string => `http://${daemonHost}:${daemonPort}${proxyBasePath}`;

const formatDateTime = (value: string): string => value.replace("T", " ").replace(".000Z", "Z");

const renderIntegrationState = (
  discovery: DashboardSnapshot["discoveries"][number],
  t: (
    key:
      | "dashboard.discovery.managed"
      | "dashboard.discovery.unmanaged"
      | "dashboard.discovery.unsupported"
      | "dashboard.discovery.missing"
  ) => string
): string => {
  if (discovery.integrationState === "managed") {
    return t("dashboard.discovery.managed");
  }
  if (discovery.integrationState === "unsupported") {
    return t("dashboard.discovery.unsupported");
  }
  if (discovery.integrationState === "missing") {
    return t("dashboard.discovery.missing");
  }
  return t("dashboard.discovery.unmanaged");
};

const renderSupportLevel = (
  discovery: DashboardSnapshot["discoveries"][number],
  t: (
    key:
      | "dashboard.discovery.level.managed"
      | "dashboard.discovery.level.inspectOnly"
      | "dashboard.discovery.level.planned"
  ) => string
): string => {
  if (discovery.supportLevel === "managed") {
    return t("dashboard.discovery.level.managed");
  }
  if (discovery.supportLevel === "inspect-only") {
    return t("dashboard.discovery.level.inspectOnly");
  }
  return t("dashboard.discovery.level.planned");
};

const renderTakeoverModeLabel = (
  takeoverMode:
    | DashboardSnapshot["discoveries"][number]["takeoverMethod"]
    | HostCliApplyPreview["takeoverMode"]
    | HostCliTakeoverMode,
  t: (
    key:
      | "dashboard.discovery.method.fileRewrite"
      | "dashboard.discovery.method.environmentOverride"
      | "dashboard.discovery.method.configInspect"
      | "dashboard.discovery.method.externalControlPlane"
  ) => string
): string => {
  if (takeoverMode === "file-rewrite") {
    return t("dashboard.discovery.method.fileRewrite");
  }
  if (takeoverMode === "environment-override") {
    return t("dashboard.discovery.method.environmentOverride");
  }
  if (takeoverMode === "config-inspect") {
    return t("dashboard.discovery.method.configInspect");
  }
  return t("dashboard.discovery.method.externalControlPlane");
};

const renderTakeoverMethod = (
  discovery: DashboardSnapshot["discoveries"][number],
  t: (
    key:
      | "dashboard.discovery.method.fileRewrite"
      | "dashboard.discovery.method.environmentOverride"
      | "dashboard.discovery.method.configInspect"
      | "dashboard.discovery.method.externalControlPlane"
  ) => string
): string => renderTakeoverModeLabel(discovery.takeoverMethod, t);

const renderSupportReason = (
  discovery: DashboardSnapshot["discoveries"][number],
  t: (
    key:
      | "dashboard.discovery.reason.stableProviderConfig"
      | "dashboard.discovery.reason.stableEnvConfig"
      | "dashboard.discovery.reason.authOnlyConfig"
      | "dashboard.discovery.reason.unverifiedUserConfig"
      | "dashboard.discovery.reason.externalGatewayProduct"
  ) => string
): string => {
  switch (discovery.supportReasonCode) {
    case "stable-provider-config":
      return t("dashboard.discovery.reason.stableProviderConfig");
    case "stable-env-config":
      return t("dashboard.discovery.reason.stableEnvConfig");
    case "auth-only-config":
      return t("dashboard.discovery.reason.authOnlyConfig");
    case "unverified-user-config":
      return t("dashboard.discovery.reason.unverifiedUserConfig");
    case "external-gateway-product":
      return t("dashboard.discovery.reason.externalGatewayProduct");
  }
};

const renderManagedFeatureHints = (
  discovery: DashboardSnapshot["discoveries"][number],
  locale: "zh-CN" | "en-US"
): string[] => {
  const hints: string[] = [];

  if (discovery.managedFeatures.includes("claude-onboarding-bypassed")) {
    hints.push(
      localize(
        locale,
        "已跳过 Claude Code 初次安装确认",
        "Claude Code first-run confirmation is bypassed"
      )
    );
  }

  return hints;
};

const renderLifecycleModeLabel = (
  lifecycleMode:
    | DashboardSnapshot["discoveries"][number]["lifecycleMode"]
    | HostCliApplyPreview["lifecycleMode"],
  locale: "zh-CN" | "en-US"
): string => {
  if (lifecycleMode === "foreground-session") {
    return localize(locale, "临时接管", "Temporary");
  }

  return localize(locale, "持久接管", "Persistent");
};

const renderEnvConflictSource = (
  sourceType: DashboardSnapshot["discoveries"][number]["envConflicts"][number]["sourceType"],
  locale: "zh-CN" | "en-US"
): string => {
  if (sourceType === "process-env") {
    return localize(locale, "当前进程环境", "Current Process Environment");
  }
  if (sourceType === "shell-file") {
    return localize(locale, "Shell 启动文件", "Shell Startup File");
  }
  return localize(locale, "环境配置文件", "Environment Config File");
};

const renderEnvConflictPath = (
  conflict: DashboardSnapshot["discoveries"][number]["envConflicts"][number]
): string =>
  conflict.lineNumber === null ? conflict.sourcePath : `${conflict.sourcePath}:${conflict.lineNumber}`;

const renderProviderDiagnosisStatus = (
  status: DashboardSnapshot["providerDiagnostics"][number]["diagnosisStatus"],
  t: (
    key:
      | "dashboard.runtime.diagnosis.healthy"
      | "dashboard.runtime.diagnosis.degraded"
      | "dashboard.runtime.diagnosis.recovering"
      | "dashboard.runtime.diagnosis.down"
      | "dashboard.runtime.diagnosis.idle"
      | "dashboard.runtime.diagnosis.disabled"
  ) => string
): string => {
  switch (status) {
    case "healthy":
      return t("dashboard.runtime.diagnosis.healthy");
    case "degraded":
      return t("dashboard.runtime.diagnosis.degraded");
    case "recovering":
      return t("dashboard.runtime.diagnosis.recovering");
    case "down":
      return t("dashboard.runtime.diagnosis.down");
    case "idle":
      return t("dashboard.runtime.diagnosis.idle");
    case "disabled":
      return t("dashboard.runtime.diagnosis.disabled");
  }
};

const renderProviderRecommendation = (
  recommendation: ProviderDiagnosticDetail["recommendation"],
  t: (
    key:
      | "dashboard.runtime.recommendation.checkCredentials"
      | "dashboard.runtime.recommendation.checkUpstreamAvailability"
      | "dashboard.runtime.recommendation.checkRateLimit"
      | "dashboard.runtime.recommendation.observeRecentFailures"
      | "dashboard.runtime.recommendation.ready"
  ) => string
): string => {
  switch (recommendation) {
    case "check-credentials":
      return t("dashboard.runtime.recommendation.checkCredentials");
    case "check-upstream-availability":
      return t("dashboard.runtime.recommendation.checkUpstreamAvailability");
    case "check-rate-limit":
      return t("dashboard.runtime.recommendation.checkRateLimit");
    case "observe-recent-failures":
      return t("dashboard.runtime.recommendation.observeRecentFailures");
    case "ready":
      return t("dashboard.runtime.recommendation.ready");
  }
  return t("dashboard.runtime.recommendation.ready");
};

const renderProviderFailureCategory = (
  category: ProviderDiagnosticDetail["failureCategory"],
  t: (
    key:
      | "dashboard.runtime.failure.none"
      | "dashboard.runtime.failure.auth"
      | "dashboard.runtime.failure.rateLimit"
      | "dashboard.runtime.failure.upstreamUnavailable"
      | "dashboard.runtime.failure.timeout"
      | "dashboard.runtime.failure.network"
      | "dashboard.runtime.failure.manualIsolation"
      | "dashboard.runtime.failure.unknown"
  ) => string
): string => {
  switch (category) {
    case "none":
      return t("dashboard.runtime.failure.none");
    case "auth":
      return t("dashboard.runtime.failure.auth");
    case "rate-limit":
      return t("dashboard.runtime.failure.rateLimit");
    case "upstream-unavailable":
      return t("dashboard.runtime.failure.upstreamUnavailable");
    case "timeout":
      return t("dashboard.runtime.failure.timeout");
    case "network":
      return t("dashboard.runtime.failure.network");
    case "manual-isolation":
      return t("dashboard.runtime.failure.manualIsolation");
    case "unknown":
      return t("dashboard.runtime.failure.unknown");
  }
};

const renderContextTimelineSource = (
  source: ContextTimelineEvent["source"],
  t: (
    key:
      | "dashboard.contextRuntime.timelineSource.proxyRequest"
      | "dashboard.contextRuntime.timelineSource.providerHealth"
      | "dashboard.contextRuntime.timelineSource.quota"
  ) => string
): string => {
  if (source === "proxy-request") {
    return t("dashboard.contextRuntime.timelineSource.proxyRequest");
  }
  if (source === "provider-health") {
    return t("dashboard.contextRuntime.timelineSource.providerHealth");
  }
  return t("dashboard.contextRuntime.timelineSource.quota");
};

const renderAuditSource = (
  source:
    | "host-integration"
    | "provider-health"
    | "proxy-request"
    | "mcp"
    | "quota"
    | "config-snapshot"
    | "system-service",
  t: (
    key:
      | "dashboard.audit.source.hostIntegration"
      | "dashboard.audit.source.providerHealth"
      | "dashboard.audit.source.proxyRequest"
      | "dashboard.audit.source.mcp"
      | "dashboard.audit.source.configSnapshot"
      | "dashboard.audit.source.quota"
  ) => string
): string => {
  if (source === "host-integration") {
    return t("dashboard.audit.source.hostIntegration");
  }
  if (source === "provider-health") {
    return t("dashboard.audit.source.providerHealth");
  }
  if (source === "proxy-request") {
    return t("dashboard.audit.source.proxyRequest");
  }
  if (source === "config-snapshot") {
    return t("dashboard.audit.source.configSnapshot");
  }
  if (source === "quota") {
    return t("dashboard.audit.source.quota");
  }
  if (source === "system-service") {
    return "system-service";
  }
  return t("dashboard.audit.source.mcp");
};

const renderMcpAuditAction = (
  action: string | null,
  t: (
    key:
      | "dashboard.audit.mcpAction.serverUpsert"
      | "dashboard.audit.mcpAction.serverDelete"
      | "dashboard.audit.mcpAction.bindingUpsert"
      | "dashboard.audit.mcpAction.bindingDelete"
      | "dashboard.audit.mcpAction.import"
      | "dashboard.audit.mcpAction.hostApply"
      | "dashboard.audit.mcpAction.hostRollback"
  ) => string
): string => {
  switch (action) {
    case "server-upsert":
      return t("dashboard.audit.mcpAction.serverUpsert");
    case "server-delete":
      return t("dashboard.audit.mcpAction.serverDelete");
    case "binding-upsert":
      return t("dashboard.audit.mcpAction.bindingUpsert");
    case "binding-delete":
      return t("dashboard.audit.mcpAction.bindingDelete");
    case "import":
      return t("dashboard.audit.mcpAction.import");
    case "host-apply":
      return t("dashboard.audit.mcpAction.hostApply");
    case "host-rollback":
      return t("dashboard.audit.mcpAction.hostRollback");
    default:
      return action ?? "unknown";
  }
};

const renderMcpAuditTargetType = (
  targetType: string | null | undefined,
  t: (
    key:
      | "dashboard.audit.mcpTarget.server"
      | "dashboard.audit.mcpTarget.binding"
      | "dashboard.audit.mcpTarget.hostSync"
  ) => string
): string => {
  switch (targetType) {
    case "server":
      return t("dashboard.audit.mcpTarget.server");
    case "binding":
      return t("dashboard.audit.mcpTarget.binding");
    case "host-sync":
      return t("dashboard.audit.mcpTarget.hostSync");
    default:
      return targetType ?? "unknown";
  }
};

type RuntimeGovernancePanelsProps = {
  readonly snapshot: DashboardSnapshot;
  readonly isWorking: boolean;
  readonly selectedProviderDiagnosticId: string | null;
  readonly selectedProviderDiagnosticDetail: ProviderDiagnosticDetail | null;
  readonly selectedWorkspaceRuntimeDetail: WorkspaceRuntimeDetail | null;
  readonly selectedSessionRuntimeDetail: SessionRuntimeDetail | null;
  readonly auditEventPage: AuditEventPage | null;
  readonly auditFilters: AuditFilters;
  readonly setAuditFilters: Dispatch<SetStateAction<AuditFilters>>;
  readonly mcpAuditItems: AuditEvent[];
  readonly quotaAuditItems: AuditEvent[];
  readonly refreshProviderDiagnosticDetail: (providerId: string) => void;
  readonly onRecoverProvider: (providerId: string) => void;
  readonly onIsolateProvider: (providerId: string) => void;
  readonly onResetProvider: (providerId: string) => void;
  readonly onProbeProvider: (providerId: string) => void;
  readonly onEditProvider: (providerId: string) => void;
  readonly onEditBinding: (appCode: string) => void;
  readonly onEditFailover: (appCode: string) => void;
  readonly onEditMcpServer: (serverId: string) => void;
  readonly onEditMcpBinding: (bindingId: string) => void;
  readonly focusProviderFailureLogs: (providerId: string) => void;
  readonly closeProviderDetail: () => void;
  readonly onOpenRoutingForms: () => void;
  readonly onOpenMcpForms: () => void;
  readonly onOpenAssetForms: () => void;
  readonly onApplyHostCliManagedConfig: (
    appCode: string,
    mode?: HostCliTakeoverMode
  ) => void;
  readonly onRollbackHostCliManagedConfig: (appCode: string) => void;
  readonly onRollbackForegroundHostCliManagedConfigs: () => void;
  readonly hostApplyPreviewByApp: Record<string, HostCliApplyPreview | null>;
  readonly onPreviewHostCliManagedConfig: (
    appCode: string,
    mode?: HostCliTakeoverMode
  ) => void;
  readonly refreshWorkspaceRuntimeDetail: (workspaceId: string) => void;
  readonly focusWorkspaceLogs: (workspaceId: string) => void;
  readonly refreshSessionRuntimeDetail: (sessionId: string) => void;
  readonly focusSessionLogs: (sessionId: string) => void;
  readonly onOpenAppTraffic: (appCode: DashboardSnapshot["discoveries"][number]["appCode"]) => void;
  readonly onEditWorkspace: (workspaceId: string) => void;
  readonly onActivateWorkspace: (workspaceId: string) => void;
  readonly closeWorkspaceRuntimeDetail: () => void;
  readonly onEditSession: (sessionId: string) => void;
  readonly onActivateSession: (sessionId: string) => void;
  readonly onArchiveSession: (sessionId: string) => void;
  readonly closeSessionRuntimeDetail: () => void;
  readonly refreshAuditEvents: (filters?: AuditFilters) => void;
  readonly onSyncServiceEnv: () => void;
  readonly onInstallSystemService: () => void;
  readonly formatNumber: (value: number) => string;
};

export const RuntimeGovernancePanels = ({
  snapshot,
  isWorking,
  selectedProviderDiagnosticId,
  selectedProviderDiagnosticDetail,
  selectedWorkspaceRuntimeDetail,
  selectedSessionRuntimeDetail,
  auditEventPage,
  auditFilters,
  setAuditFilters,
  mcpAuditItems,
  quotaAuditItems,
  refreshProviderDiagnosticDetail,
  onRecoverProvider,
  onIsolateProvider,
  onResetProvider,
  onProbeProvider,
  onEditProvider,
  onEditBinding,
  onEditFailover,
  onEditMcpServer,
  onEditMcpBinding,
  focusProviderFailureLogs,
  closeProviderDetail,
  onOpenRoutingForms,
  onOpenMcpForms,
  onOpenAssetForms,
  onApplyHostCliManagedConfig,
  onRollbackHostCliManagedConfig,
  onRollbackForegroundHostCliManagedConfigs,
  hostApplyPreviewByApp,
  onPreviewHostCliManagedConfig,
  refreshWorkspaceRuntimeDetail,
  focusWorkspaceLogs,
  refreshSessionRuntimeDetail,
  focusSessionLogs,
  onOpenAppTraffic,
  onEditWorkspace,
  onActivateWorkspace,
  closeWorkspaceRuntimeDetail,
  onEditSession,
  onActivateSession,
  onArchiveSession,
  closeSessionRuntimeDetail,
  refreshAuditEvents,
  onSyncServiceEnv,
  onInstallSystemService,
  formatNumber
}: RuntimeGovernancePanelsProps): JSX.Element => {
  const { t, locale } = useI18n();
  const foregroundManagedDiscoveries = snapshot.discoveries.filter(
    (item) => item.integrationState === "managed" && item.lifecycleMode === "foreground-session"
  );
  const metricsUrl = buildDaemonAbsoluteUrl("/metrics");
  const startupRecovery = snapshot.hostStartupRecovery;
  const startupRecoveryLevel: "medium" | "high" =
    startupRecovery !== null && startupRecovery.failedApps.length > 0 ? "high" : "medium";

  const renderTakeoverActionLabel = (action: TrafficTakeoverActionKind): string => {
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
        return localize(locale, "生成接管预检", "Generate Takeover Preview");
    }
  };
  const applyAuditFilter = (updates: Partial<AuditFilters>): void => {
    const nextFilters = {
      ...auditFilters,
      ...updates,
      offset: 0
    };
    setAuditFilters(nextFilters);
    refreshAuditEvents(nextFilters);
  };

  const takeoverEntries = buildTrafficTakeoverEntries(snapshot, locale).filter(
    (item) => item.discoverySupported || item.verificationState !== "managed-verified"
  );

  const runTakeoverAction = (
    appCode: DashboardSnapshot["discoveries"][number]["appCode"],
    action: TrafficTakeoverActionKind
  ): void => {
    if (action === "open-traffic") {
      onOpenAppTraffic(appCode);
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

    if (action === "preview-host-takeover") {
      onPreviewHostCliManagedConfig(appCode);
      return;
    }

    const providerId =
      snapshot.providerDiagnostics.find((item) => item.bindingAppCodes.includes(appCode))?.providerId ??
      snapshot.providerDiagnostics.find((item) => item.failoverAppCodes.includes(appCode))?.providerId ??
      null;
    if (providerId !== null) {
      refreshProviderDiagnosticDetail(providerId);
    }
  };

  const providerRepairPlan = selectedProviderDiagnosticDetail
    ? buildContextRuntimeRepairPlan(selectedProviderDiagnosticDetail.recentRequestLogs, locale)
    : null;
  const workspaceRepairPlan = selectedWorkspaceRuntimeDetail
    ? buildContextRuntimeRepairPlan(selectedWorkspaceRuntimeDetail.recentRequestLogs, locale)
    : null;
  const sessionRepairPlan = selectedSessionRuntimeDetail
    ? buildContextRuntimeRepairPlan(selectedSessionRuntimeDetail.recentRequestLogs, locale)
    : null;

  const editAuditEventTarget = (event: AuditEvent): void => {
    if (event.source === "provider-health" && event.providerId) {
      onEditProvider(event.providerId);
      return;
    }

    if (event.source === "host-integration" && event.appCode) {
      onEditBinding(event.appCode);
      return;
    }

    if (event.source === "proxy-request") {
      if (event.metadata.sessionId) {
        onEditSession(event.metadata.sessionId);
        return;
      }
      if (event.metadata.workspaceId) {
        onEditWorkspace(event.metadata.workspaceId);
        return;
      }
      if (event.providerId) {
        onEditProvider(event.providerId);
        return;
      }
      if (event.appCode) {
        onEditBinding(event.appCode);
      }
      return;
    }

    if (event.source === "mcp") {
      if (event.metadata.targetType === "server" && event.metadata.targetId) {
        onEditMcpServer(event.metadata.targetId);
        return;
      }
      if (event.metadata.targetType === "binding" && event.metadata.targetId) {
        onEditMcpBinding(event.metadata.targetId);
        return;
      }
      onOpenMcpForms();
      return;
    }

    if (event.appCode) {
      onEditBinding(event.appCode);
      return;
    }

    if (event.providerId) {
      onEditProvider(event.providerId);
      return;
    }

    onOpenRoutingForms();
  };

  return (
    <>
      <article className="panel">
        <h2>{t("dashboard.panels.proxyRuntime")}</h2>
        <div className="list">
          <div className="list-row">
            <div>
              <strong>{snapshot.proxyRuntime.runtimeState}</strong>
              <p>{snapshot.proxyRuntime.policy.enabled ? t("common.enabled") : t("common.disabled")}</p>
            </div>
            <div className="row-meta">
              <span>{t("dashboard.runtime.proxyReloadedAt")}</span>
              <code>{snapshot.proxyRuntime.lastReloadedAt ?? "none"}</code>
            </div>
          </div>
          {snapshot.proxyRuntime.activeBindings.map((binding) => (
            <div className="list-row" key={binding.appCode}>
              <div>
                <strong>{binding.appCode}</strong>
                <p>{binding.providerName}</p>
              </div>
              <div className="row-meta">
                <span>{binding.hasCredential ? t("dashboard.runtime.credentialReady") : t("dashboard.runtime.credentialMissing")}</span>
                <code>{buildProxyEndpoint(snapshot.runtime.daemonHost, snapshot.runtime.daemonPort, binding.proxyBasePath)}</code>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditBinding(binding.appCode)}>
                  {locale === "zh-CN" ? "编辑 Binding" : "Edit Binding"}
                </button>
              </div>
            </div>
          ))}
          {snapshot.providerDiagnostics.map((diagnostic) => (
            <div className="list-row" key={`diagnostic-${diagnostic.providerId}`}>
              <div>
                <strong>{diagnostic.providerName} ({diagnostic.providerId})</strong>
                <p>{renderProviderDiagnosisStatus(diagnostic.diagnosisStatus, t)}</p>
                <p>
                  {t("dashboard.runtime.diagnosisRequests")}: {formatNumber(diagnostic.requestCount)} /{" "}
                  {t("dashboard.runtime.diagnosisSuccessRate")}: {diagnostic.successRate === null ? "n/a" : `${formatNumber(Math.round(diagnostic.successRate * 100))}%`}
                </p>
                <p>
                  {t("dashboard.runtime.diagnosisBindings")}: {diagnostic.bindingAppCodes.length > 0 ? diagnostic.bindingAppCodes.join(", ") : t("common.notFound")}
                </p>
                <p>
                  {t("dashboard.runtime.diagnosisFailoverApps")}: {diagnostic.failoverAppCodes.length > 0 ? diagnostic.failoverAppCodes.join(", ") : t("common.notFound")}
                </p>
                <p>
                  {t("dashboard.runtime.diagnosisLastRequest")}: {diagnostic.lastRequestAt ?? "none"}
                  {diagnostic.lastRequestMethod && diagnostic.lastRequestPath ? ` / ${diagnostic.lastRequestMethod} ${diagnostic.lastRequestPath}` : ""}
                </p>
                <p>
                  {t("dashboard.runtime.diagnosisRecentErrors")}: {diagnostic.recentErrorMessages.length > 0 ? diagnostic.recentErrorMessages.join(" | ") : t("dashboard.workspace.noWarnings")}
                </p>
                <p>
                  {t("dashboard.runtime.probeInFlight")}: {diagnostic.recoveryProbeInFlight ? t("common.enabled") : t("common.disabled")} / {t("dashboard.runtime.recoveryAttempts")}: {diagnostic.recoveryAttemptCount}
                </p>
              </div>
              <div className="row-meta">
                <span>{diagnostic.circuitState}</span>
                <code>{diagnostic.nextRecoveryProbeAt ?? diagnostic.cooldownUntil ?? diagnostic.recoveryProbeUrl ?? "ready"}</code>
                <span>
                  {t("dashboard.runtime.diagnosisLatency")}: {diagnostic.averageLatencyMs === null ? "n/a" : `${formatNumber(Math.round(diagnostic.averageLatencyMs))} ms`}
                </span>
                <button className="inline-action" type="button" disabled={isWorking || selectedProviderDiagnosticId === diagnostic.providerId} onClick={() => refreshProviderDiagnosticDetail(diagnostic.providerId)}>
                  {t("dashboard.runtime.viewDetail")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditProvider(diagnostic.providerId)}>
                  {locale === "zh-CN" ? "编辑 Provider" : "Edit Provider"}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                  {locale === "zh-CN" ? "打开路由修复" : "Open Routing Repair"}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onRecoverProvider(diagnostic.providerId)}>
                  {t("dashboard.runtime.recoverNow")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking || diagnostic.enabled === false} onClick={() => onIsolateProvider(diagnostic.providerId)}>
                  {t("dashboard.runtime.isolateNow")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking || diagnostic.circuitState === "closed"} onClick={() => onResetProvider(diagnostic.providerId)}>
                  {t("dashboard.runtime.resetNow")}
                </button>
              </div>
            </div>
          ))}
          {snapshot.proxyRuntime.providerHealthStates.map((state) => (
            <div className="list-row" key={state.providerId}>
              <div>
                <strong>{state.providerId}</strong>
                <p>{state.circuitState}</p>
                <p>{t("dashboard.runtime.lastProbe")}: {state.lastProbeAt ?? "none"} / {state.lastProbeResult ?? "unknown"}</p>
                <p>{t("dashboard.runtime.probeInFlight")}: {state.recoveryProbeInFlight ? t("common.enabled") : t("common.disabled")} / {t("dashboard.runtime.recoveryAttempts")}: {state.recoveryAttemptCount}</p>
                <p>{t("dashboard.runtime.lastRecovered")}: {state.lastRecoveredAt ?? "none"}</p>
              </div>
              <div className="row-meta">
                <span>{state.consecutiveFailures}</span>
                <code>{state.nextRecoveryProbeAt ?? state.cooldownUntil ?? "ready"}</code>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditProvider(state.providerId)}>
                  {locale === "zh-CN" ? "编辑 Provider" : "Edit Provider"}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onProbeProvider(state.providerId)}>
                  {t("dashboard.runtime.probeNow")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      {selectedProviderDiagnosticDetail ? (
        <article className="panel">
          <h2>{t("dashboard.panels.providerDiagnosisDetail")}</h2>
          {(() => {
            const runbook = buildProviderRunbook(selectedProviderDiagnosticDetail, locale);

            return (
              <>
                <GovernanceNoticeCard notice={runbook.notice} locale={locale} />
                <div className="quick-action-row">
                  {runbook.actions.includes("logs") ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => focusProviderFailureLogs(selectedProviderDiagnosticDetail.diagnostic.providerId)}
                    >
                      {t("dashboard.runtime.openFailureLogs")}
                    </button>
                  ) : null}
                  {runbook.actions.includes("probe") ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onProbeProvider(selectedProviderDiagnosticDetail.diagnostic.providerId)}
                    >
                      {t("dashboard.runtime.probeNow")}
                    </button>
                  ) : null}
                  {runbook.actions.includes("recover") ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onRecoverProvider(selectedProviderDiagnosticDetail.diagnostic.providerId)}
                    >
                      {t("dashboard.runtime.recoverNow")}
                    </button>
                  ) : null}
                  {runbook.actions.includes("reset") ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onResetProvider(selectedProviderDiagnosticDetail.diagnostic.providerId)}
                    >
                      {t("dashboard.runtime.resetNow")}
                    </button>
                  ) : null}
                  {runbook.actions.includes("isolate") ? (
                    <button
                      className="inline-action danger"
                      type="button"
                      disabled={isWorking || selectedProviderDiagnosticDetail.diagnostic.enabled === false}
                      onClick={() => onIsolateProvider(selectedProviderDiagnosticDetail.diagnostic.providerId)}
                    >
                      {t("dashboard.runtime.isolateNow")}
                    </button>
                  ) : null}
                </div>
              </>
            );
          })()}
          <div className="list">
            <div className="list-row">
              <div>
                <strong>{selectedProviderDiagnosticDetail.diagnostic.providerName} ({selectedProviderDiagnosticDetail.diagnostic.providerId})</strong>
                <p>{selectedProviderDiagnosticDetail.recommendationMessage}</p>
                <p>{t("dashboard.runtime.detailRecommendation")}: {renderProviderRecommendation(selectedProviderDiagnosticDetail.recommendation, t)}</p>
                <p>{t("dashboard.runtime.detailFailureCategory")}: {renderProviderFailureCategory(selectedProviderDiagnosticDetail.failureCategory, t)}</p>
              </div>
              <div className="row-meta">
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => focusProviderFailureLogs(selectedProviderDiagnosticDetail.diagnostic.providerId)}>
                  {t("dashboard.runtime.openFailureLogs")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={closeProviderDetail}>
                  {t("dashboard.runtime.closeDetail")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditProvider(selectedProviderDiagnosticDetail.diagnostic.providerId)}>
                  {locale === "zh-CN" ? "编辑 Provider" : "Edit Provider"}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                  {locale === "zh-CN" ? "去修路由/Provider" : "Open Routing / Provider"}
                </button>
              </div>
            </div>
            {providerRepairPlan ? (
              <div className="governance-notice governance-medium">
                <div className="governance-notice-header">
                  <strong>{localize(locale, "最近请求主因", "Dominant Recent Cause")}</strong>
                  <span className="governance-notice-badge">{providerRepairPlan.dominantReasonLabel}</span>
                </div>
                <ul className="governance-suggestion-list">
                  <li>{providerRepairPlan.summary}</li>
                  {providerRepairPlan.suggestions.map((item) => (
                    <li key={`provider-repair-${item}`}>{item}</li>
                  ))}
                </ul>
                <div className="quick-action-row">
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => applyAuditFilter({
                      source: "proxy-request",
                      providerId: selectedProviderDiagnosticDetail.diagnostic.providerId,
                      level: "error"
                    })}
                  >
                    {localize(locale, "筛选请求审计", "Filter Request Audit")}
                  </button>
                  {selectedProviderDiagnosticDetail.diagnostic.bindingAppCodes[0] ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onEditBinding(selectedProviderDiagnosticDetail.diagnostic.bindingAppCodes[0] as string)}
                    >
                      {localize(locale, "检查主 Binding", "Check Primary Binding")}
                    </button>
                  ) : null}
                  {selectedProviderDiagnosticDetail.diagnostic.failoverAppCodes[0] ? (
                    <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                      {localize(locale, "检查故障转移链", "Review Failover Chain")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="list-row">
              <div>
                <strong>{t("dashboard.runtime.detailRecentFailures")}</strong>
                {selectedProviderDiagnosticDetail.recentRequestLogs.length === 0 ? (
                  <p>{t("dashboard.runtime.detailNoFailures")}</p>
                ) : (
                  selectedProviderDiagnosticDetail.recentRequestLogs.map((log) => (
                    <p key={`request-${log.id}`}>
                      [{log.outcome}] {log.statusCode ?? "n/a"} {log.method} {log.path} /{" "}
                      {renderRequestDecisionReason(locale, log.decisionReason)}
                      {log.nextProviderId ? ` -> ${log.nextProviderId}` : ""} /{" "}
                      {log.errorMessage ?? log.targetUrl ?? "n/a"}
                    </p>
                  ))
                )}
              </div>
            </div>
            <div className="list-row">
              <div>
                <strong>{t("dashboard.runtime.detailHealthTimeline")}</strong>
                {selectedProviderDiagnosticDetail.recentHealthEvents.length === 0 ? (
                  <p>{t("dashboard.runtime.detailNoHealthEvents")}</p>
                ) : (
                  selectedProviderDiagnosticDetail.recentHealthEvents.map((event) => (
                    <p key={`health-${event.id}`}>[{event.status}] {event.trigger} / {event.statusCode ?? "n/a"} / {event.message}</p>
                  ))
                )}
              </div>
            </div>
          </div>
        </article>
      ) : null}

      <article className="panel">
        <h2>{t("dashboard.panels.discoveries")}</h2>
        {foregroundManagedDiscoveries.length > 0 ? (
          <>
            <GovernanceNoticeCard
              locale={locale}
              notice={{
                level: "high",
                summary: localize(
                  locale,
                  `当前有 ${foregroundManagedDiscoveries.length} 个宿主机接管处于临时模式。daemon 正常退出会自动回滚，但异常断电后仍应人工检查宿主机配置是否恢复。`,
                  `${foregroundManagedDiscoveries.length} host takeover(s) are currently temporary. A clean daemon shutdown will auto-rollback them, but after an unexpected power loss you should still verify host configs were restored.`
                ),
                suggestions: [
                  localize(
                    locale,
                    `涉及应用：${foregroundManagedDiscoveries.map((item) => item.appCode).join(", ")}。`,
                    `Affected apps: ${foregroundManagedDiscoveries.map((item) => item.appCode).join(", ")}.`
                  ),
                  localize(
                    locale,
                    "如果需要跨重启保留接管，请改为 systemd user service 运行模式。",
                    "If takeover must survive restarts, switch to the systemd user service run mode."
                  ),
                  localize(
                    locale,
                    "如果只是临时使用，现在就可以一键回滚全部临时接管，避免宿主机残留代理目标。",
                    "If this is only for a temporary session, roll back all temporary takeovers now to avoid stale proxy targets on the host."
                  )
                ]
              }}
            />
            <div className="quick-action-row">
              <button
                className="inline-action danger"
                type="button"
                disabled={isWorking}
                onClick={onRollbackForegroundHostCliManagedConfigs}
              >
                {localize(locale, "回滚全部临时接管", "Rollback All Temporary Takeovers")}
              </button>
            </div>
          </>
        ) : null}
        <div className="list">
          {snapshot.discoveries.map((item) => {
            const preview = hostApplyPreviewByApp[item.appCode];
            const supportsEnvironmentOverride = item.supportedTakeoverModes.includes(
              "environment-override"
            );
            const supportsFileRewrite = item.supportedTakeoverModes.includes("file-rewrite");

            return (
              <div className="list-row" key={item.appCode}>
                <div>
                  <strong>{item.appCode}</strong>
                  <p>{renderIntegrationState(item, t)} / {renderSupportLevel(item, t)}</p>
                  <p>{t("dashboard.discovery.takeoverMethod")}: {renderTakeoverMethod(item, t)}</p>
                  {item.supportedTakeoverModes.length > 1 ? (
                    <p>
                      {localize(locale, "可用接管模式", "Available Modes")}:{" "}
                      {item.supportedTakeoverModes
                        .map((mode) => renderTakeoverModeLabel(mode, t))
                        .join(" / ")}
                    </p>
                  ) : null}
                  <p>{renderSupportReason(item, t)}</p>
                  <p>{t("dashboard.discovery.currentTarget")}: {item.currentTarget ?? t("common.notFound")}</p>
                  {item.desiredTarget ? <p>{t("dashboard.discovery.desiredTarget")}: {item.desiredTarget}</p> : null}
                  {item.lifecycleMode ? (
                    <p>
                      {localize(locale, "接管生命周期", "Takeover Lifecycle")}:{" "}
                      {renderLifecycleModeLabel(item.lifecycleMode, locale)}
                    </p>
                  ) : null}
                  {item.envConflicts.length > 0 ? (
                    <div className="note-block warning-block">
                      <strong>
                        {localize(
                          locale,
                          `检测到 ${item.envConflicts.length} 个环境变量覆盖`,
                          `${item.envConflicts.length} environment override(s) detected`
                        )}
                      </strong>
                      <ul className="governance-suggestion-list">
                        {item.envConflicts.map((conflict) => (
                          <li key={`${item.appCode}-${conflict.variableName}-${renderEnvConflictPath(conflict)}`}>
                            <code>{conflict.variableName}</code> = <code>{conflict.valuePreview || "''"}</code> /{" "}
                            {renderEnvConflictSource(conflict.sourceType, locale)} /{" "}
                            <code>{renderEnvConflictPath(conflict)}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {renderManagedFeatureHints(item, locale).map((hint) => (
                    <p key={`${item.appCode}-${hint}`}>{hint}</p>
                  ))}
                  {preview ? (
                    <div className="note-block">
                      <strong>{localize(locale, "接管预检", "Takeover Preview")}</strong>
                      <GovernanceNoticeCard notice={buildHostTakeoverPreviewNotice(preview, locale)} locale={locale} />
                      <p>
                        {localize(locale, "预检模式", "Preview Mode")}:{" "}
                        {renderTakeoverModeLabel(preview.takeoverMode, t)}
                      </p>
                      <p>
                        {localize(locale, "目标", "Target")}: {preview.desiredTarget ?? t("common.notFound")}
                      </p>
                      <p>
                        {localize(locale, "风险等级", "Risk Level")}:{" "}
                        {localize(
                          locale,
                          preview.riskLevel === "high"
                            ? "高"
                            : preview.riskLevel === "medium"
                              ? "中"
                              : "低",
                          preview.riskLevel === "high"
                            ? "High"
                            : preview.riskLevel === "medium"
                              ? "Medium"
                              : "Low"
                        )}
                      </p>
                      <p>
                        {localize(locale, "将修改文件", "Touched Files")}: {preview.touchedFiles.length}
                      </p>
                      <p>
                        {localize(locale, "接管生命周期", "Takeover Lifecycle")}:{" "}
                        {renderLifecycleModeLabel(preview.lifecycleMode, locale)}
                      </p>
                      <ul className="governance-suggestion-list">
                        {preview.summary.map((line) => (
                          <li key={`${item.appCode}-summary-${line}`}>{line}</li>
                        ))}
                      </ul>
                      {preview.managedFeaturesToEnable.map((feature) => (
                        <p key={`${item.appCode}-${feature}`}>
                          {feature === "claude-onboarding-bypassed"
                            ? localize(locale, "将启用 Claude 初次确认跳过", "Claude onboarding bypass will be enabled")
                            : feature}
                        </p>
                      ))}
                      {preview.environmentOverride ? (
                        <>
                          <p>{localize(locale, "环境变量接管", "Environment Takeover")}:</p>
                          <ul className="governance-suggestion-list">
                            {preview.environmentOverride.variables.map((variable) => (
                              <li key={`${item.appCode}-env-variable-${variable.variableName}`}>
                                <code>{variable.variableName}</code> = <code>{variable.value || "''"}</code> /{" "}
                                {variable.description}
                              </li>
                            ))}
                          </ul>
                          <p>
                            {localize(locale, "激活命令", "Activation Command")}:{" "}
                            <code>{preview.environmentOverride.activationCommands[0]}</code>
                          </p>
                          <p>
                            {localize(locale, "清理命令", "Cleanup Command")}:{" "}
                            <code>{preview.environmentOverride.deactivationCommands[0]}</code>
                          </p>
                        </>
                      ) : null}
                      <p>{localize(locale, "核验清单", "Validation Checklist")}:</p>
                      <ul className="governance-suggestion-list">
                        {preview.validationChecklist.map((check) => (
                          <li key={`${item.appCode}-validation-${check}`}>{check}</li>
                        ))}
                      </ul>
                      <p>{localize(locale, "文件变更", "File Changes")}:</p>
                      <ul className="governance-suggestion-list">
                        {preview.touchedFiles.map((file) => (
                          <li key={`${item.appCode}-${file.path}`}>
                            <code>{file.path}</code> / {file.changeKind} / {file.backupRequired ? "backup" : "no-backup"}
                          </li>
                        ))}
                      </ul>
                      <p>{localize(locale, "执行顺序", "Runbook")}:</p>
                      <ul className="governance-suggestion-list">
                        {preview.runbook.map((step) => (
                          <li key={`${item.appCode}-runbook-${step}`}>{step}</li>
                        ))}
                      </ul>
                      {preview.envConflicts.length > 0 ? (
                        <>
                          <p>{localize(locale, "环境覆盖来源", "Environment Override Sources")}:</p>
                          <ul className="governance-suggestion-list">
                            {preview.envConflicts.map((conflict) => (
                              <li key={`${item.appCode}-env-${conflict.variableName}-${renderEnvConflictPath(conflict)}`}>
                                <code>{conflict.variableName}</code> = <code>{conflict.valuePreview || "''"}</code> /{" "}
                                {renderEnvConflictSource(conflict.sourceType, locale)} /{" "}
                                <code>{renderEnvConflictPath(conflict)}</code>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <p>{localize(locale, "回滚计划", "Rollback Plan")}:</p>
                      <ul className="governance-suggestion-list">
                        {preview.rollbackPlan.map((plan) => (
                          <li key={`${item.appCode}-rollback-${plan.path}`}>
                            <code>{plan.path}</code> / {plan.action}
                          </li>
                        ))}
                      </ul>
                      {preview.warnings.map((warning) => (
                        <p key={`${item.appCode}-warning-${warning}`}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                  {item.docsUrl ? <p>{t("dashboard.discovery.docsUrl")}: {item.docsUrl}</p> : null}
                </div>
                <div className="row-meta">
                  <code>{item.configPath ?? item.configLocationHint ?? renderDiscoveryPath(item, t)}</code>
                  {item.lifecycleMode ? (
                    <span className="governance-notice-badge">
                      {renderLifecycleModeLabel(item.lifecycleMode, locale)}
                    </span>
                  ) : null}
                  {(item.appCode === "codex" ||
                    item.appCode === "claude-code" ||
                    item.appCode === "gemini-cli" ||
                    item.appCode === "opencode" ||
                    item.appCode === "openclaw") ? (
                    <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenMcpForms}>
                      {locale === "zh-CN" ? "打开 MCP 修复" : "Open MCP Repair"}
                    </button>
                  ) : null}
                  {item.takeoverSupported ? (
                    item.integrationState === "managed" ? (
                      <button className="inline-action" type="button" disabled={isWorking} onClick={() => onRollbackHostCliManagedConfig(item.appCode)}>
                        {t("dashboard.discovery.rollback")}
                      </button>
                    ) : (
                      <>
                        {supportsFileRewrite ? (
                          <button
                            className="inline-action"
                            type="button"
                            disabled={isWorking}
                            onClick={() => onPreviewHostCliManagedConfig(item.appCode, "file-rewrite")}
                          >
                            {preview?.takeoverMode === "file-rewrite"
                              ? localize(locale, "刷新文件接管预检", "Refresh File Preview")
                              : localize(locale, "预检文件接管", "Preview File Takeover")}
                          </button>
                        ) : null}
                        {supportsEnvironmentOverride ? (
                          <button
                            className="inline-action"
                            type="button"
                            disabled={isWorking}
                            onClick={() =>
                              onPreviewHostCliManagedConfig(item.appCode, "environment-override")
                            }
                          >
                            {preview?.takeoverMode === "environment-override"
                              ? localize(locale, "刷新环境接管预检", "Refresh Env Preview")
                              : localize(locale, "预检环境接管", "Preview Env Takeover")}
                          </button>
                        ) : null}
                        {preview ? (
                          <button
                            className="inline-action"
                            type="button"
                            disabled={isWorking}
                            onClick={() =>
                              onApplyHostCliManagedConfig(item.appCode, preview.takeoverMode)
                            }
                          >
                            {localize(locale, "确认应用接管", "Confirm Takeover")}
                          </button>
                        ) : null}
                      </>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </article>

      <article className="panel" data-testid="context-runtime-panel">
        <h2>{t("dashboard.panels.contextRuntime")}</h2>
        <div className="list">
          <ProgressiveList
            items={snapshot.runtimeContexts.workspaces}
            locale={locale}
            initialVisibleCount={10}
            step={10}
            totalCount={snapshot.runtimeContexts.workspaces.length}
            renderItem={(workspace) => (
              <div
                className="list-row"
                data-testid={`workspace-runtime-row-${workspace.workspaceId}`}
                key={`workspace-runtime-${workspace.workspaceId}`}
              >
                <div>
                  <strong>{workspace.workspaceName}</strong>
                  <p>{workspace.workspaceId} / {workspace.appCode ?? t("common.notFound")}</p>
                  <p>{t("dashboard.contextRuntime.requests")}: {formatNumber(workspace.requestCount)} / {t("dashboard.contextRuntime.errors")}: {formatNumber(workspace.errorCount)}</p>
                  <p>{t("dashboard.contextRuntime.tokens")}: {formatNumber(workspace.totalTokens)} / {t("dashboard.contextRuntime.sessions")}: {formatNumber(workspace.sessionCount)}</p>
                </div>
                <div className="row-meta">
                  <span>{workspace.lastProviderId ?? t("common.notFound")}</span>
                  <code>{workspace.lastRequestAt ?? "none"}</code>
                  <button
                    className="inline-action"
                    data-testid={`workspace-runtime-view-detail-${workspace.workspaceId}`}
                    type="button"
                    disabled={isWorking}
                    onClick={() => refreshWorkspaceRuntimeDetail(workspace.workspaceId)}
                  >
                    {t("dashboard.contextRuntime.viewDetail")}
                  </button>
                  <button className="inline-action" type="button" disabled={isWorking} onClick={() => focusWorkspaceLogs(workspace.workspaceId)}>
                    {t("dashboard.contextRuntime.openLogs")}
                  </button>
                  <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditWorkspace(workspace.workspaceId)}>
                    {locale === "zh-CN" ? "编辑工作区" : "Edit Workspace"}
                  </button>
                </div>
              </div>
            )}
          />
          <ProgressiveList
            items={snapshot.runtimeContexts.sessions}
            locale={locale}
            initialVisibleCount={10}
            step={10}
            totalCount={snapshot.runtimeContexts.sessions.length}
            renderItem={(session) => (
              <div
                className="list-row"
                data-testid={`session-runtime-row-${session.sessionId}`}
                key={`session-runtime-${session.sessionId}`}
              >
                <div>
                  <strong>{session.title}</strong>
                  <p>{session.sessionId} / {session.appCode} / {session.status}</p>
                  <p>{session.cwd}</p>
                  <p>{t("dashboard.contextRuntime.requests")}: {formatNumber(session.requestCount)} / {t("dashboard.contextRuntime.errors")}: {formatNumber(session.errorCount)} / {t("dashboard.contextRuntime.tokens")}: {formatNumber(session.totalTokens)}</p>
                </div>
                <div className="row-meta">
                  <span>{session.lastProviderId ?? t("common.notFound")}</span>
                  <code>{session.lastRequestAt ?? "none"}</code>
                  <button
                    className="inline-action"
                    data-testid={`session-runtime-view-detail-${session.sessionId}`}
                    type="button"
                    disabled={isWorking}
                    onClick={() => refreshSessionRuntimeDetail(session.sessionId)}
                  >
                    {t("dashboard.contextRuntime.viewDetail")}
                  </button>
                  <button className="inline-action" type="button" disabled={isWorking} onClick={() => focusSessionLogs(session.sessionId)}>
                    {t("dashboard.contextRuntime.openLogs")}
                  </button>
                  <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditSession(session.sessionId)}>
                    {locale === "zh-CN" ? "编辑会话" : "Edit Session"}
                  </button>
                </div>
              </div>
            )}
          />
        </div>
      </article>

      {selectedWorkspaceRuntimeDetail ? (
        <article
          className="panel"
          data-testid={`workspace-runtime-detail-${selectedWorkspaceRuntimeDetail.summary.workspaceId}`}
        >
          <h2>{t("dashboard.contextRuntime.workspaceDetailTitle")}</h2>
          <div className="list">
            <div className="list-row">
              <div>
                <strong>{selectedWorkspaceRuntimeDetail.summary.workspaceName}</strong>
                <p>{selectedWorkspaceRuntimeDetail.summary.rootPath}</p>
                <p>{t("dashboard.contextRuntime.requests")}: {formatNumber(selectedWorkspaceRuntimeDetail.summary.requestCount)} / {t("dashboard.contextRuntime.errors")}: {formatNumber(selectedWorkspaceRuntimeDetail.summary.errorCount)} / {t("dashboard.contextRuntime.tokens")}: {formatNumber(selectedWorkspaceRuntimeDetail.summary.totalTokens)}</p>
                <p>{t("dashboard.contextRuntime.activeState")}: {selectedWorkspaceRuntimeDetail.isActive ? t("dashboard.contextRuntime.active") : t("dashboard.contextRuntime.inactive")}</p>
                <p data-testid={`workspace-runtime-effective-provider-${selectedWorkspaceRuntimeDetail.summary.workspaceId}`}>
                  {t("dashboard.contextRuntime.effectiveProvider")}: {selectedWorkspaceRuntimeDetail.resolvedContext.provider.id ?? t("common.notFound")}
                </p>
                <p data-testid={`workspace-runtime-effective-prompt-${selectedWorkspaceRuntimeDetail.summary.workspaceId}`}>
                  {t("dashboard.workspace.effectivePrompt")}: {selectedWorkspaceRuntimeDetail.resolvedContext.promptTemplate.id ?? t("common.notFound")}
                </p>
                <p data-testid={`workspace-runtime-effective-skill-${selectedWorkspaceRuntimeDetail.summary.workspaceId}`}>
                  {t("dashboard.workspace.effectiveSkill")}: {selectedWorkspaceRuntimeDetail.resolvedContext.skill.id ?? t("common.notFound")}
                </p>
              </div>
              <div className="row-meta">
                <button
                  className="inline-action"
                  data-testid={`workspace-runtime-activate-${selectedWorkspaceRuntimeDetail.summary.workspaceId}`}
                  type="button"
                  disabled={isWorking || selectedWorkspaceRuntimeDetail.isActive}
                  onClick={() => onActivateWorkspace(selectedWorkspaceRuntimeDetail.summary.workspaceId)}
                >
                  {t("dashboard.workspace.activateAction")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditWorkspace(selectedWorkspaceRuntimeDetail.summary.workspaceId)}>
                  {locale === "zh-CN" ? "编辑工作区" : "Edit Workspace"}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={closeWorkspaceRuntimeDetail}>
                  {t("dashboard.contextRuntime.closeDetail")}
                </button>
              </div>
            </div>
            {workspaceRepairPlan ? (
              <div className="governance-notice governance-medium">
                <div className="governance-notice-header">
                  <strong>{localize(locale, "工作区最近主因", "Workspace Dominant Cause")}</strong>
                  <span className="governance-notice-badge">{workspaceRepairPlan.dominantReasonLabel}</span>
                </div>
                <ul className="governance-suggestion-list">
                  <li>{workspaceRepairPlan.summary}</li>
                  {workspaceRepairPlan.suggestions.map((item) => (
                    <li key={`workspace-repair-${item}`}>{item}</li>
                  ))}
                </ul>
                <div className="quick-action-row">
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => focusWorkspaceLogs(selectedWorkspaceRuntimeDetail.summary.workspaceId)}
                  >
                    {localize(locale, "聚焦工作区日志", "Focus Workspace Logs")}
                  </button>
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => applyAuditFilter({
                      source: "proxy-request",
                      appCode: selectedWorkspaceRuntimeDetail.summary.appCode ?? "",
                      level: "error"
                    })}
                  >
                    {localize(locale, "筛选请求审计", "Filter Request Audit")}
                  </button>
                  {selectedWorkspaceRuntimeDetail.resolvedContext.provider.id ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => refreshProviderDiagnosticDetail(selectedWorkspaceRuntimeDetail.resolvedContext.provider.id as string)}
                    >
                      {localize(locale, "打开有效 Provider", "Open Effective Provider")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.providerBreakdown")}</strong>
                {selectedWorkspaceRuntimeDetail.providerBreakdown.map((item) => (
                  <p key={`workspace-provider-${selectedWorkspaceRuntimeDetail.summary.workspaceId}-${item.providerId ?? "none"}`}>{item.providerId ?? t("common.notFound")} / {formatNumber(item.requestCount)} / {formatNumber(item.errorCount)} / {formatNumber(item.totalTokens)}</p>
                ))}
              </div>
            </div>
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.failureBreakdown")}</strong>
                {selectedWorkspaceRuntimeDetail.failureBreakdown.length === 0 ? (
                  <p>{t("dashboard.contextRuntime.noFailures")}</p>
                ) : (
                  selectedWorkspaceRuntimeDetail.failureBreakdown.map((item) => (
                    <p key={`workspace-failure-${selectedWorkspaceRuntimeDetail.summary.workspaceId}-${item.label}`}>{item.label} / {formatNumber(item.count)} / {item.lastSeenAt ?? "none"}</p>
                  ))
                )}
              </div>
            </div>
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.modelBreakdown")}</strong>
                {selectedWorkspaceRuntimeDetail.modelBreakdown.length === 0 ? (
                  <p>{t("dashboard.contextRuntime.noUsage")}</p>
                ) : (
                  selectedWorkspaceRuntimeDetail.modelBreakdown.map((item) => (
                    <p key={`workspace-model-${selectedWorkspaceRuntimeDetail.summary.workspaceId}-${item.model}`}>{item.model} / {formatNumber(item.requestCount)} / {formatNumber(item.totalTokens)}</p>
                  ))
                )}
              </div>
            </div>
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.timelineTitle")}</strong>
                {selectedWorkspaceRuntimeDetail.timeline.length === 0 ? (
                  <p>{t("dashboard.contextRuntime.timelineEmpty")}</p>
                ) : (
                  selectedWorkspaceRuntimeDetail.timeline.map((item) => (
                    <p key={`workspace-timeline-${selectedWorkspaceRuntimeDetail.summary.workspaceId}-${item.id}`}>
                      [{formatDateTime(item.createdAt)}] {renderContextTimelineSource(item.source, t)} / {item.title} / {item.summary}
                      {item.providerId ? ` / ${t("dashboard.contextRuntime.timelineProvider")}: ${item.providerId}` : ""}
                      {item.providerId ? " " : ""}
                      {item.providerId ? (
                        <button className="inline-action" type="button" disabled={isWorking} onClick={() => refreshProviderDiagnosticDetail(item.providerId as string)}>
                          {t("dashboard.contextRuntime.timelineOpenProvider")}
                        </button>
                      ) : null}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </article>
      ) : null}

      {selectedSessionRuntimeDetail ? (
        <article
          className="panel"
          data-testid={`session-runtime-detail-${selectedSessionRuntimeDetail.summary.sessionId}`}
        >
          <h2>{t("dashboard.contextRuntime.sessionDetailTitle")}</h2>
          <div className="list">
            <div className="list-row">
              <div>
                <strong>{selectedSessionRuntimeDetail.summary.title}</strong>
                <p>{selectedSessionRuntimeDetail.summary.cwd}</p>
                <p>{t("dashboard.contextRuntime.requests")}: {formatNumber(selectedSessionRuntimeDetail.summary.requestCount)} / {t("dashboard.contextRuntime.errors")}: {formatNumber(selectedSessionRuntimeDetail.summary.errorCount)} / {t("dashboard.contextRuntime.tokens")}: {formatNumber(selectedSessionRuntimeDetail.summary.totalTokens)}</p>
                <p>{t("dashboard.contextRuntime.activeState")}: {selectedSessionRuntimeDetail.isActive ? t("dashboard.contextRuntime.active") : t("dashboard.contextRuntime.inactive")} / {selectedSessionRuntimeDetail.isStale ? t("dashboard.contextRuntime.stale") : t("dashboard.contextRuntime.fresh")}</p>
                <p data-testid={`session-runtime-effective-provider-${selectedSessionRuntimeDetail.summary.sessionId}`}>
                  {t("dashboard.contextRuntime.effectiveProvider")}: {selectedSessionRuntimeDetail.resolvedContext.provider.id ?? t("common.notFound")}
                </p>
                <p data-testid={`session-runtime-effective-prompt-${selectedSessionRuntimeDetail.summary.sessionId}`}>
                  {t("dashboard.workspace.effectivePrompt")}: {selectedSessionRuntimeDetail.resolvedContext.promptTemplate.id ?? t("common.notFound")}
                </p>
                <p data-testid={`session-runtime-effective-skill-${selectedSessionRuntimeDetail.summary.sessionId}`}>
                  {t("dashboard.workspace.effectiveSkill")}: {selectedSessionRuntimeDetail.resolvedContext.skill.id ?? t("common.notFound")}
                </p>
              </div>
              <div className="row-meta">
                <button
                  className="inline-action"
                  data-testid={`session-runtime-activate-${selectedSessionRuntimeDetail.summary.sessionId}`}
                  type="button"
                  disabled={isWorking || selectedSessionRuntimeDetail.isActive || selectedSessionRuntimeDetail.summary.status !== "active"}
                  onClick={() => onActivateSession(selectedSessionRuntimeDetail.summary.sessionId)}
                >
                  {t("dashboard.workspace.activateAction")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking || selectedSessionRuntimeDetail.summary.status !== "active"} onClick={() => onArchiveSession(selectedSessionRuntimeDetail.summary.sessionId)}>
                  {t("dashboard.workspace.archiveAction")}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditSession(selectedSessionRuntimeDetail.summary.sessionId)}>
                  {locale === "zh-CN" ? "编辑会话" : "Edit Session"}
                </button>
                <button className="inline-action" type="button" disabled={isWorking} onClick={closeSessionRuntimeDetail}>
                  {t("dashboard.contextRuntime.closeDetail")}
                </button>
              </div>
            </div>
            {sessionRepairPlan ? (
              <div className="governance-notice governance-medium">
                <div className="governance-notice-header">
                  <strong>{localize(locale, "会话最近主因", "Session Dominant Cause")}</strong>
                  <span className="governance-notice-badge">{sessionRepairPlan.dominantReasonLabel}</span>
                </div>
                <ul className="governance-suggestion-list">
                  <li>{sessionRepairPlan.summary}</li>
                  {sessionRepairPlan.suggestions.map((item) => (
                    <li key={`session-repair-${item}`}>{item}</li>
                  ))}
                </ul>
                <div className="quick-action-row">
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => focusSessionLogs(selectedSessionRuntimeDetail.summary.sessionId)}
                  >
                    {localize(locale, "聚焦会话日志", "Focus Session Logs")}
                  </button>
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => applyAuditFilter({
                      source: "proxy-request",
                      appCode: selectedSessionRuntimeDetail.summary.appCode,
                      level: "error"
                    })}
                  >
                    {localize(locale, "筛选请求审计", "Filter Request Audit")}
                  </button>
                  {selectedSessionRuntimeDetail.resolvedContext.provider.id ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => refreshProviderDiagnosticDetail(selectedSessionRuntimeDetail.resolvedContext.provider.id as string)}
                    >
                      {localize(locale, "打开有效 Provider", "Open Effective Provider")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.providerBreakdown")}</strong>
                {selectedSessionRuntimeDetail.providerBreakdown.map((item) => (
                  <p key={`session-provider-${selectedSessionRuntimeDetail.summary.sessionId}-${item.providerId ?? "none"}`}>{item.providerId ?? t("common.notFound")} / {formatNumber(item.requestCount)} / {formatNumber(item.errorCount)} / {formatNumber(item.totalTokens)}</p>
                ))}
              </div>
            </div>
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.failureBreakdown")}</strong>
                {selectedSessionRuntimeDetail.failureBreakdown.length === 0 ? (
                  <p>{t("dashboard.contextRuntime.noFailures")}</p>
                ) : (
                  selectedSessionRuntimeDetail.failureBreakdown.map((item) => (
                    <p key={`session-failure-${selectedSessionRuntimeDetail.summary.sessionId}-${item.label}`}>{item.label} / {formatNumber(item.count)} / {item.lastSeenAt ?? "none"}</p>
                  ))
                )}
              </div>
            </div>
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.modelBreakdown")}</strong>
                {selectedSessionRuntimeDetail.modelBreakdown.length === 0 ? (
                  <p>{t("dashboard.contextRuntime.noUsage")}</p>
                ) : (
                  selectedSessionRuntimeDetail.modelBreakdown.map((item) => (
                    <p key={`session-model-${selectedSessionRuntimeDetail.summary.sessionId}-${item.model}`}>{item.model} / {formatNumber(item.requestCount)} / {formatNumber(item.totalTokens)}</p>
                  ))
                )}
              </div>
            </div>
            <div className="list-row">
              <div>
                <strong>{t("dashboard.contextRuntime.timelineTitle")}</strong>
                {selectedSessionRuntimeDetail.timeline.length === 0 ? (
                  <p>{t("dashboard.contextRuntime.timelineEmpty")}</p>
                ) : (
                  selectedSessionRuntimeDetail.timeline.map((item) => (
                    <p key={`session-timeline-${selectedSessionRuntimeDetail.summary.sessionId}-${item.id}`}>
                      [{formatDateTime(item.createdAt)}] {renderContextTimelineSource(item.source, t)} / {item.title} / {item.summary}
                      {item.providerId ? ` / ${t("dashboard.contextRuntime.timelineProvider")}: ${item.providerId}` : ""}
                      {item.providerId ? " " : ""}
                      {item.providerId ? (
                        <button className="inline-action" type="button" disabled={isWorking} onClick={() => refreshProviderDiagnosticDetail(item.providerId as string)}>
                          {t("dashboard.contextRuntime.timelineOpenProvider")}
                        </button>
                      ) : null}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        </article>
      ) : null}

      <article className="panel">
        <h2>{t("dashboard.panels.hostIntegrationEvents")}</h2>
        <div className="list">
          {snapshot.hostIntegrationEvents.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.discovery.noEvents")}</strong>
                <p>{t("dashboard.discovery.noEventsHint")}</p>
              </div>
            </div>
          ) : (
            <ProgressiveList
              items={snapshot.hostIntegrationEvents}
              locale={locale}
              initialVisibleCount={12}
              step={12}
              totalCount={snapshot.hostIntegrationEvents.length}
              renderItem={(event) => (
                <div className="list-row" key={event.id}>
                  <div>
                    <strong>{event.appCode} / {event.action}</strong>
                    <p>{event.message}</p>
                  </div>
                  <div className="row-meta">
                    <span>{event.integrationState}</span>
                    <code>{event.createdAt}</code>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyAuditFilter({ source: "host-integration", appCode: event.appCode })}>
                      {locale === "zh-CN" ? "筛选同类事件" : "Filter Events"}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditBinding(event.appCode)}>
                      {locale === "zh-CN" ? "编辑 Binding" : "Edit Binding"}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                      {locale === "zh-CN" ? "路由修复" : "Routing Repair"}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenMcpForms}>
                      {locale === "zh-CN" ? "MCP 修复" : "MCP Repair"}
                    </button>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </article>

      <article className="panel">
        <h2>{t("dashboard.panels.providerHealthEvents")}</h2>
        <div className="list">
          {snapshot.proxyRuntime.providerHealthEvents.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.runtime.noProbeEvents")}</strong>
                <p>{t("dashboard.runtime.noProbeEventsHint")}</p>
              </div>
            </div>
          ) : (
            <ProgressiveList
              items={snapshot.proxyRuntime.providerHealthEvents}
              locale={locale}
              initialVisibleCount={12}
              step={12}
              totalCount={snapshot.proxyRuntime.providerHealthEvents.length}
              renderItem={(event) => (
                <div className="list-row" key={event.id}>
                  <div>
                    <strong>{event.providerId} / {event.status}</strong>
                    <p>{event.trigger} / {event.message}</p>
                  </div>
                  <div className="row-meta">
                    <span>{event.statusCode ?? "n/a"}</span>
                    <code>{event.createdAt}</code>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyAuditFilter({ source: "provider-health", providerId: event.providerId })}>
                      {locale === "zh-CN" ? "筛选同类事件" : "Filter Events"}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditProvider(event.providerId)}>
                      {locale === "zh-CN" ? "编辑 Provider" : "Edit Provider"}
                    </button>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </article>

      <article className="panel panel-span-2">
        <h2>{t("dashboard.panels.auditEvents")}</h2>
        <div className="request-log-toolbar">
          <select
            data-testid="audit-filter-source"
            value={auditFilters.source}
            onChange={(event) => setAuditFilters((current) => ({ ...current, source: event.target.value, offset: 0 }))}
          >
            <option value="">{t("dashboard.audit.filterSource")}</option>
            <option value="host-integration">{renderAuditSource("host-integration", t)}</option>
            <option value="provider-health">{renderAuditSource("provider-health", t)}</option>
            <option value="proxy-request">{renderAuditSource("proxy-request", t)}</option>
            <option value="mcp">{renderAuditSource("mcp", t)}</option>
            <option value="config-snapshot">{renderAuditSource("config-snapshot", t)}</option>
            <option value="quota">{renderAuditSource("quota", t)}</option>
          </select>
          <select
            data-testid="audit-filter-app"
            value={auditFilters.appCode}
            onChange={(event) => setAuditFilters((current) => ({ ...current, appCode: event.target.value, offset: 0 }))}
          >
            <option value="">{t("dashboard.requestLogs.filterApp")}</option>
            <option value="codex">codex</option>
            <option value="claude-code">claude-code</option>
            <option value="gemini-cli">gemini-cli</option>
            <option value="opencode">opencode</option>
            <option value="openclaw">openclaw</option>
          </select>
          <input value={auditFilters.providerId} onChange={(event) => setAuditFilters((current) => ({ ...current, providerId: event.target.value, offset: 0 }))} placeholder={t("dashboard.requestLogs.filterProvider")} />
          <select value={auditFilters.level} onChange={(event) => setAuditFilters((current) => ({ ...current, level: event.target.value, offset: 0 }))}>
            <option value="">{t("dashboard.audit.filterLevel")}</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <select value={auditFilters.limit} onChange={(event) => setAuditFilters((current) => ({ ...current, limit: Number(event.target.value), offset: 0 }))}>
            <option value={10}>{t("dashboard.requestLogs.filterLimit")}: 10</option>
            <option value={20}>{t("dashboard.requestLogs.filterLimit")}: 20</option>
            <option value={50}>{t("dashboard.requestLogs.filterLimit")}: 50</option>
          </select>
          <button className="inline-action" type="button" disabled={isWorking} onClick={() => refreshAuditEvents()}>
            {t("common.refresh")}
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => {
              const nextFilters: AuditFilters = {
                source: "",
                appCode: "",
                providerId: "",
                level: "",
                limit: 20,
                offset: 0
              };
              setAuditFilters(nextFilters);
              refreshAuditEvents(nextFilters);
            }}
          >
            {t("dashboard.audit.clear")}
          </button>
        </div>
        <div className="request-log-meta">
          <span>{t("dashboard.audit.total")}: {auditEventPage?.total ?? 0}</span>
        </div>
        <div className="audit-timeline quota-timeline">
          <strong>{t("dashboard.audit.quotaTimelineTitle")}</strong>
          {quotaAuditItems.length === 0 ? (
            <p>{t("dashboard.audit.quotaTimelineEmpty")}</p>
          ) : (
            <div className="audit-timeline-list">
              <ProgressiveList
                items={quotaAuditItems}
                locale={locale}
                initialVisibleCount={10}
                step={10}
                renderItem={(event) => (
                  <div className="audit-timeline-item" key={`quota-${event.id}`}>
                    <div className="audit-timeline-time">
                      <code>{event.createdAt}</code>
                    </div>
                    <div className="audit-timeline-body">
                      <div className="audit-timeline-header">
                        <span className={`audit-badge level-${event.level}`}>{event.status ?? "quota"}</span>
                        <span>{t("dashboard.audit.mcpTimelineApp")}: {event.appCode ?? t("common.notFound")}</span>
                        <span>{t("dashboard.quota.currentUsage")}: {event.metadata.requestsUsed ?? "0"} / {event.metadata.tokensUsed ?? "0"}</span>
                      </div>
                      <p>{event.summary}</p>
                      {event.appCode ? (
                        <div className="quick-action-row">
                          <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyAuditFilter({ source: "quota", appCode: event.appCode as string })}>
                            {locale === "zh-CN" ? "筛选配额事件" : "Filter Quota Events"}
                          </button>
                          <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditBinding(event.appCode as string)}>
                            {locale === "zh-CN" ? "编辑 Binding" : "Edit Binding"}
                          </button>
                          <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                            {locale === "zh-CN" ? "打开配额修复" : "Open Quota Repair"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              />
            </div>
          )}
        </div>
        <div className="audit-timeline">
          <strong>{t("dashboard.audit.mcpTimelineTitle")}</strong>
          {mcpAuditItems.length === 0 ? (
            <p>{t("dashboard.audit.mcpTimelineEmpty")}</p>
          ) : (
            <div className="audit-timeline-list">
              <ProgressiveList
                items={mcpAuditItems}
                locale={locale}
                initialVisibleCount={10}
                step={10}
                renderItem={(event) => (
                  <div className="audit-timeline-item" key={`timeline-${event.id}`}>
                    <div className="audit-timeline-time">
                      <code>{event.createdAt}</code>
                    </div>
                    <div className="audit-timeline-body">
                      <div className="audit-timeline-header">
                        <span className={`audit-badge level-${event.level}`}>{renderMcpAuditAction(event.status, t)}</span>
                        <span>{t("dashboard.audit.mcpTimelineTarget")}: {renderMcpAuditTargetType(event.metadata.targetType, t)} / <code>{event.metadata.targetId ?? t("common.notFound")}</code></span>
                        <span>{t("dashboard.audit.mcpTimelineApp")}: {event.appCode ?? t("common.notFound")}</span>
                      </div>
                      <p>{event.summary}</p>
                      <div className="quick-action-row">
                        <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyAuditFilter({
                          source: "mcp",
                          appCode: event.appCode ?? "",
                          providerId: ""
                        })}>
                          {locale === "zh-CN" ? "筛选 MCP 事件" : "Filter MCP Events"}
                        </button>
                        {event.metadata.targetType === "server" && event.metadata.targetId ? (
                          <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditMcpServer(event.metadata.targetId as string)}>
                            {locale === "zh-CN" ? "编辑 MCP Server" : "Edit MCP Server"}
                          </button>
                        ) : null}
                        {event.metadata.targetType === "binding" && event.metadata.targetId ? (
                          <button className="inline-action" type="button" disabled={isWorking} onClick={() => onEditMcpBinding(event.metadata.targetId as string)}>
                            {locale === "zh-CN" ? "编辑 MCP Binding" : "Edit MCP Binding"}
                          </button>
                        ) : null}
                        <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenMcpForms}>
                          {locale === "zh-CN" ? "打开 MCP 修复" : "Open MCP Repair"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              />
            </div>
          )}
        </div>
        <div className="list">
          {(auditEventPage?.items ?? []).length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.auditEvents")}</strong>
                <p>{t("dashboard.audit.empty")}</p>
              </div>
            </div>
          ) : (
            <ProgressiveList
              items={auditEventPage?.items ?? []}
              locale={locale}
              initialVisibleCount={15}
              step={15}
              totalCount={auditEventPage?.total ?? 0}
              renderItem={(event) => (
                <div className="list-row" key={event.id}>
                  <div>
                    <strong>{renderAuditSource(event.source, t)} / {event.title}</strong>
                    <p>{event.summary}</p>
                    <p>
                      {event.appCode ?? "no-app"} / {event.providerId ?? "no-provider"} / {event.metadata.workspaceId ?? "no-workspace"} / {event.metadata.sessionId ?? "no-session"}
                    </p>
                    {event.source === "proxy-request" ? (
                      <p>
                        {localize(locale, "决策", "Decision")}:{" "}
                        {renderRequestDecisionReason(
                          locale,
                          (event.metadata.decisionReason as ProviderDiagnosticDetail["recentRequestLogs"][number]["decisionReason"]) ?? null
                        )}
                        {event.metadata.nextProviderId ? ` -> ${event.metadata.nextProviderId}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="row-meta">
                    <span className={`audit-badge level-${event.level}`}>{event.level} / {event.status ?? "n/a"}</span>
                    <code>{event.createdAt}</code>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => applyAuditFilter({
                      source: event.source,
                      appCode: event.appCode ?? "",
                      providerId: event.providerId ?? ""
                    })}>
                      {locale === "zh-CN" ? "筛选同类事件" : "Filter Similar"}
                    </button>
                    <button className="inline-action" type="button" disabled={isWorking} onClick={() => editAuditEventTarget(event)}>
                      {locale === "zh-CN" ? "定位对象" : "Open Target"}
                    </button>
                    {event.source === "proxy-request" ? (
                      <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenAssetForms}>
                        {locale === "zh-CN" ? "上下文修复" : "Context Repair"}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            />
          )}
        </div>
        {auditEventPage !== null ? (
          <div className="request-log-pagination">
            <button className="inline-action" type="button" disabled={auditFilters.offset === 0} onClick={() => {
              const nextFilters = { ...auditFilters, offset: Math.max(0, auditFilters.offset - auditFilters.limit) };
              setAuditFilters(nextFilters);
              refreshAuditEvents(nextFilters);
            }}>
              {t("dashboard.audit.previous")}
            </button>
            <button className="inline-action" type="button" disabled={auditFilters.offset + auditFilters.limit >= auditEventPage.total} onClick={() => {
              const nextFilters = { ...auditFilters, offset: auditFilters.offset + auditFilters.limit };
              setAuditFilters(nextFilters);
              refreshAuditEvents(nextFilters);
            }}>
              {t("dashboard.audit.next")}
            </button>
          </div>
        ) : null}
      </article>

      <article className="panel">
        <h2>{t("dashboard.runtimeTitle")}</h2>
        <div className="list">
          <div className="list-row">
            <div>
              <strong>releaseStage</strong>
              <p>{snapshot.metadata.releaseStage}</p>
            </div>
            <div className="row-meta">
              <span>repositoryMode</span>
              <code>{snapshot.metadata.repositoryMode}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>daemon</strong>
              <p>
                {snapshot.runtime.daemonHost}:{snapshot.runtime.daemonPort}
              </p>
            </div>
            <div className="row-meta">
              <span>runMode</span>
              <code>{snapshot.runtime.runMode}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>healthProbe</strong>
              <p>{snapshot.runtime.healthProbeIntervalMs}ms</p>
            </div>
            <div className="row-meta">
              <span>latestSnapshot</span>
              <code>{snapshot.runtime.latestSnapshotVersion ?? "none"}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>dataDir</strong>
              <p>{snapshot.runtime.dataDir}</p>
            </div>
            <div className="row-meta">
              <span>controlUi</span>
              <code>{snapshot.metadata.webConsole.mountPath}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>dbPath</strong>
              <p>{snapshot.runtime.dbPath}</p>
            </div>
            <div className="row-meta">
              <span>allowAnyOrigin</span>
              <code>{snapshot.runtime.allowAnyOrigin ? "true" : "false"}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>allowedOrigins</strong>
              <p>{snapshot.runtime.allowedOrigins.join(", ")}</p>
            </div>
            <div className="row-meta">
              <span>{t("dashboard.runtime.proxySnapshot")}</span>
              <code>{snapshot.proxyRuntime.snapshotVersion ?? "none"}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>proxyPolicy</strong>
              <p>{snapshot.proxyRuntime.policy.listenHost}:{snapshot.proxyRuntime.policy.listenPort}</p>
            </div>
            <div className="row-meta">
              <span>failureThreshold</span>
              <code>{snapshot.proxyRuntime.policy.failureThreshold}</code>
            </div>
          </div>
        </div>
      </article>

      <article className="panel">
        <h2>{localize(locale, "服务诊断", "Service Doctor")}</h2>
        <div className="list">
          <div className="list-row">
            <div>
              <strong>systemd</strong>
              <p>
                {snapshot.serviceDoctor.checks.systemd.available
                  ? localize(locale, "systemd --user 可用", "systemd --user available")
                  : localize(locale, "systemd --user 不可用", "systemd --user unavailable")}
              </p>
            </div>
            <div className="row-meta">
              <span>service</span>
              <code>{snapshot.serviceDoctor.service}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>unit</strong>
              <p>
                {snapshot.serviceDoctor.checks.files.unitExists
                  ? snapshot.serviceDoctor.checks.files.unitPath
                  : localize(locale, "尚未安装 user service", "User service is not installed")}
              </p>
            </div>
            <div className="row-meta">
              <span>active</span>
              <code>{snapshot.serviceDoctor.checks.service.activeState ?? "inactive"}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>env</strong>
              <p>{snapshot.serviceDoctor.checks.files.envPath}</p>
            </div>
            <div className="row-meta">
              <span>envInSync</span>
              <code>{snapshot.serviceDoctor.checks.files.envInSync ? "true" : "false"}</code>
            </div>
          </div>
          <div className="list-row">
            <div>
              <strong>runtimeMatch</strong>
              <p>
                {snapshot.serviceDoctor.checks.runtime.daemonMatchesDesired
                  ? localize(locale, "当前 daemon 与期望服务配置一致", "Current daemon matches desired service configuration")
                  : localize(locale, "当前 daemon 与期望服务配置存在偏差", "Current daemon differs from desired service configuration")}
              </p>
            </div>
            <div className="row-meta">
              <span>fallback</span>
              <code>{snapshot.serviceDoctor.fallback}</code>
            </div>
          </div>
        </div>

        <div className="quick-action-row">
          <button className="inline-action" type="button" disabled={isWorking} onClick={onSyncServiceEnv}>
            {localize(locale, "同步服务环境文件", "Sync Service Env")}
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking || !snapshot.serviceDoctor.checks.systemd.available}
            onClick={onInstallSystemService}
          >
            {localize(locale, "安装 User Service", "Install User Service")}
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => applyAuditFilter({ source: "system-service", appCode: "", providerId: "", level: "" })}
          >
            {localize(locale, "查看服务审计", "Open Service Audit")}
          </button>
        </div>

        <GovernanceNoticeCard
          locale={locale}
          notice={{
            level:
              !snapshot.serviceDoctor.checks.systemd.available ||
              !snapshot.serviceDoctor.checks.files.envInSync ||
              !snapshot.serviceDoctor.checks.runtime.daemonMatchesDesired
                ? "high"
                : !snapshot.serviceDoctor.checks.service.active
                  ? "medium"
                  : "low",
            summary:
              !snapshot.serviceDoctor.checks.systemd.available
                ? localize(
                    locale,
                    "当前宿主机无法使用 systemd --user，服务化托管不可用，只能前台运行或迁移到支持 systemd 的 Linux 环境。",
                    "This host cannot use systemd --user, so managed background service mode is unavailable. Use foreground mode or move to a Linux host with systemd."
                  )
                : !snapshot.serviceDoctor.checks.files.envInSync
                  ? localize(
                      locale,
                      "systemd 环境文件与当前 daemon 设置不一致，后续重启服务可能加载旧配置。",
                      "The systemd environment file is drifting from the current daemon settings, so future restarts may load stale configuration."
                    )
                  : !snapshot.serviceDoctor.checks.runtime.daemonMatchesDesired
                    ? localize(
                        locale,
                        "当前 daemon 运行参数与期望服务配置不一致，建议先对齐运行模式与路径配置。",
                        "The current daemon runtime differs from the desired service configuration. Align run mode and storage paths first."
                      )
                    : localize(
                        locale,
                        "服务化配置与当前 daemon 运行状态已经基本对齐。",
                        "Service configuration and current daemon runtime are aligned."
                      ),
            suggestions: snapshot.serviceDoctor.checks.recommendedActions
          }}
        />

        {startupRecovery !== null ? (
          <div
            className={`governance-notice governance-${startupRecoveryLevel}`}
            data-testid="service-startup-recovery-notice"
          >
            <div className="governance-notice-header">
              <strong>{localize(locale, "启动自动恢复", "Startup Auto-Recovery")}</strong>
              <span className="governance-notice-badge">
                {startupRecovery.failedApps.length === 0
                  ? localize(locale, "已恢复", "Recovered")
                  : localize(locale, "需人工复核", "Manual Review Needed")}
              </span>
            </div>
            <p>
              {startupRecovery.failedApps.length === 0
                ? localize(
                    locale,
                    `daemon 本次启动时已经自动回滚上次异常退出残留的临时宿主机接管：${startupRecovery.rolledBackApps.join(", ")}。`,
                    `During this startup, the daemon automatically rolled back stale temporary host takeovers left by the previous abnormal exit: ${startupRecovery.rolledBackApps.join(", ")}.`
                  )
                : localize(
                    locale,
                    `daemon 本次启动时已自动回滚 ${startupRecovery.rolledBackApps.length} 个残留临时接管，但 ${startupRecovery.failedApps.join(", ")} 仍需要人工检查宿主机配置与备份。`,
                    `During this startup, the daemon auto-rolled back ${startupRecovery.rolledBackApps.length} stale temporary takeover(s), but ${startupRecovery.failedApps.join(", ")} still requires manual host-config and backup review.`
                  )}
            </p>
            <ul className="governance-suggestion-list">
              <li>
                {localize(locale, "执行时间", "Executed At")}:{" "}
                <code>{startupRecovery.executedAt.replace("T", " ").replace(".000Z", "Z")}</code>
              </li>
              <li>
                {localize(locale, "已恢复应用", "Recovered Apps")}:{" "}
                <code>{startupRecovery.rolledBackApps.join(", ") || "none"}</code>
              </li>
              <li>
                {startupRecovery.failedApps.length === 0
                  ? localize(
                      locale,
                      "下一步只需要做一次真实 CLI 请求，确认临时接管已经彻底退出，流量回到当前期望链路。",
                      "Next, trigger one real CLI request to confirm the temporary takeover has fully exited and traffic is back on the intended path."
                    )
                  : localize(
                      locale,
                      "先打开宿主机审计，再逐个核查失败应用的配置文件、备份文件和 shell 环境残留。",
                      "Open host audit first, then inspect each failed app for config files, backup files, and shell-level residue."
                    )}
              </li>
            </ul>
            <div className="quick-action-row">
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() =>
                  applyAuditFilter({
                    source: "host-integration",
                    appCode: "",
                    providerId: "",
                    level: ""
                  })
                }
              >
                {localize(locale, "查看宿主机审计", "Open Host Audit")}
              </button>
              {startupRecovery.rolledBackApps.length === 1 ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onOpenAppTraffic(startupRecovery.rolledBackApps[0]!)}
                >
                  {localize(locale, "查看该应用流量", "Open App Traffic")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="note-block">
          <strong>{localize(locale, "Prometheus 导出", "Prometheus Export")}</strong>
          <p>
            {localize(
              locale,
              "daemon 已暴露 Prometheus 文本格式指标，可直接交给本机或旁路采集器抓取。",
              "The daemon now exposes Prometheus text-format metrics, ready for local or sidecar scraping."
            )}
          </p>
          <p>
            <code>{metricsUrl}</code>
          </p>
          <ul className="governance-suggestion-list">
            <li>
              {localize(
                locale,
                "接入前先确认抓取端看到的是 daemon 实际地址，而不是前端开发服务器地址。",
                "Before scraping, confirm the collector reaches the real daemon address instead of a frontend dev server."
              )}
            </li>
            <li>
              {localize(
                locale,
                "当前 /metrics 不走控制台登录态，生产交付时应放在可信网络或反向代理 ACL 后面。",
                "The current /metrics endpoint is not protected by console login state, so production delivery should keep it inside a trusted network boundary or behind reverse-proxy ACLs."
              )}
            </li>
            <li>
              {localize(
                locale,
                "建议把 proxy runtime、provider diagnosis、MCP drift 和 latest snapshot version 作为首批告警指标。",
                "A practical first alert set is proxy runtime, provider diagnosis, MCP drift, and latest snapshot version."
              )}
            </li>
          </ul>
          <div className="quick-action-row">
            <a className="inline-action" href={metricsUrl} target="_blank" rel="noreferrer">
              {localize(locale, "打开 /metrics", "Open /metrics")}
            </a>
            <button
              className="inline-action"
              type="button"
              disabled={isWorking}
              onClick={() =>
                applyAuditFilter({
                  source: "system-service",
                  appCode: "",
                  providerId: "",
                  level: ""
                })
              }
            >
              {localize(locale, "查看服务审计", "Open Service Audit")}
            </button>
          </div>
        </div>

        {takeoverEntries.length > 0 ? (
          <div className="note-block">
            <strong>{localize(locale, "接管闭环验证", "Takeover Verification Loop")}</strong>
            <div className="traffic-governance-stack">
              {takeoverEntries.slice(0, 5).map((entry) => (
                <div
                  className={`governance-notice governance-${entry.level}`}
                  key={`runtime-takeover-${entry.appCode}`}
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
                    {entry.degradedProviderIds.length > 0 ? (
                      <li>
                        {localize(locale, "受影响 Provider", "Affected Providers")}: {entry.degradedProviderIds.join(", ")}
                      </li>
                    ) : null}
                    {entry.recentEventSummary ? (
                      <li>
                        {localize(locale, "最近接管事件", "Recent Takeover Event")}: {entry.recentEventSummary}
                      </li>
                    ) : null}
                  </ul>
                  <div className="quick-action-row">
                    {entry.recommendedActions.slice(0, 3).map((action) => (
                      <button
                        className="inline-action"
                        type="button"
                        key={`runtime-takeover-action-${entry.appCode}-${action}`}
                        disabled={isWorking}
                        onClick={() => runTakeoverAction(entry.appCode, action)}
                      >
                        {renderTakeoverActionLabel(action)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {snapshot.serviceDoctor.checks.files.envDiff.length > 0 ? (
          <div className="note-block">
            <strong>{localize(locale, "环境文件漂移", "Environment Drift")}</strong>
            <ul className="governance-suggestion-list">
              {snapshot.serviceDoctor.checks.files.envDiff.map((item: DashboardSnapshot["serviceDoctor"]["checks"]["files"]["envDiff"][number]) => (
                <li key={`env-${item.key}`}>
                  <code>{item.key}</code>
                  {": "}
                  {localize(locale, "期望", "desired")} <code>{item.desired ?? "null"}</code>
                  {" / "}
                  {localize(locale, "实际", "actual")} <code>{item.actual ?? "null"}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {snapshot.serviceDoctor.checks.runtime.differences.length > 0 ? (
          <div className="note-block">
            <strong>{localize(locale, "运行态偏差", "Runtime Drift")}</strong>
            <ul className="governance-suggestion-list">
              {snapshot.serviceDoctor.checks.runtime.differences.map((item: DashboardSnapshot["serviceDoctor"]["checks"]["runtime"]["differences"][number]) => (
                <li key={`runtime-${item.field}`}>
                  <code>{item.field}</code>
                  {": "}
                  {localize(locale, "期望", "desired")} <code>{String(item.desired)}</code>
                  {" / "}
                  {localize(locale, "实际", "actual")} <code>{String(item.actual)}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="note-block">
          <strong>{localize(locale, "校验清单", "Validation Checklist")}</strong>
          <ul className="governance-suggestion-list">
            {buildServiceValidationChecklist(snapshot, locale).map((item) => (
              <li key={`service-validation-${item}`}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="note-block">
          <strong>{localize(locale, "恢复步骤", "Recovery Runbook")}</strong>
          <ul className="governance-suggestion-list">
            {buildServiceRecoveryRunbook(snapshot, locale).map((item) => (
              <li key={`service-runbook-${item}`}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="note-block">
          <strong>{localize(locale, "最近服务动作", "Recent Service Actions")}</strong>
          {(snapshot.serviceAuditEvents.length === 0) ? (
            <p>{localize(locale, "暂时还没有服务治理动作记录。", "No service governance actions have been recorded yet.")}</p>
          ) : (
            <div className="preview-item-list">
              <ProgressiveList
                items={snapshot.serviceAuditEvents}
                locale={locale}
                initialVisibleCount={10}
                step={10}
                totalCount={snapshot.serviceAuditEvents.length}
                renderItem={(event) => (
                  <div className="preview-item" key={event.id}>
                    <strong>{event.title}</strong>
                    <p>{event.summary}</p>
                    <p>{event.status ?? "unknown"} / {event.createdAt.replace("T", " ").replace(".000Z", "Z")}</p>
                  </div>
                )}
              />
            </div>
          )}
        </div>
      </article>
    </>
  );
};
