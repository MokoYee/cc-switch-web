import { nowIso, type AppQuota, type AppQuotaUpsert } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class AppQuotaRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): AppQuota[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, enabled, period, max_requests, max_tokens, updated_at
        FROM app_quotas
        ORDER BY app_code ASC
      `)
      .all() as Array<{
        id: string;
        app_code: AppQuota["appCode"];
        enabled: number;
        period: AppQuota["period"];
        max_requests: number | null;
        max_tokens: number | null;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      enabled: row.enabled === 1,
      period: row.period,
      maxRequests: row.max_requests,
      maxTokens: row.max_tokens,
      updatedAt: row.updated_at
    }));
  }

  getByAppCode(appCode: AppQuota["appCode"]): AppQuota | null {
    return this.list().find((item) => item.appCode === appCode) ?? null;
  }

  upsert(input: AppQuotaUpsert): AppQuota {
    const updatedAt = nowIso();
    this.database
      .prepare(`
        INSERT INTO app_quotas (
          id, app_code, enabled, period, max_requests, max_tokens, updated_at
        ) VALUES (
          @id, @appCode, @enabled, @period, @maxRequests, @maxTokens, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          app_code = excluded.app_code,
          enabled = excluded.enabled,
          period = excluded.period,
          max_requests = excluded.max_requests,
          max_tokens = excluded.max_tokens,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        enabled: input.enabled ? 1 : 0,
        updatedAt
      });

    const quota = this.list().find((item) => item.id === input.id);
    if (quota === undefined) {
      throw new Error(`Failed to persist app quota ${input.id}`);
    }

    return quota;
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM app_quotas WHERE id = ?").run(id);
    return result.changes > 0;
  }

  replaceAll(items: AppQuota[]): void {
    this.database.prepare("DELETE FROM app_quotas").run();

    const statement = this.database.prepare(`
      INSERT INTO app_quotas (
        id, app_code, enabled, period, max_requests, max_tokens, updated_at
      ) VALUES (
        @id, @appCode, @enabled, @period, @maxRequests, @maxTokens, @updatedAt
      )
    `);

    for (const item of items) {
      statement.run({
        ...item,
        enabled: item.enabled ? 1 : 0
      });
    }
  }
}
