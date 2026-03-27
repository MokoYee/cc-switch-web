import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyRuntimeService } from "../proxy/proxy-runtime-service.js";
import { QuotaEventRepository } from "../quotas/quota-event-repository.js";
import { RuntimeContextObservabilityService } from "./runtime-context-observability-service.js";
import { SessionRecordRepository } from "./session-record-repository.js";
import { WorkspaceRepository } from "./workspace-repository.js";

test("builds runtime context overview from workspace/session linked request logs", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const quotaEventRepository = new QuotaEventRepository(database);

  workspaceRepository.upsert({
    id: "workspace-a",
    name: "Workspace A",
    rootPath: "/tmp/workspace-a",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });
  sessionRecordRepository.upsert({
    id: "session-a",
    workspaceId: "workspace-a",
    appCode: "codex",
    title: "Session A",
    cwd: "/tmp/workspace-a",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T00:00:00.000Z"
  });
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

  const proxyRuntimeService = new ProxyRuntimeService(
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

  const requestLog = proxyRuntimeService.appendRequestLog({
    appCode: "codex",
    providerId: "provider-a",
    workspaceId: "workspace-a",
    sessionId: "session-a",
    contextSource: "request-session",
    promptTemplateId: null,
    skillId: null,
    targetUrl: "https://provider-a.example.com/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 200,
    latencyMs: 120,
    outcome: "success",
    errorMessage: null
  });
  proxyRuntimeService.appendUsageRecord({
    requestLogId: requestLog.id,
    appCode: "codex",
    providerId: "provider-a",
    model: "gpt-4.1",
    inputTokens: 100,
    outputTokens: 50
  });

  const service = new RuntimeContextObservabilityService(
    database,
    workspaceRepository,
    sessionRecordRepository,
    {
      resolveWorkspaceContext: (workspaceId: string) => ({
        workspaceId,
        workspaceName: "Workspace A",
        rootPath: "/tmp/workspace-a",
        effectiveAppCode: "codex",
        provider: { id: null, name: null, bindingMode: null, source: "none", missing: false },
        promptTemplate: { id: null, name: null, locale: null, source: "none", missing: false },
        skill: { id: null, name: null, source: "none", missing: false },
        warnings: []
      }),
      resolveSessionContext: (sessionId: string) => ({
        sessionId,
        title: "Session A",
        cwd: "/tmp/workspace-a",
        workspaceId: "workspace-a",
        effectiveAppCode: "codex",
        provider: { id: null, name: null, bindingMode: null, source: "none", missing: false },
        promptTemplate: { id: null, name: null, locale: null, source: "none", missing: false },
        skill: { id: null, name: null, source: "none", missing: false },
        warnings: []
      })
    } as never,
    {
      getState: () => ({
        activeWorkspaceId: null,
        activeSessionId: null,
        workspaceContext: null,
        sessionContext: null
      })
    } as never,
    {
      getStatus: () => ({
        staleAfterMs: 0,
        evaluatedAt: new Date().toISOString(),
        totalSessions: 1,
        activeSessions: 1,
        archivedSessions: 0,
        staleSessionIds: [],
        activeSessionId: null
      })
    } as never,
    quotaEventRepository
  );
  const overview = service.getOverview();

  assert.equal(overview.workspaces.length, 1);
  assert.equal(overview.workspaces[0]?.workspaceId, "workspace-a");
  assert.equal(overview.workspaces[0]?.requestCount, 1);
  assert.equal(overview.workspaces[0]?.totalTokens, 150);
  assert.equal(overview.workspaces[0]?.lastProviderId, "provider-a");

  assert.equal(overview.sessions.length, 1);
  assert.equal(overview.sessions[0]?.sessionId, "session-a");
  assert.equal(overview.sessions[0]?.requestCount, 1);
  assert.equal(overview.sessions[0]?.totalTokens, 150);

  database.close();
});

test("builds workspace and session runtime details with provider, failure, and model breakdowns", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const quotaEventRepository = new QuotaEventRepository(database);

  workspaceRepository.upsert({
    id: "workspace-b",
    name: "Workspace B",
    rootPath: "/tmp/workspace-b",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });
  sessionRecordRepository.upsert({
    id: "session-b",
    workspaceId: "workspace-b",
    appCode: "codex",
    title: "Session B",
    cwd: "/tmp/workspace-b",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T00:00:00.000Z"
  });
  providerRepository.upsert({
    id: "provider-b",
    name: "Provider B",
    providerType: "openai-compatible",
    baseUrl: "https://provider-b.example.com/v1",
    apiKey: "provider-b-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex-b",
    appCode: "codex",
    providerId: "provider-b",
    mode: "managed"
  });

  const proxyRuntimeService = new ProxyRuntimeService(
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

  const firstLog = proxyRuntimeService.appendRequestLog({
    appCode: "codex",
    providerId: "provider-b",
    workspaceId: "workspace-b",
    sessionId: "session-b",
    contextSource: "request-session",
    promptTemplateId: null,
    skillId: null,
    targetUrl: "https://provider-b.example.com/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 200,
    latencyMs: 100,
    outcome: "success",
    errorMessage: null
  });
  proxyRuntimeService.appendUsageRecord({
    requestLogId: firstLog.id,
    appCode: "codex",
    providerId: "provider-b",
    model: "gpt-4.1",
    inputTokens: 10,
    outputTokens: 5
  });
  proxyRuntimeService.appendRequestLog({
    appCode: "codex",
    providerId: "provider-b",
    workspaceId: "workspace-b",
    sessionId: "session-b",
    contextSource: "request-session",
    promptTemplateId: null,
    skillId: null,
    targetUrl: "https://provider-b.example.com/v1/responses",
    method: "POST",
    path: "/v1/responses",
    statusCode: 503,
    latencyMs: 220,
    outcome: "error",
    errorMessage: "upstream 503"
  });
  database
    .prepare(`
      INSERT INTO provider_health_events (
        provider_id, trigger, status, status_code, probe_url, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      "provider-b",
      "automatic-probe",
      "unhealthy",
      503,
      "https://provider-b.example.com/health",
      "health probe failed",
      "2026-03-21T00:01:30.000Z"
    );
  quotaEventRepository.append({
    appCode: "codex",
    decision: "rejected",
    reason: "daily request quota exceeded",
    requestsUsed: 99,
    tokensUsed: 5000,
    windowStartedAt: "2026-03-21T00:00:00.000Z"
  });

  const service = new RuntimeContextObservabilityService(
    database,
    workspaceRepository,
    sessionRecordRepository,
    {
      resolveWorkspaceContext: (workspaceId: string) => ({
        workspaceId,
        workspaceName: "Workspace B",
        rootPath: "/tmp/workspace-b",
        effectiveAppCode: "codex",
        provider: { id: "provider-b", name: "Provider B", bindingMode: "managed", source: "app-binding", missing: false },
        promptTemplate: { id: null, name: null, locale: null, source: "none", missing: false },
        skill: { id: null, name: null, source: "none", missing: false },
        warnings: []
      }),
      resolveSessionContext: (sessionId: string) => ({
        sessionId,
        title: "Session B",
        cwd: "/tmp/workspace-b",
        workspaceId: "workspace-b",
        effectiveAppCode: "codex",
        provider: { id: "provider-b", name: "Provider B", bindingMode: "managed", source: "app-binding", missing: false },
        promptTemplate: { id: null, name: null, locale: null, source: "none", missing: false },
        skill: { id: null, name: null, source: "none", missing: false },
        warnings: []
      })
    } as never,
    {
      getState: () => ({
        activeWorkspaceId: null,
        activeSessionId: null,
        workspaceContext: null,
        sessionContext: null
      })
    } as never,
    {
      getStatus: () => ({
        staleAfterMs: 0,
        evaluatedAt: new Date().toISOString(),
        totalSessions: 1,
        activeSessions: 1,
        archivedSessions: 0,
        staleSessionIds: [],
        activeSessionId: null
      })
    } as never,
    quotaEventRepository
  );

  const workspaceDetail = service.getWorkspaceDetail("workspace-b");
  assert.equal(workspaceDetail.resolvedContext.workspaceId, "workspace-b");
  assert.equal(workspaceDetail.isActive, false);
  assert.equal(workspaceDetail.providerBreakdown.length, 1);
  assert.equal(workspaceDetail.providerBreakdown[0]?.providerId, "provider-b");
  assert.equal(workspaceDetail.failureBreakdown[0]?.label, "error");
  assert.equal(workspaceDetail.modelBreakdown[0]?.model, "gpt-4.1");
  assert.equal(workspaceDetail.recentRequestLogs.length, 2);
  assert.equal(workspaceDetail.timeline.length, 3);
  assert.equal(workspaceDetail.timeline.some((item) => item.source === "proxy-request"), true);
  assert.equal(workspaceDetail.timeline.some((item) => item.source === "quota"), true);

  const sessionDetail = service.getSessionDetail("session-b");
  assert.equal(sessionDetail.resolvedContext.sessionId, "session-b");
  assert.equal(sessionDetail.isActive, false);
  assert.equal(sessionDetail.isStale, false);
  assert.equal(sessionDetail.providerBreakdown.length, 1);
  assert.equal(sessionDetail.failureBreakdown[0]?.count, 1);
  assert.equal(sessionDetail.modelBreakdown[0]?.totalTokens, 15);
  assert.equal(sessionDetail.recentRequestLogs[0]?.sessionId, "session-b");
  assert.equal(sessionDetail.timeline.some((item) => item.source === "proxy-request"), true);
  assert.equal(sessionDetail.timeline.some((item) => item.source === "quota"), true);

  database.close();
});
