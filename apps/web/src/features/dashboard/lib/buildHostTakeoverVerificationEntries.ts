import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildTrafficTakeoverEntries } from "./buildTrafficTakeoverEntries.js";

export type HostTakeoverVerificationLevel = "low" | "medium" | "high";

export type HostTakeoverVerificationEntry = {
  readonly appCode: DashboardSnapshot["discoveries"][number]["appCode"];
  readonly level: HostTakeoverVerificationLevel;
  readonly verificationState:
    | "not-managed"
    | "managed-no-traffic"
    | "managed-failing"
    | "managed-verified";
  readonly summary: string;
  readonly requestCount: number;
  readonly successLikeCount: number;
  readonly failureLikeCount: number;
  readonly recentEventSummary: string | null;
  readonly recentSuccessSummary: string | null;
  readonly latestSuccessAt: string | null;
};

export const buildHostTakeoverVerificationEntries = (
  snapshot: DashboardSnapshot,
  locale: "zh-CN" | "en-US"
): HostTakeoverVerificationEntry[] =>
  buildTrafficTakeoverEntries(snapshot, locale).map((item) => ({
    appCode: item.appCode,
    level: item.level,
    verificationState: item.verificationState,
    summary: item.summary,
    requestCount: item.requestCount,
    successLikeCount: item.successLikeCount,
    failureLikeCount: item.failureLikeCount,
    recentEventSummary: item.recentEventSummary,
    recentSuccessSummary: item.recentSuccessSummary,
    latestSuccessAt: item.latestSuccessAt
  }));
