import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";

import {
  nowIso,
  type AppCode,
  type HostCliApplyPreview,
  type HostCliCapability,
  type HostCliDiscovery,
  type HostCliEnvironmentOverride,
  type HostCliLifecycleMode,
  type HostCliMutationResult,
  type HostCliRollbackBatchResult,
  type HostCliStartupRecovery,
  type HostCliTakeoverMode,
  type HostIntegrationEvent
} from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";
import {
  createHostCliAdapters,
  isManagedHostCliAdapter,
  toHostCliCapability,
  type HostCliAdapter
} from "./adapters.js";
import {
  createHostCliEnvironmentProfiles,
  type HostCliEnvironmentProfile
} from "./environment-profiles.js";
import { scanHostCliEnvConflicts } from "./env-conflicts.js";

interface HostIntegrationStateRecord {
  readonly appCode: AppCode;
  readonly takeoverMode: HostCliTakeoverMode;
  readonly configPath: string;
  readonly backupPath: string | null;
  readonly lifecycleMode: HostCliLifecycleMode;
  readonly rollbackAction: "restore" | "delete";
  readonly desiredTarget: string | null;
  readonly environmentOverride: HostCliEnvironmentOverride | null;
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
  private readonly environmentProfiles: Map<AppCode, HostCliEnvironmentProfile>;
  private readonly backupsDir: string;
  private readonly stateDir: string;
  private startupRecovery: HostCliStartupRecovery | null = null;

  constructor(
    private readonly options: {
      readonly runMode?: "foreground" | "systemd-user";
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
    this.environmentProfiles = new Map(
      createHostCliEnvironmentProfiles().map((profile) => [profile.appCode, profile])
    );
  }

  scan(): HostCliDiscovery[] {
    const home = this.options.homeDir ?? homedir();

    return this.adapters.map((adapter) => {
      const executablePath = resolveExecutablePath(adapter.binaryName);
      const state = this.readState(adapter.appCode);
      const configPath = adapter.resolveConfigPath(home);
      const supportedTakeoverModes = this.listSupportedTakeoverModes(adapter.appCode);
      const integrationState = this.detectIntegrationState(adapter, configPath, state);
      const envConflicts = scanHostCliEnvConflicts({
        appCode: adapter.appCode,
        homeDir: home,
        ...(this.options.processEnv !== undefined ? { processEnv: this.options.processEnv } : {})
      });
      const currentTarget =
        state?.takeoverMode === "environment-override" && integrationState === "managed"
          ? state.desiredTarget
          : configPath !== null && existsSync(configPath) && adapter.getCurrentTarget !== undefined
          ? this.safeRead(() => adapter.getCurrentTarget?.(configPath) ?? null)
          : null;
      const desiredTarget = this.resolveDesiredTarget(adapter.appCode);
      const lifecycleMode =
        integrationState === "managed" ? (state?.lifecycleMode ?? null) : null;
      const supportLevel =
        supportedTakeoverModes.length > 0 ? "managed" : adapter.supportLevel;
      const configPathForDisplay =
        state?.takeoverMode === "environment-override" && integrationState === "managed"
          ? state.configPath
          : configPath;

      return {
        appCode: adapter.appCode,
        discovered: executablePath !== null,
        executablePath,
        configPath: configPathForDisplay,
        configLocationHint: adapter.configLocationHint,
        status: executablePath !== null ? "discovered" : "missing",
        configFormat: adapter.configFormat,
        takeoverSupported: supportedTakeoverModes.length > 0,
        supportLevel,
        takeoverMethod: adapter.takeoverMethod,
        supportedTakeoverModes,
        supportReasonCode: adapter.supportReasonCode,
        docsUrl: adapter.docsUrl,
        integrationState,
        currentTarget,
        desiredTarget,
        lifecycleMode,
        managedTarget:
          state?.takeoverMode === "environment-override" && integrationState === "managed"
            ? state.desiredTarget
            : isManagedHostCliAdapter(adapter) &&
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
    return this.adapters.map((adapter) => {
      const capability = toHostCliCapability(adapter);
      const supportedTakeoverModes = this.listSupportedTakeoverModes(adapter.appCode);

      return {
        ...capability,
        takeoverSupported: supportedTakeoverModes.length > 0,
        supportLevel: supportedTakeoverModes.length > 0 ? "managed" : adapter.supportLevel,
        supportedTakeoverModes
      };
    });
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

  applyManagedConfig(
    appCode: AppCode,
    takeoverMode: HostCliTakeoverMode = this.resolveDefaultTakeoverMode(appCode)
  ): HostCliMutationResult {
    const existingState = this.readState(appCode);
    if (existingState !== null && existingState.takeoverMode !== takeoverMode) {
      throw new Error(
        `Another takeover mode is already active for ${appCode}. Roll it back before switching modes.`
      );
    }

    if (takeoverMode === "environment-override") {
      return this.applyEnvironmentTakeover(appCode);
    }

    const adapter = this.getManagedAdapter(appCode, takeoverMode);
    const home = this.options.homeDir ?? homedir();
    const configPath = adapter.resolveConfigPath(home);
    const lifecycleMode = this.resolveLifecycleMode();

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
      takeoverMode,
      configPath,
      backupPath,
      lifecycleMode,
      rollbackAction: existingContent === null ? "delete" : "restore",
      desiredTarget: adapter.buildManagedTarget(proxyBaseUrl),
      environmentOverride: null,
      supplementalFiles,
      lastAppliedAt: appliedAt
    });

    const result: HostCliMutationResult = {
      appCode,
      action: "apply",
      takeoverMode,
      configPath,
      backupPath,
      integrationState: "managed",
      lifecycleMode,
      environmentOverride: null,
      message: this.buildMutationMessage(appCode, "apply", supplementalFiles, lifecycleMode)
    };
    this.appendEvent(result);
    return result;
  }

  previewApplyManagedConfig(
    appCode: AppCode,
    takeoverMode: HostCliTakeoverMode = this.resolveDefaultTakeoverMode(appCode)
  ): HostCliApplyPreview {
    if (takeoverMode === "environment-override") {
      return this.previewEnvironmentTakeover(appCode);
    }

    const adapter = this.getManagedAdapter(appCode, takeoverMode);
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

    if (this.resolveLifecycleMode() === "foreground-session") {
      summary.push(
        "Current daemon runs in foreground mode; host takeover will be treated as temporary and rolled back automatically when the daemon exits cleanly."
      );
      validationChecklist.push(
        "If you need takeover to survive reboot or logout, install the daemon as a systemd user service instead of relying on foreground mode."
      );
      runbook.push(
        "Use foreground takeover only for temporary sessions; stop the daemon normally so CC Switch Web can restore the original host config."
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
    if (this.resolveLifecycleMode() === "foreground-session") {
      warnings.push(
        "Foreground mode host takeover is temporary. If the machine powers off unexpectedly before rollback, manual host rollback may still be required."
      );
    }

    return {
      appCode,
      takeoverMode,
      configPath,
      configExists,
      backupRequired: configExists,
      riskLevel,
      lifecycleMode: this.resolveLifecycleMode(),
      desiredTarget: adapter.buildManagedTarget(proxyBaseUrl),
      environmentOverride: null,
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
    const state = this.readState(appCode);

    if (state === null) {
      throw new Error(`No host takeover state found for app: ${appCode}`);
    }

    let resultConfigPath = state.configPath;

    if (state.takeoverMode === "environment-override") {
      if (state.rollbackAction === "delete") {
        rmSync(state.configPath, { force: true });
      } else if (state.backupPath !== null && existsSync(state.backupPath)) {
        const originalContent = readFileSync(state.backupPath, "utf-8");
        ensureParentDir(state.configPath);
        writeFileSync(state.configPath, originalContent, "utf-8");
      } else {
        throw new Error(`Backup file not found for rollback: ${state.backupPath ?? "none"}`);
      }
    } else {
      const adapter = this.getManagedAdapter(appCode, "file-rewrite");
      const configPath = adapter.resolveConfigPath(this.options.homeDir ?? homedir());
      resultConfigPath = configPath ?? state.configPath;

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
    }

    if (state.takeoverMode === "environment-override") {
      for (const item of state.supplementalFiles) {
        if (item.rollbackAction === "delete") {
          rmSync(item.path, { force: true });
        }
      }
    }

    this.removeState(appCode);

    const result: HostCliMutationResult = {
      appCode,
      action: "rollback",
      takeoverMode: state.takeoverMode,
      configPath: resultConfigPath,
      backupPath: state.backupPath,
      integrationState: "unmanaged",
      lifecycleMode: state.lifecycleMode,
      environmentOverride: state.environmentOverride,
      message: this.buildMutationMessage(
        appCode,
        "rollback",
        state.supplementalFiles,
        state.lifecycleMode,
        state.takeoverMode
      )
    };
    this.appendEvent(result);
    return result;
  }

  rollbackForegroundSessionConfigs(): HostCliRollbackBatchResult {
    const results: HostCliMutationResult[] = [];
    const failures: Array<{
      readonly appCode: AppCode;
      readonly message: string;
    }> = [];

    for (const adapter of this.adapters) {
      if (!isManagedHostCliAdapter(adapter)) {
        continue;
      }

      const state = this.readState(adapter.appCode);
      if (state === null || state.lifecycleMode !== "foreground-session") {
        continue;
      }

      try {
        results.push(this.rollbackManagedConfig(adapter.appCode));
      } catch (error) {
        failures.push({
          appCode: adapter.appCode,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      totalApps: results.length + failures.length,
      rolledBackApps: results.map((item) => item.appCode),
      failedApps: failures.map((item) => item.appCode),
      items: results,
      failures,
      message:
        results.length === 0 && failures.length === 0
          ? "No foreground-session host takeover state required rollback"
          : failures.length === 0
            ? `Rolled back ${results.length} foreground-session host takeover(s)`
            : `Rolled back ${results.length} foreground-session host takeover(s); ${failures.length} rollback failure(s) require manual review`
    };
  }

  recoverForegroundSessionConfigsOnStartup(): HostCliStartupRecovery | null {
    const result = this.rollbackForegroundSessionConfigs();

    if (result.totalApps === 0) {
      return this.startupRecovery;
    }

    this.startupRecovery = {
      trigger: "startup-auto-rollback",
      executedAt: nowIso(),
      ...result,
      message:
        result.failedApps.length === 0
          ? `Auto-recovered ${result.rolledBackApps.length} stale foreground-session host takeover(s) during daemon startup`
          : `Auto-recovered ${result.rolledBackApps.length} stale foreground-session host takeover(s) during daemon startup; ${result.failedApps.length} app(s) still require manual recovery`
    };
    return this.startupRecovery;
  }

  getStartupRecovery(): HostCliStartupRecovery | null {
    return this.startupRecovery;
  }

  private getManagedAdapter(
    appCode: AppCode,
    takeoverMode: HostCliTakeoverMode = "file-rewrite"
  ) {
    if (takeoverMode !== "file-rewrite") {
      throw new Error(`File rewrite adapter is not available for takeover mode: ${takeoverMode}`);
    }

    const adapter = this.adapters.find((item) => item.appCode === appCode);

    if (adapter === undefined) {
      throw new Error(`Unknown app code: ${appCode}`);
    }

    if (!isManagedHostCliAdapter(adapter)) {
      throw new Error(`Host takeover is not supported yet for app: ${appCode}`);
    }

    return adapter;
  }

  private getEnvironmentProfile(appCode: AppCode): HostCliEnvironmentProfile {
    const profile = this.environmentProfiles.get(appCode);
    if (profile === undefined) {
      throw new Error(`Environment takeover is not supported yet for app: ${appCode}`);
    }
    return profile;
  }

  private listSupportedTakeoverModes(appCode: AppCode): HostCliTakeoverMode[] {
    const adapter = this.adapters.find((item) => item.appCode === appCode);
    const takeoverModes = new Set<HostCliTakeoverMode>(adapter?.supportedTakeoverModes ?? []);

    if (this.environmentProfiles.has(appCode)) {
      takeoverModes.add("environment-override");
    }

    return Array.from(takeoverModes);
  }

  private resolveDefaultTakeoverMode(appCode: AppCode): HostCliTakeoverMode {
    const supportedTakeoverModes = this.listSupportedTakeoverModes(appCode);

    if (supportedTakeoverModes.includes("file-rewrite")) {
      return "file-rewrite";
    }
    if (supportedTakeoverModes.includes("environment-override")) {
      return "environment-override";
    }

    throw new Error(`Host takeover is not supported yet for app: ${appCode}`);
  }

  private resolveDesiredTarget(appCode: AppCode): string | null {
    const adapter = this.adapters.find((item) => item.appCode === appCode);
    if (adapter !== undefined && isManagedHostCliAdapter(adapter)) {
      return adapter.buildManagedTarget(this.buildProxyBaseUrl(appCode));
    }

    const profile = this.environmentProfiles.get(appCode);
    if (profile === undefined) {
      return null;
    }

    const environmentOverride = profile.buildEnvironmentOverride(
      this.options.homeDir ?? homedir(),
      this.buildProxyBaseUrl(appCode)
    );

    return (
      environmentOverride.variables.find((item) => /BASE_URL$/i.test(item.variableName))?.value ??
      null
    );
  }

  private previewEnvironmentTakeover(appCode: AppCode): HostCliApplyPreview {
    const profile = this.getEnvironmentProfile(appCode);
    const home = this.options.homeDir ?? homedir();
    const configPath = this.adapters.find((item) => item.appCode === appCode)?.resolveConfigPath(home) ?? null;
    const environmentOverride = profile.buildEnvironmentOverride(
      home,
      this.buildProxyBaseUrl(appCode)
    );
    const envConflicts = scanHostCliEnvConflicts({
      appCode,
      homeDir: home,
      ...(this.options.processEnv !== undefined ? { processEnv: this.options.processEnv } : {})
    });
    const compatibilityWarnings =
      profile.buildCompatibilityWarnings?.({
        homeDir: home,
        configPath
      }) ?? [];
    const exportScriptExists = existsSync(environmentOverride.exportScriptPath);
    const desiredTarget = this.resolveDesiredTarget(appCode);
    const riskLevel: HostCliApplyPreview["riskLevel"] =
      envConflicts.length > 0 || compatibilityWarnings.length > 0
        ? "high"
        : exportScriptExists
          ? "medium"
          : "low";
    const summary = [
      `Environment takeover will export ${environmentOverride.variables.map((item) => item.variableName).join(", ")} for ${appCode}.`,
      desiredTarget === null
        ? `Managed environment override will be generated at ${environmentOverride.exportScriptPath}.`
        : `CLI traffic will target ${desiredTarget} after the managed environment script is sourced.`,
      exportScriptExists
        ? `Existing managed script at ${environmentOverride.exportScriptPath} will be replaced on apply.`
        : `A managed script will be created at ${environmentOverride.exportScriptPath}.`
    ];
    const validationChecklist = [
      `Run '${environmentOverride.activationCommands[0]}' in the shell that will launch ${appCode}.`,
      desiredTarget === null
        ? `After exporting the variables, validate ${appCode} reaches the intended local gateway.`
        : `After exporting the variables, confirm ${appCode} reaches ${desiredTarget}.`,
      `When validation is complete, run '${environmentOverride.deactivationCommands[0]}' or open a new shell to clear the override.`
    ];
    const runbook = [
      "Review the generated environment variables and confirm they match the intended local gateway target.",
      "Apply the preview only when you are ready to source the managed script in the target shell session.",
      "After the CLI request succeeds, inspect runtime status and request logs before treating takeover as complete."
    ];
    const warnings = [
      "Environment takeover does not rewrite the original CLI config file. Only shells that source the managed script will use the local gateway.",
      ...compatibilityWarnings
    ];

    if (envConflicts.length > 0) {
      warnings.push(
        `${envConflicts.length} environment override(s) were detected for ${appCode}; clear stale shell exports before sourcing the managed script.`
      );
    }
    if (this.resolveLifecycleMode() === "foreground-session") {
      warnings.push(
        "Foreground mode cleanup only removes the managed script. Shells that already exported the variables still need 'unset' or a new login shell."
      );
    }

    return {
      appCode,
      takeoverMode: "environment-override",
      configPath: environmentOverride.exportScriptPath,
      configExists: exportScriptExists,
      backupRequired: exportScriptExists,
      riskLevel,
      lifecycleMode: this.resolveLifecycleMode(),
      desiredTarget,
      environmentOverride,
      summary,
      managedFeaturesToEnable: [],
      touchedFiles: [
        {
          path: environmentOverride.exportScriptPath,
          exists: exportScriptExists,
          backupRequired: exportScriptExists,
          changeKind: exportScriptExists ? "update" : "create"
        }
      ],
      rollbackPlan: [
        {
          path: environmentOverride.exportScriptPath,
          action: exportScriptExists ? "restore" : "delete"
        }
      ],
      validationChecklist,
      runbook,
      envConflicts,
      warnings
    };
  }

  private applyEnvironmentTakeover(appCode: AppCode): HostCliMutationResult {
    const existingState = this.readState(appCode);
    if (existingState !== null && existingState.takeoverMode !== "environment-override") {
      throw new Error(
        `Another takeover mode is already active for ${appCode}. Roll it back before switching to environment takeover.`
      );
    }

    const profile = this.getEnvironmentProfile(appCode);
    const home = this.options.homeDir ?? homedir();
    const environmentOverride = profile.buildEnvironmentOverride(
      home,
      this.buildProxyBaseUrl(appCode)
    );
    const exportScriptExists = existsSync(environmentOverride.exportScriptPath);
    const existingContent = exportScriptExists
      ? readFileSync(environmentOverride.exportScriptPath, "utf-8")
      : null;
    const backupPath =
      existingContent === null
        ? null
        : this.createBackupFile(appCode, environmentOverride.exportScriptPath, existingContent);
    const lifecycleMode = this.resolveLifecycleMode();

    ensureParentDir(environmentOverride.exportScriptPath);
    writeFileSync(environmentOverride.exportScriptPath, environmentOverride.exportSnippet, "utf-8");

    const appliedAt = nowIso();
    this.writeState({
      appCode,
      takeoverMode: "environment-override",
      configPath: environmentOverride.exportScriptPath,
      backupPath,
      lifecycleMode,
      rollbackAction: exportScriptExists ? "restore" : "delete",
      desiredTarget:
        environmentOverride.variables.find((item) => /BASE_URL$/i.test(item.variableName))?.value ?? null,
      environmentOverride,
      supplementalFiles: [],
      lastAppliedAt: appliedAt
    });

    const result: HostCliMutationResult = {
      appCode,
      action: "apply",
      takeoverMode: "environment-override",
      configPath: environmentOverride.exportScriptPath,
      backupPath,
      integrationState: "managed",
      lifecycleMode,
      environmentOverride,
      message: this.buildMutationMessage(
        appCode,
        "apply",
        [],
        lifecycleMode,
        "environment-override"
      )
    };
    this.appendEvent(result);
    return result;
  }

  private buildProxyBaseUrl(appCode: AppCode): string {
    return `http://${this.options.daemonHost}:${this.options.daemonPort}/proxy/${appCode}`;
  }

  private resolveLifecycleMode(): HostCliLifecycleMode {
    return this.options.runMode === "systemd-user" ? "persistent" : "foreground-session";
  }

  private buildMutationMessage(
    appCode: AppCode,
    action: "apply" | "rollback",
    supplementalFiles: readonly {
      readonly path: string;
    }[],
    lifecycleMode: HostCliLifecycleMode = "persistent",
    takeoverMode: HostCliTakeoverMode = "file-rewrite"
  ): string {
    if (takeoverMode === "environment-override") {
      if (action === "apply") {
        return lifecycleMode === "foreground-session"
          ? `Environment takeover prepared for ${appCode}; source the managed shell script before starting the CLI; foreground shutdown only removes the script, not already-exported variables`
          : `Environment takeover prepared for ${appCode}; source the managed shell script before starting the CLI`;
      }

      return `Environment takeover rolled back for ${appCode}; unset the exported variables or open a new shell if the CLI session is still active`;
    }

    if (
      appCode === "claude-code" &&
      supplementalFiles.some((item) => item.path.endsWith("/.claude.json"))
    ) {
      if (action === "apply") {
        return lifecycleMode === "foreground-session"
          ? "Managed config applied for claude-code; Claude onboarding bypass enabled; foreground session will auto-rollback on daemon shutdown"
          : "Managed config applied for claude-code; Claude onboarding bypass enabled";
      }

      return "Managed config rolled back for claude-code; Claude onboarding bypass restored";
    }

    if (action === "apply") {
      return lifecycleMode === "foreground-session"
        ? `Managed config applied for ${appCode}; foreground session will auto-rollback on daemon shutdown`
        : `Managed config applied for ${appCode}`;
    }

    return `Managed config rolled back for ${appCode}`;
  }

  private detectIntegrationState(
    adapter: HostCliAdapter,
    configPath: string | null,
    state: HostIntegrationStateRecord | null
  ): HostCliDiscovery["integrationState"] {
    if (
      state !== null &&
      state.takeoverMode === "environment-override" &&
      existsSync(state.configPath)
    ) {
      return "managed";
    }

    if (!isManagedHostCliAdapter(adapter)) {
      return this.environmentProfiles.has(adapter.appCode) ? "unmanaged" : "unsupported";
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
      takeoverMode:
        parsed.takeoverMode === "environment-override"
          ? "environment-override"
          : "file-rewrite",
      configPath: parsed.configPath,
      backupPath: typeof parsed.backupPath === "string" ? parsed.backupPath : null,
      lifecycleMode:
        parsed.lifecycleMode === "foreground-session" ? "foreground-session" : "persistent",
      rollbackAction: parsed.rollbackAction === "delete" ? "delete" : "restore",
      desiredTarget: typeof parsed.desiredTarget === "string" ? parsed.desiredTarget : null,
      environmentOverride:
        typeof parsed.environmentOverride === "object" &&
        parsed.environmentOverride !== null &&
        typeof (parsed.environmentOverride as { exportScriptPath?: unknown }).exportScriptPath === "string" &&
        typeof (parsed.environmentOverride as { exportSnippet?: unknown }).exportSnippet === "string" &&
        typeof (parsed.environmentOverride as { unsetSnippet?: unknown }).unsetSnippet === "string" &&
        Array.isArray((parsed.environmentOverride as { activationCommands?: unknown }).activationCommands) &&
        Array.isArray((parsed.environmentOverride as { deactivationCommands?: unknown }).deactivationCommands) &&
        Array.isArray((parsed.environmentOverride as { variables?: unknown }).variables)
          ? (parsed.environmentOverride as HostCliEnvironmentOverride)
          : null,
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
