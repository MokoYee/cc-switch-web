import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import type { HostCliApplyPreview, LocaleCode } from "@cc-switch-web/shared";
import { buildPromptGovernanceEntries, buildSkillGovernanceEntries } from "../lib/buildAssetGovernanceEntries.js";
import { buildMcpGovernanceEntries } from "../lib/buildMcpGovernanceEntries.js";
import { buildRequestPrimaryCause } from "../lib/buildRoutingPrimaryCause.js";
import { buildTrafficTakeoverEntries } from "../lib/buildTrafficTakeoverEntries.js";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";
import type { DashboardFollowUpNotice } from "../lib/dashboardFollowUp.js";
import { buildHostTakeoverPreviewNotice } from "../lib/buildHostTakeoverPreview.js";

type GovernanceQueueItem = {
  readonly id: string;
  readonly priority: number;
  readonly level: "low" | "medium" | "high";
  readonly category: "provider" | "quota" | "host" | "workspace" | "session" | "mcp" | "asset";
  readonly title: string;
  readonly summary: string;
  readonly notice: {
    readonly level: "low" | "medium" | "high";
    readonly summary: string;
    readonly suggestions: string[];
  };
  readonly validationItems: readonly string[];
  readonly runbook: readonly string[];
  readonly followUpNotice: DashboardFollowUpNotice;
  readonly actionLabel: string;
  readonly onAction: () => void;
  readonly secondaryLabel?: string;
  readonly onSecondaryAction?: () => void;
};

type GovernanceCampaign = {
  readonly id: string;
  readonly level: "low" | "medium" | "high";
  readonly title: string;
  readonly summary: string;
  readonly checklist: readonly string[];
  readonly queueItemIds: readonly string[];
  readonly startLabel: string;
  readonly onStart: () => void;
};

export type ActiveGovernanceCampaign = {
  readonly id: string;
  readonly level: "low" | "medium" | "high";
  readonly title: string;
  readonly summary: string;
  readonly checklist: readonly string[];
  readonly queueItemIds: readonly string[];
};

type ActiveCampaignEvidence = {
  readonly level: "low" | "medium" | "high";
  readonly title: string;
  readonly summary: string;
  readonly validationItems: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly level: "low" | "medium" | "high";
  }[];
};

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const uniqueStrings = (items: readonly string[]): string[] => Array.from(new Set(items));

type OverviewGovernancePanelsProps = {
  readonly snapshot: DashboardSnapshot;
  readonly hasProviders: boolean;
  readonly hasBindings: boolean;
  readonly hasFailoverChains: boolean;
  readonly isWorking: boolean;
  readonly quotaStatusByApp: Map<string, DashboardSnapshot["appQuotaStatuses"][number]>;
  readonly formatNumber: (value: number) => string;
  readonly formatPercent: (value: number | null) => string;
  readonly renderProviderType: (provider: DashboardSnapshot["providers"][number]) => string;
  readonly renderBindingMode: (binding: DashboardSnapshot["bindings"][number]) => string;
  readonly renderQuotaState: (
    state: DashboardSnapshot["appQuotaStatuses"][number]["currentState"]
  ) => string;
  readonly renderEffectiveContextSource: (
    source: DashboardSnapshot["contextRoutingExplanations"][number]["effectiveSource"]
  ) => string;
  readonly renderContextRoutingStepKind: (
    kind: DashboardSnapshot["contextRoutingExplanations"][number]["steps"][number]["kind"]
  ) => string;
  readonly locale: LocaleCode;
  readonly onEditProvider: (item: DashboardSnapshot["providers"][number]) => void;
  readonly onDeleteProvider: (id: string) => void;
  readonly onEditBinding: (item: DashboardSnapshot["bindings"][number]) => void;
  readonly onDeleteBinding: (id: string) => void;
  readonly onEditAppQuota: (item: DashboardSnapshot["appQuotas"][number]) => void;
  readonly onDeleteAppQuota: (id: string) => void;
  readonly onOpenRoutingForms: () => void;
  readonly onOpenAssetForms: () => void;
  readonly onOpenMcpForms: () => void;
  readonly onOpenRecoveryPanel: () => void;
  readonly onOpenProviderRuntime: (providerId: string) => void;
  readonly onPreviewHostCliManagedConfig: (appCode: string) => void;
  readonly onApplyHostCliManagedConfig: (appCode: string) => void;
  readonly onEditFailoverChain: (item: DashboardSnapshot["failoverChains"][number]) => void;
  readonly onEditWorkspace: (item: DashboardSnapshot["workspaces"][number]) => void;
  readonly onEditSession: (item: DashboardSnapshot["sessionRecords"][number]) => void;
  readonly onEditPromptTemplate: (item: DashboardSnapshot["promptTemplates"][number]) => void;
  readonly onEditSkill: (item: DashboardSnapshot["skills"][number]) => void;
  readonly onClearActiveWorkspace: () => void;
  readonly onClearActiveSession: () => void;
  readonly onArchiveStaleSessions: () => void;
  readonly onActivateGovernanceQueueNotice: (notice: DashboardFollowUpNotice) => void;
  readonly activeCampaignId: string | null;
  readonly activeCampaignEvidence: ActiveCampaignEvidence | null;
  readonly onActivateCampaign: (campaign: ActiveGovernanceCampaign | null) => void;
  readonly hostApplyPreviewByApp: Record<string, HostCliApplyPreview | null>;
  readonly t: (key: string) => string;
};

export const OverviewGovernancePanels = ({
  snapshot,
  hasProviders,
  hasBindings,
  hasFailoverChains,
  isWorking,
  quotaStatusByApp,
  formatNumber,
  formatPercent,
  renderProviderType,
  renderBindingMode,
  renderQuotaState,
  renderEffectiveContextSource,
  renderContextRoutingStepKind,
  locale,
  onEditProvider,
  onDeleteProvider,
  onEditBinding,
  onDeleteBinding,
  onEditAppQuota,
  onDeleteAppQuota,
  onOpenRoutingForms,
  onOpenAssetForms,
  onOpenMcpForms,
  onOpenRecoveryPanel,
  onOpenProviderRuntime,
  onPreviewHostCliManagedConfig,
  onApplyHostCliManagedConfig,
  onEditFailoverChain,
  onEditWorkspace,
  onEditSession,
  onEditPromptTemplate,
  onEditSkill,
  onClearActiveWorkspace,
  onClearActiveSession,
  onArchiveStaleSessions,
  onActivateGovernanceQueueNotice,
  activeCampaignId,
  activeCampaignEvidence,
  onActivateCampaign,
  hostApplyPreviewByApp,
  t
}: OverviewGovernancePanelsProps): JSX.Element => {
  const governanceQueueItems: GovernanceQueueItem[] = [];
  const promptGovernanceEntries = buildPromptGovernanceEntries(snapshot, locale);
  const skillGovernanceEntries = buildSkillGovernanceEntries(snapshot, locale);
  const mcpGovernanceEntries = buildMcpGovernanceEntries(snapshot, locale);
  const takeoverEntries = buildTrafficTakeoverEntries(snapshot, locale);

  const unhealthyProviders = snapshot.providerDiagnostics
    .filter(
      (item) =>
        item.requestCount > 0 &&
        (item.diagnosisStatus === "down" || item.diagnosisStatus === "degraded")
    )
    .sort((left, right) => right.requestCount - left.requestCount)
    .slice(0, 2);

  for (const item of unhealthyProviders) {
    const providerRequestCause = buildRequestPrimaryCause(
      snapshot.proxyRequestLogs.filter((log) => log.providerId === item.providerId),
      locale
    );
    const failover = item.bindingAppCodes
      .map((appCode) => snapshot.failoverChains.find((failoverItem) => failoverItem.appCode === appCode))
      .find((target): target is DashboardSnapshot["failoverChains"][number] => target !== undefined);
    governanceQueueItems.push({
      id: `provider-${item.providerId}`,
      priority: item.diagnosisStatus === "down" ? 0 : 1,
      level: item.diagnosisStatus === "down" ? "high" : "medium",
      category: "provider",
      title: locale === "zh-CN" ? `Provider ${item.providerId} 仍在接流量` : `Provider ${item.providerId} Still Receiving Traffic`,
      summary:
        locale === "zh-CN"
          ? `${item.diagnosisStatus} / ${formatNumber(item.requestCount)} 次请求 / 最近失败时间 ${item.lastFailureAt ?? "none"}。${providerRequestCause?.summary ?? "优先看运行时，再决定是否隔离或调整故障转移。"}`
          : `${item.diagnosisStatus} / ${formatNumber(item.requestCount)} requests / last failure ${item.lastFailureAt ?? "none"}. ${providerRequestCause?.summary ?? "Open runtime first, then decide whether to isolate or adjust failover."}`,
      notice: {
        level: providerRequestCause?.level ?? (item.diagnosisStatus === "down" ? "high" : "medium"),
        summary:
          providerRequestCause?.summary ??
          localize(
            locale,
            "高频流量仍在命中异常 Provider，应该先确认运行态，再决定是隔离、恢复还是调整链路。",
            "High-volume traffic is still hitting an unhealthy provider. Confirm runtime first, then decide whether to isolate, recover, or reroute."
          ),
        suggestions: [
          ...(providerRequestCause?.suggestions.slice(0, 2) ?? [
            localize(
              locale,
              `先检查 Provider runtime 与最近失败信号，目标对象：${item.providerId}。`,
              `Inspect provider runtime and recent failure signals first for ${item.providerId}.`
            )
          ]),
          failover
            ? localize(
                locale,
                `再检查故障转移链 ${failover.id} 是否足够承接流量。`,
                `Then inspect failover chain ${failover.id} to ensure it can absorb traffic.`
              )
            : localize(
                locale,
                "当前没有可直接复核的故障转移链，必要时回到 Provider / Binding 手工修正。",
                "There is no failover chain to validate directly; return to Provider or Binding controls if manual correction is needed."
              )
        ]
      },
      validationItems: [
        localize(
          locale,
          "Provider 诊断状态恢复到 healthy / recovering，且不再持续扩大失败面。",
          "Provider diagnosis returns to healthy or recovering and is no longer expanding failures."
        ),
        localize(
          locale,
          "相关应用的新请求不再持续落到 error、timeout 或 failover 尾部。",
          "New requests for related apps stop clustering into error, timeout, or terminal failover."
        )
      ],
      runbook: [
        localize(locale, "先打开运行时确认诊断状态和熔断状态。", "Open runtime first to confirm diagnosis and circuit state."),
        localize(locale, "再看失败日志确认真实请求是否仍在失败。", "Then inspect failure logs to confirm whether real requests are still failing."),
        localize(locale, "最后决定是否编辑 Provider 或故障转移链。", "Finally decide whether to edit the provider or the failover chain.")
      ],
      followUpNotice: {
        category: "provider",
        title: locale === "zh-CN" ? `Provider ${item.providerId} 治理闭环` : `Provider ${item.providerId} Governance Loop`,
        summary: localize(
          locale,
          "优先确认 Provider runtime、失败请求和健康事件是否同步收敛，再决定是否改配置。",
          "Confirm provider runtime, failure requests, and health events are converging before deciding on config changes."
        ),
        actions: [
          {
            id: `queue-provider-runtime-${item.providerId}`,
            label: locale === "zh-CN" ? "查看 Provider 运行态" : "Open Provider Runtime",
            kind: "provider-runtime",
            providerId: item.providerId
          },
          {
            id: `queue-provider-logs-${item.providerId}`,
            label: locale === "zh-CN" ? "查看失败请求" : "Open Failure Logs",
            kind: "provider-logs",
            providerId: item.providerId
          },
          {
            id: `queue-provider-audit-${item.providerId}`,
            label: locale === "zh-CN" ? "查看健康审计" : "Open Health Audit",
            kind: "audit",
            filters: {
              source: "provider-health",
              providerId: item.providerId
            }
          }
        ]
      },
      actionLabel: locale === "zh-CN" ? "打开运行时" : "Open Runtime",
      onAction: () => onOpenProviderRuntime(item.providerId),
      secondaryLabel: failover
        ? locale === "zh-CN"
          ? "检查故障转移"
          : "Review Failover"
        : locale === "zh-CN"
          ? "编辑 Provider"
          : "Edit Provider",
      onSecondaryAction: () => {
        if (failover) {
          onEditFailoverChain(failover);
          return;
        }
        const provider = snapshot.providers.find((providerItem) => providerItem.id === item.providerId);
        if (provider) {
          onEditProvider(provider);
          return;
        }
        onOpenRoutingForms();
      }
    });
  }

  const quotaHotspots = snapshot.appQuotaStatuses
    .filter((item) => item.currentState === "exceeded" || item.currentState === "warning")
    .sort((left, right) => {
      const leftUtilization = Math.max(left.requestUtilization ?? 0, left.tokenUtilization ?? 0);
      const rightUtilization = Math.max(right.requestUtilization ?? 0, right.tokenUtilization ?? 0);
      return rightUtilization - leftUtilization;
    })
    .slice(0, 2);

  for (const item of quotaHotspots) {
    const appCode = item.quota.appCode;
    const quotaRequestCause = buildRequestPrimaryCause(
      snapshot.proxyRequestLogs.filter((log) => log.appCode === appCode),
      locale
    );
    const quota = snapshot.appQuotas.find((quotaItem) => quotaItem.appCode === appCode);
    governanceQueueItems.push({
      id: `quota-${appCode}`,
      priority: item.currentState === "exceeded" ? 2 : 3,
      level: item.currentState === "exceeded" ? "high" : "medium",
      category: "quota",
      title: locale === "zh-CN" ? `${appCode} 配额压力过高` : `${appCode} Quota Pressure`,
      summary:
        locale === "zh-CN"
          ? `请求使用 ${formatNumber(item.requestsUsed)} / token 使用 ${formatNumber(item.tokensUsed)}，当前状态 ${renderQuotaState(item.currentState)}。`
          : `${formatNumber(item.requestsUsed)} requests / ${formatNumber(item.tokensUsed)} tokens, current state ${renderQuotaState(item.currentState)}.`,
      notice: {
        level: quotaRequestCause?.level ?? (item.currentState === "exceeded" ? "high" : "medium"),
        summary:
          quotaRequestCause?.code === "quota-policy"
            ? quotaRequestCause.summary
            : localize(
                locale,
                "配额已经接近或进入拒绝区间，应尽快决定是扩容上限、切分流量还是通过恢复入口回滚配置。",
                "Quota is near or inside the rejection zone. Decide quickly whether to raise limits, split traffic, or roll back via recovery."
              ),
        suggestions: [
          ...(quotaRequestCause?.code === "quota-policy"
            ? quotaRequestCause.suggestions.slice(0, 2)
            : []),
          localize(
            locale,
            `先核对当前用量：${formatPercent(Math.max(item.requestUtilization ?? 0, item.tokenUtilization ?? 0))}。`,
            `Review current utilization first: ${formatPercent(Math.max(item.requestUtilization ?? 0, item.tokenUtilization ?? 0))}.`
          ),
          localize(
            locale,
            "如果这次异常来自错误配置或误导入，直接去恢复入口更快。",
            "If the spike was caused by bad config or a bad import, recovery is usually the faster path."
          )
        ]
      },
      validationItems: [
        localize(locale, "配额状态回到 healthy 或至少退出 exceeded。", "Quota state returns to healthy or at least exits exceeded."),
        localize(locale, "相关应用不再出现新的 quota-rejected 请求。", "The related app stops generating new quota-rejected requests.")
      ],
      runbook: [
        localize(locale, "先调整配额或确认是否存在误配置。", "Adjust quota first or confirm whether the issue comes from misconfiguration."),
        localize(locale, "再看恢复入口，判断是否需要回滚最近变更。", "Then inspect recovery to decide whether a recent change should be rolled back."),
        localize(locale, "最后回到请求面确认拒绝流量已经下降。", "Finally return to request traffic and confirm rejections are falling.")
      ],
      followUpNotice: {
        category: "app-traffic",
        title: locale === "zh-CN" ? `${appCode} 配额治理闭环` : `${appCode} Quota Governance Loop`,
        summary: localize(
          locale,
          "先看配额与请求拒绝，再决定是放宽上限还是回滚最近配置变更。",
          "Inspect quota state and request rejections first, then decide whether to raise limits or roll back recent config."
        ),
        actions: [
          {
            id: `queue-quota-logs-${appCode}`,
            label: locale === "zh-CN" ? "查看应用请求" : "Open App Requests",
            kind: "app-logs",
            appCode
          },
          {
            id: `queue-quota-audit-${appCode}`,
            label: locale === "zh-CN" ? "查看配额审计" : "Open Quota Audit",
            kind: "audit",
            filters: {
              source: "quota",
              appCode
            }
          },
          {
            id: `queue-quota-recovery-${appCode}`,
            label: locale === "zh-CN" ? "打开恢复入口" : "Open Recovery",
            kind: "section",
            section: "recovery"
          }
        ]
      },
      actionLabel: locale === "zh-CN" ? "调整配额" : "Adjust Quota",
      onAction: () => {
        if (quota) {
          onEditAppQuota(quota);
        } else {
          onOpenRoutingForms();
        }
      },
      secondaryLabel: locale === "zh-CN" ? "查看恢复入口" : "Open Recovery",
      onSecondaryAction: onOpenRecoveryPanel
    });
  }

  const unmanagedDiscoveries = snapshot.discoveries
    .filter(
      (item) =>
        item.discovered &&
        item.takeoverSupported &&
        item.integrationState !== "managed"
    )
    .slice(0, 2);

  for (const item of unmanagedDiscoveries) {
    const preview = hostApplyPreviewByApp[item.appCode];
    const previewNotice = preview ? buildHostTakeoverPreviewNotice(preview, locale) : null;
    const takeoverEntry = takeoverEntries.find((entry) => entry.appCode === item.appCode) ?? null;
    governanceQueueItems.push({
      id: `discovery-${item.appCode}`,
      priority: 4,
      level: preview?.riskLevel ?? "medium",
      category: "host",
      title: locale === "zh-CN" ? `${item.appCode} 尚未完成宿主机接管` : `${item.appCode} Host Takeover Not Applied`,
      summary:
        preview?.summary[0] ??
        (locale === "zh-CN"
          ? `${item.supportLevel} / ${item.takeoverMethod}。接入能力已识别，但当前仍未进入托管态。`
          : `${item.supportLevel} / ${item.takeoverMethod}. The integration is detected but still not managed.`),
      notice:
        previewNotice ?? {
          level: takeoverEntry?.level ?? "medium",
          summary:
            takeoverEntry?.summary ??
            localize(
              locale,
              "宿主机接管仍未完成，意味着控制台配置和真实 CLI 运行面之间还没有完全闭环。",
              "Host takeover is not complete, which means console config and the real CLI runtime are not yet fully closed-loop."
            ),
          suggestions: [
            ...(takeoverEntry
              ? takeoverEntry.summary.includes("Binding")
                ? [
                    localize(locale, "先补主路由 Binding，再生成宿主机接管预检。", "Add the primary binding first, then generate the host takeover preview.")
                  ]
                : [
                    localize(locale, "先生成宿主机接管预检，再决定是否应用接管。", "Generate the host takeover preview first, then decide whether to apply it.")
                  ]
              : [
                  localize(locale, "先生成宿主机接管预检，再决定是否应用接管。", "Generate the host takeover preview first, then decide whether to apply it.")
                ]),
            localize(locale, "接管后立即回看真实请求，不要只停留在配置已写入。", "Review real requests immediately after takeover instead of stopping at config write success."),
            localize(locale, "如果同时涉及 MCP，顺手检查宿主机 MCP 修复区是否存在残留冲突。", "If MCP is involved, also inspect host MCP repair for residual conflicts.")
          ]
        },
      validationItems:
        preview?.validationChecklist ?? [
          localize(locale, "目标 CLI 进入 managed 状态。", "The target CLI enters managed state."),
          localize(locale, "接管后控制台与宿主机配置不再漂移。", "After takeover, console config and host config stop drifting.")
        ],
      runbook:
        preview?.runbook ?? [
          localize(locale, "先生成接管预检并确认风险等级。", "Generate the takeover preview and confirm the risk level."),
          localize(locale, "再处理必要的宿主机配置落盘或回滚。", "Then apply the required host-side config or rollback."),
          localize(locale, "最后检查 MCP 或请求面是否与托管态对齐。", "Finally inspect MCP or request traffic to confirm alignment with managed state.")
        ],
      followUpNotice: {
        category: "app-traffic",
        title: locale === "zh-CN" ? `${item.appCode} 宿主机接管闭环` : `${item.appCode} Host Takeover Loop`,
        summary: localize(
          locale,
          "接管后应同时验证宿主机集成事件和真实请求面，确认控制台配置已经真正接管 CLI 运行面。",
          "After takeover, validate both host integration events and live request traffic to confirm the console has actually taken over the CLI runtime."
        ),
        actions: [
          {
            id: `queue-host-routing-${item.appCode}`,
            label: locale === "zh-CN" ? "打开路由/接管" : "Open Takeover Controls",
            kind: "section",
            section: "routing"
          },
          {
            id: `queue-host-audit-${item.appCode}`,
            label: locale === "zh-CN" ? "查看接管审计" : "Open Host Audit",
            kind: "audit",
            filters: {
              source: "host-integration",
              appCode: item.appCode
            }
          },
          {
            id: `queue-host-logs-${item.appCode}`,
            label: locale === "zh-CN" ? "查看应用请求" : "Open App Requests",
            kind: "app-logs",
            appCode: item.appCode
          }
        ]
      },
      actionLabel:
        preview
          ? locale === "zh-CN"
            ? "确认应用接管"
            : "Confirm Takeover"
          : locale === "zh-CN"
            ? "生成接管预检"
            : "Generate Preview",
      onAction: () => {
        if (preview) {
          onApplyHostCliManagedConfig(item.appCode);
          return;
        }
        onPreviewHostCliManagedConfig(item.appCode);
      },
      secondaryLabel: locale === "zh-CN" ? "打开路由/接管" : "Open Takeover Controls",
      onSecondaryAction: onOpenRoutingForms
    });
  }

  const workspaceHotspot = [...snapshot.runtimeContexts.workspaces]
    .filter((item) => item.errorCount > 0)
    .sort((left, right) => right.errorCount - left.errorCount)[0];

  if (workspaceHotspot) {
    const workspace = snapshot.workspaces.find((item) => item.id === workspaceHotspot.workspaceId);
    const workspaceRequestCause = buildRequestPrimaryCause(
      snapshot.proxyRequestLogs.filter((log) => log.workspaceId === workspaceHotspot.workspaceId),
      locale
    );
    governanceQueueItems.push({
      id: `workspace-${workspaceHotspot.workspaceId}`,
      priority: workspaceHotspot.errorCount >= 5 ? 2 : 4,
      level: workspaceHotspot.errorCount >= 5 ? "high" : "medium",
      category: "workspace",
      title:
        locale === "zh-CN"
          ? `工作区 ${workspaceHotspot.workspaceName} 错误聚集`
          : `Workspace ${workspaceHotspot.workspaceName} Error Hotspot`,
      summary:
        locale === "zh-CN"
          ? `${formatNumber(workspaceHotspot.errorCount)} 次错误 / ${formatNumber(workspaceHotspot.requestCount)} 次请求 / 最近 Provider ${workspaceHotspot.lastProviderId ?? "none"}。${workspaceRequestCause?.summary ?? ""}`
          : `${formatNumber(workspaceHotspot.errorCount)} errors / ${formatNumber(workspaceHotspot.requestCount)} requests / latest provider ${workspaceHotspot.lastProviderId ?? "none"}. ${workspaceRequestCause?.summary ?? ""}`,
      notice: {
        level: workspaceRequestCause?.level ?? (workspaceHotspot.errorCount >= 5 ? "high" : "medium"),
        summary:
          workspaceRequestCause?.summary ??
          localize(
            locale,
            "这个工作区已经形成错误热点，应优先确认默认 Provider、Prompt、Skill 和会话继承是否仍然有效。",
            "This workspace has become an error hotspot. Confirm its default provider, prompt, skill, and session inheritance first."
          ),
        suggestions: [
          ...(workspaceRequestCause?.suggestions.slice(0, 2) ?? [
            localize(locale, "先修工作区默认对象，再检查会话是否继承了错误上下文。", "Fix workspace defaults first, then inspect whether sessions inherited bad context.")
          ]),
          localize(locale, "如果错误来自最近变更，可同步复核恢复入口。", "If the hotspot came from a recent change, review recovery in parallel.")
        ]
      },
      validationItems: [
        localize(locale, "工作区 runtime 错误数开始下降。", "Workspace runtime error count starts dropping."),
        localize(locale, "新请求重新命中正确 Provider 和上下文对象。", "New requests resolve to the correct provider and context assets again.")
      ],
      runbook: [
        localize(locale, "先编辑工作区默认对象。", "Edit workspace defaults first."),
        localize(locale, "再进入上下文资产区检查关联 Prompt / Skill。", "Then inspect linked prompt and skill in context assets."),
        localize(locale, "最后回到工作区 runtime 看错误是否收敛。", "Finally return to workspace runtime and verify error convergence.")
      ],
      followUpNotice: {
        category: "workspace",
        title:
          locale === "zh-CN"
            ? `工作区 ${workspaceHotspot.workspaceName} 治理闭环`
            : `Workspace ${workspaceHotspot.workspaceName} Governance Loop`,
        summary: localize(
          locale,
          "优先验证工作区 runtime 和工作区请求，再决定是否继续调整默认对象。",
          "Validate workspace runtime and workspace-scoped requests first, then decide whether more default object changes are needed."
        ),
        actions: [
          {
            id: `queue-workspace-runtime-${workspaceHotspot.workspaceId}`,
            label: locale === "zh-CN" ? "查看工作区运行态" : "Open Workspace Runtime",
            kind: "workspace-runtime",
            workspaceId: workspaceHotspot.workspaceId
          },
          {
            id: `queue-workspace-logs-${workspaceHotspot.workspaceId}`,
            label: locale === "zh-CN" ? "查看工作区请求" : "Open Workspace Requests",
            kind: "workspace-logs",
            workspaceId: workspaceHotspot.workspaceId
          },
          {
            id: `queue-workspace-assets-${workspaceHotspot.workspaceId}`,
            label: locale === "zh-CN" ? "打开上下文资产" : "Open Context Assets",
            kind: "section",
            section: "assets"
          }
        ]
      },
      actionLabel: locale === "zh-CN" ? "编辑工作区" : "Edit Workspace",
      onAction: () => {
        if (workspace) {
          onEditWorkspace(workspace);
        } else {
          onOpenAssetForms();
        }
      },
      secondaryLabel: locale === "zh-CN" ? "修上下文" : "Fix Context",
      onSecondaryAction: onOpenAssetForms
    });
  }

  const sessionHotspot = [...snapshot.runtimeContexts.sessions]
    .filter((item) => item.errorCount > 0 || snapshot.sessionGovernance.staleSessionIds.includes(item.sessionId))
    .sort((left, right) => {
      const leftScore = left.errorCount + (snapshot.sessionGovernance.staleSessionIds.includes(left.sessionId) ? 3 : 0);
      const rightScore = right.errorCount + (snapshot.sessionGovernance.staleSessionIds.includes(right.sessionId) ? 3 : 0);
      return rightScore - leftScore;
    })[0];

  if (sessionHotspot) {
    const session = snapshot.sessionRecords.find((item) => item.id === sessionHotspot.sessionId);
    const isStale = snapshot.sessionGovernance.staleSessionIds.includes(sessionHotspot.sessionId);
    const sessionRequestCause = buildRequestPrimaryCause(
      snapshot.proxyRequestLogs.filter((log) => log.sessionId === sessionHotspot.sessionId),
      locale
    );
    governanceQueueItems.push({
      id: `session-${sessionHotspot.sessionId}`,
      priority: isStale ? 3 : 5,
      level: isStale ? "medium" : sessionHotspot.errorCount >= 4 ? "high" : "medium",
      category: "session",
      title:
        locale === "zh-CN"
          ? `会话 ${sessionHotspot.title} 需要治理`
          : `Session ${sessionHotspot.title} Needs Governance`,
      summary:
        locale === "zh-CN"
          ? `${formatNumber(sessionHotspot.errorCount)} 次错误 / 状态 ${sessionHotspot.status}${isStale ? " / 已陈旧" : ""}。${sessionRequestCause?.summary ?? ""}`
          : `${formatNumber(sessionHotspot.errorCount)} errors / status ${sessionHotspot.status}${isStale ? " / stale" : ""}. ${sessionRequestCause?.summary ?? ""}`,
      notice: {
        level:
          isStale
            ? "medium"
            : sessionRequestCause?.level ?? (sessionHotspot.errorCount >= 4 ? "high" : "medium"),
        summary: isStale
          ? localize(
              locale,
              "这个会话已经陈旧，继续保留只会扩大上下文噪音，应尽快归档或修正继承关系。",
              "This session is stale. Keeping it around only expands context noise, so archive it or fix inheritance quickly."
            )
          : sessionRequestCause?.summary ??
            localize(
              locale,
              "会话级错误已经开始聚集，优先确认它是否错误覆盖了工作区默认对象。",
              "Session-level errors are clustering. Confirm whether it overrides workspace defaults incorrectly."
            ),
        suggestions: [
          ...(!isStale && sessionRequestCause
            ? sessionRequestCause.suggestions.slice(0, 2)
            : [localize(locale, "先查看会话配置和当前状态。", "Inspect the session config and current state first.")]),
          isStale
            ? localize(locale, "如果没有保留价值，直接归档比继续修更高效。", "If it has no retention value, archiving is more efficient than continued repair.")
            : localize(locale, "如果是继承污染，回到工作区默认对象一起修。", "If inheritance is polluted, repair the workspace defaults together.")
        ]
      },
      validationItems: [
        localize(locale, "会话不再命中错误上下文或无效覆盖。", "The session stops resolving to bad context or invalid overrides."),
        isStale
          ? localize(locale, "陈旧会话已被归档，不再继续污染治理列表。", "The stale session is archived and no longer pollutes the governance list.")
          : localize(locale, "会话 runtime 错误数不再继续上升。", "Session runtime error count stops climbing.")
      ],
      runbook: [
        localize(locale, "先编辑会话或确认是否应该归档。", "Edit the session first or decide whether it should be archived."),
        localize(locale, "再检查它继承的工作区对象是否正确。", "Then inspect whether the inherited workspace objects are correct."),
        localize(locale, "最后回到会话 runtime 看错误与状态是否收敛。", "Finally return to session runtime and confirm status and errors have converged.")
      ],
      followUpNotice: {
        category: "session",
        title:
          locale === "zh-CN"
            ? `会话 ${sessionHotspot.title} 治理闭环`
            : `Session ${sessionHotspot.title} Governance Loop`,
        summary: localize(
          locale,
          "优先验证会话 runtime 和会话请求是否恢复，再决定继续保留还是归档。",
          "Validate session runtime and session-scoped requests first, then decide whether to keep or archive it."
        ),
        actions: [
          {
            id: `queue-session-runtime-${sessionHotspot.sessionId}`,
            label: locale === "zh-CN" ? "查看会话运行态" : "Open Session Runtime",
            kind: "session-runtime",
            sessionId: sessionHotspot.sessionId
          },
          {
            id: `queue-session-logs-${sessionHotspot.sessionId}`,
            label: locale === "zh-CN" ? "查看会话请求" : "Open Session Requests",
            kind: "session-logs",
            sessionId: sessionHotspot.sessionId
          },
          {
            id: `queue-session-assets-${sessionHotspot.sessionId}`,
            label: locale === "zh-CN" ? "打开上下文资产" : "Open Context Assets",
            kind: "section",
            section: "assets"
          }
        ]
      },
      actionLabel: locale === "zh-CN" ? "编辑会话" : "Edit Session",
      onAction: () => {
        if (session) {
          onEditSession(session);
        } else {
          onOpenAssetForms();
        }
      },
      secondaryLabel: locale === "zh-CN" ? "清理陈旧会话" : "Archive Stale Sessions",
      onSecondaryAction: onArchiveStaleSessions
    });
  }

  const assetHotspots = [
    ...promptGovernanceEntries.map((entry) => ({
      kind: "prompt" as const,
      id: entry.item.id,
      name: entry.item.name,
      appCode: entry.item.appCode,
      linkedWorkspaceIds: entry.linkedWorkspaceIds,
      linkedSessionIds: entry.linkedSessionIds,
      severityScore: (entry.item.enabled ? 0 : 3) + entry.impactScore,
      level: entry.governanceLevel,
      onAction: () => onEditPromptTemplate(entry.item)
    })),
    ...skillGovernanceEntries.map((entry) => ({
      kind: "skill" as const,
      id: entry.item.id,
      name: entry.item.name,
      appCode: entry.item.appCode,
      linkedWorkspaceIds: entry.linkedWorkspaceIds,
      linkedSessionIds: entry.linkedSessionIds,
      severityScore: (entry.item.enabled ? 0 : 3) + (entry.missingPrompt ? 3 : 0) + entry.impactScore,
      level: entry.governanceLevel,
      onAction: () => onEditSkill(entry.item)
    }))
  ]
    .filter((item) => item.severityScore > 0)
    .sort((left, right) => right.severityScore - left.severityScore);

  const assetHotspot = assetHotspots[0];

  if (assetHotspot) {
    const assetRequestCause =
      assetHotspot.appCode === null
        ? null
        : buildRequestPrimaryCause(
            snapshot.proxyRequestLogs.filter((log) => log.appCode === assetHotspot.appCode),
            locale
          );
    governanceQueueItems.push({
      id: `asset-${assetHotspot.kind}-${assetHotspot.id}`,
      priority: assetHotspot.level === "high" ? 3 : 5,
      level: assetHotspot.level,
      category: "asset",
      title:
        locale === "zh-CN"
          ? `${assetHotspot.kind === "prompt" ? "Prompt" : "Skill"} ${assetHotspot.name} 影响运行态`
          : `${assetHotspot.kind === "prompt" ? "Prompt" : "Skill"} ${assetHotspot.name} Is Affecting Runtime`,
      summary:
        locale === "zh-CN"
          ? `影响 ${formatNumber(assetHotspot.linkedWorkspaceIds.length)} 个工作区 / ${formatNumber(assetHotspot.linkedSessionIds.length)} 个会话。${assetRequestCause?.summary ?? "优先沿运行态验证，再回到资产区修正。"}`
          : `Impacts ${formatNumber(assetHotspot.linkedWorkspaceIds.length)} workspaces / ${formatNumber(assetHotspot.linkedSessionIds.length)} sessions. ${assetRequestCause?.summary ?? "Validate through runtime first, then return to assets for repair."}`,
      notice: {
        level: assetRequestCause?.level ?? assetHotspot.level,
        summary:
          assetRequestCause?.summary ??
          localize(
            locale,
            "这个上下文资产已经不只是静态配置，而是开始影响工作区或会话运行态，应优先治理。",
            "This context asset is no longer just static configuration. It is affecting workspace or session runtime and should be prioritized."
          ),
        suggestions: [
          ...(assetRequestCause?.suggestions.slice(0, 2) ?? [
            localize(locale, "先打开受影响对象确认问题是否已经进入运行态。", "Open affected objects first and confirm the issue has reached runtime.")
          ]),
          localize(locale, "如果影响面较大，优先使用批次治理入口。", "If the blast radius is broad, use the batch governance entry first.")
        ]
      },
      validationItems: [
        localize(locale, "受影响工作区或会话的错误开始下降。", "Errors in affected workspaces or sessions begin dropping."),
        localize(locale, "关联请求不再继续命中错误上下文资产。", "Related requests stop resolving to the wrong context asset.")
      ],
      runbook: [
        localize(locale, "先打开受影响工作区或会话的 runtime。", "Open affected workspace or session runtime first."),
        localize(locale, "再看请求与审计确认影响是否还在扩散。", "Then inspect requests and audit to confirm whether impact is still spreading."),
        localize(locale, "最后回到上下文资产区统一修 Prompt / Skill。", "Finally return to context assets and repair the prompt or skill consistently.")
      ],
      followUpNotice: {
        category: "asset",
        title:
          locale === "zh-CN"
            ? `${assetHotspot.kind === "prompt" ? "Prompt" : "Skill"} ${assetHotspot.name} 治理闭环`
            : `${assetHotspot.kind === "prompt" ? "Prompt" : "Skill"} ${assetHotspot.name} Governance Loop`,
        summary: localize(
          locale,
          "先验证受影响对象的 runtime 和请求，再回到资产区继续修上下文继承关系。",
          "Validate affected runtime and requests first, then return to assets and continue repairing context inheritance."
        ),
        actions: [
          ...assetHotspot.linkedWorkspaceIds.slice(0, 2).map((workspaceId) => {
            const workspace = snapshot.workspaces.find((item) => item.id === workspaceId);
            return {
              id: `queue-asset-workspace-${workspaceId}`,
              label: locale === "zh-CN" ? `查看工作区 ${workspaceId}` : `Open Workspace ${workspaceId}`,
              kind: "workspace-runtime" as const,
              workspaceId,
              ...(workspace?.appCode ? { appCode: workspace.appCode } : {})
            };
          }),
          ...assetHotspot.linkedSessionIds.slice(0, 2).map((sessionId) => {
            const session = snapshot.sessionRecords.find((item) => item.id === sessionId);
            return {
              id: `queue-asset-session-${sessionId}`,
              label: locale === "zh-CN" ? `查看会话 ${sessionId}` : `Open Session ${sessionId}`,
              kind: "session-runtime" as const,
              sessionId,
              ...(session?.appCode ? { appCode: session.appCode } : {})
            };
          }),
          ...(assetHotspot.appCode
            ? [
                {
                  id: `queue-asset-logs-${assetHotspot.id}`,
                  label: locale === "zh-CN" ? "查看关联请求" : "Open Related Requests",
                  kind: "app-logs" as const,
                  appCode: assetHotspot.appCode
                }
              ]
            : []),
          {
            id: `queue-asset-assets-${assetHotspot.id}`,
            label: locale === "zh-CN" ? "打开上下文资产" : "Open Context Assets",
            kind: "section" as const,
            section: "assets" as const
          }
        ]
      },
      actionLabel: locale === "zh-CN" ? "修上下文资产" : "Repair Context Asset",
      onAction: assetHotspot.onAction,
      secondaryLabel: locale === "zh-CN" ? "打开上下文资产" : "Open Context Assets",
      onSecondaryAction: onOpenAssetForms
    });
  }

  const mcpHotspot = mcpGovernanceEntries[0];

  if (mcpHotspot) {
    const mcpRequestCause = buildRequestPrimaryCause(
      snapshot.proxyRequestLogs.filter((log) => log.appCode === mcpHotspot.appCode),
      locale
    );
    governanceQueueItems.push({
      id: `mcp-${mcpHotspot.appCode}`,
      priority: mcpHotspot.governanceLevel === "high" ? 3 : 5,
      level: mcpHotspot.governanceLevel,
      category: "mcp",
      title:
        locale === "zh-CN"
          ? `${mcpHotspot.appCode} MCP 运行态存在冲突`
          : `${mcpHotspot.appCode} MCP Runtime Conflict`,
      summary:
        mcpRequestCause === null
          ? mcpHotspot.summary
          : locale === "zh-CN"
            ? `${mcpHotspot.summary} ${mcpRequestCause.summary}`
            : `${mcpHotspot.summary} ${mcpRequestCause.summary}`,
      notice: {
        level:
          mcpHotspot.governanceLevel === "high" || mcpRequestCause?.level === "high"
            ? "high"
            : mcpRequestCause?.level ?? mcpHotspot.governanceLevel,
        summary:
          mcpRequestCause?.summary ??
          localize(
            locale,
            "MCP 运行态和宿主机配置之间存在冲突，应该先修 runtime 主因，再决定是否做宿主机同步。",
            "There is a conflict between MCP runtime and host config. Repair the runtime cause first, then decide whether host sync is needed."
          ),
        suggestions: [
          ...(mcpRequestCause?.suggestions.slice(0, 2) ?? []),
          localize(
            locale,
            `优先看 issue code：${mcpHotspot.issueCodes.join(", ") || localize(locale, "无", "none")}。`,
            `Focus on these issue codes first: ${mcpHotspot.issueCodes.join(", ") || localize(locale, "none", "none")}.`
          ),
          mcpHotspot.item.hostState.drifted
            ? localize(locale, "宿主机已漂移，修完 binding / server 后记得复核同步结果。", "Host config is drifted; after fixing binding or server, re-check sync results.")
            : localize(locale, "如果运行态已恢复，再决定是否需要同步宿主机。", "If runtime is already healthy again, then decide whether host sync is still required.")
        ]
      },
      validationItems: [
        localize(locale, "MCP runtime issue code 数量下降或清零。", "MCP runtime issue code count drops or clears."),
        localize(locale, "宿主机 drift 状态解除，且没有新的 disabled / missing 绑定。", "Host drift clears and no new disabled or missing bindings appear.")
      ],
      runbook: [
        localize(locale, "先打开 MCP 修复区定位 server 或 binding 主因。", "Open MCP repair first to locate the primary server or binding issue."),
        localize(locale, "再决定是否需要宿主机同步。", "Then decide whether host sync is required."),
        localize(locale, "最后回到 runtime 看 issue code 和 drift 是否收敛。", "Finally return to runtime and verify issue codes and drift are converging.")
      ],
      followUpNotice: {
        category: "mcp",
        title:
          locale === "zh-CN"
            ? `${mcpHotspot.appCode} MCP 治理闭环`
            : `${mcpHotspot.appCode} MCP Governance Loop`,
        summary: localize(
          locale,
          "先验证 MCP runtime 和审计，再决定是否继续宿主机同步或修 binding/server。",
          "Validate MCP runtime and audit first, then decide whether more host sync or binding/server repair is needed."
        ),
        actions: [
          {
            id: `queue-mcp-panel-${mcpHotspot.appCode}`,
            label: locale === "zh-CN" ? "打开 MCP 面板" : "Open MCP Panel",
            kind: "section",
            section: "mcp"
          },
          {
            id: `queue-mcp-audit-${mcpHotspot.appCode}`,
            label: locale === "zh-CN" ? "查看 MCP 审计" : "Open MCP Audit",
            kind: "audit",
            filters: {
              source: "mcp",
              appCode: mcpHotspot.appCode
            }
          },
          {
            id: `queue-mcp-logs-${mcpHotspot.appCode}`,
            label: locale === "zh-CN" ? "查看应用请求" : "Open App Requests",
            kind: "app-logs",
            appCode: mcpHotspot.appCode
          }
        ]
      },
      actionLabel: locale === "zh-CN" ? "打开 MCP 修复" : "Open MCP Repair",
      onAction: onOpenMcpForms,
      secondaryLabel: locale === "zh-CN" ? "检查宿主机接管" : "Review Host Takeover",
      onSecondaryAction: onOpenRoutingForms
    });
  }

  const prioritizedQueue = governanceQueueItems
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 6);
  const highRiskQueueCount = prioritizedQueue.filter((item) => item.level === "high").length;
  const mediumRiskQueueCount = prioritizedQueue.filter((item) => item.level === "medium").length;
  const providerQueueItems = prioritizedQueue.filter((item) => item.category === "provider");
  const trafficQueueItems = prioritizedQueue.filter(
    (item) => item.category === "quota" || item.category === "host" || item.category === "mcp"
  );
  const contextQueueItems = prioritizedQueue.filter(
    (item) => item.category === "workspace" || item.category === "session" || item.category === "asset"
  );
  const governanceCampaigns: GovernanceCampaign[] = [];

  if (providerQueueItems.length > 0) {
    const primaryItem = providerQueueItems[0];
    if (primaryItem) {
      const providerCampaignChecklist = uniqueStrings([
        ...primaryItem.notice.suggestions.slice(0, 2),
        localize(locale, "最后按影响范围决定是否修 Provider 还是故障转移链。", "Finally decide whether to edit the provider or failover chain based on blast radius.")
      ]).slice(0, 3);
      governanceCampaigns.push({
      id: "campaign-provider-runtime",
      level: providerQueueItems.some((item) => item.level === "high") ? "high" : "medium",
      title: localize(locale, "批量处理 Provider 运行时异常", "Batch Provider Runtime Repair"),
      summary: localize(
        locale,
        `当前有 ${formatNumber(providerQueueItems.length)} 个 Provider 类治理项，适合先统一检查 runtime、失败请求和健康审计，再逐个修配置。`,
        `${formatNumber(providerQueueItems.length)} provider governance items are active. Start by reviewing runtime, failure requests, and health audit together before editing configs one by one.`
      ),
      checklist: [
        ...providerCampaignChecklist
      ],
      queueItemIds: providerQueueItems.map((item) => item.id),
      startLabel: localize(locale, "启动 Provider 批次", "Start Provider Batch"),
      onStart: () => {
        onActivateCampaign({
          id: "campaign-provider-runtime",
          level: providerQueueItems.some((item) => item.level === "high") ? "high" : "medium",
          title: localize(locale, "批量处理 Provider 运行时异常", "Batch Provider Runtime Repair"),
          summary: localize(
            locale,
            "这是一组 Provider 运行时治理批次，优先确认运行态和失败请求，再逐步修配置。",
            "This is a provider runtime governance batch. Confirm runtime and failure requests first, then repair configuration step by step."
          ),
          checklist: [
            ...providerCampaignChecklist
          ],
          queueItemIds: providerQueueItems.map((item) => item.id)
        });
        onActivateGovernanceQueueNotice({
          category: "provider",
          title: localize(locale, "Provider 批量治理闭环", "Provider Batch Governance Loop"),
          summary: localize(
            locale,
            "这一批次会优先对齐 Provider runtime、失败请求和健康审计。先处理高风险 Provider，再回到配置层修正。",
            "This batch aligns provider runtime, failure requests, and health audit first. Clear the highest-risk providers before returning to configuration changes."
          ),
          actions: [
            ...providerQueueItems
              .slice(0, 2)
              .flatMap((item) => item.followUpNotice.actions.filter((action) => action.kind !== "section")),
            {
              id: "campaign-provider-routing",
              label: localize(locale, "打开路由面板", "Open Routing"),
              kind: "section",
              section: "routing"
            }
          ]
        });
        primaryItem.onAction();
      }
    });
    }
  }

  if (trafficQueueItems.length > 0) {
    const primaryItem = trafficQueueItems[0];
    if (primaryItem) {
      const trafficCampaignChecklist = uniqueStrings([
        ...primaryItem.notice.suggestions.slice(0, 2),
        localize(locale, "最后决定是扩容上限、同步宿主机，还是回滚配置。", "Finally decide whether to expand limits, sync host config, or roll back config.")
      ]).slice(0, 3);
      governanceCampaigns.push({
      id: "campaign-traffic",
      level: trafficQueueItems.some((item) => item.level === "high") ? "high" : "medium",
      title: localize(locale, "批量处理流量 / 配额 / 接管异常", "Batch Traffic / Quota / Takeover Repair"),
      summary: localize(
        locale,
        `当前有 ${formatNumber(trafficQueueItems.length)} 个流量面治理项，适合先统一核对请求拒绝、宿主机接管和 MCP/配额审计，再进入局部修复。`,
        `${formatNumber(trafficQueueItems.length)} traffic-side governance items are active. Review request rejections, host takeover, and MCP/quota audit first before local repairs.`
      ),
      checklist: [
        ...trafficCampaignChecklist
      ],
      queueItemIds: trafficQueueItems.map((item) => item.id),
      startLabel: localize(locale, "启动流量批次", "Start Traffic Batch"),
      onStart: () => {
        onActivateCampaign({
          id: "campaign-traffic",
          level: trafficQueueItems.some((item) => item.level === "high") ? "high" : "medium",
          title: localize(locale, "批量处理流量 / 配额 / 接管异常", "Batch Traffic / Quota / Takeover Repair"),
          summary: localize(
            locale,
            "这是一组流量侧治理批次，先对齐请求、审计和用量，再处理局部配置。",
            "This is a traffic-side governance batch. Align requests, audit, and usage first, then repair local configuration."
          ),
          checklist: [
            ...trafficCampaignChecklist
          ],
          queueItemIds: trafficQueueItems.map((item) => item.id)
        });
        onActivateGovernanceQueueNotice({
          category: primaryItem.category === "mcp" ? "mcp" : "app-traffic",
          title: localize(locale, "流量侧批量治理闭环", "Traffic-Side Batch Governance Loop"),
          summary: localize(
            locale,
            "这一批次会优先对齐应用请求、相关审计和用量信号，适合处理配额、接管和 MCP 相关异常。",
            "This batch aligns app requests, related audit, and usage signals first, which is suited for quota, takeover, and MCP issues."
          ),
          actions: [
            ...trafficQueueItems
              .slice(0, 3)
              .flatMap((item) => item.followUpNotice.actions.filter((action) => action.kind !== "section")),
            {
              id: "campaign-traffic-runtime",
              label: localize(locale, "打开运行时 / 审计", "Open Runtime / Audit"),
              kind: "section",
              section: "runtime"
            }
          ]
        });
        primaryItem.onAction();
      }
    });
    }
  }

  if (contextQueueItems.length > 0) {
    const primaryItem = contextQueueItems[0];
    if (primaryItem) {
      const contextCampaignChecklist = uniqueStrings([
        ...primaryItem.notice.suggestions.slice(0, 2),
        localize(locale, "最后回到 runtime 和请求面确认错误已经收敛。", "Finally return to runtime and requests to confirm errors are converging.")
      ]).slice(0, 3);
      governanceCampaigns.push({
      id: "campaign-context",
      level: contextQueueItems.some((item) => item.level === "high") ? "high" : "medium",
      title: localize(locale, "批量处理工作区 / 会话上下文异常", "Batch Workspace / Session Context Repair"),
      summary: localize(
        locale,
        `当前有 ${formatNumber(contextQueueItems.length)} 个上下文治理项，适合先统一校验继承链，再决定是修工作区默认项还是归档会话。`,
        `${formatNumber(contextQueueItems.length)} context governance items are active. Validate inheritance first, then decide whether to repair workspace defaults or archive sessions.`
      ),
      checklist: [
        ...contextCampaignChecklist
      ],
      queueItemIds: contextQueueItems.map((item) => item.id),
      startLabel: localize(locale, "启动上下文批次", "Start Context Batch"),
      onStart: () => {
        onActivateCampaign({
          id: "campaign-context",
          level: contextQueueItems.some((item) => item.level === "high") ? "high" : "medium",
          title: localize(locale, "批量处理工作区 / 会话上下文异常", "Batch Workspace / Session Context Repair"),
          summary: localize(
            locale,
            "这是一组上下文治理批次，优先修继承链，再回到 runtime 和请求验证。",
            "This is a context governance batch. Repair inheritance first, then validate through runtime and requests."
          ),
          checklist: [
            ...contextCampaignChecklist
          ],
          queueItemIds: contextQueueItems.map((item) => item.id)
        });
        onActivateGovernanceQueueNotice({
          category: primaryItem.category === "workspace" ? "workspace" : primaryItem.category === "session" ? "session" : "asset",
          title: localize(locale, "上下文批量治理闭环", "Context Batch Governance Loop"),
          summary: localize(
            locale,
            "这一批次会优先对齐工作区 / 会话 runtime 与请求证据，再回到上下文资产统一修正继承关系。",
            "This batch aligns workspace or session runtime with request evidence first, then returns to context assets to repair inheritance consistently."
          ),
          actions: [
            ...contextQueueItems
              .slice(0, 3)
              .flatMap((item) => item.followUpNotice.actions.filter((action) => action.kind !== "section")),
            {
              id: "campaign-context-assets",
              label: localize(locale, "打开上下文资产", "Open Context Assets"),
              kind: "section",
              section: "assets"
            }
          ]
        });
        primaryItem.onAction();
      }
    });
    }
  }

  const activeCampaign = governanceCampaigns.find((campaign) => campaign.id === activeCampaignId) ?? null;
  const activeCampaignRemainingCount =
    activeCampaign === null
      ? 0
      : activeCampaign.queueItemIds.filter((itemId) => prioritizedQueue.some((item) => item.id === itemId)).length;
  const activeCampaignResolvedCount =
    activeCampaign === null ? 0 : Math.max(0, activeCampaign.queueItemIds.length - activeCampaignRemainingCount);
  const activeCampaignNextItem =
    activeCampaign === null
      ? null
      : prioritizedQueue.find((item) => activeCampaign.queueItemIds.includes(item.id)) ?? null;
  const activeCampaignVerdict =
    activeCampaign === null
      ? null
      : activeCampaignRemainingCount === 0
        ? {
            level: "low" as const,
            title: localize(locale, "这一批次已完成", "This Batch Is Cleared"),
            summary: localize(
              locale,
              "当前批次的治理项已经全部脱离首页优先队列，可以切到下一批或继续观察验证信号。",
              "All items in this batch have fallen out of the priority queue. Move to the next batch or continue observing validation signals."
            )
          }
        : activeCampaignResolvedCount > 0
          ? {
              level: activeCampaign.level === "high" ? "medium" as const : activeCampaign.level,
              title: localize(locale, "这一批次已部分改善", "This Batch Is Partially Improved"),
              summary: localize(
                locale,
                "部分对象已经脱离优先队列，但仍有剩余项需要继续处理，建议沿着当前批次顺序推进。",
                "Some items have dropped out of the priority queue, but others still need work. Continue along the current batch order."
              )
            }
          : {
              level: activeCampaign.level,
              title: localize(locale, "这一批次仍在处理中", "This Batch Is Still Active"),
              summary: localize(
                locale,
                "当前批次对象仍全部留在优先队列，说明主风险还没有真正收敛，应继续处理下一项而不是切批次。",
                "All items in this batch are still in the priority queue, which means the main risk has not converged yet. Continue with the next item instead of switching batches."
              )
            };
  const mergedActiveCampaignVerdict =
    activeCampaignVerdict === null
      ? null
      : activeCampaignEvidence === null
        ? activeCampaignVerdict
        : {
            level:
              activeCampaignVerdict.level === "high" || activeCampaignEvidence.level === "high"
                ? "high"
                : activeCampaignVerdict.level === "medium" || activeCampaignEvidence.level === "medium"
                  ? "medium"
                  : "low",
            title:
              activeCampaignVerdict.level === "low" && activeCampaignEvidence.level === "low"
                ? localize(locale, "这一批次可切下一轮", "This Batch Can Move On")
                : activeCampaignVerdict.level === "high" || activeCampaignEvidence.level === "high"
                  ? localize(locale, "这一批次仍需继续处理", "This Batch Still Needs Work")
                  : localize(locale, "这一批次正在改善", "This Batch Is Improving"),
            summary:
              activeCampaignVerdict.level === "low" && activeCampaignEvidence.level === "low"
                ? localize(
                    locale,
                    "首页队列和最近验证信号都显示这批对象正在恢复，可以考虑切到下一批。",
                    "Both the queue and recent validation signals show this batch is recovering. It is reasonable to move on to the next batch."
                  )
                : activeCampaignVerdict.level === "high" || activeCampaignEvidence.level === "high"
                  ? localize(
                      locale,
                      "虽然你已经进入这批治理流，但队列或验证信号仍显示高风险，暂时不要切批次。",
                      "Even though this batch is in progress, the queue or validation evidence still shows high risk. Do not switch batches yet."
                    )
                  : localize(
                      locale,
                      "部分队列对象或验证信号已经改善，但还没有完全收敛，建议继续沿着当前批次推进。",
                      "Some queue items or validation signals have improved, but the batch has not fully converged yet. Continue along the current batch."
                    )
          };

  return (
    <>
    {!hasProviders || !hasBindings || !hasFailoverChains ? (
      <article className="panel panel-span-2 onboarding-panel">
        <h2>{t("dashboard.panels.onboarding")}</h2>
        <p className="panel-lead">{t("dashboard.onboarding.description")}</p>
        <div className="onboarding-grid">
          <section className="onboarding-card">
            <strong>{t("dashboard.onboarding.stepProviderTitle")}</strong>
            <p>{t("dashboard.onboarding.stepProviderBody")}</p>
            {!hasProviders ? (
              <>
                <p className="onboarding-alert">{t("dashboard.onboarding.emptyProviders")}</p>
                <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                  {locale === "zh-CN" ? "前往 Provider 配置" : "Open Provider Controls"}
                </button>
              </>
            ) : null}
          </section>
          <section className="onboarding-card">
            <strong>{t("dashboard.onboarding.stepBindingTitle")}</strong>
            <p>{t("dashboard.onboarding.stepBindingBody")}</p>
            {!hasBindings ? (
              <>
                <p className="onboarding-alert">{t("dashboard.onboarding.emptyBindings")}</p>
                <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                  {locale === "zh-CN" ? "前往 Binding 配置" : "Open Binding Controls"}
                </button>
              </>
            ) : null}
          </section>
          <section className="onboarding-card">
            <strong>{t("dashboard.onboarding.stepHostTitle")}</strong>
            <p>{t("dashboard.onboarding.stepHostBody")}</p>
            {!hasFailoverChains ? (
              <>
                <p className="onboarding-alert">{t("dashboard.onboarding.emptyFailover")}</p>
                <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                  {locale === "zh-CN" ? "前往故障转移配置" : "Open Failover Controls"}
                </button>
              </>
            ) : null}
          </section>
        </div>
      </article>
    ) : null}

    {prioritizedQueue.length > 0 ? (
      <article className="panel panel-span-2">
        <h2>{locale === "zh-CN" ? "治理队列" : "Governance Queue"}</h2>
        <p className="panel-lead">
          {locale === "zh-CN"
            ? "这里收敛了当前最值得优先处理的对象。先修高风险项，再回到详细面板处理局部问题。"
            : "This queue surfaces the highest-priority objects to repair first. Clear the high-risk items before working through detailed panels."}
        </p>
        <div className="preview-summary-grid">
          <div className={`preview-summary-tile ${highRiskQueueCount > 0 ? "risk-high" : "risk-low"}`}>
            <strong>{formatNumber(highRiskQueueCount)}</strong>
            <span>{locale === "zh-CN" ? "高风险治理项" : "High-Risk Repairs"}</span>
          </div>
          <div className={`preview-summary-tile ${mediumRiskQueueCount > 0 ? "risk-medium" : "risk-low"}`}>
            <strong>{formatNumber(mediumRiskQueueCount)}</strong>
            <span>{locale === "zh-CN" ? "中风险治理项" : "Medium-Risk Repairs"}</span>
          </div>
          <div className="preview-summary-tile">
            <strong>{prioritizedQueue.length > 0 ? prioritizedQueue[0]?.title : t("common.notFound")}</strong>
            <span>{locale === "zh-CN" ? "建议最先处理" : "Start Here First"}</span>
          </div>
        </div>
        {activeCampaign ? (
          <div className={`governance-active-campaign governance-${activeCampaign.level}`}>
            <div className="governance-notice-header">
              <strong>{activeCampaign.title}</strong>
              <span className="governance-notice-badge">{locale === "zh-CN" ? "进行中" : "Active"}</span>
            </div>
            <p>{activeCampaign.summary}</p>
            {mergedActiveCampaignVerdict ? (
              <div className={`governance-notice governance-${mergedActiveCampaignVerdict.level}`}>
                <div className="governance-notice-header">
                  <strong>{mergedActiveCampaignVerdict.title}</strong>
                  <span className="governance-notice-badge">
                    {mergedActiveCampaignVerdict.level === "low"
                      ? localize(locale, "低风险", "Low Risk")
                      : mergedActiveCampaignVerdict.level === "medium"
                        ? localize(locale, "中风险", "Medium Risk")
                        : localize(locale, "高风险", "High Risk")}
                  </span>
                </div>
                <ul className="governance-suggestion-list">
                  <li>{mergedActiveCampaignVerdict.summary}</li>
                </ul>
              </div>
            ) : null}
            {activeCampaignEvidence ? (
              <>
                <div className={`governance-notice governance-${activeCampaignEvidence.level}`}>
                  <div className="governance-notice-header">
                    <strong>{activeCampaignEvidence.title}</strong>
                    <span className="governance-notice-badge">{locale === "zh-CN" ? "批次证据" : "Batch Evidence"}</span>
                  </div>
                  <ul className="governance-suggestion-list">
                    <li>{activeCampaignEvidence.summary}</li>
                  </ul>
                </div>
                {activeCampaignEvidence.validationItems.length > 0 ? (
                  <div className="preview-summary-grid">
                    {activeCampaignEvidence.validationItems.map((item) => (
                      <div className={`preview-summary-tile risk-${item.level}`} key={item.id}>
                        <strong>{item.value}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="preview-summary-grid">
              <div className={`preview-summary-tile ${activeCampaignRemainingCount > 0 ? `risk-${activeCampaign.level}` : "risk-low"}`}>
                <strong>{formatNumber(activeCampaignRemainingCount)}</strong>
                <span>{locale === "zh-CN" ? "批次剩余治理项" : "Remaining Batch Items"}</span>
              </div>
              <div className="preview-summary-tile risk-low">
                <strong>{formatNumber(activeCampaignResolvedCount)}</strong>
                <span>{locale === "zh-CN" ? "已脱离队列" : "Resolved From Queue"}</span>
              </div>
              <div className="preview-summary-tile">
                <strong>{activeCampaignNextItem?.title ?? localize(locale, "批次已清空", "Batch Cleared")}</strong>
                <span>{locale === "zh-CN" ? "建议下一步" : "Suggested Next Step"}</span>
              </div>
            </div>
            <ul className="operation-checklist">
              {activeCampaign.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="quick-action-row">
              <button
                className="inline-action"
                type="button"
                disabled={activeCampaignNextItem === null}
                onClick={() => {
                  if (!activeCampaignNextItem) {
                    return;
                  }
                  onActivateGovernanceQueueNotice(activeCampaignNextItem.followUpNotice);
                  activeCampaignNextItem.onAction();
                }}
              >
                {locale === "zh-CN" ? "继续当前批次" : "Continue Batch"}
              </button>
              <button className="inline-action" type="button" onClick={() => onActivateCampaign(null)}>
                {locale === "zh-CN" ? "退出批次" : "Exit Batch"}
              </button>
            </div>
          </div>
        ) : null}
        {governanceCampaigns.length > 0 ? (
          <div className="governance-campaign-grid">
            {governanceCampaigns.map((campaign) => (
              <div
                className={`preview-item governance-campaign-card risk-${campaign.level}${activeCampaignId === campaign.id ? " is-active" : ""}`}
                key={campaign.id}
              >
                <strong>{campaign.title}</strong>
                <p>{campaign.summary}</p>
                <ul className="operation-checklist">
                  {campaign.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <button className="inline-action" type="button" disabled={isWorking} onClick={campaign.onStart}>
                  {campaign.startLabel}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="list">
          {prioritizedQueue.map((item) => (
            <div className="list-row governance-queue-row" key={item.id}>
              <div className="governance-queue-main">
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
                <GovernanceNoticeCard notice={item.notice} locale={locale} />
                <div className="operation-guide-grid">
                  <div className="preview-item">
                    <strong>{locale === "zh-CN" ? "执行后应验证" : "Validate After Action"}</strong>
                    <ul className="operation-checklist">
                      {item.validationItems.map((validationItem) => (
                        <li key={validationItem}>{validationItem}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="preview-item">
                    <strong>{locale === "zh-CN" ? "推荐检查顺序" : "Recommended Check Order"}</strong>
                    <ol className="operation-checklist ordered">
                      {item.runbook.map((runbookItem) => (
                        <li key={runbookItem}>{runbookItem}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
              <div className="row-meta">
                <span className={`audit-badge level-${item.level === "high" ? "error" : item.level === "medium" ? "warn" : "info"}`}>
                  {item.level}
                </span>
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => {
                    onActivateGovernanceQueueNotice(item.followUpNotice);
                    item.onAction();
                  }}
                >
                  {item.actionLabel}
                </button>
                {item.secondaryLabel && item.onSecondaryAction ? (
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => {
                      onActivateGovernanceQueueNotice(item.followUpNotice);
                      item.onSecondaryAction?.();
                    }}
                  >
                    {item.secondaryLabel}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </article>
    ) : null}

    <article className="panel">
      <h2>{t("dashboard.panels.providers")}</h2>
      <div className="list">
        {snapshot.providers.length === 0 ? (
          <div className="list-row">
            <div>
              <strong>{t("dashboard.panels.providers")}</strong>
              <p>{t("dashboard.onboarding.emptyProviders")}</p>
            </div>
          </div>
        ) : (
          snapshot.providers.map((provider) => (
            <div className="list-row" key={provider.id}>
              <div>
                <strong>{provider.name}</strong>
                <p>{renderProviderType(provider)}</p>
              </div>
              <div className="row-meta">
                <span>{provider.enabled ? t("common.enabled") : t("common.disabled")}</span>
                <code>{provider.apiKeyMasked}</code>
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onEditProvider(provider)}
                >
                  {locale === "zh-CN" ? "编辑并修复" : "Edit to Repair"}
                </button>
                <button
                  className="inline-action danger"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onDeleteProvider(provider.id)}
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </article>

    <article className="panel">
      <h2>{t("dashboard.panels.bindings")}</h2>
      <div className="list">
        {snapshot.bindings.length === 0 ? (
          <div className="list-row">
            <div>
              <strong>{t("dashboard.panels.bindings")}</strong>
              <p>{t("dashboard.onboarding.emptyBindings")}</p>
            </div>
          </div>
        ) : (
          snapshot.bindings.map((binding) => (
            <div className="list-row" key={binding.id}>
              <div>
                <strong>{binding.appCode}</strong>
                <p>{binding.providerId}</p>
              </div>
              <div className="row-meta">
                <span>{renderBindingMode(binding)}</span>
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onEditBinding(binding)}
                >
                  {locale === "zh-CN" ? "编辑并修复" : "Edit to Repair"}
                </button>
                <button
                  className="inline-action danger"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onDeleteBinding(binding.id)}
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </article>

    <article className="panel">
      <h2>{t("dashboard.panels.appQuotas")}</h2>
      <div className="list">
        {snapshot.appQuotas.length === 0 ? (
          <div className="list-row">
            <div>
              <strong>{t("dashboard.panels.appQuotas")}</strong>
              <p>{t("common.notFound")}</p>
            </div>
          </div>
        ) : (
          snapshot.appQuotas.map((quota) => (
            <div
              className={`list-row quota-row quota-${quotaStatusByApp.get(quota.appCode)?.currentState ?? "healthy"}`}
              key={quota.id}
            >
              <div className="quota-main">
                <strong>{quota.appCode}</strong>
                <p>
                  {quota.period} / {quota.enabled ? t("common.enabled") : t("common.disabled")}
                </p>
                <p>
                  {t("dashboard.forms.maxRequests")}: {quota.maxRequests ?? "n/a"} /{" "}
                  {t("dashboard.forms.maxTokens")}: {quota.maxTokens ?? "n/a"}
                </p>
                {(() => {
                  const status = quotaStatusByApp.get(quota.appCode);
                  if (!status) {
                    return null;
                  }

                  const utilization = Math.max(
                    status.requestUtilization ?? 0,
                    status.tokenUtilization ?? 0
                  );

                  return (
                    <div className="quota-progress-block">
                      <div className="quota-progress-meta">
                        <span>
                          {t("dashboard.quota.currentUsage")}: {formatNumber(status.requestsUsed)} /{" "}
                          {formatNumber(status.tokensUsed)}
                        </span>
                        <span>{renderQuotaState(status.currentState)}</span>
                      </div>
                      <div className="quota-progress-bar-shell">
                        <div
                          className={`quota-progress-bar state-${status.currentState}`}
                          style={{ width: `${Math.max(6, Math.round(utilization * 100))}%` }}
                        />
                      </div>
                      <p>
                        {t("dashboard.quota.requestUsage")}: {formatPercent(status.requestUtilization)} /{" "}
                        {t("dashboard.quota.tokenUsage")}: {formatPercent(status.tokenUtilization)}
                      </p>
                      <p>
                        {t("dashboard.quota.remaining")}: {status.requestsRemaining ?? "n/a"} /{" "}
                        {status.tokensRemaining ?? "n/a"}
                      </p>
                    </div>
                  );
                })()}
              </div>
              <div className="row-meta">
                <code>{quota.updatedAt}</code>
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onEditAppQuota(quota)}
                >
                  {locale === "zh-CN" ? "编辑并修复" : "Edit to Repair"}
                </button>
                <button
                  className="inline-action danger"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onDeleteAppQuota(quota.id)}
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </article>

    <article className="panel">
      <h2>{t("dashboard.panels.activeContext")}</h2>
      <div className="list">
        <div className="list-row">
          <div>
            <strong>{t("dashboard.workspace.activeWorkspace")}</strong>
            <p>{snapshot.activeContext.activeWorkspaceId ?? t("common.notFound")}</p>
            <p>
              {t("dashboard.workspace.effectiveProvider")}:{" "}
              {snapshot.activeContext.workspaceContext?.provider.id ?? t("common.notFound")}
            </p>
          </div>
          <div className="row-meta">
            <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenAssetForms}>
              {locale === "zh-CN" ? "前往上下文修复" : "Open Context Repair"}
            </button>
            <button className="inline-action" type="button" disabled={isWorking} onClick={onClearActiveWorkspace}>
              {t("dashboard.workspace.clearActivation")}
            </button>
          </div>
        </div>
        <div className="list-row">
          <div>
            <strong>{t("dashboard.workspace.activeSession")}</strong>
            <p>{snapshot.activeContext.activeSessionId ?? t("common.notFound")}</p>
            <p>
              {t("dashboard.workspace.effectivePrompt")}:{" "}
              {snapshot.activeContext.sessionContext?.promptTemplate.id ?? t("common.notFound")}
            </p>
          </div>
          <div className="row-meta">
            <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenAssetForms}>
              {locale === "zh-CN" ? "前往上下文修复" : "Open Context Repair"}
            </button>
            <button className="inline-action" type="button" disabled={isWorking} onClick={onClearActiveSession}>
              {t("dashboard.workspace.clearActivation")}
            </button>
          </div>
        </div>
      </div>
    </article>

    <article className="panel">
      <h2>{t("dashboard.workspace.sessionGovernanceTitle")}</h2>
      <div className="list">
        <div className="list-row">
          <div>
            <strong>{t("dashboard.workspace.staleThreshold")}</strong>
            <p>{formatNumber(Math.round(snapshot.sessionGovernance.staleAfterMs / (1000 * 60 * 60)))}h</p>
            <p>
              {t("dashboard.workspace.staleSessions")}: {snapshot.sessionGovernance.staleSessionIds.length}
            </p>
          </div>
          <div className="row-meta">
            <span>
              {snapshot.sessionGovernance.activeSessions} / {snapshot.sessionGovernance.archivedSessions}
            </span>
            <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRecoveryPanel}>
              {locale === "zh-CN" ? "查看恢复入口" : "Open Recovery"}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={isWorking || snapshot.sessionGovernance.staleSessionIds.length === 0}
              onClick={onArchiveStaleSessions}
            >
              {t("dashboard.workspace.archiveStaleAction")}
            </button>
          </div>
        </div>
        {snapshot.sessionGovernance.staleSessionIds.map((sessionId) => (
          <div className="list-row" key={`stale-${sessionId}`}>
            <div>
              <strong>{sessionId}</strong>
              <p>{t("dashboard.workspace.sessionArchived")}</p>
            </div>
          </div>
        ))}
      </div>
    </article>

    <article className="panel panel-span-2">
      <h2>{t("dashboard.contextRouting.title")}</h2>
      <div className="list">
        {snapshot.contextRoutingExplanations.map((explanation) => (
          <div className="list-row" key={`effective-${explanation.appCode}`}>
            <div>
              <strong>{explanation.appCode}</strong>
              <p>
                {t("dashboard.workspace.contextSource")}: {renderEffectiveContextSource(explanation.effectiveSource)}
              </p>
              <p>
                {t("dashboard.workspace.activeWorkspace")}: {explanation.activeWorkspaceId ?? t("common.notFound")}
              </p>
              <p>
                {t("dashboard.workspace.activeSession")}: {explanation.activeSessionId ?? t("common.notFound")}
              </p>
              <p>
                {t("dashboard.workspace.effectiveProvider")}: {explanation.effectiveProviderId ?? t("common.notFound")}
              </p>
              <p>
                {t("dashboard.contextRouting.effectiveProviderSource")}: {explanation.effectiveProviderSource}
              </p>
              <p>
                {t("dashboard.workspace.warnings")}:{" "}
                {joinDashboardWarnings(explanation.warnings, locale, t("dashboard.workspace.noWarnings"))}
              </p>
              <strong>{t("dashboard.contextRouting.precedenceTitle")}</strong>
              {explanation.steps.map((step) => (
                <p key={`${explanation.appCode}-${step.kind}`}>
                  {renderContextRoutingStepKind(step.kind)} /{" "}
                  {step.selected
                    ? t("dashboard.contextRouting.selected")
                    : step.available
                      ? t("dashboard.contextRouting.available")
                      : t("dashboard.contextRouting.unavailable")} /{" "}
                  {step.referenceId ?? t("common.notFound")} / {step.providerId ?? t("common.notFound")} / {step.message}
                </p>
              ))}
              <strong>{t("dashboard.contextRouting.routingPlanTitle")}</strong>
              {explanation.routingPlan === null ? (
                <p>{t("dashboard.contextRouting.noRoutingPlan")}</p>
              ) : (
                <>
                  <p>
                    {explanation.routingPlan.proxyPath} / {formatNumber(explanation.routingPlan.maxAttempts)}
                  </p>
                  {explanation.routingPlan.candidates.map((candidate) => (
                    <p key={`${explanation.appCode}-candidate-${candidate.providerId}`}>
                      {candidate.providerId} / {candidate.source} / {candidate.circuitState} /{" "}
                      {candidate.willReceiveTraffic
                        ? t("dashboard.contextRouting.willReceiveTraffic")
                        : t("dashboard.contextRouting.willNotReceiveTraffic")}
                    </p>
                  ))}
                </>
              )}
            </div>
            <div className="row-meta">
              <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenAssetForms}>
                {locale === "zh-CN" ? "修上下文" : "Fix Context"}
              </button>
              <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenRoutingForms}>
                {locale === "zh-CN" ? "修路由" : "Fix Routing"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  </>
  );
};
