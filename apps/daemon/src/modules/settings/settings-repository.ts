import { randomBytes } from "node:crypto";

import { nowIso } from "@ai-cli-switch/shared";

import type { SqliteDatabase } from "../../db/database.js";

const CONTROL_TOKEN_KEY = "control_token";

export interface ControlTokenRecord {
  readonly value: string;
  readonly source: "env" | "database";
}

export class SettingsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  getControlToken(envOverride: string | null): ControlTokenRecord {
    if (envOverride !== null && envOverride.length > 0) {
      return {
        value: envOverride,
        source: "env"
      };
    }

    const existing = this.getSetting(CONTROL_TOKEN_KEY);
    if (existing !== null) {
      return {
        value: existing,
        source: "database"
      };
    }

    const generated = randomBytes(24).toString("hex");
    this.setSetting(CONTROL_TOKEN_KEY, generated);

    return {
      value: generated,
      source: "database"
    };
  }

  rotateControlToken(envOverride: string | null): ControlTokenRecord {
    if (envOverride !== null && envOverride.length > 0) {
      throw new Error("AICLI_SWITCH_CONTROL_TOKEN is set in environment; rotate token via environment config");
    }

    const nextToken = randomBytes(24).toString("hex");
    this.setSetting(CONTROL_TOKEN_KEY, nextToken);

    return {
      value: nextToken,
      source: "database"
    };
  }

  private getSetting(key: string): string | null {
    const row = this.database
      .prepare("SELECT value FROM system_settings WHERE key = ?")
      .get(key) as { value: string } | undefined;

    return row?.value ?? null;
  }

  private setSetting(key: string, value: string): void {
    this.database
      .prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(key, value, nowIso());
  }
}
