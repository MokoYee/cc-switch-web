import assert from "node:assert/strict";
import test from "node:test";

import type { DaemonEnv } from "../../config/env.js";
import { openDatabase } from "../../db/database.js";
import { AssetVersionService } from "../assets/asset-version-service.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { PromptTemplateVersionRepository } from "../assets/prompt-template-version-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { SkillVersionRepository } from "../assets/skill-version-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { AppMcpBindingRepository } from "../mcp/app-mcp-binding-repository.js";
import { McpServerRepository } from "../mcp/mcp-server-repository.js";
import { QuickContextAssetService } from "./quick-context-asset-service.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyService } from "../proxy/proxy-service.js";
import { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import { SettingsRepository } from "../settings/settings-repository.js";
import { SnapshotService } from "../snapshots/snapshot-service.js";
import { ActiveContextService } from "../workspaces/active-context-service.js";
import { ActiveContextPolicyService } from "../workspaces/active-context-policy-service.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceContextService } from "../workspaces/workspace-context-service.js";
import { WorkspaceDiscoveryService } from "../workspaces/workspace-discovery-service.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";

const createEnv = (): DaemonEnv => ({
  runMode: "foreground",
  host: "127.0.0.1",
  port: 8787,
  allowedOrigins: [],
  allowAnyOrigin: false,
  envControlToken: null,
  controlUiMountPath: "/ui",
  healthProbeIntervalMs: 15_000,
  workspaceScanRoots: [],
  workspaceScanDepth: 3,
  sessionStaleMs: 7 * 24 * 60 * 60 * 1000
});

const createHarness = () => {
  const database = openDatabase(":memory:");
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
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);
  const appQuotaRepository = new AppQuotaRepository(database);
  const proxyService = new ProxyService(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const mcpServerRepository = new McpServerRepository(database);
  const appMcpBindingRepository = new AppMcpBindingRepository(database);
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
  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const activeContextPolicyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRecordRepository),
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );
  const service = new QuickContextAssetService(
    assetVersionService,
    bindingRepository,
    workspaceRepository,
    sessionRecordRepository,
    activeContextService,
    activeContextPolicyService,
    snapshotService
  );

  snapshotService.ensureInitialSnapshot();

  return {
    database,
    providerRepository,
    bindingRepository,
    workspaceRepository,
    sessionRecordRepository,
    activeContextService,
    activeContextPolicyService,
    service
  };
};

test("quick context assets attach to app binding when no active runtime context exists", () => {
  const harness = createHarness();

  try {
    harness.providerRepository.upsert({
      id: "provider-main",
      name: "Main Provider",
      providerType: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-main",
      enabled: true,
      timeoutMs: 30_000
    });
    harness.bindingRepository.upsert({
      id: "binding-codex",
      appCode: "codex",
      providerId: "provider-main",
      mode: "managed"
    });

    const preview = harness.service.preview({
      appCode: "codex",
      promptLocale: "zh-CN",
      promptContent: "请优先检查边界条件。",
      skillContent: "关注回归路径。",
      targetMode: "auto"
    });

    assert.equal(preview.target.resolvedMode, "app-binding");
    assert.equal(preview.canApply, true);

    const result = harness.service.apply({
      appCode: "codex",
      promptLocale: "zh-CN",
      promptContent: "请优先检查边界条件。",
      skillContent: "关注回归路径。",
      targetMode: "auto"
    });

    const binding = harness.bindingRepository.list().find((item) => item.id === "binding-codex");
    assert.equal(result.target.resolvedMode, "app-binding");
    assert.equal(binding?.promptTemplateId, "prompt-quick-codex");
    assert.equal(binding?.skillId, "skill-quick-codex");
    assert.equal(result.effectiveContext.promptTemplate.source, "app-binding");
    assert.equal(result.effectiveContext.skill.source, "app-binding");
    assert.equal(result.snapshotVersion > 0, true);
  } finally {
    harness.database.close();
  }
});

test("quick context assets prefer the active session over app binding in auto mode", () => {
  const harness = createHarness();

  try {
    harness.providerRepository.upsert({
      id: "provider-main",
      name: "Main Provider",
      providerType: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-main",
      enabled: true,
      timeoutMs: 30_000
    });
    harness.bindingRepository.upsert({
      id: "binding-codex",
      appCode: "codex",
      providerId: "provider-main",
      mode: "managed"
    });
    harness.workspaceRepository.upsert({
      id: "workspace-api",
      name: "API Workspace",
      rootPath: "/srv/api",
      appCode: "codex",
      defaultProviderId: null,
      defaultPromptTemplateId: null,
      defaultSkillId: null,
      tags: [],
      enabled: true
    });
    harness.sessionRecordRepository.upsert({
      id: "session-review",
      workspaceId: "workspace-api",
      appCode: "codex",
      title: "Review Session",
      cwd: "/srv/api",
      providerId: null,
      promptTemplateId: null,
      skillId: null,
      status: "active",
      startedAt: "2026-03-24T02:00:00.000Z"
    });
    harness.activeContextService.activateSession("session-review");

    const result = harness.service.apply({
      appCode: "codex",
      promptLocale: "en-US",
      promptContent: "Review the patch and focus on regression boundaries.",
      skillContent: "Check retries, edge cases, and rollback safety.",
      targetMode: "auto"
    });

    const session = harness.sessionRecordRepository.findById("session-review");
    const binding = harness.bindingRepository.list().find((item) => item.id === "binding-codex");

    assert.equal(result.target.resolvedMode, "active-session");
    assert.equal(session?.promptTemplateId, "prompt-quick-codex");
    assert.equal(session?.skillId, "skill-quick-codex");
    assert.equal(binding?.promptTemplateId ?? null, null);
    assert.equal(result.effectiveContext.source, "active-session");
    assert.equal(result.effectiveContext.promptTemplate.source, "session-override");
    assert.equal(result.effectiveContext.skill.source, "session-override");
  } finally {
    harness.database.close();
  }
});
