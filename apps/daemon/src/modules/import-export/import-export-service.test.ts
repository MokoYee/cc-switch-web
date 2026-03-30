import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
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
import { ImportExportService } from "./import-export-service.js";

const defaultProxyPolicy = {
  listenHost: "127.0.0.1",
  listenPort: 8788,
  enabled: false,
  requestTimeoutMs: 60_000,
  failureThreshold: 3
} as const;

const createHarness = () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ccsw-import-export-"));
  const dataDir = join(rootDir, "data");
  mkdirSync(dataDir, { recursive: true });

  const database = openDatabase(join(dataDir, "test.sqlite"));
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const appQuotaRepository = new AppQuotaRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const mcpServerRepository = new McpServerRepository(database);
  const appMcpBindingRepository = new AppMcpBindingRepository(database);
  const proxyService = new ProxyService(database);
  proxyService.replace(defaultProxyPolicy);

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

  return {
    providerRepository,
    snapshotService,
    importExportService,
    cleanup: () => {
      database.close();
      rmSync(rootDir, { recursive: true, force: true });
    }
  };
};

test("exports provider secrets only when explicitly requested and replays them during import", () => {
  const harness = createHarness();

  try {
    harness.providerRepository.upsert({
      id: "provider-secret",
      name: "Provider Secret",
      providerType: "openai-compatible",
      baseUrl: "https://provider-secret.example.com/v1",
      apiKey: "sk-provider-secret-12345",
      enabled: true,
      timeoutMs: 30_000
    });
    harness.snapshotService.create("provider:provider-secret");

    const maskedExport = harness.importExportService.exportCurrentConfig();
    const secretExport = harness.importExportService.exportCurrentConfig(true);

    assert.equal(maskedExport.providers[0]?.apiKey, undefined);
    assert.equal(secretExport.providers[0]?.apiKey, "sk-provider-secret-12345");

    harness.importExportService.importPackage(secretExport, "import-package:with-secrets");

    const importedRuntimeProvider = harness.providerRepository.getRuntime("provider-secret");
    assert.equal(importedRuntimeProvider?.apiKeyPlaintext, "sk-provider-secret-12345");
  } finally {
    harness.cleanup();
  }
});

test("preserves local provider secrets when importing a masked package for the same provider id", () => {
  const harness = createHarness();

  try {
    harness.providerRepository.upsert({
      id: "provider-secret",
      name: "Provider Secret",
      providerType: "openai-compatible",
      baseUrl: "https://provider-secret.example.com/v1",
      apiKey: "sk-provider-secret-12345",
      enabled: true,
      timeoutMs: 30_000
    });
    harness.snapshotService.create("provider:provider-secret");

    const maskedExport = harness.importExportService.exportCurrentConfig();
    const nextPackage = {
      ...maskedExport,
      providers: maskedExport.providers.map((item) =>
        item.id === "provider-secret"
          ? {
              ...item,
              name: "Provider Secret Updated"
            }
          : item
      )
    };

    harness.importExportService.importPackage(nextPackage, "import-package:masked");

    const importedRuntimeProvider = harness.providerRepository.getRuntime("provider-secret");
    assert.equal(importedRuntimeProvider?.name, "Provider Secret Updated");
    assert.equal(importedRuntimeProvider?.apiKeyPlaintext, "sk-provider-secret-12345");
  } finally {
    harness.cleanup();
  }
});
