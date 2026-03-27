import { nowIso, type AppCode } from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";

export interface QuotaEventRecord {
  readonly id: number;
  readonly appCode: AppCode;
  readonly decision: "allowed" | "rejected";
  readonly reason: string;
  readonly requestsUsed: number;
  readonly tokensUsed: number;
  readonly windowStartedAt: string;
  readonly createdAt: string;
}

export class QuotaEventRepository {
  constructor(private readonly database: SqliteDatabase) {}

  append(input: Omit<QuotaEventRecord, "id" | "createdAt">): QuotaEventRecord {
    const createdAt = nowIso();
    const result = this.database
      .prepare(`
        INSERT INTO quota_events (
          app_code, decision, reason, requests_used, tokens_used, window_started_at, created_at
        ) VALUES (
          @appCode, @decision, @reason, @requestsUsed, @tokensUsed, @windowStartedAt, @createdAt
        )
      `)
      .run({
        ...input,
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      ...input,
      createdAt
    };
  }

  list(limit = 500): QuotaEventRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, decision, reason, requests_used, tokens_used, window_started_at, created_at
        FROM quota_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        app_code: AppCode;
        decision: "allowed" | "rejected";
        reason: string;
        requests_used: number;
        tokens_used: number;
        window_started_at: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      decision: row.decision,
      reason: row.reason,
      requestsUsed: row.requests_used,
      tokensUsed: row.tokens_used,
      windowStartedAt: row.window_started_at,
      createdAt: row.created_at
    }));
  }
}
