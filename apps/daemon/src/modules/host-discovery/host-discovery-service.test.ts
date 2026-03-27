import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase } from "../../db/database.js";
import { HostDiscoveryService } from "./host-discovery-service.js";

const createService = (
  homeDir: string,
  dataDir: string,
  processEnv: NodeJS.ProcessEnv = {}
): HostDiscoveryService => {
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  return new HostDiscoveryService({
    daemonHost: "127.0.0.1",
    daemonPort: 8787,
    dataDir,
    database,
    homeDir,
    processEnv
  });
};

test("applies and rolls back codex managed config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-host-codex-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  const configPath = join(codexDir, "config.toml");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(
    configPath,
    ['model_provider = "custom"', "", "[model_providers.custom]", 'base_url = "https://api.example.com/v1"'].join(
      "\n"
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const applyResult = service.applyManagedConfig("codex");
  const applied = readFileSync(configPath, "utf-8");
  assert.equal(applyResult.integrationState, "managed");
  assert.match(applied, /model_provider = "ai_cli_switch"/);
  assert.match(applied, /\[model_providers\.ai_cli_switch\]/);
  assert.match(applied, /base_url = "http:\/\/127\.0\.0\.1:8787\/proxy\/codex\/v1"/);
  assert.match(applied, /requires_openai_auth = false/);

  const discoveriesAfterApply = service.scan();
  assert.equal(discoveriesAfterApply.find((item) => item.appCode === "codex")?.integrationState, "managed");

  const rollbackResult = service.rollbackManagedConfig("codex");
  const rolledBack = readFileSync(configPath, "utf-8");
  assert.equal(rollbackResult.integrationState, "unmanaged");
  assert.match(rolledBack, /model_provider = "custom"/);
  assert.doesNotMatch(rolledBack, /ai_cli_switch/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("applies and rolls back claude managed config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-host-claude-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const claudeDir = join(homeDir, ".claude");
  const configPath = join(claudeDir, "settings.json");
  const onboardingPath = join(homeDir, ".claude.json");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        env: {
          ANTHROPIC_AUTH_TOKEN: "original-token",
          ANTHROPIC_BASE_URL: "https://api.anthropic.com"
        }
      },
      null,
      2
    ),
    "utf-8"
  );
  writeFileSync(
    onboardingPath,
    JSON.stringify(
      {
        hasCompletedOnboarding: false,
        theme: "dark"
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const applyResult = service.applyManagedConfig("claude-code");
  const applied = JSON.parse(readFileSync(configPath, "utf-8")) as {
    env: Record<string, string>;
  };
  const appliedOnboarding = JSON.parse(readFileSync(onboardingPath, "utf-8")) as {
    hasCompletedOnboarding?: boolean;
    theme?: string;
  };
  assert.equal(applyResult.integrationState, "managed");
  assert.equal(applied.env.ANTHROPIC_AUTH_TOKEN, "PROXY_MANAGED");
  assert.equal(applied.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:8787/proxy/claude-code");
  assert.equal(appliedOnboarding.hasCompletedOnboarding, true);
  assert.equal(appliedOnboarding.theme, "dark");

  const discoveriesAfterApply = service.scan();
  assert.equal(
    discoveriesAfterApply.find((item) => item.appCode === "claude-code")?.integrationState,
    "managed"
  );
  assert.match(
    service.listRecentEvents(5)[0]?.message ?? "",
    /Claude onboarding bypass enabled/
  );

  const rollbackResult = service.rollbackManagedConfig("claude-code");
  const rolledBack = JSON.parse(readFileSync(configPath, "utf-8")) as {
    env: Record<string, string>;
  };
  const rolledBackOnboarding = JSON.parse(readFileSync(onboardingPath, "utf-8")) as {
    hasCompletedOnboarding?: boolean;
    theme?: string;
  };
  assert.equal(rollbackResult.integrationState, "unmanaged");
  assert.equal(rolledBack.env.ANTHROPIC_AUTH_TOKEN, "original-token");
  assert.equal(rolledBack.env.ANTHROPIC_BASE_URL, "https://api.anthropic.com");
  assert.equal(rolledBackOnboarding.hasCompletedOnboarding, false);
  assert.equal(rolledBackOnboarding.theme, "dark");
  assert.match(
    service.listRecentEvents(5)[0]?.message ?? "",
    /Claude onboarding bypass restored/
  );

  rmSync(rootDir, { recursive: true, force: true });
});

test("creates and removes claude onboarding skip file when it did not exist originally", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-host-claude-onboarding-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const claudeDir = join(homeDir, ".claude");
  const configPath = join(claudeDir, "settings.json");
  const onboardingPath = join(homeDir, ".claude.json");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        env: {
          ANTHROPIC_AUTH_TOKEN: "original-token",
          ANTHROPIC_BASE_URL: "https://api.anthropic.com"
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  service.applyManagedConfig("claude-code");
  assert.equal(JSON.parse(readFileSync(onboardingPath, "utf-8")).hasCompletedOnboarding, true);

  service.rollbackManagedConfig("claude-code");
  assert.equal(readFileSync(configPath, "utf-8").includes("original-token"), true);
  assert.equal(existsSync(onboardingPath), false);

  rmSync(rootDir, { recursive: true, force: true });
});

test("builds host takeover preview with governance details for codex and claude-code", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-host-preview-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  const claudeDir = join(homeDir, ".claude");
  mkdirSync(codexDir, { recursive: true });
  mkdirSync(claudeDir, { recursive: true });

  writeFileSync(
    join(codexDir, "config.toml"),
    ['model_provider = "custom"', "", "[model_providers.custom]", 'base_url = "https://api.example.com/v1"'].join(
      "\n"
    ),
    "utf-8"
  );
  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify(
      {
        env: {
          ANTHROPIC_AUTH_TOKEN: "original-token",
          ANTHROPIC_BASE_URL: "https://api.anthropic.com"
        }
      },
      null,
      2
    ),
    "utf-8"
  );
  writeFileSync(
    join(homeDir, ".claude.json"),
    JSON.stringify(
      {
        hasCompletedOnboarding: false
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const codexPreview = service.previewApplyManagedConfig("codex");
  const claudePreview = service.previewApplyManagedConfig("claude-code");

  assert.equal(codexPreview.riskLevel, "medium");
  assert.match(codexPreview.summary[0] ?? "", /route codex/);
  assert.equal(codexPreview.validationChecklist.length >= 3, true);
  assert.equal(codexPreview.runbook.length >= 3, true);

  assert.equal(claudePreview.riskLevel, "high");
  assert.deepEqual(claudePreview.managedFeaturesToEnable, ["claude-onboarding-bypassed"]);
  assert.equal(claudePreview.touchedFiles.length, 2);
  assert.match(claudePreview.summary.join(" "), /Claude onboarding bypass/);
  assert.match(claudePreview.validationChecklist.join(" "), /first-run onboarding confirmation/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("detects codex and claude environment overrides from process and shell sources", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-host-env-conflicts-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");

  mkdirSync(homeDir, { recursive: true });
  writeFileSync(
    join(homeDir, ".zshrc"),
    [
      'export OPENAI_API_KEY="shell-openai-key"',
      'export ANTHROPIC_BASE_URL="https://claude-shell.example.com"'
    ].join("\n"),
    "utf-8"
  );
  mkdirSync(join(homeDir, ".config/environment.d"), { recursive: true });
  writeFileSync(
    join(homeDir, ".config/environment.d", "ai-cli-switch.conf"),
    'ANTHROPIC_AUTH_TOKEN="environment-file-token"\n',
    "utf-8"
  );

  try {
    const service = createService(homeDir, dataDir, {
      OPENAI_BASE_URL: "https://process-openai.example.com/v1",
      ANTHROPIC_AUTH_TOKEN: "process-anthropic-token"
    });
    const discoveries = service.scan();
    const codex = discoveries.find((item) => item.appCode === "codex");
    const claude = discoveries.find((item) => item.appCode === "claude-code");
    const claudePreview = service.previewApplyManagedConfig("claude-code");

    assert.equal(codex?.envConflicts.some((item) => item.variableName === "OPENAI_BASE_URL"), true);
    assert.equal(codex?.envConflicts.some((item) => item.variableName === "OPENAI_API_KEY"), true);
    assert.equal(
      claude?.envConflicts.some(
        (item) =>
          item.variableName === "ANTHROPIC_BASE_URL" &&
          item.sourceType === "shell-file" &&
          item.lineNumber === 2
      ),
      true
    );
    assert.equal(
      claude?.envConflicts.some(
        (item) =>
          item.variableName === "ANTHROPIC_AUTH_TOKEN" &&
          item.sourceType === "environment-file"
      ),
      true
    );
    assert.equal(claudePreview.envConflicts.length >= 2, true);
    assert.match(
      claudePreview.warnings.join(" "),
      /environment override/
    );
    assert.equal(claudePreview.riskLevel, "high");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("exposes host takeover capability matrix for non-managed cli targets", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-host-matrix-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const geminiDir = join(homeDir, ".gemini");
  mkdirSync(geminiDir, { recursive: true });
  writeFileSync(
    join(geminiDir, "settings.json"),
    JSON.stringify(
      {
        security: {
          auth: {
            selectedType: "oauth-personal"
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const service = createService(homeDir, dataDir);
  const discoveries = service.scan();
  const gemini = discoveries.find((item) => item.appCode === "gemini-cli");
  const opencode = discoveries.find((item) => item.appCode === "opencode");
  const openclaw = discoveries.find((item) => item.appCode === "openclaw");

  assert.equal(gemini?.supportLevel, "inspect-only");
  assert.equal(gemini?.takeoverSupported, false);
  assert.equal(gemini?.supportReasonCode, "auth-only-config");
  assert.equal(gemini?.configLocationHint, "~/.gemini/settings.json");
  assert.equal(gemini?.currentTarget, "auth:oauth-personal");

  assert.equal(opencode?.supportLevel, "planned");
  assert.equal(opencode?.supportReasonCode, "unverified-user-config");
  assert.equal(opencode?.configLocationHint, "~/.config/opencode");

  assert.equal(openclaw?.supportLevel, "planned");
  assert.equal(openclaw?.takeoverMethod, "external-control-plane");
  assert.equal(openclaw?.supportReasonCode, "external-gateway-product");

  rmSync(rootDir, { recursive: true, force: true });
});

test("lists stable host capability registry without local machine state", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "ai-cli-switch-host-capabilities-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const service = createService(homeDir, dataDir);

  const capabilities = service.listCapabilities();
  assert.equal(capabilities.length, 5);
  assert.equal(capabilities.find((item) => item.appCode === "codex")?.binaryName, "codex");
  assert.equal(capabilities.find((item) => item.appCode === "codex")?.supportLevel, "managed");
  assert.equal(capabilities.find((item) => item.appCode === "gemini-cli")?.supportLevel, "inspect-only");
  assert.equal(capabilities.find((item) => item.appCode === "openclaw")?.takeoverMethod, "external-control-plane");

  rmSync(rootDir, { recursive: true, force: true });
});
