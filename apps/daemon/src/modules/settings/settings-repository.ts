import { randomBytes } from "node:crypto";

import { nowIso } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

const CONTROL_TOKEN_KEY = "control_token";
const ACTIVE_WORKSPACE_KEY = "active_workspace_id";
const ACTIVE_SESSION_KEY = "active_session_id";

export interface ControlTokenRecord {
  readonly value: string;
  readonly source: "env" | "database";
}

export interface ControlTokenRuntimeView {
  readonly source: "env" | "database";
  readonly canRotate: boolean;
  readonly maskedToken: string;
  readonly updatedAt: string | null;
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
      throw new Error("CCSW_CONTROL_TOKEN is set in environment; rotate token via environment config");
    }

    const nextToken = randomBytes(24).toString("hex");
    this.setSetting(CONTROL_TOKEN_KEY, nextToken);

    return {
      value: nextToken,
      source: "database"
    };
  }

  getControlTokenRuntimeView(envOverride: string | null): ControlTokenRuntimeView {
    const token = this.getControlToken(envOverride);
    const persisted = token.source === "database" ? this.getSettingRecord(CONTROL_TOKEN_KEY) : null;

    return {
      source: token.source,
      canRotate: token.source === "database",
      maskedToken: this.maskToken(token.value),
      updatedAt: persisted?.updatedAt ?? null
    };
  }

  getActiveWorkspaceId(): string | null {
    return this.getSetting(ACTIVE_WORKSPACE_KEY);
  }

  setActiveWorkspaceId(workspaceId: string | null): void {
    this.setNullableSetting(ACTIVE_WORKSPACE_KEY, workspaceId);
  }

  getActiveSessionId(): string | null {
    return this.getSetting(ACTIVE_SESSION_KEY);
  }

  setActiveSessionId(sessionId: string | null): void {
    this.setNullableSetting(ACTIVE_SESSION_KEY, sessionId);
  }

  private getSetting(key: string): string | null {
    return this.getSettingRecord(key)?.value ?? null;
  }

  private getSettingRecord(key: string): { readonly value: string; readonly updatedAt: string } | null {
    const row = this.database
      .prepare("SELECT value, updated_at FROM system_settings WHERE key = ?")
      .get(key) as { value: string; updated_at: string } | undefined;

    return row
      ? {
          value: row.value,
          updatedAt: row.updated_at
        }
      : null;
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

  private setNullableSetting(key: string, value: string | null): void {
    if (value === null) {
      this.database.prepare("DELETE FROM system_settings WHERE key = ?").run(key);
      return;
    }

    this.setSetting(key, value);
  }

  private maskToken(value: string): string {
    if (value.length <= 12) {
      return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }

    return `${value.slice(0, 6)}...${value.slice(-6)}`;
  }
}
