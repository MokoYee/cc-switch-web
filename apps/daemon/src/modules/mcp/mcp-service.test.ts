import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase } from "../../db/database.js";
import { AppMcpBindingRepository } from "./app-mcp-binding-repository.js";
import { McpEventRepository } from "./mcp-event-repository.js";
import { McpServerRepository } from "./mcp-server-repository.js";
import { McpService } from "./mcp-service.js";
import { nowIso } from "@cc-switch-web/shared";

const createService = (homeDir: string, dataDir: string): McpService => {
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  return new McpService(
    new McpServerRepository(database),
    new AppMcpBindingRepository(database),
    new McpEventRepository(database),
    { homeDir }
  );
};

test("imports MCP servers from codex config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-import-codex-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(
    join(codexDir, "config.toml"),
    [
      'model_provider = "custom"',
      "",
      "[mcp_servers.filesystem]",
      'command = "npx"',
      'args = ["@modelcontextprotocol/server-filesystem", "/tmp"]',
      'env = { ROOT_PATH = "/tmp" }',
      "",
      "[mcp_servers.remote]",
      'url = "https://mcp.example.com"'
    ].join("\n"),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const result = service.importFromHost("codex");

  assert.equal(result.importedCount, 2);
  assert.deepEqual(result.importedServerIds, ["filesystem", "remote"]);

  rmSync(rootDir, { recursive: true, force: true });
});

test("builds MCP runtime view and save previews", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-runtime-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(
    join(codexDir, "config.toml"),
    [
      "[mcp_servers.filesystem]",
      'command = "npx"',
      "",
      "[mcp_servers.remote]",
      'url = "https://mcp.example.com"'
    ].join("\n"),
    "utf-8"
  );

  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  const serverRepository = new McpServerRepository(database);
  const bindingRepository = new AppMcpBindingRepository(database);
  serverRepository.replaceAll([
    {
      id: "filesystem",
      name: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: "broken",
      name: "Broken",
      transport: "http",
      command: null,
      args: [],
      url: "https://broken.example.com",
      env: {},
      headers: {},
      enabled: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ]);
  bindingRepository.replaceAll([
    {
      id: "codex-filesystem",
      appCode: "codex",
      serverId: "filesystem",
      enabled: true,
      updatedAt: nowIso()
    },
    {
      id: "codex-broken",
      appCode: "codex",
      serverId: "broken",
      enabled: true,
      updatedAt: nowIso()
    }
  ]);

  const service = new McpService(
    serverRepository,
    bindingRepository,
    new McpEventRepository(database),
    {
      homeDir,
      listHostSyncStates: () => [
        {
          appCode: "codex",
          configPath: join(homeDir, ".codex/config.toml"),
          backupPath: null,
          syncedServerIds: ["filesystem"],
          lastAppliedAt: nowIso(),
          configExists: true
        }
      ]
    }
  );

  const runtimeView = service.getRuntimeView("codex");
  assert.equal(runtimeView.totalBindings, 2);
  assert.equal(runtimeView.enabledServers, 1);
  assert.equal(runtimeView.status, "warning");
  assert.equal(runtimeView.hostState.synced, true);
  assert.equal(runtimeView.hostState.drifted, false);
  assert.deepEqual(runtimeView.items.find((item) => item.serverId === "filesystem")?.issueCodes, [
    "duplicate-binding"
  ]);
  assert.deepEqual(runtimeView.items.find((item) => item.serverId === "broken")?.issueCodes, [
    "server-disabled",
    "duplicate-binding"
  ]);
  assert.match(runtimeView.warnings.join("\n"), /disabled/);

  const serverPreview = service.previewServerUpsert({
    id: "filesystem",
    name: "Filesystem",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-filesystem"],
    url: null,
    env: {},
    headers: {},
    enabled: false
  });
  assert.deepEqual(serverPreview.usage.boundApps, ["codex"]);
  assert.deepEqual(serverPreview.usage.importedFromApps, ["codex"]);
  assert.deepEqual(serverPreview.usage.hostManagedApps, ["codex"]);
  assert.deepEqual(serverPreview.runtimeAppCodes, ["codex"]);
  assert.deepEqual(serverPreview.runtimeIssueCodes, ["server-disabled", "duplicate-binding"]);
  assert.deepEqual(serverPreview.affectedBindingIds, ["codex-filesystem"]);
  assert.match(serverPreview.warnings.join("\n"), /affect enabled bindings/);
  assert.match(serverPreview.warnings.join("\n"), /currently synced to host configs/);
  assert.equal(serverPreview.impact.touchesHostManagedMcp, true);
  assert.equal(serverPreview.impact.requiresProxyReload, false);

  const bindingPreview = service.previewBindingUpsert({
    id: "codex-filesystem-copy",
    appCode: "codex",
    serverId: "filesystem",
    enabled: true
  });
  assert.equal(bindingPreview.serverExists, true);
  assert.equal(bindingPreview.runtimeStatus, "warning");
  assert.deepEqual(bindingPreview.runtimeIssueCodes, ["server-disabled", "duplicate-binding"]);
  assert.equal(bindingPreview.hostDrifted, false);
  assert.match(bindingPreview.warnings.join("\n"), /already has another binding/);
  assert.equal(bindingPreview.impact.affectedAppCodes[0], "codex");
  assert.equal(bindingPreview.impact.riskLevel, "high");

  rmSync(rootDir, { recursive: true, force: true });
});

test("previews MCP import conflicts from codex config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-preview-codex-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(
    join(codexDir, "config.toml"),
    [
      "[mcp_servers.filesystem]",
      'command = "npx"',
      "",
      "[mcp_servers.remote]",
      'url = "https://mcp.example.com"'
    ].join("\n"),
    "utf-8"
  );

  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  new McpServerRepository(database).replaceAll([
    {
      id: "filesystem",
      name: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ]);
  new AppMcpBindingRepository(database).replaceAll([
    {
      id: "codex-filesystem",
      appCode: "codex",
      serverId: "filesystem",
      enabled: true,
      updatedAt: nowIso()
    }
  ]);
  const service = new McpService(
    new McpServerRepository(database),
    new AppMcpBindingRepository(database),
    new McpEventRepository(database),
    { homeDir }
  );

  const preview = service.previewImportFromHost("codex");
  assert.equal(preview.totalDiscovered, 2);
  assert.deepEqual(preview.newServerIds, ["remote"]);
  assert.deepEqual(preview.existingServerIds, ["filesystem"]);
  assert.deepEqual(preview.bindingAlreadyEnabledServerIds, ["filesystem"]);
  assert.deepEqual(preview.bindingToCreateServerIds, ["remote"]);
  assert.equal(preview.items.find((item) => item.serverId === "filesystem")?.status, "binding-only");
  assert.equal(preview.items.find((item) => item.serverId === "remote")?.status, "new");
  assert.deepEqual(
    preview.items.find((item) => item.serverId === "filesystem")?.fieldDiffs,
    []
  );
  assert.deepEqual(
    preview.items.find((item) => item.serverId === "remote")?.fieldDiffs,
    [
      {
        field: "transport",
        currentValue: null,
        incomingValue: "http"
      },
      {
        field: "args",
        currentValue: null,
        incomingValue: "[]"
      },
      {
        field: "url",
        currentValue: null,
        incomingValue: "https://mcp.example.com"
      },
      {
        field: "env",
        currentValue: null,
        incomingValue: "{}"
      },
      {
        field: "headers",
        currentValue: null,
        incomingValue: "{}"
      },
      {
        field: "enabled",
        currentValue: null,
        incomingValue: "true"
      }
    ]
  );

  const skipPreview = service.previewImportFromHost("codex", {
    existingServerStrategy: "skip",
    missingBindingStrategy: "skip"
  });
  assert.equal(skipPreview.items.find((item) => item.serverId === "filesystem")?.status, "binding-only");
  assert.equal(skipPreview.items.find((item) => item.serverId === "remote")?.bindingStatus, "already-enabled");

  rmSync(rootDir, { recursive: true, force: true });
});

test("previews MCP import field diffs for existing server updates", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-preview-diff-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(
    join(codexDir, "config.toml"),
    [
      "[mcp_servers.filesystem]",
      'command = "uvx"',
      'args = ["mcp-server-filesystem", "/workspace"]',
      'env = { ROOT_PATH = "/workspace" }'
    ].join("\n"),
    "utf-8"
  );

  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  new McpServerRepository(database).replaceAll([
    {
      id: "filesystem",
      name: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
      url: null,
      env: { ROOT_PATH: "/tmp" },
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ]);

  const service = new McpService(
    new McpServerRepository(database),
    new AppMcpBindingRepository(database),
    new McpEventRepository(database),
    { homeDir }
  );

  const preview = service.previewImportFromHost("codex");
  const item = preview.items.find((current) => current.serverId === "filesystem");

  assert.equal(item?.status, "update");
  assert.deepEqual(item?.changedFields, ["command", "args", "env"]);
  assert.deepEqual(item?.fieldDiffs, [
    {
      field: "command",
      currentValue: "npx",
      incomingValue: "uvx"
    },
    {
      field: "args",
      currentValue: '["@modelcontextprotocol/server-filesystem","/tmp"]',
      incomingValue: '["mcp-server-filesystem","/workspace"]'
    },
    {
      field: "env",
      currentValue: '{"ROOT_PATH":"/tmp"}',
      incomingValue: '{"ROOT_PATH":"/workspace"}'
    }
  ]);

  rmSync(rootDir, { recursive: true, force: true });
});

test("imports MCP servers from claude config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-import-claude-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".claude"), { recursive: true });
  writeFileSync(
    join(homeDir, ".claude.json"),
    JSON.stringify(
      {
        mcpServers: {
          filesystem: {
            type: "stdio",
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
            env: {
              ROOT_PATH: "/tmp"
            }
          },
          remote: {
            type: "http",
            url: "https://mcp.example.com",
            headers: {
              Authorization: "Bearer token"
            }
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const result = service.importFromHost("claude-code");

  assert.equal(result.importedCount, 2);
  assert.deepEqual(result.importedServerIds, ["filesystem", "remote"]);

  rmSync(rootDir, { recursive: true, force: true });
});

test("imports MCP servers from gemini config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-import-gemini-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".gemini"), { recursive: true });
  writeFileSync(
    join(homeDir, ".gemini/settings.json"),
    JSON.stringify(
      {
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
            env: {
              ROOT_PATH: "/tmp"
            }
          },
          remote: {
            httpUrl: "https://mcp.example.com"
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const result = service.importFromHost("gemini-cli");

  assert.equal(result.importedCount, 2);
  assert.deepEqual(result.importedServerIds, ["filesystem", "remote"]);

  rmSync(rootDir, { recursive: true, force: true });
});

test("imports MCP servers from opencode config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-import-opencode-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".config/opencode"), { recursive: true });
  writeFileSync(
    join(homeDir, ".config/opencode/opencode.json"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          filesystem: {
            type: "local",
            command: ["npx", "@modelcontextprotocol/server-filesystem", "/tmp"],
            environment: {
              ROOT_PATH: "/tmp"
            }
          },
          remote: {
            type: "remote",
            url: "https://mcp.example.com",
            headers: {
              Authorization: "Bearer token"
            }
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const result = service.importFromHost("opencode");

  assert.equal(result.importedCount, 2);
  assert.deepEqual(result.importedServerIds, ["filesystem", "remote"]);

  rmSync(rootDir, { recursive: true, force: true });
});

test("disabled bindings do not keep MCP runtime in broken state", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-disabled-binding-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  new McpServerRepository(database).replaceAll([
    {
      id: "missing-server",
      name: "Missing Server Placeholder",
      transport: "stdio",
      command: "npx",
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ]);
  new AppMcpBindingRepository(database).replaceAll([
    {
      id: "codex-missing",
      appCode: "codex",
      serverId: "missing-server",
      enabled: false,
      updatedAt: nowIso()
    }
  ]);
  const service = new McpService(
    new McpServerRepository(database),
    new AppMcpBindingRepository(database),
    new McpEventRepository(database),
    { homeDir }
  );

  const runtimeView = service.getRuntimeView("codex");
  assert.equal(runtimeView.status, "healthy");
  assert.deepEqual(runtimeView.issueCodes, []);
  assert.deepEqual(runtimeView.items[0]?.issueCodes ?? [], []);

  rmSync(rootDir, { recursive: true, force: true });
});

test("previews and applies MCP governance repair actions", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-governance-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  const serverRepository = new McpServerRepository(database);
  const bindingRepository = new AppMcpBindingRepository(database);
  const eventRepository = new McpEventRepository(database);

  serverRepository.replaceAll([
    {
      id: "disabled-server",
      name: "Disabled Server",
      transport: "stdio",
      command: "npx",
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: "broken-server",
      name: "Broken Server",
      transport: "stdio",
      command: null,
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: "duplicate-server-a",
      name: "Duplicate Server A",
      transport: "http",
      command: null,
      args: [],
      url: "https://mcp-a.example.com",
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: "duplicate-server-b",
      name: "Duplicate Server B",
      transport: "http",
      command: null,
      args: [],
      url: "https://mcp.example.com",
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ]);
  bindingRepository.replaceAll([
    {
      id: "codex-disabled",
      appCode: "codex",
      serverId: "disabled-server",
      enabled: true,
      updatedAt: nowIso()
    },
    {
      id: "codex-broken",
      appCode: "codex",
      serverId: "broken-server",
      enabled: true,
      updatedAt: nowIso()
    },
    {
      id: "codex-duplicate-a",
      appCode: "codex",
      serverId: "duplicate-server-a",
      enabled: true,
      updatedAt: nowIso()
    },
    {
      id: "codex-duplicate-b",
      appCode: "codex",
      serverId: "duplicate-server-b",
      enabled: true,
      updatedAt: nowIso()
    }
  ]);

  const service = new McpService(serverRepository, bindingRepository, eventRepository, { homeDir });
  const preview = service.previewGovernanceRepair("codex");

  assert.equal(preview.statusBefore, "error");
  assert.deepEqual(
    preview.plannedActions.map((item) => item.action),
    ["disable-duplicate-bindings", "disable-invalid-bindings"]
  );
  assert.deepEqual(preview.predictedIssueCodesAfter, []);

  const result = service.applyGovernanceRepair("codex");
  assert.deepEqual(result.executedActions, [
    "disable-duplicate-bindings",
    "disable-invalid-bindings"
  ]);
  assert.deepEqual(result.changedBindingIds, [
    "codex-broken",
    "codex-disabled",
    "codex-duplicate-b"
  ]);
  assert.deepEqual(result.changedServerIds, []);
  assert.equal(result.statusAfter, "healthy");
  assert.deepEqual(result.issueCodesAfter, []);

  const runtimeView = service.getRuntimeView("codex");
  assert.equal(runtimeView.status, "healthy");
  assert.equal(runtimeView.items.find((item) => item.bindingId === "codex-broken")?.bindingEnabled, false);
  assert.equal(runtimeView.items.find((item) => item.serverId === "disabled-server")?.bindingEnabled, false);
  assert.equal(runtimeView.items.find((item) => item.bindingId === "codex-duplicate-b")?.bindingEnabled, false);

  rmSync(rootDir, { recursive: true, force: true });
});

test("previews and applies MCP governance repair across apps", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-mcp-governance-batch-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  const serverRepository = new McpServerRepository(database);
  const bindingRepository = new AppMcpBindingRepository(database);
  const eventRepository = new McpEventRepository(database);

  serverRepository.replaceAll([
    {
      id: "codex-good",
      name: "Codex Good",
      transport: "stdio",
      command: "npx",
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: "codex-bad",
      name: "Codex Bad",
      transport: "stdio",
      command: null,
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: "claude-good",
      name: "Claude Good",
      transport: "http",
      command: null,
      args: [],
      url: "https://claude-good.example.com",
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    {
      id: "claude-bad",
      name: "Claude Bad",
      transport: "http",
      command: null,
      args: [],
      url: "",
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ]);
  bindingRepository.replaceAll([
    {
      id: "codex-primary",
      appCode: "codex",
      serverId: "codex-good",
      enabled: true,
      updatedAt: nowIso()
    },
    {
      id: "codex-secondary",
      appCode: "codex",
      serverId: "codex-bad",
      enabled: true,
      updatedAt: nowIso()
    },
    {
      id: "claude-primary",
      appCode: "claude-code",
      serverId: "claude-good",
      enabled: true,
      updatedAt: nowIso()
    },
    {
      id: "claude-secondary",
      appCode: "claude-code",
      serverId: "claude-bad",
      enabled: true,
      updatedAt: nowIso()
    }
  ]);

  const service = new McpService(serverRepository, bindingRepository, eventRepository, { homeDir });
  const preview = service.previewGovernanceRepairAll();
  assert.equal(preview.totalApps, 2);
  assert.equal(preview.repairableApps, 2);
  assert.deepEqual(
    preview.items.map((item) => item.appCode).sort(),
    ["claude-code", "codex"]
  );

  const result = service.applyGovernanceRepairAll();
  assert.equal(result.totalApps, 2);
  assert.equal(result.repairedApps, 2);
  assert.deepEqual(
    result.items.map((item) => item.appCode).sort(),
    ["claude-code", "codex"]
  );
  assert.deepEqual(result.changedBindingIds, [
    "claude-secondary",
    "codex-secondary"
  ]);

  assert.equal(service.getRuntimeView("codex").status, "healthy");
  assert.equal(service.getRuntimeView("claude-code").status, "healthy");

  rmSync(rootDir, { recursive: true, force: true });
});
