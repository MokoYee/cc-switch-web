import assert from "node:assert/strict";
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
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { SnapshotService } from "./snapshot-service.js";

const createSnapshotService = () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const appQuotaRepository = new AppQuotaRepository(database);
  const proxyService = new ProxyService(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const mcpServerRepository = new McpServerRepository(database);
  const appMcpBindingRepository = new AppMcpBindingRepository(database);

  return {
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
    snapshotService: new SnapshotService(
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
    )
  };
};

test("lists recent snapshots with resource counts", () => {
  const { database, providerRepository, bindingRepository, snapshotService } = createSnapshotService();

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  snapshotService.create("provider:provider-a");

  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });
  snapshotService.create("binding:binding-codex");

  const items = snapshotService.listRecent(2);

  assert.equal(items.length, 2);
  assert.equal(items[0]?.reason, "binding:binding-codex");
  assert.equal(items[0]?.counts.providers, 1);
  assert.equal(items[0]?.counts.bindings, 1);
  assert.equal(items[1]?.reason, "provider:provider-a");
  assert.equal(items[1]?.counts.providers, 1);
  assert.equal(items[1]?.counts.bindings, 0);

  database.close();
});

test("diffs latest snapshot against previous snapshot", () => {
  const { database, providerRepository, bindingRepository, snapshotService } = createSnapshotService();

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  const firstSnapshot = snapshotService.create("provider:provider-a");

  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });
  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A Updated",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v2",
    apiKey: "",
    apiKeyMasked: "prov****cret",
    enabled: true,
    timeoutMs: 45_000
  });
  const secondSnapshot = snapshotService.create("binding:binding-codex");

  const diff = snapshotService.diffLatestAgainstPrevious();

  assert.notEqual(diff, null);
  assert.equal(diff?.fromVersion, firstSnapshot.version);
  assert.equal(diff?.toVersion, secondSnapshot.version);
  assert.deepEqual(diff?.providers.changed, ["provider-a"]);
  assert.deepEqual(diff?.bindings.added, ["binding-codex"]);
  assert.equal(diff?.summary.totalAdded, 1);
  assert.equal(diff?.summary.totalRemoved, 0);
  assert.equal(diff?.summary.totalChanged, 1);
  assert.equal(snapshotService.getPreviousVersion(secondSnapshot.version), firstSnapshot.version);

  const historicalDiff = snapshotService.diffVersionAgainstPrevious(secondSnapshot.version);
  assert.deepEqual(historicalDiff?.bindings.added, ["binding-codex"]);

  database.close();
});

test("returns null diff when no snapshot history exists", () => {
  const { database, snapshotService } = createSnapshotService();

  assert.equal(snapshotService.diffLatestAgainstPrevious(), null);

  database.close();
});
