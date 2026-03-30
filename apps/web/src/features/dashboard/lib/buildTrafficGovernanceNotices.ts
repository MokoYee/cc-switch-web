import type { LocaleCode, ProxyRequestLog, UsageRecord } from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import type { GovernanceNotice } from "./buildGovernanceNotice.js";

export type TrafficGovernanceAction =
  | {
      readonly id: string;
      readonly kind: "request-filter";
      readonly label: string;
      readonly filters: {
        readonly appCode?: string;
        readonly providerId?: string;
        readonly workspaceId?: string;
        readonly sessionId?: string;
        readonly outcome?: string;
      };
    }
  | {
      readonly id: string;
      readonly kind: "usage-filter";
      readonly label: string;
      readonly filters: {
        readonly appCode?: string;
        readonly providerId?: string;
        readonly model?: string;
      };
    }
  | {
      readonly id: string;
      readonly kind: "edit-provider";
      readonly label: string;
      readonly providerId: string;
    }
  | {
      readonly id: string;
      readonly kind: "edit-binding";
      readonly label: string;
      readonly appCode: string;
    }
  | {
      readonly id: string;
      readonly kind: "edit-app-quota";
      readonly label: string;
      readonly appCode: string;
    }
  | {
      readonly id: string;
      readonly kind: "edit-failover";
      readonly label: string;
      readonly appCode: string;
    }
  | {
      readonly id: string;
      readonly kind: "edit-workspace";
      readonly label: string;
      readonly workspaceId: string;
    }
  | {
      readonly id: string;
      readonly kind: "edit-session";
      readonly label: string;
      readonly sessionId: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-provider-runtime";
      readonly label: string;
      readonly providerId: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-workspace-runtime";
      readonly label: string;
      readonly workspaceId: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-session-runtime";
      readonly label: string;
      readonly sessionId: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-routing";
      readonly label: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-assets";
      readonly label: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-recovery";
      readonly label: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-mcp";
      readonly label: string;
    }
  | {
      readonly id: string;
      readonly kind: "open-audit";
      readonly label: string;
      readonly filters: {
        readonly source?: string;
        readonly appCode?: string;
        readonly providerId?: string;
        readonly level?: string;
      };
    };

export type TrafficGovernanceNotice = GovernanceNotice & {
  readonly id: string;
  readonly actions: readonly TrafficGovernanceAction[];
};

type BuildTrafficGovernanceNoticesInput = {
  readonly locale: LocaleCode;
  readonly snapshot: DashboardSnapshot;
  readonly requestLogs: readonly ProxyRequestLog[];
  readonly usageRecords: readonly UsageRecord[];
};

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const unique = <T>(items: readonly T[]): T[] => Array.from(new Set(items));

const levelRank: Record<TrafficGovernanceNotice["level"], number> = {
  high: 0,
  medium: 1,
  low: 2
};

const actionRank: Record<TrafficGovernanceAction["kind"], number> = {
  "open-provider-runtime": 0,
  "open-workspace-runtime": 0,
  "open-session-runtime": 0,
  "edit-provider": 1,
  "edit-binding": 1,
  "edit-app-quota": 1,
  "edit-failover": 1,
  "edit-workspace": 1,
  "edit-session": 1,
  "request-filter": 2,
  "usage-filter": 2,
  "open-audit": 3,
  "open-routing": 4,
  "open-assets": 4,
  "open-recovery": 4,
  "open-mcp": 4
};

const trimActions = (
  actions: readonly TrafficGovernanceAction[],
  limit = 4
): readonly TrafficGovernanceAction[] => {
  const uniqueActions = Array.from(new Map(actions.map((item) => [item.id, item])).values());
  return uniqueActions
    .sort((left, right) => actionRank[left.kind] - actionRank[right.kind])
    .slice(0, limit);
};

const trimSuggestions = (
  suggestions: readonly string[],
  limit = 3
): string[] => Array.from(new Set(suggestions)).slice(0, limit);

const buildNotice = (
  notice: Omit<TrafficGovernanceNotice, "actions"> & {
    readonly actions: readonly TrafficGovernanceAction[];
  }
): TrafficGovernanceNotice => ({
  ...notice,
  suggestions: trimSuggestions(notice.suggestions),
  actions: trimActions(notice.actions)
});

const pickTopCount = (items: readonly string[]): { readonly id: string; readonly count: number } | null => {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  const target = sorted[0];
  return target ? { id: target[0], count: target[1] } : null;
};

const pickDominantReason = (
  logs: readonly ProxyRequestLog[]
): { readonly reason: NonNullable<ProxyRequestLog["decisionReason"]>; readonly count: number } | null => {
  const reasons = logs
    .map((item) => item.decisionReason)
    .filter((item): item is NonNullable<ProxyRequestLog["decisionReason"]> => item !== null);
  const top = pickTopCount(reasons);
  return top === null ? null : { reason: top.id as NonNullable<ProxyRequestLog["decisionReason"]>, count: top.count };
};

export const buildTrafficGovernanceNotices = ({
  locale,
  snapshot,
  requestLogs,
  usageRecords
}: BuildTrafficGovernanceNoticesInput): TrafficGovernanceNotice[] => {
  const notices: TrafficGovernanceNotice[] = [];

  if (requestLogs.length > 0) {
    const errorLikeLogs = requestLogs.filter((item) => item.outcome === "error" || item.outcome === "rejected");
    const failoverLogs = requestLogs.filter((item) => item.outcome === "failover");
    const unboundLogs = requestLogs.filter((item) => item.providerId === null);
    const contextlessLogs = requestLogs.filter((item) => item.workspaceId === null && item.sessionId === null);
    const authLogs = requestLogs.filter((item) => item.decisionReason === "auth");
    const quotaRejectedLogs = requestLogs.filter((item) => item.decisionReason === "quota-rejected");
    const noBindingLogs = requestLogs.filter((item) => item.decisionReason === "no-binding");
    const upstreamAvailabilityLogs = requestLogs.filter(
      (item) =>
        item.decisionReason === "upstream-unavailable" ||
        item.decisionReason === "network" ||
        item.decisionReason === "timeout" ||
        item.decisionReason === "rate-limit"
    );

    if (authLogs.length >= 2) {
      const providerId =
        unique(authLogs.map((item) => item.providerId).filter((item): item is string => item !== null))[0] ?? null;
      const appCode = unique(authLogs.map((item) => item.appCode))[0] ?? null;

      notices.push(buildNotice({
        id: "traffic-auth-failures",
        level: "high",
        summary: localize(
          locale,
          `当前视图中检测到 ${authLogs.length} 条鉴权失败，请先修复凭证或权限，不要继续盲目切流。`,
          `${authLogs.length} authentication failures are visible. Fix credentials or permissions before switching more traffic.`
        ),
        suggestions: unique([
          providerId
            ? localize(locale, `优先检查 Provider ${providerId} 的 API Key、组织权限和上游账号状态。`, `Check API key, org permissions, and upstream account status for provider ${providerId} first.`)
            : localize(locale, "先确认失败流量命中的 Provider 是否使用了错误凭证。", "Confirm whether the failing traffic is hitting a provider with incorrect credentials."),
          appCode
            ? localize(locale, `同时核对应用 ${appCode} 的绑定是否仍然指向这组失效凭证。`, `Also verify whether app ${appCode} is still bound to the broken credentials.`)
            : localize(locale, "如果涉及多个应用，先按应用拆开处理再恢复。", "If multiple apps are involved, split the issue by app before recovery."),
          localize(locale, "修复后先打开运行时详情确认错误消失，再考虑恢复流量。", "After fixing it, confirm the errors disappear in runtime detail before restoring traffic.")
        ]),
        actions: [
          {
            id: "traffic-auth-filter",
            kind: "request-filter",
            label: localize(locale, "只看鉴权失败", "Filter Auth Failures"),
            filters: {
              ...(providerId ? { providerId } : {}),
              ...(appCode ? { appCode } : {})
            }
          },
          ...(providerId
            ? [
                {
                  id: "traffic-auth-provider-runtime",
                  kind: "open-provider-runtime" as const,
                  label: localize(locale, "打开 Provider 运行时", "Open Provider Runtime"),
                  providerId
                },
                {
                  id: "traffic-auth-provider-edit",
                  kind: "edit-provider" as const,
                  label: localize(locale, "编辑 Provider", "Edit Provider"),
                  providerId
                }
              ]
            : []),
          ...(appCode
            ? [
                {
                  id: "traffic-auth-binding-edit",
                  kind: "edit-binding" as const,
                  label: localize(locale, "检查 Binding", "Check Binding"),
                  appCode
                }
              ]
            : []),
          {
            id: "traffic-auth-audit",
            kind: "open-audit",
            label: localize(locale, "查看请求审计", "Open Request Audit"),
            filters: {
              source: "proxy-request",
              ...(providerId ? { providerId } : {}),
              ...(appCode ? { appCode } : {}),
              level: "error"
            }
          }
        ]
      }));
    }

    if (quotaRejectedLogs.length >= 2) {
      const appCode = unique(quotaRejectedLogs.map((item) => item.appCode))[0] ?? null;
      notices.push(buildNotice({
        id: "traffic-quota-rejected",
        level: "high",
        summary: localize(
          locale,
          `当前视图中检测到 ${quotaRejectedLogs.length} 条配额拒绝，请优先处理配额而不是 Provider。`,
          `${quotaRejectedLogs.length} quota rejections are visible. Fix quota policy before troubleshooting providers.`
        ),
        suggestions: unique([
          appCode
            ? localize(locale, `先检查应用 ${appCode} 的请求数与 token 配额是否过低。`, `Check whether request or token quota is too low for app ${appCode}.`)
            : localize(locale, "先确认是否是全局配额设置过紧。", "Confirm whether the quota policy is globally too strict."),
          localize(locale, "如果只是短时峰值，优先拉高阈值或等待窗口刷新。", "If this is a short spike, either raise the threshold or wait for the window to reset."),
          localize(locale, "不要把配额问题误判为 Provider 故障。", "Do not mistake quota rejection for provider failure.")
        ]),
        actions: [
          {
            id: "traffic-quota-filter",
            kind: "request-filter",
            label: localize(locale, "只看配额拒绝", "Filter Quota Rejections"),
            filters: {
              ...(appCode ? { appCode } : {}),
              outcome: "rejected"
            }
          },
          ...(appCode
            ? [
                {
                  id: "traffic-quota-edit",
                  kind: "edit-app-quota" as const,
                  label: localize(locale, "调整配额", "Adjust Quota"),
                  appCode
                },
                {
                  id: "traffic-quota-binding",
                  kind: "edit-binding" as const,
                  label: localize(locale, "查看应用 Binding", "Open App Binding"),
                  appCode
                }
              ]
            : []),
          {
            id: "traffic-quota-audit",
            kind: "open-audit",
            label: localize(locale, "查看配额审计", "Open Quota Audit"),
            filters: {
              source: "quota",
              ...(appCode ? { appCode } : {}),
              level: "error"
            }
          }
        ]
      }));
    }

    if (noBindingLogs.length >= 2) {
      const appCode = unique(noBindingLogs.map((item) => item.appCode))[0] ?? null;
      notices.push(buildNotice({
        id: "traffic-no-binding",
        level: "high",
        summary: localize(
          locale,
          `当前视图中有 ${noBindingLogs.length} 条请求没有命中 Binding，代理接管链路并未闭合。`,
          `${noBindingLogs.length} requests have no binding. The traffic takeover path is incomplete.`
        ),
        suggestions: unique([
          appCode
            ? localize(locale, `先为应用 ${appCode} 配置主 Binding，再决定是否补故障转移链。`, `Create a primary binding for app ${appCode} before tuning failover.`)
            : localize(locale, "先按应用拆分未绑定请求，再逐个补齐 Binding。", "Split unbound requests by app and add bindings one by one."),
          localize(locale, "如果是新接入 CLI，确认宿主机接管是否已经生效。", "If this is a newly onboarded CLI, verify that host takeover has been applied."),
          localize(locale, "Binding 建好后，再回来看是否需要额外的 failover。", "After the binding is fixed, decide whether additional failover is needed.")
        ]),
        actions: [
          {
            id: "traffic-no-binding-filter",
            kind: "request-filter",
            label: localize(locale, "只看未绑定请求", "Filter Unbound Requests"),
            filters: {
              ...(appCode ? { appCode } : {})
            }
          },
          ...(appCode
            ? [
                {
                  id: "traffic-no-binding-edit",
                  kind: "edit-binding" as const,
                  label: localize(locale, "配置 Binding", "Configure Binding"),
                  appCode
                }
              ]
            : []),
          {
            id: "traffic-no-binding-routing",
            kind: "open-routing",
            label: localize(locale, "打开路由配置", "Open Routing"),
          }
        ]
      }));
    }

    if (upstreamAvailabilityLogs.length >= 3) {
      const dominantProviderId =
        unique(upstreamAvailabilityLogs.map((item) => item.providerId).filter((item): item is string => item !== null))[0] ?? null;
      const dominantAppCode = unique(upstreamAvailabilityLogs.map((item) => item.appCode))[0] ?? null;
      const dominantReason = pickDominantReason(upstreamAvailabilityLogs);

      notices.push(buildNotice({
        id: "traffic-upstream-instability",
        level: failoverLogs.length >= 2 ? "high" : "medium",
        summary: localize(
          locale,
          `当前视图中的上游可用性异常较多（${upstreamAvailabilityLogs.length} 条），建议优先检查主 Provider 健康与故障转移顺序。`,
          `Upstream availability issues are frequent (${upstreamAvailabilityLogs.length} logs). Check primary provider health and failover order first.`
        ),
        suggestions: unique([
          dominantReason?.reason === "rate-limit"
            ? localize(locale, "这批异常更像限流，先检查上游窗口与重试节奏。", "These failures look like rate limits. Check upstream windows and retry pacing first.")
            : localize(locale, "先确认是上游宕机、网络不通还是超时，再决定恢复动作。", "Confirm whether this is an upstream outage, network path issue, or timeout before recovering."),
          dominantProviderId
            ? localize(locale, `优先打开 Provider ${dominantProviderId} 的运行时详情，看最近失败和恢复状态。`, `Open runtime detail for provider ${dominantProviderId} first and review recent failures and recovery state.`)
            : localize(locale, "如果异常跨多个 Provider，先按 Provider 聚焦后再处理。", "If failures span multiple providers, focus by provider before repairing."),
          dominantAppCode
            ? localize(locale, `同时检查应用 ${dominantAppCode} 的 failover 顺序是否合理。`, `Also verify whether app ${dominantAppCode} has a sensible failover order.`)
            : localize(locale, "如果涉及多个应用，优先从最热路径开始止损。", "If multiple apps are involved, start by containing the hottest route.")
        ]),
        actions: [
          {
            id: "traffic-upstream-filter",
            kind: "request-filter",
            label: localize(locale, "只看上游异常", "Filter Upstream Failures"),
            filters: {
              ...(dominantProviderId ? { providerId: dominantProviderId } : {}),
              ...(dominantAppCode ? { appCode: dominantAppCode } : {})
            }
          },
          ...(dominantProviderId
            ? [
                {
                  id: "traffic-upstream-runtime",
                  kind: "open-provider-runtime" as const,
                  label: localize(locale, "打开运行时详情", "Open Runtime Detail"),
                  providerId: dominantProviderId
                },
                {
                  id: "traffic-upstream-provider",
                  kind: "edit-provider" as const,
                  label: localize(locale, "编辑 Provider", "Edit Provider"),
                  providerId: dominantProviderId
                }
              ]
            : []),
          ...(dominantAppCode
            ? [
                {
                  id: "traffic-upstream-failover",
                  kind: "edit-failover" as const,
                  label: localize(locale, "检查故障转移链", "Check Failover"),
                  appCode: dominantAppCode
                }
              ]
            : []),
          {
            id: "traffic-upstream-recovery",
            kind: "open-recovery",
            label: localize(locale, "打开恢复面板", "Open Recovery"),
          }
        ]
      }));
    }

    if (errorLikeLogs.length >= 3) {
      const ratio = errorLikeLogs.length / requestLogs.length;
      const dominantProviderId =
        unique(errorLikeLogs.map((item) => item.providerId).filter((item): item is string => item !== null))[0] ?? null;
      const dominantAppCode = unique(errorLikeLogs.map((item) => item.appCode))[0] ?? null;

      notices.push(buildNotice({
        id: "traffic-errors",
        level: ratio >= 0.45 ? "high" : "medium",
        summary:
          ratio >= 0.45
            ? localize(
                locale,
                `当前视图中的失败/拒绝请求占比偏高（${errorLikeLogs.length}/${requestLogs.length}），建议先止损再排查。`,
                `The visible failure/rejection ratio is high (${errorLikeLogs.length}/${requestLogs.length}). Contain the issue before recovery.`
              )
            : localize(
                locale,
                `当前视图中已出现 ${errorLikeLogs.length} 条失败或拒绝请求，建议尽快定位主因。`,
                `${errorLikeLogs.length} failed or rejected requests are visible. Investigate the primary cause soon.`
              ),
        suggestions: unique([
          localize(locale, "先筛到失败流量，确认问题集中在某个应用、Provider 还是某组上下文。", "Filter down to failed traffic first and confirm whether the issue is concentrated in an app, provider, or context group."),
          dominantProviderId
            ? localize(locale, `优先检查 Provider ${dominantProviderId} 的健康状态、凭证和最近失败日志。`, `Check provider ${dominantProviderId} first, including health, credentials, and recent failure logs.`)
            : localize(locale, "如果没有明确 Provider，先核对 Binding 是否失效或请求是否未命中路由。", "If there is no clear provider, verify whether the binding is broken or the requests are missing routing."),
          dominantAppCode
            ? localize(locale, `同时核对应用 ${dominantAppCode} 的 Binding、故障转移链和配额状态。`, `Review the binding, failover chain, and quota state for app ${dominantAppCode}.`)
            : localize(locale, "如果失败分布离散，优先按应用缩小范围再修复。", "If failures are scattered, narrow the scope by app before repairing.")
        ]),
        actions: [
          {
            id: "traffic-errors-filter",
            kind: "request-filter",
            label: localize(locale, "只看失败流量", "Filter Failures"),
            filters: {
              outcome: "error"
            }
          },
          ...(dominantProviderId
            ? [
                {
                  id: "traffic-errors-provider-filter",
                  kind: "request-filter" as const,
                  label: localize(locale, "聚焦问题 Provider", "Focus Provider"),
                  filters: {
                    providerId: dominantProviderId
                  }
                },
                {
                  id: "traffic-errors-provider-edit",
                  kind: "edit-provider" as const,
                  label: localize(locale, "编辑 Provider", "Edit Provider"),
                  providerId: dominantProviderId
                },
                {
                  id: "traffic-errors-provider-runtime",
                  kind: "open-provider-runtime" as const,
                  label: localize(locale, "查看运行态", "Open Runtime"),
                  providerId: dominantProviderId
                },
                {
                  id: "traffic-errors-provider-audit",
                  kind: "open-audit" as const,
                  label: localize(locale, "查看健康审计", "Open Health Audit"),
                  filters: {
                    source: "provider-health",
                    providerId: dominantProviderId,
                    level: "warn"
                  }
                }
              ]
            : []),
          ...(dominantAppCode
            ? [
                {
                  id: "traffic-errors-app-edit",
                  kind: "edit-binding" as const,
                  label: localize(locale, "检查 Binding", "Check Binding"),
                  appCode: dominantAppCode
                },
                {
                  id: "traffic-errors-app-quota",
                  kind: "edit-app-quota" as const,
                  label: localize(locale, "检查配额", "Check Quota"),
                  appCode: dominantAppCode
                }
              ]
            : []),
          {
            id: "traffic-errors-routing",
            kind: "open-routing",
            label: localize(locale, "打开路由修复", "Open Routing Repair")
          },
          {
            id: "traffic-errors-audit",
            kind: "open-audit",
            label: localize(locale, "查看请求审计", "Open Request Audit"),
            filters: {
              source: "proxy-request",
              level: "error",
              ...(dominantAppCode ? { appCode: dominantAppCode } : {}),
              ...(dominantProviderId ? { providerId: dominantProviderId } : {})
            }
          }
        ]
      }));
    }

    if (failoverLogs.length >= 2) {
      const dominantAppCode = unique(failoverLogs.map((item) => item.appCode))[0] ?? null;
      const dominantProviderId =
        unique(failoverLogs.map((item) => item.providerId).filter((item): item is string => item !== null))[0] ?? null;

      notices.push(buildNotice({
        id: "traffic-failover",
        level: failoverLogs.length >= 5 ? "high" : "medium",
        summary: localize(
          locale,
          `当前视图中检测到 ${failoverLogs.length} 次故障转移，说明主路由稳定性不足。`,
          `${failoverLogs.length} failover requests are visible, which suggests the primary route is unstable.`
        ),
        suggestions: unique([
          localize(locale, "先确认故障转移是否只是短期保护动作，还是主 Provider 已持续不可用。", "Determine whether failover is acting as short-term protection or the primary provider is persistently unavailable."),
          dominantAppCode
            ? localize(locale, `检查应用 ${dominantAppCode} 的主 Binding 与故障转移链顺序是否合理。`, `Review whether app ${dominantAppCode} has a sensible primary binding and failover order.`)
            : localize(locale, "如果故障转移来自多个应用，先按应用拆开处理。", "If failovers span multiple apps, split the investigation by app first."),
          dominantProviderId
            ? localize(locale, `同步检查 Provider ${dominantProviderId} 是否仍在被错误地继续分流。`, `Also verify whether provider ${dominantProviderId} is still receiving traffic incorrectly.`)
            : localize(locale, "结合 Provider 健康状态，确认是否需要人工隔离或恢复。", "Use provider health status to decide whether manual isolation or recovery is needed.")
        ]),
        actions: [
          {
            id: "traffic-failover-filter",
            kind: "request-filter",
            label: localize(locale, "只看故障转移", "Filter Failover"),
            filters: {
              outcome: "failover"
            }
          },
          ...(dominantAppCode
            ? [
                {
                  id: "traffic-failover-binding",
                  kind: "edit-binding" as const,
                  label: localize(locale, "检查 Binding", "Check Binding"),
                  appCode: dominantAppCode
                },
                {
                  id: "traffic-failover-chain",
                  kind: "edit-failover" as const,
                  label: localize(locale, "检查故障转移链", "Check Failover"),
                  appCode: dominantAppCode
                }
              ]
            : []),
          ...(dominantProviderId
            ? [
                {
                  id: "traffic-failover-provider",
                  kind: "edit-provider" as const,
                  label: localize(locale, "检查 Provider", "Check Provider"),
                  providerId: dominantProviderId
                }
              ]
            : []),
          {
            id: "traffic-failover-routing",
            kind: "open-routing",
            label: localize(locale, "检查故障转移", "Review Routing")
          },
          {
            id: "traffic-failover-audit",
            kind: "open-audit",
            label: localize(locale, "查看故障转移审计", "Open Failover Audit"),
            filters: {
              source: "proxy-request",
              ...(dominantAppCode ? { appCode: dominantAppCode } : {}),
              ...(dominantProviderId ? { providerId: dominantProviderId } : {})
            }
          }
        ]
      }));
    }

    if (unboundLogs.length >= 2) {
      const dominantAppCode = unique(unboundLogs.map((item) => item.appCode))[0] ?? null;

      notices.push(buildNotice({
        id: "traffic-unbound",
        level: "high",
        summary: localize(
          locale,
          `当前视图中有 ${unboundLogs.length} 条请求未命中 Provider，路由或绑定可能缺失。`,
          `${unboundLogs.length} visible requests did not resolve to a provider. Routing or bindings may be missing.`
        ),
        suggestions: unique([
          localize(locale, "先确认应用是否已经配置主 Binding，且目标 Provider 仍然存在。", "Confirm the app has a primary binding and that the target provider still exists."),
          localize(locale, "如果这些请求来自新接入环境，检查宿主机 CLI 接管和代理基础路径是否一致。", "If these requests come from a new environment, verify host takeover and proxy base paths."),
          dominantAppCode
            ? localize(locale, `优先修复应用 ${dominantAppCode}，因为未绑定流量已经出现在当前窗口。`, `Prioritize app ${dominantAppCode}, because unbound traffic is already visible in the current window.`)
            : localize(locale, "如果涉及多个应用，先按应用逐个确认是否缺少绑定。", "If multiple apps are involved, verify missing bindings app by app.")
        ]),
        actions: [
          ...(dominantAppCode
            ? [
                {
                  id: "traffic-unbound-app-filter",
                  kind: "request-filter" as const,
                  label: localize(locale, "聚焦该应用流量", "Focus App Traffic"),
                  filters: {
                    appCode: dominantAppCode
                  }
                },
                {
                  id: "traffic-unbound-binding",
                  kind: "edit-binding" as const,
                  label: localize(locale, "补齐 Binding", "Fix Binding"),
                  appCode: dominantAppCode
                }
              ]
            : []),
          {
            id: "traffic-unbound-routing",
            kind: "open-routing",
            label: localize(locale, "打开路由修复", "Open Routing Repair")
          },
          {
            id: "traffic-unbound-recovery",
            kind: "open-recovery",
            label: localize(locale, "检查恢复快照", "Review Recovery")
          },
          {
            id: "traffic-unbound-audit",
            kind: "open-audit",
            label: localize(locale, "查看请求审计", "Open Request Audit"),
            filters: {
              source: "proxy-request",
              level: "error",
              ...(dominantAppCode ? { appCode: dominantAppCode } : {})
            }
          }
        ]
      }));
    }

    if (contextlessLogs.length >= 4) {
      const dominantAppCode = unique(contextlessLogs.map((item) => item.appCode))[0] ?? null;
      notices.push(buildNotice({
        id: "traffic-contextless",
        level: contextlessLogs.length >= 8 ? "high" : "medium",
        summary: localize(
          locale,
          `当前视图中有 ${contextlessLogs.length} 条请求缺少工作区/会话上下文，后续治理和审计会变弱。`,
          `${contextlessLogs.length} visible requests are missing workspace/session context, which weakens later governance and auditing.`
        ),
        suggestions: unique([
          localize(locale, "确认接入侧是否传递了 workspace/session 头，或是否依赖 cwd 自动关联。", "Check whether the client sends workspace/session headers or relies on cwd auto-association."),
          localize(locale, "如果请求本应属于某个项目，检查工作区发现和会话自动创建是否正常。", "If the requests should belong to a project, verify workspace discovery and automatic session creation."),
          dominantAppCode
            ? localize(locale, `优先检查应用 ${dominantAppCode} 的接入方式，避免持续产生无上下文流量。`, `Review app ${dominantAppCode}'s integration path first to avoid continued contextless traffic.`)
            : localize(locale, "如果多个应用都缺上下文，优先修正公共代理接入规范。", "If multiple apps are missing context, fix the shared proxy integration contract first.")
        ]),
        actions: [
          ...(dominantAppCode
            ? [
                {
                  id: "traffic-contextless-app-filter",
                  kind: "request-filter" as const,
                  label: localize(locale, "聚焦该应用流量", "Focus App Traffic"),
                  filters: {
                    appCode: dominantAppCode
                  }
                }
              ]
            : []),
          {
            id: "traffic-contextless-assets",
            kind: "open-assets",
            label: localize(locale, "打开上下文修复", "Open Context Repair")
          },
          {
            id: "traffic-contextless-audit",
            kind: "open-audit",
            label: localize(locale, "查看请求审计", "Open Request Audit"),
            filters: {
              source: "proxy-request",
              ...(dominantAppCode ? { appCode: dominantAppCode } : {})
            }
          },
          ...(snapshot.workspaces[0]
            ? [
                {
                  id: "traffic-contextless-workspace",
                  kind: "edit-workspace" as const,
                  label: localize(locale, "检查工作区", "Check Workspace"),
                  workspaceId: snapshot.workspaces[0].id
                }
              ]
            : []),
          ...(snapshot.sessionRecords[0]
            ? [
                {
                  id: "traffic-contextless-session",
                  kind: "edit-session" as const,
                  label: localize(locale, "检查会话", "Check Session"),
                  sessionId: snapshot.sessionRecords[0].id
                }
              ]
            : [])
        ]
      }));
    }

    const failedSessionTarget = pickTopCount(
      errorLikeLogs.map((item) => item.sessionId).filter((item): item is string => item !== null)
    );
    if (failedSessionTarget && failedSessionTarget.count >= 3) {
      notices.push(buildNotice({
        id: "traffic-session-hotspot",
        level: failedSessionTarget.count >= 5 ? "high" : "medium",
        summary: localize(
          locale,
          `会话 ${failedSessionTarget.id} 在当前窗口内连续出现 ${failedSessionTarget.count} 次失败，问题可能集中在单个项目工作流。`,
          `Session ${failedSessionTarget.id} has ${failedSessionTarget.count} failures in the current window, so the issue may be concentrated in one workflow.`
        ),
        suggestions: unique([
          localize(locale, "先打开该会话，确认 prompt、skill、Provider 覆盖和 cwd 是否异常。", "Open the session first and verify prompt, skill, provider overrides, and cwd."),
          localize(locale, "如果该会话已过期或历史状态污染严重，考虑归档后重新创建。", "If the session is stale or heavily polluted by history, consider archiving and recreating it."),
          localize(locale, "同时检查关联工作区是否继承了错误的默认 Provider 或默认技能。", "Also check whether the linked workspace inherited a bad default provider or skill.")
        ]),
        actions: [
          {
            id: "traffic-session-hotspot-filter",
            kind: "request-filter",
            label: localize(locale, "聚焦该会话日志", "Focus Session Logs"),
            filters: {
              sessionId: failedSessionTarget.id
            }
          },
          {
            id: "traffic-session-hotspot-edit",
            kind: "edit-session",
            label: localize(locale, "检查会话", "Check Session"),
            sessionId: failedSessionTarget.id
          },
          {
            id: "traffic-session-hotspot-runtime",
            kind: "open-session-runtime",
            label: localize(locale, "查看运行态", "Open Runtime"),
            sessionId: failedSessionTarget.id
          },
          {
            id: "traffic-session-hotspot-assets",
            kind: "open-assets",
            label: localize(locale, "打开上下文修复", "Open Context Repair")
          },
          {
            id: "traffic-session-hotspot-audit",
            kind: "open-audit",
            label: localize(locale, "查看请求审计", "Open Request Audit"),
            filters: {
              source: "proxy-request",
              level: "error"
            }
          }
        ]
      }));
    }

    const failedWorkspaceTarget = pickTopCount(
      errorLikeLogs.map((item) => item.workspaceId).filter((item): item is string => item !== null)
    );
    if (failedWorkspaceTarget && failedWorkspaceTarget.count >= 3) {
      notices.push(buildNotice({
        id: "traffic-workspace-hotspot",
        level: failedWorkspaceTarget.count >= 6 ? "high" : "medium",
        summary: localize(
          locale,
          `工作区 ${failedWorkspaceTarget.id} 在当前窗口内聚集了 ${failedWorkspaceTarget.count} 次失败，请优先检查该项目配置。`,
          `Workspace ${failedWorkspaceTarget.id} has accumulated ${failedWorkspaceTarget.count} failures in the current window. Review that project configuration first.`
        ),
        suggestions: unique([
          localize(locale, "检查该工作区的默认 Provider、Prompt、Skill 和活跃会话是否仍然匹配当前任务。", "Check whether the workspace default provider, prompt, skill, and active sessions still match the current task."),
          localize(locale, "如果多个会话都在同一工作区失败，问题更可能是工作区级默认配置，而不是单次请求波动。", "If several sessions fail within the same workspace, the cause is more likely a workspace-level default than a single request fluctuation."),
          localize(locale, "必要时把该工作区流量单独筛出来，确认错误是否仍在持续。", "When needed, isolate traffic for this workspace to verify whether the failures are still ongoing.")
        ]),
        actions: [
          {
            id: "traffic-workspace-hotspot-filter",
            kind: "request-filter",
            label: localize(locale, "聚焦该工作区日志", "Focus Workspace Logs"),
            filters: {
              workspaceId: failedWorkspaceTarget.id
            }
          },
          {
            id: "traffic-workspace-hotspot-edit",
            kind: "edit-workspace",
            label: localize(locale, "检查工作区", "Check Workspace"),
            workspaceId: failedWorkspaceTarget.id
          },
          {
            id: "traffic-workspace-hotspot-runtime",
            kind: "open-workspace-runtime",
            label: localize(locale, "查看运行态", "Open Runtime"),
            workspaceId: failedWorkspaceTarget.id
          },
          {
            id: "traffic-workspace-hotspot-assets",
            kind: "open-assets",
            label: localize(locale, "打开上下文修复", "Open Context Repair")
          },
          {
            id: "traffic-workspace-hotspot-audit",
            kind: "open-audit",
            label: localize(locale, "查看请求审计", "Open Request Audit"),
            filters: {
              source: "proxy-request",
              level: "error"
            }
          }
        ]
      }));
    }
  }

  if (usageRecords.length >= 3) {
    const largeRecords = usageRecords
      .filter((item) => item.totalTokens >= 20_000)
      .sort((left, right) => right.totalTokens - left.totalTokens);

    const topRecord = largeRecords[0];

    if (topRecord) {
      notices.push(buildNotice({
        id: "usage-spike",
        level: topRecord.totalTokens >= 80_000 ? "high" : "medium",
        summary: localize(
          locale,
          `当前视图中检测到高 token 消耗请求，最高达到 ${topRecord.totalTokens} tokens。`,
          `A high-token request is visible in the current view, peaking at ${topRecord.totalTokens} tokens.`
        ),
        suggestions: unique([
          localize(locale, "先确认这是否来自预期的大上下文任务，而不是异常重试或 prompt 膨胀。", "Confirm whether this is an expected large-context task or an abnormal retry/prompt explosion."),
          localize(locale, `优先核对模型 ${topRecord.model} 与应用 ${topRecord.appCode} 的上下文策略是否过宽。`, `Review whether model ${topRecord.model} and app ${topRecord.appCode} are using an overly broad context strategy.`),
          topRecord.providerId
            ? localize(locale, `同时检查 Provider ${topRecord.providerId} 的稳定性，避免高消耗伴随失败重试。`, `Also inspect provider ${topRecord.providerId} so high consumption is not paired with failure retries.`)
            : localize(locale, "如果无法确认具体 Provider，先按应用和模型缩小使用范围。", "If the concrete provider is unclear, narrow the scope by app and model first.")
        ]),
        actions: [
          {
            id: "usage-spike-focus",
            kind: "usage-filter",
            label: localize(locale, "聚焦高消耗模型", "Focus Model"),
            filters: {
              appCode: topRecord.appCode,
              model: topRecord.model,
              ...(topRecord.providerId ? { providerId: topRecord.providerId } : {})
            }
          },
          {
            id: "usage-spike-logs",
            kind: "request-filter",
            label: localize(locale, "看关联日志", "Open Related Logs"),
            filters: {
              appCode: topRecord.appCode,
              ...(topRecord.providerId ? { providerId: topRecord.providerId } : {})
            }
          },
          {
            id: "usage-spike-binding",
            kind: "edit-binding",
            label: localize(locale, "检查 Binding", "Check Binding"),
            appCode: topRecord.appCode
          },
          {
            id: "usage-spike-quota",
            kind: "edit-app-quota",
            label: localize(locale, "检查配额", "Check Quota"),
            appCode: topRecord.appCode
          },
          {
            id: "usage-spike-assets",
            kind: "open-assets",
            label: localize(locale, "检查上下文资产", "Review Context Assets")
          },
          {
            id: "usage-spike-audit",
            kind: "open-audit",
            label: localize(locale, "查看配额审计", "Open Quota Audit"),
            filters: {
              source: "quota",
              appCode: topRecord.appCode
            }
          },
          ...(topRecord.providerId
            ? [
                {
                  id: "usage-spike-provider",
                  kind: "edit-provider" as const,
                  label: localize(locale, "检查 Provider", "Check Provider"),
                  providerId: topRecord.providerId
                }
              ]
            : [])
        ]
      }));
    }
  }

  const unhealthyProvidersReceivingTraffic = snapshot.providerDiagnostics.filter(
    (item) =>
      item.requestCount > 0 &&
      (item.diagnosisStatus === "down" || item.diagnosisStatus === "degraded")
  );

  const target = unhealthyProvidersReceivingTraffic[0];

  if (target) {
    notices.push(buildNotice({
      id: "traffic-unhealthy-provider",
      level: target.diagnosisStatus === "down" ? "high" : "medium",
      summary: localize(
        locale,
        `Provider ${target.providerId} 当前状态为 ${target.diagnosisStatus}，但仍在承接流量。`,
        `Provider ${target.providerId} is currently ${target.diagnosisStatus} but is still receiving traffic.`
      ),
      suggestions: unique([
        localize(locale, "优先确认是否需要人工隔离，避免失败继续扩大。", "Decide whether manual isolation is needed first to prevent more failures."),
        localize(locale, "同时检查主 Binding、故障转移链和恢复探测是否已经失效。", "Also review the primary binding, failover chain, and recovery probe state."),
        localize(locale, "如果最近已经恢复，不要只看状态标签，要结合请求日志确认真实结果。", "If it recently recovered, confirm using request logs instead of relying on the status tag alone.")
      ]),
      actions: [
        {
          id: "traffic-unhealthy-provider-filter",
          kind: "request-filter",
          label: localize(locale, "只看该 Provider", "Filter Provider"),
          filters: {
            providerId: target.providerId
          }
        },
        {
          id: "traffic-unhealthy-provider-usage",
          kind: "usage-filter",
          label: localize(locale, "查看用量", "View Usage"),
          filters: {
            providerId: target.providerId
          }
        },
        {
          id: "traffic-unhealthy-provider-edit",
          kind: "edit-provider",
          label: localize(locale, "编辑 Provider", "Edit Provider"),
          providerId: target.providerId
        },
        {
          id: "traffic-unhealthy-provider-runtime",
          kind: "open-provider-runtime",
          label: localize(locale, "查看运行态", "Open Runtime"),
          providerId: target.providerId
        },
        ...(target.bindingAppCodes[0]
          ? [
              {
                id: "traffic-unhealthy-provider-failover",
                kind: "edit-failover" as const,
                label: localize(locale, "检查故障转移链", "Check Failover"),
                appCode: target.bindingAppCodes[0]
              }
            ]
          : []),
        {
          id: "traffic-unhealthy-provider-routing",
          kind: "open-routing",
          label: localize(locale, "打开路由修复", "Open Routing Repair")
        },
        {
          id: "traffic-unhealthy-provider-audit",
          kind: "open-audit",
          label: localize(locale, "查看健康审计", "Open Health Audit"),
          filters: {
            source: "provider-health",
            providerId: target.providerId
          }
        }
      ]
    }));
  }

  return notices
    .sort((left, right) => levelRank[left.level] - levelRank[right.level])
    .slice(0, 5);
};
