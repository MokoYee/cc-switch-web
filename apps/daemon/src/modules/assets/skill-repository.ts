import { nowIso, type Skill, type SkillUpsert } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class SkillRepository {
  constructor(private readonly database: SqliteDatabase) {}

  get(id: string): Skill | null {
    const row = this.database
      .prepare(`
        SELECT id, name, app_code, prompt_template_id, content, tags_json, enabled, updated_at
        FROM skills
        WHERE id = ?
      `)
      .get(id) as
      | {
          id: string;
          name: string;
          app_code: Skill["appCode"];
          prompt_template_id: Skill["promptTemplateId"];
          content: string;
          tags_json: string;
          enabled: number;
          updated_at: string;
        }
      | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      appCode: row.app_code,
      promptTemplateId: row.prompt_template_id,
      content: row.content,
      tags: JSON.parse(row.tags_json) as string[],
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    };
  }

  list(): Skill[] {
    const rows = this.database
      .prepare(`
        SELECT id, name, app_code, prompt_template_id, content, tags_json, enabled, updated_at
        FROM skills
        ORDER BY name ASC, id ASC
      `)
      .all() as Array<{
        id: string;
        name: string;
        app_code: Skill["appCode"];
        prompt_template_id: Skill["promptTemplateId"];
        content: string;
        tags_json: string;
        enabled: number;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      appCode: row.app_code,
      promptTemplateId: row.prompt_template_id,
      content: row.content,
      tags: JSON.parse(row.tags_json) as string[],
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    }));
  }

  countByPromptTemplateId(promptTemplateId: string): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM skills WHERE prompt_template_id = ?")
      .get(promptTemplateId) as { count: number };
    return row.count;
  }

  upsert(input: SkillUpsert): Skill {
    const updatedAt = nowIso();
    this.database
      .prepare(`
        INSERT INTO skills (
          id, name, app_code, prompt_template_id, content, tags_json, enabled, updated_at
        ) VALUES (
          @id, @name, @appCode, @promptTemplateId, @content, @tagsJson, @enabled, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          app_code = excluded.app_code,
          prompt_template_id = excluded.prompt_template_id,
          content = excluded.content,
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

    const item = this.get(input.id);
    if (item === null) {
      throw new Error(`Failed to persist skill ${input.id}`);
    }
    return item;
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM skills WHERE id = ?").run(id);
    return result.changes > 0;
  }

  replaceAll(items: Skill[]): void {
    this.database.prepare("DELETE FROM skills").run();
    const statement = this.database.prepare(`
      INSERT INTO skills (
        id, name, app_code, prompt_template_id, content, tags_json, enabled, updated_at
      ) VALUES (
        @id, @name, @appCode, @promptTemplateId, @content, @tagsJson, @enabled, @updatedAt
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
