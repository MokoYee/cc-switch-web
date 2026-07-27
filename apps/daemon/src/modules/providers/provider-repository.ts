import {
  nowIso,
  providerModelMappingSchema,
  providerResponsesApiModeSchema,
  type ExportProvider,
  type Provider,
  type ProviderUpsert
} from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export interface RuntimeProvider extends Provider {
  readonly apiKeyPlaintext: string;
}

interface ProviderRow {
  id: string;
  name: string;
  provider_type: Provider["providerType"];
  base_url: string;
  api_key_masked: string;
  enabled: number;
  timeout_ms: number;
  default_model: string | null;
  model_mapping_json: string;
  responses_api_mode: string;
  created_at: string;
  updated_at: string;
}

interface ProviderRuntimeRow extends ProviderRow {
  api_key_plaintext: string;
}

const PUBLIC_COLUMNS =
  "id, name, provider_type, base_url, api_key_masked, enabled, timeout_ms, default_model, model_mapping_json, responses_api_mode, created_at, updated_at";

const RUNTIME_COLUMNS =
  "id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms, default_model, model_mapping_json, responses_api_mode, created_at, updated_at";

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

const parseModelMapping = (rawValue: string | null | undefined): Provider["modelMapping"] => {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return {};
  }

  try {
    return providerModelMappingSchema.parse(JSON.parse(rawValue));
  } catch {
    return {};
  }
};

const parseResponsesApiMode = (
  rawValue: string | null | undefined
): Provider["responsesApiMode"] => {
  const parsed = providerResponsesApiModeSchema.safeParse(rawValue);
  return parsed.success ? parsed.data : "auto";
};

const normalizeDefaultModel = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const serializeModelMapping = (mapping: Provider["modelMapping"] | undefined): string =>
  JSON.stringify(mapping ?? {});

export class ProviderRepository {
  constructor(private readonly database: SqliteDatabase) {}

  list(): Provider[] {
    const rows = this.database
      .prepare(`
        SELECT ${PUBLIC_COLUMNS}
        FROM providers
        ORDER BY created_at ASC
      `)
      .all() as ProviderRow[];

    return rows.map((row) => this.toPublicProvider(row));
  }

  listExportable(includeSecrets = false): ExportProvider[] {
    if (!includeSecrets) {
      return this.list();
    }

    return this.listRuntime().map(({ apiKeyPlaintext, ...provider }) => ({
      ...provider,
      ...(apiKeyPlaintext.trim().length > 0 ? { apiKey: apiKeyPlaintext } : {})
    }));
  }

  listRuntime(): RuntimeProvider[] {
    const rows = this.database
      .prepare(`
        SELECT ${RUNTIME_COLUMNS}
        FROM providers
        ORDER BY created_at ASC
      `)
      .all() as ProviderRuntimeRow[];

    return rows.map((row) => ({
      ...this.toPublicProvider(row),
      apiKeyPlaintext: row.api_key_plaintext
    }));
  }

  getRuntime(id: string): RuntimeProvider | null {
    const row = this.database
      .prepare(`
        SELECT ${RUNTIME_COLUMNS}
        FROM providers
        WHERE id = ?
      `)
      .get(id) as ProviderRuntimeRow | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      ...this.toPublicProvider(row),
      apiKeyPlaintext: row.api_key_plaintext
    };
  }

  exists(id: string): boolean {
    const row = this.database
      .prepare("SELECT 1 AS present FROM providers WHERE id = ?")
      .get(id) as { present: number } | undefined;

    return row !== undefined;
  }

  upsert(input: ProviderUpsert): Provider {
    const existing = this.database
      .prepare(`
        SELECT created_at, api_key_masked, api_key_plaintext, default_model, model_mapping_json, responses_api_mode
        FROM providers
        WHERE id = ?
      `)
      .get(input.id) as
      | {
          created_at: string;
          api_key_masked: string;
          api_key_plaintext: string;
          default_model: string | null;
          model_mapping_json: string;
          responses_api_mode: string;
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
          id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms,
          default_model, model_mapping_json, responses_api_mode, created_at, updated_at
        ) VALUES (
          @id, @name, @providerType, @baseUrl, @apiKeyMasked, @apiKeyPlaintext, @enabled, @timeoutMs,
          @defaultModel, @modelMappingJson, @responsesApiMode, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          provider_type = excluded.provider_type,
          base_url = excluded.base_url,
          api_key_masked = excluded.api_key_masked,
          api_key_plaintext = excluded.api_key_plaintext,
          enabled = excluded.enabled,
          timeout_ms = excluded.timeout_ms,
          default_model = excluded.default_model,
          model_mapping_json = excluded.model_mapping_json,
          responses_api_mode = excluded.responses_api_mode,
          updated_at = excluded.updated_at
      `)
      .run({
        id: input.id,
        name: input.name,
        providerType: input.providerType,
        baseUrl: input.baseUrl,
        apiKeyMasked: nextApiKeyMasked,
        apiKeyPlaintext: nextApiKeyPlaintext,
        enabled: input.enabled ? 1 : 0,
        timeoutMs: input.timeoutMs,
        // Callers that omit the model-routing fields (e.g. quick onboarding
        // drafts) must not wipe values configured elsewhere.
        defaultModel:
          input.defaultModel === undefined
            ? normalizeDefaultModel(existing?.default_model)
            : normalizeDefaultModel(input.defaultModel),
        modelMappingJson:
          input.modelMapping === undefined
            ? existing?.model_mapping_json ?? "{}"
            : serializeModelMapping(input.modelMapping),
        responsesApiMode:
          input.responsesApiMode ??
          parseResponsesApiMode(existing?.responses_api_mode),
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
        id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms,
        default_model, model_mapping_json, responses_api_mode, created_at, updated_at
      ) VALUES (
        @id, @name, @providerType, @baseUrl, @apiKeyMasked, @apiKeyPlaintext, @enabled, @timeoutMs,
        @defaultModel, @modelMappingJson, @responsesApiMode, @createdAt, @updatedAt
      )
    `);

    for (const item of items) {
      insertProvider.run({
        id: item.id,
        name: item.name,
        providerType: item.providerType,
        baseUrl: item.baseUrl,
        apiKeyMasked: item.apiKeyMasked,
        apiKeyPlaintext: "",
        enabled: item.enabled ? 1 : 0,
        timeoutMs: item.timeoutMs,
        defaultModel: normalizeDefaultModel(item.defaultModel),
        modelMappingJson: serializeModelMapping(item.modelMapping),
        responsesApiMode: item.responsesApiMode ?? "auto",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      });
    }
  }

  replaceAllImported(items: ExportProvider[]): void {
    const existingSecrets = new Map(
      this.listRuntime().map((item) => [item.id, item.apiKeyPlaintext])
    );

    this.database.prepare("DELETE FROM providers").run();

    const insertProvider = this.database.prepare(`
      INSERT INTO providers (
        id, name, provider_type, base_url, api_key_masked, api_key_plaintext, enabled, timeout_ms,
        default_model, model_mapping_json, responses_api_mode, created_at, updated_at
      ) VALUES (
        @id, @name, @providerType, @baseUrl, @apiKeyMasked, @apiKeyPlaintext, @enabled, @timeoutMs,
        @defaultModel, @modelMappingJson, @responsesApiMode, @createdAt, @updatedAt
      )
    `);

    for (const item of items) {
      const importedApiKey = item.apiKey?.trim() ?? "";
      const preservedApiKey = existingSecrets.get(item.id)?.trim() ?? "";
      const nextApiKeyPlaintext = importedApiKey || preservedApiKey;
      const nextApiKeyMasked =
        nextApiKeyPlaintext.length > 0 ? maskSecret(nextApiKeyPlaintext) : item.apiKeyMasked;

      insertProvider.run({
        id: item.id,
        name: item.name,
        providerType: item.providerType,
        baseUrl: item.baseUrl,
        apiKeyMasked: nextApiKeyMasked,
        apiKeyPlaintext: nextApiKeyPlaintext,
        enabled: item.enabled ? 1 : 0,
        timeoutMs: item.timeoutMs,
        defaultModel: normalizeDefaultModel(item.defaultModel),
        modelMappingJson: serializeModelMapping(item.modelMapping),
        responsesApiMode: item.responsesApiMode ?? "auto",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      });
    }
  }

  private toPublicProvider(row: ProviderRow): Provider {
    return {
      id: row.id,
      name: row.name,
      providerType: row.provider_type,
      baseUrl: row.base_url,
      apiKeyMasked: row.api_key_masked,
      enabled: row.enabled === 1,
      timeoutMs: row.timeout_ms,
      defaultModel: normalizeDefaultModel(row.default_model),
      modelMapping: parseModelMapping(row.model_mapping_json),
      responsesApiMode: parseResponsesApiMode(row.responses_api_mode),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
