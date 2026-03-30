import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DAEMON_ENTRY = resolve(REPO_ROOT, "apps/daemon/dist/index.cjs");
const daemonHost = process.env.PLAYWRIGHT_DAEMON_HOST ?? "127.0.0.1";
const daemonPort = process.env.PLAYWRIGHT_DAEMON_PORT ?? "18911";
const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";

const rootDir = await mkdtemp(join(tmpdir(), "ccsw-playwright-daemon-"));
const dataDir = join(rootDir, "data");
const homeDir = join(rootDir, "home");
const launchDir = join(rootDir, "launch");

const seedHostFiles = async () => {
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await writeFile(
    join(homeDir, ".codex/config.toml"),
    [
      'model_provider = "custom"',
      "",
      "# BEGIN AI CLI Switch MCP",
      "[mcp_servers.old]",
      'command = "npx"',
      "# END AI CLI Switch MCP"
    ].join("\n"),
    "utf8"
  );
};

await mkdir(dataDir, { recursive: true });
await mkdir(homeDir, { recursive: true });
await mkdir(launchDir, { recursive: true });
await seedHostFiles();

const childProcess = spawn(process.execPath, [DAEMON_ENTRY], {
  cwd: launchDir,
  env: {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    AICLI_SWITCH_CONTROL_TOKEN: controlToken,
    AICLI_SWITCH_CONTROL_UI_PATH: "/ui",
    AICLI_SWITCH_DATA_DIR: dataDir,
    AICLI_SWITCH_DAEMON_HOST: daemonHost,
    AICLI_SWITCH_DAEMON_PORT: daemonPort,
    AICLI_SWITCH_RUN_MODE: "foreground"
  },
  stdio: "inherit"
});

let shuttingDown = false;

const cleanup = async (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (childProcess.exitCode === null) {
    childProcess.kill("SIGTERM");
    await Promise.race([
      once(childProcess, "exit"),
      new Promise((resolve) => setTimeout(resolve, 5_000))
    ]);
    if (childProcess.exitCode === null) {
      childProcess.kill("SIGKILL");
      await once(childProcess, "exit").catch(() => undefined);
    }
  }

  await rm(rootDir, { force: true, recursive: true });
  process.exit(exitCode);
};

process.on("SIGINT", () => {
  void cleanup(0);
});
process.on("SIGTERM", () => {
  void cleanup(0);
});

childProcess.on("exit", (code) => {
  void cleanup(code ?? 0);
});
