import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const STARTUP_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;
const LOG_HISTORY_LIMIT = 80;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DAEMON_ENTRY = resolve(REPO_ROOT, "apps/daemon/dist/index.cjs");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertIncludes = (collection, expected, message) => {
  assert(collection.includes(expected), `${message}: ${expected}`);
};

// 使用系统分配的临时端口，避免 smoke 与本机常驻 daemon 端口冲突。
const reservePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("failed to resolve smoke daemon port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });

// 仅保留最近一段 daemon 日志，失败时输出关键上下文，避免 CI 日志失控。
const createRecentLogBuffer = () => {
  const lines = [];

  const appendChunk = (chunk) => {
    const value = chunk.toString("utf8");
    for (const line of value.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      lines.push(line);
      if (lines.length > LOG_HISTORY_LIMIT) {
        lines.shift();
      }
    }
  };

  return {
    appendChunk,
    format() {
      return lines.join("\n");
    }
  };
};

const fetchWithTimeout = async (url, init = {}) =>
  fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init
  });

const getProtectedHeaders = (token, extraHeaders = {}) => ({
  Authorization: `Bearer ${token}`,
  ...extraHeaders
});

const readJson = async (url, init) => {
  const response = await fetchWithTimeout(url, init);
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  assert(
    contentType.includes("application/json"),
    `expected JSON response from ${url}, got ${contentType || "unknown content-type"}`
  );

  return {
    response,
    body: JSON.parse(text)
  };
};

const readText = async (url, init) => {
  const response = await fetchWithTimeout(url, init);
  return {
    response,
    body: await response.text()
  };
};

const readProtectedJson = async (baseUrl, path, token, init = {}) =>
  readJson(`${baseUrl}${path}`, {
    ...init,
    headers: getProtectedHeaders(token, init.headers ?? {})
  });

const readProtectedText = async (baseUrl, path, token, init = {}) =>
  readText(`${baseUrl}${path}`, {
    ...init,
    headers: getProtectedHeaders(token, init.headers ?? {})
  });

const postProtectedJson = async (baseUrl, path, token, body = {}, init = {}) =>
  readJson(`${baseUrl}${path}`, {
    method: "POST",
    ...init,
    headers: getProtectedHeaders(token, {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }),
    body: JSON.stringify(body)
  });

const deleteProtectedJson = async (baseUrl, path, token, init = {}) =>
  readJson(`${baseUrl}${path}`, {
    method: "DELETE",
    ...init,
    headers: getProtectedHeaders(token, init.headers ?? {})
  });

const writeJsonFile = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const seedHostFiles = async (homeDir) => {
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await writeFile(
    join(homeDir, ".codex/config.toml"),
    [
      'model_provider = "custom"',
      "",
      "[model_providers.custom]",
      'base_url = "https://api.example.com/v1"'
    ].join("\n"),
    "utf8"
  );

  await mkdir(join(homeDir, ".gemini"), { recursive: true });
  await writeJsonFile(join(homeDir, ".gemini/settings.json"), {
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
  });
};

const runHostTakeoverSmoke = async (baseUrl, token, homeDir) => {
  const codexConfigPath = join(homeDir, ".codex/config.toml");
  const originalConfig = await readFile(codexConfigPath, "utf8");

  const preview = await readProtectedJson(
    baseUrl,
    "/api/v1/host-discovery/codex/preview-apply",
    token
  );
  assert(preview.response.ok, "expected host takeover preview to return 200");
  assert(preview.body.item.appCode === "codex", "expected codex host takeover preview");
  assert(preview.body.item.lifecycleMode === "foreground-session", "expected foreground lifecycle mode");
  assert(
    preview.body.item.validationChecklist.length >= 3,
    "expected host takeover preview to include validation guidance"
  );

  const applyResult = await postProtectedJson(
    baseUrl,
    "/api/v1/host-discovery/codex/apply",
    token
  );
  assert(applyResult.body.item.integrationState === "managed", "expected codex host takeover apply");

  const appliedConfig = await readFile(codexConfigPath, "utf8");
  assert(
    appliedConfig.includes('model_provider = "cc_switch_web"'),
    "expected codex host config to point at cc_switch_web"
  );
  assert(
    appliedConfig.includes('base_url = "http://127.0.0.1:'),
    "expected codex host config to target the local proxy"
  );

  const discoveries = await readProtectedJson(baseUrl, "/api/v1/host-discovery", token);
  const codexDiscovery = discoveries.body.items.find((item) => item.appCode === "codex") ?? null;
  assert(codexDiscovery?.integrationState === "managed", "expected codex discovery to report managed state");

  const rollbackResult = await postProtectedJson(
    baseUrl,
    "/api/v1/host-discovery/codex/rollback",
    token
  );
  assert(
    rollbackResult.body.item.integrationState === "unmanaged",
    "expected codex host takeover rollback"
  );

  const rolledBackConfig = await readFile(codexConfigPath, "utf8");
  assert(rolledBackConfig === originalConfig, "expected codex host config rollback to restore original content");
};

const upsertMcpServer = async (baseUrl, token, payload) => {
  const result = await postProtectedJson(baseUrl, "/api/v1/mcp/servers", token, payload);
  assert(result.response.ok, `expected MCP server upsert to succeed for ${payload.id}`);
  return result.body;
};

const upsertMcpBinding = async (baseUrl, token, payload) => {
  const result = await postProtectedJson(baseUrl, "/api/v1/mcp/app-bindings", token, payload);
  assert(result.response.ok, `expected MCP binding upsert to succeed for ${payload.id}`);
  return result.body;
};

const runMcpGovernanceSmoke = async (baseUrl, token, homeDir) => {
  const geminiConfigPath = join(homeDir, ".gemini/settings.json");
  const originalGeminiConfig = await readFile(geminiConfigPath, "utf8");

  const importPreview = await readProtectedJson(
    baseUrl,
    "/api/v1/mcp/import/gemini-cli/preview",
    token
  );
  assert(importPreview.response.ok, "expected MCP import preview to return 200");
  assert(importPreview.body.item.totalDiscovered === 2, "expected two MCP servers from gemini host config");
  assertIncludes(
    importPreview.body.item.newServerIds,
    "filesystem",
    "expected gemini MCP preview to include filesystem"
  );
  assertIncludes(
    importPreview.body.item.newServerIds,
    "remote",
    "expected gemini MCP preview to include remote"
  );

  const importResult = await postProtectedJson(
    baseUrl,
    "/api/v1/mcp/import/gemini-cli",
    token
  );
  assert(importResult.body.item.importedCount === 2, "expected MCP import to persist two gemini servers");
  assertIncludes(
    importResult.body.item.importedServerIds,
    "filesystem",
    "expected MCP import result to include filesystem"
  );
  assertIncludes(
    importResult.body.item.importedServerIds,
    "remote",
    "expected MCP import result to include remote"
  );

  await upsertMcpServer(baseUrl, token, {
    id: "smoke-broken-server",
    name: "Smoke Broken Server",
    transport: "stdio",
    command: null,
    args: [],
    url: null,
    env: {},
    headers: {},
    enabled: true
  });
  await upsertMcpBinding(baseUrl, token, {
    id: "gemini-cli-smoke-broken-server",
    appCode: "gemini-cli",
    serverId: "smoke-broken-server",
    enabled: true
  });

  const governancePreview = await readProtectedJson(
    baseUrl,
    "/api/v1/mcp/governance/gemini-cli/preview",
    token
  );
  assert(
    governancePreview.body.item.plannedActions.length > 0,
    "expected MCP governance preview to find repair actions"
  );
  assertIncludes(
    governancePreview.body.item.plannedActions.map((item) => item.action),
    "disable-duplicate-bindings",
    "expected MCP governance preview to disable duplicate bindings"
  );
  assertIncludes(
    governancePreview.body.item.plannedActions.map((item) => item.action),
    "disable-invalid-bindings",
    "expected MCP governance preview to disable invalid bindings"
  );

  const governanceRepair = await postProtectedJson(
    baseUrl,
    "/api/v1/mcp/governance/gemini-cli/repair",
    token
  );
  assertIncludes(
    governanceRepair.body.item.executedActions,
    "disable-duplicate-bindings",
    "expected MCP governance repair to execute duplicate binding repair"
  );
  assertIncludes(
    governanceRepair.body.item.executedActions,
    "disable-invalid-bindings",
    "expected MCP governance repair to execute invalid binding repair"
  );

  const runtimeAfterRepair = await readProtectedJson(
    baseUrl,
    "/api/v1/mcp/runtime/gemini-cli",
    token
  );
  assert(runtimeAfterRepair.body.item.status === "healthy", "expected gemini MCP runtime to converge after repair");
  const brokenBinding =
    runtimeAfterRepair.body.item.items.find((item) => item.bindingId === "gemini-cli-smoke-broken-server") ??
    null;
  assert(brokenBinding?.bindingEnabled === false, "expected broken MCP binding to be disabled after repair");
  const remoteBinding =
    runtimeAfterRepair.body.item.items.find((item) => item.bindingId === "gemini-cli-remote") ?? null;
  assert(remoteBinding?.bindingEnabled === false, "expected duplicate gemini MCP binding to be disabled after repair");
  assert(runtimeAfterRepair.body.item.enabledBindings === 1, "expected gemini MCP runtime to keep a single active binding");

  const hostSyncPreview = await readProtectedJson(
    baseUrl,
    "/api/v1/mcp/host-sync/gemini-cli/preview-apply",
    token
  );
  assert(hostSyncPreview.body.item.configPath.endsWith(".gemini/settings.json"), "expected gemini host sync preview path");
  assertIncludes(
    hostSyncPreview.body.item.nextManagedServerIds,
    "filesystem",
    "expected gemini host sync preview to include filesystem"
  );
  assert(
    hostSyncPreview.body.item.nextManagedServerIds.length === 1,
    "expected gemini host sync preview to keep only one managed server after governance convergence"
  );

  const hostSyncApply = await postProtectedJson(
    baseUrl,
    "/api/v1/mcp/host-sync/gemini-cli/apply",
    token
  );
  assert(hostSyncApply.body.item.action === "apply", "expected gemini host sync apply to succeed");

  const syncedGeminiConfig = JSON.parse(await readFile(geminiConfigPath, "utf8"));
  assertIncludes(
    syncedGeminiConfig.ccSwitchWebManagedMcpServers,
    "filesystem",
    "expected gemini host sync config to record filesystem as managed"
  );
  assert(
    syncedGeminiConfig.ccSwitchWebManagedMcpServers.length === 1,
    "expected gemini host sync config to persist only one managed server"
  );
  assert(
    syncedGeminiConfig.mcpServers.filesystem?.timeout === 60000,
    "expected gemini host sync to normalize managed stdio server shape"
  );

  const hostSyncRollback = await postProtectedJson(
    baseUrl,
    "/api/v1/mcp/host-sync/gemini-cli/rollback",
    token
  );
  assert(hostSyncRollback.body.item.action === "rollback", "expected gemini host sync rollback to succeed");

  const rolledBackGeminiConfig = await readFile(geminiConfigPath, "utf8");
  assert(
    rolledBackGeminiConfig === originalGeminiConfig,
    "expected gemini host sync rollback to restore original host config"
  );
};

const runSnapshotRestoreSmoke = async (baseUrl, token) => {
  const promptId = "smoke-restore-prompt";
  const promptCreate = await postProtectedJson(baseUrl, "/api/v1/prompts", token, {
    id: promptId,
    name: "Smoke Restore Prompt",
    appCode: "codex",
    locale: "zh-CN",
    content: "Restore prompt content",
    tags: ["smoke", "restore"],
    enabled: true
  });
  const createdSnapshotVersion = promptCreate.body.snapshotVersion;
  assert(Number.isInteger(createdSnapshotVersion), "expected prompt save to create a snapshot");

  const promptDelete = await deleteProtectedJson(
    baseUrl,
    `/api/v1/prompts/${encodeURIComponent(promptId)}`,
    token
  );
  assert(promptDelete.body.ok === true, "expected prompt delete to succeed");

  const restorePreview = await readProtectedJson(
    baseUrl,
    `/api/v1/snapshots/${createdSnapshotVersion}/restore-preview`,
    token
  );
  assert(
    restorePreview.body.item.targetVersion === createdSnapshotVersion,
    "expected snapshot restore preview to target the saved prompt snapshot"
  );
  assert(
    restorePreview.body.item.impact.summary.length > 0,
    "expected snapshot restore preview to expose impact details"
  );

  const restoreResult = await postProtectedJson(
    baseUrl,
    `/api/v1/snapshots/${createdSnapshotVersion}/restore`,
    token
  );
  assert(
    restoreResult.body.restoredFromVersion === createdSnapshotVersion,
    "expected snapshot restore to use the target prompt snapshot"
  );

  const prompts = await readProtectedJson(baseUrl, "/api/v1/prompts", token);
  const restoredPrompt = prompts.body.items.find((item) => item.id === promptId) ?? null;
  assert(restoredPrompt !== null, "expected prompt to be restored by snapshot restore");

  const latestSnapshot = await readProtectedJson(baseUrl, "/api/v1/snapshots/latest", token);
  assert(
    latestSnapshot.body.version > createdSnapshotVersion,
    "expected snapshot restore to create a new latest snapshot"
  );
};

const extractSessionCookie = (response) => {
  const rawCookie = response.headers.get("set-cookie");
  assert(rawCookie, "control auth session cookie was not returned");
  return rawCookie.split(";")[0];
};

const waitForHealth = async (baseUrl, childProcess) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (childProcess.exitCode !== null) {
      throw new Error(`daemon exited before becoming healthy with code ${childProcess.exitCode}`);
    }

    try {
      const { response, body } = await readJson(`${baseUrl}/health`);
      if (response.ok && body.status === "ok") {
        return body;
      }
    } catch {}

    await delay(500);
  }

  throw new Error("daemon health probe timed out");
};

const stopDaemon = async (childProcess) => {
  if (childProcess.exitCode !== null) {
    return;
  }

  childProcess.kill("SIGTERM");
  const exitPromise = once(childProcess, "exit");
  const timeoutPromise = delay(5_000).then(async () => {
    if (childProcess.exitCode === null) {
      childProcess.kill("SIGKILL");
      await exitPromise;
    }
  });

  await Promise.race([exitPromise, timeoutPromise]);
};

const main = async () => {
  const controlToken = "smoke-control-token";
  const rootDir = await mkdtemp(join(tmpdir(), "ccsw-daemon-smoke-"));
  const dataDir = join(rootDir, "data");
  const homeDir = join(rootDir, "home");
  const launchDir = join(rootDir, "launch");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const recentLogs = createRecentLogBuffer();

  await mkdir(dataDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(launchDir, { recursive: true });
  await seedHostFiles(homeDir);

  // WARNING: smoke 必须使用独立数据目录，不能污染用户真实 SQLite 与控制令牌状态。
  const childProcess = spawn(process.execPath, [DAEMON_ENTRY], {
    // 故意从非仓库根目录启动，确保 daemon 不依赖 cwd 才能找到 UI 资源。
    cwd: launchDir,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      CCSW_CONTROL_TOKEN: controlToken,
      CCSW_CONTROL_UI_PATH: "/ui",
      CCSW_DATA_DIR: dataDir,
      CCSW_DAEMON_HOST: "127.0.0.1",
      CCSW_DAEMON_PORT: String(port),
      CCSW_RUN_MODE: "foreground"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  childProcess.stdout.on("data", recentLogs.appendChunk);
  childProcess.stderr.on("data", recentLogs.appendChunk);

  try {
    const health = await waitForHealth(baseUrl, childProcess);
    assert(health.service === "CC Switch Web-daemon", "unexpected daemon identity in /health");

    // 先验证控制台确实受保护，避免把未鉴权暴露误判成“可用”。
    const unauthenticatedUi = await fetchWithTimeout(`${baseUrl}/ui/`);
    assert(
      unauthenticatedUi.status === 401 ||
        (unauthenticatedUi.status >= 300 && unauthenticatedUi.status < 400),
      "expected /ui/ to require login before authentication"
    );

    const metrics = await readText(`${baseUrl}/metrics`);
    assert(metrics.response.ok, "expected /metrics to return 200");
    assert(
      metrics.body.includes("# HELP ccsw_daemon_info") &&
        metrics.body.includes("ccsw_proxy_runtime_state"),
      "expected /metrics to expose daemon and proxy runtime gauges"
    );

    const authStateBefore = await readJson(`${baseUrl}/api/v1/auth/state`);
    assert(authStateBefore.body.authenticated === false, "expected unauthenticated auth state");

    const loginResponse = await fetchWithTimeout(`${baseUrl}/api/v1/auth/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        token: controlToken
      })
    });
    assert(loginResponse.ok, "expected control token login to succeed");

    const sessionCookie = extractSessionCookie(loginResponse);
    const authenticatedHeaders = {
      cookie: sessionCookie
    };

    const authStateAfter = await readJson(`${baseUrl}/api/v1/auth/state`, {
      headers: authenticatedHeaders
    });
    assert(authStateAfter.body.authenticated === true, "expected authenticated auth state");

    // 登录后再打 bootstrap，确认控制台主链路不是只有静态壳可访问。
    const bootstrap = await readJson(`${baseUrl}/api/v1/dashboard/bootstrap`, {
      headers: authenticatedHeaders
    });
    assert(bootstrap.response.ok, "expected dashboard bootstrap to return 200");
    assert(bootstrap.body.health?.status === "ok", "expected dashboard bootstrap health summary");
    assert(
      bootstrap.body.metadata?.webConsole?.mountPath === "/ui",
      "expected dashboard bootstrap to expose the configured /ui mount path"
    );

    const authenticatedUi = await readText(`${baseUrl}/ui/`, {
      headers: authenticatedHeaders
    });
    assert(authenticatedUi.response.ok, "expected authenticated /ui/ request to return 200");
    assert(
      authenticatedUi.body.includes("<div id=\"root\"></div>"),
      "expected authenticated /ui/ response to serve the built web shell"
    );

    await readProtectedText(baseUrl, "/cc-switch-web-runtime.js", controlToken);
    await runHostTakeoverSmoke(baseUrl, controlToken, homeDir);
    await runMcpGovernanceSmoke(baseUrl, controlToken, homeDir);
    await runSnapshotRestoreSmoke(baseUrl, controlToken);

    console.log(`daemon smoke passed on ${baseUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const formattedLogs = recentLogs.format();
    if (formattedLogs) {
      console.error("recent daemon logs:");
      console.error(formattedLogs);
    }
    throw new Error(`daemon smoke failed: ${message}`);
  } finally {
    await stopDaemon(childProcess);
    await rm(rootDir, { force: true, recursive: true });
  }
};

await main();
