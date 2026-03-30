import { nowIso, type AppCode, type AppMcpBinding, type AppMcpBindingUpsert } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class AppMcpBindingRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): AppMcpBinding[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, server_id, enabled, updated_at
        FROM app_mcp_bindings
        ORDER BY app_code ASC, server_id ASC
      `)
      .all() as Array<{
        id: string;
        app_code: AppCode;
        server_id: string;
        enabled: number;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      serverId: row.server_id,
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    }));
  }

  listByAppCode(appCode: AppCode): AppMcpBinding[] {
    return this.list().filter((item) => item.appCode === appCode);
  }

  countByServerId(serverId: string): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM app_mcp_bindings WHERE server_id = ?")
      .get(serverId) as { count: number };

    return row.count;
  }

  upsert(input: AppMcpBindingUpsert): AppMcpBinding {
    const updatedAt = nowIso();

    this.database
      .prepare(`
        INSERT INTO app_mcp_bindings (id, app_code, server_id, enabled, updated_at)
        VALUES (@id, @appCode, @serverId, @enabled, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          app_code = excluded.app_code,
          server_id = excluded.server_id,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        enabled: input.enabled ? 1 : 0,
        updatedAt
      });

    const item = this.list().find((binding) => binding.id === input.id);
    if (item === undefined) {
      throw new Error(`Failed to persist MCP app binding ${input.id}`);
    }

    return item;
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM app_mcp_bindings WHERE id = ?").run(id);
    return result.changes > 0;
  }

  replaceAll(items: AppMcpBinding[]): void {
    this.database.prepare("DELETE FROM app_mcp_bindings").run();

    const statement = this.database.prepare(`
      INSERT INTO app_mcp_bindings (id, app_code, server_id, enabled, updated_at)
      VALUES (@id, @appCode, @serverId, @enabled, @updatedAt)
    `);

    for (const item of items) {
      statement.run({
        ...item,
        enabled: item.enabled ? 1 : 0
      });
    }
  }
}
