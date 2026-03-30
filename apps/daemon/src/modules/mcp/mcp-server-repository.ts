import { nowIso, type McpServer, type McpServerUpsert } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class McpServerRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): McpServer[] {
    const rows = this.database
      .prepare(`
        SELECT id, name, transport, command, args_json, url, env_json, headers_json, enabled, created_at, updated_at
        FROM mcp_servers
        ORDER BY created_at ASC
      `)
      .all() as Array<{
        id: string;
        name: string;
        transport: McpServer["transport"];
        command: string | null;
        args_json: string;
        url: string | null;
        env_json: string;
        headers_json: string;
        enabled: number;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      transport: row.transport,
      command: row.command,
      args: JSON.parse(row.args_json) as string[],
      url: row.url,
      env: JSON.parse(row.env_json) as Record<string, string>,
      headers: JSON.parse(row.headers_json) as Record<string, string>,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  exists(id: string): boolean {
    const row = this.database
      .prepare("SELECT 1 AS present FROM mcp_servers WHERE id = ?")
      .get(id) as { present: number } | undefined;

    return row !== undefined;
  }

  upsert(input: McpServerUpsert): McpServer {
    const existing = this.database
      .prepare("SELECT created_at FROM mcp_servers WHERE id = ?")
      .get(input.id) as { created_at: string } | undefined;
    const timestamp = nowIso();

    this.database
      .prepare(`
        INSERT INTO mcp_servers (
          id, name, transport, command, args_json, url, env_json, headers_json, enabled, created_at, updated_at
        ) VALUES (
          @id, @name, @transport, @command, @argsJson, @url, @envJson, @headersJson, @enabled, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          transport = excluded.transport,
          command = excluded.command,
          args_json = excluded.args_json,
          url = excluded.url,
          env_json = excluded.env_json,
          headers_json = excluded.headers_json,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        argsJson: JSON.stringify(input.args),
        envJson: JSON.stringify(input.env),
        headersJson: JSON.stringify(input.headers),
        enabled: input.enabled ? 1 : 0,
        createdAt: existing?.created_at ?? timestamp,
        updatedAt: timestamp
      });

    const item = this.list().find((server) => server.id === input.id);
    if (item === undefined) {
      throw new Error(`Failed to persist MCP server ${input.id}`);
    }

    return item;
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
    return result.changes > 0;
  }

  replaceAll(items: McpServer[]): void {
    this.database.prepare("DELETE FROM mcp_servers").run();

    const statement = this.database.prepare(`
      INSERT INTO mcp_servers (
        id, name, transport, command, args_json, url, env_json, headers_json, enabled, created_at, updated_at
      ) VALUES (
        @id, @name, @transport, @command, @argsJson, @url, @envJson, @headersJson, @enabled, @createdAt, @updatedAt
      )
    `);

    for (const item of items) {
      statement.run({
        ...item,
        argsJson: JSON.stringify(item.args),
        envJson: JSON.stringify(item.env),
        headersJson: JSON.stringify(item.headers),
        enabled: item.enabled ? 1 : 0
      });
    }
  }
}
