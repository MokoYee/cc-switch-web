import {
  exportPackageSchema,
  type AppBinding,
  type ConfigSnapshot,
  type ExportPackage,
  type FailoverChain,
  type Provider,
  type ProxyPolicy
} from "@ai-cli-switch/shared";

import type { SqliteDatabase } from "../../db/database.js";

import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyService } from "../proxy/proxy-service.js";
import { SnapshotService } from "../snapshots/snapshot-service.js";

export class ImportExportService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly providerRepository: ProviderRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly proxyService: ProxyService,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly snapshotService: SnapshotService
  ) {}

  exportCurrentConfig(): ExportPackage {
    return {
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      providers: this.providerRepository.list(),
      bindings: this.bindingRepository.list(),
      proxyPolicy: this.proxyService.getStatus().policy,
      failoverChains: this.failoverChainRepository.list(),
      snapshot: this.snapshotService.latest()
    };
  }

  importPackage(input: unknown, reason = "import-package"): ExportPackage {
    const payload = exportPackageSchema.parse(input);

    const transaction = this.database.transaction(() => {
      this.bindingRepository.replaceAll([]);
      this.failoverChainRepository.replaceAll([]);
      this.providerRepository.replaceAll(payload.providers);
      this.bindingRepository.replaceAll(payload.bindings);
      this.proxyService.replace(payload.proxyPolicy);
      this.failoverChainRepository.replaceAll(payload.failoverChains);
    });

    transaction();
    this.snapshotService.create(reason);

    return this.exportCurrentConfig();
  }

  importConfig(
    payload: {
      providers: Provider[];
      bindings: AppBinding[];
      proxyPolicy: ProxyPolicy;
      failoverChains?: FailoverChain[];
    },
    reason: string
  ): ConfigSnapshot {
    const transaction = this.database.transaction(() => {
      this.bindingRepository.replaceAll([]);
      this.failoverChainRepository.replaceAll([]);
      this.providerRepository.replaceAll(payload.providers);
      this.bindingRepository.replaceAll(payload.bindings);
      this.proxyService.replace(payload.proxyPolicy);
      this.failoverChainRepository.replaceAll(payload.failoverChains ?? []);
    });

    transaction();

    return this.snapshotService.create(reason);
  }
}
