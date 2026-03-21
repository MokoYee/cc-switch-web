import { nowIso, type Provider, type ProviderUpsert } from "@ai-cli-switch/shared";

import type { SqliteDatabase } from "../../db/database.js";

export interface RuntimeProvider extends Provider {
  readonly apiKeyPlaintext: string;
}

const maskSecret = (secret: string): string => {
  const trimmed = secret.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****`;
  }

  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
};

export class ProviderRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): Provider[] {
    const rows = this.database
      .prepare(`
        SELECT id, name, provider_type, base_url, api_key_masked, enabled, timeout_ms, created_at, updated_at
        FROM providers
        ORDER BY created_at ASC
      `)
      .all() as Array<{
        id: string;
        name: string;
        provider_type: Provider["providerType"];
        base_url: string;
        api_key_masked: string;
        enabled: number;
        timeout_ms: number;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => this.toPublicProvider(row));
  }

  listRuntime(): RuntimeProvider[] {
    const rows = this.database
      .prepare(`
        SELECT id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms, created_at, updated_at
        FROM providers
        ORDER BY created_at ASC
      `)
      .all() as Array<{
        id: string;
        name: string;
        provider_type: Provider["providerType"];
        base_url: string;
        api_key_masked: string;
        api_key_plaintext: string;
        enabled: number;
        timeout_ms: number;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      ...this.toPublicProvider(row),
      apiKeyPlaintext: row.api_key_plaintext
    }));
  }

  exists(id: string): boolean {
    const row = this.database
      .prepare("SELECT 1 AS present FROM providers WHERE id = ?")
      .get(id) as { present: number } | undefined;

    return row !== undefined;
  }

  upsert(input: ProviderUpsert): Provider {
    const existing = this.database
      .prepare("SELECT created_at, api_key_masked, api_key_plaintext FROM providers WHERE id = ?")
      .get(input.id) as
      | {
          created_at: string;
          api_key_masked: string;
          api_key_plaintext: string;
        }
      | undefined;

    const timestamp = nowIso();
    const nextApiKeyPlaintext = input.apiKey?.trim() || existing?.api_key_plaintext || "";
    const nextApiKeyMasked =
      nextApiKeyPlaintext.length > 0
        ? maskSecret(nextApiKeyPlaintext)
        : input.apiKeyMasked?.trim() || existing?.api_key_masked || "";

    this.database
      .prepare(`
        INSERT INTO providers (
          id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms, created_at, updated_at
        ) VALUES (
          @id, @name, @providerType, @baseUrl, @apiKeyMasked, @apiKeyPlaintext, @enabled, @timeoutMs, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          provider_type = excluded.provider_type,
          base_url = excluded.base_url,
          api_key_masked = excluded.api_key_masked,
          api_key_plaintext = excluded.api_key_plaintext,
          enabled = excluded.enabled,
          timeout_ms = excluded.timeout_ms,
          updated_at = excluded.updated_at
      `)
      .run({
        ...input,
        apiKeyMasked: nextApiKeyMasked,
        apiKeyPlaintext: nextApiKeyPlaintext,
        enabled: input.enabled ? 1 : 0,
        createdAt: existing?.created_at ?? timestamp,
        updatedAt: timestamp
      });

    const provider = this.list().find((item) => item.id === input.id);
    if (provider === undefined) {
      throw new Error(`Failed to persist provider ${input.id}`);
    }

    return provider;
  }

  delete(id: string): boolean {
    const result = this.database
      .prepare("DELETE FROM providers WHERE id = ?")
      .run(id);

    return result.changes > 0;
  }

  replaceAll(items: Provider[]): void {
    this.database.prepare("DELETE FROM providers").run();

    const insertProvider = this.database.prepare(`
      INSERT INTO providers (
        id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms, created_at, updated_at
      ) VALUES (
        @id, @name, @providerType, @baseUrl, @apiKeyMasked, @apiKeyPlaintext, @enabled, @timeoutMs, @createdAt, @updatedAt
      )
    `);

    for (const item of items) {
      insertProvider.run({
        ...item,
        apiKeyPlaintext: "",
        enabled: item.enabled ? 1 : 0
      });
    }
  }

  private toPublicProvider(row: {
    id: string;
    name: string;
    provider_type: Provider["providerType"];
    base_url: string;
    api_key_masked: string;
    enabled: number;
    timeout_ms: number;
    created_at: string;
    updated_at: string;
  }): Provider {
    return {
      id: row.id,
      name: row.name,
      providerType: row.provider_type,
      baseUrl: row.base_url,
      apiKeyMasked: row.api_key_masked,
      enabled: row.enabled === 1,
      timeoutMs: row.timeout_ms,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
