import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyRuntimeService } from "./proxy-runtime-service.js";

test("lists proxy request logs with filters and pagination", () => {
  const database = openDatabase(":memory:");
  const service = new ProxyRuntimeService(
    database,
    new ProviderRepository(database),
    new BindingRepository(database),
    new FailoverChainRepository(database),
    () => ({
      runtimeState: "stopped",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: false,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.appendRequestLog({
    appCode: "codex",
    providerId: "provider-a",
    targetUrl: "http://provider-a.test/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 200,
    latencyMs: 120,
    outcome: "success",
    errorMessage: null
  });
  service.appendRequestLog({
    appCode: "codex",
    providerId: "provider-b",
    targetUrl: "http://provider-b.test/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 503,
    latencyMs: 380,
    outcome: "failover",
    errorMessage: "Upstream returned 503; trying next provider"
  });
  service.appendRequestLog({
    appCode: "claude-code",
    providerId: "provider-c",
    targetUrl: "http://provider-c.test/v1/messages",
    method: "POST",
    path: "/v1/messages",
    statusCode: 401,
    latencyMs: 95,
    outcome: "error",
    errorMessage: "Upstream returned 401"
  });

  const filtered = service.listRequestLogs({
    appCode: "codex",
    method: "post",
    limit: 10,
    offset: 0
  });
  assert.equal(filtered.total, 2);
  assert.equal(filtered.items.length, 2);
  assert.equal(filtered.items[0]?.providerId, "provider-b");
  assert.equal(filtered.items[1]?.providerId, "provider-a");

  const paged = service.listRequestLogs({
    limit: 1,
    offset: 1
  });
  assert.equal(paged.total, 3);
  assert.equal(paged.items.length, 1);
  assert.equal(paged.items[0]?.providerId, "provider-b");

  const outcomeFiltered = service.listRequestLogs({
    outcome: "failover",
    limit: 10,
    offset: 0
  });
  assert.equal(outcomeFiltered.total, 1);
  assert.equal(outcomeFiltered.items[0]?.providerId, "provider-b");

  database.close();
});

test("stores usage records and summarizes them by app/provider/model", () => {
  const database = openDatabase(":memory:");
  const service = new ProxyRuntimeService(
    database,
    new ProviderRepository(database),
    new BindingRepository(database),
    new FailoverChainRepository(database),
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.appendUsageRecord({
    requestLogId: null,
    appCode: "codex",
    providerId: "provider-a",
    model: "gpt-4.1",
    inputTokens: 120,
    outputTokens: 80
  });
  service.appendUsageRecord({
    requestLogId: null,
    appCode: "codex",
    providerId: "provider-a",
    model: "gpt-4.1",
    inputTokens: 20,
    outputTokens: 10
  });
  service.appendUsageRecord({
    requestLogId: null,
    appCode: "claude-code",
    providerId: "provider-b",
    model: "claude-sonnet-4-5",
    inputTokens: 200,
    outputTokens: 50
  });

  const records = service.listUsageRecords({
    appCode: "codex",
    limit: 10,
    offset: 0
  });
  assert.equal(records.total, 2);
  assert.equal(records.items[0]?.totalTokens, 30);
  assert.equal(records.items[1]?.totalTokens, 200);

  const summary = service.summarizeUsage();
  assert.equal(summary.totalRequests, 3);
  assert.equal(summary.totalInputTokens, 340);
  assert.equal(summary.totalOutputTokens, 140);
  assert.equal(summary.totalTokens, 480);
  assert.deepEqual(summary.byApp[0], {
    appCode: "claude-code",
    requestCount: 1,
    totalTokens: 250
  });
  assert.deepEqual(summary.byProvider[1], {
    providerId: "provider-a",
    requestCount: 2,
    totalTokens: 230
  });
  assert.deepEqual(summary.byModel[0], {
    model: "claude-sonnet-4-5",
    requestCount: 1,
    totalTokens: 250
  });

  database.close();
});

test("prioritizes active-context provider override ahead of binding and failover candidates", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-binding",
    name: "Binding Provider",
    providerType: "openai-compatible",
    baseUrl: "https://binding.example.com/v1",
    apiKey: "binding-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-failover",
    name: "Failover Provider",
    providerType: "openai-compatible",
    baseUrl: "https://failover.example.com/v1",
    apiKey: "failover-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-workspace",
    name: "Workspace Provider",
    providerType: "openai-compatible",
    baseUrl: "https://workspace.example.com/v1",
    apiKey: "workspace-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-binding",
    mode: "managed"
  });
  failoverChainRepository.upsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-failover"],
    cooldownSeconds: 30,
    maxAttempts: 2
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);
  const plan = service.createExecutionPlan("codex", "provider-workspace");

  assert.ok(plan !== null);
  assert.deepEqual(
    plan?.candidates.map((item) => item.providerId),
    ["provider-workspace", "provider-binding"]
  );
  assert.deepEqual(
    plan?.candidateDecisions.map((item) => ({
      providerId: item.providerId,
      reason: item.reason,
      selected: item.selected
    })),
    [
      {
        providerId: "provider-workspace",
        reason: "ready",
        selected: true
      },
      {
        providerId: "provider-binding",
        reason: "ready",
        selected: true
      },
      {
        providerId: "provider-failover",
        reason: "ready",
        selected: false
      }
    ]
  );

  database.close();
});

test("skips disabled and credential-missing providers when building execution plans and recovery probes", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-primary",
    name: "Primary Provider",
    providerType: "openai-compatible",
    baseUrl: "https://primary.example.com/v1",
    apiKey: "primary-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-disabled",
    name: "Disabled Provider",
    providerType: "openai-compatible",
    baseUrl: "https://disabled.example.com/v1",
    apiKey: "disabled-secret",
    enabled: false,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-missing-credential",
    name: "Missing Credential Provider",
    providerType: "openai-compatible",
    baseUrl: "https://missing-credential.example.com/v1",
    apiKey: "",
    enabled: true,
    timeoutMs: 30_000
  });

  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-primary",
    mode: "managed"
  });
  failoverChainRepository.upsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-disabled", "provider-missing-credential"],
    cooldownSeconds: 30,
    maxAttempts: 3
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);
  service.isolateProvider("provider-primary", "manual isolate", 5);
  service.isolateProvider("provider-disabled", "manual isolate", 5);
  service.isolateProvider("provider-missing-credential", "manual isolate", 5);

  const plan = service.createExecutionPlan("codex");
  assert.ok(plan !== null);
  assert.deepEqual(plan?.candidates.map((item) => item.providerId), []);
  assert.deepEqual(plan?.openedCircuits, ["provider-primary"]);
  assert.deepEqual(
    plan?.candidateDecisions.map((item) => ({
      providerId: item.providerId,
      reason: item.reason,
      decision: item.decision,
      selected: item.selected
    })),
    [
      {
        providerId: "provider-primary",
        reason: "circuit-open",
        decision: "excluded",
        selected: false
      },
      {
        providerId: "provider-disabled",
        reason: "unexecutable-disabled",
        decision: "excluded",
        selected: false
      },
      {
        providerId: "provider-missing-credential",
        reason: "unexecutable-missing-credential",
        decision: "excluded",
        selected: false
      }
    ]
  );

  service.resetProviderCircuit("provider-primary", "reset after execution-plan assertion");
  service.resetProviderCircuit("provider-disabled", "reset after execution-plan assertion");
  service.resetProviderCircuit(
    "provider-missing-credential",
    "reset after execution-plan assertion"
  );
  service.recordFailure("provider-primary", 0, 1, "probe candidate");
  service.recordFailure("provider-disabled", 0, 1, "probe candidate");
  service.recordFailure("provider-missing-credential", 0, 1, "probe candidate");

  const probeTargets = service.listRecoveryProbeTargets();
  assert.deepEqual(
    probeTargets.map((item) => item.providerId),
    ["provider-primary"]
  );

  database.close();
});

test("demotes closed candidates with recent unhealthy signals behind clean failover targets", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-primary",
    name: "Primary Provider",
    providerType: "openai-compatible",
    baseUrl: "https://primary.example.com/v1",
    apiKey: "primary-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-failover",
    name: "Failover Provider",
    providerType: "openai-compatible",
    baseUrl: "https://failover.example.com/v1",
    apiKey: "failover-secret",
    enabled: true,
    timeoutMs: 30_000
  });

  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-primary",
    mode: "managed"
  });
  failoverChainRepository.upsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-failover"],
    cooldownSeconds: 30,
    maxAttempts: 2
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);
  service.recordFailure("provider-primary", 30, 3, "recent upstream failure");

  const degradedPlan = service.createExecutionPlan("codex");
  assert.ok(degradedPlan !== null);
  assert.deepEqual(
    degradedPlan?.candidates.map((item) => item.providerId),
    ["provider-failover", "provider-primary"]
  );
  assert.deepEqual(
    degradedPlan?.candidateDecisions.map((item) => ({
      providerId: item.providerId,
      reason: item.reason,
      decision: item.decision,
      selected: item.selected
    })),
    [
      {
        providerId: "provider-primary",
        reason: "recent-unhealthy-demoted",
        decision: "degraded",
        selected: true
      },
      {
        providerId: "provider-failover",
        reason: "ready",
        decision: "selected",
        selected: true
      }
    ]
  );

  service.recordSuccess("provider-primary");

  const recoveredPlan = service.createExecutionPlan("codex");
  assert.ok(recoveredPlan !== null);
  assert.deepEqual(
    recoveredPlan?.candidates.map((item) => item.providerId),
    ["provider-primary", "provider-failover"]
  );
  assert.deepEqual(
    recoveredPlan?.candidateDecisions.map((item) => ({
      providerId: item.providerId,
      reason: item.reason,
      decision: item.decision,
      selected: item.selected
    })),
    [
      {
        providerId: "provider-primary",
        reason: "ready",
        decision: "selected",
        selected: true
      },
      {
        providerId: "provider-failover",
        reason: "ready",
        decision: "selected",
        selected: true
      }
    ]
  );

  database.close();
});

test("filters usage records by time window", () => {
  const database = openDatabase(":memory:");
  const service = new ProxyRuntimeService(
    database,
    new ProviderRepository(database),
    new BindingRepository(database),
    new FailoverChainRepository(database),
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 100, 50, 150, "2026-03-20T10:00:00.000Z");
  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 20, 10, 30, "2026-03-21T10:00:00.000Z");

  const filtered = service.listUsageRecords({
    startAt: "2026-03-21T00:00:00.000Z",
    endAt: "2026-03-21T23:59:59.999Z",
    limit: 10,
    offset: 0
  });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0]?.totalTokens, 30);

  const summary = service.summarizeUsage({
    startAt: "2026-03-21T00:00:00.000Z",
    endAt: "2026-03-21T23:59:59.999Z"
  });
  assert.equal(summary.totalRequests, 1);
  assert.equal(summary.totalTokens, 30);

  database.close();
});

test("summarizes usage timeseries by hour and day buckets", () => {
  const database = openDatabase(":memory:");
  const service = new ProxyRuntimeService(
    database,
    new ProviderRepository(database),
    new BindingRepository(database),
    new FailoverChainRepository(database),
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 10, 5, 15, "2026-03-21T09:10:00.000Z");
  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 6, 4, 10, "2026-03-21T09:45:00.000Z");
  database
    .prepare(`
      INSERT INTO usage_records (
        request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(null, "codex", "provider-a", "gpt-4.1", 20, 8, 28, "2026-03-22T10:00:00.000Z");

  const hourly = service.summarizeUsageTimeseries({
    bucket: "hour"
  });
  assert.equal(hourly.points.length, 2);
  assert.deepEqual(hourly.points[0], {
    bucketStart: "2026-03-21T09:00:00.000Z",
    requestCount: 2,
    totalTokens: 25,
    inputTokens: 16,
    outputTokens: 9
  });

  const daily = service.summarizeUsageTimeseries({
    bucket: "day"
  });
  assert.equal(daily.points.length, 2);
  assert.deepEqual(daily.points[1], {
    bucketStart: "2026-03-22T00:00:00.000Z",
    requestCount: 1,
    totalTokens: 28,
    inputTokens: 20,
    outputTokens: 8
  });

  database.close();
});

test("aggregates provider diagnostics from runtime health and request logs", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-b",
    name: "Provider B",
    providerType: "anthropic",
    baseUrl: "https://provider-b.example.com/v1",
    apiKey: "provider-b-secret",
    enabled: false,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });
  failoverChainRepository.upsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-a"],
    cooldownSeconds: 30,
    maxAttempts: 2
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);
  service.appendRequestLog({
    appCode: "codex",
    providerId: "provider-a",
    targetUrl: "https://provider-a.example.com/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 503,
    latencyMs: 400,
    outcome: "error",
    errorMessage: "upstream 503"
  });
  service.appendRequestLog({
    appCode: "codex",
    providerId: "provider-a",
    targetUrl: "https://provider-a.example.com/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 200,
    latencyMs: 120,
    outcome: "success",
    errorMessage: null
  });
  service.recordFailure("provider-a", 30, 1, "probe failed");

  const diagnostics = service.listProviderDiagnostics();
  assert.equal(diagnostics.length, 2);

  const providerA = diagnostics.find((item) => item.providerId === "provider-a");
  assert.ok(providerA);
  assert.equal(providerA.diagnosisStatus, "down");
  assert.equal(providerA.requestCount, 2);
  assert.equal(providerA.successCount, 1);
  assert.equal(providerA.errorCount, 1);
  assert.equal(providerA.bindingAppCodes[0], "codex");
  assert.equal(providerA.failoverAppCodes[0], "codex");
  assert.equal(providerA.recoveryProbeUrl, "https://provider-a.example.com/v1/models");
  assert.deepEqual(providerA.recentErrorMessages, ["upstream 503"]);

  const providerB = diagnostics.find((item) => item.providerId === "provider-b");
  assert.ok(providerB);
  assert.equal(providerB.diagnosisStatus, "disabled");
  assert.equal(providerB.requestCount, 0);

  database.close();
});

test("supports manual isolate and circuit reset actions", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);

  const isolateResult = service.isolateProvider("provider-a", "manual isolate", 90);
  assert.equal(isolateResult.action, "isolate");
  assert.equal(isolateResult.circuitState, "open");
  assert.ok(isolateResult.cooldownUntil !== null);

  const isolatedState = service.getRuntimeView().providerHealthStates.find((item) => item.providerId === "provider-a");
  assert.ok(isolatedState);
  assert.equal(isolatedState.circuitState, "open");
  assert.equal(isolatedState.lastErrorMessage, "manual isolate");

  const resetResult = service.resetProviderCircuit("provider-a", "manual reset");
  assert.equal(resetResult.action, "reset");
  assert.equal(resetResult.circuitState, "closed");

  const resetState = service.getRuntimeView().providerHealthStates.find((item) => item.providerId === "provider-a");
  assert.ok(resetState);
  assert.equal(resetState.circuitState, "closed");
  assert.equal(resetState.lastProbeResult, "healthy");
  assert.equal(resetState.lastErrorMessage, null);

  database.close();
});

test("keeps half-open state stable until a recovery probe finishes", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);
  service.recordFailure("provider-a", 0, 1, "trip circuit immediately");

  const plan = service.createExecutionPlan("codex");
  assert.ok(plan !== null);
  assert.equal(plan?.candidateDecisions[0]?.reason, "half-open-fallback");

  const diagnostic = service.listProviderDiagnostics().find((item) => item.providerId === "provider-a");
  assert.ok(diagnostic);
  assert.equal(diagnostic.circuitState, "half-open");
  assert.equal(diagnostic.diagnosisStatus, "recovering");

  database.close();
});

test("backs off repeated recovery probe failures and exposes probe runtime state", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });
  failoverChainRepository.upsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: [],
    cooldownSeconds: 5,
    maxAttempts: 1
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);
  service.isolateProvider("provider-a", "manual isolate", 5);

  assert.equal(service.beginRecoveryProbe("provider-a"), true);
  let state = service.getRuntimeView().providerHealthStates.find((item) => item.providerId === "provider-a");
  assert.ok(state);
  assert.equal(state.recoveryProbeInFlight, true);

  service.markProbeRecoveryFailure("provider-a", 5, "probe failure 1");
  const firstDiagnostic = service.listProviderDiagnostics().find((item) => item.providerId === "provider-a");
  assert.ok(firstDiagnostic);
  assert.equal(firstDiagnostic.recoveryAttemptCount, 1);
  assert.equal(firstDiagnostic.recoveryProbeInFlight, false);
  assert.ok(firstDiagnostic.nextRecoveryProbeAt !== null);

  service.beginRecoveryProbe("provider-a");
  service.markProbeRecoveryFailure("provider-a", 5, "probe failure 2");
  const secondDiagnostic = service.listProviderDiagnostics().find((item) => item.providerId === "provider-a");
  assert.ok(secondDiagnostic);
  assert.equal(secondDiagnostic.recoveryAttemptCount, 2);
  assert.ok(secondDiagnostic.cooldownUntil !== null);
  assert.ok(firstDiagnostic.cooldownUntil !== null);
  assert.ok(Date.parse(secondDiagnostic.cooldownUntil) > Date.parse(firstDiagnostic.cooldownUntil));

  service.beginRecoveryProbe("provider-a");
  service.markProbeRecoverySuccess("provider-a");
  const recoveredDiagnostic = service.listProviderDiagnostics().find((item) => item.providerId === "provider-a");
  assert.ok(recoveredDiagnostic);
  assert.equal(recoveredDiagnostic.recoveryAttemptCount, 0);
  assert.equal(recoveredDiagnostic.recoveryProbeInFlight, false);
  assert.equal(recoveredDiagnostic.cooldownUntil, null);

  database.close();
});

test("builds provider diagnostic detail with recent logs, events, and recommendation", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-auth",
    name: "Provider Auth",
    providerType: "openai-compatible",
    baseUrl: "https://provider-auth.example.com/v1",
    apiKey: "provider-auth-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-auth",
    mode: "managed"
  });

  const service = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );

  service.reload(1);
  service.appendRequestLog({
    appCode: "codex",
    providerId: "provider-auth",
    targetUrl: "https://provider-auth.example.com/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 401,
    latencyMs: 80,
    outcome: "error",
    errorMessage: "upstream returned 401 unauthorized"
  });
  service.appendProviderHealthEvent({
    providerId: "provider-auth",
    trigger: "manual",
    status: "unhealthy",
    statusCode: 401,
    probeUrl: "https://provider-auth.example.com/v1/models",
    message: "Probe failed with 401"
  });
  service.recordFailure("provider-auth", 30, 1, "upstream returned 401 unauthorized");

  const detail = service.getProviderDiagnosticDetail("provider-auth");
  assert.equal(detail.diagnostic.providerId, "provider-auth");
  assert.equal(detail.recentRequestLogs.length, 1);
  assert.equal(detail.recentHealthEvents.length, 1);
  assert.equal(detail.recommendation, "check-credentials");
  assert.equal(detail.failureCategory, "auth");
  assert.match(detail.recommendationMessage, /credential/i);

  database.close();
});
