import Database from "better-sqlite3";

import { defaultProxyPolicy, nowIso } from "@cc-switch-web/shared";

export type SqliteDatabase = Database.Database;

export const openDatabase = (dbPath: string): SqliteDatabase => {
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  initializeSchema(database);
  seedInitialData(database);

  return database;
};

const initializeSchema = (database: SqliteDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key_masked TEXT NOT NULL,
      api_key_plaintext TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL,
      timeout_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_bindings (
      id TEXT PRIMARY KEY,
      app_code TEXT NOT NULL UNIQUE,
      provider_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      prompt_template_id TEXT,
      skill_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS app_quotas (
      id TEXT PRIMARY KEY,
      app_code TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL,
      period TEXT NOT NULL,
      max_requests INTEGER,
      max_tokens INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proxy_policies (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      listen_host TEXT NOT NULL,
      listen_port INTEGER NOT NULL,
      enabled INTEGER NOT NULL,
      request_timeout_ms INTEGER NOT NULL,
      failure_threshold INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS failover_chains (
      id TEXT PRIMARY KEY,
      app_code TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL,
      provider_ids_json TEXT NOT NULL,
      cooldown_seconds INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      args_json TEXT NOT NULL,
      url TEXT,
      env_json TEXT NOT NULL,
      headers_json TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_mcp_bindings (
      id TEXT PRIMARY KEY,
      app_code TEXT NOT NULL,
      server_id TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(app_code, server_id),
      FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      app_code TEXT,
      locale TEXT NOT NULL,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_template_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_template_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(prompt_template_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      app_code TEXT,
      prompt_template_id TEXT,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(skill_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      app_code TEXT,
      default_provider_id TEXT,
      default_prompt_template_id TEXT,
      default_skill_id TEXT,
      tags_json TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_records (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      app_code TEXT NOT NULL,
      title TEXT NOT NULL,
      cwd TEXT NOT NULL,
      provider_id TEXT,
      prompt_template_id TEXT,
      skill_id TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config_snapshots (
      version INTEGER PRIMARY KEY AUTOINCREMENT,
      reason TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proxy_request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_code TEXT NOT NULL,
      provider_id TEXT,
      workspace_id TEXT,
      session_id TEXT,
      context_source TEXT,
      prompt_template_id TEXT,
      skill_id TEXT,
      target_url TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER,
      latency_ms INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      decision_reason TEXT,
      next_provider_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_log_id INTEGER,
      app_code TEXT NOT NULL,
      provider_id TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (request_log_id) REFERENCES proxy_request_logs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS host_integration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'proxy-config',
      app_code TEXT NOT NULL,
      action TEXT NOT NULL,
      config_path TEXT NOT NULL,
      backup_path TEXT,
      integration_state TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_health_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      status_code INTEGER,
      probe_url TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_code TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quota_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_code TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      requests_used INTEGER NOT NULL,
      tokens_used INTEGER NOT NULL,
      window_started_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_service_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn(database, "providers", "api_key_plaintext", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "app_bindings", "prompt_template_id", "TEXT");
  ensureColumn(database, "app_bindings", "skill_id", "TEXT");
  ensureColumn(database, "proxy_request_logs", "workspace_id", "TEXT");
  ensureColumn(database, "proxy_request_logs", "session_id", "TEXT");
  ensureColumn(database, "proxy_request_logs", "context_source", "TEXT");
  ensureColumn(database, "proxy_request_logs", "prompt_template_id", "TEXT");
  ensureColumn(database, "proxy_request_logs", "skill_id", "TEXT");
  ensureColumn(database, "proxy_request_logs", "decision_reason", "TEXT");
  ensureColumn(database, "proxy_request_logs", "next_provider_id", "TEXT");
  ensureColumn(database, "host_integration_events", "kind", "TEXT NOT NULL DEFAULT 'proxy-config'");
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_records_app_code ON usage_records(app_code);
    CREATE INDEX IF NOT EXISTS idx_usage_records_provider_id ON usage_records(provider_id);
    CREATE INDEX IF NOT EXISTS idx_usage_records_model ON usage_records(model);
    CREATE INDEX IF NOT EXISTS idx_proxy_request_logs_workspace_id ON proxy_request_logs(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_proxy_request_logs_session_id ON proxy_request_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_proxy_request_logs_provider_id ON proxy_request_logs(provider_id);
  `);
};

const ensureColumn = (
  database: SqliteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string
): void => {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
};

const seedInitialData = (database: SqliteDatabase): void => {
  const proxyRowCount = database
    .prepare("SELECT COUNT(*) AS count FROM proxy_policies")
    .get() as { count: number };

  if (proxyRowCount.count === 0) {
    database
      .prepare(`
        INSERT INTO proxy_policies (
          singleton_id, listen_host, listen_port, enabled, request_timeout_ms, failure_threshold, updated_at
        ) VALUES (
          1, @listenHost, @listenPort, @enabled, @requestTimeoutMs, @failureThreshold, @updatedAt
        )
      `)
      .run({
        ...defaultProxyPolicy,
        enabled: defaultProxyPolicy.enabled ? 1 : 0,
        updatedAt: nowIso()
      });
  }
};
