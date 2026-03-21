import { accessSync, constants } from "node:fs";

import { type HostCliDiscovery } from "@ai-cli-switch/shared";

const resolvePath = (binaryName: string): string | null => {
  const pathValue = process.env.PATH ?? "";
  const pathEntries = pathValue.split(":").filter(Boolean);

  for (const directory of pathEntries) {
    const candidate = `${directory}/${binaryName}`;

    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // WARNING: 这里明确忽略不可执行候选，
      // 目的是保持第一阶段扫描逻辑简单且不会把 PATH 中的同名无效文件误报为已安装。
    }
  }

  return null;
};

export class HostDiscoveryService {
  scan(): HostCliDiscovery[] {
    const codexPath = resolvePath("codex");
    const claudePath = resolvePath("claude");
    const geminiPath = resolvePath("gemini");

    return [
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
  }
}
