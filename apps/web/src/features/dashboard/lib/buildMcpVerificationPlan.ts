import type {
  AppCode,
  LocaleCode,
  McpGovernanceRepairPreview,
  McpHostSyncPreview
} from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import {
  buildRequestPrimaryCause,
  renderRoutingPrimaryCauseLabel
} from "./buildRoutingPrimaryCause.js";
import { buildTrafficTakeoverEntries } from "./buildTrafficTakeoverEntries.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const uniqueStrings = (items: readonly string[]): string[] => Array.from(new Set(items));

const parseTimestamp = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const pickLatestTimestamp = (values: readonly (string | null | undefined)[]): string | null => {
  let latestValue: string | null = null;
  let latestEpoch: number | null = null;

  for (const value of values) {
    const epoch = parseTimestamp(value);
    if (epoch === null) {
      continue;
    }
    if (latestEpoch === null || epoch > latestEpoch) {
      latestEpoch = epoch;
      latestValue = value ?? null;
    }
  }

  return latestValue;
};

const isOnOrAfter = (value: string | null | undefined, baseline: string | null): boolean => {
  const valueEpoch = parseTimestamp(value);
  if (valueEpoch === null) {
    return false;
  }
  const baselineEpoch = parseTimestamp(baseline);
  if (baselineEpoch === null) {
    return true;
  }
  return valueEpoch >= baselineEpoch;
};

const hasHostSyncDiff = (preview: McpHostSyncPreview | null | undefined): boolean =>
  preview !== null &&
  preview !== undefined &&
  (preview.addedServerIds.length > 0 ||
    preview.removedServerIds.length > 0 ||
    (!preview.configExists && preview.nextManagedServerIds.length > 0));

const renderTakeoverState = (
  verificationState:
    | ReturnType<typeof buildTrafficTakeoverEntries>[number]["verificationState"]
    | null,
  locale: LocaleCode
): string => {
  if (verificationState === "managed-verified") {
    return localize(locale, "已验证", "Verified");
  }
  if (verificationState === "managed-failing") {
    return localize(locale, "验证失败", "Verification Failed");
  }
  if (verificationState === "managed-no-traffic") {
    return localize(locale, "待流量验证", "Needs Traffic");
  }
  if (verificationState === "not-managed") {
    return localize(locale, "未接管", "Not Managed");
  }
  return localize(locale, "未观测", "Not Observed");
};

const maxLevel = (
  levels: readonly ("low" | "medium" | "high")[]
): "low" | "medium" | "high" => {
  if (levels.includes("high")) {
    return "high";
  }
  if (levels.includes("medium")) {
    return "medium";
  }
  return "low";
};

export type McpVerificationCheckpoint = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly level: "low" | "medium" | "high";
};

export type McpVerificationStatus =
  | "verified"
  | "pending-runtime"
  | "pending-host-sync"
  | "pending-audit"
  | "pending-traffic"
  | "regressed";

export type McpVerificationPlan = {
  readonly appCode: AppCode;
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly verificationStatus: McpVerificationStatus;
  readonly verificationStatusLabel: string;
  readonly verificationStatusSummary: string;
  readonly verificationBaselineAt: string | null;
  readonly latestSuccessAt: string | null;
  readonly latestFailureAt: string | null;
  readonly checkpoints: readonly McpVerificationCheckpoint[];
  readonly nextActions: readonly string[];
  readonly hasRuntimeIssues: boolean;
  readonly needsHostSync: boolean;
  readonly needsTrafficVerification: boolean;
};

export type McpVerificationBatchSummary = {
  readonly totalApps: number;
  readonly stableApps: AppCode[];
  readonly highRiskApps: AppCode[];
  readonly verifiedApps: AppCode[];
  readonly regressedApps: AppCode[];
  readonly pendingRuntimeApps: AppCode[];
  readonly pendingAuditApps: AppCode[];
  readonly needsHostSyncApps: AppCode[];
  readonly needsTrafficVerificationApps: AppCode[];
  readonly summary: string;
  readonly suggestions: readonly string[];
};

export const isRelevantMcpAuditEvent = (
  snapshot: DashboardSnapshot,
  appCode: AppCode,
  item: DashboardSnapshot["initialAuditEventPage"]["items"][number]
): boolean => {
  if (item.source !== "mcp") {
    return false;
  }
  if (item.appCode === appCode) {
    return true;
  }
  if (item.appCode !== null && item.appCode !== appCode) {
    return false;
  }

  const targetType = item.metadata.targetType;
  const targetId = item.metadata.targetId;
  if (targetType === "host-sync") {
    return targetId === appCode;
  }
  if (targetType === "server") {
    return snapshot.appMcpBindings.some(
      (binding) => binding.appCode === appCode && binding.serverId === targetId
    );
  }
  if (targetType === "binding") {
    return snapshot.appMcpBindings.some(
      (binding) => binding.appCode === appCode && binding.id === targetId
    );
  }

  return false;
};

export const buildMcpVerificationPlan = ({
  snapshot,
  appCode,
  locale,
  governancePreview,
  hostPreview
}: {
  readonly snapshot: DashboardSnapshot;
  readonly appCode: AppCode;
  readonly locale: LocaleCode;
  readonly governancePreview?: McpGovernanceRepairPreview | null | undefined;
  readonly hostPreview?: McpHostSyncPreview | null | undefined;
}): McpVerificationPlan => {
  const runtimeView = snapshot.mcpRuntimeViews.find((item) => item.appCode === appCode) ?? null;
  const hostSyncState = snapshot.mcpHostSyncStates.find((item) => item.appCode === appCode) ?? null;
  const targetGovernancePreview = governancePreview ?? null;
  const targetHostPreview = hostPreview ?? null;
  const appLogs = snapshot.proxyRequestLogs.filter((item) => item.appCode === appCode);
  const trafficPrimaryCause = buildRequestPrimaryCause(appLogs, locale);
  const takeoverEntry =
    buildTrafficTakeoverEntries(snapshot, locale).find((item) => item.appCode === appCode) ?? null;
  const mcpAuditItems = snapshot.initialAuditEventPage.items.filter(
    (item) => isRelevantMcpAuditEvent(snapshot, appCode, item)
  );
  const latestAuditAt = pickLatestTimestamp(mcpAuditItems.map((item) => item.createdAt));
  const verificationBaselineAt = pickLatestTimestamp([
    runtimeView?.hostState.lastAppliedAt ?? null,
    hostSyncState?.lastAppliedAt ?? null,
    latestAuditAt
  ]);
  const latestRequestAt = pickLatestTimestamp(appLogs.map((item) => item.createdAt));
  const successLogs = appLogs.filter((item) => item.outcome === "success");
  const failureLogs = appLogs.filter((item) => item.outcome !== "success");
  const latestSuccessAt = pickLatestTimestamp(successLogs.map((item) => item.createdAt));
  const latestFailureAt = pickLatestTimestamp(failureLogs.map((item) => item.createdAt));
  const hasFreshRequestAfterBaseline = isOnOrAfter(latestRequestAt, verificationBaselineAt);
  const hasRecentSuccessAfterBaseline = isOnOrAfter(latestSuccessAt, verificationBaselineAt);
  const hasRecentFailureAfterBaseline = isOnOrAfter(latestFailureAt, verificationBaselineAt);
  const hasRecentAuditErrorAfterBaseline = mcpAuditItems.some(
    (item) => item.level === "error" && isOnOrAfter(item.createdAt, verificationBaselineAt)
  );
  const hasRecentAuditWarnAfterBaseline = mcpAuditItems.some(
    (item) => item.level === "warn" && isOnOrAfter(item.createdAt, verificationBaselineAt)
  );
  const errorAuditCount = mcpAuditItems.filter((item) => item.level === "error").length;
  const warningAuditCount = mcpAuditItems.filter((item) => item.level === "warn").length;
  const runtimeLevel: "low" | "medium" | "high" =
    runtimeView === null
      ? "medium"
      : runtimeView.status === "healthy" && runtimeView.hostState.drifted === false
        ? "low"
        : runtimeView.status === "warning" || runtimeView.hostState.drifted
          ? "medium"
          : "high";
  const runtimeIssuesLevel: "low" | "medium" | "high" =
    runtimeView === null
      ? "medium"
      : runtimeView.issueCodes.length === 0
        ? "low"
        : runtimeView.issueCodes.length >= 2
          ? "high"
          : "medium";
  const hostSyncPending =
    (targetGovernancePreview?.requiresHostSync ?? false) || hasHostSyncDiff(targetHostPreview);
  const hostSyncLevel: "low" | "medium" | "high" =
    runtimeView?.hostState.drifted || (targetHostPreview?.removedServerIds.length ?? 0) > 0
      ? "high"
      : hostSyncPending
        ? "medium"
        : "low";
  const auditLevel: "low" | "medium" | "high" =
    errorAuditCount > 0 ? "high" : warningAuditCount > 0 ? "medium" : "low";
  const trafficLevel: "low" | "medium" | "high" =
    takeoverEntry === null
      ? appLogs.length === 0
        ? "medium"
        : "low"
      : takeoverEntry.verificationState === "managed-verified"
        ? "low"
        : takeoverEntry.verificationState === "managed-failing"
          ? "high"
          : "medium";
  const level = maxLevel([
    runtimeLevel,
    runtimeIssuesLevel,
    hostSyncLevel,
    auditLevel,
    trafficLevel
  ]);
  const runtimeHealthy = runtimeLevel === "low" && runtimeIssuesLevel === "low";

  const verificationStatus: McpVerificationStatus =
    runtimeHealthy === false
      ? hasRecentFailureAfterBaseline || hasRecentAuditErrorAfterBaseline
        ? "regressed"
        : "pending-runtime"
      : hostSyncPending
        ? "pending-host-sync"
        : hasRecentAuditErrorAfterBaseline
          ? "regressed"
          : hasRecentAuditWarnAfterBaseline
            ? "pending-audit"
            : hasFreshRequestAfterBaseline && hasRecentSuccessAfterBaseline === false
              ? "regressed"
              : hasRecentSuccessAfterBaseline === false
                ? "pending-traffic"
                : "verified";

  const verificationStatusLabel =
    verificationStatus === "verified"
      ? localize(locale, "已验证", "Verified")
      : verificationStatus === "pending-runtime"
        ? localize(locale, "先收敛 Runtime", "Fix Runtime First")
        : verificationStatus === "pending-host-sync"
          ? localize(locale, "待宿主机确认", "Need Host Confirmation")
          : verificationStatus === "pending-audit"
            ? localize(locale, "待审计确认", "Need Audit Confirmation")
            : verificationStatus === "pending-traffic"
              ? localize(locale, "待真实请求验证", "Need Live Request Verification")
              : localize(locale, "存在回退风险", "Regression Risk");

  const verificationStatusSummary =
    verificationStatus === "verified"
      ? localize(
          locale,
          `${appCode} 最近一次治理基线后的 runtime、宿主机和真实请求都已重新通过，当前更像是观察回归窗口而不是继续修配置。`,
          `${appCode} has passed runtime, host, and live-request checks after the latest governance baseline. The task is now to watch for regression rather than keep editing config.`
        )
      : verificationStatus === "pending-runtime"
        ? localize(
            locale,
            `${appCode} 当前还有 MCP runtime 阻断项，闭环验证应先停在 runtime 层，不要急着把 attention 转到 host sync 或流量。`,
            `${appCode} still has MCP runtime blockers. Keep the closure loop at runtime first instead of moving attention to host sync or traffic.`
          )
        : verificationStatus === "pending-host-sync"
          ? localize(
              locale,
              `${appCode} 的控制台侧已经有改善，但最近治理基线后仍缺少宿主机收敛确认，apply / drift review 还不能跳过。`,
              `${appCode} is improving on the console side, but host convergence is still not confirmed after the latest governance baseline, so apply or drift review cannot be skipped yet.`
            )
          : verificationStatus === "pending-audit"
            ? localize(
                locale,
                `${appCode} 的 runtime 与宿主机基本在目标区间，但最近 MCP 审计仍有 warn，需要确认 repair / import / host sync 事件是否真正转稳。`,
                `${appCode} is near the target range in runtime and host state, but recent MCP audit still contains warnings. Confirm repair, import, and host-sync events are really settling down.`
              )
            : verificationStatus === "pending-traffic"
              ? verificationBaselineAt === null
                ? localize(
                    locale,
                    `${appCode} 当前还缺一次明确成功的真实请求验证，说明“配置看起来正常”和“链路真的跑通”之间还有最后一步没有完成。`,
                    `${appCode} still needs one explicit successful live request. There is still a final step between “config looks fine” and “the path actually works.”`
                  )
                : localize(
                    locale,
                    `${appCode} 最近治理基线后还没有新的成功请求，当前状态更像“待重验”而不是“已经闭环”。`,
                    `${appCode} has not seen a new successful request after the latest governance baseline, so the current state is closer to “needs re-verification” than “closed loop.”`
                  )
              : localize(
                  locale,
                  `${appCode} 最近治理基线后仍出现错误审计或失败请求，说明当前更需要防回退，而不是把修复视为已经完成。`,
                  `${appCode} is still seeing error audits or failed requests after the latest governance baseline, which means the focus should be regression prevention rather than treating the repair as complete.`
                );

  const checkpoints: McpVerificationCheckpoint[] = [
    {
      id: `${appCode}-runtime`,
      label: localize(locale, "MCP 运行态", "MCP Runtime"),
      value:
        runtimeView === null
          ? localize(locale, "未观测", "Not Observed")
          : `${runtimeView.status}${runtimeView.hostState.drifted ? " / drifted" : ""}`,
      level: runtimeLevel
    },
    {
      id: `${appCode}-runtime-issues`,
      label: localize(locale, "Runtime Issue 数", "Runtime Issue Count"),
      value: String(runtimeView?.issueCodes.length ?? 0),
      level: runtimeIssuesLevel
    },
    {
      id: `${appCode}-host-sync`,
      label: localize(locale, "宿主机收敛", "Host Convergence"),
      value: hostSyncPending
        ? localize(
            locale,
            targetHostPreview?.removedServerIds.length
              ? `仍需 Host Sync，且包含 ${targetHostPreview.removedServerIds.length} 个移除项`
              : "仍需 Host Sync",
            targetHostPreview?.removedServerIds.length
              ? `Host sync still pending with ${targetHostPreview.removedServerIds.length} removal(s)`
              : "Host sync still pending"
          )
        : localize(locale, "控制台与宿主机基本一致", "Console and host are aligned"),
      level: hostSyncLevel
    },
    {
      id: `${appCode}-mcp-audit`,
      label: localize(locale, "最近 MCP 审计", "Recent MCP Audit"),
      value:
        mcpAuditItems.length === 0
          ? localize(locale, "未命中当前预览窗口", "Not In Current Preview Window")
          : localize(
              locale,
              `${errorAuditCount} 个 error / ${warningAuditCount} 个 warn`,
              `${errorAuditCount} error / ${warningAuditCount} warn`
            ),
      level: auditLevel
    },
    {
      id: `${appCode}-traffic`,
      label: localize(locale, "真实请求验证", "Live Request Verification"),
      value:
        takeoverEntry === null
          ? renderRoutingPrimaryCauseLabel(trafficPrimaryCause, locale)
          : `${renderTakeoverState(takeoverEntry.verificationState, locale)} / ${renderRoutingPrimaryCauseLabel(trafficPrimaryCause, locale)}`,
      level: trafficLevel
    }
  ];

  const nextActions = uniqueStrings([
    runtimeLevel !== "low" || runtimeIssuesLevel !== "low"
      ? localize(
          locale,
          "先看 MCP runtime，确认 issue code 是否已经减少，以及 host drift 是否清零。",
          "Check MCP runtime first and confirm issue codes are dropping and host drift is cleared."
        )
      : localize(
          locale,
          "先记录当前 runtime 已基本健康，后续重点转到宿主机与流量验证。",
          "Record that runtime is already mostly healthy and move focus to host and traffic verification."
        ),
    hostSyncPending
      ? localize(
          locale,
          "如果 host sync 仍待执行，先确认 diff 和移除项，再决定 apply 还是继续修控制台配置。",
          "If host sync is still pending, confirm the diff and removals before deciding whether to apply or keep repairing console config."
        )
      : localize(
          locale,
          "宿主机侧看起来已基本对齐，继续确认同步后的审计和请求是否一起收敛。",
          "Host-side state looks mostly aligned, so confirm post-sync audit and traffic converge as well."
        ),
    auditLevel !== "low"
      ? localize(
          locale,
          "再看 MCP 审计，确认导入、repair、host sync 事件没有继续报错。",
          "Review MCP audit next and confirm import, repair, and host sync events are no longer failing."
        )
      : localize(
          locale,
          "MCP 审计当前没有明显红灯，可把注意力放到真实请求验证。",
          "MCP audit has no obvious red flags right now, so attention can move to live request verification."
        ),
    trafficLevel !== "low"
      ? localize(
          locale,
          "最后触发一次真实 CLI 请求，确认 MCP 修复不再继续传导到流量面。",
          "Finally trigger a real CLI request and confirm MCP repairs no longer propagate into the traffic path."
        )
      : localize(
          locale,
          "真实请求已经基本健康，继续观察一段时间确认没有回退。",
          "Live traffic already looks healthy overall. Keep observing for a while to ensure there is no regression."
        )
  ]);

  const summary =
    verificationStatus === "verified"
      ? localize(
          locale,
          `${appCode} 的 MCP 最近一次治理已经通过自动验证，当前重点是继续观察是否有回退。`,
          `${appCode} latest MCP governance cycle has passed automatic verification. The focus now is continued regression watch.`
        )
      : verificationStatus === "regressed" || verificationStatus === "pending-runtime"
        ? localize(
            locale,
            `${appCode} 的 MCP 治理仍处于高风险阶段，最近信号更像阻断或回退，而不是稳定收敛。`,
            `${appCode} MCP governance is still in a high-risk phase. Recent signals look more like blockers or regression than stable convergence.`
          )
        : localize(
            locale,
            `${appCode} 的 MCP 主链路已有改善，但自动验证仍停在宿主机、审计或真实请求这几步中的某一步。`,
            `${appCode} MCP primary flow is improving, but automatic verification is still paused on host, audit, or live-request confirmation.`
          );

  return {
    appCode,
    level,
    summary,
    verificationStatus,
    verificationStatusLabel,
    verificationStatusSummary,
    verificationBaselineAt,
    latestSuccessAt,
    latestFailureAt,
    checkpoints,
    nextActions,
    hasRuntimeIssues: (runtimeView?.issueCodes.length ?? 0) > 0,
    needsHostSync: hostSyncPending,
    needsTrafficVerification: trafficLevel !== "low"
  };
};

export const buildMcpVerificationBatchSummary = ({
  snapshot,
  locale,
  previewByApp,
  hostPreviewByApp
}: {
  readonly snapshot: DashboardSnapshot;
  readonly locale: LocaleCode;
  readonly previewByApp: Record<string, McpGovernanceRepairPreview | null>;
  readonly hostPreviewByApp: Record<string, McpHostSyncPreview | null>;
}): McpVerificationBatchSummary => {
  const appCodes = uniqueStrings([
    ...snapshot.mcpRuntimeViews.map((item) => item.appCode),
    ...Object.entries(previewByApp)
      .filter((entry): entry is [string, McpGovernanceRepairPreview] => entry[1] !== null)
      .map(([appCode]) => appCode),
    ...Object.entries(hostPreviewByApp)
      .filter((entry): entry is [string, McpHostSyncPreview] => entry[1] !== null)
      .map(([appCode]) => appCode)
  ]) as AppCode[];

  const plans = appCodes.map((appCode) =>
    buildMcpVerificationPlan({
      snapshot,
      appCode,
      locale,
      governancePreview: previewByApp[appCode] ?? null,
      hostPreview: hostPreviewByApp[appCode] ?? null
    })
  );
  const verifiedApps = plans
    .filter((item) => item.verificationStatus === "verified")
    .map((item) => item.appCode);
  const regressedApps = plans
    .filter((item) => item.verificationStatus === "regressed")
    .map((item) => item.appCode);
  const pendingRuntimeApps = plans
    .filter((item) => item.verificationStatus === "pending-runtime")
    .map((item) => item.appCode);
  const pendingAuditApps = plans
    .filter((item) => item.verificationStatus === "pending-audit")
    .map((item) => item.appCode);
  const stableApps = verifiedApps;
  const highRiskApps = plans
    .filter(
      (item) =>
        item.verificationStatus === "regressed" || item.verificationStatus === "pending-runtime"
    )
    .map((item) => item.appCode);
  const needsHostSyncApps = plans.filter((item) => item.needsHostSync).map((item) => item.appCode);
  const needsTrafficVerificationApps = plans
    .filter((item) => item.needsTrafficVerification)
    .map((item) => item.appCode);

  return {
    totalApps: plans.length,
    stableApps,
    highRiskApps,
    verifiedApps,
    regressedApps,
    pendingRuntimeApps,
    pendingAuditApps,
    needsHostSyncApps,
    needsTrafficVerificationApps,
    summary:
      plans.length === 0
        ? localize(
            locale,
            "当前没有 MCP 验证对象，说明控制台预览里没有明显需要继续核对的生态项。",
            "There is no MCP verification target right now, which means the current console preview has no obvious ecosystem item left to validate."
          )
        : localize(
            locale,
            `当前有 ${plans.length} 个 MCP 验证对象，其中 ${verifiedApps.length} 个已自动验证通过，${highRiskApps.length} 个仍处于阻断或回退风险。`,
            `${plans.length} MCP verification target(s) are currently visible, ${verifiedApps.length} already passed automatic verification, and ${highRiskApps.length} still sit in blocker or regression-risk states.`
          ),
    suggestions: uniqueStrings([
      regressedApps.length > 0
        ? localize(
            locale,
            `优先盯住 ${regressedApps.join(", ")} 这批回退风险对象，说明最近治理动作后仍有 error audit 或失败请求在冒出来。`,
            `Prioritize regression-risk targets such as ${regressedApps.join(", ")}. They are still surfacing error audits or failed requests after recent governance actions.`
          )
        : pendingRuntimeApps.length > 0
          ? localize(
              locale,
              `当前最大的阻断还在 runtime 层，优先处理 ${pendingRuntimeApps.join(", ")} 这批对象，不要过早切到 host sync 或流量验证。`,
              `The biggest blocker is still at runtime. Prioritize ${pendingRuntimeApps.join(", ")} before switching too early to host sync or traffic verification.`
            )
          : localize(
              locale,
              "当前没有明显回退风险，说明最近治理动作没有继续把问题往外扩散。",
              "There is no obvious regression risk right now, which means recent governance actions are no longer spreading issues outward."
            ),
      pendingAuditApps.length > 0
        ? localize(
            locale,
            `仍有 ${pendingAuditApps.length} 个应用停在审计确认阶段，repair / import / host sync 的事件结果还要再看一轮。`,
            `${pendingAuditApps.length} app(s) are still waiting on audit confirmation, so repair, import, or host-sync results need another review pass.`
          )
        : localize(
            locale,
            "当前审计确认层没有明显堆积，可以把注意力更多转到宿主机和真实流量观察。",
            "There is no obvious pile-up at the audit-confirmation layer right now, so more attention can move to host and live traffic observation."
          ),
      needsHostSyncApps.length > 0
        ? localize(
            locale,
            `其中 ${needsHostSyncApps.length} 个应用仍需 Host Sync 或宿主机差异确认。`,
            `${needsHostSyncApps.length} app(s) still require host sync or host-diff confirmation.`
          )
        : localize(
            locale,
            "宿主机同步层面当前看起来已基本收敛，可以更多关注请求链路。",
            "Host synchronization currently looks converged overall, so more attention can move to request flow."
          ),
      needsTrafficVerificationApps.length > 0
        ? localize(
            locale,
            `仍有 ${needsTrafficVerificationApps.length} 个应用缺少真实请求级验证，最好补一次真实 CLI 调用。`,
            `${needsTrafficVerificationApps.length} app(s) still lack live request verification, so a real CLI call is still recommended.`
          )
        : localize(
            locale,
            "真实请求验证层面当前没有明显缺口，可继续观察是否稳定回归。",
            "There is no obvious gap in live request verification right now, so continue watching for stable regression-free behavior."
          )
    ])
  };
};
