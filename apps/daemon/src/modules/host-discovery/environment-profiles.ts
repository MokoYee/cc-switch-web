import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { AppCode, HostCliEnvironmentOverride } from "cc-switch-web-shared";

interface HostCliEnvironmentVariableDefinition {
  readonly variableName: string;
  readonly value: string;
  readonly description: string;
}

export interface HostCliEnvironmentProfile {
  readonly appCode: AppCode;
  readonly resolveExportScriptPath: (homeDir: string) => string;
  readonly buildEnvironmentOverride: (
    homeDir: string,
    proxyBaseUrl: string
  ) => HostCliEnvironmentOverride;
  readonly buildCompatibilityWarnings?: (options: {
    readonly homeDir: string;
    readonly configPath: string | null;
  }) => string[];
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\"'\"'`)}'`;

const buildEnvironmentOverride = (
  exportScriptPath: string,
  variables: HostCliEnvironmentVariableDefinition[]
): HostCliEnvironmentOverride => {
  const exportSnippet = `${variables
    .map((item) => `export ${item.variableName}=${shellQuote(item.value)}`)
    .join("\n")}\n`;
  const unsetSnippet = `unset ${variables.map((item) => item.variableName).join(" ")}\n`;

  return {
    exportScriptPath,
    exportSnippet,
    unsetSnippet,
    activationCommands: [`source ${shellQuote(exportScriptPath)}`],
    deactivationCommands: [unsetSnippet.trim()],
    activationScope: "user-managed-script",
    variables: variables.map((item) => ({
      variableName: item.variableName,
      value: item.value,
      sensitive: false,
      description: item.description
    }))
  };
};

const codexEnvironmentProfile: HostCliEnvironmentProfile = {
  appCode: "codex",
  resolveExportScriptPath: (homeDir) =>
    resolve(homeDir, ".config/cc-switch-web/host-env/codex.sh"),
  buildEnvironmentOverride: (homeDir, proxyBaseUrl) =>
    buildEnvironmentOverride(
      resolve(homeDir, ".config/cc-switch-web/host-env/codex.sh"),
      [
        {
          variableName: "OPENAI_BASE_URL",
          value: `${proxyBaseUrl}/v1`,
          description: "Route Codex built-in OpenAI traffic to the local CC Switch Web gateway."
        },
        {
          variableName: "OPENAI_API_KEY",
          value: "PROXY_MANAGED",
          description: "Use a local placeholder token because upstream credentials are managed inside CC Switch Web."
        }
      ]
    ),
  buildCompatibilityWarnings: ({ configPath }) => {
    if (configPath === null || !existsSync(configPath)) {
      return [];
    }

    const content = readFileSync(configPath, "utf-8");
    const matchedProvider = content.match(/^model_provider\s*=\s*"([^"]+)"$/m)?.[1] ?? null;
    if (matchedProvider !== null && matchedProvider !== "openai") {
      return [
        `Detected Codex model_provider=${matchedProvider}. Environment takeover only steers the built-in OpenAI provider, so remove or override the pinned provider before validating takeover.`
      ];
    }

    return [];
  }
};

const claudeEnvironmentProfile: HostCliEnvironmentProfile = {
  appCode: "claude-code",
  resolveExportScriptPath: (homeDir) =>
    resolve(homeDir, ".config/cc-switch-web/host-env/claude-code.sh"),
  buildEnvironmentOverride: (homeDir, proxyBaseUrl) =>
    buildEnvironmentOverride(
      resolve(homeDir, ".config/cc-switch-web/host-env/claude-code.sh"),
      [
        {
          variableName: "ANTHROPIC_BASE_URL",
          value: proxyBaseUrl,
          description: "Route Claude Code API traffic to the local CC Switch Web gateway."
        },
        {
          variableName: "ANTHROPIC_AUTH_TOKEN",
          value: "PROXY_MANAGED",
          description: "Use a local placeholder token because upstream credentials are managed inside CC Switch Web."
        }
      ]
    )
};

export const createHostCliEnvironmentProfiles = (): HostCliEnvironmentProfile[] => [
  codexEnvironmentProfile,
  claudeEnvironmentProfile
];

