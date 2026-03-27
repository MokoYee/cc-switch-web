import { nowIso, type PromptTemplate, type PromptTemplateUpsert } from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";

export class PromptTemplateRepository {
  constructor(private readonly database: SqliteDatabase) {}

  get(id: string): PromptTemplate | null {
    const row = this.database
      .prepare(`
        SELECT id, name, app_code, locale, content, tags_json, enabled, updated_at
        FROM prompt_templates
        WHERE id = ?
      `)
      .get(id) as
      | {
          id: string;
          name: string;
          app_code: PromptTemplate["appCode"];
          locale: PromptTemplate["locale"];
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
      locale: row.locale,
      content: row.content,
      tags: JSON.parse(row.tags_json) as string[],
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    };
  }

  list(): PromptTemplate[] {
    const rows = this.database
      .prepare(`
        SELECT id, name, app_code, locale, content, tags_json, enabled, updated_at
        FROM prompt_templates
        ORDER BY name ASC, id ASC
      `)
      .all() as Array<{
        id: string;
        name: string;
        app_code: PromptTemplate["appCode"];
        locale: PromptTemplate["locale"];
        content: string;
        tags_json: string;
        enabled: number;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      appCode: row.app_code,
      locale: row.locale,
      content: row.content,
      tags: JSON.parse(row.tags_json) as string[],
      enabled: row.enabled === 1,
      updatedAt: row.updated_at
    }));
  }

  exists(id: string): boolean {
    const row = this.database
      .prepare("SELECT 1 AS found FROM prompt_templates WHERE id = ?")
      .get(id) as { found: number } | undefined;
    return row !== undefined;
  }

  upsert(input: PromptTemplateUpsert): PromptTemplate {
    const updatedAt = nowIso();
    this.database
      .prepare(`
        INSERT INTO prompt_templates (
          id, name, app_code, locale, content, tags_json, enabled, updated_at
        ) VALUES (
          @id, @name, @appCode, @locale, @content, @tagsJson, @enabled, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          app_code = excluded.app_code,
          locale = excluded.locale,
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
      throw new Error(`Failed to persist prompt template ${input.id}`);
    }
    return item;
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM prompt_templates WHERE id = ?").run(id);
    return result.changes > 0;
  }

  replaceAll(items: PromptTemplate[]): void {
    this.database.prepare("DELETE FROM prompt_templates").run();
    const statement = this.database.prepare(`
      INSERT INTO prompt_templates (
        id, name, app_code, locale, content, tags_json, enabled, updated_at
      ) VALUES (
        @id, @name, @appCode, @locale, @content, @tagsJson, @enabled, @updatedAt
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
