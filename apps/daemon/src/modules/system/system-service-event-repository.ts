import { nowIso } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export interface SystemServiceEventRecord {
  readonly id: number;
  readonly action: "sync-env" | "install";
  readonly status: "success" | "warning";
  readonly message: string;
  readonly details: Record<string, string | null>;
  readonly createdAt: string;
}

export class SystemServiceEventRepository {
  constructor(private readonly database: SqliteDatabase) {}

  append(input: Omit<SystemServiceEventRecord, "id" | "createdAt">): SystemServiceEventRecord {
    const createdAt = nowIso();
    const result = this.database
      .prepare(`
        INSERT INTO system_service_events (action, status, message, details_json, created_at)
        VALUES (@action, @status, @message, @detailsJson, @createdAt)
      `)
      .run({
        action: input.action,
        status: input.status,
        message: input.message,
        detailsJson: JSON.stringify(input.details),
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      ...input
    };
  }

  list(limit = 500): SystemServiceEventRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, action, status, message, details_json, created_at
        FROM system_service_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        action: SystemServiceEventRecord["action"];
        status: SystemServiceEventRecord["status"];
        message: string;
        details_json: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      message: row.message,
      details: JSON.parse(row.details_json) as Record<string, string | null>,
      createdAt: row.created_at
    }));
  }
}
