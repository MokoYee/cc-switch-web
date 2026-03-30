import assert from "node:assert/strict";
import test from "node:test";

import type {
  AppBinding,
  AppMcpBinding,
  AppQuota,
  AppQuotaStatus,
  FailoverChain,
  McpServer,
  McpAppRuntimeView,
  Provider,
  ProviderDiagnostic,
  SessionRecord,
  Workspace
} from "cc-switch-web-shared";

import { defaultProxyPolicy } from "cc-switch-web-shared";

import { MetricsService, type MetricsServiceDependencies } from "./metrics-service.js";

const createProvider = (overrides: Partial<Provider> = {}): Provider => ({
  id: "provider-a",
  name: "Provider A",
  providerType: "openai-compatible",
  baseUrl: "https://provider-a.example.com",
  apiKeyMasked: "sk-****",
  enabled: true,
  timeoutMs: 30_000,
  createdAt: "2026-03-28T00:00:00.000Z",
  updatedAt: "2026-03-28T00:00:00.000Z",
  ...overrides
});

const createDiagnostic = (overrides: Partial<ProviderDiagnostic> = {}): ProviderDiagnostic => ({
  providerId: "provider-a",
  providerName: "Provider A",
  providerType: "openai-compatible",
  enabled: true,
  bindingAppCodes: ["codex"],
  failoverAppCodes: [],
  requestCount: 10,
  successCount: 8,
  errorCount: 1,
  rejectedCount: 1,
  failoverCount: 0,
  successRate: 0.8,
  averageLatencyMs: 120,
  lastRequestAt: "2026-03-28T01:00:00.000Z",
  lastSuccessAt: "2026-03-28T00:59:00.000Z",
  lastFailureAt: null,
  lastRecoveredAt: null,
  lastProbeAt: null,
  lastProbeResult: null,
  recoveryProbeInFlight: false,
  recoveryAttemptCount: 0,
  recoverySuccessCount: 0,
  recoverySuccessThreshold: 2,
  nextRecoveryProbeAt: null,
  circuitState: "closed",
  diagnosisStatus: "healthy",
  cooldownUntil: null,
  recoveryProbeUrl: "https://provider-a.example.com/v1/models",
  lastRequestPath: "/v1/chat/completions",
  lastRequestMethod: "POST",
  lastStatusCode: 200,
  lastErrorMessage: null,
  recentErrorMessages: [],
  ...overrides
});

const createQuotaStatus = (state: AppQuotaStatus["currentState"]): AppQuotaStatus => ({
  quota: {
    id: `quota-${state}`,
    appCode: state === "disabled" ? "claude-code" : "codex",
    enabled: state !== "disabled",
    period: "day",
    maxRequests: 100,
    maxTokens: 1000,
    updatedAt: "2026-03-28T00:00:00.000Z"
  },
  requestsUsed: 10,
  tokensUsed: 100,
  requestsRemaining: 90,
  tokensRemaining: 900,
  requestUtilization: 0.1,
  tokenUtilization: 0.1,
  currentState: state,
  windowStartedAt: "2026-03-28T00:00:00.000Z",
  evaluatedAt: "2026-03-28T01:00:00.000Z"
});

const createMcpRuntimeView = (
  status: McpAppRuntimeView["status"],
  drifted = false
): McpAppRuntimeView => ({
  appCode: status === "error" ? "claude-code" : status === "warning" ? "gemini-cli" : "codex",
  totalBindings: 1,
  enabledBindings: 1,
  enabledServers: 1,
  status,
  issueCodes: drifted ? ["host-drift"] : [],
  hostState: {
    synced: !drifted,
    drifted,
    configPath: drifted ? "/tmp/mcp.json" : null,
    lastAppliedAt: drifted ? "2026-03-28T01:00:00.000Z" : null,
    syncedServerIds: []
  },
  items: [],
  warnings: []
});

const createSession = (status: SessionRecord["status"], id: string): SessionRecord => ({
  id,
  workspaceId: null,
  appCode: "codex",
  title: id,
  cwd: `/tmp/${id}`,
  providerId: null,
  promptTemplateId: null,
  skillId: null,
  status,
  startedAt: "2026-03-28T00:00:00.000Z",
  updatedAt: "2026-03-28T01:00:00.000Z"
});

const createBinding = (index: number): AppBinding => ({
  id: `binding-${index}`,
  appCode: index % 2 === 0 ? "codex" : "claude-code",
  providerId: "provider-a",
  mode: "managed",
  promptTemplateId: null,
  skillId: null,
  updatedAt: "2026-03-28T01:00:00.000Z"
});

const createFailoverChain = (index: number): FailoverChain => ({
  id: `chain-${index}`,
  appCode: index % 2 === 0 ? "codex" : "claude-code",
  enabled: true,
  providerIds: ["provider-a", "provider-b"],
  cooldownSeconds: 30,
  maxAttempts: 2,
  updatedAt: "2026-03-28T01:00:00.000Z"
});

const createWorkspace = (index: number): Workspace => ({
  id: `workspace-${index}`,
  name: `Workspace ${index}`,
  rootPath: `/tmp/workspace-${index}`,
  appCode: index % 2 === 0 ? "codex" : null,
  defaultProviderId: null,
  defaultPromptTemplateId: null,
  defaultSkillId: null,
  tags: [],
  enabled: true,
  updatedAt: "2026-03-28T01:00:00.000Z"
});

const createAppQuota = (index: number): AppQuota => ({
  id: `quota-${index}`,
  appCode: index % 2 === 0 ? "codex" : "claude-code",
  enabled: true,
  period: "day",
  maxRequests: 100,
  maxTokens: 1000,
  updatedAt: "2026-03-28T01:00:00.000Z"
});

const createMcpServer = (index: number): McpServer => ({
  id: `server-${index}`,
  name: `Server ${index}`,
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem"],
  url: null,
  env: {},
  headers: {},
  enabled: true,
  createdAt: "2026-03-28T00:00:00.000Z",
  updatedAt: "2026-03-28T01:00:00.000Z"
});

const createAppMcpBinding = (index: number): AppMcpBinding => ({
  id: `mcp-binding-${index}`,
  appCode: index % 2 === 0 ? "codex" : "claude-code",
  serverId: `server-${index}`,
  enabled: true,
  updatedAt: "2026-03-28T01:00:00.000Z"
});

const createService = (
  overrides: Partial<{
    providers: Provider[];
    diagnostics: ProviderDiagnostic[];
    sessions: SessionRecord[];
    appQuotaStatuses: AppQuotaStatus[];
    mcpRuntimeViews: McpAppRuntimeView[];
    proxyRuntimeState: "stopped" | "starting" | "running";
    proxySnapshotVersion: number | null;
    proxyRequestLogCount: number;
    usageRecordCount: number;
    latestSnapshotVersion: number | null;
    bindingsTotal: number;
    failoverChainsTotal: number;
    workspacesTotal: number;
    appQuotasTotal: number;
    mcpServersTotal: number;
    mcpBindingsTotal: number;
  }> = {}
): MetricsService => {
  const dependencies: MetricsServiceDependencies = {
    systemService: {
      getRuntime: () => ({
        runMode: "foreground",
        daemonHost: "127.0.0.1",
        daemonPort: 8787,
        allowedOrigins: [],
        allowAnyOrigin: false,
        healthProbeIntervalMs: 15_000,
        dataDir: "/tmp/ccsw",
        dbPath: "/tmp/ccsw/cc-switch-web.sqlite",
        latestSnapshotVersion: overrides.latestSnapshotVersion ?? 12
      })
    },
    proxyRuntimeService: {
      getRuntimeView: () => ({
        runtimeState: overrides.proxyRuntimeState ?? "running",
        policy: defaultProxyPolicy,
        snapshotVersion: overrides.proxySnapshotVersion ?? 7,
        lastReloadedAt: "2026-03-28T01:00:00.000Z",
        activeBindings: [],
        failoverChains: [],
        providerHealthStates: [],
        providerHealthEvents: [],
        requestLogCount: overrides.proxyRequestLogCount ?? 18,
        usageRecordCount: overrides.usageRecordCount ?? 9
      }),
      listProviderDiagnostics: () =>
        overrides.diagnostics ?? [
          createDiagnostic(),
          createDiagnostic({
            providerId: "provider-b",
            providerName: "Provider B",
            diagnosisStatus: "down",
            requestCount: 4,
            successCount: 1,
            errorCount: 3,
            lastErrorMessage: "upstream unavailable"
          })
        ]
    },
    providerRepository: {
      list: () =>
        overrides.providers ?? [
          createProvider(),
          createProvider({
            id: "provider-b",
            name: "Provider B",
            enabled: false
          })
        ]
    },
    bindingRepository: {
      list: () => Array.from({ length: overrides.bindingsTotal ?? 2 }, (_, index) => createBinding(index))
    },
    failoverChainRepository: {
      list: () =>
        Array.from({ length: overrides.failoverChainsTotal ?? 1 }, (_, index) => createFailoverChain(index))
    },
    workspaceRepository: {
      list: () => Array.from({ length: overrides.workspacesTotal ?? 3 }, (_, index) => createWorkspace(index))
    },
    sessionRecordRepository: {
      list: () =>
        overrides.sessions ?? [createSession("active", "session-active"), createSession("archived", "session-archived")]
    },
    appQuotaRepository: {
      list: () => Array.from({ length: overrides.appQuotasTotal ?? 2 }, (_, index) => createAppQuota(index))
    },
    appQuotaService: {
      listStatuses: () =>
        overrides.appQuotaStatuses ?? [createQuotaStatus("healthy"), createQuotaStatus("warning")]
    },
    mcpServerRepository: {
      list: () => Array.from({ length: overrides.mcpServersTotal ?? 2 }, (_, index) => createMcpServer(index))
    },
    appMcpBindingRepository: {
      list: () =>
        Array.from({ length: overrides.mcpBindingsTotal ?? 3 }, (_, index) => createAppMcpBinding(index))
    },
    mcpService: {
      listRuntimeViews: () =>
        overrides.mcpRuntimeViews ?? [
          createMcpRuntimeView("healthy"),
          createMcpRuntimeView("warning"),
          createMcpRuntimeView("error", true)
        ]
    }
  };

  return new MetricsService(dependencies);
};

test("renders aggregate readiness metrics for daemon runtime", () => {
  const text = createService().renderPrometheusText();

  assert.match(
    text,
    /ccsw_daemon_info\{run_mode="foreground",daemon_host="127\.0\.0\.1",daemon_port="8787"\} 1/
  );
  assert.match(text, /ccsw_proxy_runtime_state 2/);
  assert.match(text, /ccsw_proxy_snapshot_version 7/);
  assert.match(text, /ccsw_proxy_request_logs_total 18/);
  assert.match(text, /ccsw_usage_records_total 9/);
  assert.match(text, /ccsw_provider_total 2/);
  assert.match(text, /ccsw_provider_enabled_total 1/);
  assert.match(text, /ccsw_provider_diagnosis_total\{status="healthy"\} 1/);
  assert.match(text, /ccsw_provider_diagnosis_total\{status="down"\} 1/);
  assert.match(text, /ccsw_provider_diagnosis_total\{status="recovering"\} 0/);
  assert.match(text, /ccsw_bindings_total 2/);
  assert.match(text, /ccsw_failover_chains_total 1/);
  assert.match(text, /ccsw_workspaces_total 3/);
  assert.match(text, /ccsw_sessions_total\{status="active"\} 1/);
  assert.match(text, /ccsw_sessions_total\{status="archived"\} 1/);
  assert.match(text, /ccsw_app_quotas_total 2/);
  assert.match(text, /ccsw_app_quota_status_total\{state="healthy"\} 1/);
  assert.match(text, /ccsw_app_quota_status_total\{state="warning"\} 1/);
  assert.match(text, /ccsw_app_quota_status_total\{state="disabled"\} 0/);
  assert.match(text, /ccsw_mcp_servers_total 2/);
  assert.match(text, /ccsw_mcp_bindings_total 3/);
  assert.match(text, /ccsw_mcp_runtime_apps_total\{status="healthy"\} 1/);
  assert.match(text, /ccsw_mcp_runtime_apps_total\{status="warning"\} 1/);
  assert.match(text, /ccsw_mcp_runtime_apps_total\{status="error"\} 1/);
  assert.match(text, /ccsw_mcp_host_drift_total 1/);
  assert.match(text, /ccsw_latest_snapshot_version 12/);
});

test("maps proxy runtime states to numeric gauges", () => {
  const stoppedMetrics = createService({ proxyRuntimeState: "stopped" }).renderPrometheusText();
  const startingMetrics = createService({ proxyRuntimeState: "starting" }).renderPrometheusText();

  assert.match(stoppedMetrics, /ccsw_proxy_runtime_state 0/);
  assert.match(startingMetrics, /ccsw_proxy_runtime_state 1/);
});

test("escapes provider labels for prometheus exposition format", () => {
  const text = createService({
    diagnostics: [
      createDiagnostic({
        providerId: 'provider"quoted',
        providerName: 'line 1 "quoted"\nline 2\\tail',
        requestCount: 3
      })
    ]
  }).renderPrometheusText();

  const metricLine = text
    .split("\n")
    .find((line) => line.startsWith("ccsw_provider_requests_total{"));

  assert.equal(
    metricLine,
    'ccsw_provider_requests_total{provider_id="provider\\"quoted",provider_name="line 1 \\"quoted\\"\\nline 2\\\\tail",provider_type="openai-compatible"} 3'
  );
});
