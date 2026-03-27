import { nowIso, type AppCode } from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";

export interface McpEventRecord {
  readonly id: number;
  readonly appCode: AppCode | null;
  readonly action:
    | "server-upsert"
    | "server-delete"
    | "binding-upsert"
    | "binding-delete"
    | "import"
    | "governance-repair"
    | "host-apply"
    | "host-rollback";
  readonly targetType: "server" | "binding" | "host-sync";
  readonly targetId: string;
  readonly message: string;
  readonly createdAt: string;
}

export class McpEventRepository {
  constructor(private readonly database: SqliteDatabase) {}

  append(input: Omit<McpEventRecord, "id" | "createdAt">): McpEventRecord {
    const createdAt = nowIso();
    const result = this.database
      .prepare(`
        INSERT INTO mcp_events (app_code, action, target_type, target_id, message, created_at)
        VALUES (@appCode, @action, @targetType, @targetId, @message, @createdAt)
      `)
      .run({
        ...input,
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      ...input
    };
  }

  list(limit = 500): McpEventRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, action, target_type, target_id, message, created_at
        FROM mcp_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        app_code: AppCode | null;
        action: McpEventRecord["action"];
        target_type: McpEventRecord["targetType"];
        target_id: string;
        message: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      message: row.message,
      createdAt: row.created_at
    }));
  }
}
