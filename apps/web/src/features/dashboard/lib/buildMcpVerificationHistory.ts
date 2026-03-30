import type {
  AppCode,
  LocaleCode,
  McpVerificationBaselineAction,
  McpVerificationHistoryPage as McpVerificationHistoryPagePayload,
  McpGovernanceRepairPreview,
  McpHostSyncPreview
} from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import {
  buildMcpVerificationPlan,
  type McpVerificationStatus,
  isRelevantMcpAuditEvent
} from "./buildMcpVerificationPlan.js";

const SYNTHETIC_HOST_SYNC_BASELINE_ID = "synthetic-host-sync";
const SYNTHETIC_BASELINE_TOLERANCE_MS = 60_000;

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

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

const isWithinWindow = (
  value: string,
  windowStartAt: string,
  windowEndAt: string | null
): boolean => {
  const valueEpoch = parseTimestamp(value);
  const startEpoch = parseTimestamp(windowStartAt);
  if (valueEpoch === null || startEpoch === null || valueEpoch < startEpoch) {
    return false;
  }

  const endEpoch = parseTimestamp(windowEndAt);
  if (endEpoch === null) {
    return true;
  }
  return valueEpoch < endEpoch;
};

const isSameTimeWindow = (
  left: string,
  right: string,
  toleranceMs = SYNTHETIC_BASELINE_TOLERANCE_MS
): boolean => {
  const leftEpoch = parseTimestamp(left);
  const rightEpoch = parseTimestamp(right);
  if (leftEpoch === null || rightEpoch === null) {
    return false;
  }
  return Math.abs(leftEpoch - rightEpoch) <= toleranceMs;
};

const renderBaselineSourceLabel = (
  locale: LocaleCode,
  action: string | null | undefined,
  synthetic: boolean
): string => {
  if (synthetic) {
    return localize(
      locale,
      "Host Sync 基线（审计窗口外）",
      "Host Sync Baseline (Outside Audit Preview)"
    );
  }

  switch (action) {
    case "import":
      return localize(locale, "宿主机导入基线", "Host Import Baseline");
    case "governance-repair":
      return localize(locale, "一键治理基线", "Governance Repair Baseline");
    case "host-apply":
      return localize(locale, "Host Sync 基线", "Host Sync Baseline");
    case "host-rollback":
      return localize(locale, "Host 回滚基线", "Host Rollback Baseline");
    case "server-upsert":
      return localize(locale, "Server 编辑基线", "Server Edit Baseline");
    case "binding-upsert":
      return localize(locale, "Binding 编辑基线", "Binding Edit Baseline");
    case "server-delete":
      return localize(locale, "Server 删除基线", "Server Delete Baseline");
    case "binding-delete":
      return localize(locale, "Binding 删除基线", "Binding Delete Baseline");
    default:
      return localize(locale, "MCP 变更基线", "MCP Change Baseline");
  }
};

const renderHistoryStatusLabel = (
  locale: LocaleCode,
  status: McpVerificationStatus | "superseded"
): string => {
  switch (status) {
    case "verified":
      return localize(locale, "已验证", "Verified");
    case "pending-runtime":
      return localize(locale, "先收敛 Runtime", "Fix Runtime First");
    case "pending-host-sync":
      return localize(locale, "待宿主机确认", "Need Host Confirmation");
    case "pending-audit":
      return localize(locale, "待审计确认", "Need Audit Confirmation");
    case "pending-traffic":
      return localize(locale, "待真实请求验证", "Need Live Request Verification");
    case "regressed":
      return localize(locale, "存在回退风险", "Regression Risk");
    case "superseded":
      return localize(locale, "已被下一次治理接管", "Superseded By Next Baseline");
  }
};

const renderHistoricalStatusSummary = ({
  locale,
  appCode,
  status,
  nextBaselineAt,
  latestSuccessAt,
  latestFailureAt
}: {
  readonly locale: LocaleCode;
  readonly appCode: AppCode;
  readonly status: McpVerificationStatus | "superseded";
  readonly nextBaselineAt: string | null;
  readonly latestSuccessAt: string | null;
  readonly latestFailureAt: string | null;
}): string => {
  if (status === "verified") {
    return localize(
      locale,
      `${appCode} 在下一次治理动作接管前已经出现成功请求，这一轮闭环曾经跑通。`,
      `${appCode} saw a successful request before the next governance action took over, so this cycle reached a closed loop.`
    );
  }
  if (status === "regressed") {
    return localize(
      locale,
      `${appCode} 这轮基线后仍出现失败请求或风险信号，说明它并没有稳定收敛就进入了下一轮治理。`,
      `${appCode} still showed failed requests or risk signals after this baseline, so the cycle never stabilized before the next governance action.`
    );
  }
  if (status === "superseded") {
    return localize(
      locale,
      nextBaselineAt === null
        ? `${appCode} 这一轮还没有拿到明确成功验证，后续需要继续观察。`
        : `${appCode} 在拿到明确成功验证前就进入了下一次治理动作，这一轮更像过渡基线。`,
      nextBaselineAt === null
        ? `${appCode} has not reached an explicit successful verification yet and still needs observation.`
        : `${appCode} moved into the next governance action before a clear success signal appeared, so this cycle is better treated as a transitional baseline.`
    );
  }

  if (status === "pending-runtime") {
    return localize(
      locale,
      `${appCode} 最新基线后的 runtime 仍未收敛，验证应先停在运行态。`,
      `${appCode} runtime is still not converged after the latest baseline, so verification should stay at runtime first.`
    );
  }
  if (status === "pending-host-sync") {
    return localize(
      locale,
      `${appCode} 最新基线后的宿主机收敛还没确认，apply / drift review 仍不能跳过。`,
      `${appCode} host convergence is still unconfirmed after the latest baseline, so apply or drift review cannot be skipped yet.`
    );
  }
  if (status === "pending-audit") {
    return localize(
      locale,
      `${appCode} 最新基线后的审计还没完全转稳，需要继续确认 repair / import / host sync 信号。`,
      `${appCode} audit is not fully settled after the latest baseline and still needs verification across repair, import, and host sync signals.`
    );
  }

  return localize(
    locale,
    latestSuccessAt === null && latestFailureAt === null
      ? `${appCode} 最新基线后还没有新的真实请求结果，这一轮仍停在待重验。`
      : `${appCode} 最新基线后还没有稳定成功信号，这一轮仍需要继续做真实请求验证。`,
    latestSuccessAt === null && latestFailureAt === null
      ? `${appCode} has no new live request result after the latest baseline, so this cycle is still waiting for re-verification.`
      : `${appCode} still has no stable success signal after the latest baseline, so the cycle still needs live-request verification.`
  );
};

type RelevantMcpAuditItem = DashboardSnapshot["initialAuditEventPage"]["items"][number];

type VerificationBaselineCandidate = {
  readonly id: string;
  readonly baselineAt: string;
  readonly action: string | null;
  readonly sourceLabel: string;
  readonly summary: string;
  readonly synthetic: boolean;
};

export type McpVerificationHistoryItem = {
  readonly id: string;
  readonly appCode: AppCode;
  readonly baselineAt: string;
  readonly baselineSourceLabel: string;
  readonly baselineSummary: string;
  readonly verificationStatus: McpVerificationStatus | "superseded";
  readonly verificationStatusLabel: string;
  readonly verificationStatusSummary: string;
  readonly latestSuccessAt: string | null;
  readonly latestFailureAt: string | null;
  readonly latestAuditAt: string | null;
  readonly nextBaselineAt: string | null;
  readonly isCurrentCycle: boolean;
  readonly synthetic: boolean;
};

export type McpVerificationHistory = {
  readonly items: readonly McpVerificationHistoryItem[];
  readonly previewNote: string | null;
};

const buildRelevantMcpAuditItems = (
  snapshot: DashboardSnapshot,
  appCode: AppCode
): RelevantMcpAuditItem[] =>
  snapshot.initialAuditEventPage.items
    .filter((item) => isRelevantMcpAuditEvent(snapshot, appCode, item))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

const buildBaselineCandidates = ({
  snapshot,
  appCode,
  locale,
  auditItems
}: {
  readonly snapshot: DashboardSnapshot;
  readonly appCode: AppCode;
  readonly locale: LocaleCode;
  readonly auditItems: readonly RelevantMcpAuditItem[];
}): VerificationBaselineCandidate[] => {
  const baselines: VerificationBaselineCandidate[] = auditItems.map((item) => ({
    id: item.id,
    baselineAt: item.createdAt,
    action: item.status,
    sourceLabel: renderBaselineSourceLabel(locale, item.status, false),
    summary: item.summary,
    synthetic: false
  }));
  const hostSyncState = snapshot.mcpHostSyncStates.find((item) => item.appCode === appCode) ?? null;

  if (
    hostSyncState?.lastAppliedAt &&
    !baselines.some((item) => isSameTimeWindow(item.baselineAt, hostSyncState.lastAppliedAt))
  ) {
    baselines.push({
      id: `${SYNTHETIC_HOST_SYNC_BASELINE_ID}-${appCode}`,
      baselineAt: hostSyncState.lastAppliedAt,
      action: "host-apply",
      sourceLabel: renderBaselineSourceLabel(locale, "host-apply", true),
      summary: localize(
        locale,
        "宿主机最近一次 MCP 落盘时间来自当前状态快照，详细审计事件可能已经滚出首屏预览窗口。",
        "The latest host MCP apply time comes from the current state snapshot. The detailed audit event may already be outside the first-screen preview window."
      ),
      synthetic: true
    });
  }

  return baselines
    .sort((left, right) => right.baselineAt.localeCompare(left.baselineAt))
    .filter((item, index, items) =>
      items.findIndex((candidate) => candidate.id === item.id) === index
    );
};

export const buildMcpVerificationHistory = ({
  snapshot,
  appCode,
  locale,
  governancePreview,
  hostPreview,
  historyPage,
  limit = 3
}: {
  readonly snapshot: DashboardSnapshot;
  readonly appCode: AppCode;
  readonly locale: LocaleCode;
  readonly governancePreview?: McpGovernanceRepairPreview | null | undefined;
  readonly hostPreview?: McpHostSyncPreview | null | undefined;
  readonly historyPage?: McpVerificationHistoryPagePayload | null | undefined;
  readonly limit?: number;
}): McpVerificationHistory => {
  const currentPlan = buildMcpVerificationPlan({
    snapshot,
    appCode,
    locale,
    governancePreview,
    hostPreview
  });

  if ((historyPage?.items.length ?? 0) > 0) {
    return {
      items: historyPage!.items.slice(0, limit).map((item) => ({
        id: item.id,
        appCode: item.appCode,
        baselineAt: item.baselineAt,
        baselineSourceLabel: renderBaselineSourceLabel(
          locale,
          item.baselineAction as McpVerificationBaselineAction,
          item.synthetic
        ),
        baselineSummary: item.baselineSummary,
        verificationStatus: item.currentCycle
          ? currentPlan.verificationStatus
          : item.verificationStatus,
        verificationStatusLabel: item.currentCycle
          ? currentPlan.verificationStatusLabel
          : renderHistoryStatusLabel(locale, item.verificationStatus),
        verificationStatusSummary: item.currentCycle
          ? currentPlan.verificationStatusSummary
          : renderHistoricalStatusSummary({
              locale,
              appCode,
              status: item.verificationStatus,
              nextBaselineAt: item.nextBaselineAt,
              latestSuccessAt: item.latestSuccessAt,
              latestFailureAt: item.latestFailureAt
            }),
        latestSuccessAt: item.currentCycle ? currentPlan.latestSuccessAt : item.latestSuccessAt,
        latestFailureAt: item.currentCycle ? currentPlan.latestFailureAt : item.latestFailureAt,
        latestAuditAt: item.latestAuditAt,
        nextBaselineAt: item.nextBaselineAt,
        isCurrentCycle: item.currentCycle,
        synthetic: item.synthetic
      })),
      previewNote: null
    };
  }

  const auditItems = buildRelevantMcpAuditItems(snapshot, appCode);
  const baselineCandidates = buildBaselineCandidates({
    snapshot,
    appCode,
    locale,
    auditItems
  }).slice(0, limit);

  if (baselineCandidates.length === 0) {
    return {
      items: [],
      previewNote:
        snapshot.initialAuditEventPage.total > snapshot.initialAuditEventPage.items.length
          ? localize(
              locale,
              "当前首屏审计窗口只保留最近一段事件，较早的 MCP 基线可能已经滚出预览。",
              "The first-screen audit window only keeps a recent slice, so older MCP baselines may already be outside the preview."
            )
          : null
    };
  }

  const appLogs = snapshot.proxyRequestLogs.filter((item) => item.appCode === appCode);

  const items = baselineCandidates.map((baseline, index) => {
    const nextBaselineAt = index === 0 ? null : baselineCandidates[index - 1]?.baselineAt ?? null;

    if (index === 0) {
      return {
        id: `${baseline.id}-current`,
        appCode,
        baselineAt: baseline.baselineAt,
        baselineSourceLabel: baseline.sourceLabel,
        baselineSummary: baseline.summary,
        verificationStatus: currentPlan.verificationStatus,
        verificationStatusLabel: currentPlan.verificationStatusLabel,
        verificationStatusSummary: currentPlan.verificationStatusSummary,
        latestSuccessAt: currentPlan.latestSuccessAt,
        latestFailureAt: currentPlan.latestFailureAt,
        latestAuditAt: pickLatestTimestamp(auditItems.map((item) => item.createdAt)),
        nextBaselineAt,
        isCurrentCycle: true,
        synthetic: baseline.synthetic
      } satisfies McpVerificationHistoryItem;
    }

    const cycleAuditItems = auditItems.filter((item) =>
      isWithinWindow(item.createdAt, baseline.baselineAt, nextBaselineAt)
    );
    const cycleLogs = appLogs.filter((item) =>
      isWithinWindow(item.createdAt, baseline.baselineAt, nextBaselineAt)
    );
    const latestSuccessAt = pickLatestTimestamp(
      cycleLogs.filter((item) => item.outcome === "success").map((item) => item.createdAt)
    );
    const latestFailureAt = pickLatestTimestamp(
      cycleLogs.filter((item) => item.outcome !== "success").map((item) => item.createdAt)
    );
    const latestAuditAt = pickLatestTimestamp(cycleAuditItems.map((item) => item.createdAt));
    const hasRiskSignal =
      latestFailureAt !== null || cycleAuditItems.some((item) => item.level !== "info");
    const verificationStatus: McpVerificationStatus | "superseded" = hasRiskSignal
      ? "regressed"
      : latestSuccessAt !== null
        ? "verified"
        : "superseded";

    return {
      id: `${baseline.id}-${index}`,
      appCode,
      baselineAt: baseline.baselineAt,
      baselineSourceLabel: baseline.sourceLabel,
      baselineSummary: baseline.summary,
      verificationStatus,
      verificationStatusLabel: renderHistoryStatusLabel(locale, verificationStatus),
      verificationStatusSummary: renderHistoricalStatusSummary({
        locale,
        appCode,
        status: verificationStatus,
        nextBaselineAt,
        latestSuccessAt,
        latestFailureAt
      }),
      latestSuccessAt,
      latestFailureAt,
      latestAuditAt,
      nextBaselineAt,
      isCurrentCycle: false,
      synthetic: baseline.synthetic
    } satisfies McpVerificationHistoryItem;
  });

  return {
    items,
    previewNote:
      snapshot.initialAuditEventPage.total > snapshot.initialAuditEventPage.items.length
        ? localize(
            locale,
            "该时间线基于当前首屏审计预览窗口回看，较早的 MCP 基线可能已经滚出预览。",
            "This timeline is reconstructed from the current first-screen audit preview, so older MCP baselines may already be outside the window."
          )
        : null
  };
};
