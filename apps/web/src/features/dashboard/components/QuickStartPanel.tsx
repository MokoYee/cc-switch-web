import { useState } from "react";

import type {
  AppCode,
  HostCliApplyPreview,
  LocaleCode,
  McpVerificationHistoryPage,
  McpGovernanceRepairPreview,
  McpHostSyncPreview,
  OnboardingAppCode,
  PromptHostImportPreview,
  PromptHostSyncPreview,
  QuickContextAssetApplyResult,
  QuickOnboardingApplyResult
} from "@cc-switch-web/shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import type {
  DashboardFollowUpAction,
  DashboardFollowUpNotice
} from "../lib/dashboardFollowUp.js";
import { ProjectIntakeWorkbench } from "./ProjectIntakeWorkbench.js";
import { QuickAssetDeliveryWorkbench } from "./QuickAssetDeliveryWorkbench.js";
import { QuickOnboardingWorkbench } from "./QuickOnboardingWorkbench.js";
import { buildMcpGovernanceEntries } from "../lib/buildMcpGovernanceEntries.js";
import {
  buildRequestPrimaryCause,
  renderRoutingPrimaryCauseLabel
} from "../lib/buildRoutingPrimaryCause.js";
import {
  buildTrafficTakeoverEntries,
  type TrafficTakeoverActionKind
} from "../lib/buildTrafficTakeoverEntries.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const formatNumber = (value: number): string => new Intl.NumberFormat().format(value);

type QuickStartFollowUpVerdict = {
  readonly level: "low" | "medium" | "high";
  readonly title: string;
  readonly summary: string;
};

type QuickStartFollowUpValidationItem = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly level: "low" | "medium" | "high";
};

type PrimaryFlowStageId = "host-takeover" | "mcp" | "traffic";

type TrafficVerificationEntry = ReturnType<typeof buildTrafficTakeoverEntries>[number];

type QuickStartPanelProps = {
  readonly snapshot: DashboardSnapshot;
  readonly locale: LocaleCode;
  readonly isWorking: boolean;
  readonly hostApplyPreviewByApp: Record<string, HostCliApplyPreview | null>;
  readonly onPreviewHostCliManagedConfig: (appCode: string) => void;
  readonly onApplyHostCliManagedConfig: (appCode: string) => void;
  readonly onRollbackHostCliManagedConfig: (appCode: string) => void;
  readonly onSyncServiceEnv: () => void;
  readonly onInstallSystemService: () => void;
  readonly onOpenRuntime: () => void;
  readonly onOpenTraffic: (appCode: AppCode) => void;
  readonly onOpenMcpRuntime: (appCode: AppCode) => void;
  readonly onOpenMcpAudit: (appCode: AppCode) => void;
  readonly onOpenMcpVerificationHistory: (appCode: AppCode) => void;
  readonly onOpenAssetForms: () => void;
  readonly onOpenMcpForms: () => void;
  readonly onRefreshSnapshot: () => void;
  readonly promptHostSyncPreview: Record<string, PromptHostSyncPreview | null>;
  readonly promptHostImportPreview: Record<string, PromptHostImportPreview | null>;
  readonly promptHostSyncStateByApp: Map<string, DashboardSnapshot["promptHostSyncStates"][number]>;
  readonly mcpHostSyncPreview: Record<string, McpHostSyncPreview | null>;
  readonly mcpGovernancePreview: Record<string, McpGovernanceRepairPreview | null>;
  readonly mcpVerificationHistoryByApp: Record<string, McpVerificationHistoryPage | null>;
  readonly mcpRuntimeViewByApp: Map<string, DashboardSnapshot["mcpRuntimeViews"][number]>;
  readonly mcpHostSyncStateByApp: Map<string, DashboardSnapshot["mcpHostSyncStates"][number]>;
  readonly onImportPromptFromHost: (appCode: AppCode) => void;
  readonly onApplyPromptHostSync: (appCode: AppCode) => void;
  readonly onRollbackPromptHostSync: (appCode: AppCode) => void;
  readonly onImportMcpFromHost: (appCode: AppCode) => void;
  readonly onRepairMcpGovernance: (appCode: AppCode) => void;
  readonly onApplyMcpHostSync: (appCode: AppCode) => void;
  readonly onRollbackMcpHostSync: (appCode: AppCode) => void;
  readonly onOpenContextResources: () => void;
  readonly onImportAllWorkspaceDiscovery: () => void;
  readonly onEnsureSessionAndActivateFromDiscovery: (
    item: DashboardSnapshot["workspaceDiscovery"][number]
  ) => void;
  readonly onRunIntakeConvergence: () => void;
  readonly onClearActiveWorkspace: () => void;
  readonly onClearActiveSession: () => void;
  readonly onArchiveStaleSessions: () => void;
  readonly onQuickContextApplied?: ((
    appCode: AppCode,
    result: QuickContextAssetApplyResult
  ) => void) | undefined;
  readonly onQuickOnboardingApplied?: (
    appCode: OnboardingAppCode,
    result: QuickOnboardingApplyResult
  ) => void;
  readonly followUpNotice?: DashboardFollowUpNotice | null;
  readonly followUpVerdict?: QuickStartFollowUpVerdict | null;
  readonly followUpValidationItems?: readonly QuickStartFollowUpValidationItem[];
  readonly onRunFollowUpAction?: (action: DashboardFollowUpAction) => void;
};

const renderStepState = (
  ok: boolean,
  locale: LocaleCode,
  degradedLabel?: string
): string => {
  if (ok) {
    return localize(locale, "已就绪", "Ready");
  }

  return degradedLabel ?? localize(locale, "待处理", "Needs Action");
};

const renderVerificationState = (
  state: ReturnType<typeof buildTrafficTakeoverEntries>[number]["verificationState"],
  locale: LocaleCode
): string => {
  switch (state) {
    case "managed-verified":
      return localize(locale, "已接管 / 已验证", "Managed / Verified");
    case "managed-failing":
      return localize(locale, "已接管 / 验证失败", "Managed / Verification Failed");
    case "managed-no-traffic":
      return localize(locale, "已接管 / 待验证", "Managed / Needs Verification");
    case "not-managed":
      return localize(locale, "未接管", "Not managed");
  }
};

const renderActionLabel = (action: TrafficTakeoverActionKind, locale: LocaleCode): string => {
  switch (action) {
    case "open-traffic":
      return localize(locale, "查看请求结果", "Open Requests");
    case "open-runtime":
      return localize(locale, "查看运行态", "Open Runtime");
    case "edit-binding":
      return localize(locale, "补 Binding", "Fix Binding");
    case "edit-failover":
      return localize(locale, "查故障转移", "Review Failover");
    case "preview-host-takeover":
      return localize(locale, "生成预检", "Generate Preview");
  }
};

const renderRecentVerificationStateLabel = (
  level: QuickStartFollowUpVerdict["level"],
  locale: LocaleCode
): string => {
  if (level === "low") {
    return localize(locale, "最近验证通过", "Recently Verified");
  }
  if (level === "medium") {
    return localize(locale, "最近仍待验证", "Still Needs Verification");
  }
  return localize(locale, "最近仍失败", "Still Failing");
};

type QuickStartBlocker = {
  readonly level: "high" | "medium" | "low";
  readonly title: string;
  readonly summary: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
};

type QuickStartRecommendedAction = {
  readonly id: string;
  readonly label: string;
  readonly onAction: () => void;
};

type QuickStartRecentVerification = {
  readonly stageId: PrimaryFlowStageId;
  readonly level: QuickStartFollowUpVerdict["level"];
  readonly stateLabel: string;
  readonly title: string;
  readonly summary: string;
  readonly targetLabel: string | null;
  readonly validationItems: readonly QuickStartFollowUpValidationItem[];
  readonly action: DashboardFollowUpAction | null;
};

type PrimaryFlowStage = {
  readonly id: PrimaryFlowStageId;
  readonly title: string;
  readonly stateLabel: string;
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly completionCriteria: string[];
  readonly actionLabel: string;
  readonly onAction: () => void;
  readonly recentVerification: QuickStartRecentVerification | null;
};

const resolveFollowUpStageId = (
  notice: DashboardFollowUpNotice,
  followUpAppCode: string | null,
  verificationEntryByApp: Map<string, TrafficVerificationEntry>
): PrimaryFlowStageId | null => {
  if (notice.category === "mcp") {
    return "mcp";
  }

  if (notice.category === "app-traffic") {
    const verificationEntry =
      followUpAppCode === null ? null : verificationEntryByApp.get(followUpAppCode) ?? null;
    return verificationEntry?.verificationState === "not-managed" ? "host-takeover" : "traffic";
  }

  if (
    notice.category === "provider" ||
    notice.category === "workspace" ||
    notice.category === "session" ||
    notice.category === "asset"
  ) {
    return "traffic";
  }

  return null;
};

export const QuickStartPanel = ({
  snapshot,
  locale,
  isWorking,
  hostApplyPreviewByApp,
  onPreviewHostCliManagedConfig,
  onApplyHostCliManagedConfig,
  onRollbackHostCliManagedConfig,
  onSyncServiceEnv,
  onInstallSystemService,
  onOpenRuntime,
  onOpenTraffic,
  onOpenMcpRuntime,
  onOpenMcpAudit,
  onOpenMcpVerificationHistory,
  onOpenAssetForms,
  onOpenMcpForms,
  onRefreshSnapshot,
  promptHostSyncPreview,
  promptHostImportPreview,
  promptHostSyncStateByApp,
  mcpHostSyncPreview,
  mcpGovernancePreview,
  mcpVerificationHistoryByApp,
  mcpRuntimeViewByApp,
  mcpHostSyncStateByApp,
  onImportPromptFromHost,
  onApplyPromptHostSync,
  onRollbackPromptHostSync,
  onImportMcpFromHost,
  onRepairMcpGovernance,
  onApplyMcpHostSync,
  onRollbackMcpHostSync,
  onOpenContextResources,
  onImportAllWorkspaceDiscovery,
  onEnsureSessionAndActivateFromDiscovery,
  onRunIntakeConvergence,
  onClearActiveWorkspace,
  onClearActiveSession,
  onArchiveStaleSessions,
  onQuickContextApplied,
  onQuickOnboardingApplied,
  followUpNotice = null,
  followUpVerdict = null,
  followUpValidationItems = [],
  onRunFollowUpAction
}: QuickStartPanelProps): JSX.Element => {
  const [expandedStageId, setExpandedStageId] = useState<PrimaryFlowStage["id"] | null>(null);
  const followUpAppCode =
    followUpNotice?.actions.find((action) => action.kind === "app-logs")?.appCode ??
    followUpNotice?.actions.find(
      (action): action is Extract<DashboardFollowUpAction, { readonly kind: "audit" }> =>
        action.kind === "audit"
    )?.filters.appCode ??
    null;
  const verificationEntries = buildTrafficTakeoverEntries(snapshot, locale);
  const mcpGovernanceEntries = buildMcpGovernanceEntries(snapshot, locale);
  const verificationEntryByApp = new Map(
    verificationEntries.map((item) => [item.appCode, item] as const)
  );
  const manageableDiscoveries = snapshot.discoveries
    .filter((item) => item.discovered && item.takeoverSupported)
    .slice(0, 4);
  const primaryDiscovery = manageableDiscoveries[0] ?? null;
  const serviceReady =
    snapshot.serviceDoctor.checks.systemd.available &&
    snapshot.serviceDoctor.checks.files.envInSync &&
    snapshot.serviceDoctor.checks.runtime.daemonMatchesDesired;
  const tokenReady = snapshot.controlAuth.maskedToken.length > 0;
  const primaryVerificationGap =
    verificationEntries.find((item) => item.level === "high") ??
    verificationEntries.find((item) => item.verificationState === "managed-no-traffic") ??
    verificationEntries.find((item) => item.verificationState === "not-managed") ??
    null;
  const verifiedEntries = verificationEntries
    .filter((item) => item.verificationState === "managed-verified" && item.latestSuccessAt !== null)
    .sort((left, right) => (right.latestSuccessAt ?? "").localeCompare(left.latestSuccessAt ?? ""));
  const primaryVerifiedEntry = verifiedEntries[0] ?? null;
  const activeSessionAppCode = snapshot.activeContext.sessionContext?.effectiveAppCode ?? null;
  const activeWorkspaceAppCode =
    snapshot.activeContext.workspaceContext?.effectiveAppCode ?? activeSessionAppCode ?? null;
  const activeVerificationEntry =
    activeSessionAppCode !== null
      ? verificationEntryByApp.get(activeSessionAppCode) ?? null
      : activeWorkspaceAppCode !== null
        ? verificationEntryByApp.get(activeWorkspaceAppCode) ?? null
        : null;
  const activeAppLogs =
    activeWorkspaceAppCode === null
      ? []
      : snapshot.proxyRequestLogs.filter((item) => item.appCode === activeWorkspaceAppCode);
  const activePrimaryCause =
    activeWorkspaceAppCode === null ? null : buildRequestPrimaryCause(activeAppLogs, locale);
  const primaryMcpGap =
    (activeWorkspaceAppCode === null
      ? null
      : mcpGovernanceEntries.find(
          (item) => item.appCode === activeWorkspaceAppCode && item.governanceLevel === "high"
        )) ??
    mcpGovernanceEntries.find((item) => item.governanceLevel === "high") ??
    null;
  const activeMcpGap =
    activeWorkspaceAppCode === null
      ? null
      : mcpGovernanceEntries.find((item) => item.appCode === activeWorkspaceAppCode) ?? null;
  const activeMatchesPrimaryVerifiedEntry =
    activeWorkspaceAppCode !== null &&
    primaryVerifiedEntry !== null &&
    activeWorkspaceAppCode === primaryVerifiedEntry.appCode;
  const followUpMatchesActiveContext =
    followUpAppCode !== null &&
    activeWorkspaceAppCode !== null &&
    followUpAppCode === activeWorkspaceAppCode;
  const activeWorkspaceRuntime =
    snapshot.activeContext.activeWorkspaceId === null
      ? null
      : snapshot.runtimeContexts.workspaces.find(
          (item) => item.workspaceId === snapshot.activeContext.activeWorkspaceId
        ) ?? null;
  const activeSessionRuntime =
    snapshot.activeContext.activeSessionId === null
      ? null
      : snapshot.runtimeContexts.sessions.find(
          (item) => item.sessionId === snapshot.activeContext.activeSessionId
        ) ?? null;
  const activeRecommendedActions: QuickStartRecommendedAction[] =
    activeWorkspaceAppCode === null || activeVerificationEntry === null
      ? []
      : activeVerificationEntry.recommendedActions.slice(0, 2).map((action) => ({
          id: `active-project-${activeWorkspaceAppCode}-${action}`,
          label: renderActionLabel(action, locale),
          onAction: () => {
            if (action === "open-traffic") {
              onOpenTraffic(activeWorkspaceAppCode);
              return;
            }
            if (action === "open-runtime") {
              onOpenRuntime();
              return;
            }
            if (action === "edit-binding") {
              onOpenAssetForms();
              return;
            }
            if (action === "edit-failover") {
              onOpenRuntime();
              return;
            }
            onPreviewHostCliManagedConfig(activeWorkspaceAppCode);
          }
        }));
  const followUpStageId =
    followUpNotice === null || followUpVerdict === null
      ? null
      : resolveFollowUpStageId(followUpNotice, followUpAppCode, verificationEntryByApp);
  const recentStageVerification =
    followUpNotice === null || followUpVerdict === null || followUpStageId === null
      ? null
      : {
          stageId: followUpStageId,
          level: followUpVerdict.level,
          stateLabel: renderRecentVerificationStateLabel(followUpVerdict.level, locale),
          title: followUpNotice.title,
          summary: followUpVerdict.summary,
          targetLabel:
            followUpAppCode === null
              ? null
              : followUpMatchesActiveContext
                ? localize(
                    locale,
                    `验证目标 ${followUpAppCode}，与当前激活项目一致。`,
                    `Validation target ${followUpAppCode} matches the active project.`
                  )
                : activeWorkspaceAppCode
                  ? localize(
                      locale,
                      `验证目标 ${followUpAppCode}，当前激活项目为 ${activeWorkspaceAppCode}。`,
                      `Validation target ${followUpAppCode}, while the active project is ${activeWorkspaceAppCode}.`
                    )
                  : localize(
                      locale,
                      `验证目标 ${followUpAppCode}。`,
                      `Validation target ${followUpAppCode}.`
                    ),
          validationItems: followUpValidationItems.slice(0, 2),
          action: followUpNotice.actions[0] ?? null
        } satisfies QuickStartRecentVerification;
  const hostTakeoverStage: PrimaryFlowStage =
    primaryVerificationGap?.verificationState === "not-managed"
      ? {
          id: "host-takeover",
          title: localize(locale, "宿主机接管", "Host Takeover"),
          stateLabel: localize(locale, "待接管", "Needs Takeover"),
          level: "high",
          summary: primaryVerificationGap.summary,
          completionCriteria: [
            localize(locale, "至少有一个目标 CLI 被识别为 takeoverSupported。", "At least one target CLI is recognized as takeoverSupported."),
            localize(locale, "当前目标 app 不再处于 not-managed。", "The current target app is no longer in not-managed state.")
          ],
          actionLabel: localize(locale, "生成接管预检", "Generate Takeover Preview"),
          onAction: () => onPreviewHostCliManagedConfig(primaryVerificationGap.appCode),
          recentVerification: null
        }
      : primaryDiscovery !== null
        ? {
            id: "host-takeover",
            title: localize(locale, "宿主机接管", "Host Takeover"),
            stateLabel: localize(locale, "已接管", "Taken Over"),
            level: "low",
            summary: localize(
            locale,
            `已识别 ${primaryDiscovery.appCode} 的宿主机接管路径，可继续进入 MCP 与流量验证。`,
            `A host takeover path for ${primaryDiscovery.appCode} has been identified and is ready for MCP and traffic verification.`
            ),
          completionCriteria: [
            localize(locale, "至少一个目标 CLI 已具备可用 takeover 路径。", "At least one target CLI has a usable takeover path."),
            localize(locale, "当前主验证对象不再要求先生成接管预检。", "The current primary target no longer requires a takeover preview first.")
          ],
          actionLabel: localize(locale, "查看运行态", "Open Runtime"),
          onAction: onOpenRuntime,
          recentVerification: null
          }
        : {
            id: "host-takeover",
            title: localize(locale, "宿主机接管", "Host Takeover"),
            stateLabel: localize(locale, "待确认", "Needs Review"),
            level: "medium",
            summary: localize(
              locale,
              "当前还没有明确的主接管对象，应先确认哪个 CLI 是首个接管目标。",
              "There is no clear primary takeover target yet. Confirm which CLI should be taken over first."
            ),
          completionCriteria: [
            localize(locale, "明确首个接管目标 app。", "A first takeover target app is explicitly chosen."),
            localize(locale, "能生成对应 app 的接管预检。", "A takeover preview can be generated for that app.")
          ],
          actionLabel: localize(locale, "查看运行态", "Open Runtime"),
          onAction: onOpenRuntime,
          recentVerification: null
          };
  const mcpStage: PrimaryFlowStage =
    primaryMcpGap !== null
      ? {
          id: "mcp",
          title: localize(locale, "MCP 状态", "MCP State"),
          stateLabel:
            primaryMcpGap.governanceLevel === "high"
              ? localize(locale, "先修 MCP", "Fix MCP First")
              : localize(locale, "需要复核", "Review MCP"),
          level: primaryMcpGap.governanceLevel,
          summary: primaryMcpGap.summary,
          completionCriteria: [
            localize(locale, "当前目标 app 不再出现在 high 优先级 MCP 队列。", "The current target app no longer appears in the high-priority MCP queue."),
            localize(locale, "duplicate-binding / missing-server / host-drift 这类主阻断项已消除。", "Primary blockers like duplicate-binding, missing-server, and host-drift are removed.")
          ],
          actionLabel: localize(locale, "打开 MCP 修复区", "Open MCP Repair"),
          onAction: onOpenMcpForms,
          recentVerification: null
        }
      : {
          id: "mcp",
          title: localize(locale, "MCP 状态", "MCP State"),
          stateLabel: localize(locale, "已收敛", "Converged"),
          level: "low",
          summary: localize(
            locale,
            "当前没有明显 MCP 阻断项，可以把注意力放到真实请求验证。",
            "There is no obvious MCP blocker right now, so attention can move to live traffic verification."
          ),
          completionCriteria: [
            localize(locale, "MCP 队列不再存在 high 优先级项目。", "No high-priority item remains in the MCP queue."),
            localize(locale, "当前激活 app 没有明显 MCP 运行态阻断。", "The active app has no obvious MCP runtime blocker.")
          ],
          actionLabel: localize(locale, "查看运行态", "Open Runtime"),
          onAction: onOpenRuntime,
          recentVerification: null
        };
  const trafficStage: PrimaryFlowStage =
    primaryVerificationGap !== null &&
    primaryVerificationGap.verificationState !== "not-managed"
      ? {
          id: "traffic",
          title: localize(locale, "流量验证", "Traffic Verification"),
          stateLabel:
            primaryVerificationGap.verificationState === "managed-failing"
              ? localize(locale, "验证失败", "Verification Failed")
              : localize(locale, "待验证", "Needs Verification"),
          level: primaryVerificationGap.level,
          summary: primaryVerificationGap.summary,
          completionCriteria: [
            localize(locale, "至少出现一次通过代理链路的成功请求。", "At least one successful request passes through the proxy path."),
            localize(locale, "当前目标 app 不再处于 managed-failing / managed-no-traffic。", "The current target app is no longer in managed-failing or managed-no-traffic state.")
          ],
          actionLabel: localize(locale, "查看请求结果", "Open Requests"),
          onAction: () => onOpenTraffic(primaryVerificationGap.appCode),
          recentVerification: null
        }
      : primaryVerifiedEntry !== null
        ? {
            id: "traffic",
            title: localize(locale, "流量验证", "Traffic Verification"),
            stateLabel: localize(locale, "已验证", "Verified"),
            level: "low",
            summary: localize(
            locale,
            `最近成功闭环应用为 ${primaryVerifiedEntry.appCode}，真实请求已经命中过代理链路。`,
            `The most recent verified app is ${primaryVerifiedEntry.appCode}, and live requests are already hitting the proxy path.`
            ),
          completionCriteria: [
            localize(locale, "最近存在成功请求且命中过代理链路。", "Recent successful requests have hit the proxy path."),
            localize(locale, "至少一个 app 已处于 managed-verified。", "At least one app is already managed-verified.")
          ],
          actionLabel: localize(locale, "查看请求结果", "Open Requests"),
          onAction: () => onOpenTraffic(primaryVerifiedEntry.appCode),
          recentVerification: null
        }
        : {
            id: "traffic",
            title: localize(locale, "流量验证", "Traffic Verification"),
            stateLabel: localize(locale, "待验证", "Needs Verification"),
            level: "medium",
            summary: localize(
              locale,
              "当前还没有形成稳定的真实请求验证结果，应至少完成一次端到端请求闭环。",
              "There is no stable live request verification result yet. Complete at least one end-to-end request loop."
            ),
          completionCriteria: [
            localize(locale, "至少触发一次真实 CLI 请求。", "At least one real CLI request is triggered."),
            localize(locale, "请求日志中出现可验证的成功结果。", "A verifiable successful result appears in request logs.")
          ],
          actionLabel: localize(locale, "查看运行态", "Open Runtime"),
          onAction: onOpenRuntime,
          recentVerification: null
        };
  const primaryFlowStages: PrimaryFlowStage[] = [hostTakeoverStage, mcpStage, trafficStage].map(
    (stage) => ({
      ...stage,
      recentVerification: recentStageVerification?.stageId === stage.id ? recentStageVerification : null
    })
  );
  const primaryBlocker: QuickStartBlocker =
    !serviceReady
      ? {
          level: "high",
          title: localize(locale, "当前卡在服务就绪", "Blocked At Service Readiness"),
          summary: snapshot.serviceDoctor.checks.systemd.available
            ? localize(
                locale,
                "systemd 环境文件或 daemon 运行参数还没有对齐。先同步服务环境，再确认 user service 安装状态。",
                "The systemd env file or daemon runtime still is not aligned. Sync the service env first, then confirm user service installation."
              )
            : localize(
                locale,
                "当前宿主机还不能稳定进入 systemd --user 托管路径。先确认运行环境，再继续主流程。",
                "This host cannot yet use a stable systemd --user managed path. Confirm the runtime environment before continuing."
              ),
          actionLabel: snapshot.serviceDoctor.checks.systemd.available
            ? localize(locale, "同步服务环境", "Sync Service Env")
            : localize(locale, "安装 User Service", "Install User Service"),
          onAction: snapshot.serviceDoctor.checks.systemd.available ? onSyncServiceEnv : onInstallSystemService
        }
      : !tokenReady
        ? {
            level: "medium",
            title: localize(locale, "当前卡在控制令牌", "Blocked At Control Token"),
            summary: localize(
              locale,
              "控制令牌当前还没有准备好。先确认 daemon 已注入有效令牌，再继续接管和验证。",
              "The control token is not ready yet. Confirm the daemon has a valid token before takeover and verification."
            ),
            actionLabel: localize(locale, "查看运行态", "Open Runtime"),
            onAction: onOpenRuntime
          }
        : primaryMcpGap !== null
          ? {
              level: "high",
              title: localize(
                locale,
                `当前卡在 ${primaryMcpGap.appCode} 的 MCP 冲突`,
                `Blocked At ${primaryMcpGap.appCode} MCP Conflict`
              ),
              summary: primaryMcpGap.summary,
              actionLabel: localize(locale, "打开 MCP 修复区", "Open MCP Repair"),
              onAction: onOpenMcpForms
            }
        : primaryVerificationGap !== null
          ? {
              level: primaryVerificationGap.level,
              title:
                primaryVerificationGap.verificationState === "managed-failing"
                  ? localize(locale, `当前卡在 ${primaryVerificationGap.appCode} 验证失败`, `Blocked At ${primaryVerificationGap.appCode} Verification`)
                  : primaryVerificationGap.verificationState === "managed-no-traffic"
                    ? localize(locale, `当前卡在 ${primaryVerificationGap.appCode} 流量验证`, `Blocked At ${primaryVerificationGap.appCode} Traffic Verification`)
                    : localize(locale, `当前卡在 ${primaryVerificationGap.appCode} 接管`, `Blocked At ${primaryVerificationGap.appCode} Takeover`),
              summary: primaryVerificationGap.summary,
              actionLabel:
                primaryVerificationGap.verificationState === "not-managed"
                  ? localize(locale, "生成接管预检", "Generate Takeover Preview")
                  : localize(locale, "查看请求结果", "Open Requests"),
              onAction:
                primaryVerificationGap.verificationState === "not-managed"
                  ? () => onPreviewHostCliManagedConfig(primaryVerificationGap.appCode)
                  : () => onOpenTraffic(primaryVerificationGap.appCode)
            }
          : {
              level: "low",
              title: localize(locale, "主流程已闭环", "Primary Flow Closed"),
              summary: localize(
                locale,
                "服务、令牌、CLI 接管和真实请求验证已经基本打通，可以转入更细的路由与治理工作。",
                "Service, token, CLI takeover, and real request validation are basically closed-loop. You can move on to deeper routing and governance work."
              ),
              actionLabel: localize(locale, "查看运行态", "Open Runtime"),
              onAction: onOpenRuntime
            };

  return (
    <section className="panel panel-span-2 quickstart-panel">
      <div className="quickstart-header">
        <div>
          <p className="eyebrow">{localize(locale, "主流程", "Primary Flow")}</p>
          <h2>{localize(locale, "先把代理跑起来", "Get The Proxy Working First")}</h2>
          <p className="panel-lead">
            {localize(
              locale,
              "先完成服务、令牌、CLI 接管与验证这四步。下面的治理与审计能力保留给问题排查时再看。",
              "Finish service, token, CLI takeover, and verification first. Governance and audit stay below for later troubleshooting."
            )}
          </p>
        </div>
      </div>

      <QuickOnboardingWorkbench
        snapshot={snapshot}
        locale={locale}
        disabled={isWorking}
        onRefreshSnapshot={onRefreshSnapshot}
        onOpenRuntime={onOpenRuntime}
        onOpenTraffic={onOpenTraffic}
        onOpenAssetForms={onOpenAssetForms}
        onApplied={onQuickOnboardingApplied}
      />

      <QuickAssetDeliveryWorkbench
        snapshot={snapshot}
        locale={locale}
        disabled={isWorking}
        onRefreshSnapshot={onRefreshSnapshot}
        promptHostSyncPreview={promptHostSyncPreview}
        promptHostImportPreview={promptHostImportPreview}
        promptHostSyncStateByApp={promptHostSyncStateByApp}
        mcpHostSyncPreview={mcpHostSyncPreview}
        mcpGovernancePreview={mcpGovernancePreview}
        mcpVerificationHistoryByApp={mcpVerificationHistoryByApp}
        mcpRuntimeViewByApp={mcpRuntimeViewByApp}
        mcpHostSyncStateByApp={mcpHostSyncStateByApp}
        onImportPromptFromHost={onImportPromptFromHost}
        onApplyPromptHostSync={onApplyPromptHostSync}
        onRollbackPromptHostSync={onRollbackPromptHostSync}
        onImportMcpFromHost={onImportMcpFromHost}
        onRepairMcpGovernance={onRepairMcpGovernance}
        onApplyMcpHostSync={onApplyMcpHostSync}
        onRollbackMcpHostSync={onRollbackMcpHostSync}
        onOpenAssetForms={onOpenAssetForms}
        onOpenMcpForms={onOpenMcpForms}
        onOpenMcpVerificationHistory={onOpenMcpVerificationHistory}
        onOpenTraffic={onOpenTraffic}
        onOpenMcpRuntime={onOpenMcpRuntime}
        onOpenMcpAudit={onOpenMcpAudit}
        onQuickContextApplied={onQuickContextApplied}
      />

      <ProjectIntakeWorkbench
        snapshot={snapshot}
        locale={locale}
        disabled={isWorking}
        onOpenContextResources={onOpenContextResources}
        onImportAllWorkspaceDiscovery={onImportAllWorkspaceDiscovery}
        onEnsureSessionAndActivateFromDiscovery={onEnsureSessionAndActivateFromDiscovery}
        onRunIntakeConvergence={onRunIntakeConvergence}
        onArchiveStaleSessions={onArchiveStaleSessions}
        onClearActiveWorkspace={onClearActiveWorkspace}
        onClearActiveSession={onClearActiveSession}
      />

      <div className="preview-summary-grid">
        {primaryFlowStages.map((stage) => {
          const recentVerificationAction = stage.recentVerification?.action ?? null;

          return (
            <div className={`preview-summary-tile risk-${stage.level}`} key={stage.id}>
              <strong>{stage.title}</strong>
              <span>{stage.stateLabel}</span>
              <small>{stage.summary}</small>
              {stage.recentVerification ? (
                <div className={`governance-notice governance-${stage.recentVerification.level}`}>
                  <div className="governance-notice-header">
                    <strong>{localize(locale, "最近一次验证", "Most Recent Verification")}</strong>
                    <span className="governance-notice-badge">
                      {stage.recentVerification.stateLabel}
                    </span>
                  </div>
                  <ul className="governance-suggestion-list">
                    <li>{stage.recentVerification.title}</li>
                    {stage.recentVerification.targetLabel ? (
                      <li>{stage.recentVerification.targetLabel}</li>
                    ) : null}
                    <li>{stage.recentVerification.summary}</li>
                    {stage.recentVerification.validationItems.map((item) => (
                      <li key={`quickstart-stage-follow-up-${stage.id}-${item.id}`}>
                        {item.label}: {item.value}
                      </li>
                    ))}
                  </ul>
                  {recentVerificationAction && onRunFollowUpAction ? (
                    <div className="quick-action-row">
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onRunFollowUpAction(recentVerificationAction)}
                      >
                        {recentVerificationAction.label}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="quick-action-row">
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={stage.onAction}
                >
                  {stage.actionLabel}
                </button>
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setExpandedStageId((current) => (current === stage.id ? null : stage.id))
                  }
                >
                  {expandedStageId === stage.id
                    ? localize(locale, "收起说明", "Hide Details")
                    : localize(locale, "查看说明", "View Details")}
                </button>
              </div>
              {expandedStageId === stage.id ? (
                <>
                  <small>{stage.summary}</small>
                  {stage.completionCriteria.map((item) => (
                    <small key={`${stage.id}-${item}`}>{item}</small>
                  ))}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={`governance-notice governance-${primaryBlocker.level}`}>
        <div className="governance-notice-header">
          <strong>{primaryBlocker.title}</strong>
          <span className="governance-notice-badge">
            {primaryBlocker.level === "low"
              ? localize(locale, "可继续", "Ready")
              : primaryBlocker.level === "medium"
                ? localize(locale, "待确认", "Needs Review")
                : localize(locale, "先处理", "Fix First")}
          </span>
        </div>
        <ul className="governance-suggestion-list">
          <li>{primaryBlocker.summary}</li>
        </ul>
        <div className="quick-action-row">
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={primaryBlocker.onAction}
          >
            {primaryBlocker.actionLabel}
          </button>
          <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRuntime}>
            {localize(locale, "打开运行态", "Open Runtime")}
          </button>
        </div>
      </div>

      {snapshot.activeContext.activeWorkspaceId !== null || snapshot.activeContext.activeSessionId !== null ? (
        <div className={`governance-notice governance-${activeVerificationEntry?.level ?? "low"}`}>
          <div className="governance-notice-header">
            <strong>{localize(locale, "当前激活项目上下文", "Current Active Project Context")}</strong>
            <span className="governance-notice-badge">
              {snapshot.activeContext.activeSessionId !== null
                ? localize(locale, "会话生效中", "Session Active")
                : localize(locale, "工作区生效中", "Workspace Active")}
            </span>
          </div>
          <ul className="governance-suggestion-list">
            {snapshot.activeContext.activeWorkspaceId !== null ? (
              <li>
                {localize(locale, "工作区", "Workspace")}: {snapshot.activeContext.activeWorkspaceId}
              </li>
            ) : null}
            {snapshot.activeContext.activeSessionId !== null ? (
              <li>
                {localize(locale, "会话", "Session")}: {snapshot.activeContext.activeSessionId}
              </li>
            ) : null}
            {activeWorkspaceAppCode !== null ? (
              <li>
                {localize(locale, "当前应用", "Current App")}: {activeWorkspaceAppCode}
                {activeVerificationEntry
                  ? ` / ${renderVerificationState(activeVerificationEntry.verificationState, locale)}`
                  : ""}
              </li>
            ) : (
              <li>{localize(locale, "当前激活上下文还没有明确的应用绑定。", "The current active context does not yet resolve to a concrete app.")}</li>
            )}
            {activeVerificationEntry?.summary ? <li>{activeVerificationEntry.summary}</li> : null}
            {activePrimaryCause ? (
              <li>
                {localize(locale, "当前主因", "Current Primary Cause")}:{" "}
                {renderRoutingPrimaryCauseLabel(activePrimaryCause, locale)}
              </li>
            ) : null}
            {primaryVerifiedEntry ? (
              <li>
                {localize(locale, "最近成功链路", "Most Recent Verified Path")}: {primaryVerifiedEntry.appCode}
                {activeMatchesPrimaryVerifiedEntry
                  ? ` / ${localize(locale, "就是当前项目", "This is the current project")}`
                  : ` / ${localize(locale, "当前项目之外", "Different from current project")}`}
              </li>
            ) : null}
          </ul>
          {activeSessionRuntime || activeWorkspaceRuntime ? (
            <div className="preview-summary-grid">
              {activeSessionRuntime ? (
                <>
                  <div className={`preview-summary-tile risk-${activeSessionRuntime.errorCount > 0 ? "medium" : "low"}`}>
                    <strong>{formatNumber(activeSessionRuntime.requestCount)}</strong>
                    <span>{localize(locale, "会话请求数", "Session Requests")}</span>
                  </div>
                  <div className={`preview-summary-tile risk-${activeSessionRuntime.errorCount >= 4 ? "high" : activeSessionRuntime.errorCount > 0 ? "medium" : "low"}`}>
                    <strong>{formatNumber(activeSessionRuntime.errorCount)}</strong>
                    <span>{localize(locale, "会话错误数", "Session Errors")}</span>
                  </div>
                  <div className="preview-summary-tile risk-low">
                    <strong>{activeSessionRuntime.lastProviderId ?? localize(locale, "未命中", "None")}</strong>
                    <span>{localize(locale, "最后命中 Provider", "Last Provider")}</span>
                  </div>
                </>
              ) : activeWorkspaceRuntime ? (
                <>
                  <div className={`preview-summary-tile risk-${activeWorkspaceRuntime.requestCount > 0 ? "low" : "medium"}`}>
                    <strong>{formatNumber(activeWorkspaceRuntime.requestCount)}</strong>
                    <span>{localize(locale, "工作区请求数", "Workspace Requests")}</span>
                  </div>
                  <div className={`preview-summary-tile risk-${activeWorkspaceRuntime.errorCount >= 5 ? "high" : activeWorkspaceRuntime.errorCount > 0 ? "medium" : "low"}`}>
                    <strong>{formatNumber(activeWorkspaceRuntime.errorCount)}</strong>
                    <span>{localize(locale, "工作区错误数", "Workspace Errors")}</span>
                  </div>
                  <div className="preview-summary-tile risk-low">
                    <strong>{activeWorkspaceRuntime.lastProviderId ?? localize(locale, "未命中", "None")}</strong>
                    <span>{localize(locale, "最后命中 Provider", "Last Provider")}</span>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          {activePrimaryCause ? (
            <div className={`governance-notice governance-${activePrimaryCause.level}`}>
              <div className="governance-notice-header">
                <strong>{localize(locale, "当前项目主因", "Current Project Primary Cause")}</strong>
                <span className="governance-notice-badge">
                  {renderRoutingPrimaryCauseLabel(activePrimaryCause, locale)}
                </span>
              </div>
              <ul className="governance-suggestion-list">
                <li>{activePrimaryCause.summary}</li>
                {activePrimaryCause.suggestions.slice(0, 2).map((item) => (
                  <li key={`quickstart-active-cause-${item}`}>{item}</li>
                ))}
              </ul>
              {activeRecommendedActions.length > 0 ? (
                <div className="quick-action-row">
                  {activeRecommendedActions.map((action) => (
                    <button
                      className="inline-action"
                      type="button"
                      key={action.id}
                      disabled={isWorking}
                      onClick={action.onAction}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeMcpGap ? (
            <div className={`governance-notice governance-${activeMcpGap.governanceLevel}`}>
              <div className="governance-notice-header">
                <strong>{localize(locale, "当前项目 MCP 状态", "Current Project MCP Status")}</strong>
                <span className="governance-notice-badge">
                  {activeMcpGap.governanceLevel === "high"
                    ? localize(locale, "先修 MCP", "Fix MCP First")
                    : localize(locale, "需要复核", "Review MCP")}
                </span>
              </div>
              <ul className="governance-suggestion-list">
                <li>{activeMcpGap.summary}</li>
                <li>
                  {localize(locale, "影响 Server", "Affected Servers")}:{" "}
                  {activeMcpGap.problemServerIds.length > 0
                    ? activeMcpGap.problemServerIds.join(", ")
                    : localize(locale, "暂无明显问题对象", "No explicit problem server")}
                </li>
                <li>
                  {localize(locale, "影响 Binding", "Affected Bindings")}:{" "}
                  {activeMcpGap.problemBindingIds.length > 0
                    ? activeMcpGap.problemBindingIds.join(", ")
                    : localize(locale, "暂无明显问题对象", "No explicit problem binding")}
                </li>
              </ul>
              <div className="quick-action-row">
                <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenMcpForms}>
                  {localize(locale, "打开 MCP 修复区", "Open MCP Repair")}
                </button>
                {activeWorkspaceAppCode !== null ? (
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => onOpenTraffic(activeWorkspaceAppCode)}
                  >
                    {localize(locale, "查看该应用请求", "Open App Requests")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {activeSessionRuntime?.lastRequestAt || activeWorkspaceRuntime?.lastRequestAt ? (
            <p className="panel-supporting-copy">
              {localize(locale, "最近请求时间", "Most Recent Request")}:{" "}
              <code>{activeSessionRuntime?.lastRequestAt ?? activeWorkspaceRuntime?.lastRequestAt}</code>
            </p>
          ) : activeWorkspaceAppCode !== null ? (
            <p className="panel-supporting-copy">
              {localize(
                locale,
                "上下文已经激活，但还没有看到这条链路的真实请求。现在直接发起一次 CLI 请求，首页验证状态就会继续收敛。",
                "The context is active, but no live request has been observed for this path yet. Send one CLI request now and the homepage verification state will converge further."
              )}
            </p>
          ) : null}
          <div className="quick-action-row">
            <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenAssetForms}>
              {localize(locale, "前往上下文修复", "Open Context Repair")}
            </button>
            {activeWorkspaceAppCode !== null ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => onOpenTraffic(activeWorkspaceAppCode)}
              >
                {localize(locale, "查看当前应用请求", "Open Current App Requests")}
              </button>
            ) : (
              <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRuntime}>
                {localize(locale, "查看运行态", "Open Runtime")}
              </button>
            )}
            {snapshot.activeContext.activeSessionId !== null ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={onClearActiveSession}
              >
                {localize(locale, "清除会话激活", "Clear Session Activation")}
              </button>
            ) : snapshot.activeContext.activeWorkspaceId !== null ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={onClearActiveWorkspace}
              >
                {localize(locale, "清除工作区激活", "Clear Workspace Activation")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {followUpNotice && followUpVerdict ? (
        <div className={`governance-notice governance-${followUpVerdict.level}`}>
          <div className="governance-notice-header">
            <strong>{localize(locale, "最近操作验证结果", "Most Recent Action Verification")}</strong>
            <span className="governance-notice-badge">
              {followUpMatchesActiveContext
                ? localize(locale, "当前项目", "Current Project")
                : followUpVerdict.level === "low"
                  ? localize(locale, "已收敛", "Converged")
                  : followUpVerdict.level === "medium"
                    ? localize(locale, "继续验证", "Keep Verifying")
                    : localize(locale, "仍需修复", "Still Failing")}
            </span>
          </div>
          <ul className="governance-suggestion-list">
            <li>
              <strong>{followUpNotice.title}</strong>
            </li>
            {followUpAppCode ? (
              <li>
                {localize(locale, "验证目标", "Validation Target")}: {followUpAppCode}
                {followUpMatchesActiveContext
                  ? ` / ${localize(locale, "与当前激活项目一致", "Matches active project")}`
                  : activeWorkspaceAppCode
                    ? ` / ${localize(locale, "当前激活项目", "Active project")} ${activeWorkspaceAppCode}`
                    : ""}
              </li>
            ) : null}
            <li>{followUpVerdict.summary}</li>
          </ul>
          {followUpValidationItems.length > 0 ? (
            <div className="preview-summary-grid">
              {followUpValidationItems.slice(0, 3).map((item) => (
                <div className={`preview-summary-tile risk-${item.level}`} key={`quickstart-follow-up-${item.id}`}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          {followUpNotice.actions.length > 0 && onRunFollowUpAction ? (
            <div className="quick-action-row">
              {followUpNotice.actions.slice(0, 2).map((action) => (
                <button
                  className="inline-action"
                  type="button"
                  key={`quickstart-follow-up-action-${action.id}`}
                  disabled={isWorking}
                  onClick={() => onRunFollowUpAction(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {primaryVerifiedEntry ? (
        <div className="note-block">
          <strong>{localize(locale, "最近已验证成功的链路", "Most Recently Verified Working Path")}</strong>
          <div className="list">
            <div className="list-row">
              <div>
                <strong>{primaryVerifiedEntry.appCode}</strong>
                <p>{localize(locale, "当前已经可以认为这条链路可用。", "This path can now be considered usable.")}</p>
                {activeWorkspaceAppCode ? (
                  <p>
                    {activeMatchesPrimaryVerifiedEntry
                      ? localize(locale, "这条成功链路就是当前激活项目。", "This verified path is the current active project.")
                      : localize(
                          locale,
                          `当前激活项目是 ${activeWorkspaceAppCode}，最近成功链路是另一条应用。`,
                          `The current active project is ${activeWorkspaceAppCode}, while the most recent verified path belongs to a different app.`
                        )}
                  </p>
                ) : null}
                {primaryVerifiedEntry.recentSuccessSummary ? <p>{primaryVerifiedEntry.recentSuccessSummary}</p> : null}
                <p>
                  {localize(locale, "成功请求", "Successful Requests")}: {primaryVerifiedEntry.successLikeCount}/{primaryVerifiedEntry.requestCount}
                </p>
              </div>
              <div className="row-meta">
                <span>{renderVerificationState(primaryVerifiedEntry.verificationState, locale)}</span>
                <code>{primaryVerifiedEntry.latestSuccessAt}</code>
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onOpenTraffic(primaryVerifiedEntry.appCode)}
                >
                  {localize(locale, "查看这条链路", "Inspect This Path")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="quickstart-grid">
        <article className="quickstart-step">
          <span className="quickstart-step-index">01</span>
          <strong>{localize(locale, "服务就绪", "Service Ready")}</strong>
          <p>{renderStepState(serviceReady, locale)}</p>
          <p>
            {snapshot.serviceDoctor.checks.service.active
              ? localize(locale, "daemon 当前已处于活动状态。", "The daemon service is currently active.")
              : localize(locale, "优先把 user service 与环境文件对齐。", "Align the user service and env file first.")}
          </p>
          <div className="quick-action-row">
            <button
              className="inline-action"
              type="button"
              disabled={isWorking || !snapshot.serviceDoctor.checks.systemd.available}
              onClick={onSyncServiceEnv}
            >
              {localize(locale, "同步服务环境", "Sync Service Env")}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={isWorking || !snapshot.serviceDoctor.checks.systemd.available}
              onClick={onInstallSystemService}
            >
              {localize(locale, "安装 User Service", "Install User Service")}
            </button>
          </div>
        </article>

        <article className="quickstart-step">
          <span className="quickstart-step-index">02</span>
          <strong>{localize(locale, "控制令牌", "Control Token")}</strong>
          <p>{renderStepState(tokenReady, locale)}</p>
          <p>
            {localize(locale, "当前脱敏值", "Current masked value")}: <code>{snapshot.controlAuth.maskedToken}</code>
          </p>
          <p>
            {snapshot.controlAuth.canRotate
              ? localize(locale, "当前令牌由本地数据库托管，可直接在控制台轮换。", "The token is managed in the local database and can be rotated in the console.")
              : localize(locale, "当前令牌由环境变量托管，后续轮换需要改 daemon 启动环境。", "The token is env-managed and must be rotated through daemon startup env.")}
          </p>
        </article>

        <article className="quickstart-step quickstart-step-wide">
          <span className="quickstart-step-index">03</span>
          <strong>{localize(locale, "接管 CLI", "Take Over CLI")}</strong>
          <p>
            {manageableDiscoveries.length > 0
              ? localize(locale, "优先接管你真正要使用的 CLI，先预检，再确认应用。", "Start with the CLI you actually use, preview first, then confirm takeover.")
              : localize(locale, "当前还没有发现可接管的本机 CLI。", "No takeover-capable local CLI has been discovered yet.")}
          </p>
          <div className="list">
            {manageableDiscoveries.map((item) => {
              const preview = hostApplyPreviewByApp[item.appCode];
              const verification = verificationEntryByApp.get(item.appCode) ?? null;

              return (
                <div className="list-row" key={`quickstart-${item.appCode}`}>
                  <div>
                    <strong>{item.appCode}</strong>
                    <p>
                      {item.integrationState === "managed"
                        ? renderVerificationState(
                            verification?.verificationState ?? "managed-no-traffic",
                            locale
                          )
                        : preview
                          ? localize(
                              locale,
                              `预检已生成 / 风险 ${preview.riskLevel}`,
                              `Preview ready / ${preview.riskLevel} risk`
                            )
                          : renderVerificationState("not-managed", locale)}
                    </p>
                    <p>{item.currentTarget ?? item.configPath ?? item.configLocationHint ?? localize(locale, "未发现", "Not found")}</p>
                    {verification ? <p>{verification.summary}</p> : null}
                    {verification && item.integrationState === "managed" ? (
                      <p>
                        {localize(locale, "请求验证", "Request Validation")}: {verification.successLikeCount}/{verification.requestCount}
                        {verification.failureLikeCount > 0 ? ` / ${localize(locale, "失败", "Failures")} ${verification.failureLikeCount}` : ""}
                      </p>
                    ) : null}
                    {verification?.recentEventSummary ? (
                      <p>
                        {localize(locale, "最近接管事件", "Recent Takeover Event")}: {verification.recentEventSummary}
                      </p>
                    ) : null}
                    {verification?.recentSuccessSummary ? (
                      <p>
                        {localize(locale, "最近成功请求", "Most Recent Successful Request")}: {verification.recentSuccessSummary}
                      </p>
                    ) : null}
                  </div>
                  <div className="row-meta">
                    {item.integrationState === "managed" ? (
                      <>
                        {(verification?.recommendedActions.filter(
                          (action) => action === "open-runtime" || action === "open-traffic"
                        ) ?? ["open-traffic"]
                        ).slice(0, 2).map((action) => (
                          <button
                            className="inline-action"
                            type="button"
                            key={`quickstart-action-${item.appCode}-${action}`}
                            disabled={isWorking}
                            onClick={() => {
                              if (action === "open-runtime") {
                                onOpenRuntime();
                                return;
                              }
                              onOpenTraffic(item.appCode);
                            }}
                          >
                            {renderActionLabel(action, locale)}
                          </button>
                        ))}
                        <button className="inline-action" type="button" disabled={isWorking} onClick={() => onRollbackHostCliManagedConfig(item.appCode)}>
                          {localize(locale, "回滚", "Rollback")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="inline-action" type="button" disabled={isWorking} onClick={() => onPreviewHostCliManagedConfig(item.appCode)}>
                          {preview
                            ? localize(locale, "刷新预检", "Refresh Preview")
                            : localize(locale, "生成预检", "Generate Preview")}
                        </button>
                        {preview ? (
                          <button className="inline-action" type="button" disabled={isWorking} onClick={() => onApplyHostCliManagedConfig(item.appCode)}>
                            {localize(locale, "确认接管", "Confirm Takeover")}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="quickstart-step">
          <span className="quickstart-step-index">04</span>
          <strong>{localize(locale, "验证代理", "Verify Proxy")}</strong>
          <p>{renderStepState(snapshot.proxyRuntime.runtimeState === "running", locale)}</p>
          <p>
            {localize(locale, "运行态", "Runtime")}: <code>{snapshot.proxyRuntime.runtimeState}</code>
          </p>
          <div className="quick-action-row">
            <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRuntime}>
              {localize(locale, "查看运行态", "Open Runtime")}
            </button>
            {primaryDiscovery ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => onOpenTraffic(primaryDiscovery.appCode)}
              >
                {localize(locale, "查看请求结果", "Open Requests")}
              </button>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
};
