import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { AppCode, HostCliCapability, HostCliDiscovery } from "cc-switch-web-shared";

interface BaseHostCliAdapter {
  readonly appCode: AppCode;
  readonly binaryName: string;
  readonly configFormat: HostCliDiscovery["configFormat"];
  readonly supportLevel: HostCliDiscovery["supportLevel"];
  readonly takeoverMethod: HostCliDiscovery["takeoverMethod"];
  readonly supportReasonCode: HostCliDiscovery["supportReasonCode"];
  readonly docsUrl: string | null;
  readonly configLocationHint: string | null;
  resolveConfigPath(homeDir: string): string | null;
  getCurrentTarget?(configPath: string): string | null;
}

export interface ManagedHostCliAdapter extends BaseHostCliAdapter {
  readonly supportLevel: "managed";
  readonly takeoverMethod: "file-rewrite";
  buildManagedTarget(proxyBaseUrl: string): string;
  buildManagedConfig(existingContent: string, proxyBaseUrl: string): string;
  listManagedSupplementalFiles?(
    homeDir: string,
    proxyBaseUrl: string
  ): Array<{
    readonly path: string;
    buildManagedContent(existingContent: string): string;
  }>;
  getManagedTarget(configPath: string): string | null;
  isManaged(configPath: string, proxyBaseUrl: string): boolean;
  getManagedFeatures?(configPath: string, proxyBaseUrl: string): string[];
}

export interface InspectOnlyHostCliAdapter extends BaseHostCliAdapter {
  readonly supportLevel: "inspect-only";
}

export interface PlannedHostCliAdapter extends BaseHostCliAdapter {
  readonly supportLevel: "planned";
}

export type HostCliAdapter =
  | ManagedHostCliAdapter
  | InspectOnlyHostCliAdapter
  | PlannedHostCliAdapter;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const upsertTomlString = (content: string, key: string, value: string): string => {
  const line = `${key} = "${value}"`;
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  return `${line}\n${content}`.trimStart();
};

const upsertTomlSection = (content: string, header: string, body: string): string => {
  const escapedHeader = escapeRegExp(header);
  const pattern = new RegExp(`^\\[${escapedHeader}\\]\\n[\\s\\S]*?(?=^\\[[^\\]]+\\]\\n|\\Z)`, "m");
  const block = `[${header}]\n${body.trimEnd()}\n`;

  if (pattern.test(content)) {
    return content.replace(pattern, block);
  }

  const normalized = content.trimEnd();
  return normalized.length > 0 ? `${normalized}\n\n${block}` : block;
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

const hasClaudeOnboardingBypass = (homeDir: string): boolean => {
  const onboardingPath = resolve(homeDir, ".claude.json");
  if (!existsSync(onboardingPath)) {
    return false;
  }

  const settings = readJsonObject(onboardingPath);
  return settings.hasCompletedOnboarding === true;
};

const codexAdapter: ManagedHostCliAdapter = {
  appCode: "codex",
  binaryName: "codex",
  configFormat: "toml",
  supportLevel: "managed",
  takeoverMethod: "file-rewrite",
  supportReasonCode: "stable-provider-config",
  docsUrl: "https://github.com/openai/codex",
  configLocationHint: "~/.codex/config.toml",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".codex/config.toml"),
  buildManagedTarget: (proxyBaseUrl) => `${proxyBaseUrl}/v1`,
  buildManagedConfig: (existingContent, proxyBaseUrl) => {
    let nextContent = existingContent;
    nextContent = upsertTomlString(nextContent, "model_provider", "cc_switch_web");
    nextContent = upsertTomlSection(
      nextContent,
      "model_providers.cc_switch_web",
      [
        'name = "cc_switch_web"',
        'wire_api = "responses"',
        `base_url = "${proxyBaseUrl}/v1"`,
        "requires_openai_auth = false"
      ].join("\n")
    );
    return nextContent.endsWith("\n") ? nextContent : `${nextContent}\n`;
  },
  getManagedTarget: (configPath) => {
    const content = readFileSync(configPath, "utf-8");
    const matched = content.match(/^base_url\s*=\s*"([^"]+)"$/m);
    return matched?.[1] ?? null;
  },
  getCurrentTarget: (configPath) => {
    const content = readFileSync(configPath, "utf-8");
    const customProviderName = content.match(/^model_provider\s*=\s*"([^"]+)"$/m)?.[1];
    if (customProviderName) {
      const escaped = escapeRegExp(customProviderName);
      const sectionPattern = new RegExp(
        `^\\[model_providers\\.${escaped}\\]\\n[\\s\\S]*?^base_url\\s*=\\s*"([^"]+)"`,
        "m"
      );
      return content.match(sectionPattern)?.[1] ?? null;
    }

    return content.match(/^base_url\s*=\s*"([^"]+)"$/m)?.[1] ?? null;
  },
  isManaged: (configPath, proxyBaseUrl) => {
    const content = readFileSync(configPath, "utf-8");
    return (
      /^model_provider\s*=\s*"cc_switch_web"$/m.test(content) &&
      content.includes("[model_providers.cc_switch_web]") &&
      content.includes(`base_url = "${proxyBaseUrl}/v1"`) &&
      /^requires_openai_auth\s*=\s*false$/m.test(content)
    );
  }
};

const claudeCodeAdapter: ManagedHostCliAdapter = {
  appCode: "claude-code",
  binaryName: "claude",
  configFormat: "json",
  supportLevel: "managed",
  takeoverMethod: "file-rewrite",
  supportReasonCode: "stable-env-config",
  docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
  configLocationHint: "~/.claude/settings.json",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".claude/settings.json"),
  buildManagedTarget: (proxyBaseUrl) => proxyBaseUrl,
  buildManagedConfig: (existingContent, proxyBaseUrl) => {
    const settings =
      existingContent.trim().length > 0
        ? (JSON.parse(existingContent) as Record<string, unknown>)
        : {};
    const currentEnv =
      typeof settings.env === "object" && settings.env !== null && !Array.isArray(settings.env)
        ? (settings.env as Record<string, unknown>)
        : {};

    const nextSettings: Record<string, unknown> = {
      ...settings,
      env: {
        ...currentEnv,
        ANTHROPIC_AUTH_TOKEN: "PROXY_MANAGED",
        ANTHROPIC_BASE_URL: proxyBaseUrl
      }
    };

    return `${JSON.stringify(nextSettings, null, 2)}\n`;
  },
  listManagedSupplementalFiles: (homeDir) => [
    {
      path: resolve(homeDir, ".claude.json"),
      buildManagedContent: (existingContent) => {
        const settings =
          existingContent.trim().length > 0
            ? (JSON.parse(existingContent) as Record<string, unknown>)
            : {};

        return `${JSON.stringify(
          {
            ...settings,
            hasCompletedOnboarding: true
          },
          null,
          2
        )}\n`;
      }
    }
  ],
  getManagedTarget: (configPath) => {
    const settings = readJsonObject(configPath);
    const env =
      typeof settings.env === "object" && settings.env !== null && !Array.isArray(settings.env)
        ? (settings.env as Record<string, unknown>)
        : {};
    const baseUrl = env.ANTHROPIC_BASE_URL;
    return typeof baseUrl === "string" ? baseUrl : null;
  },
  getCurrentTarget: (configPath) => {
    const settings = readJsonObject(configPath);
    const env =
      typeof settings.env === "object" && settings.env !== null && !Array.isArray(settings.env)
        ? (settings.env as Record<string, unknown>)
        : {};
    return typeof env.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : null;
  },
  isManaged: (configPath, proxyBaseUrl) => {
    const settings = readJsonObject(configPath);
    const env =
      typeof settings.env === "object" && settings.env !== null && !Array.isArray(settings.env)
        ? (settings.env as Record<string, unknown>)
        : {};
    const homeDir = resolve(dirname(configPath), "..");
    const onboardingPath = resolve(homeDir, ".claude.json");
    const onboardingSettings = existsSync(onboardingPath) ? readJsonObject(onboardingPath) : {};

    return (
      env.ANTHROPIC_BASE_URL === proxyBaseUrl &&
      env.ANTHROPIC_AUTH_TOKEN === "PROXY_MANAGED" &&
      onboardingSettings.hasCompletedOnboarding === true
    );
  },
  getManagedFeatures: (configPath) => {
    const homeDir = resolve(dirname(configPath), "..");
    return hasClaudeOnboardingBypass(homeDir) ? ["claude-onboarding-bypassed"] : [];
  }
};

const geminiCliAdapter: InspectOnlyHostCliAdapter = {
  appCode: "gemini-cli",
  binaryName: "gemini",
  configFormat: "json",
  supportLevel: "inspect-only",
  takeoverMethod: "config-inspect",
  supportReasonCode: "auth-only-config",
  docsUrl: "https://github.com/google-gemini/gemini-cli",
  configLocationHint: "~/.gemini/settings.json",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".gemini/settings.json"),
  getCurrentTarget: (configPath) => {
    if (!existsSync(configPath)) {
      return null;
    }

    const settings = readJsonObject(configPath);
    const security =
      typeof settings.security === "object" && settings.security !== null && !Array.isArray(settings.security)
        ? (settings.security as Record<string, unknown>)
        : {};
    const auth =
      typeof security.auth === "object" && security.auth !== null && !Array.isArray(security.auth)
        ? (security.auth as Record<string, unknown>)
        : {};
    return typeof auth.selectedType === "string" ? `auth:${auth.selectedType}` : null;
  }
};

const opencodeAdapter: PlannedHostCliAdapter = {
  appCode: "opencode",
  binaryName: "opencode",
  configFormat: "json",
  supportLevel: "planned",
  takeoverMethod: "config-inspect",
  supportReasonCode: "unverified-user-config",
  docsUrl: "https://opencode.ai/docs",
  configLocationHint: "~/.config/opencode",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".config/opencode/opencode.json")
};

const openclawAdapter: PlannedHostCliAdapter = {
  appCode: "openclaw",
  binaryName: "openclaw",
  configFormat: "json",
  supportLevel: "planned",
  takeoverMethod: "external-control-plane",
  supportReasonCode: "external-gateway-product",
  docsUrl: "https://docs.openclaw.ai",
  configLocationHint: "~/.openclaw/openclaw.json",
  resolveConfigPath: (homeDir) => resolve(homeDir, ".openclaw/openclaw.json")
};

export const createHostCliAdapters = (): HostCliAdapter[] => [
  codexAdapter,
  claudeCodeAdapter,
  geminiCliAdapter,
  opencodeAdapter,
  openclawAdapter
];

export const toHostCliCapability = (adapter: HostCliAdapter): HostCliCapability => ({
  appCode: adapter.appCode,
  binaryName: adapter.binaryName,
  configLocationHint: adapter.configLocationHint,
  configFormat: adapter.configFormat,
  takeoverSupported: adapter.supportLevel === "managed",
  supportLevel: adapter.supportLevel,
  takeoverMethod: adapter.takeoverMethod,
  supportReasonCode: adapter.supportReasonCode,
  docsUrl: adapter.docsUrl
});

export const isManagedHostCliAdapter = (
  adapter: HostCliAdapter
): adapter is ManagedHostCliAdapter => adapter.supportLevel === "managed";
