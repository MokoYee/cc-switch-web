import { nowIso, type Skill, type SkillVersion } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export class SkillVersionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(skillId: string): SkillVersion[] {
    const rows = this.database
      .prepare(`
        SELECT skill_id, version_number, snapshot_json, created_at
        FROM skill_versions
        WHERE skill_id = ?
        ORDER BY version_number DESC
      `)
      .all(skillId) as Array<{
        skill_id: string;
        version_number: number;
        snapshot_json: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      skillId: row.skill_id,
      versionNumber: row.version_number,
      item: JSON.parse(row.snapshot_json) as Skill,
      createdAt: row.created_at
    }));
  }

  get(skillId: string, versionNumber: number): SkillVersion | null {
    const row = this.database
      .prepare(`
        SELECT skill_id, version_number, snapshot_json, created_at
        FROM skill_versions
        WHERE skill_id = ? AND version_number = ?
      `)
      .get(skillId, versionNumber) as
      | {
          skill_id: string;
          version_number: number;
          snapshot_json: string;
          created_at: string;
        }
      | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      skillId: row.skill_id,
      versionNumber: row.version_number,
      item: JSON.parse(row.snapshot_json) as Skill,
      createdAt: row.created_at
    };
  }

  append(item: Skill): SkillVersion {
    const nextVersion = this.nextVersionNumber(item.id);
    const createdAt = nowIso();
    this.database
      .prepare(`
        INSERT INTO skill_versions (
          skill_id, version_number, snapshot_json, created_at
        ) VALUES (?, ?, ?, ?)
      `)
      .run(item.id, nextVersion, JSON.stringify(item), createdAt);

    return {
      skillId: item.id,
      versionNumber: nextVersion,
      item,
      createdAt
    };
  }

  private nextVersionNumber(skillId: string): number {
    const row = this.database
      .prepare(`
        SELECT COALESCE(MAX(version_number), 0) AS max_version
        FROM skill_versions
        WHERE skill_id = ?
      `)
      .get(skillId) as { max_version: number };

    return row.max_version + 1;
  }
}
