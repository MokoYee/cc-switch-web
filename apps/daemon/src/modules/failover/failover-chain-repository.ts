import { nowIso, type FailoverChain, type FailoverChainUpsert } from "@ai-cli-switch/shared";

import type { SqliteDatabase } from "../../db/database.js";

export class FailoverChainRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): FailoverChain[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, enabled, provider_ids_json, cooldown_seconds, max_attempts, updated_at
        FROM failover_chains
        ORDER BY app_code ASC
      `)
      .all() as Array<{
        id: string;
        app_code: FailoverChain["appCode"];
        enabled: number;
        provider_ids_json: string;
        cooldown_seconds: number;
        max_attempts: number;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      enabled: row.enabled === 1,
      providerIds: JSON.parse(row.provider_ids_json) as string[],
      cooldownSeconds: row.cooldown_seconds,
      maxAttempts: row.max_attempts,
      updatedAt: row.updated_at
    }));
  }

  upsert(input: FailoverChainUpsert): FailoverChain {
    const updatedAt = nowIso();

    this.database
      .prepare(`
        INSERT INTO failover_chains (
          id, app_code, enabled, provider_ids_json, cooldown_seconds, max_attempts, updated_at
        ) VALUES (
          @id, @appCode, @enabled, @providerIdsJson, @cooldownSeconds, @maxAttempts, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          app_code = excluded.app_code,
          enabled = excluded.enabled,
          provider_ids_json = excluded.provider_ids_json,
          cooldown_seconds = excluded.cooldown_seconds,
          max_attempts = excluded.max_attempts,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        enabled: input.enabled ? 1 : 0,
        providerIdsJson: JSON.stringify(input.providerIds),
        updatedAt
      });

    const chain = this.list().find((item) => item.id === input.id);
    if (chain === undefined) {
      throw new Error(`Failed to persist failover chain ${input.id}`);
    }

    return chain;
  }

  countByProviderId(providerId: string): number {
    const row = this.database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM failover_chains
        WHERE EXISTS (
          SELECT 1
          FROM json_each(provider_ids_json)
          WHERE value = ?
        )
      `)
      .get(providerId) as { count: number };

    return row.count;
  }

  delete(id: string): boolean {
    const result = this.database
      .prepare("DELETE FROM failover_chains WHERE id = ?")
      .run(id);

    return result.changes > 0;
  }

  replaceAll(items: FailoverChain[]): void {
    this.database.prepare("DELETE FROM failover_chains").run();

    const statement = this.database.prepare(`
      INSERT INTO failover_chains (
        id, app_code, enabled, provider_ids_json, cooldown_seconds, max_attempts, updated_at
      ) VALUES (
        @id, @appCode, @enabled, @providerIdsJson, @cooldownSeconds, @maxAttempts, @updatedAt
      )
    `);

    for (const item of items) {
      statement.run({
        ...item,
        enabled: item.enabled ? 1 : 0,
        providerIdsJson: JSON.stringify(item.providerIds)
      });
    }
  }
}
