import { nowIso, type SessionRecord, type SessionRecordUpsert } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class SessionRecordRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): SessionRecord[] {
    const rows = this.database
      .prepare(`
        SELECT
          id, workspace_id, app_code, title, cwd, provider_id, prompt_template_id, skill_id,
          status, started_at, updated_at
        FROM session_records
        ORDER BY updated_at DESC, id DESC
      `)
      .all() as Array<{
        id: string;
        workspace_id: string | null;
        app_code: SessionRecord["appCode"];
        title: string;
        cwd: string;
        provider_id: string | null;
        prompt_template_id: string | null;
        skill_id: string | null;
        status: SessionRecord["status"];
        started_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      appCode: row.app_code,
      title: row.title,
      cwd: row.cwd,
      providerId: row.provider_id,
      promptTemplateId: row.prompt_template_id,
      skillId: row.skill_id,
      status: row.status,
      startedAt: row.started_at,
      updatedAt: row.updated_at
    }));
  }

  countByWorkspaceId(workspaceId: string): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM session_records WHERE workspace_id = ?")
      .get(workspaceId) as { count: number };
    return row.count;
  }

  findById(id: string): SessionRecord | null {
    return this.list().find((item) => item.id === id) ?? null;
  }

  findActiveById(id: string): SessionRecord | null {
    const item = this.findById(id);
    if (item === null || item.status !== "active") {
      return null;
    }
    return item;
  }

  listByStatus(status: SessionRecord["status"]): SessionRecord[] {
    return this.list().filter((item) => item.status === status);
  }

  upsert(input: SessionRecordUpsert): SessionRecord {
    const updatedAt = nowIso();
    this.database
      .prepare(`
        INSERT INTO session_records (
          id, workspace_id, app_code, title, cwd, provider_id, prompt_template_id, skill_id,
          status, started_at, updated_at
        ) VALUES (
          @id, @workspaceId, @appCode, @title, @cwd, @providerId, @promptTemplateId, @skillId,
          @status, @startedAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          app_code = excluded.app_code,
          title = excluded.title,
          cwd = excluded.cwd,
          provider_id = excluded.provider_id,
          prompt_template_id = excluded.prompt_template_id,
          skill_id = excluded.skill_id,
          status = excluded.status,
          started_at = excluded.started_at,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        updatedAt
      });

    const item = this.list().find((current) => current.id === input.id);
    if (item === undefined) {
      throw new Error(`Failed to persist session record ${input.id}`);
    }
    return item;
  }

  touch(
    id: string,
    updates: Partial<
      Pick<
        SessionRecord,
        "workspaceId" | "cwd" | "providerId" | "promptTemplateId" | "skillId" | "title" | "status"
      >
    > = {}
  ): SessionRecord | null {
    const existing = this.findById(id);
    if (existing === null) {
      return null;
    }

    return this.upsert({
      id: existing.id,
      workspaceId: updates.workspaceId ?? existing.workspaceId,
      appCode: existing.appCode,
      title: updates.title ?? existing.title,
      cwd: updates.cwd ?? existing.cwd,
      providerId:
        updates.providerId === undefined ? existing.providerId : updates.providerId,
      promptTemplateId:
        updates.promptTemplateId === undefined
          ? existing.promptTemplateId
          : updates.promptTemplateId,
      skillId: updates.skillId === undefined ? existing.skillId : updates.skillId,
      status: updates.status ?? existing.status,
      startedAt: existing.startedAt
    });
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM session_records WHERE id = ?").run(id);
    return result.changes > 0;
  }

  replaceAll(items: SessionRecord[]): void {
    this.database.prepare("DELETE FROM session_records").run();
    const statement = this.database.prepare(`
      INSERT INTO session_records (
        id, workspace_id, app_code, title, cwd, provider_id, prompt_template_id, skill_id,
        status, started_at, updated_at
      ) VALUES (
        @id, @workspaceId, @appCode, @title, @cwd, @providerId, @promptTemplateId, @skillId,
        @status, @startedAt, @updatedAt
      )
    `);

    for (const item of items) {
      statement.run(item);
    }
  }
}
