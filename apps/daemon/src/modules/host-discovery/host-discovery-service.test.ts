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
  processEnv: NodeJS.ProcessEnv = {},
  runMode: "foreground" | "systemd-user" = "foreground"
): HostDiscoveryService => {
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  return new HostDiscoveryService({
    runMode,
    daemonHost: "127.0.0.1",
    daemonPort: 8787,
    dataDir,
    database,
    homeDir,
    processEnv
  });
};

test("applies and rolls back codex managed config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-codex-"));
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
  assert.equal(applyResult.lifecycleMode, "foreground-session");
  assert.match(applied, /model_provider = "cc_switch_web"/);
  assert.match(applied, /\[model_providers\.cc_switch_web\]/);
  assert.match(applied, /base_url = "http:\/\/127\.0\.0\.1:8787\/proxy\/codex\/v1"/);
  assert.match(applied, /requires_openai_auth = false/);

  const discoveriesAfterApply = service.scan();
  assert.equal(discoveriesAfterApply.find((item) => item.appCode === "codex")?.integrationState, "managed");
  assert.equal(
    discoveriesAfterApply.find((item) => item.appCode === "codex")?.lifecycleMode,
    "foreground-session"
  );

  const rollbackResult = service.rollbackManagedConfig("codex");
  const rolledBack = readFileSync(configPath, "utf-8");
  assert.equal(rollbackResult.integrationState, "unmanaged");
  assert.equal(rollbackResult.lifecycleMode, "foreground-session");
  assert.match(rolledBack, /model_provider = "custom"/);
  assert.doesNotMatch(rolledBack, /cc_switch_web/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("applies and rolls back claude managed config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-claude-"));
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
  assert.equal(applyResult.lifecycleMode, "foreground-session");
  assert.equal(applied.env.ANTHROPIC_AUTH_TOKEN, "PROXY_MANAGED");
  assert.equal(applied.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:8787/proxy/claude-code");
  assert.equal(appliedOnboarding.hasCompletedOnboarding, true);
  assert.equal(appliedOnboarding.theme, "dark");

  const discoveriesAfterApply = service.scan();
  assert.equal(
    discoveriesAfterApply.find((item) => item.appCode === "claude-code")?.integrationState,
    "managed"
  );
  assert.equal(
    discoveriesAfterApply.find((item) => item.appCode === "claude-code")?.lifecycleMode,
    "foreground-session"
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
  assert.equal(rollbackResult.lifecycleMode, "foreground-session");
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
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-claude-onboarding-"));
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

test("applies and rolls back codex environment takeover without rewriting the original config", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-codex-env-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const service = createService(homeDir, dataDir);

  const preview = service.previewApplyManagedConfig("codex", "environment-override");
  assert.equal(preview.takeoverMode, "environment-override");
  assert.ok(preview.environmentOverride !== null);
  assert.match(preview.environmentOverride?.exportScriptPath ?? "", /\.config\/cc-switch-web\/host-env\/codex\.sh$/);
  assert.equal(preview.touchedFiles[0]?.backupRequired, false);

  const applyResult = service.applyManagedConfig("codex", "environment-override");
  const exportScriptPath = applyResult.environmentOverride?.exportScriptPath ?? "";
  assert.equal(applyResult.takeoverMode, "environment-override");
  assert.equal(existsSync(exportScriptPath), true);
  assert.match(readFileSync(exportScriptPath, "utf-8"), /OPENAI_BASE_URL/);
  assert.match(readFileSync(exportScriptPath, "utf-8"), /OPENAI_API_KEY/);

  const discovery = service.scan().find((item) => item.appCode === "codex");
  assert.equal(discovery?.integrationState, "managed");
  assert.equal(discovery?.supportedTakeoverModes.includes("environment-override"), true);
  assert.equal(discovery?.currentTarget, "http://127.0.0.1:8787/proxy/codex/v1");

  const rollbackResult = service.rollbackManagedConfig("codex");
  assert.equal(rollbackResult.takeoverMode, "environment-override");
  assert.equal(rollbackResult.environmentOverride?.deactivationCommands[0], "unset OPENAI_BASE_URL OPENAI_API_KEY");
  assert.equal(existsSync(exportScriptPath), false);

  rmSync(rootDir, { recursive: true, force: true });
});

test("builds host takeover preview with governance details for codex and claude-code", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-preview-"));
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
  assert.equal(codexPreview.lifecycleMode, "foreground-session");
  assert.match(codexPreview.summary[0] ?? "", /route codex/);
  assert.match(codexPreview.warnings.join(" "), /temporary/);
  assert.equal(codexPreview.validationChecklist.length >= 3, true);
  assert.equal(codexPreview.runbook.length >= 3, true);

  assert.equal(claudePreview.riskLevel, "high");
  assert.equal(claudePreview.lifecycleMode, "foreground-session");
  assert.deepEqual(claudePreview.managedFeaturesToEnable, ["claude-onboarding-bypassed"]);
  assert.equal(claudePreview.touchedFiles.length, 2);
  assert.match(claudePreview.summary.join(" "), /Claude onboarding bypass/);
  assert.match(claudePreview.validationChecklist.join(" "), /first-run onboarding confirmation/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("rolls back foreground-managed host configs automatically during shutdown cleanup", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-cleanup-"));
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

  const service = createService(homeDir, dataDir, {}, "foreground");
  const applyResult = service.applyManagedConfig("codex");
  assert.match(applyResult.message, /auto-rollback/);

  const cleanup = service.rollbackForegroundSessionConfigs();
  const rolledBack = readFileSync(configPath, "utf-8");

  assert.equal(cleanup.items.length, 1);
  assert.equal(cleanup.failures.length, 0);
  assert.equal(cleanup.rolledBackApps[0], "codex");
  assert.equal(cleanup.failedApps.length, 0);
  assert.equal(cleanup.items[0]?.appCode, "codex");
  assert.match(rolledBack, /model_provider = "custom"/);
  assert.doesNotMatch(rolledBack, /cc_switch_web/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("keeps persistent managed host configs when daemon runs as systemd user service", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-persistent-"));
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

  const service = createService(homeDir, dataDir, {}, "systemd-user");
  const preview = service.previewApplyManagedConfig("codex");
  const applyResult = service.applyManagedConfig("codex");
  const cleanup = service.rollbackForegroundSessionConfigs();
  const managedConfig = readFileSync(configPath, "utf-8");

  assert.equal(preview.lifecycleMode, "persistent");
  assert.equal(applyResult.lifecycleMode, "persistent");
  assert.equal(preview.warnings.some((item) => item.includes("temporary")), false);
  assert.doesNotMatch(applyResult.message, /auto-rollback/);
  assert.equal(cleanup.items.length, 0);
  assert.equal(cleanup.failures.length, 0);
  assert.equal(cleanup.rolledBackApps.length, 0);
  assert.equal(cleanup.failedApps.length, 0);
  assert.match(managedConfig, /cc_switch_web/);

  rmSync(rootDir, { recursive: true, force: true });
});

test("auto-recovers stale foreground-managed host configs on next startup", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-startup-recovery-"));
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

  const crashedSessionService = createService(homeDir, dataDir, {}, "foreground");
  crashedSessionService.applyManagedConfig("codex");
  assert.match(readFileSync(configPath, "utf-8"), /cc_switch_web/);

  const restartedService = createService(homeDir, dataDir, {}, "systemd-user");
  const recovery = restartedService.recoverForegroundSessionConfigsOnStartup();

  assert.equal(recovery?.trigger, "startup-auto-rollback");
  assert.equal(recovery?.items.length, 1);
  assert.deepEqual(recovery?.rolledBackApps, ["codex"]);
  assert.deepEqual(recovery?.failedApps, []);
  assert.match(recovery?.message ?? "", /Auto-recovered 1 stale foreground-session/);
  assert.match(readFileSync(configPath, "utf-8"), /model_provider = "custom"/);
  assert.doesNotMatch(readFileSync(configPath, "utf-8"), /cc_switch_web/);
  assert.equal(restartedService.scan().find((item) => item.appCode === "codex")?.integrationState, "unmanaged");
  assert.equal(restartedService.getStartupRecovery()?.rolledBackApps[0], "codex");

  rmSync(rootDir, { recursive: true, force: true });
});

test("detects codex and claude environment overrides from process and shell sources", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-env-conflicts-"));
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
    join(homeDir, ".config/environment.d", "cc-switch-web.conf"),
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
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-matrix-"));
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
  assert.deepEqual(gemini?.supportedTakeoverModes, []);
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
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-host-capabilities-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const service = createService(homeDir, dataDir);

  const capabilities = service.listCapabilities();
  assert.equal(capabilities.length, 5);
  assert.equal(capabilities.find((item) => item.appCode === "codex")?.binaryName, "codex");
  assert.equal(capabilities.find((item) => item.appCode === "codex")?.supportLevel, "managed");
  assert.deepEqual(
    capabilities.find((item) => item.appCode === "codex")?.supportedTakeoverModes,
    ["file-rewrite", "environment-override"]
  );
  assert.equal(capabilities.find((item) => item.appCode === "gemini-cli")?.supportLevel, "inspect-only");
  assert.equal(capabilities.find((item) => item.appCode === "openclaw")?.takeoverMethod, "external-control-plane");

  rmSync(rootDir, { recursive: true, force: true });
});
