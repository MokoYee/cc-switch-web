import type {
  AppBindingRoutingPreview,
  FailoverChainRoutingPreview,
  LocaleCode,
  ProviderRoutingPreview,
  ProxyRequestLog
} from "@cc-switch-web/shared";

export type RoutingPrimaryCauseCode =
  | "healthy"
  | "binding-contract"
  | "auth-credentials"
  | "quota-policy"
  | "upstream-availability"
  | "routing-contract"
  | "degraded-failover"
  | "generic-failure";

export type RoutingPrimaryCause = {
  readonly code: RoutingPrimaryCauseCode;
  readonly level: "low" | "medium" | "high";
  readonly label: string;
  readonly summary: string;
  readonly suggestions: readonly string[];
};

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const unique = <T>(items: readonly T[]): T[] => Array.from(new Set(items));

const buildCauseNotice = (
  locale: LocaleCode,
  code: RoutingPrimaryCauseCode,
  options?: {
    readonly count?: number;
    readonly degradedCandidates?: number;
    readonly nextProviderId?: string | null;
  }
): RoutingPrimaryCause => {
  const countLabel = options?.count ?? 0;

  switch (code) {
    case "binding-contract":
      return {
        code,
        level: "high",
        label: localize(locale, "Binding / 上下文", "Binding / Context"),
        summary: localize(
          locale,
          `当前主因是接入契约未闭合（${countLabel} 条），应先修 Binding、上下文关联和宿主机接管。`,
          `The primary issue is an incomplete integration contract (${countLabel} logs). Repair bindings, context association, and host takeover first.`
        ),
        suggestions: [
          localize(locale, "优先核对 app binding、workspace/session 关联和宿主机接管是否一致。", "Review app binding, workspace or session association, and host takeover consistency first."),
          localize(locale, "不要把无上下文流量直接当成 Provider 故障，否则修复方向会跑偏。", "Do not treat contextless traffic as a provider outage, or the repair path will drift."),
          localize(locale, "修复后回看请求结果，确认流量已经命中预期对象。", "Review request results after the fix and confirm traffic is resolving to the expected target.")
        ]
      };
    case "auth-credentials":
      return {
        code,
        level: "high",
        label: localize(locale, "凭证 / 权限", "Credentials / Permissions"),
        summary: localize(
          locale,
          `当前主因是凭证或权限异常（${countLabel} 条），应先修 Provider 凭证，不要误判成路由问题。`,
          `The primary issue is credentials or permissions (${countLabel} logs). Fix provider credentials first instead of treating this as a routing issue.`
        ),
        suggestions: [
          localize(locale, "先确认 API Key、组织权限和上游账号状态。", "Check the API key, org permissions, and upstream account state first."),
          localize(locale, "如果该 Provider 仍在接流量，先止损或隔离，再做恢复。", "If the provider is still receiving traffic, contain or isolate it before recovery."),
          localize(locale, "修复后回看运行态和失败请求，确认 auth 错误已经真正消失。", "Review runtime and failed requests after the fix to confirm auth errors are truly gone.")
        ]
      };
    case "quota-policy":
      return {
        code,
        level: "medium",
        label: localize(locale, "配额策略", "Quota Policy"),
        summary: localize(
          locale,
          `当前主因是配额拒绝（${countLabel} 条），应优先修配额窗口与阈值，而不是上游 Provider。`,
          `The primary issue is quota rejection (${countLabel} logs). Fix quota windows and thresholds before touching upstream providers.`
        ),
        suggestions: [
          localize(locale, "先确认是短时高峰，还是阈值本身设置过紧。", "Determine whether this is a short burst or an overly strict threshold."),
          localize(locale, "不要把 quota-rejected 误判成上游不可用。", "Do not mistake quota-rejected traffic for upstream unavailability."),
          localize(locale, "调完后回看配额审计和真实请求结果。", "Review quota audit and live request results after adjustment.")
        ]
      };
    case "upstream-availability":
      return {
        code,
        level: "high",
        label: localize(locale, "上游可用性", "Upstream Availability"),
        summary: localize(
          locale,
          `当前主因是上游可用性异常（${countLabel} 条），应先确认探测结果和故障转移链是否在兜底。`,
          `The primary issue is upstream availability (${countLabel} logs). Confirm probe results and whether failover is protecting traffic first.`
        ),
        suggestions: [
          localize(locale, "先确认故障是持续存在，还是只是短时间窗口抖动。", "Determine whether the fault is persistent or just a brief instability window."),
          options?.nextProviderId
            ? localize(locale, `最近流量经常切到 ${options.nextProviderId}，说明故障转移链正在兜底。`, `Traffic is frequently falling through to ${options.nextProviderId}, which suggests failover is actively protecting requests.`)
            : localize(locale, "如果没有后续接管目标，要优先确认是否还有可用候选 Provider。", "If there is no downstream takeover target, verify whether any viable fallback provider still exists."),
          localize(locale, "探测恢复后再执行 recover，不要只看状态标签。", "Recover only after a successful probe instead of relying on a status badge alone.")
        ]
      };
    case "routing-contract":
      return {
        code,
        level: "high",
        label: localize(locale, "路由契约", "Routing Contract"),
        summary: localize(
          locale,
          "当前主路由契约本身不稳定，应该先收敛主 Binding，再确认 Failover 顺序和可执行性。",
          "The primary routing contract itself is unstable. Normalize the primary binding first, then confirm failover order and executability."
        ),
        suggestions: [
          localize(locale, "同一 app 只保留一个主 Binding。", "Keep only one primary binding per app."),
          localize(locale, "Failover 链必须包含主 Binding Provider，并移除不存在或重复的 Provider。", "The failover chain must include the primary bound provider and remove missing or duplicate providers."),
          localize(locale, "保存前确认 execution plan 中 selected 候选真的是预期主路径。", "Confirm the selected candidate in the execution plan is truly the intended primary route before saving.")
        ]
      };
    case "degraded-failover":
      return {
        code,
        level: "medium",
        label: localize(locale, "降级 / 兜底", "Degraded / Failover"),
        summary: localize(
          locale,
          `当前链路仍可执行，但有 ${options?.degradedCandidates ?? 0} 个候选处于降级或恢复态。`,
          `The routing chain is still executable, but ${options?.degradedCandidates ?? 0} candidates are degraded or recovering.`
        ),
        suggestions: [
          localize(locale, "先打开相关 Provider runtime，确认最近失败是否还在继续。", "Open the related provider runtime first and confirm whether recent failures are still ongoing."),
          localize(locale, "如果候选是 half-open，优先等待或完成恢复探测。", "If a candidate is half-open, wait for or complete recovery probing first."),
          localize(locale, "如果 selected 候选已降级，考虑先切到更稳定的上游。", "If the selected candidate is already degraded, consider shifting to a more stable upstream first.")
        ]
      };
    case "generic-failure":
      return {
        code,
        level: "medium",
        label: localize(locale, "请求失败", "Request Failures"),
        summary: localize(
          locale,
          `当前主因仍不够集中（${countLabel} 条），建议先按最新失败请求逐项核对。`,
          `The dominant issue is still mixed (${countLabel} logs). Review the latest failed requests one by one first.`
        ),
        suggestions: [
          localize(locale, "先看最近失败请求，再决定修 Provider、Binding 还是上下文对象。", "Inspect recent failed requests first, then decide whether to change a provider, binding, or context object."),
          options?.nextProviderId
            ? localize(locale, `最近还出现了流量继续切到 ${options.nextProviderId}，修复时要一并确认故障转移结果。`, `Requests are also falling through to ${options.nextProviderId}; confirm the failover result as part of the repair.`)
            : localize(locale, "如果没有明显故障转移迹象，优先确认主路由本身是否可执行。", "If there is no obvious failover signal, verify that the primary route itself is executable."),
          localize(locale, "修复后刷新运行态和请求结果，看主因是否已经收敛。", "Refresh runtime and request results after the fix and verify the dominant cause is converging.")
        ]
      };
    case "healthy":
      return {
        code,
        level: "low",
        label: localize(locale, "已闭环", "Closed Loop"),
        summary: localize(
          locale,
          "当前主流程已基本闭环，可以继续进入请求验证和更细治理。",
          "The current primary flow is basically closed and can proceed to request verification and deeper governance."
        ),
        suggestions: [
          localize(locale, "保存后立即看请求结果，确认 selected 候选真正接到了流量。", "Inspect requests immediately after saving and confirm the selected candidate actually receives traffic."),
          localize(locale, "如果 failover 已开启，再顺手看是否有新的 failover 请求。", "If failover is enabled, also check whether new failover requests appear."),
          localize(locale, "运行态稳定后，再决定是否继续扩充候选链。", "Expand the candidate chain only after runtime becomes stable.")
        ]
      };
  }
};

const pickDominantDecisionReason = (
  logs: readonly ProxyRequestLog[]
): { readonly reason: NonNullable<ProxyRequestLog["decisionReason"]>; readonly count: number } | null => {
  const counts = new Map<NonNullable<ProxyRequestLog["decisionReason"]>, number>();
  for (const item of logs) {
    if (item.decisionReason === null) {
      continue;
    }
    counts.set(item.decisionReason, (counts.get(item.decisionReason) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  const target = sorted[0];
  return target ? { reason: target[0], count: target[1] } : null;
};

export const buildRequestPrimaryCause = (
  logs: readonly ProxyRequestLog[],
  locale: LocaleCode
): RoutingPrimaryCause | null => {
  const actionableLogs = logs.filter((item) => item.outcome !== "success");
  if (actionableLogs.length === 0) {
    return null;
  }

  const dominantReason = pickDominantDecisionReason(actionableLogs);
  const nextProviderId =
    actionableLogs.find((item) => item.nextProviderId !== null)?.nextProviderId ?? null;
  if (dominantReason === null) {
    return buildCauseNotice(locale, "generic-failure", {
      count: actionableLogs.length,
      nextProviderId
    });
  }

  if (dominantReason.reason === "no-binding" || dominantReason.reason === "context-invalid") {
    return buildCauseNotice(locale, "binding-contract", {
      count: dominantReason.count
    });
  }

  if (
    dominantReason.reason === "auth" ||
    dominantReason.reason === "missing-credential" ||
    dominantReason.reason === "provider-disabled"
  ) {
    return buildCauseNotice(locale, "auth-credentials", {
      count: dominantReason.count
    });
  }

  if (dominantReason.reason === "quota-rejected") {
    return buildCauseNotice(locale, "quota-policy", {
      count: dominantReason.count
    });
  }

  if (
    dominantReason.reason === "upstream-unavailable" ||
    dominantReason.reason === "timeout" ||
    dominantReason.reason === "network" ||
    dominantReason.reason === "rate-limit"
  ) {
    return buildCauseNotice(locale, "upstream-availability", {
      count: dominantReason.count,
      nextProviderId
    });
  }

  return buildCauseNotice(locale, "generic-failure", {
    count: dominantReason.count,
    nextProviderId
  });
};

export const buildRoutingPreviewPrimaryCause = (
  preview: ProviderRoutingPreview | AppBindingRoutingPreview | FailoverChainRoutingPreview,
  locale: LocaleCode
): RoutingPrimaryCause => {
  if (preview.issueCodes.includes("no-routable-provider")) {
    return buildCauseNotice(locale, "routing-contract");
  }

  if (
    preview.issueCodes.includes("failover-missing-primary") ||
    preview.issueCodes.includes("duplicate-app-binding") ||
    preview.issueCodes.includes("provider-missing") ||
    preview.issueCodes.includes("failover-provider-missing") ||
    preview.issueCodes.includes("failover-provider-duplicate") ||
    preview.issueCodes.includes("failover-max-attempts-exceeds-candidates")
  ) {
    return buildCauseNotice(locale, "routing-contract");
  }

  if (
    preview.issueCodes.includes("credential-missing") ||
    preview.issueCodes.includes("provider-disabled")
  ) {
    return buildCauseNotice(locale, "auth-credentials", {
      count: preview.issueCodes.length
    });
  }

  if (preview.issueCodes.includes("circuit-open")) {
    return buildCauseNotice(locale, "upstream-availability", {
      count: preview.issueCodes.length
    });
  }

  if ("executionPlan" in preview) {
    const degradedCandidates = preview.executionPlan.candidates.filter(
      (candidate) => candidate.decision === "degraded" || candidate.decision === "fallback"
    ).length;
    if (degradedCandidates > 0) {
      return buildCauseNotice(locale, "degraded-failover", {
        degradedCandidates
      });
    }
  }

  return buildCauseNotice(locale, "healthy");
};

export const renderRoutingPrimaryCauseLabel = (
  cause: RoutingPrimaryCause | null,
  locale: LocaleCode
): string => cause?.label ?? localize(locale, "无", "None");
