import type {
  AppCode,
  DashboardBootstrap,
  HostCliDiscovery,
  SystemServiceDoctor,
  WorkspaceDiscoveryItem
} from "cc-switch-web-shared";

import type { DaemonRuntime } from "../../bootstrap/runtime.js";

type DashboardBootstrapRuntime = Pick<
  DaemonRuntime,
  | "providerRepository"
  | "promptTemplateRepository"
  | "skillRepository"
  | "skillDeliveryService"
  | "workspaceRepository"
  | "sessionRecordRepository"
  | "sessionGovernanceService"
  | "workspaceContextService"
  | "activeContextService"
  | "activeContextPolicyService"
  | "workspaceDiscoveryService"
  | "runtimeContextObservabilityService"
  | "bindingRepository"
  | "appQuotaRepository"
  | "failoverChainRepository"
  | "auditEventService"
  | "proxyRuntimeService"
  | "mcpServerRepository"
  | "appMcpBindingRepository"
  | "mcpHostSyncService"
  | "mcpService"
  | "hostDiscoveryService"
  | "promptHostSyncService"
  | "snapshotService"
  | "systemService"
  | "appQuotaService"
  | "contextRoutingExplanationService"
>;

const DASHBOARD_EFFECTIVE_CONTEXT_APPS: AppCode[] = [
  "codex",
  "claude-code",
  "gemini-cli",
  "opencode",
  "openclaw"
];

const DASHBOARD_REQUEST_LOG_PREVIEW_LIMIT = 20;
const DASHBOARD_AUDIT_PREVIEW_LIMIT = 20;
const DASHBOARD_USAGE_PREVIEW_LIMIT = 20;
const DASHBOARD_HOST_INTEGRATION_PREVIEW_LIMIT = 12;
const DASHBOARD_SERVICE_AUDIT_PREVIEW_LIMIT = 6;
const DASHBOARD_RECENT_SNAPSHOT_PREVIEW_LIMIT = 8;
const WORKSPACE_DISCOVERY_CACHE_TTL_MS = 15_000;
const HOST_DISCOVERY_CACHE_TTL_MS = 5_000;
const SERVICE_DOCTOR_CACHE_TTL_MS = 10_000;

interface CacheEntry<T> {
  value: T | undefined;
  expiresAt: number;
  pending: Promise<T> | null;
  version: number;
}

const createCacheEntry = <T>(): CacheEntry<T> => ({
  value: undefined,
  expiresAt: 0,
  pending: null,
  version: 0
});

export type DashboardBootstrapCacheSection =
  | "workspace-discovery"
  | "host-discovery"
  | "service-doctor";

const ALL_CACHE_SECTIONS: DashboardBootstrapCacheSection[] = [
  "workspace-discovery",
  "host-discovery",
  "service-doctor"
];

export class DashboardBootstrapService {
  private readonly workspaceDiscoveryCache = createCacheEntry<WorkspaceDiscoveryItem[]>();
  private readonly hostDiscoveryCache = createCacheEntry<HostCliDiscovery[]>();
  private readonly serviceDoctorCache = createCacheEntry<SystemServiceDoctor>();

  constructor(
    private readonly runtime: DashboardBootstrapRuntime,
    private readonly readNow: () => number = () => Date.now()
  ) {}

  invalidate(sections: DashboardBootstrapCacheSection[] = ALL_CACHE_SECTIONS): void {
    for (const section of sections) {
      switch (section) {
        case "workspace-discovery":
          this.invalidateCache(this.workspaceDiscoveryCache);
          break;
        case "host-discovery":
          this.invalidateCache(this.hostDiscoveryCache);
          break;
        case "service-doctor":
          this.invalidateCache(this.serviceDoctorCache);
          break;
      }
    }
  }

  async load(options?: {
    readonly force?: boolean;
  }): Promise<DashboardBootstrap> {
    const force = options?.force ?? false;
    const [workspaceDiscovery, discoveries, serviceDoctor] = await Promise.all([
      this.readCached(
        this.workspaceDiscoveryCache,
        WORKSPACE_DISCOVERY_CACHE_TTL_MS,
        () => this.runtime.workspaceDiscoveryService.list(),
        force
      ),
      this.readCached(
        this.hostDiscoveryCache,
        HOST_DISCOVERY_CACHE_TTL_MS,
        () => this.runtime.hostDiscoveryService.scan(),
        force
      ),
      this.readCached(
        this.serviceDoctorCache,
        SERVICE_DOCTOR_CACHE_TTL_MS,
        () => this.runtime.systemService.getServiceDoctor(),
        force
      )
    ]);

    const health = {
      status: "ok",
      service: "CC Switch Web-daemon",
      time: new Date().toISOString()
    } as const;
    const initialRequestLogPage = this.runtime.proxyRuntimeService.listRequestLogs({
      limit: DASHBOARD_REQUEST_LOG_PREVIEW_LIMIT,
      offset: 0
    });
    const initialAuditEventPage = this.runtime.auditEventService.list({
      limit: DASHBOARD_AUDIT_PREVIEW_LIMIT,
      offset: 0
    });
    const initialUsageRecordPage = this.runtime.proxyRuntimeService.listUsageRecords({
      limit: DASHBOARD_USAGE_PREVIEW_LIMIT,
      offset: 0
    });
    const initialUsageSummary = this.runtime.proxyRuntimeService.summarizeUsage();
    const initialUsageTimeseries = this.runtime.proxyRuntimeService.summarizeUsageTimeseries({
      bucket: "day"
    });
    const serviceAuditEvents = this.runtime.auditEventService.list({
      source: "system-service",
      limit: DASHBOARD_SERVICE_AUDIT_PREVIEW_LIMIT,
      offset: 0
    }).items;
    const latestSnapshot = this.runtime.snapshotService.latest();
    const recentSnapshots = this.runtime.snapshotService.listRecent(
      DASHBOARD_RECENT_SNAPSHOT_PREVIEW_LIMIT
    );
    const latestSnapshotDiff = this.runtime.snapshotService.diffLatestAgainstPrevious();

    return {
      health,
      providers: this.runtime.providerRepository.list(),
      promptTemplates: this.runtime.promptTemplateRepository.list(),
      skills: this.runtime.skillRepository.list(),
      workspaces: this.runtime.workspaceRepository.list(),
      workspaceDiscovery,
      resolvedWorkspaceContexts: this.runtime.workspaceContextService.listWorkspaceContexts(),
      sessionRecords: this.runtime.sessionRecordRepository.list(),
      resolvedSessionContexts: this.runtime.workspaceContextService.listSessionContexts(),
      sessionGovernance: this.runtime.sessionGovernanceService.getStatus(),
      effectiveContexts: DASHBOARD_EFFECTIVE_CONTEXT_APPS.map((appCode) =>
        this.runtime.activeContextPolicyService.resolveForApp(appCode)
      ),
      contextRoutingExplanations: this.runtime.contextRoutingExplanationService.list(),
      activeContext: this.runtime.activeContextService.getState(),
      bindings: this.runtime.bindingRepository.list(),
      appQuotas: this.runtime.appQuotaRepository.list(),
      appQuotaStatuses: this.runtime.appQuotaService.listStatuses(),
      failoverChains: this.runtime.failoverChainRepository.list(),
      mcpServers: this.runtime.mcpServerRepository.list(),
      appMcpBindings: this.runtime.appMcpBindingRepository.list(),
      mcpRuntimeViews: this.runtime.mcpService.listRuntimeViews(),
      mcpHostSyncCapabilities: this.runtime.mcpHostSyncService.listCapabilities(),
      mcpHostSyncStates: this.runtime.mcpHostSyncService.listSyncStates(),
      promptHostSyncCapabilities: this.runtime.promptHostSyncService.listCapabilities(),
      promptHostSyncStates: this.runtime.promptHostSyncService.listSyncStates(),
      skillDeliveryCapabilities: this.runtime.skillDeliveryService.listCapabilities(),
      discoveries,
      hostStartupRecovery: this.runtime.hostDiscoveryService.getStartupRecovery(),
      hostIntegrationEvents: this.runtime.hostDiscoveryService.listRecentEvents(
        DASHBOARD_HOST_INTEGRATION_PREVIEW_LIMIT
      ),
      metadata: this.runtime.systemService.getMetadata(),
      controlAuth: this.runtime.systemService.getControlAuthRuntime(),
      serviceDoctor,
      runtime: this.runtime.systemService.getRuntime(),
      proxyRuntime: this.runtime.proxyRuntimeService.getRuntimeView(),
      runtimeContexts: this.runtime.runtimeContextObservabilityService.getOverview(),
      providerDiagnostics: this.runtime.proxyRuntimeService.listProviderDiagnostics(),
      serviceAuditEvents,
      proxyRequestLogs: initialRequestLogPage.items,
      initialRequestLogPage,
      initialAuditEventPage,
      initialUsageRecordPage,
      initialUsageSummary,
      initialUsageTimeseries,
      latestSnapshot,
      recentSnapshots,
      latestSnapshotDiff
    };
  }

  private invalidateCache<T>(cache: CacheEntry<T>): void {
    cache.value = undefined;
    cache.expiresAt = 0;
    cache.pending = null;
    cache.version += 1;
  }

  private async readCached<T>(
    cache: CacheEntry<T>,
    ttlMs: number,
    loader: () => Promise<T> | T,
    force: boolean
  ): Promise<T> {
    const now = this.readNow();
    if (!force && cache.value !== undefined && cache.expiresAt > now) {
      return cache.value;
    }

    if (!force && cache.pending !== null) {
      return cache.pending;
    }

    const version = cache.version;
    const pending = Promise.resolve(loader())
      .then((value) => {
        if (cache.version === version) {
          cache.value = value;
          cache.expiresAt = this.readNow() + ttlMs;
          cache.pending = null;
        }

        return value;
      })
      .catch((error) => {
        if (cache.version === version) {
          cache.pending = null;
        }
        throw error;
      });

    cache.pending = pending;
    return pending;
  }
}
