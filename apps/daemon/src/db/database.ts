import Database from "better-sqlite3";

import { demoBindings, demoFailoverChains, demoProviders, demoProxyPolicy, nowIso } from "@ai-cli-switch/shared";

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
      updated_at TEXT NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT
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
      target_url TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER,
      latency_ms INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn(database, "providers", "api_key_plaintext", "TEXT NOT NULL DEFAULT ''");
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
  const providerCount = database
    .prepare("SELECT COUNT(*) AS count FROM providers")
    .get() as { count: number };

  if (providerCount.count === 0) {
    const insertProvider = database.prepare(`
      INSERT INTO providers (
        id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms, created_at, updated_at
      ) VALUES (
        @id, @name, @providerType, @baseUrl, @apiKeyMasked, @apiKeyPlaintext, @enabled, @timeoutMs, @createdAt, @updatedAt
      )
    `);

    for (const provider of demoProviders) {
      insertProvider.run({
        ...provider,
        apiKeyPlaintext: "",
        enabled: provider.enabled ? 1 : 0
      });
    }
  }

  const bindingCount = database
    .prepare("SELECT COUNT(*) AS count FROM app_bindings")
    .get() as { count: number };

  if (bindingCount.count === 0) {
    const insertBinding = database.prepare(`
      INSERT INTO app_bindings (id, app_code, provider_id, mode, updated_at)
      VALUES (@id, @appCode, @providerId, @mode, @updatedAt)
    `);

    for (const binding of demoBindings) {
      insertBinding.run(binding);
    }
  }

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
        ...demoProxyPolicy,
        enabled: demoProxyPolicy.enabled ? 1 : 0,
        updatedAt: nowIso()
      });
  }

  const failoverChainCount = database
    .prepare("SELECT COUNT(*) AS count FROM failover_chains")
    .get() as { count: number };

  if (failoverChainCount.count === 0) {
    const statement = database.prepare(`
      INSERT INTO failover_chains (
        id, app_code, enabled, provider_ids_json, cooldown_seconds, max_attempts, updated_at
      ) VALUES (
        @id, @appCode, @enabled, @providerIdsJson, @cooldownSeconds, @maxAttempts, @updatedAt
      )
    `);

    for (const chain of demoFailoverChains) {
      statement.run({
        ...chain,
        enabled: chain.enabled ? 1 : 0,
        providerIdsJson: JSON.stringify(chain.providerIds)
      });
    }
  }
};
