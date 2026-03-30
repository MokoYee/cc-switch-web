import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultProxyPolicy, type AppMcpBinding, type McpServer } from "@cc-switch-web/shared";

import { openDatabase } from "../../db/database.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ImportExportService } from "../import-export/import-export-service.js";
import { AppMcpBindingRepository } from "./app-mcp-binding-repository.js";
import { McpEventRepository } from "./mcp-event-repository.js";
import { McpHostSyncService } from "./mcp-host-sync-service.js";
import { McpServerRepository } from "./mcp-server-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyService } from "../proxy/proxy-service.js";
import { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import { SnapshotService } from "../snapshots/snapshot-service.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";

const createHostSyncService = (homeDir: string, dataDir: string): McpHostSyncService => {
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  return new McpHostSyncService({
    dataDir,
    homeDir,
    mcpEventRepository: new McpEventRepository(database)
  });
};

const createMcpServer = (overrides: Partial<McpServer> = {}): McpServer => ({
  id: "filesystem",
  name: "Filesystem",
  transport: "stdio",
  command: "npx",
  args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
  url: null,
  env: {
    ROOT_PATH: "/tmp"
  },
  headers: {},
  enabled: true,
  createdAt: "2026-03-21T00:00:00.000Z",
  updatedAt: "2026-03-21T00:00:00.000Z",
  ...overrides
});

const createBinding = (overrides: Partial<AppMcpBinding> = {}): AppMcpBinding => ({
  id: "codex-filesystem",
  appCode: "codex",
  serverId: "filesystem",
  enabled: true,
  updatedAt: "2026-03-21T00:00:00.000Z",
  ...overrides
});

test("syncs codex MCP config and rolls back managed block", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-codex-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  const configPath = join(codexDir, "config.toml");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(
    configPath,
    ['model_provider = "custom"', "", "[model_providers.custom]", 'base_url = "https://example.com/v1"'].join(
      "\n"
    ),
    "utf-8"
  );

  const service = createHostSyncService(homeDir, dataDir);
  const applyResult = service.apply("codex", [createBinding()], [createMcpServer()]);
  const applied = readFileSync(configPath, "utf-8");

  assert.equal(applyResult.action, "apply");
  assert.match(applied, /BEGIN CC Switch Web MCP/);
  assert.match(applied, /\[mcp_servers\.filesystem\]/);
  assert.match(applied, /command = "npx"/);
  assert.match(applied, /args = \["@modelcontextprotocol\/server-filesystem", "\/tmp"\]/);
  assert.match(applied, /model_provider = "custom"/);

  const rollbackResult = service.rollback("codex");
  const rolledBack = readFileSync(configPath, "utf-8");
  assert.equal(rollbackResult.action, "rollback");
  assert.doesNotMatch(rolledBack, /CC Switch Web MCP/);
  assert.match(rolledBack, /model_provider = "custom"/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("previews MCP host sync changes before apply", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-preview-apply-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  const configPath = join(codexDir, "config.toml");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(
    configPath,
    [
      'model_provider = "custom"',
      "",
      "# BEGIN AI CLI Switch MCP",
      "[mcp_servers.old]",
      'command = "npx"',
      "# END AI CLI Switch MCP"
    ].join("\n"),
    "utf-8"
  );

  const service = createHostSyncService(homeDir, dataDir);
  const preview = service.previewApply("codex", [createBinding()], [createMcpServer()]);

  assert.equal(preview.configPath, configPath);
  assert.equal(preview.configExists, true);
  assert.deepEqual(preview.currentManagedServerIds, ["old"]);
  assert.deepEqual(preview.nextManagedServerIds, ["filesystem"]);
  assert.deepEqual(preview.addedServerIds, ["filesystem"]);
  assert.deepEqual(preview.removedServerIds, ["old"]);
  assert.match(preview.warnings.join("\n"), /removed/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("previews and applies MCP host sync changes across managed apps", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-batch-host-sync-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".codex"), { recursive: true });
  mkdirSync(join(homeDir, ".claude"), { recursive: true });
  writeFileSync(
    join(homeDir, ".codex/config.toml"),
    ["# BEGIN AI CLI Switch MCP", "[mcp_servers.old]", 'command = "npx"', "# END AI CLI Switch MCP"].join("\n"),
    "utf-8"
  );
  writeFileSync(
    join(homeDir, ".claude.json"),
    JSON.stringify(
      {
        mcpServers: {},
        aiCliSwitchManagedMcpServers: []
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createHostSyncService(homeDir, dataDir);
  const bindings = [
    createBinding(),
    createBinding({
      id: "claude-filesystem",
      appCode: "claude-code"
    })
  ];
  const servers = [createMcpServer()];

  const preview = service.previewApplyAll(bindings, servers);
  assert.equal(preview.totalApps, 4);
  assert.equal(preview.syncableApps, 2);
  assert.deepEqual(
    preview.items.map((item) => item.appCode).sort(),
    ["claude-code", "codex"]
  );

  const result = service.applyAll(bindings, servers);
  assert.deepEqual(result.appliedApps.sort(), ["claude-code", "codex"]);
  assert.deepEqual(result.skippedApps.sort(), ["gemini-cli", "opencode"]);
  assert.deepEqual(result.syncedServerIds, ["filesystem"]);
  assert.match(result.message, /Applied MCP host sync/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("rolls back MCP host sync changes across managed apps", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-batch-rollback-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".codex"), { recursive: true });
  writeFileSync(
    join(homeDir, ".codex/config.toml"),
    ['model_provider = "custom"', "", "[model_providers.custom]", 'base_url = "https://example.com/v1"'].join("\n"),
    "utf-8"
  );
  writeFileSync(
    join(homeDir, ".claude.json"),
    JSON.stringify(
      {
        mcpServers: {
          shared: {
            type: "stdio",
            command: "echo",
            args: ["legacy"]
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createHostSyncService(homeDir, dataDir);
  const bindings = [
    createBinding(),
    createBinding({
      id: "claude-filesystem",
      appCode: "claude-code"
    })
  ];
  const servers = [createMcpServer()];

  service.applyAll(bindings, servers);

  const result = service.rollbackAll();
  assert.deepEqual(result.rolledBackApps.sort(), ["claude-code", "codex"]);
  assert.deepEqual(result.skippedApps.sort(), ["gemini-cli", "opencode"]);
  assert.deepEqual(result.restoredServerIds, ["filesystem"]);
  assert.match(result.message, /Rolled back MCP host sync/);

  const rolledBackCodex = readFileSync(join(homeDir, ".codex/config.toml"), "utf-8");
  assert.doesNotMatch(rolledBackCodex, /CC Switch Web MCP/);
  assert.match(rolledBackCodex, /model_provider = "custom"/);

  const rolledBackClaude = JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf-8")) as {
    mcpServers: Record<string, { command?: string }>;
  };
  assert.equal(rolledBackClaude.mcpServers.shared?.command, "echo");
  assert.equal(rolledBackClaude.mcpServers.filesystem, undefined);

  rmSync(rootDir, { recursive: true, force: true });
});

test("syncs claude MCP config while preserving unmanaged servers", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-claude-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".claude"), { recursive: true });
  const configPath = join(homeDir, ".claude.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        mcpServers: {
          shared: {
            type: "stdio",
            command: "echo",
            args: ["legacy"]
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createHostSyncService(homeDir, dataDir);
  service.apply(
    "claude-code",
    [createBinding({ appCode: "claude-code", id: "claude-filesystem" })],
    [createMcpServer()]
  );

  const applied = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcpServers: Record<string, { command?: string }>;
    aiCliSwitchManagedMcpServers: string[];
  };
  assert.equal(applied.mcpServers.shared?.command, "echo");
  assert.equal(applied.mcpServers.filesystem?.command, "npx");
  assert.deepEqual(applied.aiCliSwitchManagedMcpServers, ["filesystem"]);

  service.rollback("claude-code");
  const rolledBack = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcpServers: Record<string, { command?: string }>;
  };
  assert.equal(rolledBack.mcpServers.shared?.command, "echo");
  assert.equal(rolledBack.mcpServers.filesystem, undefined);

  rmSync(rootDir, { recursive: true, force: true });
});

test("syncs gemini MCP config while preserving unmanaged servers", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-gemini-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".gemini"), { recursive: true });
  const configPath = join(homeDir, ".gemini/settings.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        mcpServers: {
          shared: {
            command: "echo",
            args: ["legacy"]
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createHostSyncService(homeDir, dataDir);
  service.apply(
    "gemini-cli",
    [createBinding({ appCode: "gemini-cli", id: "gemini-filesystem" })],
    [createMcpServer()]
  );

  const applied = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcpServers: Record<string, { command?: string }>;
    aiCliSwitchManagedMcpServers: string[];
  };
  assert.equal(applied.mcpServers.shared?.command, "echo");
  assert.equal(applied.mcpServers.filesystem?.command, "npx");
  assert.deepEqual(applied.aiCliSwitchManagedMcpServers, ["filesystem"]);

  service.rollback("gemini-cli");
  const rolledBack = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcpServers: Record<string, { command?: string }>;
  };
  assert.equal(rolledBack.mcpServers.shared?.command, "echo");
  assert.equal(rolledBack.mcpServers.filesystem, undefined);

  rmSync(rootDir, { recursive: true, force: true });
});

test("syncs opencode MCP config while preserving unmanaged servers", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-opencode-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".config/opencode"), { recursive: true });
  const configPath = join(homeDir, ".config/opencode/opencode.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          shared: {
            type: "local",
            command: ["echo", "legacy"],
            enabled: true
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createHostSyncService(homeDir, dataDir);
  service.apply(
    "opencode",
    [createBinding({ appCode: "opencode", id: "opencode-filesystem" })],
    [createMcpServer()]
  );

  const applied = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcp: Record<string, { type?: string; command?: string[] }>;
    aiCliSwitchManagedMcpServers: string[];
  };
  assert.equal(applied.mcp.shared?.type, "local");
  assert.equal(applied.mcp.filesystem?.type, "local");
  assert.deepEqual(applied.aiCliSwitchManagedMcpServers, ["filesystem"]);

  service.rollback("opencode");
  const rolledBack = JSON.parse(readFileSync(configPath, "utf-8")) as {
    mcp: Record<string, { type?: string }>;
  };
  assert.equal(rolledBack.mcp.shared?.type, "local");
  assert.equal(rolledBack.mcp.filesystem, undefined);

  rmSync(rootDir, { recursive: true, force: true });
});

test("reports openclaw as external MCP bridge instead of managed host sync", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-capabilities-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const service = createHostSyncService(homeDir, dataDir);

  const capability = service.listCapabilities().find((item) => item.appCode === "openclaw") ?? null;

  assert.notEqual(capability, null);
  assert.equal(capability?.supportLevel, "unsupported");
  assert.equal(capability?.recommendedPath, "external-bridge");
  assert.match(capability?.reason ?? "", /mcporter bridge/);
  assert.match(capability?.docsUrl ?? "", /openclaw/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("exports and imports MCP servers and bindings with snapshots", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-export-"));
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

  mcpServerRepository.replaceAll([createMcpServer()]);
  appMcpBindingRepository.replaceAll([createBinding()]);
  const snapshot = snapshotService.create("mcp-test");
  const exported = importExportService.exportCurrentConfig();

  assert.equal(exported.mcpServers.length, 1);
  assert.equal(exported.appMcpBindings.length, 1);
  assert.equal(snapshot.payload.mcpServers.length, 1);
  assert.equal(snapshot.payload.appMcpBindings.length, 1);

  appMcpBindingRepository.replaceAll([]);
  mcpServerRepository.replaceAll([]);
  importExportService.importConfig(
    {
      providers: [],
      bindings: [],
      proxyPolicy: defaultProxyPolicy,
      failoverChains: [],
      mcpServers: exported.mcpServers,
      appMcpBindings: exported.appMcpBindings
    },
    "mcp-restore"
  );

  assert.equal(mcpServerRepository.list().length, 1);
  assert.equal(appMcpBindingRepository.list().length, 1);

  rmSync(rootDir, { recursive: true, force: true });
});
