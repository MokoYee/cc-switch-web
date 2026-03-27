import type { DaemonEnv } from "../config/env.js";
import { openDatabase, type SqliteDatabase } from "../db/database.js";
import { resolveDaemonStoragePaths, type DaemonStoragePaths } from "../db/paths.js";
import { AuditEventService } from "../modules/audit/audit-event-service.js";
import { AssetVersionService } from "../modules/assets/asset-version-service.js";
import { PromptTemplateRepository } from "../modules/assets/prompt-template-repository.js";
import { SkillDeliveryService } from "../modules/assets/skill-delivery-service.js";
import { PromptTemplateVersionRepository } from "../modules/assets/prompt-template-version-repository.js";
import { SkillRepository } from "../modules/assets/skill-repository.js";
import { SkillVersionRepository } from "../modules/assets/skill-version-repository.js";
import { BindingRepository } from "../modules/bindings/binding-repository.js";
import { DashboardBootstrapService } from "../modules/dashboard/dashboard-bootstrap-service.js";
import { FailoverChainRepository } from "../modules/failover/failover-chain-repository.js";
import { HostDiscoveryService } from "../modules/host-discovery/host-discovery-service.js";
import { ImportExportService } from "../modules/import-export/import-export-service.js";
import { AssetGovernanceService } from "../modules/governance/asset-governance-service.js";
import { ConfigGovernanceService } from "../modules/governance/config-governance-service.js";
import { AppMcpBindingRepository } from "../modules/mcp/app-mcp-binding-repository.js";
import { McpEventRepository } from "../modules/mcp/mcp-event-repository.js";
import { McpHostSyncService } from "../modules/mcp/mcp-host-sync-service.js";
import { McpServerRepository } from "../modules/mcp/mcp-server-repository.js";
import { McpService } from "../modules/mcp/mcp-service.js";
import { ProviderRepository } from "../modules/providers/provider-repository.js";
import { ProxyRuntimeService } from "../modules/proxy/proxy-runtime-service.js";
import { ProxyService } from "../modules/proxy/proxy-service.js";
import { ProviderHealthProbeService } from "../modules/proxy/provider-health-probe-service.js";
import { PromptHostSyncService } from "../modules/prompt-host-sync/prompt-host-sync-service.js";
import { AppQuotaRepository } from "../modules/quotas/app-quota-repository.js";
import { QuotaEventRepository } from "../modules/quotas/quota-event-repository.js";
import { AppQuotaService } from "../modules/quotas/app-quota-service.js";
import { QuickContextAssetService } from "../modules/onboarding/quick-context-asset-service.js";
import { QuickOnboardingService } from "../modules/onboarding/quick-onboarding-service.js";
import { RoutingGovernanceService } from "../modules/routing/routing-governance-service.js";
import { ContextRoutingExplanationService } from "../modules/routing/context-routing-explanation-service.js";
import { SettingsRepository, type ControlTokenRecord } from "../modules/settings/settings-repository.js";
import { SnapshotService } from "../modules/snapshots/snapshot-service.js";
import { SystemService } from "../modules/system/system-service.js";
import { SystemServiceEventRepository } from "../modules/system/system-service-event-repository.js";
import { SessionRecordRepository } from "../modules/workspaces/session-record-repository.js";
import { SessionGovernanceService } from "../modules/workspaces/session-governance-service.js";
import { ActiveContextService } from "../modules/workspaces/active-context-service.js";
import { ActiveContextPolicyService } from "../modules/workspaces/active-context-policy-service.js";
import { WorkspaceDiscoveryService } from "../modules/workspaces/workspace-discovery-service.js";
import { WorkspaceContextService } from "../modules/workspaces/workspace-context-service.js";
import { WorkspaceRepository } from "../modules/workspaces/workspace-repository.js";
import { SessionLifecycleService } from "../modules/workspaces/session-lifecycle-service.js";
import { RuntimeContextObservabilityService } from "../modules/workspaces/runtime-context-observability-service.js";

export interface DaemonRuntime {
  readonly env: DaemonEnv;
  readonly storagePaths: DaemonStoragePaths;
  readonly database: SqliteDatabase;
  readonly providerRepository: ProviderRepository;
  readonly promptTemplateRepository: PromptTemplateRepository;
  readonly assetVersionService: AssetVersionService;
  readonly skillRepository: SkillRepository;
  readonly skillDeliveryService: SkillDeliveryService;
  readonly workspaceRepository: WorkspaceRepository;
  readonly sessionRecordRepository: SessionRecordRepository;
  readonly sessionGovernanceService: SessionGovernanceService;
  readonly workspaceContextService: WorkspaceContextService;
  readonly activeContextService: ActiveContextService;
  readonly activeContextPolicyService: ActiveContextPolicyService;
  readonly workspaceDiscoveryService: WorkspaceDiscoveryService;
  readonly sessionLifecycleService: SessionLifecycleService;
  readonly runtimeContextObservabilityService: RuntimeContextObservabilityService;
  readonly bindingRepository: BindingRepository;
  readonly appQuotaRepository: AppQuotaRepository;
  readonly quotaEventRepository: QuotaEventRepository;
  readonly failoverChainRepository: FailoverChainRepository;
  readonly auditEventService: AuditEventService;
  readonly proxyService: ProxyService;
  readonly proxyRuntimeService: ProxyRuntimeService;
  readonly importExportService: ImportExportService;
  readonly configGovernanceService: ConfigGovernanceService;
  readonly assetGovernanceService: AssetGovernanceService;
  readonly mcpServerRepository: McpServerRepository;
  readonly appMcpBindingRepository: AppMcpBindingRepository;
  readonly mcpEventRepository: McpEventRepository;
  readonly mcpHostSyncService: McpHostSyncService;
  readonly mcpService: McpService;
  readonly hostDiscoveryService: HostDiscoveryService;
  readonly quickOnboardingService: QuickOnboardingService;
  readonly quickContextAssetService: QuickContextAssetService;
  readonly promptHostSyncService: PromptHostSyncService;
  readonly settingsRepository: SettingsRepository;
  readonly snapshotService: SnapshotService;
  readonly systemService: SystemService;
  readonly systemServiceEventRepository: SystemServiceEventRepository;
  readonly providerHealthProbeService: ProviderHealthProbeService;
  readonly appQuotaService: AppQuotaService;
  readonly routingGovernanceService: RoutingGovernanceService;
  readonly contextRoutingExplanationService: ContextRoutingExplanationService;
  readonly dashboardBootstrapService: DashboardBootstrapService;
  readonly controlToken: ControlTokenRecord;
}

export const initializeRuntime = (env: DaemonEnv): DaemonRuntime => {
  const storagePaths = resolveDaemonStoragePaths();
  const database = openDatabase(storagePaths.dbPath);

  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const promptTemplateVersionRepository = new PromptTemplateVersionRepository(database);
  const skillRepository = new SkillRepository(database);
  const skillVersionRepository = new SkillVersionRepository(database);
  const assetVersionService = new AssetVersionService(
    promptTemplateRepository,
    promptTemplateVersionRepository,
    skillRepository,
    skillVersionRepository
  );
  const skillDeliveryService = new SkillDeliveryService();
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const appQuotaRepository = new AppQuotaRepository(database);
  const quotaEventRepository = new QuotaEventRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const mcpServerRepository = new McpServerRepository(database);
  const appMcpBindingRepository = new AppMcpBindingRepository(database);
  const mcpEventRepository = new McpEventRepository(database);
  const auditEventService = new AuditEventService(database);
  const proxyService = new ProxyService(database);
  const proxyRuntimeService = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => proxyService.getStatus()
  );
  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const settingsRepository = new SettingsRepository(database);
  const systemServiceEventRepository = new SystemServiceEventRepository(database);
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const sessionGovernanceService = new SessionGovernanceService(
    sessionRecordRepository,
    settingsRepository,
    env.sessionStaleMs
  );
  const workspaceDiscoveryService = new WorkspaceDiscoveryService(
    env,
    workspaceRepository,
    sessionRecordRepository
  );
  const sessionLifecycleService = new SessionLifecycleService(
    sessionRecordRepository,
    workspaceDiscoveryService
  );
  const runtimeContextObservabilityService = new RuntimeContextObservabilityService(
    database,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService,
    activeContextService,
    sessionGovernanceService,
    quotaEventRepository
  );
  const activeContextPolicyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    workspaceDiscoveryService,
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );
  const appQuotaService = new AppQuotaService(database, appQuotaRepository);
  const routingGovernanceService = new RoutingGovernanceService(
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyRuntimeService
  );
  const contextRoutingExplanationService = new ContextRoutingExplanationService(
    activeContextService,
    activeContextPolicyService,
    bindingRepository,
    failoverChainRepository,
    proxyRuntimeService
  );
  const snapshotService = new SnapshotService(
    database,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    workspaceRepository,
    sessionRecordRepository,
    bindingRepository,
    appQuotaRepository,
    proxyService,
    failoverChainRepository,
    mcpServerRepository,
    appMcpBindingRepository
  );
  const importExportService = new ImportExportService(
    database,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    workspaceRepository,
    sessionRecordRepository,
    bindingRepository,
    appQuotaRepository,
    proxyService,
    failoverChainRepository,
    mcpServerRepository,
    appMcpBindingRepository,
    snapshotService
  );
  const configGovernanceService = new ConfigGovernanceService(
    promptTemplateRepository,
    skillRepository,
    workspaceRepository,
    sessionRecordRepository,
    appQuotaRepository,
    bindingRepository,
    providerRepository,
    failoverChainRepository,
    mcpServerRepository,
    appMcpBindingRepository
  );
  const assetGovernanceService = new AssetGovernanceService(
    promptTemplateRepository,
    skillRepository,
    workspaceRepository,
    sessionRecordRepository,
    assetVersionService
  );
  const mcpHostSyncService = new McpHostSyncService({
    dataDir: storagePaths.dataDir,
    mcpEventRepository
  });
  const mcpService = new McpService(mcpServerRepository, appMcpBindingRepository, mcpEventRepository, {
    listHostSyncStates: () => mcpHostSyncService.listSyncStates()
  });
  const hostDiscoveryService = new HostDiscoveryService({
    daemonHost: env.host,
    daemonPort: env.port,
    dataDir: storagePaths.dataDir,
    database
  });
  const quickOnboardingService = new QuickOnboardingService(
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyService,
    proxyRuntimeService,
    routingGovernanceService,
    hostDiscoveryService,
    snapshotService
  );
  const quickContextAssetService = new QuickContextAssetService(
    assetVersionService,
    bindingRepository,
    workspaceRepository,
    sessionRecordRepository,
    activeContextService,
    activeContextPolicyService,
    snapshotService
  );
  const promptHostSyncService = new PromptHostSyncService({
    dataDir: storagePaths.dataDir,
    database,
    promptTemplateRepository,
    upsertPromptTemplate: (input) => assetVersionService.upsertPromptTemplate(input).item,
    resolveEffectiveContext: (appCode) => activeContextPolicyService.resolveForApp(appCode)
  });
  const controlToken = settingsRepository.getControlToken(env.envControlToken);
  const systemService = new SystemService(
    env,
    storagePaths,
    snapshotService,
    settingsRepository,
    systemServiceEventRepository
  );
  const providerHealthProbeService = new ProviderHealthProbeService(
    proxyRuntimeService,
    fetch,
    env.healthProbeIntervalMs
  );
  const dashboardBootstrapService = new DashboardBootstrapService({
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    skillDeliveryService,
    workspaceRepository,
    sessionRecordRepository,
    sessionGovernanceService,
    workspaceContextService,
    activeContextService,
    activeContextPolicyService,
    workspaceDiscoveryService,
    runtimeContextObservabilityService,
    bindingRepository,
    appQuotaRepository,
    failoverChainRepository,
    auditEventService,
    proxyRuntimeService,
    mcpServerRepository,
    appMcpBindingRepository,
    mcpHostSyncService,
    mcpService,
    hostDiscoveryService,
    promptHostSyncService,
    snapshotService,
    systemService,
    appQuotaService,
    contextRoutingExplanationService,
  });
  snapshotService.setAfterCreate(() => {
    dashboardBootstrapService.invalidate();
  });

  snapshotService.ensureInitialSnapshot();
  proxyRuntimeService.reload(snapshotService.latest()?.version ?? null);

  return {
    env,
    storagePaths,
    database,
    providerRepository,
    promptTemplateRepository,
    assetVersionService,
    skillRepository,
    skillDeliveryService,
    workspaceRepository,
    sessionRecordRepository,
    sessionGovernanceService,
    workspaceContextService,
    activeContextService,
    activeContextPolicyService,
    workspaceDiscoveryService,
    sessionLifecycleService,
    runtimeContextObservabilityService,
    bindingRepository,
    appQuotaRepository,
    quotaEventRepository,
    failoverChainRepository,
    auditEventService,
    proxyService,
    proxyRuntimeService,
    importExportService,
    configGovernanceService,
    assetGovernanceService,
    mcpServerRepository,
    appMcpBindingRepository,
    mcpEventRepository,
    mcpHostSyncService,
    mcpService,
    hostDiscoveryService,
    quickOnboardingService,
    quickContextAssetService,
    promptHostSyncService,
    settingsRepository,
    snapshotService,
    systemService,
    systemServiceEventRepository,
    providerHealthProbeService,
    appQuotaService,
    routingGovernanceService,
    contextRoutingExplanationService,
    dashboardBootstrapService,
    controlToken
  };
};
