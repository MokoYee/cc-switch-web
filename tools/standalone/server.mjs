import { createServer } from "node:http";
import { accessSync, constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const host = process.env.AICLI_SWITCH_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.AICLI_SWITCH_PORT ?? "8787", 10);

const providers = [
  {
    id: "provider-openai-main",
    name: "Primary OpenAI Gateway",
    providerType: "openai-compatible",
    baseUrl: "https://api.openai.example.com/v1",
    apiKeyMasked: "sk-****main",
    enabled: true,
    timeoutMs: 30000,
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:00:00.000Z"
  },
  {
    id: "provider-anthropic-fallback",
    name: "Anthropic Fallback",
    providerType: "anthropic",
    baseUrl: "https://api.anthropic.example.com",
    apiKeyMasked: "ak-****back",
    enabled: true,
    timeoutMs: 45000,
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:00:00.000Z"
  }
];

const bindings = [
  {
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-openai-main",
    mode: "managed",
    updatedAt: "2026-03-21T00:00:00.000Z"
  },
  {
    id: "binding-claude-code",
    appCode: "claude-code",
    providerId: "provider-anthropic-fallback",
    mode: "observe",
    updatedAt: "2026-03-21T00:00:00.000Z"
  }
];

const resolveCandidatePath = (binaryName) => {
  const pathEntries = (process.env.PATH ?? "").split(":").filter(Boolean);

  for (const directory of pathEntries) {
    const candidate = `${directory}/${binaryName}`;

    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // WARNING: 保持第一阶段扫描逻辑简单，
      // 但至少要避免把不可执行文件误判成已安装 CLI。
    }
  }

  return null;
};

const codexPath = resolveCandidatePath("codex");
const claudePath = resolveCandidatePath("claude");
const geminiPath = resolveCandidatePath("gemini");

const discoveries = [
  {
    appCode: "codex",
    discovered: codexPath !== null,
    executablePath: codexPath,
    configPath: null,
    status: codexPath !== null ? "discovered" : "missing"
  },
  {
    appCode: "claude-code",
    discovered: claudePath !== null,
    executablePath: claudePath,
    configPath: null,
    status: claudePath !== null ? "discovered" : "missing"
  },
  {
    appCode: "gemini-cli",
    discovered: geminiPath !== null,
    executablePath: geminiPath,
    configPath: null,
    status: geminiPath !== null ? "discovered" : "missing"
  },
  {
    appCode: "opencode",
    discovered: false,
    executablePath: null,
    configPath: null,
    status: "missing"
  },
  {
    appCode: "openclaw",
    discovered: false,
    executablePath: null,
    configPath: null,
    status: "missing"
  }
];

const proxyPolicy = {
  policy: {
    listenHost: "127.0.0.1",
    listenPort: 8788,
    enabled: false,
    requestTimeoutMs: 60000,
    failureThreshold: 3
  },
  runtimeState: "stopped"
};

const systemMetadata = {
  projectName: "AI CLI Switch",
  releaseStage: "bootstrap",
  repositoryMode: "open-source-ready",
  deliveryTargets: ["host-native", "docker-secondary"],
  supportedLocales: ["zh-CN", "en-US"],
  defaultLocale: "zh-CN",
  daemon: {
    defaultHost: "127.0.0.1",
    defaultPort: 8787,
    allowedOriginsEnvKey: "ALLOWED_ORIGINS",
    defaultAllowedOrigins: [
      "http://127.0.0.1:8788",
      "http://localhost:8788"
    ]
  },
  webConsole: {
    enabledOnDemand: true,
    recommendedCommand: "ai-cli-switch web",
    defaultPort: 8788,
    integratedIntoDaemon: true,
    mountPath: "/ui",
    authMode: "token-cookie"
  }
};

const systemRuntime = {
  daemonHost: host,
  daemonPort: port,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://127.0.0.1:8788,http://localhost:8788")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  allowAnyOrigin: (process.env.ALLOWED_ORIGINS ?? "").includes("*")
};

const exportPackage = () => ({
  version: "0.1.0",
  exportedAt: new Date().toISOString(),
  providers,
  bindings
});

const sendJson = (response, payload) => {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
};

const sendNotFound = (response) => {
  response.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify({ message: "Not Found" }));
};

const sendHtml = async (response) => {
  const html = await readFile(join(process.cwd(), "tools", "standalone", "dashboard.html"), "utf-8");
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
};

export const server = createServer(async (request, response) => {
  const { url = "/" } = request;

  if (url === "/" || url === "/index.html") {
    await sendHtml(response);
    return;
  }

  if (url === "/health") {
    sendJson(response, {
      status: "ok",
      service: "AI CLI Switch-standalone",
      time: new Date().toISOString()
    });
    return;
  }

  if (url === "/api/v1/providers") {
    sendJson(response, { items: providers });
    return;
  }

  if (url === "/api/v1/app-bindings") {
    sendJson(response, { items: bindings });
    return;
  }

  if (url === "/api/v1/host-discovery") {
    sendJson(response, { items: discoveries });
    return;
  }

  if (url === "/api/v1/proxy-policy") {
    sendJson(response, proxyPolicy);
    return;
  }

  if (url === "/api/v1/system/metadata") {
    sendJson(response, systemMetadata);
    return;
  }

  if (url === "/api/v1/system/runtime") {
    sendJson(response, systemRuntime);
    return;
  }

  if (url === "/api/v1/import-export/export") {
    sendJson(response, exportPackage());
    return;
  }

  sendNotFound(response);
});

if (process.env.AICLI_SWITCH_DRY_RUN === "1") {
  console.log("AI CLI Switch standalone dry-run ready");
} else {
  server.listen(port, host, () => {
    console.log(`AI CLI Switch standalone listening on http://${host}:${port}`);
  });
}
