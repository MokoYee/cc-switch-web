import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  type AppCode,
  type AppMcpBinding,
  type AppMcpBindingUpsert,
  type ConfigImpactPreview,
  type McpAppRuntimeView,
  type McpGovernanceBatchPreview,
  type McpGovernanceBatchResult,
  type McpBindingSavePreview,
  type McpGovernanceRepairPlanItem,
  type McpGovernanceRepairPreview,
  type McpGovernanceRepairResult,
  type McpHostSyncState,
  type McpImportFieldDiff,
  mcpImportOptionsSchema,
  type McpImportOptions,
  type McpImportPreview,
  type McpImportPreviewItem,
  type McpRuntimeItem,
  type McpServer,
  type McpServerSavePreview,
  type McpServerUsage,
  type McpServerUpsert
} from "@cc-switch-web/shared";

import { AppMcpBindingRepository } from "./app-mcp-binding-repository.js";
import { McpEventRepository } from "./mcp-event-repository.js";
import { McpServerRepository } from "./mcp-server-repository.js";

const splitTomlArray = (raw: string): string[] => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return [];
  }

  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.startsWith('"') && item.endsWith('"'))
    .map((item) => item.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
};

const splitTomlInlineTable = (raw: string): Record<string, string> => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return {};
  }

  return Object.fromEntries(
    trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separatorIndex = item.indexOf("=");
        if (separatorIndex === -1) {
          return null;
        }

        const key = item.slice(0, separatorIndex).trim();
        const rawValue = item.slice(separatorIndex + 1).trim();
        if (!rawValue.startsWith('"') || !rawValue.endsWith('"')) {
          return null;
        }

        return [
          key,
          rawValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
        ] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null)
  );
};

const parseCodexMcpServers = (content: string): Array<Omit<McpServerUpsert, "enabled">> => {
  const sections = new Map<string, string[]>();
  let currentId: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const header = line.match(/^\[mcp_servers\.([^\]]+)\]$/);
    if (header?.[1]) {
      currentId = header[1].trim();
      sections.set(currentId, []);
      continue;
    }

    if (line.startsWith("[") && currentId !== null) {
      currentId = null;
    }

    if (currentId !== null) {
      sections.get(currentId)?.push(line);
    }
  }

  return Array.from(sections.entries())
    .map(([id, lines]) => {
      const body = lines.join("\n");
      const command = body.match(/^command\s*=\s*"([^"]*)"$/m)?.[1] ?? null;
      const url = body.match(/^url\s*=\s*"([^"]*)"$/m)?.[1] ?? null;
      const args = splitTomlArray(body.match(/^args\s*=\s*(\[[^\n]*\])$/m)?.[1] ?? "[]");
      const env = splitTomlInlineTable(body.match(/^env\s*=\s*(\{[^\n]*\})$/m)?.[1] ?? "{}");
      const headers = splitTomlInlineTable(
        body.match(/^headers\s*=\s*(\{[^\n]*\})$/m)?.[1] ?? "{}"
      );

      if (command === null && url === null) {
        return null;
      }

      return {
        id,
        name: id,
        transport: url !== null ? "http" : "stdio",
        command,
        args,
        url,
        env,
        headers
      } as const;
    })
    .filter((item): item is Omit<McpServerUpsert, "enabled"> => item !== null);
};

const parseClaudeMcpServers = (content: string): Array<Omit<McpServerUpsert, "enabled">> => {
  const parsed = JSON.parse(content) as {
    mcpServers?: Record<
      string,
      {
        type?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        headers?: Record<string, string>;
      }
    >;
  };

  const results: Array<Omit<McpServerUpsert, "enabled">> = [];

  for (const [id, server] of Object.entries(parsed.mcpServers ?? {})) {
      if (server.type === "http" && typeof server.url === "string") {
        results.push({
          id,
          name: id,
          transport: "http" as const,
          command: null,
          args: [],
          url: server.url,
          env: {},
          headers: server.headers ?? {}
        });
        continue;
      }

      if (typeof server.command === "string") {
        results.push({
          id,
          name: id,
          transport: "stdio" as const,
          command: server.command,
          args: Array.isArray(server.args) ? server.args.filter((item): item is string => typeof item === "string") : [],
          url: null,
          env: server.env ?? {},
          headers: {}
        });
      }
  }

  return results;
};

const parseGeminiMcpServers = (content: string): Array<Omit<McpServerUpsert, "enabled">> => {
  const parsed = JSON.parse(content) as {
    mcpServers?: Record<
      string,
      {
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        url?: string;
        httpUrl?: string;
        headers?: Record<string, string>;
      }
    >;
  };

  const results: Array<Omit<McpServerUpsert, "enabled">> = [];
  for (const [id, server] of Object.entries(parsed.mcpServers ?? {})) {
    if (typeof server.command === "string") {
      results.push({
        id,
        name: id,
        transport: "stdio",
        command: server.command,
        args: Array.isArray(server.args) ? server.args.filter((item): item is string => typeof item === "string") : [],
        url: null,
        env: server.env ?? {},
        headers: {}
      });
      continue;
    }

    const targetUrl =
      typeof server.httpUrl === "string" ? server.httpUrl : typeof server.url === "string" ? server.url : null;
    if (targetUrl) {
      results.push({
        id,
        name: id,
        transport: "http",
        command: null,
        args: [],
        url: targetUrl,
        env: {},
        headers: server.headers ?? {}
      });
    }
  }

  return results;
};

const parseOpenCodeMcpServers = (content: string): Array<Omit<McpServerUpsert, "enabled">> => {
  const parsed = JSON.parse(content) as {
    mcp?: Record<
      string,
      {
        type?: string;
        command?: string[];
        environment?: Record<string, string>;
        url?: string;
        headers?: Record<string, string>;
      }
    >;
  };

  const results: Array<Omit<McpServerUpsert, "enabled">> = [];
  for (const [id, server] of Object.entries(parsed.mcp ?? {})) {
    if (server.type === "local" && Array.isArray(server.command) && server.command.length > 0) {
      results.push({
        id,
        name: id,
        transport: "stdio",
        command: typeof server.command[0] === "string" ? server.command[0] : null,
        args: server.command.slice(1).filter((item): item is string => typeof item === "string"),
        url: null,
        env: server.environment ?? {},
        headers: {}
      });
      continue;
    }

    if (server.type === "remote" && typeof server.url === "string") {
      results.push({
        id,
        name: id,
        transport: "http",
        command: null,
        args: [],
        url: server.url,
        env: {},
        headers: server.headers ?? {}
      });
    }
  }

  return results;
};

const stringifyPreviewValue = (value: boolean | string | string[] | Record<string, string> | null): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
};

const buildFieldDiffs = (
  existingServer: ReturnType<McpServerRepository["list"]>[number] | undefined,
  server: Omit<McpServerUpsert, "enabled">
): McpImportFieldDiff[] => {
  const nextServer = {
    ...server,
    enabled: existingServer?.enabled ?? true
  };
  const diffCandidates = [
    {
      field: "transport",
      currentValue: existingServer?.transport ?? null,
      incomingValue: nextServer.transport
    },
    {
      field: "command",
      currentValue: existingServer?.command ?? null,
      incomingValue: nextServer.command
    },
    {
      field: "args",
      currentValue: existingServer?.args ?? null,
      incomingValue: nextServer.args
    },
    {
      field: "url",
      currentValue: existingServer?.url ?? null,
      incomingValue: nextServer.url
    },
    {
      field: "env",
      currentValue: existingServer?.env ?? null,
      incomingValue: nextServer.env
    },
    {
      field: "headers",
      currentValue: existingServer?.headers ?? null,
      incomingValue: nextServer.headers
    },
    {
      field: "enabled",
      currentValue: existingServer?.enabled ?? null,
      incomingValue: nextServer.enabled
    }
  ] as const;

  return diffCandidates
    .map((candidate) => ({
      field: candidate.field,
      currentValue: stringifyPreviewValue(candidate.currentValue),
      incomingValue: stringifyPreviewValue(candidate.incomingValue)
    }))
    .filter((candidate) => candidate.currentValue !== candidate.incomingValue);
};

const buildServerUpsertFieldDiffs = (
  existingServer: McpServer | undefined,
  server: McpServerUpsert
): McpServerSavePreview["changedFields"] => {
  if (existingServer === undefined) {
    return ["name", "transport", "command", "args", "url", "env", "headers", "enabled"];
  }

  const candidates = [
    ["name", stringifyPreviewValue(existingServer.name), stringifyPreviewValue(server.name)],
    ["transport", stringifyPreviewValue(existingServer.transport), stringifyPreviewValue(server.transport)],
    ["command", stringifyPreviewValue(existingServer.command), stringifyPreviewValue(server.command)],
    ["args", stringifyPreviewValue(existingServer.args), stringifyPreviewValue(server.args)],
    ["url", stringifyPreviewValue(existingServer.url), stringifyPreviewValue(server.url)],
    ["env", stringifyPreviewValue(existingServer.env), stringifyPreviewValue(server.env)],
    ["headers", stringifyPreviewValue(existingServer.headers), stringifyPreviewValue(server.headers)],
    ["enabled", stringifyPreviewValue(existingServer.enabled), stringifyPreviewValue(server.enabled)]
  ] as const;

  return candidates
    .filter((item) => item[1] !== item[2])
    .map((item) => item[0]);
};

const ALL_MCP_APPS: AppCode[] = ["codex", "claude-code", "gemini-cli", "opencode", "openclaw"];

type McpGovernanceRepairPlan = {
  readonly runtimeView: McpAppRuntimeView;
  readonly plannedActions: McpGovernanceRepairPlanItem[];
  readonly predictedRuntimeView: McpAppRuntimeView;
  readonly warnings: string[];
};

export interface McpImportResult {
  readonly appCode: AppCode;
  readonly configPath: string;
  readonly importedCount: number;
  readonly importedServerIds: string[];
}

export class McpService {
  constructor(
    private readonly mcpServerRepository: McpServerRepository,
    private readonly appMcpBindingRepository: AppMcpBindingRepository,
    private readonly mcpEventRepository: McpEventRepository,
    private readonly options: {
      readonly homeDir?: string;
      readonly listHostSyncStates?: () => McpHostSyncState[];
    } = {}
  ) {}

  importFromHost(appCode: AppCode, options?: Partial<McpImportOptions>): McpImportResult {
    const normalizedOptions = mcpImportOptionsSchema.parse(options ?? {});
    const preview = this.previewImportFromHost(appCode, normalizedOptions);
    const importedServers = this.readImportServers(appCode);
    const existingServers = new Map(this.mcpServerRepository.list().map((item) => [item.id, item]));
    const existingBindings = new Map<string, AppMcpBinding>(
      this.appMcpBindingRepository
        .listByAppCode(appCode)
        .map((item) => [`${item.appCode}:${item.serverId}`, item] as const)
    );
    const importedServerIds: string[] = [];

    for (const server of importedServers) {
      const existing = existingServers.get(server.id);
      const shouldPersistServer =
        existing === undefined || normalizedOptions.existingServerStrategy === "overwrite";
      const persisted = shouldPersistServer
        ? this.mcpServerRepository.upsert({
            ...server,
            name: existing?.name ?? server.name,
            enabled: existing?.enabled ?? true
          })
        : existing;
      if (persisted === undefined) {
        continue;
      }
      importedServerIds.push(persisted.id);

      const bindingKey = `${appCode}:${persisted.id}`;
      const binding = existingBindings.get(bindingKey);
      const shouldPersistBinding =
        binding !== undefined ||
        normalizedOptions.missingBindingStrategy === "create";
      if (shouldPersistBinding) {
        this.appMcpBindingRepository.upsert({
          id: binding?.id ?? `${appCode}-${persisted.id}`,
          appCode,
          serverId: persisted.id,
          enabled: binding?.enabled ?? true
        });
      }
    }

    this.mcpEventRepository.append({
      appCode,
      action: "import",
      targetType: "host-sync",
      targetId: appCode,
      message: `Imported ${importedServerIds.length} MCP server(s) from ${appCode} host config with ${normalizedOptions.existingServerStrategy}/${normalizedOptions.missingBindingStrategy} strategy`
    });

    return {
      appCode,
      configPath: preview.configPath,
      importedCount: importedServerIds.length,
      importedServerIds
    };
  }

  previewImportFromHost(appCode: AppCode, options?: Partial<McpImportOptions>): McpImportPreview {
    const normalizedOptions = mcpImportOptionsSchema.parse(options ?? {});
    const homeDir = this.options.homeDir ?? homedir();
    const configPath = this.resolveImportPath(appCode, homeDir);

    if (configPath === null) {
      throw new Error(`MCP import is not supported yet for app: ${appCode}`);
    }

    if (!existsSync(configPath)) {
      throw new Error(`Host MCP config not found: ${configPath}`);
    }

    const importedServers = this.readImportServers(appCode);
    const enabledBindings = new Set(
      this.appMcpBindingRepository
        .listByAppCode(appCode)
        .filter((item) => item.enabled)
        .map((item) => item.serverId)
    );
    const newServerIds: string[] = [];
    const existingServerIds: string[] = [];
    const bindingToCreateServerIds: string[] = [];
    const bindingAlreadyEnabledServerIds: string[] = [];
    const items: McpImportPreviewItem[] = [];

    for (const server of importedServers) {
      const existingServer = this.mcpServerRepository.list().find((item) => item.id === server.id);
      const isExisting = existingServer !== undefined;
      if (isExisting) {
        existingServerIds.push(server.id);
      } else {
        newServerIds.push(server.id);
      }

      const bindingStatus = enabledBindings.has(server.id) ? "already-enabled" : "create";
      if (bindingStatus === "already-enabled") {
        bindingAlreadyEnabledServerIds.push(server.id);
      } else {
        bindingToCreateServerIds.push(server.id);
      }

      const fieldDiffs = buildFieldDiffs(existingServer, server);
      const changedFields: McpImportPreviewItem["changedFields"] =
        fieldDiffs.map((item) => item.field);

      items.push({
        serverId: server.id,
        status:
          existingServer === undefined
            ? "new"
            : changedFields.length > 0
              ? normalizedOptions.existingServerStrategy === "overwrite"
                ? "update"
                : "skip-existing"
              : "binding-only",
        bindingStatus:
          bindingStatus === "create" && normalizedOptions.missingBindingStrategy === "skip"
            ? "already-enabled"
            : bindingStatus,
        changedFields,
        fieldDiffs
      });
    }

    return {
      appCode,
      configPath,
      totalDiscovered: importedServers.length,
      newServerIds,
      existingServerIds,
      bindingToCreateServerIds,
      bindingAlreadyEnabledServerIds,
      items
    };
  }

  listRuntimeViews(): McpAppRuntimeView[] {
    return ALL_MCP_APPS.map((appCode) => this.getRuntimeView(appCode));
  }

  getRuntimeView(appCode: AppCode): McpAppRuntimeView {
    const bindings = this.appMcpBindingRepository.listByAppCode(appCode);
    const servers = new Map(this.mcpServerRepository.list().map((item) => [item.id, item] as const));
    const hostSyncState = this.options.listHostSyncStates?.().find((item) => item.appCode === appCode) ?? null;
    return this.buildRuntimeView(appCode, bindings, servers, hostSyncState);
  }

  previewGovernanceRepair(appCode: AppCode): McpGovernanceRepairPreview {
    const plan = this.buildGovernanceRepairPlan(appCode);

    return {
      appCode,
      statusBefore: plan.runtimeView.status,
      issueCodesBefore: plan.runtimeView.issueCodes,
      plannedActions: plan.plannedActions,
      predictedStatusAfter: plan.predictedRuntimeView.status,
      predictedIssueCodesAfter: plan.predictedRuntimeView.issueCodes,
      requiresHostSync: plan.predictedRuntimeView.hostState.drifted,
      warnings: plan.warnings
    };
  }

  previewGovernanceRepairAll(): McpGovernanceBatchPreview {
    const items = ALL_MCP_APPS
      .map((appCode) => this.previewGovernanceRepair(appCode))
      .filter((item) => item.issueCodesBefore.length > 0 || item.requiresHostSync || item.plannedActions.length > 0);

    return {
      totalApps: items.length,
      repairableApps: items.filter((item) => item.plannedActions.length > 0).length,
      hostSyncRequiredApps: items.filter((item) => item.requiresHostSync).length,
      warnings: items.flatMap((item) => item.warnings),
      items
    };
  }

  applyGovernanceRepair(appCode: AppCode): McpGovernanceRepairResult {
    const plan = this.buildGovernanceRepairPlan(appCode);
    const changedBindingIds = new Set<string>();
    const changedServerIds = new Set<string>();
    const actionCodes = new Set<McpGovernanceRepairPlanItem["action"]>();
    const currentBindings = new Map(
      this.appMcpBindingRepository.listByAppCode(appCode).map((item) => [item.id, item] as const)
    );
    const currentServers = new Map(this.mcpServerRepository.list().map((item) => [item.id, item] as const));

    for (const action of plan.plannedActions) {
      actionCodes.add(action.action);

      if (action.action === "enable-referenced-servers") {
        for (const serverId of action.serverIds) {
          const server = currentServers.get(serverId);
          if (server === undefined || server.enabled) {
            continue;
          }
          this.mcpServerRepository.upsert({
            id: server.id,
            name: server.name,
            transport: server.transport,
            command: server.command,
            args: server.args,
            url: server.url,
            env: server.env,
            headers: server.headers,
            enabled: true
          });
          changedServerIds.add(serverId);
        }
        continue;
      }

      for (const bindingId of action.bindingIds) {
        const binding = currentBindings.get(bindingId);
        if (binding === undefined || !binding.enabled) {
          continue;
        }
        this.appMcpBindingRepository.upsert({
          id: binding.id,
          appCode: binding.appCode,
          serverId: binding.serverId,
          enabled: false
        });
        changedBindingIds.add(bindingId);
      }
    }

    const nextRuntime = this.getRuntimeView(appCode);
    this.mcpEventRepository.append({
      appCode,
      action: "governance-repair",
      targetType: "host-sync",
      targetId: appCode,
      message: `Applied MCP governance repair for ${appCode}: ${Array.from(actionCodes).join(", ") || "no-op"}`
    });

    return {
      appCode,
      executedActions: Array.from(actionCodes),
      changedBindingIds: Array.from(changedBindingIds).sort(),
      changedServerIds: Array.from(changedServerIds).sort(),
      statusAfter: nextRuntime.status,
      issueCodesAfter: nextRuntime.issueCodes,
      requiresHostSync: nextRuntime.hostState.drifted,
      message:
        actionCodes.size === 0
          ? `No MCP governance repair action was required for ${appCode}`
          : `Applied ${actionCodes.size} MCP governance repair action(s) for ${appCode}`
    };
  }

  applyGovernanceRepairAll(): McpGovernanceBatchResult {
    const previews = this.previewGovernanceRepairAll().items;
    const repairableAppCodes = previews
      .filter((item) => item.plannedActions.length > 0)
      .map((item) => item.appCode);
    const items = repairableAppCodes.map((appCode) => this.applyGovernanceRepair(appCode));

    return {
      totalApps: previews.length,
      repairedApps: items.length,
      changedBindingIds: Array.from(new Set(items.flatMap((item) => item.changedBindingIds))).sort(),
      changedServerIds: Array.from(new Set(items.flatMap((item) => item.changedServerIds))).sort(),
      hostSyncRequiredApps: Array.from(
        new Set(items.filter((item) => item.requiresHostSync).map((item) => item.appCode))
      ).sort(),
      items,
      message:
        items.length === 0
          ? "No MCP governance repair action was required across apps"
          : `Applied MCP governance repair across ${items.length} app(s)`
    };
  }

  private buildRuntimeView(
    appCode: AppCode,
    bindings: AppMcpBinding[],
    servers: ReadonlyMap<string, McpServer>,
    hostSyncState: McpHostSyncState | null
  ): McpAppRuntimeView {
    const enabledBindingIds = bindings.filter((item) => item.enabled).map((item) => item.id);
    const warnings: string[] = [];

    const items: McpRuntimeItem[] = bindings.map((binding) => {
      const server = servers.get(binding.serverId);
      const itemWarnings: string[] = [];
      const issueCodes: McpRuntimeItem["issueCodes"] = [];

      if (binding.enabled && server === undefined) {
        itemWarnings.push(`MCP server not found: ${binding.serverId}`);
        issueCodes.push("missing-server");
      } else if (server !== undefined && !server.enabled && binding.enabled) {
        itemWarnings.push(`MCP server is disabled: ${binding.serverId}`);
        issueCodes.push("server-disabled");
      }

      if (binding.enabled && enabledBindingIds.length > 1) {
        itemWarnings.push(`App ${appCode} has multiple enabled MCP bindings`);
        issueCodes.push("duplicate-binding");
      }

      if (server?.transport === "stdio" && binding.enabled && (server.command ?? "").trim().length === 0) {
        itemWarnings.push(`MCP stdio server is missing command: ${binding.serverId}`);
        issueCodes.push("missing-command");
      }

      if (server?.transport === "http" && binding.enabled && (server.url ?? "").trim().length === 0) {
        itemWarnings.push(`MCP HTTP server is missing URL: ${binding.serverId}`);
        issueCodes.push("missing-url");
      }

      const status: McpRuntimeItem["status"] = issueCodes.some((item) => item === "missing-server" || item === "missing-command" || item === "missing-url")
        ? "error"
        : issueCodes.length > 0
          ? "warning"
          : "healthy";

      return {
        bindingId: binding.id,
        appCode,
        serverId: binding.serverId,
        serverName: server?.name ?? null,
        transport: server?.transport ?? null,
        command: server?.command ?? null,
        url: server?.url ?? null,
        bindingEnabled: binding.enabled,
        serverEnabled: server?.enabled ?? false,
        effectiveEnabled: binding.enabled && (server?.enabled ?? false),
        status,
        issueCodes,
        managedOnHost: hostSyncState?.syncedServerIds.includes(binding.serverId) ?? false,
        warnings: itemWarnings
      };
    });

    for (const item of items) {
      warnings.push(...item.warnings);
    }

    const nextManagedServerIds = items
      .filter((item) => item.effectiveEnabled)
      .map((item) => item.serverId)
      .sort();
    const currentManagedServerIds = [...(hostSyncState?.syncedServerIds ?? [])].sort();
    const hostDrifted =
      hostSyncState !== null &&
      (nextManagedServerIds.length !== currentManagedServerIds.length ||
        nextManagedServerIds.some((item, index) => item !== currentManagedServerIds[index]));
    if (hostDrifted) {
      warnings.push(`Host MCP sync is drifted for ${appCode}`);
    }
    const issueCodes: McpAppRuntimeView["issueCodes"] = Array.from(
      new Set([
        ...items.flatMap((item) => item.issueCodes),
        ...(hostDrifted ? (["host-drift"] as const) : [])
      ])
    );
    const status: McpAppRuntimeView["status"] = issueCodes.some((item) =>
      item === "missing-server" ||
      item === "missing-command" ||
      item === "missing-url"
    )
      ? "error"
      : issueCodes.length > 0
        ? "warning"
        : "healthy";

    return {
      appCode,
      totalBindings: bindings.length,
      enabledBindings: bindings.filter((item) => item.enabled).length,
      enabledServers: items.filter((item) => item.effectiveEnabled).length,
      status,
      issueCodes,
      hostState: {
        synced: hostSyncState !== null,
        drifted: hostDrifted,
        configPath: hostSyncState?.configPath ?? null,
        lastAppliedAt: hostSyncState?.lastAppliedAt ?? null,
        syncedServerIds: hostSyncState?.syncedServerIds ?? []
      },
      items,
      warnings
    };
  }

  private buildGovernanceRepairPlan(appCode: AppCode): McpGovernanceRepairPlan {
    const bindings = this.appMcpBindingRepository.listByAppCode(appCode);
    const servers = new Map(this.mcpServerRepository.list().map((item) => [item.id, item] as const));
    const hostSyncState = this.options.listHostSyncStates?.().find((item) => item.appCode === appCode) ?? null;
    const runtimeView = this.buildRuntimeView(appCode, bindings, servers, hostSyncState);
    const warnings: string[] = [];
    const plannedActions: McpGovernanceRepairPlanItem[] = [];
    const simulatedBindings = new Map(bindings.map((item) => [item.id, { ...item }]));
    const simulatedServers = new Map(
      Array.from(servers.entries()).map(([serverId, server]) => [serverId, { ...server }])
    );

    const duplicateBindingIds = bindings
      .filter((item) => item.enabled)
      .sort((left, right) => {
        const leftServer = simulatedServers.get(left.serverId);
        const rightServer = simulatedServers.get(right.serverId);
        const scoreServer = (server: McpServer | undefined): number => {
          if (server === undefined) {
            return 3;
          }
          if (server.transport === "stdio" && (server.command ?? "").trim().length === 0) {
            return 2;
          }
          if (server.transport === "http" && (server.url ?? "").trim().length === 0) {
            return 2;
          }
          if (!server.enabled) {
            return 1;
          }
          return 0;
        };
        const scoreDiff = scoreServer(leftServer) - scoreServer(rightServer);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return left.id.localeCompare(right.id);
      })
      .slice(1)
      .map((item) => item.id);
    if (duplicateBindingIds.length > 0) {
      plannedActions.push({
        action: "disable-duplicate-bindings",
        riskLevel: "medium",
        issueCodes: ["duplicate-binding"],
        bindingIds: duplicateBindingIds,
        serverIds: Array.from(
          new Set(
            duplicateBindingIds
              .map((bindingId) => simulatedBindings.get(bindingId)?.serverId ?? null)
              .filter((item): item is string => item !== null)
          )
        ).sort()
      });
      for (const bindingId of duplicateBindingIds) {
        const binding = simulatedBindings.get(bindingId);
        if (binding) {
          binding.enabled = false;
        }
      }
    }

    const invalidBindingIds = bindings
      .filter((binding) => {
        if (!binding.enabled) {
          return false;
        }
        const server = simulatedServers.get(binding.serverId);
        if (server === undefined) {
          return true;
        }
        if (server.transport === "stdio" && (server.command ?? "").trim().length === 0) {
          return true;
        }
        return server.transport === "http" && (server.url ?? "").trim().length === 0;
      })
      .map((binding) => binding.id)
      .sort();
    if (invalidBindingIds.length > 0) {
      const invalidIssueCodes = Array.from(
        new Set(
          invalidBindingIds.flatMap((bindingId) => {
            const binding = simulatedBindings.get(bindingId);
            if (binding === undefined) {
              return [];
            }
            const server = simulatedServers.get(binding.serverId);
            if (server === undefined) {
              return ["missing-server"] as const;
            }
            if (server.transport === "stdio" && (server.command ?? "").trim().length === 0) {
              return ["missing-command"] as const;
            }
            if (server.transport === "http" && (server.url ?? "").trim().length === 0) {
              return ["missing-url"] as const;
            }
            return [];
          })
        )
      );
      plannedActions.push({
        action: "disable-invalid-bindings",
        riskLevel: "high",
        issueCodes: invalidIssueCodes,
        bindingIds: invalidBindingIds,
        serverIds: Array.from(
          new Set(
            invalidBindingIds
              .map((bindingId) => simulatedBindings.get(bindingId)?.serverId ?? null)
              .filter((item): item is string => item !== null)
          )
        ).sort()
      });
      for (const bindingId of invalidBindingIds) {
        const binding = simulatedBindings.get(bindingId);
        if (binding) {
          binding.enabled = false;
        }
      }
      warnings.push(
        `Some invalid MCP bindings for ${appCode} will be disabled until their target servers are repaired`
      );
    }

    const referencedServerIdsToEnable = Array.from(
      new Set(
        Array.from(simulatedBindings.values())
          .filter((binding) => binding.enabled)
          .map((binding) => simulatedServers.get(binding.serverId))
          .filter((server): server is McpServer => server !== undefined && !server.enabled)
          .map((server) => server.id)
      )
    ).sort();
    if (referencedServerIdsToEnable.length > 0) {
      plannedActions.push({
        action: "enable-referenced-servers",
        riskLevel: "medium",
        issueCodes: ["server-disabled"],
        bindingIds: bindings
          .filter((binding) => referencedServerIdsToEnable.includes(binding.serverId) && binding.enabled)
          .map((binding) => binding.id)
          .sort(),
        serverIds: referencedServerIdsToEnable
      });
      for (const serverId of referencedServerIdsToEnable) {
        const server = simulatedServers.get(serverId);
        if (server) {
          server.enabled = true;
        }
      }
    }

    const predictedRuntimeView = this.buildRuntimeView(
      appCode,
      Array.from(simulatedBindings.values()),
      simulatedServers,
      hostSyncState
    );
    if (predictedRuntimeView.hostState.drifted) {
      warnings.push(`Host MCP sync still needs to be applied for ${appCode} after config repair`);
    }

    return {
      runtimeView,
      plannedActions,
      predictedRuntimeView,
      warnings
    };
  }

  previewServerUpsert(input: McpServerUpsert): McpServerSavePreview {
    const existingServer = this.mcpServerRepository.list().find((item) => item.id === input.id);
    const usage = this.getServerUsage(input.id);
    const runtimeViews = this.listRuntimeViews().filter((item) => usage.boundApps.includes(item.appCode));
    const runtimeIssueCodes = Array.from(
      new Set(runtimeViews.flatMap((item) => item.issueCodes))
    );
    const changedFields = buildServerUpsertFieldDiffs(existingServer, input);
    const warnings: string[] = [];

    if (!input.enabled && usage.enabledApps.length > 0) {
      warnings.push(
        `Disabling MCP server ${input.id} will affect enabled bindings for: ${usage.enabledApps.join(", ")}`
      );
    }
    if (usage.hostManagedApps.length > 0) {
      warnings.push(
        `MCP server ${input.id} is currently synced to host configs for: ${usage.hostManagedApps.join(", ")}`
      );
    }
    if (usage.importedFromApps.length > 0) {
      warnings.push(
        `MCP server ${input.id} also exists in host import sources for: ${usage.importedFromApps.join(", ")}`
      );
    }

    return {
      serverId: input.id,
      exists: existingServer !== undefined,
      changedFields,
      usage,
      runtimeAppCodes: runtimeViews.map((item) => item.appCode),
      runtimeIssueCodes,
      affectedBindingIds: usage.bindingIds,
      warnings,
      impact: this.buildServerImpact(input.id, usage, warnings)
    };
  }

  previewBindingUpsert(input: AppMcpBindingUpsert): McpBindingSavePreview {
    const existingBinding = this.appMcpBindingRepository.list().find((item) => item.id === input.id);
    const siblingBindings = this.appMcpBindingRepository
      .listByAppCode(input.appCode)
      .filter((item) => item.id !== input.id);
    const runtimeView = this.getRuntimeView(input.appCode);
    const warnings: string[] = [];
    const serverExists = this.mcpServerRepository.exists(input.serverId);

    if (!serverExists) {
      warnings.push(`MCP server not found for binding target: ${input.serverId}`);
    }
    if (siblingBindings.some((item) => item.serverId === input.serverId)) {
      warnings.push(`App ${input.appCode} already has another binding for server ${input.serverId}`);
    }

    return {
      bindingId: input.id,
      appCode: input.appCode,
      serverId: input.serverId,
      exists: existingBinding !== undefined,
      serverExists,
      siblingBindingIds: siblingBindings.map((item) => item.id),
      siblingServerIds: siblingBindings.map((item) => item.serverId),
      runtimeStatus: runtimeView.status,
      runtimeIssueCodes: runtimeView.issueCodes,
      hostDrifted: runtimeView.hostState.drifted,
      warnings,
      impact: this.buildBindingImpact(input.appCode, serverExists, siblingBindings.map((item) => item.serverId), warnings)
    };
  }

  private buildServerImpact(
    serverId: string,
    usage: McpServerUsage,
    warnings: string[]
  ): ConfigImpactPreview {
    const affectedAppCodes = Array.from(new Set([...usage.boundApps, ...usage.hostManagedApps])).sort();
    const summary: string[] = [];

    if (usage.boundApps.length > 0) {
      summary.push(`Bindings reference this MCP server from: ${usage.boundApps.join(", ")}`);
    }
    if (usage.hostManagedApps.length > 0) {
      summary.push(`Host-synced MCP configs will drift for: ${usage.hostManagedApps.join(", ")}`);
    }
    if (summary.length === 0) {
      summary.push(`MCP server ${serverId} is not referenced by active bindings yet.`);
    }

    return {
      summary,
      affectedAppCodes,
      requiresSnapshot: true,
      requiresProxyReload: false,
      touchesRouting: false,
      touchesHostManagedMcp: usage.hostManagedApps.length > 0,
      riskLevel: warnings.length > 0 || usage.hostManagedApps.length > 0 ? "medium" : "low"
    };
  }

  private buildBindingImpact(
    appCode: AppCode,
    serverExists: boolean,
    siblingServerIds: string[],
    warnings: string[]
  ): ConfigImpactPreview {
    const summary = [
      `MCP binding set for ${appCode} will be updated on save.`,
      serverExists
        ? `Target server is available for ${appCode}.`
        : `Target server is missing and will leave ${appCode} with an invalid MCP binding.`
    ];

    if (siblingServerIds.length > 0) {
      summary.push(`Sibling MCP bindings already exist for servers: ${siblingServerIds.join(", ")}`);
    }

    return {
      summary,
      affectedAppCodes: [appCode],
      requiresSnapshot: true,
      requiresProxyReload: false,
      touchesRouting: false,
      touchesHostManagedMcp: false,
      riskLevel: !serverExists || warnings.length > 0 ? "high" : "medium"
    };
  }

  getServerUsage(serverId: string): McpServerUsage {
    const server = this.mcpServerRepository.list().find((item) => item.id === serverId);
    const bindings = this.appMcpBindingRepository.list().filter((item) => item.serverId === serverId);
    const hostManagedApps = (this.options.listHostSyncStates?.() ?? [])
      .filter((item) => item.syncedServerIds.includes(serverId))
      .map((item) => item.appCode);
    const importedFromApps = ALL_MCP_APPS.filter((appCode) => {
      try {
        return this.readImportServers(appCode).some((item) => item.id === serverId);
      } catch {
        return false;
      }
    });

    return {
      serverId,
      serverName: server?.name ?? null,
      exists: server !== undefined,
      bindingIds: bindings.map((item) => item.id),
      boundApps: Array.from(new Set(bindings.map((item) => item.appCode))),
      enabledApps: Array.from(
        new Set(bindings.filter((item) => item.enabled).map((item) => item.appCode))
      ),
      hostManagedApps,
      importedFromApps
    };
  }

  private readImportServers(appCode: AppCode): Array<Omit<McpServerUpsert, "enabled">> {
    const configPath = this.resolveImportPath(appCode, this.options.homeDir ?? homedir());
    if (configPath === null || !existsSync(configPath)) {
      throw new Error(`Host MCP config not found: ${configPath ?? "unsupported"}`);
    }

    const content = readFileSync(configPath, "utf-8");
    return appCode === "codex"
      ? parseCodexMcpServers(content)
      : appCode === "claude-code"
        ? parseClaudeMcpServers(content)
        : appCode === "gemini-cli"
          ? parseGeminiMcpServers(content)
          : parseOpenCodeMcpServers(content);
  }

  private resolveImportPath(appCode: AppCode, homeDir: string): string | null {
    if (appCode === "codex") {
      return resolve(homeDir, ".codex/config.toml");
    }

    if (appCode === "claude-code") {
      return resolve(homeDir, ".claude.json");
    }

    if (appCode === "gemini-cli") {
      return resolve(homeDir, ".gemini/settings.json");
    }

    if (appCode === "opencode") {
      return resolve(homeDir, ".config/opencode/opencode.json");
    }

    return null;
  }
}
