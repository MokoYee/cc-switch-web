import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";

import {
  nowIso,
  type AppCode,
  type HostCliApplyPreview,
  type HostCliCapability,
  type HostCliDiscovery,
  type HostCliMutationResult,
  type HostIntegrationEvent
} from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";
import {
  createHostCliAdapters,
  isManagedHostCliAdapter,
  toHostCliCapability,
  type HostCliAdapter
} from "./adapters.js";
import { scanHostCliEnvConflicts } from "./env-conflicts.js";

interface HostIntegrationStateRecord {
  readonly appCode: AppCode;
  readonly configPath: string;
  readonly backupPath: string | null;
  readonly rollbackAction: "restore" | "delete";
  readonly supplementalFiles: Array<{
    readonly path: string;
    readonly backupPath: string | null;
    readonly rollbackAction: "restore" | "delete";
  }>;
  readonly lastAppliedAt: string;
}

const resolveExecutablePath = (binaryName: string): string | null => {
  const pathValue = process.env.PATH ?? "";
  const pathEntries = pathValue.split(":").filter(Boolean);

  for (const directory of pathEntries) {
    const candidate = `${directory}/${binaryName}`;

    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // WARNING: 第一阶段仍保持轻量 PATH 探测，不做 shell alias/函数解析。
    }
  }

  return null;
};

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true });
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

const writeJsonObject = (filePath: string, value: Record<string, unknown>): void => {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
};

export class HostDiscoveryService {
  private readonly adapters: HostCliAdapter[];
  private readonly backupsDir: string;
  private readonly stateDir: string;

  constructor(
    private readonly options: {
      readonly daemonHost: string;
      readonly daemonPort: number;
      readonly dataDir: string;
      readonly database: SqliteDatabase;
      readonly homeDir?: string;
      readonly processEnv?: NodeJS.ProcessEnv;
    }
  ) {
    this.backupsDir = resolve(options.dataDir, "host-integrations/backups");
    this.stateDir = resolve(options.dataDir, "host-integrations/state");
    mkdirSync(this.backupsDir, { recursive: true });
    mkdirSync(this.stateDir, { recursive: true });
    this.adapters = createHostCliAdapters();
  }

  scan(): HostCliDiscovery[] {
    const home = this.options.homeDir ?? homedir();

    return this.adapters.map((adapter) => {
      const executablePath = resolveExecutablePath(adapter.binaryName);
      const configPath = adapter.resolveConfigPath(home);
      const integrationState = this.detectIntegrationState(adapter, configPath);
      const state = this.readState(adapter.appCode);
      const envConflicts = scanHostCliEnvConflicts({
        appCode: adapter.appCode,
        homeDir: home,
        ...(this.options.processEnv !== undefined ? { processEnv: this.options.processEnv } : {})
      });
      const currentTarget =
        configPath !== null && existsSync(configPath) && adapter.getCurrentTarget !== undefined
          ? this.safeRead(() => adapter.getCurrentTarget?.(configPath) ?? null)
          : null;
      const desiredTarget =
        isManagedHostCliAdapter(adapter)
          ? adapter.buildManagedTarget(this.buildProxyBaseUrl(adapter.appCode))
          : null;

      return {
        appCode: adapter.appCode,
        discovered: executablePath !== null,
        executablePath,
        configPath,
        configLocationHint: adapter.configLocationHint,
        status: executablePath !== null ? "discovered" : "missing",
        configFormat: adapter.configFormat,
        takeoverSupported: isManagedHostCliAdapter(adapter),
        supportLevel: adapter.supportLevel,
        takeoverMethod: adapter.takeoverMethod,
        supportReasonCode: adapter.supportReasonCode,
        docsUrl: adapter.docsUrl,
        integrationState,
        currentTarget,
        desiredTarget,
        managedTarget:
          isManagedHostCliAdapter(adapter) &&
          integrationState === "managed" &&
          configPath !== null &&
          existsSync(configPath)
            ? this.safeRead(() => adapter.getManagedTarget(configPath))
            : null,
        managedFeatures:
          isManagedHostCliAdapter(adapter) &&
          configPath !== null &&
          existsSync(configPath) &&
          adapter.getManagedFeatures !== undefined
            ? (this.safeRead(() =>
                adapter.getManagedFeatures?.(configPath, this.buildProxyBaseUrl(adapter.appCode)) ?? []
              ) ?? []) as HostCliDiscovery["managedFeatures"]
            : [],
        envConflicts,
        backupAvailable:
          state !== null &&
          (
            state.backupPath !== null ||
            state.rollbackAction === "delete" ||
            state.supplementalFiles.some(
              (item) => item.backupPath !== null || item.rollbackAction === "delete"
            )
          ),
        lastAppliedAt: state?.lastAppliedAt ?? null
      };
    });
  }

  listCapabilities(): HostCliCapability[] {
    return this.adapters.map(toHostCliCapability);
  }

  listRecentEvents(limit = 20): HostIntegrationEvent[] {
    const rows = this.options.database
      .prepare(`
        SELECT id, kind, app_code, action, config_path, backup_path, integration_state, message, created_at
        FROM host_integration_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        kind: HostIntegrationEvent["kind"];
        app_code: AppCode;
        action: HostIntegrationEvent["action"];
        config_path: string;
        backup_path: string | null;
        integration_state: HostIntegrationEvent["integrationState"];
        message: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind === "prompt-file" ? "prompt-file" : "proxy-config",
      appCode: row.app_code,
      action: row.action,
      configPath: row.config_path,
      backupPath: row.backup_path,
      integrationState: row.integration_state,
      message: row.message,
      createdAt: row.created_at
    }));
  }

  applyManagedConfig(appCode: AppCode): HostCliMutationResult {
    const adapter = this.getManagedAdapter(appCode);
    const home = this.options.homeDir ?? homedir();
    const configPath = adapter.resolveConfigPath(home);

    if (configPath === null) {
      throw new Error(`Config path is not defined for app: ${appCode}`);
    }

    const existingContent = existsSync(configPath) ? readFileSync(configPath, "utf-8") : null;
    const backupPath =
      existingContent === null ? null : this.createBackupFile(appCode, configPath, existingContent);
    const proxyBaseUrl = this.buildProxyBaseUrl(appCode);
    const nextContent = adapter.buildManagedConfig(existingContent ?? "", proxyBaseUrl);
    const supplementalFiles =
      adapter.listManagedSupplementalFiles?.(home, proxyBaseUrl).map((item) => {
        const currentContent = existsSync(item.path) ? readFileSync(item.path, "utf-8") : null;
        const backupFilePath =
          currentContent === null ? null : this.createBackupFile(appCode, item.path, currentContent);
        ensureParentDir(item.path);
        writeFileSync(item.path, item.buildManagedContent(currentContent ?? ""), "utf-8");

        return {
          path: item.path,
          backupPath: backupFilePath,
          rollbackAction: currentContent === null ? "delete" : "restore"
        } as const;
      }) ?? [];

    ensureParentDir(configPath);
    writeFileSync(configPath, nextContent, "utf-8");

    const appliedAt = nowIso();
    this.writeState({
      appCode,
      configPath,
      backupPath,
      rollbackAction: existingContent === null ? "delete" : "restore",
      supplementalFiles,
      lastAppliedAt: appliedAt
    });

    const result: HostCliMutationResult = {
      appCode,
      action: "apply",
      configPath,
      backupPath,
      integrationState: "managed",
      message: this.buildMutationMessage(appCode, "apply", supplementalFiles)
    };
    this.appendEvent(result);
    return result;
  }

  previewApplyManagedConfig(appCode: AppCode): HostCliApplyPreview {
    const adapter = this.getManagedAdapter(appCode);
    const home = this.options.homeDir ?? homedir();
    const configPath = adapter.resolveConfigPath(home);

    if (configPath === null) {
      throw new Error(`Config path is not defined for app: ${appCode}`);
    }

    const proxyBaseUrl = this.buildProxyBaseUrl(appCode);
    const envConflicts = scanHostCliEnvConflicts({
      appCode,
      homeDir: home,
      ...(this.options.processEnv !== undefined ? { processEnv: this.options.processEnv } : {})
    });
    const configExists = existsSync(configPath);
    const supplementalFiles =
      adapter.listManagedSupplementalFiles?.(home, proxyBaseUrl).map((item) => ({
        path: item.path,
        exists: existsSync(item.path),
        backupRequired: existsSync(item.path),
        changeKind: existsSync(item.path) ? "update" : "create",
        rollbackAction: existsSync(item.path) ? "restore" : "delete"
      })) ?? [];

    const existingManagedFeatures =
      configExists && adapter.getManagedFeatures !== undefined
        ? adapter
            .getManagedFeatures(configPath, proxyBaseUrl)
            .filter(
              (item): item is "claude-onboarding-bypassed" => item === "claude-onboarding-bypassed"
            )
        : [];
    const managedFeaturesToEnable = supplementalFiles.some((item) => item.path.endsWith("/.claude.json"))
      ? (Array.from(
          new Set([
            ...existingManagedFeatures,
            "claude-onboarding-bypassed"
          ])
        ) as Array<"claude-onboarding-bypassed">)
      : existingManagedFeatures;

    const touchedFiles = [
      {
        path: configPath,
        exists: configExists,
        backupRequired: configExists,
        changeKind: (configExists ? "update" : "create") as "update" | "create"
      },
      ...supplementalFiles.map((item) => ({
        path: item.path,
        exists: item.exists,
        backupRequired: item.backupRequired,
        changeKind: item.changeKind as "update" | "create"
      }))
    ];
    const rollbackPlan = [
      {
        path: configPath,
        action: (configExists ? "restore" : "delete") as "restore" | "delete"
      },
      ...supplementalFiles.map((item) => ({
        path: item.path,
        action: item.rollbackAction as "restore" | "delete"
      }))
    ];
    const backupCount = touchedFiles.filter((item) => item.backupRequired).length;
    const existingFileCount = touchedFiles.filter((item) => item.exists).length;
    const riskLevel: HostCliApplyPreview["riskLevel"] =
      envConflicts.length > 0
        ? "high"
        : configExists && supplementalFiles.some((item) => item.exists)
        ? "high"
        : existingFileCount > 0 || managedFeaturesToEnable.length > 0
          ? "medium"
          : "low";
    const summary = [
      `Takeover will route ${appCode} to ${adapter.buildManagedTarget(proxyBaseUrl)}.`,
      `${touchedFiles.length} file(s) will be touched; ${backupCount} existing file(s) require backup before apply.`,
      existingFileCount > 0
        ? "Existing host configuration will be preserved through rollback backups."
        : "No existing managed file was detected; rollback will remove newly created files."
    ];
    if (envConflicts.length > 0) {
      summary.push(
        `Detected ${envConflicts.length} environment override(s) that may continue to steer ${appCode} outside the managed proxy path.`
      );
    }
    const validationChecklist = [
      `Confirm ${appCode} resolves to ${adapter.buildManagedTarget(proxyBaseUrl)} after apply.`,
      "Check host-integration audit to verify the apply event was recorded.",
      backupCount > 0
        ? "Ensure backup-required files can be restored before applying takeover."
        : "Ensure creating fresh managed files matches the current host state expectation."
    ];
    if (envConflicts.length > 0) {
      validationChecklist.push(
        "Review every detected environment override and confirm shell or environment-file sources will not keep overriding the managed target."
      );
    }
    const runbook = [
      "Review touched files, backup coverage, and rollback actions before applying takeover.",
      "Apply takeover only after the preview aligns with the current host intent.",
      "After apply, validate runtime status and request results before treating takeover as complete."
    ];
    if (envConflicts.length > 0) {
      runbook.splice(
        1,
        0,
        "Clean up or intentionally retain detected environment overrides before applying takeover so host config and shell startup do not diverge."
      );
    }

    if (managedFeaturesToEnable.includes("claude-onboarding-bypassed")) {
      summary.push("Claude onboarding bypass will be enabled as part of the managed takeover.");
      validationChecklist.push("Verify Claude Code no longer prompts for the first-run onboarding confirmation.");
      runbook.push("Open Claude Code once after apply and confirm it reaches the local gateway without onboarding prompts.");
    }

    const warnings: string[] = [];
    if (configExists) {
      warnings.push(`Existing config at ${configPath} will be backed up before apply.`);
    }
    if (supplementalFiles.some((item) => item.path.endsWith("/.claude.json"))) {
      warnings.push("Claude onboarding state will be managed through ~/.claude.json.");
    }
    if (envConflicts.length > 0) {
      warnings.push(
        `${envConflicts.length} environment override(s) were detected for ${appCode}; unmanaged shell or environment files may still bypass the managed proxy target.`
      );
    }

    return {
      appCode,
      configPath,
      configExists,
      backupRequired: configExists,
      riskLevel,
      desiredTarget: adapter.buildManagedTarget(proxyBaseUrl),
      summary,
      managedFeaturesToEnable,
      touchedFiles,
      rollbackPlan,
      validationChecklist,
      runbook,
      envConflicts,
      warnings
    };
  }

  rollbackManagedConfig(appCode: AppCode): HostCliMutationResult {
    const adapter = this.getManagedAdapter(appCode);
    const state = this.readState(appCode);
    const configPath = adapter.resolveConfigPath(this.options.homeDir ?? homedir());

    if (state === null) {
      throw new Error(`No host takeover state found for app: ${appCode}`);
    }

    if (state.rollbackAction === "delete") {
      rmSync(state.configPath, { force: true });
    } else if (state.backupPath !== null && existsSync(state.backupPath)) {
      const originalContent = readFileSync(state.backupPath, "utf-8");
      ensureParentDir(state.configPath);
      writeFileSync(state.configPath, originalContent, "utf-8");
    } else {
      throw new Error(`Backup file not found for rollback: ${state.backupPath ?? "none"}`);
    }

    for (const item of state.supplementalFiles) {
      if (item.rollbackAction === "delete") {
        rmSync(item.path, { force: true });
        continue;
      }

      if (item.backupPath !== null && existsSync(item.backupPath)) {
        const originalContent = readFileSync(item.backupPath, "utf-8");
        ensureParentDir(item.path);
        writeFileSync(item.path, originalContent, "utf-8");
        continue;
      }

      throw new Error(`Backup file not found for rollback: ${item.backupPath ?? "none"}`);
    }

    this.removeState(appCode);

    const result: HostCliMutationResult = {
      appCode,
      action: "rollback",
      configPath: configPath ?? state.configPath,
      backupPath: state.backupPath,
      integrationState: "unmanaged",
      message: this.buildMutationMessage(appCode, "rollback", state.supplementalFiles)
    };
    this.appendEvent(result);
    return result;
  }

  private getManagedAdapter(appCode: AppCode) {
    const adapter = this.adapters.find((item) => item.appCode === appCode);

    if (adapter === undefined) {
      throw new Error(`Unknown app code: ${appCode}`);
    }

    if (!isManagedHostCliAdapter(adapter)) {
      throw new Error(`Host takeover is not supported yet for app: ${appCode}`);
    }

    return adapter;
  }

  private buildProxyBaseUrl(appCode: AppCode): string {
    return `http://${this.options.daemonHost}:${this.options.daemonPort}/proxy/${appCode}`;
  }

  private buildMutationMessage(
    appCode: AppCode,
    action: "apply" | "rollback",
    supplementalFiles: readonly {
      readonly path: string;
    }[]
  ): string {
    if (
      appCode === "claude-code" &&
      supplementalFiles.some((item) => item.path.endsWith("/.claude.json"))
    ) {
      return action === "apply"
        ? "Managed config applied for claude-code; Claude onboarding bypass enabled"
        : "Managed config rolled back for claude-code; Claude onboarding bypass restored";
    }

    return action === "apply"
      ? `Managed config applied for ${appCode}`
      : `Managed config rolled back for ${appCode}`;
  }

  private detectIntegrationState(
    adapter: HostCliAdapter,
    configPath: string | null
  ): HostCliDiscovery["integrationState"] {
    if (!isManagedHostCliAdapter(adapter)) {
      return adapter.supportLevel === "inspect-only" ? "unsupported" : "unsupported";
    }

    if (configPath === null || !existsSync(configPath)) {
      return "unmanaged";
    }

    const managed = this.safeRead(() =>
      adapter.isManaged(configPath, this.buildProxyBaseUrl(adapter.appCode))
    );
    return managed === true ? "managed" : "unmanaged";
  }

  private createBackupFile(appCode: AppCode, configPath: string, content: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = extname(configPath) || ".bak";
    const fileLabel = basename(configPath, extension).replace(/[^a-zA-Z0-9_-]+/g, "-") || "config";
    const backupPath = resolve(
      this.backupsDir,
      `${appCode}-${fileLabel}-${timestamp}${extension}`
    );
    writeFileSync(backupPath, content, "utf-8");
    return backupPath;
  }

  private statePath(appCode: AppCode): string {
    return resolve(this.stateDir, `${appCode}.json`);
  }

  private readState(appCode: AppCode): HostIntegrationStateRecord | null {
    const statePath = this.statePath(appCode);
    if (!existsSync(statePath)) {
      return null;
    }

    const parsed = readJsonObject(statePath);
    if (
      typeof parsed.appCode !== "string" ||
      typeof parsed.configPath !== "string" ||
      typeof parsed.rollbackAction !== "string" ||
      typeof parsed.lastAppliedAt !== "string"
    ) {
      return null;
    }

    return {
      appCode: parsed.appCode as AppCode,
      configPath: parsed.configPath,
      backupPath: typeof parsed.backupPath === "string" ? parsed.backupPath : null,
      rollbackAction: parsed.rollbackAction === "delete" ? "delete" : "restore",
      supplementalFiles: Array.isArray(parsed.supplementalFiles)
        ? parsed.supplementalFiles
            .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
            .map((item) => ({
              path: typeof item.path === "string" ? item.path : "",
              backupPath: typeof item.backupPath === "string" ? item.backupPath : null,
              rollbackAction: (item.rollbackAction === "delete" ? "delete" : "restore") as
                | "delete"
                | "restore"
            }))
            .filter((item) => item.path.length > 0)
        : [],
      lastAppliedAt: parsed.lastAppliedAt
    };
  }

  private writeState(record: HostIntegrationStateRecord): void {
    writeJsonObject(this.statePath(record.appCode), record as unknown as Record<string, unknown>);
  }

  private removeState(appCode: AppCode): void {
    rmSync(this.statePath(appCode), { force: true });
  }

  private appendEvent(
    input: Omit<HostIntegrationEvent, "id" | "createdAt" | "kind"> & {
      readonly kind?: HostIntegrationEvent["kind"];
    }
  ): HostIntegrationEvent {
    const createdAt = nowIso();
    const kind = input.kind ?? "proxy-config";
    const result = this.options.database
      .prepare(`
        INSERT INTO host_integration_events (
          kind, app_code, action, config_path, backup_path, integration_state, message, created_at
        ) VALUES (
          @kind, @appCode, @action, @configPath, @backupPath, @integrationState, @message, @createdAt
        )
      `)
      .run({
        kind,
        ...input,
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      kind,
      appCode: input.appCode,
      action: input.action,
      configPath: input.configPath,
      backupPath: input.backupPath,
      integrationState: input.integrationState,
      message: input.message
    };
  }

  private safeRead<T>(reader: () => T): T | null {
    try {
      return reader();
    } catch {
      return null;
    }
  }
}
