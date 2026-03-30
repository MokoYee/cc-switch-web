import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  systemMetadata,
  type SystemMetadata,
  type SystemServiceDoctor,
  type SystemServiceMutationResult
} from "cc-switch-web-shared";

import type { DaemonEnv } from "../../config/env.js";
import type { DaemonStoragePaths } from "../../db/paths.js";
import type { SettingsRepository } from "../settings/settings-repository.js";
import { SnapshotService } from "../snapshots/snapshot-service.js";
import { SystemServiceEventRepository } from "./system-service-event-repository.js";

export interface SystemRuntimeView {
  readonly runMode: "foreground" | "systemd-user";
  readonly daemonHost: string;
  readonly daemonPort: number;
  readonly allowedOrigins: string[];
  readonly allowAnyOrigin: boolean;
  readonly healthProbeIntervalMs: number;
  readonly dataDir: string;
  readonly dbPath: string;
  readonly latestSnapshotVersion: number | null;
}

interface SpawnResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | null;
}

const currentModuleFilePath =
  typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);

export class SystemService {
  private readonly workspaceRoot = resolve(dirname(currentModuleFilePath), "../../../../..");
  private readonly cliEntry = resolve(this.workspaceRoot, "apps/cli/dist/index.js");
  private readonly systemdUnitPath = resolve(homedir(), ".config/systemd/user/cc-switch-web.service");
  private readonly systemdEnvPath = resolve(homedir(), ".config/cc-switch-web/daemon.env");

  constructor(
    private readonly env: DaemonEnv,
    private readonly storagePaths: DaemonStoragePaths,
    private readonly snapshotService: SnapshotService,
    private readonly settingsRepository: SettingsRepository,
    private readonly systemServiceEventRepository: SystemServiceEventRepository
  ) {}

  getMetadata(): SystemMetadata {
    return systemMetadata;
  }

  getRuntime(): SystemRuntimeView {
    return {
      runMode: this.env.runMode,
      daemonHost: this.env.host,
      daemonPort: this.env.port,
      allowedOrigins: this.env.allowedOrigins,
      allowAnyOrigin: this.env.allowAnyOrigin,
      healthProbeIntervalMs: this.env.healthProbeIntervalMs,
      dataDir: this.storagePaths.dataDir,
      dbPath: this.storagePaths.dbPath,
      latestSnapshotVersion: this.snapshotService.latest()?.version ?? null
    };
  }

  getControlAuthRuntime() {
    return this.settingsRepository.getControlTokenRuntimeView(this.env.envControlToken);
  }

  rotateControlToken() {
    return this.settingsRepository.rotateControlToken(this.env.envControlToken);
  }

  async getServiceDoctor(): Promise<SystemServiceDoctor> {
    const desiredEnv = this.getDesiredSystemdEnvMap();
    const envFile = this.readSystemdEnvFile();
    const envDiff = this.getEnvDiff(desiredEnv, envFile.values);
    const systemdProbe = await this.runCaptured("systemctl", ["--user", "show-environment"]);
    const systemdAvailable = systemdProbe.code === 0;

    const serviceStatusResult =
      systemdAvailable && existsSync(this.systemdUnitPath)
        ? await this.runCaptured("systemctl", [
            "--user",
            "show",
            "cc-switch-web.service",
            "--property=LoadState,ActiveState,SubState,UnitFileState,FragmentPath,ExecMainPID"
          ])
        : null;
    const activeResult =
      systemdAvailable && existsSync(this.systemdUnitPath)
        ? await this.runCaptured("systemctl", ["--user", "is-active", "cc-switch-web.service"])
        : null;
    const statusProperties =
      serviceStatusResult?.code === 0
        ? Object.fromEntries(
            serviceStatusResult.stdout
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const separatorIndex = line.indexOf("=");
                return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
              })
          )
        : null;

    const runtime = this.getRuntime();
    const runtimeDifferences = [
      {
        field: "runMode",
        desired: desiredEnv.CCSW_RUN_MODE ?? "foreground",
        actual: runtime.runMode
      },
      {
        field: "daemonHost",
        desired: desiredEnv.CCSW_DAEMON_HOST ?? null,
        actual: runtime.daemonHost
      },
      {
        field: "daemonPort",
        desired: desiredEnv.CCSW_DAEMON_PORT
          ? Number.parseInt(desiredEnv.CCSW_DAEMON_PORT, 10)
          : null,
        actual: runtime.daemonPort
      },
      {
        field: "dataDir",
        desired: desiredEnv.CCSW_DATA_DIR ?? null,
        actual: runtime.dataDir
      },
      {
        field: "dbPath",
        desired: desiredEnv.CCSW_DB_PATH ?? null,
        actual: runtime.dbPath
      }
    ].filter((item) => item.desired !== item.actual);

    const recommendedActions: string[] = [];

    if (!systemdAvailable) {
      recommendedActions.push(
        "systemd --user unavailable; use `ccsw daemon start` or move to a Linux host with systemd user session"
      );
    }
    if (!existsSync(this.systemdUnitPath)) {
      recommendedActions.push("run `ccsw daemon service install` to create and enable cc-switch-web.service");
    }
    if (!envFile.exists) {
      recommendedActions.push(
        "run `ccsw daemon service sync-env` before enabling or restarting the user service"
      );
    } else if (envDiff.length > 0) {
      recommendedActions.push(
        "run `ccsw daemon service sync-env` to remove drift from the current daemon settings"
      );
    }
    if (!runtimeDifferences.length && this.env.runMode !== "systemd-user") {
      recommendedActions.push(
        "current daemon runs in foreground mode; run `ccsw daemon service install` and `ccsw daemon service restart` for unattended startup"
      );
    }
    if (systemdAvailable && existsSync(this.systemdUnitPath) && activeResult?.stdout.trim() !== "active") {
      recommendedActions.push(
        "run `ccsw daemon service start` or `ccsw daemon service restart`, then inspect `ccsw daemon service logs --lines 200` if startup still fails"
      );
    }
    if (recommendedActions.length === 0) {
      recommendedActions.push(
        "service configuration and daemon runtime are aligned; use `ccsw daemon service logs --lines 50` for a quick runtime audit"
      );
    }

    return {
      service: "cc-switch-web.service",
      fallback: this.getServiceFallbackHint(),
      checks: {
        systemd: {
          available: systemdAvailable,
          detail:
            systemdAvailable
              ? "systemd --user available"
              : systemdProbe.stderr.trim() ||
                systemdProbe.stdout.trim() ||
                systemdProbe.error?.message ||
                "systemd --user unavailable"
        },
        files: {
          unitPath: this.systemdUnitPath,
          unitExists: existsSync(this.systemdUnitPath),
          envPath: this.systemdEnvPath,
          envExists: envFile.exists,
          envInSync: envDiff.length === 0,
          envDiff
        },
        service: {
          knownToSystemd: serviceStatusResult?.code === 0,
          active: activeResult?.stdout.trim() === "active",
          activeState: statusProperties?.ActiveState ?? null,
          subState: statusProperties?.SubState ?? null,
          loadState: statusProperties?.LoadState ?? null,
          unitFileState: statusProperties?.UnitFileState ?? null,
          execMainPid:
            statusProperties?.ExecMainPID && statusProperties.ExecMainPID !== "0"
              ? Number.parseInt(statusProperties.ExecMainPID, 10)
              : null
        },
        runtime: {
          daemonMatchesDesired: runtimeDifferences.length === 0,
          differences: runtimeDifferences
        },
        recommendedActions
      }
    };
  }

  async syncServiceEnv(): Promise<SystemServiceMutationResult> {
    mkdirSync(dirname(this.systemdEnvPath), { recursive: true });
    writeFileSync(this.systemdEnvPath, this.getSystemdEnvContent(), "utf-8");
    this.systemServiceEventRepository.append({
      action: "sync-env",
      status: "success",
      message: "Service environment file synchronized",
      details: {
        envPath: this.systemdEnvPath,
        runMode: "systemd-user",
        daemonHost: this.env.host,
        daemonPort: String(this.env.port)
      }
    });

    return {
      action: "sync-env",
      message: "service environment file synchronized",
      doctor: await this.getServiceDoctor()
    };
  }

  async installUserService(): Promise<SystemServiceMutationResult> {
    mkdirSync(dirname(this.systemdUnitPath), { recursive: true });
    mkdirSync(dirname(this.systemdEnvPath), { recursive: true });
    writeFileSync(this.systemdEnvPath, this.getSystemdEnvContent(), "utf-8");
    writeFileSync(this.systemdUnitPath, this.getSystemdUnitContent(), "utf-8");

    const systemdProbe = await this.runCaptured("systemctl", ["--user", "show-environment"]);
    if (systemdProbe.code === 0) {
      await this.runSystemctlUser(["daemon-reload"]);
      await this.runSystemctlUser(["enable", "cc-switch-web.service"]);
    }

    this.systemServiceEventRepository.append({
      action: "install",
      status: systemdProbe.code === 0 ? "success" : "warning",
      message:
        systemdProbe.code === 0
          ? "User service installed and enabled"
          : "User service files written locally without systemd --user enablement",
      details: {
        unitPath: this.systemdUnitPath,
        envPath: this.systemdEnvPath,
        systemdAvailable: systemdProbe.code === 0 ? "true" : "false"
      }
    });

    return {
      action: "install",
      message:
        systemdProbe.code === 0
          ? "service files installed and enabled for systemd user session"
          : "service files written locally; systemd --user is unavailable on this host",
      doctor: await this.getServiceDoctor()
    };
  }

  private getServiceFallbackHint(): string {
    return "Fallback to foreground mode with: ccsw daemon start";
  }

  private escapeEnvValue(value: string): string {
    return value.includes(" ") || value.includes("#") || value.includes('"')
      ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
      : value;
  }

  private getDesiredSystemdEnvMap(): Record<string, string> {
    return this.parseEnvFileContent(this.getSystemdEnvContent());
  }

  private getSystemdEnvContent(): string {
    const controlToken = this.settingsRepository.getControlToken(this.env.envControlToken);
    const lines = [
      "# CC Switch Web user service environment",
      "CCSW_RUN_MODE=systemd-user",
      `CCSW_DAEMON_HOST=${this.escapeEnvValue(this.env.host)}`,
      `CCSW_DAEMON_PORT=${this.env.port}`,
      `CCSW_ALLOWED_ORIGINS=${this.escapeEnvValue(this.env.allowedOrigins.join(","))}`,
      `CCSW_DATA_DIR=${this.escapeEnvValue(this.storagePaths.dataDir)}`,
      `CCSW_DB_PATH=${this.escapeEnvValue(this.storagePaths.dbPath)}`,
      `CCSW_CONTROL_TOKEN=${this.escapeEnvValue(controlToken.value)}`
    ];

    return `${lines.join("\n")}\n`;
  }

  private getSystemdUnitContent(): string {
    return `[Unit]
Description=CC Switch Web daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${this.workspaceRoot}
EnvironmentFile=-${this.systemdEnvPath}
ExecStart=${process.execPath} ${this.cliEntry} daemon start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;
  }

  private stripWrappedQuotes(value: string): string {
    if (value.length < 2) {
      return value;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
  }

  private parseEnvFileContent(content: string): Record<string, string> {
    return Object.fromEntries(
      content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => {
          const separatorIndex = line.indexOf("=");
          if (separatorIndex === -1) {
            return [line, ""];
          }

          const key = line.slice(0, separatorIndex).trim();
          const rawValue = line.slice(separatorIndex + 1).trim();
          return [key, this.stripWrappedQuotes(rawValue).replaceAll('\\"', '"').replaceAll("\\\\", "\\")];
        })
    );
  }

  private readSystemdEnvFile(): {
    readonly exists: boolean;
    readonly values: Record<string, string>;
  } {
    if (!existsSync(this.systemdEnvPath)) {
      return {
        exists: false,
        values: {}
      };
    }

    return {
      exists: true,
      values: this.parseEnvFileContent(readFileSync(this.systemdEnvPath, "utf-8"))
    };
  }

  private getEnvDiff(desired: Record<string, string>, actual: Record<string, string>) {
    const keys = new Set([...Object.keys(desired), ...Object.keys(actual)]);

    return [...keys]
      .map((key) => ({
        key,
        desired: desired[key] ?? null,
        actual: actual[key] ?? null
      }))
      .filter((item) => item.desired !== item.actual)
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  private async runCaptured(commandName: string, args: string[]): Promise<SpawnResult> {
    return await new Promise((resolvePromise) => {
      const child = spawn(commandName, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        resolvePromise({
          code: null,
          stdout,
          stderr,
          error
        });
      });
      child.on("exit", (code) => {
        resolvePromise({
          code,
          stdout,
          stderr,
          error: null
        });
      });
    });
  }

  private async runSystemctlUser(args: string[]): Promise<void> {
    const result = await this.runCaptured("systemctl", ["--user", ...args]);
    if (result.code === 0) {
      return;
    }

    const detail =
      result.stderr.trim() ||
      result.stdout.trim() ||
      result.error?.message ||
      `systemctl --user ${args.join(" ")} failed`;
    throw new Error(detail);
  }
}
