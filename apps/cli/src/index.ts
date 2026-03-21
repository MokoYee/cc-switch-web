#!/usr/bin/env node

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

const DAEMON_HOST = process.env.AICLI_SWITCH_DAEMON_HOST ?? process.env.AICLI_SWITCH_HOST ?? "127.0.0.1";
const DAEMON_PORT = Number.parseInt(
  process.env.AICLI_SWITCH_DAEMON_PORT ?? process.env.AICLI_SWITCH_PORT ?? "8787",
  10
);
const WEB_HOST = process.env.AICLI_SWITCH_WEB_HOST ?? "127.0.0.1";
const WEB_PORT = Number.parseInt(process.env.AICLI_SWITCH_WEB_PORT ?? "8788", 10);
const CONTROL_TOKEN = process.env.AICLI_SWITCH_CONTROL_TOKEN?.trim();
const DATA_DIR = resolve(process.env.AICLI_SWITCH_DATA_DIR ?? join(homedir(), ".ai-cli-switch"));
const DB_PATH = resolve(process.env.AICLI_SWITCH_DB_PATH ?? join(DATA_DIR, "ai-cli-switch.sqlite"));
const cliEntry = fileURLToPath(import.meta.url);
const cliDistDir = dirname(cliEntry);
const workspaceRoot = resolve(cliDistDir, "../../..");
const daemonEntry = resolve(workspaceRoot, "apps/daemon/dist/index.js");
const webDistDir = resolve(workspaceRoot, "apps/web/dist");
const systemdUserDir = resolve(homedir(), ".config/systemd/user");
const aiCliSwitchConfigDir = resolve(homedir(), ".config/ai-cli-switch");
const systemdUnitPath = resolve(systemdUserDir, "ai-cli-switch.service");
const systemdEnvPath = resolve(aiCliSwitchConfigDir, "daemon.env");

const command = process.argv[2];
const subCommand = process.argv[3];

const printUsage = (): void => {
  console.log(`ai-cli-switch <command>

Commands:
  ai-cli-switch daemon start    Start the daemon in foreground
  ai-cli-switch daemon service print
  ai-cli-switch daemon service install
  ai-cli-switch daemon service uninstall
  ai-cli-switch daemon service start|stop|restart|status
  ai-cli-switch web             Serve the web console on demand
  ai-cli-switch status          Query daemon health and runtime
  ai-cli-switch auth print-token
  ai-cli-switch auth rotate-token

Environment:
  AICLI_SWITCH_DAEMON_HOST / AICLI_SWITCH_DAEMON_PORT
  AICLI_SWITCH_WEB_HOST / AICLI_SWITCH_WEB_PORT
  AICLI_SWITCH_CONTROL_TOKEN
  AICLI_SWITCH_DATA_DIR / AICLI_SWITCH_DB_PATH
  ALLOWED_ORIGINS
`);
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
    throw new Error("AICLI_SWITCH_CONTROL_TOKEN is set in environment; rotate token via environment config");
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
Description=AI CLI Switch daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=-${systemdEnvPath}
ExecStart=${process.execPath} ${cliEntry} daemon start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`;

const ensureSystemdEnvFile = (): void => {
  mkdirSync(aiCliSwitchConfigDir, { recursive: true });

  if (existsSync(systemdEnvPath)) {
    return;
  }

  writeFileSync(
    systemdEnvPath,
    `# AI CLI Switch user service environment
# AICLI_SWITCH_DAEMON_HOST=127.0.0.1
# AICLI_SWITCH_DAEMON_PORT=8787
# ALLOWED_ORIGINS=http://127.0.0.1:8788,http://localhost:8788
# AICLI_SWITCH_DATA_DIR=${DATA_DIR}
# AICLI_SWITCH_DB_PATH=${DB_PATH}
# AICLI_SWITCH_CONTROL_TOKEN=
`,
    "utf-8"
  );
};

const runSystemctlUser = async (...args: string[]): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
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

const printUserService = (): void => {
  console.log(`# unit: ${systemdUnitPath}`);
  console.log(`# env: ${systemdEnvPath}`);
  console.log(getSystemdUnitContent());
};

const installUserService = async (): Promise<void> => {
  mkdirSync(systemdUserDir, { recursive: true });
  ensureSystemdEnvFile();
  writeFileSync(systemdUnitPath, getSystemdUnitContent(), "utf-8");
  await runSystemctlUser("daemon-reload");
  await runSystemctlUser("enable", "--now", "ai-cli-switch.service");
  console.log(`installed user service: ${systemdUnitPath}`);
  console.log(`environment file: ${systemdEnvPath}`);
};

const uninstallUserService = async (): Promise<void> => {
  if (existsSync(systemdUnitPath)) {
    try {
      await runSystemctlUser("disable", "--now", "ai-cli-switch.service");
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
  const requestInit: RequestInit = CONTROL_TOKEN
    ? { headers: { Authorization: `Bearer ${CONTROL_TOKEN}` } }
    : {};
  const response = await fetch(`http://${DAEMON_HOST}:${DAEMON_PORT}${path}`, requestInit);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
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

    if (requestPath === "/ai-cli-switch-runtime.js") {
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(
        `window.AICLI_SWITCH_API_BASE_URL = "http://${DAEMON_HOST}:${DAEMON_PORT}";`
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
    console.log(`ai-cli-switch web listening on http://${WEB_HOST}:${WEB_PORT}`);
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
      reason: "Protected runtime endpoint requires AICLI_SWITCH_CONTROL_TOKEN or an authenticated UI session"
    };
    proxyRuntime = {
      unavailable: true,
      reason: "Protected proxy runtime endpoint requires AICLI_SWITCH_CONTROL_TOKEN or an authenticated UI session"
    };
  }

  console.log(JSON.stringify({ health, authState, runtime, proxyRuntime, dbPath: DB_PATH }, null, 2));
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
      await runSystemctlUser(serviceAction, "ai-cli-switch.service");
      return;
    }
  }

  if (command === "status") {
    await printStatus();
    return;
  }

  if (command === "auth" && subCommand === "print-token") {
    console.log(getLocalControlToken());
    return;
  }

  if (command === "auth" && subCommand === "rotate-token") {
    console.log(rotateLocalControlToken());
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
