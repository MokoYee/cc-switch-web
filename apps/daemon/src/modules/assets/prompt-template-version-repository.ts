import { nowIso, type PromptTemplate, type PromptTemplateVersion } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class PromptTemplateVersionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(promptTemplateId: string): PromptTemplateVersion[] {
    const rows = this.database
      .prepare(`
        SELECT prompt_template_id, version_number, snapshot_json, created_at
        FROM prompt_template_versions
        WHERE prompt_template_id = ?
        ORDER BY version_number DESC
      `)
      .all(promptTemplateId) as Array<{
        prompt_template_id: string;
        version_number: number;
        snapshot_json: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      promptTemplateId: row.prompt_template_id,
      versionNumber: row.version_number,
      item: JSON.parse(row.snapshot_json) as PromptTemplate,
      createdAt: row.created_at
    }));
  }

  get(promptTemplateId: string, versionNumber: number): PromptTemplateVersion | null {
    const row = this.database
      .prepare(`
        SELECT prompt_template_id, version_number, snapshot_json, created_at
        FROM prompt_template_versions
        WHERE prompt_template_id = ? AND version_number = ?
      `)
      .get(promptTemplateId, versionNumber) as
      | {
          prompt_template_id: string;
          version_number: number;
          snapshot_json: string;
          created_at: string;
        }
      | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      promptTemplateId: row.prompt_template_id,
      versionNumber: row.version_number,
      item: JSON.parse(row.snapshot_json) as PromptTemplate,
      createdAt: row.created_at
    };
  }

  append(item: PromptTemplate): PromptTemplateVersion {
    const nextVersion = this.nextVersionNumber(item.id);
    const createdAt = nowIso();
    this.database
      .prepare(`
        INSERT INTO prompt_template_versions (
          prompt_template_id, version_number, snapshot_json, created_at
        ) VALUES (?, ?, ?, ?)
      `)
      .run(item.id, nextVersion, JSON.stringify(item), createdAt);

    return {
      promptTemplateId: item.id,
      versionNumber: nextVersion,
      item,
      createdAt
    };
  }

  private nextVersionNumber(promptTemplateId: string): number {
    const row = this.database
      .prepare(`
        SELECT COALESCE(MAX(version_number), 0) AS max_version
        FROM prompt_template_versions
        WHERE prompt_template_id = ?
      `)
      .get(promptTemplateId) as { max_version: number };

    return row.max_version + 1;
  }
}
