import { nowIso, type AppBinding, type AppBindingUpsert } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class BindingRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): AppBinding[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, provider_id, mode, prompt_template_id, skill_id, updated_at
        FROM app_bindings
        ORDER BY app_code ASC
      `)
      .all() as Array<{
      id: string;
      app_code: AppBinding["appCode"];
      provider_id: string;
      mode: AppBinding["mode"];
      prompt_template_id?: string | null;
      skill_id?: string | null;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      providerId: row.provider_id,
      mode: row.mode,
      promptTemplateId: row.prompt_template_id ?? null,
      skillId: row.skill_id ?? null,
      updatedAt: row.updated_at
    }));
  }

  upsert(input: AppBindingUpsert): AppBinding {
    const timestamp = nowIso();

    this.database
      .prepare(`
        INSERT INTO app_bindings (
          id, app_code, provider_id, mode, prompt_template_id, skill_id, updated_at
        )
        VALUES (
          @id, @appCode, @providerId, @mode, @promptTemplateId, @skillId, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          app_code = excluded.app_code,
          provider_id = excluded.provider_id,
          mode = excluded.mode,
          prompt_template_id = excluded.prompt_template_id,
          skill_id = excluded.skill_id,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        promptTemplateId: input.promptTemplateId ?? null,
        skillId: input.skillId ?? null,
        updatedAt: timestamp
      });

    const binding = this.list().find((item) => item.id === input.id);
    if (binding === undefined) {
      throw new Error(`Failed to persist binding ${input.id}`);
    }

    return binding;
  }

  countByProviderId(providerId: string): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM app_bindings WHERE provider_id = ?")
      .get(providerId) as { count: number };

    return row.count;
  }

  delete(id: string): boolean {
    const result = this.database
      .prepare("DELETE FROM app_bindings WHERE id = ?")
      .run(id);

    return result.changes > 0;
  }

  replaceAll(items: AppBinding[]): void {
    this.database.prepare("DELETE FROM app_bindings").run();

    const insertBinding = this.database.prepare(`
      INSERT INTO app_bindings (
        id, app_code, provider_id, mode, prompt_template_id, skill_id, updated_at
      )
      VALUES (
        @id, @appCode, @providerId, @mode, @promptTemplateId, @skillId, @updatedAt
      )
    `);

    for (const item of items) {
      insertBinding.run({
        ...item,
        promptTemplateId: item.promptTemplateId ?? null,
        skillId: item.skillId ?? null
      });
    }
  }
}
