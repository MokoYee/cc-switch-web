import type { LocaleCode } from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";

export type TrafficTakeoverLevel = "low" | "medium" | "high";

export type TrafficTakeoverVerificationState =
  | "not-managed"
  | "managed-no-traffic"
  | "managed-failing"
  | "managed-verified";

export type TrafficTakeoverActionKind =
  | "open-traffic"
  | "open-runtime"
  | "edit-binding"
  | "edit-failover"
  | "preview-host-takeover";

export type TrafficTakeoverEntry = {
  readonly appCode: DashboardSnapshot["discoveries"][number]["appCode"];
  readonly level: TrafficTakeoverLevel;
  readonly verificationState: TrafficTakeoverVerificationState;
  readonly summary: string;
  readonly requestCount: number;
  readonly successLikeCount: number;
  readonly failureLikeCount: number;
  readonly recentEventSummary: string | null;
  readonly recentSuccessSummary: string | null;
  readonly latestSuccessAt: string | null;
  readonly dominantDecisionReason: DashboardSnapshot["proxyRequestLogs"][number]["decisionReason"];
  readonly hasBinding: boolean;
  readonly discoverySupported: boolean;
  readonly degradedProviderIds: readonly string[];
  readonly recommendedActions: readonly TrafficTakeoverActionKind[];
};

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const unique = <T>(items: readonly T[]): T[] => Array.from(new Set(items));

const pickDominantDecisionReason = (
  logs: readonly DashboardSnapshot["proxyRequestLogs"][number][]
): DashboardSnapshot["proxyRequestLogs"][number]["decisionReason"] => {
  const counts = new Map<string, number>();

  for (const log of logs) {
    if (log.decisionReason === null) {
      continue;
    }
    counts.set(log.decisionReason, (counts.get(log.decisionReason) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  return (sorted[0]?.[0] as DashboardSnapshot["proxyRequestLogs"][number]["decisionReason"] | undefined) ?? null;
};

const buildSummary = ({
  locale,
  managed,
  discovered,
  discoverySupported,
  hasBinding,
  requestCount,
  successLikeCount,
  failureLikeCount,
  dominantDecisionReason,
  degradedProviderIds
}: {
  readonly locale: LocaleCode;
  readonly managed: boolean;
  readonly discovered: boolean;
  readonly discoverySupported: boolean;
  readonly hasBinding: boolean;
  readonly requestCount: number;
  readonly successLikeCount: number;
  readonly failureLikeCount: number;
  readonly dominantDecisionReason: DashboardSnapshot["proxyRequestLogs"][number]["decisionReason"];
  readonly degradedProviderIds: readonly string[];
}): string => {
  if (!managed) {
    if (!discovered) {
      return localize(
        locale,
        "当前还没有发现本机 CLI，先确认宿主机安装状态与扫描结果。",
        "No local CLI has been discovered yet. Confirm host installation state and scan results first."
      );
    }

    if (!discoverySupported) {
      return localize(
        locale,
        "当前 CLI 已发现，但暂时只支持旁路检查，不能直接进入托管态。",
        "This CLI is discovered, but currently supports inspection only and cannot be managed directly."
      );
    }

    if (!hasBinding) {
      return localize(
        locale,
        "当前 CLI 还未接管，而且没有 Binding。先补主路由，再生成宿主机接管预检。",
        "This CLI is not managed and has no binding. Add the primary route first, then generate the host takeover preview."
      );
    }

    return localize(
      locale,
      "当前 CLI 还未接管。先生成宿主机预检，确认目标会切到本地网关。",
      "This CLI is not managed yet. Generate the host takeover preview first and confirm traffic will switch to the local gateway."
    );
  }

  if (requestCount === 0) {
    return hasBinding
      ? localize(
          locale,
          "宿主机已接管，但还没有看到真实代理请求。下一步应直接发起一次 CLI 请求完成闭环验证。",
          "Host takeover is applied, but no real proxy request has been observed yet. Send a CLI request next to complete the verification loop."
        )
      : localize(
          locale,
          "宿主机已接管，但当前还没有 Binding，也没有真实代理请求。先补 Binding，再验证流量。",
          "Host takeover is applied, but there is still no binding and no real proxy request. Add the binding first, then validate traffic."
        );
  }

  if (failureLikeCount > 0 && successLikeCount === 0) {
    if (dominantDecisionReason === "no-binding" || dominantDecisionReason === "context-invalid") {
      return localize(
        locale,
        `宿主机已接管，但最近 ${failureLikeCount} 条请求主要失败在 Binding 或上下文缺失，先修接入契约。`,
        `Host takeover is applied, but the latest ${failureLikeCount} requests are failing mostly because bindings or context are missing. Repair the integration contract first.`
      );
    }

    if (
      dominantDecisionReason === "auth" ||
      dominantDecisionReason === "missing-credential" ||
      dominantDecisionReason === "provider-disabled"
    ) {
      return localize(
        locale,
        `宿主机已接管，但最近 ${failureLikeCount} 条请求主要失败在凭证或 Provider 状态，先看运行态再修主路由。`,
        `Host takeover is applied, but the latest ${failureLikeCount} requests are failing mainly because of credentials or provider state. Inspect runtime first, then repair the primary route.`
      );
    }

    if (
      dominantDecisionReason === "upstream-unavailable" ||
      dominantDecisionReason === "timeout" ||
      dominantDecisionReason === "network" ||
      dominantDecisionReason === "rate-limit"
    ) {
      return localize(
        locale,
        `宿主机已接管，但最近 ${failureLikeCount} 条请求主要失败在上游可用性，先确认运行态与故障转移链。`,
        `Host takeover is applied, but the latest ${failureLikeCount} requests are failing mainly because of upstream availability. Check runtime and failover chain first.`
      );
    }

    return localize(
      locale,
      `宿主机已接管，但最近 ${failureLikeCount} 条请求仍未成功，先按请求结果回看主路由与运行态。`,
      `Host takeover is applied, but the latest ${failureLikeCount} requests are still failing. Review routing and runtime from the request results first.`
    );
  }

  if (failureLikeCount > 0 || degradedProviderIds.length > 0) {
    return localize(
      locale,
      `接管闭环已经跑通，但最近仍有 ${failureLikeCount} 条异常请求，建议继续观察运行态与故障转移链。`,
      `The takeover loop is working, but there are still ${failureLikeCount} abnormal requests recently. Continue observing runtime and failover behavior.`
    );
  }

  return localize(
    locale,
    `接管闭环已经完成，最近已观察到 ${successLikeCount} 条有效代理请求。`,
    `The takeover loop is complete and ${successLikeCount} effective proxy requests have been observed recently.`
  );
};

const buildRecommendedActions = ({
  managed,
  discoverySupported,
  hasBinding,
  requestCount,
  dominantDecisionReason,
  degradedProviderIds
}: {
  readonly managed: boolean;
  readonly discoverySupported: boolean;
  readonly hasBinding: boolean;
  readonly requestCount: number;
  readonly dominantDecisionReason: DashboardSnapshot["proxyRequestLogs"][number]["decisionReason"];
  readonly degradedProviderIds: readonly string[];
}): TrafficTakeoverActionKind[] => {
  if (!managed) {
    return unique<TrafficTakeoverActionKind>([
      ...(!hasBinding ? (["edit-binding"] as const) : []),
      ...(discoverySupported ? (["preview-host-takeover"] as const) : []),
      "open-runtime"
    ]);
  }

  if (requestCount === 0) {
    return unique<TrafficTakeoverActionKind>([
      ...(!hasBinding ? (["edit-binding"] as const) : []),
      "open-traffic",
      "open-runtime"
    ]);
  }

  if (dominantDecisionReason === "no-binding" || dominantDecisionReason === "context-invalid") {
    return unique<TrafficTakeoverActionKind>(["edit-binding", "open-traffic", "open-runtime"]);
  }

  if (
    dominantDecisionReason === "upstream-unavailable" ||
    dominantDecisionReason === "timeout" ||
    dominantDecisionReason === "network" ||
    dominantDecisionReason === "rate-limit"
  ) {
    return unique<TrafficTakeoverActionKind>([
      "open-runtime",
      "edit-failover",
      "open-traffic"
    ]);
  }

  if (
    dominantDecisionReason === "auth" ||
    dominantDecisionReason === "missing-credential" ||
    dominantDecisionReason === "provider-disabled"
  ) {
    return unique<TrafficTakeoverActionKind>([
      "open-runtime",
      "edit-binding",
      "open-traffic"
    ]);
  }

  return unique<TrafficTakeoverActionKind>([
    ...(degradedProviderIds.length > 0 ? (["open-runtime", "edit-failover"] as const) : []),
    "open-traffic",
    ...(!hasBinding ? (["edit-binding"] as const) : [])
  ]);
};

export const buildTrafficTakeoverEntries = (
  snapshot: DashboardSnapshot,
  locale: LocaleCode
): TrafficTakeoverEntry[] => {
  const appCodes = unique([
    ...snapshot.discoveries.map((item) => item.appCode),
    ...snapshot.bindings.map((item) => item.appCode),
    ...snapshot.failoverChains.map((item) => item.appCode),
    ...snapshot.proxyRequestLogs.map((item) => item.appCode),
    ...snapshot.hostIntegrationEvents.map((item) => item.appCode)
  ]);

  return appCodes
    .map((appCode) => {
      const discovery = snapshot.discoveries.find((item) => item.appCode === appCode) ?? null;
      const managed = discovery?.integrationState === "managed";
      const discovered = discovery?.discovered ?? false;
      const discoverySupported = discovery?.takeoverSupported ?? false;
      const hasBinding = snapshot.bindings.some((item) => item.appCode === appCode);
      const relatedRequests = snapshot.proxyRequestLogs.filter((item) => item.appCode === appCode);
      const recentSuccessRequest =
        [...relatedRequests]
          .filter((item) => item.outcome === "success" || item.outcome === "failover")
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
      const successLikeCount = relatedRequests.filter(
        (item) => item.outcome === "success" || item.outcome === "failover"
      ).length;
      const failureLikeCount = relatedRequests.filter(
        (item) => item.outcome === "error" || item.outcome === "rejected"
      ).length;
      const dominantDecisionReason = pickDominantDecisionReason(
        relatedRequests.filter((item) => item.outcome !== "success")
      );
      const recentEvent =
        [...snapshot.hostIntegrationEvents]
          .filter((item) => item.appCode === appCode)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
      const degradedProviderIds = snapshot.providerDiagnostics
        .filter(
          (item) =>
            (item.bindingAppCodes.includes(appCode) || item.failoverAppCodes.includes(appCode)) &&
            (item.diagnosisStatus === "degraded" ||
              item.diagnosisStatus === "recovering" ||
              item.diagnosisStatus === "down" ||
              item.circuitState !== "closed")
        )
        .map((item) => item.providerId);

      let verificationState: TrafficTakeoverVerificationState;
      if (!managed) {
        verificationState = "not-managed";
      } else if (relatedRequests.length === 0) {
        verificationState = "managed-no-traffic";
      } else if (
        !hasBinding ||
        (failureLikeCount > 0 && successLikeCount === 0) ||
        dominantDecisionReason === "no-binding" ||
        dominantDecisionReason === "context-invalid"
      ) {
        verificationState = "managed-failing";
      } else {
        verificationState = "managed-verified";
      }

      const level: TrafficTakeoverLevel =
        verificationState === "managed-failing"
          ? "high"
          : verificationState === "managed-no-traffic" ||
              (verificationState === "not-managed" && discoverySupported) ||
              degradedProviderIds.length > 0 ||
              failureLikeCount > 0
            ? "medium"
            : "low";

      return {
        appCode,
        level,
        verificationState,
        summary: buildSummary({
          locale,
          managed,
          discovered,
          discoverySupported,
          hasBinding,
          requestCount: relatedRequests.length,
          successLikeCount,
          failureLikeCount,
          dominantDecisionReason,
          degradedProviderIds
        }),
        requestCount: relatedRequests.length,
        successLikeCount,
        failureLikeCount,
        recentEventSummary: recentEvent?.message ?? null,
        recentSuccessSummary:
          recentSuccessRequest === null
            ? null
            : localize(
                locale,
                `${recentSuccessRequest.method} ${recentSuccessRequest.path} / ${recentSuccessRequest.providerId ?? "no-provider"} / ${recentSuccessRequest.createdAt}`,
                `${recentSuccessRequest.method} ${recentSuccessRequest.path} / ${recentSuccessRequest.providerId ?? "no-provider"} / ${recentSuccessRequest.createdAt}`
              ),
        latestSuccessAt: recentSuccessRequest?.createdAt ?? null,
        dominantDecisionReason,
        hasBinding,
        discoverySupported,
        degradedProviderIds,
        recommendedActions: buildRecommendedActions({
          managed,
          discoverySupported,
          hasBinding,
          requestCount: relatedRequests.length,
          dominantDecisionReason,
          degradedProviderIds
        })
      };
    })
    .sort((left, right) => {
      const levelRank: Record<TrafficTakeoverLevel, number> = {
        high: 0,
        medium: 1,
        low: 2
      };

      if (levelRank[left.level] !== levelRank[right.level]) {
        return levelRank[left.level] - levelRank[right.level];
      }

      if (right.failureLikeCount !== left.failureLikeCount) {
        return right.failureLikeCount - left.failureLikeCount;
      }

      if (right.requestCount !== left.requestCount) {
        return right.requestCount - left.requestCount;
      }

      return left.appCode.localeCompare(right.appCode);
    });
};
