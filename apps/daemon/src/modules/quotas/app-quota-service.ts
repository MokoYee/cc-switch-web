import { type AppCode, type AppQuota, type AppQuotaStatus } from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";
import { AppQuotaRepository } from "./app-quota-repository.js";

export interface AppQuotaDecision {
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly requestsUsed: number;
  readonly tokensUsed: number;
  readonly windowStartedAt: string;
  readonly evaluatedAt: string;
}

const windowStartForPeriod = (period: AppQuota["period"], now = new Date()): string => {
  if (period === "day") {
    const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return utcStart.toISOString();
  }

  return now.toISOString();
};

export class AppQuotaService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly quotaRepository: AppQuotaRepository
  ) {}

  evaluate(appCode: AppCode, now = new Date()): AppQuotaDecision {
    const quota = this.quotaRepository.getByAppCode(appCode);
    const evaluatedAt = now.toISOString();
    const fallbackWindowStart = windowStartForPeriod("day", now);
    if (quota === null || !quota.enabled) {
      return {
        allowed: true,
        reason: null,
        requestsUsed: 0,
        tokensUsed: 0,
        windowStartedAt: fallbackWindowStart,
        evaluatedAt
      };
    }

    const status = this.getStatus(appCode, now);

    if (status.currentState === "exceeded" && quota.maxRequests !== null && status.requestsUsed >= quota.maxRequests) {
      return {
        allowed: false,
        reason: `Request quota exceeded for ${appCode}: ${status.requestsUsed}/${quota.maxRequests} in current ${quota.period}`,
        requestsUsed: status.requestsUsed,
        tokensUsed: status.tokensUsed,
        windowStartedAt: status.windowStartedAt,
        evaluatedAt: status.evaluatedAt
      };
    }

    if (status.currentState === "exceeded" && quota.maxTokens !== null && status.tokensUsed >= quota.maxTokens) {
      return {
        allowed: false,
        reason: `Token quota exceeded for ${appCode}: ${status.tokensUsed}/${quota.maxTokens} in current ${quota.period}`,
        requestsUsed: status.requestsUsed,
        tokensUsed: status.tokensUsed,
        windowStartedAt: status.windowStartedAt,
        evaluatedAt: status.evaluatedAt
      };
    }

    return {
      allowed: true,
      reason: null,
      requestsUsed: status.requestsUsed,
      tokensUsed: status.tokensUsed,
      windowStartedAt: status.windowStartedAt,
      evaluatedAt: status.evaluatedAt
    };
  }

  listStatuses(now = new Date()): AppQuotaStatus[] {
    return this.quotaRepository.list().map((quota) => this.getStatus(quota.appCode, now));
  }

  getStatus(appCode: AppCode, now = new Date()): AppQuotaStatus {
    const quota = this.quotaRepository.getByAppCode(appCode);
    if (quota === null) {
      throw new Error(`App quota not found for ${appCode}`);
    }

    const windowStartedAt = windowStartForPeriod(quota.period, now);
    const usage = this.database
      .prepare(`
        SELECT
          COUNT(*) AS request_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM usage_records
        WHERE app_code = ?
          AND created_at >= ?
      `)
      .get(appCode, windowStartedAt) as {
        request_count: number;
        total_tokens: number;
      };

    const requestsRemaining =
      quota.maxRequests === null ? null : Math.max(0, quota.maxRequests - usage.request_count);
    const tokensRemaining =
      quota.maxTokens === null ? null : Math.max(0, quota.maxTokens - usage.total_tokens);
    const requestUtilization =
      quota.maxRequests === null ? null : Math.min(1, usage.request_count / quota.maxRequests);
    const tokenUtilization =
      quota.maxTokens === null ? null : Math.min(1, usage.total_tokens / quota.maxTokens);
    const highestUtilization = Math.max(requestUtilization ?? 0, tokenUtilization ?? 0);
    const currentState = !quota.enabled
      ? "disabled"
      : highestUtilization >= 1
        ? "exceeded"
        : highestUtilization >= 0.8
          ? "warning"
          : "healthy";

    return {
      quota,
      requestsUsed: usage.request_count,
      tokensUsed: usage.total_tokens,
      requestsRemaining,
      tokensRemaining,
      requestUtilization,
      tokenUtilization,
      currentState,
      windowStartedAt,
      evaluatedAt: now.toISOString()
    };
  }
}
