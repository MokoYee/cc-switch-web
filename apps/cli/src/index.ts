#!/usr/bin/env node

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

const DAEMON_HOST = process.env.CCSW_DAEMON_HOST ?? process.env.CCSW_HOST ?? "127.0.0.1";
const DAEMON_PORT = Number.parseInt(
  process.env.CCSW_DAEMON_PORT ?? process.env.CCSW_PORT ?? "8787",
  10
);
const WEB_HOST = process.env.CCSW_WEB_HOST ?? "127.0.0.1";
const WEB_PORT = Number.parseInt(process.env.CCSW_WEB_PORT ?? "8788", 10);
const CONTROL_TOKEN = process.env.CCSW_CONTROL_TOKEN?.trim();
const DATA_DIR = resolve(process.env.CCSW_DATA_DIR ?? join(homedir(), ".cc-switch-web"));
const DB_PATH = resolve(process.env.CCSW_DB_PATH ?? join(DATA_DIR, "cc-switch-web.sqlite"));
const cliEntry = fileURLToPath(import.meta.url);
const cliDistDir = dirname(cliEntry);
const workspaceRoot = resolve(cliDistDir, "../../..");
const daemonEntry = resolve(workspaceRoot, "apps/daemon/dist/index.cjs");
const webDistDir = resolve(workspaceRoot, "apps/web/dist");
const systemdUserDir = resolve(homedir(), ".config/systemd/user");
const ccSwitchWebConfigDir = resolve(homedir(), ".config/cc-switch-web");
const systemdUnitPath = resolve(systemdUserDir, "cc-switch-web.service");
const systemdEnvPath = resolve(ccSwitchWebConfigDir, "daemon.env");

type ControlAuthRuntimeView = {
  readonly source: "env" | "database";
  readonly canRotate: boolean;
  readonly maskedToken: string;
  readonly updatedAt: string | null;
};

type ControlAuthRotateResult = {
  readonly source: "env" | "database";
  readonly token: string;
};

const command = process.argv[2];
const subCommand = process.argv[3];
const DEFAULT_COMMAND_NAME = "ccsw";

const printUsage = (): void => {
  console.log(`${DEFAULT_COMMAND_NAME} <command>

Default Command:
  ${DEFAULT_COMMAND_NAME}                Recommended short command

Also Available:
  cc-switch-web

Commands:
  ${DEFAULT_COMMAND_NAME} daemon start    Start the daemon in foreground
  ${DEFAULT_COMMAND_NAME} daemon service print
  ${DEFAULT_COMMAND_NAME} daemon service env-path
  ${DEFAULT_COMMAND_NAME} daemon service print-env
  ${DEFAULT_COMMAND_NAME} daemon service sync-env
  ${DEFAULT_COMMAND_NAME} daemon service install
  ${DEFAULT_COMMAND_NAME} daemon service uninstall
  ${DEFAULT_COMMAND_NAME} daemon service start|stop|restart|status|doctor
  ${DEFAULT_COMMAND_NAME} quickstart <appCode>
  ${DEFAULT_COMMAND_NAME} host scan
  ${DEFAULT_COMMAND_NAME} host matrix
  ${DEFAULT_COMMAND_NAME} host capabilities
  ${DEFAULT_COMMAND_NAME} host events
  ${DEFAULT_COMMAND_NAME} host preview <appCode>
  ${DEFAULT_COMMAND_NAME} host setup <appCode>
  ${DEFAULT_COMMAND_NAME} host apply <appCode>
  ${DEFAULT_COMMAND_NAME} host rollback <appCode>
  ${DEFAULT_COMMAND_NAME} mcp servers
  ${DEFAULT_COMMAND_NAME} mcp bindings
  ${DEFAULT_COMMAND_NAME} mcp host capabilities
  ${DEFAULT_COMMAND_NAME} mcp import <appCode> [--existing overwrite|skip] [--missing-bindings create|skip]
  ${DEFAULT_COMMAND_NAME} mcp host apply <appCode>
  ${DEFAULT_COMMAND_NAME} mcp host rollback <appCode>
  ${DEFAULT_COMMAND_NAME} prompt host capabilities
  ${DEFAULT_COMMAND_NAME} prompt host states
  ${DEFAULT_COMMAND_NAME} prompt host preview-all
  ${DEFAULT_COMMAND_NAME} prompt host apply-all
  ${DEFAULT_COMMAND_NAME} prompt host preview <appCode>
  ${DEFAULT_COMMAND_NAME} prompt host import-preview <appCode>
  ${DEFAULT_COMMAND_NAME} prompt host import <appCode>
  ${DEFAULT_COMMAND_NAME} prompt host apply <appCode>
  ${DEFAULT_COMMAND_NAME} prompt host rollback <appCode>
  ${DEFAULT_COMMAND_NAME} prompt list
  ${DEFAULT_COMMAND_NAME} prompt set --id <id> --name <name> --locale zh-CN|en-US --content <content> [--app <appCode>] [--tags <a,b>] [--disabled]
  ${DEFAULT_COMMAND_NAME} prompt delete <id>
  ${DEFAULT_COMMAND_NAME} skill list
  ${DEFAULT_COMMAND_NAME} skill delivery capabilities
  ${DEFAULT_COMMAND_NAME} skill set --id <id> --name <name> --content <content> [--app <appCode>] [--prompt <promptId>] [--tags <a,b>] [--disabled]
  ${DEFAULT_COMMAND_NAME} skill delete <id>
  ${DEFAULT_COMMAND_NAME} assets governance preview [--app <appCode>]
  ${DEFAULT_COMMAND_NAME} assets governance repair [--app <appCode>]
  ${DEFAULT_COMMAND_NAME} workspace list
  ${DEFAULT_COMMAND_NAME} workspace discover [--roots <a,b>] [--depth <n>]
  ${DEFAULT_COMMAND_NAME} workspace import --root <path> [--id <id>] [--name <name>] [--app <appCode>] [--provider <providerId>] [--prompt <promptId>] [--skill <skillId>] [--tags <a,b>] [--disabled]
  ${DEFAULT_COMMAND_NAME} workspace import-auto [--roots <a,b>] [--depth <n>] [--app <appCode>] [--tags <a,b>] [--disabled]
  ${DEFAULT_COMMAND_NAME} workspace resolve <id>
  ${DEFAULT_COMMAND_NAME} workspace activate <id>|none
  ${DEFAULT_COMMAND_NAME} workspace set --id <id> --name <name> --root <path> [--app <appCode>] [--provider <providerId>] [--prompt <promptId>] [--skill <skillId>] [--tags <a,b>] [--disabled]
  ${DEFAULT_COMMAND_NAME} workspace delete <id>
  ${DEFAULT_COMMAND_NAME} session list
  ${DEFAULT_COMMAND_NAME} session resolve <id>
  ${DEFAULT_COMMAND_NAME} session activate <id>|none
  ${DEFAULT_COMMAND_NAME} session ensure --app <appCode> --cwd <path> [--title <title>] [--activate]
  ${DEFAULT_COMMAND_NAME} session set --id <id> --app <appCode> --title <title> --cwd <path> [--workspace <workspaceId>] [--provider <providerId>] [--prompt <promptId>] [--skill <skillId>] [--status active|archived] [--started-at <iso>]
  ${DEFAULT_COMMAND_NAME} session delete <id>
  ${DEFAULT_COMMAND_NAME} health probe <providerId>
  ${DEFAULT_COMMAND_NAME} health isolate <providerId> [--cooldown-seconds <n>] [--reason <text>]
  ${DEFAULT_COMMAND_NAME} health recover <providerId>
  ${DEFAULT_COMMAND_NAME} health reset <providerId> [--reason <text>]
  ${DEFAULT_COMMAND_NAME} logs requests [--app <appCode>] [--provider <providerId>] [--outcome <outcome>] [--method <method>] [--limit <n>] [--offset <n>]
  ${DEFAULT_COMMAND_NAME} usage records [--app <appCode>] [--provider <providerId>] [--model <model>] [--start-at <iso>] [--end-at <iso>] [--limit <n>] [--offset <n>]
  ${DEFAULT_COMMAND_NAME} usage summary [--app <appCode>] [--provider <providerId>] [--model <model>] [--start-at <iso>] [--end-at <iso>]
  ${DEFAULT_COMMAND_NAME} usage timeseries [--app <appCode>] [--provider <providerId>] [--model <model>] [--start-at <iso>] [--end-at <iso>] [--bucket hour|day]
  ${DEFAULT_COMMAND_NAME} quota list
  ${DEFAULT_COMMAND_NAME} quota set --id <id> --app <appCode> [--period day] [--max-requests <n>] [--max-tokens <n>] [--disabled]
  ${DEFAULT_COMMAND_NAME} quota delete <id>
  ${DEFAULT_COMMAND_NAME} audit events [--source <source>] [--app <appCode>] [--provider <providerId>] [--level <level>] [--limit <n>] [--offset <n>]
  ${DEFAULT_COMMAND_NAME} web             Serve the web console on demand
  ${DEFAULT_COMMAND_NAME} status          Query daemon health and runtime
  ${DEFAULT_COMMAND_NAME} active-context
  ${DEFAULT_COMMAND_NAME} active-context resolve <appCode> [--workspace <id>] [--session <id>] [--cwd <path>]
  ${DEFAULT_COMMAND_NAME} auth print-token
  ${DEFAULT_COMMAND_NAME} auth rotate-token

Environment:
  CCSW_DAEMON_HOST / CCSW_DAEMON_PORT
  CCSW_WEB_HOST / CCSW_WEB_PORT
  CCSW_CONTROL_TOKEN
  CCSW_DATA_DIR / CCSW_DB_PATH
  CCSW_ALLOWED_ORIGINS / ALLOWED_ORIGINS
`);
};

const readOptionValue = (flagName: string): string | undefined => {
  const index = process.argv.indexOf(flagName);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
};

const getLocalControlToken = (): string => {
  if (CONTROL_TOKEN) {
    return CONTROL_TOKEN;
  }

  if (!existsSync(DB_PATH)) {
    throw new Error(`SQLite database not found at ${DB_PATH}`);
  }

  const database = new Database(DB_PATH, { readonly: false });
  const row = database
    .prepare("SELECT value FROM system_settings WHERE key = 'control_token'")
    .get() as { value: string } | undefined;
  database.close();

  if (!row) {
    throw new Error("control_token not initialized in local database");
  }

  return row.value;
};

const rotateLocalControlToken = (): string => {
  if (CONTROL_TOKEN) {
    throw new Error("CCSW_CONTROL_TOKEN is set in environment; rotate token via environment config");
  }

  if (!existsSync(DB_PATH)) {
    throw new Error(`SQLite database not found at ${DB_PATH}`);
  }

  const database = new Database(DB_PATH, { readonly: false });
  const nextToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  database
    .prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('control_token', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
    .run(nextToken, new Date().toISOString());
  database.close();

  return nextToken;
};

const getSystemdUnitContent = (): string => `[Unit]
Description=CC Switch Web daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${workspaceRoot}
EnvironmentFile=-${systemdEnvPath}
ExecStart=${process.execPath} ${cliEntry} daemon start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;

const escapeEnvValue = (value: string): string =>
  value.includes(" ") || value.includes("#") || value.includes('"')
    ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    : value;

const readDesiredControlToken = (): string | null => {
  if (CONTROL_TOKEN) {
    return CONTROL_TOKEN;
  }

  if (!existsSync(DB_PATH)) {
    return null;
  }

  try {
    return getLocalControlToken();
  } catch {
    return null;
  }
};

const getSystemdEnvContent = (): string => {
  const desiredToken = readDesiredControlToken();
  const lines = [
    "# CC Switch Web user service environment",
    "CCSW_RUN_MODE=systemd-user",
    `CCSW_DAEMON_HOST=${escapeEnvValue(DAEMON_HOST)}`,
    `CCSW_DAEMON_PORT=${DAEMON_PORT}`,
    `CCSW_ALLOWED_ORIGINS=${escapeEnvValue(process.env.CCSW_ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS ?? "http://127.0.0.1:8788,http://localhost:8788")}`,
    `CCSW_DATA_DIR=${escapeEnvValue(DATA_DIR)}`,
    `CCSW_DB_PATH=${escapeEnvValue(DB_PATH)}`
  ];

  if (desiredToken) {
    lines.push(`CCSW_CONTROL_TOKEN=${escapeEnvValue(desiredToken)}`);
  } else {
    lines.push("# CCSW_CONTROL_TOKEN=");
  }

  return `${lines.join("\n")}\n`;
};

const ensureSystemdEnvFile = (): void => {
  mkdirSync(ccSwitchWebConfigDir, { recursive: true });

  if (existsSync(systemdEnvPath)) {
    return;
  }

  writeFileSync(systemdEnvPath, getSystemdEnvContent(), "utf-8");
};

const syncSystemdEnvFile = (): void => {
  mkdirSync(ccSwitchWebConfigDir, { recursive: true });
  writeFileSync(systemdEnvPath, getSystemdEnvContent(), "utf-8");
};

const stripWrappedQuotes = (value: string): string => {
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
};

const parseEnvFileContent = (content: string): Record<string, string> =>
  Object.fromEntries(
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
        return [key, stripWrappedQuotes(rawValue).replaceAll('\\"', '"').replaceAll("\\\\", "\\")];
      })
  );

const getDesiredSystemdEnvMap = (): Record<string, string> =>
  parseEnvFileContent(getSystemdEnvContent());

const readSystemdEnvFile = (): {
  readonly exists: boolean;
  readonly values: Record<string, string>;
} => {
  if (!existsSync(systemdEnvPath)) {
    return {
      exists: false,
      values: {}
    };
  }

  return {
    exists: true,
    values: parseEnvFileContent(readFileSync(systemdEnvPath, "utf-8"))
  };
};

const getEnvDiff = (
  desired: Record<string, string>,
  actual: Record<string, string>
): Array<{
  readonly key: string;
  readonly desired: string | null;
  readonly actual: string | null;
}> => {
  const keys = new Set([...Object.keys(desired), ...Object.keys(actual)]);

  return [...keys]
    .map((key) => ({
      key,
      desired: desired[key] ?? null,
      actual: actual[key] ?? null
    }))
    .filter((item) => item.desired !== item.actual)
    .sort((left, right) => left.key.localeCompare(right.key));
};

interface SpawnResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | null;
}

const runCaptured = async (
  commandName: string,
  args: string[]
): Promise<SpawnResult> =>
  new Promise((resolvePromise) => {
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

const getServiceFallbackHint = (): string =>
  `Fallback to foreground mode with: ${process.execPath} ${cliEntry} daemon start`;

const ensureSystemdUserAvailable = async (): Promise<void> => {
  const result = await runCaptured("systemctl", ["--user", "show-environment"]);
  if (result.code === 0) {
    return;
  }

  const detail =
    result.stderr.trim() ||
    result.stdout.trim() ||
    result.error?.message ||
    "unknown systemd --user error";
  throw new Error(`systemd --user unavailable: ${detail}. ${getServiceFallbackHint()}`);
};

const runSystemctlUser = async (...args: string[]): Promise<void> => {
  await ensureSystemdUserAvailable();

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn("systemctl", ["--user", ...args], {
      stdio: "inherit"
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`systemctl --user ${args.join(" ")} failed with exit code ${code ?? -1}`));
    });
  });
};

const printUserServiceEnv = (): void => {
  console.log(getSystemdEnvContent());
};

const printUserServiceStatus = async (): Promise<void> => {
  await ensureSystemdUserAvailable();

  const [showResult, activeResult] = await Promise.all([
    runCaptured("systemctl", [
      "--user",
      "show",
      "cc-switch-web.service",
      "--property=LoadState,ActiveState,SubState,UnitFileState,FragmentPath,ExecMainPID"
    ]),
    runCaptured("systemctl", ["--user", "is-active", "cc-switch-web.service"])
  ]);

  if (showResult.code !== 0) {
    const detail =
      showResult.stderr.trim() ||
      showResult.stdout.trim() ||
      showResult.error?.message ||
      "unknown systemctl show error";
    throw new Error(`unable to inspect cc-switch-web.service: ${detail}`);
  }

  const properties = Object.fromEntries(
    showResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );

  console.log(
    JSON.stringify(
      {
        service: "cc-switch-web.service",
        systemdAvailable: true,
        active: activeResult.stdout.trim() === "active",
        activeState: properties.ActiveState ?? "unknown",
        subState: properties.SubState ?? "unknown",
        loadState: properties.LoadState ?? "unknown",
        unitFileState: properties.UnitFileState ?? "unknown",
        execMainPid:
          properties.ExecMainPID && properties.ExecMainPID !== "0"
            ? Number.parseInt(properties.ExecMainPID, 10)
            : null,
        unitPath: properties.FragmentPath || systemdUnitPath,
        envPath: systemdEnvPath,
        envFileExists: existsSync(systemdEnvPath),
        fallback: getServiceFallbackHint()
      },
      null,
      2
    )
  );
};

const printUserServiceDoctor = async (): Promise<void> => {
  const desiredEnv = getDesiredSystemdEnvMap();
  const envFile = readSystemdEnvFile();
  const envDiff = getEnvDiff(desiredEnv, envFile.values);
  const systemdProbe = await runCaptured("systemctl", ["--user", "show-environment"]);
  const systemdAvailable = systemdProbe.code === 0;

  const statusResult =
    systemdAvailable && existsSync(systemdUnitPath)
      ? await runCaptured("systemctl", [
          "--user",
          "show",
          "cc-switch-web.service",
          "--property=LoadState,ActiveState,SubState,UnitFileState,FragmentPath,ExecMainPID"
        ])
      : null;
  const activeResult =
    systemdAvailable && existsSync(systemdUnitPath)
      ? await runCaptured("systemctl", ["--user", "is-active", "cc-switch-web.service"])
      : null;

  let runtimeCheck:
    | {
        readonly reachable: true;
        readonly authenticated: boolean;
        readonly daemonMatchesDesired: boolean | null;
        readonly differences: Array<{
          readonly field: string;
          readonly desired: string | number | null;
          readonly actual: string | number | null;
        }>;
        readonly daemonRuntime?: {
          readonly runMode: "foreground" | "systemd-user";
          readonly daemonHost: string;
          readonly daemonPort: number;
          readonly dataDir: string;
          readonly dbPath: string;
        };
        readonly reason?: string;
      }
    | {
        readonly reachable: false;
        readonly authenticated: false;
        readonly daemonMatchesDesired: null;
        readonly differences: [];
        readonly reason: string;
      };

  try {
    await readJson<{ status: string }>("/health");

    try {
      const runtime = await readProtectedJson<{
        runMode: "foreground" | "systemd-user";
        daemonHost: string;
        daemonPort: number;
        dataDir: string;
        dbPath: string;
      }>("/api/v1/system/runtime");
      const differences = [
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

      runtimeCheck = {
        reachable: true,
        authenticated: true,
        daemonMatchesDesired: differences.length === 0,
        differences,
        daemonRuntime: runtime
      };
    } catch (error) {
      runtimeCheck = {
        reachable: true,
        authenticated: false,
        daemonMatchesDesired: null,
        differences: [],
        reason:
          error instanceof Error
            ? error.message
            : "protected runtime endpoint requires control token"
      };
    }
  } catch (error) {
    runtimeCheck = {
      reachable: false,
      authenticated: false,
      daemonMatchesDesired: null,
      differences: [],
      reason: error instanceof Error ? error.message : "daemon health endpoint unavailable"
    };
  }

  const systemdStatusProperties =
    statusResult?.code === 0
      ? Object.fromEntries(
          statusResult.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const separatorIndex = line.indexOf("=");
              return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
            })
        )
      : null;

  console.log(
    JSON.stringify(
      {
        service: "cc-switch-web.service",
        fallback: getServiceFallbackHint(),
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
            unitPath: systemdUnitPath,
            unitExists: existsSync(systemdUnitPath),
            envPath: systemdEnvPath,
            envExists: envFile.exists,
            envInSync: envDiff.length === 0,
            envDiff
          },
          service: {
            knownToSystemd: statusResult?.code === 0,
            active: activeResult?.stdout.trim() === "active",
            activeState: systemdStatusProperties?.ActiveState ?? null,
            subState: systemdStatusProperties?.SubState ?? null,
            loadState: systemdStatusProperties?.LoadState ?? null,
            unitFileState: systemdStatusProperties?.UnitFileState ?? null,
            execMainPid:
              systemdStatusProperties?.ExecMainPID &&
              systemdStatusProperties.ExecMainPID !== "0"
                ? Number.parseInt(systemdStatusProperties.ExecMainPID, 10)
                : null
          },
          runtime: runtimeCheck
        }
      },
      null,
      2
    )
  );
};

const printUserService = (): void => {
  console.log(`# unit: ${systemdUnitPath}`);
  console.log(`# env: ${systemdEnvPath}`);
  console.log(getSystemdUnitContent());
};

const installUserService = async (): Promise<void> => {
  mkdirSync(systemdUserDir, { recursive: true });
  syncSystemdEnvFile();
  writeFileSync(systemdUnitPath, getSystemdUnitContent(), "utf-8");
  await runSystemctlUser("daemon-reload");
  await runSystemctlUser("enable", "--now", "cc-switch-web.service");
  console.log(`installed user service: ${systemdUnitPath}`);
  console.log(`environment file: ${systemdEnvPath}`);
};

const uninstallUserService = async (): Promise<void> => {
  if (existsSync(systemdUnitPath)) {
    try {
      await runSystemctlUser("disable", "--now", "cc-switch-web.service");
    } catch {
      // 如果服务尚未启用，仍然继续删除本地 unit 文件。
    }
    rmSync(systemdUnitPath, { force: true });
    await runSystemctlUser("daemon-reload");
  }

  console.log(`removed user service: ${systemdUnitPath}`);
};

const readJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const readProtectedJson = async <T>(path: string): Promise<T> => {
  const token = CONTROL_TOKEN ?? getLocalControlToken();
  const requestInit: RequestInit = {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}${path}`, requestInit);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const postProtectedJson = async <T>(path: string, body: unknown): Promise<T> => {
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };

  const token = CONTROL_TOKEN ?? getLocalControlToken();
  (requestInit.headers as Record<string, string>).Authorization = `Bearer ${token}`;

  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}${path}`, requestInit);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const printControlTokenFromDaemon = async (): Promise<void> => {
  try {
    const result = await readProtectedJson<ControlAuthRuntimeView>("/api/v1/system/control-auth");
    console.log(`# source: ${result.source}`);
    console.log(`# rotate: ${result.canRotate ? "yes" : "no"}`);
    console.log(getLocalControlToken());
  } catch {
    console.log(getLocalControlToken());
  }
};

const rotateControlTokenFromDaemon = async (): Promise<void> => {
  try {
    const result = await postProtectedJson<ControlAuthRotateResult>("/api/v1/system/control-auth/rotate", {});
    console.log(result.token);
    return;
  } catch {
    console.log(rotateLocalControlToken());
  }
};

const startWebServer = async (): Promise<void> => {
  if (!existsSync(webDistDir)) {
    console.error("apps/web/dist 不存在，请先执行 npm run build");
    process.exit(1);
  }

  const contentTypeByExt: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };

  const server = createServer(async (request, response) => {
    const requestPath = request.url === "/" ? "/index.html" : request.url ?? "/index.html";

    if (requestPath === "/cc-switch-web-runtime.js") {
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(
        `window.CCSW_API_BASE_URL = "http://${DAEMON_HOST}:${DAEMON_PORT}";`
      );
      return;
    }

    const absolutePath = join(webDistDir, requestPath);

    try {
      const content = await readFile(absolutePath);
      response.writeHead(200, {
        "Content-Type": contentTypeByExt[extname(absolutePath)] ?? "application/octet-stream"
      });
      response.end(content);
    } catch {
      const html = await readFile(join(webDistDir, "index.html"), "utf-8");
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      response.end(html);
    }
  });

  server.listen(WEB_PORT, WEB_HOST, () => {
    console.log(`${DEFAULT_COMMAND_NAME} web listening on http://${WEB_HOST}:${WEB_PORT}`);
    console.log(`daemon api expected at http://${DAEMON_HOST}:${DAEMON_PORT}`);
  });
};

const printStatus = async (): Promise<void> => {
  const [health, authState] = await Promise.all([
    readJson<{ status: string; service: string; time: string }>("/health"),
    readJson<{ authenticated: boolean; controlUiMountPath: string }>("/api/v1/auth/state")
  ]);

  let runtime:
    | {
        daemonHost: string;
        daemonPort: number;
        allowedOrigins: string[];
        allowAnyOrigin: boolean;
      }
    | { unavailable: true; reason: string };
  let proxyRuntime:
    | {
        runtimeState: string;
        snapshotVersion: number | null;
        requestLogCount: number;
        activeBindings: Array<{
          appCode: string;
          providerId: string;
          providerType: string;
          hasCredential: boolean;
          proxyBasePath: string;
        }>;
      }
    | { unavailable: true; reason: string };

  try {
    runtime = await readProtectedJson("/api/v1/system/runtime");
    proxyRuntime = await readProtectedJson("/api/v1/proxy-runtime");
  } catch {
    runtime = {
      unavailable: true,
      reason: "Protected runtime endpoint requires CCSW_CONTROL_TOKEN or an authenticated UI session"
    };
    proxyRuntime = {
      unavailable: true,
      reason: "Protected proxy runtime endpoint requires CCSW_CONTROL_TOKEN or an authenticated UI session"
    };
  }

  console.log(JSON.stringify({ health, authState, runtime, proxyRuntime, dbPath: DB_PATH }, null, 2));
};

const printHostDiscoveries = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/host-discovery");
  console.log(JSON.stringify(result, null, 2));
};

const printHostCapabilities = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/host-discovery/capabilities");
  console.log(JSON.stringify(result, null, 2));
};

const printHostEvents = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/host-discovery/events");
  console.log(JSON.stringify(result, null, 2));
};

const printHostApplyPreview = async (appCode: string): Promise<void> => {
  const result = await readProtectedJson<{ item: unknown }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/preview-apply`
  );
  console.log(JSON.stringify(result, null, 2));
};

const setupHostConfig = async (appCode: string): Promise<void> => {
  const preview = await readProtectedJson<{ item: unknown }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/preview-apply`
  );
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/apply`,
    {}
  );
  console.log(
    JSON.stringify(
      {
        preview,
        result,
        nextSteps: [
          `Run '${process.argv[1]} status' to confirm daemon and proxy runtime health.`,
          `Run '${process.argv[1]} logs requests --app ${appCode} --limit 10' after making a real CLI request.`,
          `Run '${process.argv[1]} host rollback ${appCode}' if you need to restore the previous host config.`
        ]
      },
      null,
      2
    )
  );
};

const runQuickstart = async (appCode: string): Promise<void> => {
  const status = await readJson<{ status: string; service: string; time: string }>("/health");
  const token = getLocalControlToken();
  const preview = await readProtectedJson<{ item: unknown }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/preview-apply`
  );
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/apply`,
    {}
  );

  console.log(
    JSON.stringify(
      {
        status,
        controlToken: token,
        preview,
        result,
        nextSteps: [
          `Point your ${appCode} client to the managed local config and send one real request.`,
          `Run '${DEFAULT_COMMAND_NAME} logs requests --app ${appCode} --limit 10' to verify traffic reached CC Switch Web.`,
          `Open http://${DAEMON_HOST}:${DAEMON_PORT}/ui/ if you want to inspect runtime or rollback from the console.`
        ]
      },
      null,
      2
    )
  );
};

const applyHostConfig = async (appCode: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/apply`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const rollbackHostConfig = async (appCode: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/host-discovery/${encodeURIComponent(appCode)}/rollback`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const probeProviderHealth = async (providerId: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/provider-health/${encodeURIComponent(providerId)}/probe`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const isolateProviderHealth = async (providerId: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/provider-health/${encodeURIComponent(providerId)}/isolate`,
    {
      cooldownSeconds: (() => {
        const value = readOptionValue("--cooldown-seconds");
        return value === undefined ? undefined : Number.parseInt(value, 10);
      })(),
      reason: readOptionValue("--reason")
    }
  );
  console.log(JSON.stringify(result, null, 2));
};

const recoverProviderHealth = async (providerId: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/provider-health/${encodeURIComponent(providerId)}/recover`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const resetProviderHealth = async (providerId: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/provider-health/${encodeURIComponent(providerId)}/reset`,
    {
      reason: readOptionValue("--reason")
    }
  );
  console.log(JSON.stringify(result, null, 2));
};

const printMcpServers = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/mcp/servers");
  console.log(JSON.stringify(result, null, 2));
};

const printMcpBindings = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/mcp/app-bindings");
  console.log(JSON.stringify(result, null, 2));
};

const printMcpHostCapabilities = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/mcp/host-sync/capabilities");
  console.log(JSON.stringify(result, null, 2));
};

const parseTags = (raw: string | undefined): string[] =>
  raw === undefined
    ? []
    : raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

const printPromptTemplates = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/prompts");
  console.log(JSON.stringify(result, null, 2));
};

const upsertPromptTemplate = async (): Promise<void> => {
  const id = readOptionValue("--id");
  const name = readOptionValue("--name");
  const locale = readOptionValue("--locale");
  const content = readOptionValue("--content");

  if (!id || !name || !locale || !content) {
    throw new Error("prompt set requires --id --name --locale --content");
  }

  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number }>("/api/v1/prompts", {
    id,
    name,
    appCode: readOptionValue("--app") ?? null,
    locale,
    content,
    tags: parseTags(readOptionValue("--tags")),
    enabled: !process.argv.includes("--disabled")
  });
  console.log(JSON.stringify(result, null, 2));
};

const deletePromptTemplate = async (id: string): Promise<void> => {
  const token = CONTROL_TOKEN ?? getLocalControlToken();
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}/api/v1/prompts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  console.log(JSON.stringify((await response.json()) as unknown, null, 2));
};

const printSkills = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/skills");
  console.log(JSON.stringify(result, null, 2));
};

const printSkillDeliveryCapabilities = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/skill-delivery/capabilities");
  console.log(JSON.stringify(result, null, 2));
};

const upsertSkill = async (): Promise<void> => {
  const id = readOptionValue("--id");
  const name = readOptionValue("--name");
  const content = readOptionValue("--content");

  if (!id || !name || !content) {
    throw new Error("skill set requires --id --name --content");
  }

  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number }>("/api/v1/skills", {
    id,
    name,
    appCode: readOptionValue("--app") ?? null,
    promptTemplateId: readOptionValue("--prompt") ?? null,
    content,
    tags: parseTags(readOptionValue("--tags")),
    enabled: !process.argv.includes("--disabled")
  });
  console.log(JSON.stringify(result, null, 2));
};

const deleteSkill = async (id: string): Promise<void> => {
  const token = CONTROL_TOKEN ?? getLocalControlToken();
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}/api/v1/skills/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  console.log(JSON.stringify((await response.json()) as unknown, null, 2));
};

const printAssetGovernancePreview = async (): Promise<void> => {
  const appCode = readOptionValue("--app");
  const result = await readProtectedJson<{ item: unknown }>(
    appCode
      ? `/api/v1/assets/governance/${encodeURIComponent(appCode)}/preview`
      : "/api/v1/assets/governance/preview-all"
  );
  console.log(JSON.stringify(result, null, 2));
};

const repairAssetGovernance = async (): Promise<void> => {
  const appCode = readOptionValue("--app");
  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number }>(
    appCode
      ? `/api/v1/assets/governance/${encodeURIComponent(appCode)}/repair`
      : "/api/v1/assets/governance/repair-all",
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const printWorkspaces = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/workspaces");
  console.log(JSON.stringify(result, null, 2));
};

const discoverWorkspaces = async (): Promise<void> => {
  const query = new URLSearchParams();
  const roots = readOptionValue("--roots");
  const depth = readOptionValue("--depth");
  if (roots) {
    query.set("roots", roots);
  }
  if (depth) {
    query.set("depth", depth);
  }
  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const result = await readProtectedJson<{ items: unknown[] }>(`/api/v1/workspace-discovery${suffix}`);
  console.log(JSON.stringify(result, null, 2));
};

const importWorkspaceCandidate = async (): Promise<void> => {
  const rootPath = readOptionValue("--root");
  if (!rootPath) {
    throw new Error("workspace import requires --root <path>");
  }

  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number }>(
    "/api/v1/workspace-discovery/import",
    {
      rootPath,
      id: readOptionValue("--id"),
      name: readOptionValue("--name"),
      appCode: readOptionValue("--app") ?? undefined,
      defaultProviderId: readOptionValue("--provider") ?? undefined,
      defaultPromptTemplateId: readOptionValue("--prompt") ?? undefined,
      defaultSkillId: readOptionValue("--skill") ?? undefined,
      tags: parseTags(readOptionValue("--tags")),
      enabled: !process.argv.includes("--disabled")
    }
  );
  console.log(JSON.stringify(result, null, 2));
};

const importWorkspaceCandidates = async (): Promise<void> => {
  const roots = readOptionValue("--roots");
  const depth = readOptionValue("--depth");
  const result = await postProtectedJson<Record<string, unknown>>(
    "/api/v1/workspace-discovery/import-batch",
    {
      roots: roots ? roots.split(",").map((item) => item.trim()).filter(Boolean) : undefined,
      depth: depth ? Number.parseInt(depth, 10) : undefined,
      appCode: readOptionValue("--app") ?? undefined,
      tags: parseTags(readOptionValue("--tags")),
      enabled: !process.argv.includes("--disabled")
    }
  );
  console.log(JSON.stringify(result, null, 2));
};

const resolveWorkspace = async (id: string): Promise<void> => {
  const result = await readProtectedJson<{ item: unknown }>(`/api/v1/workspaces/${encodeURIComponent(id)}/context`);
  console.log(JSON.stringify(result, null, 2));
};

const activateWorkspace = async (id: string | null): Promise<void> => {
  const result = await postProtectedJson<Record<string, unknown>>("/api/v1/active-context/workspace", {
    workspaceId: id
  });
  console.log(JSON.stringify(result, null, 2));
};

const upsertWorkspace = async (): Promise<void> => {
  const id = readOptionValue("--id");
  const name = readOptionValue("--name");
  const rootPath = readOptionValue("--root");
  if (!id || !name || !rootPath) {
    throw new Error("workspace set requires --id --name --root");
  }
  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number }>("/api/v1/workspaces", {
    id,
    name,
    rootPath,
    appCode: readOptionValue("--app") ?? null,
    defaultProviderId: readOptionValue("--provider") ?? null,
    defaultPromptTemplateId: readOptionValue("--prompt") ?? null,
    defaultSkillId: readOptionValue("--skill") ?? null,
    tags: parseTags(readOptionValue("--tags")),
    enabled: !process.argv.includes("--disabled")
  });
  console.log(JSON.stringify(result, null, 2));
};

const deleteWorkspace = async (id: string): Promise<void> => {
  const token = CONTROL_TOKEN ?? getLocalControlToken();
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}/api/v1/workspaces/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  console.log(JSON.stringify((await response.json()) as unknown, null, 2));
};

const printSessions = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/sessions");
  console.log(JSON.stringify(result, null, 2));
};

const resolveSession = async (id: string): Promise<void> => {
  const result = await readProtectedJson<{ item: unknown }>(`/api/v1/sessions/${encodeURIComponent(id)}/context`);
  console.log(JSON.stringify(result, null, 2));
};

const activateSession = async (id: string | null): Promise<void> => {
  const result = await postProtectedJson<Record<string, unknown>>("/api/v1/active-context/session", {
    sessionId: id
  });
  console.log(JSON.stringify(result, null, 2));
};

const printActiveContext = async (): Promise<void> => {
  const result = await readProtectedJson<Record<string, unknown>>("/api/v1/active-context");
  console.log(JSON.stringify(result, null, 2));
};

const resolveActiveContext = async (appCode: string): Promise<void> => {
  const query = new URLSearchParams();
  const workspaceId = readOptionValue("--workspace");
  const sessionId = readOptionValue("--session");
  const cwd = readOptionValue("--cwd");
  if (workspaceId) {
    query.set("workspaceId", workspaceId);
  }
  if (sessionId) {
    query.set("sessionId", sessionId);
  }
  if (cwd) {
    query.set("cwd", cwd);
  }
  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const result = await readProtectedJson<Record<string, unknown>>(
    `/api/v1/active-context/effective/${encodeURIComponent(appCode)}${suffix}`
  );
  console.log(JSON.stringify(result, null, 2));
};

const upsertSession = async (): Promise<void> => {
  const id = readOptionValue("--id");
  const appCode = readOptionValue("--app");
  const title = readOptionValue("--title");
  const cwd = readOptionValue("--cwd");
  if (!id || !appCode || !title || !cwd) {
    throw new Error("session set requires --id --app --title --cwd");
  }
  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number }>("/api/v1/sessions", {
    id,
    workspaceId: readOptionValue("--workspace") ?? null,
    appCode,
    title,
    cwd,
    providerId: readOptionValue("--provider") ?? null,
    promptTemplateId: readOptionValue("--prompt") ?? null,
    skillId: readOptionValue("--skill") ?? null,
    status: readOptionValue("--status") ?? "active",
    startedAt: readOptionValue("--started-at") ?? new Date().toISOString()
  });
  console.log(JSON.stringify(result, null, 2));
};

const ensureSession = async (): Promise<void> => {
  const appCode = readOptionValue("--app");
  const cwd = readOptionValue("--cwd");
  if (!appCode || !cwd) {
    throw new Error("session ensure requires --app --cwd");
  }

  const result = await postProtectedJson<Record<string, unknown>>("/api/v1/sessions/ensure", {
    appCode,
    cwd,
    title: readOptionValue("--title"),
    activate: process.argv.includes("--activate")
  });
  console.log(JSON.stringify(result, null, 2));
};

const deleteSession = async (id: string): Promise<void> => {
  const token = CONTROL_TOKEN ?? getLocalControlToken();
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}/api/v1/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  console.log(JSON.stringify((await response.json()) as unknown, null, 2));
};

const applyMcpHostConfig = async (appCode: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/mcp/host-sync/${encodeURIComponent(appCode)}/apply`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const rollbackMcpHostConfig = async (appCode: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/mcp/host-sync/${encodeURIComponent(appCode)}/rollback`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const printPromptHostCapabilities = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/prompt-host-sync/capabilities");
  console.log(JSON.stringify(result, null, 2));
};

const printPromptHostStates = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/prompt-host-sync/states");
  console.log(JSON.stringify(result, null, 2));
};

const printPromptHostBatchApplyPreview = async (): Promise<void> => {
  const result = await readProtectedJson<{ item: unknown }>("/api/v1/prompt-host-sync/preview-all");
  console.log(JSON.stringify(result, null, 2));
};

const applyPromptHostSyncAll = async (): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>("/api/v1/prompt-host-sync/apply-all", {});
  console.log(JSON.stringify(result, null, 2));
};

const printPromptHostApplyPreview = async (appCode: string): Promise<void> => {
  const result = await readProtectedJson<{ item: unknown }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/preview-apply`
  );
  console.log(JSON.stringify(result, null, 2));
};

const printPromptHostImportPreview = async (appCode: string): Promise<void> => {
  const result = await readProtectedJson<{ item: unknown }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/preview-import`
  );
  console.log(JSON.stringify(result, null, 2));
};

const importPromptFromHost = async (appCode: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number | null }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/import`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const applyPromptHostSync = async (appCode: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/apply`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const rollbackPromptHostSync = async (appCode: string): Promise<void> => {
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/prompt-host-sync/${encodeURIComponent(appCode)}/rollback`,
    {}
  );
  console.log(JSON.stringify(result, null, 2));
};

const importMcpFromHost = async (appCode: string): Promise<void> => {
  const existingServerStrategy = readOptionValue("--existing") ?? "overwrite";
  const missingBindingStrategy = readOptionValue("--missing-bindings") ?? "create";
  const result = await postProtectedJson<{ item: unknown }>(
    `/api/v1/mcp/import/${encodeURIComponent(appCode)}`,
    {
      existingServerStrategy,
      missingBindingStrategy
    }
  );
  console.log(JSON.stringify(result, null, 2));
};

const printProxyRequestLogs = async (): Promise<void> => {
  const query = new URLSearchParams();
  const appCode = readOptionValue("--app");
  const providerId = readOptionValue("--provider");
  const outcome = readOptionValue("--outcome");
  const method = readOptionValue("--method");
  const limit = readOptionValue("--limit");
  const offset = readOptionValue("--offset");

  if (appCode) {
    query.set("appCode", appCode);
  }
  if (providerId) {
    query.set("providerId", providerId);
  }
  if (outcome) {
    query.set("outcome", outcome);
  }
  if (method) {
    query.set("method", method);
  }
  if (limit) {
    query.set("limit", limit);
  }
  if (offset) {
    query.set("offset", offset);
  }

  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const result = await readProtectedJson<{
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/proxy-request-logs${suffix}`);
  console.log(JSON.stringify(result, null, 2));
};

const printAuditEvents = async (): Promise<void> => {
  const query = new URLSearchParams();
  const source = readOptionValue("--source");
  const appCode = readOptionValue("--app");
  const providerId = readOptionValue("--provider");
  const level = readOptionValue("--level");
  const limit = readOptionValue("--limit");
  const offset = readOptionValue("--offset");

  if (source) {
    query.set("source", source);
  }
  if (appCode) {
    query.set("appCode", appCode);
  }
  if (providerId) {
    query.set("providerId", providerId);
  }
  if (level) {
    query.set("level", level);
  }
  if (limit) {
    query.set("limit", limit);
  }
  if (offset) {
    query.set("offset", offset);
  }

  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const result = await readProtectedJson<{
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/audit/events${suffix}`);
  console.log(JSON.stringify(result, null, 2));
};

const printUsageRecords = async (): Promise<void> => {
  const query = new URLSearchParams();
  const appCode = readOptionValue("--app");
  const providerId = readOptionValue("--provider");
  const model = readOptionValue("--model");
  const startAt = readOptionValue("--start-at");
  const endAt = readOptionValue("--end-at");
  const limit = readOptionValue("--limit");
  const offset = readOptionValue("--offset");

  if (appCode) {
    query.set("appCode", appCode);
  }
  if (providerId) {
    query.set("providerId", providerId);
  }
  if (model) {
    query.set("model", model);
  }
  if (startAt) {
    query.set("startAt", startAt);
  }
  if (endAt) {
    query.set("endAt", endAt);
  }
  if (limit) {
    query.set("limit", limit);
  }
  if (offset) {
    query.set("offset", offset);
  }

  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const result = await readProtectedJson<{
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/v1/usage/records${suffix}`);
  console.log(JSON.stringify(result, null, 2));
};

const printUsageSummary = async (): Promise<void> => {
  const query = new URLSearchParams();
  const appCode = readOptionValue("--app");
  const providerId = readOptionValue("--provider");
  const model = readOptionValue("--model");
  const startAt = readOptionValue("--start-at");
  const endAt = readOptionValue("--end-at");

  if (appCode) {
    query.set("appCode", appCode);
  }
  if (providerId) {
    query.set("providerId", providerId);
  }
  if (model) {
    query.set("model", model);
  }
  if (startAt) {
    query.set("startAt", startAt);
  }
  if (endAt) {
    query.set("endAt", endAt);
  }

  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const result = await readProtectedJson<Record<string, unknown>>(`/api/v1/usage/summary${suffix}`);
  console.log(JSON.stringify(result, null, 2));
};

const printUsageTimeseries = async (): Promise<void> => {
  const query = new URLSearchParams();
  const appCode = readOptionValue("--app");
  const providerId = readOptionValue("--provider");
  const model = readOptionValue("--model");
  const startAt = readOptionValue("--start-at");
  const endAt = readOptionValue("--end-at");
  const bucket = readOptionValue("--bucket");

  if (appCode) {
    query.set("appCode", appCode);
  }
  if (providerId) {
    query.set("providerId", providerId);
  }
  if (model) {
    query.set("model", model);
  }
  if (startAt) {
    query.set("startAt", startAt);
  }
  if (endAt) {
    query.set("endAt", endAt);
  }
  if (bucket) {
    query.set("bucket", bucket);
  }

  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  const result = await readProtectedJson<Record<string, unknown>>(`/api/v1/usage/timeseries${suffix}`);
  console.log(JSON.stringify(result, null, 2));
};

const printQuotaStatuses = async (): Promise<void> => {
  const result = await readProtectedJson<{ items: unknown[] }>("/api/v1/app-quotas/statuses");
  console.log(JSON.stringify(result, null, 2));
};

const upsertQuota = async (): Promise<void> => {
  const id = readOptionValue("--id");
  const appCode = readOptionValue("--app");
  const period = readOptionValue("--period") ?? "day";
  const maxRequestsValue = readOptionValue("--max-requests");
  const maxTokensValue = readOptionValue("--max-tokens");
  const disabled = process.argv.includes("--disabled");

  if (!id) {
    throw new Error("quota set requires --id <id>");
  }
  if (!appCode) {
    throw new Error("quota set requires --app <appCode>");
  }

  const result = await postProtectedJson<{ item: unknown; snapshotVersion: number }>(
    "/api/v1/app-quotas",
    {
      id,
      appCode,
      enabled: !disabled,
      period,
      maxRequests: maxRequestsValue ? Number(maxRequestsValue) : null,
      maxTokens: maxTokensValue ? Number(maxTokensValue) : null
    }
  );
  console.log(JSON.stringify(result, null, 2));
};

const deleteQuota = async (id: string): Promise<void> => {
  const token = CONTROL_TOKEN ?? getLocalControlToken();
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}/api/v1/app-quotas/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  const result = (await response.json()) as { ok: boolean; snapshotVersion: number };
  console.log(JSON.stringify(result, null, 2));
};

const run = async (): Promise<void> => {
  if (command === undefined || command === "help" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "web") {
    await startWebServer();
    return;
  }

  if (command === "daemon" && subCommand === "service") {
    const serviceAction = process.argv[4];

    if (serviceAction === "print") {
      printUserService();
      return;
    }

    if (serviceAction === "env-path") {
      console.log(systemdEnvPath);
      return;
    }

    if (serviceAction === "print-env") {
      printUserServiceEnv();
      return;
    }

    if (serviceAction === "sync-env") {
      syncSystemdEnvFile();
      console.log(`synced environment file: ${systemdEnvPath}`);
      return;
    }

    if (serviceAction === "doctor") {
      await printUserServiceDoctor();
      return;
    }

    if (serviceAction === "install") {
      await installUserService();
      return;
    }

    if (serviceAction === "uninstall") {
      await uninstallUserService();
      return;
    }

    if (
      serviceAction === "start" ||
      serviceAction === "stop" ||
      serviceAction === "restart" ||
      serviceAction === "status"
    ) {
      if (serviceAction === "status") {
        await printUserServiceStatus();
        return;
      }
      await runSystemctlUser(serviceAction, "cc-switch-web.service");
      return;
    }
  }

  if (command === "status") {
    await printStatus();
    return;
  }

  if (command === "quickstart") {
    const appCode = process.argv[3];
    if (!appCode) {
      throw new Error("quickstart requires <appCode>");
    }
    await runQuickstart(appCode);
    return;
  }

  if (command === "active-context") {
    if (subCommand === "resolve") {
      const appCode = process.argv[4];
      if (!appCode) {
        throw new Error("active-context resolve requires <appCode>");
      }
      await resolveActiveContext(appCode);
      return;
    }

    await printActiveContext();
    return;
  }

  if (command === "host" && (subCommand === "scan" || subCommand === "matrix")) {
    await printHostDiscoveries();
    return;
  }

  if (command === "host" && subCommand === "capabilities") {
    await printHostCapabilities();
    return;
  }

  if (command === "host" && subCommand === "events") {
    await printHostEvents();
    return;
  }

  if (command === "host" && subCommand === "preview") {
    const appCode = process.argv[4];
    if (!appCode) {
      throw new Error("host preview requires <appCode>");
    }
    await printHostApplyPreview(appCode);
    return;
  }

  if (command === "host" && subCommand === "setup") {
    const appCode = process.argv[4];
    if (!appCode) {
      throw new Error("host setup requires <appCode>");
    }
    await setupHostConfig(appCode);
    return;
  }

  if (command === "host" && subCommand === "apply") {
    const appCode = process.argv[4];
    if (!appCode) {
      throw new Error("host apply requires <appCode>");
    }
    await applyHostConfig(appCode);
    return;
  }

  if (command === "host" && subCommand === "rollback") {
    const appCode = process.argv[4];
    if (!appCode) {
      throw new Error("host rollback requires <appCode>");
    }
    await rollbackHostConfig(appCode);
    return;
  }

  if (command === "health" && subCommand === "probe") {
    const providerId = process.argv[4];
    if (!providerId) {
      throw new Error("health probe requires <providerId>");
    }
    await probeProviderHealth(providerId);
    return;
  }

  if (command === "health" && subCommand === "isolate") {
    const providerId = process.argv[4];
    if (!providerId) {
      throw new Error("health isolate requires <providerId>");
    }
    await isolateProviderHealth(providerId);
    return;
  }

  if (command === "health" && subCommand === "recover") {
    const providerId = process.argv[4];
    if (!providerId) {
      throw new Error("health recover requires <providerId>");
    }
    await recoverProviderHealth(providerId);
    return;
  }

  if (command === "health" && subCommand === "reset") {
    const providerId = process.argv[4];
    if (!providerId) {
      throw new Error("health reset requires <providerId>");
    }
    await resetProviderHealth(providerId);
    return;
  }

  if (command === "mcp" && subCommand === "servers") {
    await printMcpServers();
    return;
  }

  if (command === "mcp" && subCommand === "bindings") {
    await printMcpBindings();
    return;
  }

  if (command === "mcp" && subCommand === "host" && process.argv[4] === "capabilities") {
    await printMcpHostCapabilities();
    return;
  }

  if (command === "mcp" && subCommand === "host" && process.argv[4] === "apply") {
    const appCode = process.argv[5];
    if (!appCode) {
      throw new Error("mcp host apply requires <appCode>");
    }
    await applyMcpHostConfig(appCode);
    return;
  }

  if (command === "mcp" && subCommand === "host" && process.argv[4] === "rollback") {
    const appCode = process.argv[5];
    if (!appCode) {
      throw new Error("mcp host rollback requires <appCode>");
    }
    await rollbackMcpHostConfig(appCode);
    return;
  }

  if (command === "mcp" && subCommand === "import") {
    const appCode = process.argv[4];
    if (!appCode) {
      throw new Error("mcp import requires <appCode>");
    }
    await importMcpFromHost(appCode);
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "capabilities") {
    await printPromptHostCapabilities();
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "states") {
    await printPromptHostStates();
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "preview-all") {
    await printPromptHostBatchApplyPreview();
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "apply-all") {
    await applyPromptHostSyncAll();
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "preview") {
    const appCode = process.argv[5];
    if (!appCode) {
      throw new Error("prompt host preview requires <appCode>");
    }
    await printPromptHostApplyPreview(appCode);
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "import-preview") {
    const appCode = process.argv[5];
    if (!appCode) {
      throw new Error("prompt host import-preview requires <appCode>");
    }
    await printPromptHostImportPreview(appCode);
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "import") {
    const appCode = process.argv[5];
    if (!appCode) {
      throw new Error("prompt host import requires <appCode>");
    }
    await importPromptFromHost(appCode);
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "apply") {
    const appCode = process.argv[5];
    if (!appCode) {
      throw new Error("prompt host apply requires <appCode>");
    }
    await applyPromptHostSync(appCode);
    return;
  }

  if (command === "prompt" && subCommand === "host" && process.argv[4] === "rollback") {
    const appCode = process.argv[5];
    if (!appCode) {
      throw new Error("prompt host rollback requires <appCode>");
    }
    await rollbackPromptHostSync(appCode);
    return;
  }

  if (command === "prompt" && subCommand === "list") {
    await printPromptTemplates();
    return;
  }

  if (command === "prompt" && subCommand === "set") {
    await upsertPromptTemplate();
    return;
  }

  if (command === "prompt" && subCommand === "delete") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("prompt delete requires <id>");
    }
    await deletePromptTemplate(id);
    return;
  }

  if (command === "skill" && subCommand === "list") {
    await printSkills();
    return;
  }

  if (command === "skill" && subCommand === "delivery" && process.argv[4] === "capabilities") {
    await printSkillDeliveryCapabilities();
    return;
  }

  if (command === "skill" && subCommand === "set") {
    await upsertSkill();
    return;
  }

  if (command === "skill" && subCommand === "delete") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("skill delete requires <id>");
    }
    await deleteSkill(id);
    return;
  }

  if (command === "assets" && subCommand === "governance" && process.argv[4] === "preview") {
    await printAssetGovernancePreview();
    return;
  }

  if (command === "assets" && subCommand === "governance" && process.argv[4] === "repair") {
    await repairAssetGovernance();
    return;
  }

  if (command === "workspace" && subCommand === "list") {
    await printWorkspaces();
    return;
  }

  if (command === "workspace" && subCommand === "discover") {
    await discoverWorkspaces();
    return;
  }

  if (command === "workspace" && subCommand === "import") {
    await importWorkspaceCandidate();
    return;
  }

  if (command === "workspace" && subCommand === "import-auto") {
    await importWorkspaceCandidates();
    return;
  }

  if (command === "workspace" && subCommand === "set") {
    await upsertWorkspace();
    return;
  }

  if (command === "workspace" && subCommand === "resolve") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("workspace resolve requires <id>");
    }
    await resolveWorkspace(id);
    return;
  }

  if (command === "workspace" && subCommand === "activate") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("workspace activate requires <id>|none");
    }
    await activateWorkspace(id === "none" ? null : id);
    return;
  }

  if (command === "workspace" && subCommand === "delete") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("workspace delete requires <id>");
    }
    await deleteWorkspace(id);
    return;
  }

  if (command === "session" && subCommand === "list") {
    await printSessions();
    return;
  }

  if (command === "session" && subCommand === "set") {
    await upsertSession();
    return;
  }

  if (command === "session" && subCommand === "ensure") {
    await ensureSession();
    return;
  }

  if (command === "session" && subCommand === "resolve") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("session resolve requires <id>");
    }
    await resolveSession(id);
    return;
  }

  if (command === "session" && subCommand === "activate") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("session activate requires <id>|none");
    }
    await activateSession(id === "none" ? null : id);
    return;
  }

  if (command === "session" && subCommand === "delete") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("session delete requires <id>");
    }
    await deleteSession(id);
    return;
  }

  if (command === "logs" && subCommand === "requests") {
    await printProxyRequestLogs();
    return;
  }

  if (command === "usage" && subCommand === "records") {
    await printUsageRecords();
    return;
  }

  if (command === "usage" && subCommand === "summary") {
    await printUsageSummary();
    return;
  }

  if (command === "usage" && subCommand === "timeseries") {
    await printUsageTimeseries();
    return;
  }

  if (command === "quota" && subCommand === "list") {
    await printQuotaStatuses();
    return;
  }

  if (command === "quota" && subCommand === "set") {
    await upsertQuota();
    return;
  }

  if (command === "quota" && subCommand === "delete") {
    const id = process.argv[4];
    if (!id) {
      throw new Error("quota delete requires <id>");
    }
    await deleteQuota(id);
    return;
  }

  if (command === "audit" && subCommand === "events") {
    await printAuditEvents();
    return;
  }

  if (command === "auth" && subCommand === "print-token") {
    await printControlTokenFromDaemon();
    return;
  }

  if (command === "auth" && subCommand === "rotate-token") {
    await rotateControlTokenFromDaemon();
    return;
  }

  if (command === "daemon" && (subCommand === undefined || subCommand === "start")) {
    if (!existsSync(daemonEntry)) {
      console.error("apps/daemon/dist 不存在，请先执行 npm run build");
      process.exit(1);
    }

    await import(daemonEntry);
    return;
  }

  printUsage();
  process.exitCode = 1;
};

void run();
