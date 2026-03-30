import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppCode, EffectiveAppContext, PromptHostSyncPreview, PromptHostSyncResult } from "cc-switch-web-shared";

import { openDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { PromptHostSyncService } from "./prompt-host-sync-service.js";

const buildEmptyContext = (appCode: AppCode): EffectiveAppContext => ({
  appCode,
  source: "none",
  activeWorkspaceId: null,
  activeSessionId: null,
  provider: {
    id: null,
    name: null,
    bindingMode: null,
    source: "none",
    missing: false
  },
  promptTemplate: {
    id: null,
    name: null,
    locale: null,
    source: "none",
    missing: false,
    content: null,
    enabled: null
  },
  skill: {
    id: null,
    name: null,
    source: "none",
    missing: false,
    promptTemplateId: null,
    content: null,
    enabled: null
  },
  systemInstruction: null,
  warnings: []
});

const createService = (
  homeDir: string,
  dataDir: string,
  resolveEffectiveContext: (appCode: AppCode) => EffectiveAppContext
): {
  readonly service: PromptHostSyncService;
  readonly database: ReturnType<typeof openDatabase>;
  readonly promptTemplateRepository: PromptTemplateRepository;
} => {
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const service = new PromptHostSyncService({
    dataDir,
    database,
    promptTemplateRepository,
    upsertPromptTemplate: (input) => promptTemplateRepository.upsert(input),
    resolveEffectiveContext,
    homeDir
  });

  return {
    service,
    database,
    promptTemplateRepository
  };
};

test("syncs active-context prompt into codex host file and preserves rollback backup", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-prompt-host-codex-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  const promptPath = join(codexDir, "AGENTS.md");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(promptPath, "Legacy host prompt", "utf-8");

  const { service, database, promptTemplateRepository } = createService(homeDir, dataDir, (appCode) => ({
    ...buildEmptyContext(appCode),
    source: "active-workspace",
    activeWorkspaceId: "workspace-codex",
    promptTemplate: {
      id: "prompt-codex-review",
      name: "Codex Review",
      locale: "zh-CN",
      source: "workspace-default",
      missing: false,
      content: "请先给出风险，再给出修复建议。",
      enabled: true
    },
    skill: {
      id: "skill-boundary-check",
      name: "Boundary Check",
      source: "workspace-default",
      missing: false,
      promptTemplateId: "prompt-codex-review",
      content: "重点检查边界条件与回滚风险。",
      enabled: true
    }
  }));

  promptTemplateRepository.upsert({
    id: "prompt-codex-review",
    name: "Codex Review",
    appCode: "codex",
    locale: "zh-CN",
    content: "请先给出风险，再给出修复建议。",
    tags: [],
    enabled: true
  });

  const preview = service.previewApply("codex");
  assert.equal(preview.applyReady, true);
  assert.equal(preview.selectionSource, "active-context");
  assert.equal(preview.ignoredSkillId, "skill-boundary-check");

  const result = service.apply("codex");
  assert.equal(result.promptTemplateId, "prompt-codex-review");
  assert.match(result.message, /proxy-only/);
  assert.equal(readFileSync(promptPath, "utf-8"), "请先给出风险，再给出修复建议。");

  const state = service.listSyncStates()[0];
  assert.equal(state?.appCode, "codex");
  assert.equal(state?.promptTemplateId, "prompt-codex-review");
  assert.equal(state?.selectionSource, "active-context");

  const row = database
    .prepare(`
      SELECT kind, action, integration_state, config_path
      FROM host_integration_events
      ORDER BY id DESC
      LIMIT 1
    `)
    .get() as {
    kind: string;
    action: string;
    integration_state: string;
    config_path: string;
  };
  assert.equal(row.kind, "prompt-file");
  assert.equal(row.action, "apply");
  assert.equal(row.integration_state, "managed");
  assert.equal(row.config_path, promptPath);

  const rollback = service.rollback("codex");
  assert.equal(rollback.action, "rollback");
  assert.equal(readFileSync(promptPath, "utf-8"), "Legacy host prompt");

  database.close();
  rmSync(rootDir, { recursive: true, force: true });
});

test("falls back to a single app-scoped prompt when active context is empty", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-prompt-host-claude-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const promptDir = join(homeDir, ".claude");
  const promptPath = join(promptDir, "CLAUDE.md");
  mkdirSync(promptDir, { recursive: true });

  const { service, database, promptTemplateRepository } = createService(homeDir, dataDir, buildEmptyContext);
  promptTemplateRepository.upsert({
    id: "prompt-claude-default",
    name: "Claude Default",
    appCode: "claude-code",
    locale: "en-US",
    content: "Prefer concise architectural tradeoff analysis.",
    tags: [],
    enabled: true
  });

  const preview = service.previewApply("claude-code");
  assert.equal(preview.selectionSource, "single-app-prompt");
  assert.equal(preview.applyReady, true);
  assert.equal(preview.promptTemplateId, "prompt-claude-default");

  service.apply("claude-code");
  assert.equal(readFileSync(promptPath, "utf-8"), "Prefer concise architectural tradeoff analysis.");

  service.rollback("claude-code");
  assert.equal(existsSync(promptPath), false);

  database.close();
  rmSync(rootDir, { recursive: true, force: true });
});

test("reports ambiguous prompt selection instead of guessing", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-prompt-host-ambiguous-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".codex"), { recursive: true });

  const { service, database, promptTemplateRepository } = createService(homeDir, dataDir, buildEmptyContext);
  promptTemplateRepository.upsert({
    id: "prompt-a",
    name: "Prompt A",
    appCode: "codex",
    locale: "zh-CN",
    content: "提示词 A",
    tags: [],
    enabled: true
  });
  promptTemplateRepository.upsert({
    id: "prompt-b",
    name: "Prompt B",
    appCode: "codex",
    locale: "en-US",
    content: "Prompt B",
    tags: [],
    enabled: true
  });

  const preview = service.previewApply("codex");
  assert.equal(preview.applyReady, false);
  assert.equal(preview.selectionSource, "ambiguous");
  assert.match(preview.warnings.join("\n"), /Multiple enabled app-scoped prompts match codex/);
  assert.throws(() => service.apply("codex"), /Multiple enabled app-scoped prompts match codex/);

  database.close();
  rmSync(rootDir, { recursive: true, force: true });
});

test("imports a host prompt file as a disabled prompt asset when no match exists", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-prompt-import-new-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const codexDir = join(homeDir, ".codex");
  const promptPath = join(codexDir, "AGENTS.md");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(promptPath, "请保持中文输出，并先列风险。", "utf-8");

  const { service, database, promptTemplateRepository } = createService(homeDir, dataDir, buildEmptyContext);
  const preview = service.previewImport("codex");
  assert.equal(preview.status, "ready-create");
  assert.equal(preview.promptFileExists, true);
  assert.equal(preview.inferredLocale, "zh-CN");

  const result = service.importFromHost("codex");
  assert.equal(result.status, "created");
  assert.equal(result.enabled, false);
  assert.equal(result.inferredLocale, "zh-CN");

  const importedPrompt = promptTemplateRepository.get(result.promptTemplateId);
  assert.equal(importedPrompt?.appCode, "codex");
  assert.equal(importedPrompt?.enabled, false);
  assert.equal(importedPrompt?.content, "请保持中文输出，并先列风险。");
  assert.deepEqual(importedPrompt?.tags, ["host-import"]);

  database.close();
  rmSync(rootDir, { recursive: true, force: true });
});

test("applies prompt host sync changes across managed apps in batch", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-prompt-host-batch-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  mkdirSync(join(homeDir, ".codex"), { recursive: true });
  mkdirSync(join(homeDir, ".claude"), { recursive: true });

  const { service, database, promptTemplateRepository } = createService(homeDir, dataDir, buildEmptyContext);
  promptTemplateRepository.upsert({
    id: "prompt-codex-batch",
    name: "Codex Batch",
    appCode: "codex",
    locale: "zh-CN",
    content: "批量同步 Codex Prompt",
    tags: [],
    enabled: true
  });
  promptTemplateRepository.upsert({
    id: "prompt-claude-batch",
    name: "Claude Batch",
    appCode: "claude-code",
    locale: "en-US",
    content: "Batch sync Claude prompt",
    tags: [],
    enabled: true
  });

  const preview = service.previewApplyAll();
  assert.equal(preview.totalApps, 2);
  assert.equal(preview.syncableApps, 2);
  assert.deepEqual(preview.blockedApps, []);
  assert.deepEqual(
    preview.items.map((item: PromptHostSyncPreview) => item.appCode).sort(),
    ["claude-code", "codex"]
  );

  const result = service.applyAll();
  assert.deepEqual(result.appliedApps.sort(), ["claude-code", "codex"]);
  assert.equal(result.skippedApps.length, 0);
  assert.match(result.message, /Applied prompt host sync/);
  assert.equal(readFileSync(join(homeDir, ".codex", "AGENTS.md"), "utf-8"), "批量同步 Codex Prompt");
  assert.equal(readFileSync(join(homeDir, ".claude", "CLAUDE.md"), "utf-8"), "Batch sync Claude prompt");

  database.close();
  rmSync(rootDir, { recursive: true, force: true });
});

test("reuses an existing prompt asset when host prompt content already matches", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-prompt-import-match-"));
  const homeDir = join(rootDir, "home");
  const dataDir = join(rootDir, "data");
  const promptDir = join(homeDir, ".claude");
  const promptPath = join(promptDir, "CLAUDE.md");
  mkdirSync(promptDir, { recursive: true });
  writeFileSync(promptPath, "Prefer explicit rollback notes.", "utf-8");

  const { service, database, promptTemplateRepository } = createService(homeDir, dataDir, buildEmptyContext);
  promptTemplateRepository.upsert({
    id: "prompt-claude-shared",
    name: "Claude Shared",
    appCode: "claude-code",
    locale: "en-US",
    content: "Prefer explicit rollback notes.",
    tags: [],
    enabled: true
  });

  const preview = service.previewImport("claude-code");
  assert.equal(preview.status, "ready-match");
  assert.equal(preview.matchedPromptTemplateId, "prompt-claude-shared");

  const result = service.importFromHost("claude-code");
  assert.equal(result.status, "matched-existing");
  assert.equal(result.promptTemplateId, "prompt-claude-shared");
  assert.equal(promptTemplateRepository.list().length, 1);

  database.close();
  rmSync(rootDir, { recursive: true, force: true });
});
