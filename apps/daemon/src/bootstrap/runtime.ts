import type { DaemonEnv } from "../config/env.js";
import { openDatabase, type SqliteDatabase } from "../db/database.js";
import { resolveDaemonStoragePaths, type DaemonStoragePaths } from "../db/paths.js";
import { BindingRepository } from "../modules/bindings/binding-repository.js";
import { FailoverChainRepository } from "../modules/failover/failover-chain-repository.js";
import { HostDiscoveryService } from "../modules/host-discovery/host-discovery-service.js";
import { ImportExportService } from "../modules/import-export/import-export-service.js";
import { ProviderRepository } from "../modules/providers/provider-repository.js";
import { ProxyRuntimeService } from "../modules/proxy/proxy-runtime-service.js";
import { ProxyService } from "../modules/proxy/proxy-service.js";
import { SettingsRepository, type ControlTokenRecord } from "../modules/settings/settings-repository.js";
import { SnapshotService } from "../modules/snapshots/snapshot-service.js";
import { SystemService } from "../modules/system/system-service.js";

export interface DaemonRuntime {
  readonly env: DaemonEnv;
  readonly storagePaths: DaemonStoragePaths;
  readonly database: SqliteDatabase;
  readonly providerRepository: ProviderRepository;
  readonly bindingRepository: BindingRepository;
  readonly failoverChainRepository: FailoverChainRepository;
  readonly proxyService: ProxyService;
  readonly proxyRuntimeService: ProxyRuntimeService;
  readonly importExportService: ImportExportService;
  readonly hostDiscoveryService: HostDiscoveryService;
  readonly settingsRepository: SettingsRepository;
  readonly snapshotService: SnapshotService;
  readonly systemService: SystemService;
  readonly controlToken: ControlTokenRecord;
}

export const initializeRuntime = (env: DaemonEnv): DaemonRuntime => {
  const storagePaths = resolveDaemonStoragePaths();
  const database = openDatabase(storagePaths.dbPath);

  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const proxyService = new ProxyService(database);
  const proxyRuntimeService = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => proxyService.getStatus()
  );
  const settingsRepository = new SettingsRepository(database);
  const snapshotService = new SnapshotService(
    database,
    providerRepository,
    bindingRepository,
    proxyService,
    failoverChainRepository
  );
  const importExportService = new ImportExportService(
    database,
    providerRepository,
    bindingRepository,
    proxyService,
    failoverChainRepository,
    snapshotService
  );
  const hostDiscoveryService = new HostDiscoveryService();
  const controlToken = settingsRepository.getControlToken(env.envControlToken);
  const systemService = new SystemService(env, storagePaths, snapshotService);

  snapshotService.ensureInitialSnapshot();
  proxyRuntimeService.reload(snapshotService.latest()?.version ?? null);

  return {
    env,
    storagePaths,
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyService,
    proxyRuntimeService,
    importExportService,
    hostDiscoveryService,
    settingsRepository,
    snapshotService,
    systemService,
    controlToken
  };
};
