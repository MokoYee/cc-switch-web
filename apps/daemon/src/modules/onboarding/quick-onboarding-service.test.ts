import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { HostDiscoveryService } from "../host-discovery/host-discovery-service.js";
import { AppMcpBindingRepository } from "../mcp/app-mcp-binding-repository.js";
import { McpServerRepository } from "../mcp/mcp-server-repository.js";
import { QuickOnboardingService } from "./quick-onboarding-service.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyRuntimeService } from "../proxy/proxy-runtime-service.js";
import { ProxyService } from "../proxy/proxy-service.js";
import { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import { RoutingGovernanceService } from "../routing/routing-governance-service.js";
import { SnapshotService } from "../snapshots/snapshot-service.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";

const createHarness = () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-onboarding-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  const database = openDatabase(join(dataDir, "test.sqlite"));
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
  const proxyRuntimeService = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => proxyService.getStatus()
  );
  const routingGovernanceService = new RoutingGovernanceService(
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyRuntimeService
  );
  const hostDiscoveryService = new HostDiscoveryService({
    daemonHost: "127.0.0.1",
    daemonPort: 8788,
    dataDir,
    database,
    homeDir
  });
  const service = new QuickOnboardingService(
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyService,
    proxyRuntimeService,
    routingGovernanceService,
    hostDiscoveryService,
    snapshotService
  );

  snapshotService.ensureInitialSnapshot();
  proxyRuntimeService.reload(snapshotService.latest()?.version ?? null);

  return {
    rootDir,
    homeDir,
    dataDir,
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyService,
    hostDiscoveryService,
    service
  };
};

test("quick onboarding applies a single-provider codex route and enables proxy", () => {
  const harness = createHarness();

  try {
    const preview = harness.service.preview({
      appCode: "codex",
      providers: [
        {
          id: "provider-primary",
          name: "Primary",
          providerType: "openai-compatible",
          baseUrl: "https://primary.example.com/v1",
          apiKey: "sk-primary",
          enabled: true,
          timeoutMs: 30_000
        }
      ],
      primaryProviderId: "provider-primary",
      failoverProviderIds: [],
      mode: "managed",
      autoApplyHostTakeover: false,
      enableProxy: true,
      cooldownSeconds: 30
    });

    assert.equal(preview.canApply, true);
    assert.equal(preview.failoverPreview.enabled, false);
    assert.equal(preview.proxyPolicy.enabled, true);

    const result = harness.service.apply({
      appCode: "codex",
      providers: [
        {
          id: "provider-primary",
          name: "Primary",
          providerType: "openai-compatible",
          baseUrl: "https://primary.example.com/v1",
          apiKey: "sk-primary",
          enabled: true,
          timeoutMs: 30_000
        }
      ],
      primaryProviderId: "provider-primary",
      failoverProviderIds: [],
      mode: "managed",
      autoApplyHostTakeover: false,
      enableProxy: true,
      cooldownSeconds: 30
    });

    assert.equal(result.hostTakeoverApplied, false);
    assert.equal(result.proxyPolicy.enabled, true);
    assert.equal(harness.providerRepository.list().length, 1);
    assert.deepEqual(harness.bindingRepository.list().map((item) => item.providerId), ["provider-primary"]);
    assert.equal(harness.failoverChainRepository.list()[0]?.enabled, false);
    assert.equal(harness.proxyService.getStatus().policy.enabled, true);
    assert.equal(result.snapshotVersion > 0, true);
  } finally {
    harness.database.close();
    rmSync(harness.rootDir, { recursive: true, force: true });
  }
});

test("quick onboarding preserves ordered failover candidates for codex", () => {
  const harness = createHarness();

  try {
    const result = harness.service.apply({
      appCode: "codex",
      providers: [
        {
          id: "provider-primary",
          name: "Primary",
          providerType: "openai-compatible",
          baseUrl: "https://primary.example.com/v1",
          apiKey: "sk-primary",
          enabled: true,
          timeoutMs: 30_000
        },
        {
          id: "provider-backup",
          name: "Backup",
          providerType: "openai-compatible",
          baseUrl: "https://backup.example.com/v1",
          apiKey: "sk-backup",
          enabled: true,
          timeoutMs: 30_000
        }
      ],
      primaryProviderId: "provider-primary",
      failoverProviderIds: ["provider-backup"],
      mode: "managed",
      autoApplyHostTakeover: false,
      enableProxy: true,
      cooldownSeconds: 45,
      maxAttempts: 2
    });

    const chain = harness.failoverChainRepository.list()[0];
    assert.equal(result.failoverProviderIds[0], "provider-backup");
    assert.equal(chain?.enabled, true);
    assert.deepEqual(chain?.providerIds, ["provider-primary", "provider-backup"]);
    assert.equal(chain?.maxAttempts, 2);
    assert.equal(chain?.cooldownSeconds, 45);
  } finally {
    harness.database.close();
    rmSync(harness.rootDir, { recursive: true, force: true });
  }
});

test("quick onboarding previews env conflicts and applies claude host takeover", () => {
  const harness = createHarness();
  const claudeDir = join(harness.homeDir, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        env: {
          ANTHROPIC_AUTH_TOKEN: "original-token",
          ANTHROPIC_BASE_URL: "https://api.anthropic.com"
        }
      },
      null,
      2
    ),
    "utf-8"
  );
  writeFileSync(
    join(harness.homeDir, ".zshrc"),
    'export ANTHROPIC_BASE_URL="https://shadow.example.com"\n',
    "utf-8"
  );

  try {
    const preview = harness.service.preview({
      appCode: "claude-code",
      providers: [
        {
          id: "provider-claude",
          name: "Claude Primary",
          providerType: "anthropic",
          baseUrl: "https://api.anthropic.com",
          apiKey: "anthropic-test-token",
          enabled: true,
          timeoutMs: 30_000
        }
      ],
      primaryProviderId: "provider-claude",
      failoverProviderIds: [],
      mode: "managed",
      autoApplyHostTakeover: true,
      enableProxy: true,
      cooldownSeconds: 30
    });

    assert.equal(preview.canApply, true);
    assert.equal(preview.hostTakeoverPreview !== null, true);
    assert.equal(preview.riskLevel, "high");
    assert.equal(preview.hostTakeoverPreview?.envConflicts.length ?? 0, 1);

    const result = harness.service.apply({
      appCode: "claude-code",
      providers: [
        {
          id: "provider-claude",
          name: "Claude Primary",
          providerType: "anthropic",
          baseUrl: "https://api.anthropic.com",
          apiKey: "anthropic-test-token",
          enabled: true,
          timeoutMs: 30_000
        }
      ],
      primaryProviderId: "provider-claude",
      failoverProviderIds: [],
      mode: "managed",
      autoApplyHostTakeover: true,
      enableProxy: true,
      cooldownSeconds: 30
    });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
      env: Record<string, string>;
    };
    const onboardingSettings = JSON.parse(
      readFileSync(join(harness.homeDir, ".claude.json"), "utf-8")
    ) as { hasCompletedOnboarding?: boolean };

    assert.equal(result.hostTakeoverApplied, true);
    assert.equal(result.hostTakeoverError, null);
    assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, "PROXY_MANAGED");
    assert.equal(settings.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:8788/proxy/claude-code");
    assert.equal(onboardingSettings.hasCompletedOnboarding, true);
    assert.equal(harness.hostDiscoveryService.listRecentEvents(1)[0]?.appCode, "claude-code");
  } finally {
    harness.database.close();
    rmSync(harness.rootDir, { recursive: true, force: true });
  }
});
