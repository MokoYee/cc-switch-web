import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { AppQuotaRepository } from "./app-quota-repository.js";
import { AppQuotaService } from "./app-quota-service.js";

test("allows request when quota is not configured", () => {
  const database = openDatabase(":memory:");
  const service = new AppQuotaService(database, new AppQuotaRepository(database));

  const decision = service.evaluate("codex", new Date("2026-03-21T10:00:00.000Z"));
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, null);
});

test("rejects request when daily request quota is exceeded", () => {
  const database = openDatabase(":memory:");
  const repository = new AppQuotaRepository(database);
  repository.upsert({
    id: "quota-codex",
    appCode: "codex",
    enabled: true,
    period: "day",
    maxRequests: 2,
    maxTokens: null
  });

  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 10, 5, 15, "2026-03-21T01:00:00.000Z");
  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 10, 5, 15, "2026-03-21T02:00:00.000Z");

  const service = new AppQuotaService(database, repository);
  const decision = service.evaluate("codex", new Date("2026-03-21T10:00:00.000Z"));

  assert.equal(decision.allowed, false);
  assert.match(decision.reason ?? "", /Request quota exceeded/);
});

test("rejects request when daily token quota is exhausted", () => {
  const database = openDatabase(":memory:");
  const repository = new AppQuotaRepository(database);
  repository.upsert({
    id: "quota-codex",
    appCode: "codex",
    enabled: true,
    period: "day",
    maxRequests: null,
    maxTokens: 30
  });

  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 20, 10, 30, "2026-03-21T01:00:00.000Z");

  const service = new AppQuotaService(database, repository);
  const decision = service.evaluate("codex", new Date("2026-03-21T10:00:00.000Z"));

  assert.equal(decision.allowed, false);
  assert.match(decision.reason ?? "", /Token quota exceeded/);
});

test("reports warning status when quota usage is near limit", () => {
  const database = openDatabase(":memory:");
  const repository = new AppQuotaRepository(database);
  repository.upsert({
    id: "quota-codex",
    appCode: "codex",
    enabled: true,
    period: "day",
    maxRequests: 10,
    maxTokens: 1000
  });

  for (let index = 0; index < 8; index += 1) {
    database
      .prepare(`
        INSERT INTO usage_records (
          request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(null, "codex", "provider-a", "gpt-4.1", 40, 20, 60, `2026-03-21T0${index}:00:00.000Z`);
  }

  const service = new AppQuotaService(database, repository);
  const status = service.getStatus("codex", new Date("2026-03-21T10:00:00.000Z"));

  assert.equal(status.currentState, "warning");
  assert.equal(status.requestsUsed, 8);
  assert.equal(status.requestsRemaining, 2);
  assert.equal(status.tokensRemaining, 520);
  assert.equal(status.requestUtilization, 0.8);
});
