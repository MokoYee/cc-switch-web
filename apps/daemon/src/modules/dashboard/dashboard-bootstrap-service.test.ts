import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultProxyPolicy,
  systemMetadata,
  type AppCode,
  type AppQuotaStatus,
  type ControlAuthRuntimeView,
  type EffectiveAppContext,
  type HostCliDiscovery,
  type HostCliStartupRecovery,
  type McpAppRuntimeView,
  type SessionGovernanceStatus,
  type SystemServiceDoctor,
  type UsageSummary,
  type UsageTimeseries,
  type WorkspaceDiscoveryItem
} from "cc-switch-web-shared";

import type { DaemonRuntime } from "../../bootstrap/runtime.js";
import { DashboardBootstrapService } from "./dashboard-bootstrap-service.js";

const createEffectiveContext = (appCode: AppCode): EffectiveAppContext => ({
  appCode,
  source: "none",
  activeWorkspaceId: null,
  activeSessionId: null,
  provider: {
    id: null,
    name: null,
    bindingMode: null,
    source: "none",
    missing: false
  },
  promptTemplate: {
    id: null,
    name: null,
    locale: null,
    source: "none",
    missing: false,
    content: null,
    enabled: null
  },
  skill: {
    id: null,
    name: null,
    source: "none",
    missing: false,
    promptTemplateId: null,
    content: null,
    enabled: null
  },
  systemInstruction: null,
  warnings: []
});

const createServiceDoctor = (): SystemServiceDoctor => ({
  service: "cc-switch-web.service",
  fallback: "ccsw daemon start",
  checks: {
    systemd: {
      available: false,
      detail: "systemd unavailable"
    },
    files: {
      unitPath: "/tmp/cc-switch-web.service",
      unitExists: false,
      envPath: "/tmp/daemon.env",
      envExists: false,
      envInSync: false,
      envDiff: []
    },
    service: {
      knownToSystemd: false,
      active: false,
      activeState: null,
      subState: null,
      loadState: null,
      unitFileState: null,
      execMainPid: null
    },
    runtime: {
      daemonMatchesDesired: true,
      differences: []
    },
    recommendedActions: []
  }
});

const createHostDiscovery = (appCode: AppCode, marker: string): HostCliDiscovery => ({
  appCode,
  discovered: true,
  executablePath: `/usr/local/bin/${appCode}`,
  configPath: `/tmp/${appCode}.json`,
  configLocationHint: `~/.config/${appCode}`,
  status: "discovered",
  configFormat: "json",
  takeoverSupported: true,
  supportLevel: "managed",
  takeoverMethod: "file-rewrite",
  supportReasonCode: "stable-provider-config",
  docsUrl: null,
  integrationState: "unmanaged",
  currentTarget: marker,
  desiredTarget: `http://127.0.0.1:8787/proxy/${appCode}`,
  managedTarget: null,
  lifecycleMode: null,
  managedFeatures: [],
  envConflicts: [],
  backupAvailable: false,
  lastAppliedAt: null
});

const createWorkspaceDiscovery = (rootPath: string): WorkspaceDiscoveryItem => ({
  rootPath,
  name: rootPath.split("/").at(-1) ?? "workspace",
  status: "new",
  source: "scan-root",
  appCodeSuggestion: "codex",
  existingWorkspaceId: null,
  existingSessionIds: [],
  markers: [".git"],
  hasGitRepository: true,
  depth: 0
});

const createRuntime = (dependencies: {
  readonly listWorkspaceDiscovery: () => WorkspaceDiscoveryItem[];
  readonly scanHostDiscovery: () => HostCliDiscovery[];
  readonly getServiceDoctor: () => Promise<SystemServiceDoctor>;
  readonly getStartupRecovery?: () => HostCliStartupRecovery | null;
}): DaemonRuntime =>
  ({
    env: {
      runMode: "foreground",
      host: "127.0.0.1",
      port: 8787,
      allowedOrigins: [],
      allowAnyOrigin: false,
      envControlToken: null,
      controlUiMountPath: "/ui",
      healthProbeIntervalMs: 15_000,
      workspaceScanRoots: [],
      workspaceScanDepth: 2,
      sessionStaleMs: 7 * 24 * 60 * 60 * 1000
    },
    storagePaths: {
      dataDir: "/tmp/data",
      dbPath: "/tmp/data/cc-switch-web.sqlite"
    },
    database: {},
    providerRepository: { list: () => [] },
    promptTemplateRepository: { list: () => [] },
    assetVersionService: {},
    skillRepository: { list: () => [] },
    skillDeliveryService: {
      listCapabilities: () => [
        {
          appCode: "codex",
          supportLevel: "proxy-only",
          recommendedPath: "active-context-injection",
          hostWriteSupported: false,
          reason: "Skill delivery stays on the proxy path."
        }
      ]
    },
    workspaceRepository: { list: () => [] },
    sessionRecordRepository: { list: () => [] },
    sessionGovernanceService: {
      getStatus: (): SessionGovernanceStatus => ({
        staleAfterMs: 1000,
        evaluatedAt: "2026-03-24T00:00:00.000Z",
        totalSessions: 0,
        activeSessions: 0,
        archivedSessions: 0,
        staleSessionIds: [],
        activeSessionId: null
      })
    },
    workspaceContextService: {
      listWorkspaceContexts: () => [],
      listSessionContexts: () => []
    },
    activeContextService: {
      getState: () => ({
        activeWorkspaceId: null,
        activeSessionId: null,
        workspaceContext: null,
        sessionContext: null
      })
    },
    activeContextPolicyService: {
      resolveForApp: (appCode: AppCode) => createEffectiveContext(appCode)
    },
    workspaceDiscoveryService: {
      list: dependencies.listWorkspaceDiscovery
    },
    sessionLifecycleService: {},
    runtimeContextObservabilityService: {
      getOverview: () => ({ workspaces: [], sessions: [] })
    },
    bindingRepository: { list: () => [] },
    appQuotaRepository: { list: () => [] },
    quotaEventRepository: {},
    failoverChainRepository: { list: () => [] },
    auditEventService: {
      list: (query: { limit: number; offset: number }) => ({
        items: [],
        total: 0,
        limit: query.limit,
        offset: query.offset
      })
    },
    proxyService: {},
    proxyRuntimeService: {
      listRequestLogs: (query: { limit: number; offset: number }) => ({
        items: [],
        total: 0,
        limit: query.limit,
        offset: query.offset
      }),
      listUsageRecords: (query: { limit: number; offset: number }) => ({
        items: [],
        total: 0,
        limit: query.limit,
        offset: query.offset
      }),
      summarizeUsage: (): UsageSummary => ({
        totalRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        byApp: [],
        byProvider: [],
        byModel: []
      }),
      summarizeUsageTimeseries: (): UsageTimeseries => ({
        bucket: "day",
        points: []
      }),
      getRuntimeView: () => ({
        runtimeState: "stopped",
        policy: defaultProxyPolicy,
        snapshotVersion: 1,
        lastReloadedAt: null,
        activeBindings: [],
        failoverChains: [],
        providerHealthStates: [],
        providerHealthEvents: [],
        requestLogCount: 0,
        usageRecordCount: 0
      }),
      listProviderDiagnostics: () => []
    },
    importExportService: {},
    configGovernanceService: {},
    assetGovernanceService: {},
    mcpServerRepository: { list: () => [] },
    appMcpBindingRepository: { list: () => [] },
    mcpEventRepository: {},
    mcpHostSyncService: {
      listCapabilities: () => [],
      listSyncStates: () => []
    },
    mcpService: {
      listRuntimeViews: (): McpAppRuntimeView[] => []
    },
    hostDiscoveryService: {
      scan: dependencies.scanHostDiscovery,
      getStartupRecovery: dependencies.getStartupRecovery ?? (() => null),
      listRecentEvents: () => []
    },
    promptHostSyncService: {
      listCapabilities: () => [],
      listSyncStates: () => []
    },
    settingsRepository: {},
    snapshotService: {
      latest: () => null,
      listRecent: () => [],
      diffLatestAgainstPrevious: () => null
    },
    systemService: {
      getMetadata: () => systemMetadata,
      getControlAuthRuntime: (): ControlAuthRuntimeView => ({
        source: "env",
        canRotate: false,
        maskedToken: "te***en",
        updatedAt: null
      }),
      getServiceDoctor: dependencies.getServiceDoctor,
      getRuntime: () => ({
        runMode: "foreground",
        daemonHost: "127.0.0.1",
        daemonPort: 8787,
        allowedOrigins: [],
        allowAnyOrigin: false,
        healthProbeIntervalMs: 15_000,
        dataDir: "/tmp/data",
        dbPath: "/tmp/data/cc-switch-web.sqlite",
        latestSnapshotVersion: null
      })
    },
    metricsService: {
      renderPrometheusText: () => ""
    },
    systemServiceEventRepository: {},
    providerHealthProbeService: {},
    appQuotaService: {
      listStatuses: (): AppQuotaStatus[] => []
    },
    routingGovernanceService: {},
    contextRoutingExplanationService: {
      list: () => []
    },
    dashboardBootstrapService: {},
    controlToken: {
      source: "env",
      value: "test-token",
      updatedAt: null
    }
  }) as unknown as DaemonRuntime;

test("reuses cached heavy dashboard sections until TTL expires", async () => {
  let now = 0;
  let workspaceDiscoveryCalls = 0;
  let hostDiscoveryCalls = 0;
  let serviceDoctorCalls = 0;
  const service = new DashboardBootstrapService(
    createRuntime({
      listWorkspaceDiscovery: () => {
        workspaceDiscoveryCalls += 1;
        return [createWorkspaceDiscovery(`/tmp/workspace-${workspaceDiscoveryCalls}`)];
      },
      scanHostDiscovery: () => {
        hostDiscoveryCalls += 1;
        return [createHostDiscovery("codex", `host-${hostDiscoveryCalls}`)];
      },
      getServiceDoctor: async () => {
        serviceDoctorCalls += 1;
        return createServiceDoctor();
      }
    }),
    () => now
  );

  const first = await service.load();
  const second = await service.load();

  assert.equal(workspaceDiscoveryCalls, 1);
  assert.equal(hostDiscoveryCalls, 1);
  assert.equal(serviceDoctorCalls, 1);
  assert.equal(first.workspaceDiscovery[0]?.rootPath, "/tmp/workspace-1");
  assert.equal(second.discoveries[0]?.currentTarget, "host-1");
  assert.equal(first.hostStartupRecovery, null);
  assert.equal(first.skillDeliveryCapabilities[0]?.appCode, "codex");

  now = 6_000;
  await service.load();
  assert.equal(workspaceDiscoveryCalls, 1);
  assert.equal(hostDiscoveryCalls, 2);
  assert.equal(serviceDoctorCalls, 1);

  now = 16_000;
  const refreshed = await service.load();
  assert.equal(workspaceDiscoveryCalls, 2);
  assert.equal(hostDiscoveryCalls, 3);
  assert.equal(serviceDoctorCalls, 2);
  assert.equal(refreshed.workspaceDiscovery[0]?.rootPath, "/tmp/workspace-2");
});

test("invalidate clears cached dashboard sections immediately", async () => {
  let workspaceDiscoveryCalls = 0;
  let hostDiscoveryCalls = 0;
  let serviceDoctorCalls = 0;
  const service = new DashboardBootstrapService(
    createRuntime({
      listWorkspaceDiscovery: () => {
        workspaceDiscoveryCalls += 1;
        return [createWorkspaceDiscovery(`/tmp/reload-${workspaceDiscoveryCalls}`)];
      },
      scanHostDiscovery: () => {
        hostDiscoveryCalls += 1;
        return [createHostDiscovery("claude-code", `host-${hostDiscoveryCalls}`)];
      },
      getServiceDoctor: async () => {
        serviceDoctorCalls += 1;
        return createServiceDoctor();
      }
    }),
    () => 0
  );

  await service.load();
  service.invalidate();
  const refreshed = await service.load();

  assert.equal(workspaceDiscoveryCalls, 2);
  assert.equal(hostDiscoveryCalls, 2);
  assert.equal(serviceDoctorCalls, 2);
  assert.equal(refreshed.workspaceDiscovery[0]?.rootPath, "/tmp/reload-2");
  assert.equal(refreshed.discoveries[0]?.currentTarget, "host-2");
});

test("includes startup host recovery summary in dashboard bootstrap", async () => {
  const service = new DashboardBootstrapService(
    createRuntime({
      listWorkspaceDiscovery: () => [],
      scanHostDiscovery: () => [createHostDiscovery("codex", "host-1")],
      getServiceDoctor: async () => createServiceDoctor(),
      getStartupRecovery: () => ({
        trigger: "startup-auto-rollback",
        executedAt: "2026-03-28T10:00:00.000Z",
        totalApps: 1,
        rolledBackApps: ["codex"],
        failedApps: [],
        items: [
          {
            appCode: "codex",
            action: "rollback",
            configPath: "/tmp/codex.json",
            backupPath: "/tmp/codex.bak",
            integrationState: "unmanaged",
            lifecycleMode: "foreground-session",
            message: "Managed config rolled back for codex"
          }
        ],
        failures: [],
        message: "Auto-recovered 1 stale foreground-session host takeover(s) during daemon startup"
      })
    })
  );

  const snapshot = await service.load();

  assert.equal(snapshot.hostStartupRecovery?.trigger, "startup-auto-rollback");
  assert.deepEqual(snapshot.hostStartupRecovery?.rolledBackApps, ["codex"]);
});
