import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  nowIso,
  type AppCode,
  type AppMcpBinding,
  type McpHostSyncBatchPreview,
  type McpHostSyncBatchResult,
  type McpHostSyncState,
  type McpHostSyncPreview,
  type HostMcpSyncCapability,
  type HostMcpSyncResult,
  type McpServer
} from "@cc-switch-web/shared";

import { McpEventRepository } from "./mcp-event-repository.js";

interface ManagedHostMcpAdapter {
  readonly appCode: AppCode;
  readonly configPathHint: string;
  readonly configFormat: "toml" | "json";
  readonly docsUrl: string | null;
  resolveConfigPath(homeDir: string): string;
  readManagedServerIds(configPath: string): string[];
  buildManagedConfig(existingContent: string, servers: McpServer[]): string;
}

interface HostMcpStateRecord {
  readonly appCode: AppCode;
  readonly configPath: string;
  readonly backupPath: string | null;
  readonly rollbackAction: "restore" | "delete";
  readonly syncedServerIds: string[];
  readonly lastAppliedAt: string;
}

const MANAGED_BLOCK_START = "# BEGIN CC Switch Web MCP";
const MANAGED_BLOCK_END = "# END CC Switch Web MCP";
const LEGACY_MANAGED_BLOCK_START = "# BEGIN AI CLI Switch MCP";
const LEGACY_MANAGED_BLOCK_END = "# END AI CLI Switch MCP";

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true });
};

const findManagedBlockRange = (
  content: string
): { readonly startIndex: number; readonly endIndex: number; readonly endMarkerLength: number } | null => {
  for (const [startMarker, endMarker] of [
    [MANAGED_BLOCK_START, MANAGED_BLOCK_END],
    [LEGACY_MANAGED_BLOCK_START, LEGACY_MANAGED_BLOCK_END]
  ] as const) {
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);
    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
      return {
        startIndex,
        endIndex,
        endMarkerLength: endMarker.length
      };
    }
  }

  return null;
};

const escapeTomlString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const renderTomlStringArray = (values: string[]): string =>
  `[${values.map((value) => `"${escapeTomlString(value)}"`).join(", ")}]`;

const renderTomlInlineTable = (value: Record<string, string>): string => {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }

  return `{ ${entries
    .map(([key, item]) => `${key} = "${escapeTomlString(item)}"`)
    .join(", ")} }`;
};

const stripManagedBlock = (content: string): string => {
  const range = findManagedBlockRange(content);
  if (!range) {
    return content.trimEnd();
  }

  const before = content.slice(0, range.startIndex).trimEnd();
  const after = content.slice(range.endIndex + range.endMarkerLength).trimStart();
  return [before, after].filter((part) => part.length > 0).join("\n\n").trimEnd();
};

const buildCodexManagedBlock = (servers: McpServer[]): string => {
  const lines: string[] = [MANAGED_BLOCK_START];

  for (const server of servers) {
    lines.push(`[mcp_servers.${server.id}]`);
    if (server.transport === "stdio") {
      lines.push(`command = "${escapeTomlString(server.command ?? "")}"`);
      if (server.args.length > 0) {
        lines.push(`args = ${renderTomlStringArray(server.args)}`);
      }
      if (Object.keys(server.env).length > 0) {
        lines.push(`env = ${renderTomlInlineTable(server.env)}`);
      }
    } else {
      lines.push(`url = "${escapeTomlString(server.url ?? "")}"`);
      if (Object.keys(server.headers).length > 0) {
        lines.push(`headers = ${renderTomlInlineTable(server.headers)}`);
      }
    }
    lines.push("");
  }

  while (lines.at(-1) === "") {
    lines.pop();
  }

  lines.push(MANAGED_BLOCK_END);
  return `${lines.join("\n")}\n`;
};

const readJsonObject = (filePath: string): Record<string, unknown> => {
  const content = readFileSync(filePath, "utf-8").trim();
  if (content.length === 0) {
    return {};
  }

  const parsed = JSON.parse(content) as unknown;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
};

const codexMcpAdapter: ManagedHostMcpAdapter = {
  appCode: "codex",
  configPathHint: "~/.codex/config.toml",
  configFormat: "toml",
  docsUrl: "https://github.com/openai/codex",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".codex/config.toml"),
  readManagedServerIds: (configPath) => {
    const content = readFileSync(configPath, "utf-8");
    const range = findManagedBlockRange(content);
    const managedBlock = range
      ? content.slice(range.startIndex, range.endIndex + range.endMarkerLength)
      : null;
    if (!managedBlock) {
      return [];
    }

    return Array.from(managedBlock.matchAll(/^\[mcp_servers\.([^\]]+)\]$/gm))
      .map((match) => match[1])
      .filter((item): item is string => typeof item === "string");
  },
  buildManagedConfig: (existingContent, servers) => {
    const base = stripManagedBlock(existingContent);
    if (servers.length === 0) {
      return base.length > 0 ? `${base}\n` : "";
    }

    const block = buildCodexManagedBlock(servers).trimEnd();
    return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
  }
};

const claudeCodeMcpAdapter: ManagedHostMcpAdapter = {
  appCode: "claude-code",
  configPathHint: "~/.claude.json",
  configFormat: "json",
  docsUrl: "https://docs.anthropic.com/en/docs/claude-code/mcp",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".claude.json"),
  readManagedServerIds: (configPath) => {
    const parsed = readJsonObject(configPath);
    const managed = parsed.aiCliSwitchManagedMcpServers;
    return Array.isArray(managed) ? managed.filter((item): item is string => typeof item === "string") : [];
  },
  buildManagedConfig: (existingContent, servers) => {
    const parsed =
      existingContent.trim().length > 0
        ? (JSON.parse(existingContent) as Record<string, unknown>)
        : {};
    const currentMap =
      typeof parsed.mcpServers === "object" && parsed.mcpServers !== null && !Array.isArray(parsed.mcpServers)
        ? ({ ...(parsed.mcpServers as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const managedServerIds = Array.isArray(parsed.aiCliSwitchManagedMcpServers)
      ? (parsed.aiCliSwitchManagedMcpServers as unknown[]).filter(
          (item): item is string => typeof item === "string"
        )
      : [];

    for (const serverId of managedServerIds) {
      delete currentMap[serverId];
    }

    for (const server of servers) {
      currentMap[server.id] =
        server.transport === "stdio"
          ? {
              type: "stdio",
              command: server.command,
              ...(server.args.length > 0 ? { args: server.args } : {}),
              ...(Object.keys(server.env).length > 0 ? { env: server.env } : {})
            }
          : {
              type: "http",
              url: server.url,
              ...(Object.keys(server.headers).length > 0 ? { headers: server.headers } : {})
            };
    }

    const nextConfig: Record<string, unknown> = {
      ...parsed,
      mcpServers: currentMap,
      aiCliSwitchManagedMcpServers: servers.map((server) => server.id)
    };

    return `${JSON.stringify(nextConfig, null, 2)}\n`;
  }
};

const geminiCliMcpAdapter: ManagedHostMcpAdapter = {
  appCode: "gemini-cli",
  configPathHint: "~/.gemini/settings.json",
  configFormat: "json",
  docsUrl: "https://github.com/google-gemini/gemini-cli",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".gemini/settings.json"),
  readManagedServerIds: (configPath) => {
    const parsed = readJsonObject(configPath);
    const managed = parsed.aiCliSwitchManagedMcpServers;
    return Array.isArray(managed) ? managed.filter((item): item is string => typeof item === "string") : [];
  },
  buildManagedConfig: (existingContent, servers) => {
    const parsed =
      existingContent.trim().length > 0
        ? (JSON.parse(existingContent) as Record<string, unknown>)
        : {};
    const currentMap =
      typeof parsed.mcpServers === "object" && parsed.mcpServers !== null && !Array.isArray(parsed.mcpServers)
        ? ({ ...(parsed.mcpServers as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const managedServerIds = Array.isArray(parsed.aiCliSwitchManagedMcpServers)
      ? (parsed.aiCliSwitchManagedMcpServers as unknown[]).filter(
          (item): item is string => typeof item === "string"
        )
      : [];

    for (const serverId of managedServerIds) {
      delete currentMap[serverId];
    }

    for (const server of servers) {
      currentMap[server.id] =
        server.transport === "stdio"
          ? {
              command: server.command,
              ...(server.args.length > 0 ? { args: server.args } : {}),
              ...(Object.keys(server.env).length > 0 ? { env: server.env } : {}),
              timeout: 60000
            }
          : {
              ...(server.transport === "http" ? { httpUrl: server.url } : { url: server.url }),
              ...(Object.keys(server.headers).length > 0 ? { headers: server.headers } : {}),
              timeout: 60000
            };
    }

    return `${JSON.stringify(
      {
        ...parsed,
        mcpServers: currentMap,
        aiCliSwitchManagedMcpServers: servers.map((server) => server.id)
      },
      null,
      2
    )}\n`;
  }
};

const opencodeMcpAdapter: ManagedHostMcpAdapter = {
  appCode: "opencode",
  configPathHint: "~/.config/opencode/opencode.json",
  configFormat: "json",
  docsUrl: "https://opencode.ai/docs",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".config/opencode/opencode.json"),
  readManagedServerIds: (configPath) => {
    const parsed = readJsonObject(configPath);
    const managed = parsed.aiCliSwitchManagedMcpServers;
    return Array.isArray(managed) ? managed.filter((item): item is string => typeof item === "string") : [];
  },
  buildManagedConfig: (existingContent, servers) => {
    const parsed =
      existingContent.trim().length > 0
        ? (JSON.parse(existingContent) as Record<string, unknown>)
        : { $schema: "https://opencode.ai/config.json" };
    const currentMap =
      typeof parsed.mcp === "object" && parsed.mcp !== null && !Array.isArray(parsed.mcp)
        ? ({ ...(parsed.mcp as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const managedServerIds = Array.isArray(parsed.aiCliSwitchManagedMcpServers)
      ? (parsed.aiCliSwitchManagedMcpServers as unknown[]).filter(
          (item): item is string => typeof item === "string"
        )
      : [];

    for (const serverId of managedServerIds) {
      delete currentMap[serverId];
    }

    for (const server of servers) {
      currentMap[server.id] =
        server.transport === "stdio"
          ? {
              type: "local",
              command: [server.command, ...server.args].filter(
                (item): item is string => typeof item === "string" && item.length > 0
              ),
              ...(Object.keys(server.env).length > 0 ? { environment: server.env } : {}),
              enabled: true
            }
          : {
              type: "remote",
              url: server.url,
              ...(Object.keys(server.headers).length > 0 ? { headers: server.headers } : {}),
              enabled: true
            };
    }

    return `${JSON.stringify(
      {
        ...parsed,
        mcp: currentMap,
        aiCliSwitchManagedMcpServers: servers.map((server) => server.id)
      },
      null,
      2
    )}\n`;
  }
};

const managedAdapters = [
  codexMcpAdapter,
  claudeCodeMcpAdapter,
  geminiCliMcpAdapter,
  opencodeMcpAdapter
] as const;

const hasMaterialHostSyncDiff = (preview: McpHostSyncPreview): boolean =>
  preview.addedServerIds.length > 0 ||
  preview.removedServerIds.length > 0 ||
  (!preview.configExists && preview.nextManagedServerIds.length > 0);

export class McpHostSyncService {
  private readonly backupsDir: string;
  private readonly stateDir: string;

  constructor(
    private readonly options: {
      readonly dataDir: string;
      readonly homeDir?: string;
      readonly mcpEventRepository: McpEventRepository;
    }
  ) {
    this.backupsDir = resolve(options.dataDir, "mcp-host-sync/backups");
    this.stateDir = resolve(options.dataDir, "mcp-host-sync/state");
    mkdirSync(this.backupsDir, { recursive: true });
    mkdirSync(this.stateDir, { recursive: true });
  }

  listCapabilities(): HostMcpSyncCapability[] {
    const supportedAppCodes = new Set(managedAdapters.map((adapter) => adapter.appCode));

    return (["codex", "claude-code", "gemini-cli", "opencode", "openclaw"] as const).map((appCode) => {
      const adapter = managedAdapters.find((item) => item.appCode === appCode);
      if (adapter) {
        return {
          appCode,
          supportLevel: "managed",
          recommendedPath: "managed-host-sync",
          configPathHint: adapter.configPathHint,
          configFormat: adapter.configFormat,
          docsUrl: adapter.docsUrl,
          reason: "Stable MCP config sync is available for this host CLI"
        };
      }

      if (appCode === "openclaw") {
        return {
          appCode,
          supportLevel: "unsupported",
          recommendedPath: "external-bridge",
          configPathHint: null,
          configFormat: null,
          docsUrl: "https://github.com/openclaw/openclaw/blob/main/VISION.md#mcp-support",
          reason:
            "OpenClaw currently routes MCP through the external mcporter bridge instead of host-managed file sync"
        };
      }

      return {
        appCode,
        supportLevel: supportedAppCodes.has(appCode) ? "managed" : "planned",
        recommendedPath: supportedAppCodes.has(appCode)
          ? "managed-host-sync"
          : "wait-for-stable-config",
        configPathHint: null,
        configFormat: null,
        docsUrl: null,
        reason: "Stable host MCP sync is not available yet"
      };
    });
  }

  apply(appCode: AppCode, bindings: AppMcpBinding[], servers: McpServer[]): HostMcpSyncResult {
    const adapter = this.getManagedAdapter(appCode);
    const homeDir = this.options.homeDir ?? homedir();
    const configPath = adapter.resolveConfigPath(homeDir);
    const enabledServerIds = new Set(
      bindings.filter((item) => item.appCode === appCode && item.enabled).map((item) => item.serverId)
    );
    const activeServers = servers.filter((server) => server.enabled && enabledServerIds.has(server.id));
    const existingContent = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;
    const previousState = this.readState(appCode);
    const backupPath =
      previousState?.backupPath ??
      (existingContent === null ? null : this.createBackupFile(appCode, configPath, existingContent));
    const rollbackAction = previousState?.rollbackAction ?? (existingContent === null ? "delete" : "restore");
    const nextContent = adapter.buildManagedConfig(existingContent ?? "", activeServers);

    ensureParentDir(configPath);
    writeFileSync(configPath, nextContent, "utf-8");

    this.writeState({
      appCode,
      configPath,
      backupPath,
      rollbackAction,
      syncedServerIds: activeServers.map((server) => server.id),
      lastAppliedAt: nowIso()
    });

    this.options.mcpEventRepository.append({
      appCode,
      action: "host-apply",
      targetType: "host-sync",
      targetId: appCode,
      message: `Synced ${activeServers.length} MCP server(s) to ${appCode}`
    });

    return {
      appCode,
      action: "apply",
      configPath,
      backupPath,
      syncedServerIds: activeServers.map((server) => server.id),
      message: `MCP config synced for ${appCode}`
    };
  }

  rollback(appCode: AppCode): HostMcpSyncResult {
    const adapter = this.getManagedAdapter(appCode);
    const state = this.readState(appCode);

    if (state === null) {
      throw new Error(`No MCP host sync state found for app: ${appCode}`);
    }

    if (state.rollbackAction === "delete") {
      rmSync(state.configPath, { force: true });
    } else if (state.backupPath !== null && existsSync(state.backupPath)) {
      ensureParentDir(state.configPath);
      writeFileSync(state.configPath, readFileSync(state.backupPath, "utf-8"), "utf-8");
    } else {
      throw new Error(`Backup file not found for MCP rollback: ${state.backupPath ?? "none"}`);
    }

    this.removeState(appCode);

    this.options.mcpEventRepository.append({
      appCode,
      action: "host-rollback",
      targetType: "host-sync",
      targetId: appCode,
      message: `Rolled back MCP sync for ${appCode}`
    });

    return {
      appCode,
      action: "rollback",
      configPath: adapter.resolveConfigPath(this.options.homeDir ?? homedir()),
      backupPath: state.backupPath,
      syncedServerIds: state.syncedServerIds,
      message: `MCP config rolled back for ${appCode}`
    };
  }

  previewApply(appCode: AppCode, bindings: AppMcpBinding[], servers: McpServer[]): McpHostSyncPreview {
    const adapter = this.getManagedAdapter(appCode);
    const homeDir = this.options.homeDir ?? homedir();
    const configPath = adapter.resolveConfigPath(homeDir);
    const configExists = existsSync(configPath);
    const currentManagedServerIds = configExists ? adapter.readManagedServerIds(configPath) : [];
    const previousState = this.readState(appCode);
    const enabledServerIds = new Set(
      bindings.filter((item) => item.appCode === appCode && item.enabled).map((item) => item.serverId)
    );
    const nextManagedServerIds = servers
      .filter((server) => server.enabled && enabledServerIds.has(server.id))
      .map((server) => server.id);
    const currentSet = new Set(currentManagedServerIds);
    const nextSet = new Set(nextManagedServerIds);
    const addedServerIds = nextManagedServerIds.filter((item) => !currentSet.has(item));
    const removedServerIds = currentManagedServerIds.filter((item) => !nextSet.has(item));
    const unchangedServerIds = nextManagedServerIds.filter((item) => currentSet.has(item));
    const warnings: string[] = [];

    if (!configExists) {
      warnings.push(`Host MCP config will be created: ${configPath}`);
    }
    if (removedServerIds.length > 0) {
      warnings.push(
        `Managed MCP entries will be removed for ${appCode}: ${removedServerIds.join(", ")}`
      );
    }

    return {
      appCode,
      configPath,
      configExists,
      backupRequired: previousState?.backupPath !== null || configExists,
      rollbackAction: previousState?.rollbackAction ?? (configExists ? "restore" : "delete"),
      currentManagedServerIds,
      nextManagedServerIds,
      addedServerIds,
      removedServerIds,
      unchangedServerIds,
      warnings
    };
  }

  previewApplyAll(bindings: AppMcpBinding[], servers: McpServer[]): McpHostSyncBatchPreview {
    const items = managedAdapters
      .map((adapter) => this.previewApply(adapter.appCode, bindings, servers))
      .filter((item) => hasMaterialHostSyncDiff(item));

    return {
      totalApps: managedAdapters.length,
      syncableApps: items.length,
      items,
      warnings:
        items.length === 0
          ? ["No managed MCP host sync changes are pending across supported apps."]
          : []
    };
  }

  applyAll(bindings: AppMcpBinding[], servers: McpServer[]): McpHostSyncBatchResult {
    const preview = this.previewApplyAll(bindings, servers);
    const items = preview.items.map((item) => this.apply(item.appCode, bindings, servers));
    const appliedApps = items.map((item) => item.appCode);

    return {
      totalApps: managedAdapters.length,
      appliedApps,
      skippedApps: managedAdapters
        .map((adapter) => adapter.appCode)
        .filter((appCode) => !appliedApps.includes(appCode)),
      syncedServerIds: Array.from(
        new Set(items.flatMap((item) => item.syncedServerIds))
      ),
      items,
      message:
        items.length === 0
          ? "No managed MCP host sync changes were applied."
          : `Applied MCP host sync for ${items.length} app(s).`
    };
  }

  listSyncStates(): McpHostSyncState[] {
    return managedAdapters
      .map((adapter) => this.readState(adapter.appCode))
      .filter((item): item is HostMcpStateRecord => item !== null)
      .map((item) => ({
        appCode: item.appCode,
        configPath: item.configPath,
        backupPath: item.backupPath,
        syncedServerIds: item.syncedServerIds,
        lastAppliedAt: item.lastAppliedAt,
        configExists: existsSync(item.configPath)
      }));
  }

  private getManagedAdapter(appCode: AppCode): ManagedHostMcpAdapter {
    const adapter = managedAdapters.find((item) => item.appCode === appCode);
    if (adapter === undefined) {
      throw new Error(`Host MCP sync is not supported yet for app: ${appCode}`);
    }

    return adapter;
  }

  private createBackupFile(appCode: AppCode, configPath: string, content: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = resolve(this.backupsDir, `${appCode}-${timestamp}.backup`);
    writeFileSync(backupPath, content, "utf-8");
    return backupPath;
  }

  private statePath(appCode: AppCode): string {
    return resolve(this.stateDir, `${appCode}.json`);
  }

  private readState(appCode: AppCode): HostMcpStateRecord | null {
    const path = this.statePath(appCode);
    if (!existsSync(path)) {
      return null;
    }

    const parsed = readJsonObject(path);
    if (
      typeof parsed.appCode !== "string" ||
      typeof parsed.configPath !== "string" ||
      typeof parsed.rollbackAction !== "string" ||
      typeof parsed.lastAppliedAt !== "string" ||
      !Array.isArray(parsed.syncedServerIds)
    ) {
      return null;
    }

    return {
      appCode: parsed.appCode as AppCode,
      configPath: parsed.configPath,
      backupPath: typeof parsed.backupPath === "string" ? parsed.backupPath : null,
      rollbackAction: parsed.rollbackAction === "delete" ? "delete" : "restore",
      syncedServerIds: parsed.syncedServerIds.filter(
        (item): item is string => typeof item === "string"
      ),
      lastAppliedAt: parsed.lastAppliedAt
    };
  }

  private writeState(record: HostMcpStateRecord): void {
    ensureParentDir(this.statePath(record.appCode));
    writeFileSync(this.statePath(record.appCode), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  }

  private removeState(appCode: AppCode): void {
    rmSync(this.statePath(appCode), { force: true });
  }
}
