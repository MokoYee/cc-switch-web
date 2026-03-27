import { nowIso, type Workspace, type WorkspaceUpsert } from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";

export class WorkspaceRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): Workspace[] {
    const rows = this.database
      .prepare(`
        SELECT
          id, name, root_path, app_code, default_provider_id, default_prompt_template_id,
          default_skill_id, tags_json, enabled, updated_at
        FROM workspaces
        ORDER BY name ASC, id ASC
      `)
      .all() as Array<{
        id: string;
        name: string;
        root_path: string;
        app_code: Workspace["appCode"];
        default_provider_id: string | null;
        default_prompt_template_id: string | null;
        default_skill_id: string | null;
        tags_json: string;
        enabled: number;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      appCode: row.app_code,
      defaultProviderId: row.default_provider_id,
      defaultPromptTemplateId: row.default_prompt_template_id,
      defaultSkillId: row.default_skill_id,
      tags: JSON.parse(row.tags_json) as string[],
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    }));
  }

  upsert(input: WorkspaceUpsert): Workspace {
    const updatedAt = nowIso();
    this.database
      .prepare(`
        INSERT INTO workspaces (
          id, name, root_path, app_code, default_provider_id, default_prompt_template_id,
          default_skill_id, tags_json, enabled, updated_at
        ) VALUES (
          @id, @name, @rootPath, @appCode, @defaultProviderId, @defaultPromptTemplateId,
          @defaultSkillId, @tagsJson, @enabled, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          root_path = excluded.root_path,
          app_code = excluded.app_code,
          default_provider_id = excluded.default_provider_id,
          default_prompt_template_id = excluded.default_prompt_template_id,
          default_skill_id = excluded.default_skill_id,
          tags_json = excluded.tags_json,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        tagsJson: JSON.stringify(input.tags),
        enabled: input.enabled ? 1 : 0,
        updatedAt
      });

    const item = this.list().find((current) => current.id === input.id);
    if (item === undefined) {
      throw new Error(`Failed to persist workspace ${input.id}`);
    }
    return item;
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
    return result.changes > 0;
  }

  replaceAll(items: Workspace[]): void {
    this.database.prepare("DELETE FROM workspaces").run();
    const statement = this.database.prepare(`
      INSERT INTO workspaces (
        id, name, root_path, app_code, default_provider_id, default_prompt_template_id,
        default_skill_id, tags_json, enabled, updated_at
      ) VALUES (
        @id, @name, @rootPath, @appCode, @defaultProviderId, @defaultPromptTemplateId,
        @defaultSkillId, @tagsJson, @enabled, @updatedAt
      )
    `);

    for (const item of items) {
      statement.run({
        ...item,
        tagsJson: JSON.stringify(item.tags),
        enabled: item.enabled ? 1 : 0
      });
    }
  }
}
