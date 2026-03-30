import {
  exportPackageSchema,
  type AppBinding,
  type AppQuota,
  type AppMcpBinding,
  type ConfigSnapshot,
  type ExportPackage,
  type FailoverChain,
  type McpServer,
  type PromptTemplate,
  type Provider,
  type ProxyPolicy,
  type SessionRecord,
  type Skill,
  type Workspace
} from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";

import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { AppMcpBindingRepository } from "../mcp/app-mcp-binding-repository.js";
import { McpServerRepository } from "../mcp/mcp-server-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyService } from "../proxy/proxy-service.js";
import { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import { SnapshotService } from "../snapshots/snapshot-service.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";

export class ImportExportService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly providerRepository: ProviderRepository,
    private readonly promptTemplateRepository: PromptTemplateRepository,
    private readonly skillRepository: SkillRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly appQuotaRepository: AppQuotaRepository,
    private readonly proxyService: ProxyService,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly mcpServerRepository: McpServerRepository,
    private readonly appMcpBindingRepository: AppMcpBindingRepository,
    private readonly snapshotService: SnapshotService
  ) {}

  exportCurrentConfig(includeSecrets = false): ExportPackage {
    return {
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      providers: this.providerRepository.listExportable(includeSecrets),
      promptTemplates: this.promptTemplateRepository.list(),
      skills: this.skillRepository.list(),
      workspaces: this.workspaceRepository.list(),
      sessionRecords: this.sessionRecordRepository.list(),
      bindings: this.bindingRepository.list(),
      appQuotas: this.appQuotaRepository.list(),
      proxyPolicy: this.proxyService.getStatus().policy,
      failoverChains: this.failoverChainRepository.list(),
      mcpServers: this.mcpServerRepository.list(),
      appMcpBindings: this.appMcpBindingRepository.list(),
      snapshot: this.snapshotService.latest()
    };
  }

  importPackage(input: unknown, reason = "import-package"): ExportPackage {
    const payload = exportPackageSchema.parse(input);

    const transaction = this.database.transaction(() => {
      this.bindingRepository.replaceAll([]);
      this.promptTemplateRepository.replaceAll([]);
      this.skillRepository.replaceAll([]);
      this.workspaceRepository.replaceAll([]);
      this.sessionRecordRepository.replaceAll([]);
      this.appQuotaRepository.replaceAll([]);
      this.failoverChainRepository.replaceAll([]);
      this.appMcpBindingRepository.replaceAll([]);
      this.providerRepository.replaceAllImported(payload.providers);
      this.promptTemplateRepository.replaceAll(payload.promptTemplates);
      this.skillRepository.replaceAll(payload.skills);
      this.workspaceRepository.replaceAll(payload.workspaces);
      this.sessionRecordRepository.replaceAll(payload.sessionRecords);
      this.appQuotaRepository.replaceAll(payload.appQuotas);
      this.mcpServerRepository.replaceAll(payload.mcpServers);
      this.bindingRepository.replaceAll(payload.bindings);
      this.proxyService.replace(payload.proxyPolicy);
      this.failoverChainRepository.replaceAll(payload.failoverChains);
      this.appMcpBindingRepository.replaceAll(payload.appMcpBindings);
    });

    transaction();
    this.snapshotService.create(reason);

    return this.exportCurrentConfig();
  }

  importConfig(
    payload: {
      providers: Provider[];
      promptTemplates?: PromptTemplate[];
      skills?: Skill[];
      workspaces?: Workspace[];
      sessionRecords?: SessionRecord[];
      bindings: AppBinding[];
      appQuotas?: AppQuota[];
      proxyPolicy: ProxyPolicy;
      failoverChains?: FailoverChain[];
      mcpServers?: McpServer[];
      appMcpBindings?: AppMcpBinding[];
    },
    reason: string
  ): ConfigSnapshot {
    const transaction = this.database.transaction(() => {
      this.bindingRepository.replaceAll([]);
      this.promptTemplateRepository.replaceAll([]);
      this.skillRepository.replaceAll([]);
      this.workspaceRepository.replaceAll([]);
      this.sessionRecordRepository.replaceAll([]);
      this.appQuotaRepository.replaceAll([]);
      this.failoverChainRepository.replaceAll([]);
      this.appMcpBindingRepository.replaceAll([]);
      this.providerRepository.replaceAll(payload.providers);
      this.promptTemplateRepository.replaceAll(payload.promptTemplates ?? []);
      this.skillRepository.replaceAll(payload.skills ?? []);
      this.workspaceRepository.replaceAll(payload.workspaces ?? []);
      this.sessionRecordRepository.replaceAll(payload.sessionRecords ?? []);
      this.appQuotaRepository.replaceAll(payload.appQuotas ?? []);
      this.mcpServerRepository.replaceAll(payload.mcpServers ?? []);
      this.bindingRepository.replaceAll(payload.bindings);
      this.proxyService.replace(payload.proxyPolicy);
      this.failoverChainRepository.replaceAll(payload.failoverChains ?? []);
      this.appMcpBindingRepository.replaceAll(payload.appMcpBindings ?? []);
    });

    transaction();

    return this.snapshotService.create(reason);
  }
}
