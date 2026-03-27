import assert from "node:assert/strict";
import test from "node:test";

import type { DaemonEnv } from "../../config/env.js";
import { openDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { SettingsRepository } from "../settings/settings-repository.js";
import { ActiveContextService } from "./active-context-service.js";
import { ActiveContextPolicyService } from "./active-context-policy-service.js";
import { SessionRecordRepository } from "./session-record-repository.js";
import { WorkspaceContextService } from "./workspace-context-service.js";
import { WorkspaceDiscoveryService } from "./workspace-discovery-service.js";
import { WorkspaceRepository } from "./workspace-repository.js";

const createEnv = (): DaemonEnv => ({
  runMode: "foreground",
  host: "127.0.0.1",
  port: 8787,
  allowedOrigins: [],
  allowAnyOrigin: false,
  envControlToken: null,
  controlUiMountPath: "/ui",
  healthProbeIntervalMs: 15_000,
  workspaceScanRoots: [],
  workspaceScanDepth: 3,
  sessionStaleMs: 7 * 24 * 60 * 60 * 1000
});

test("resolves active session context into runtime instruction and provider override", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);

  providerRepository.upsert({
    id: "provider-binding",
    name: "Binding Provider",
    providerType: "openai-compatible",
    baseUrl: "https://binding.example.com/v1",
    apiKey: "binding-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-session",
    name: "Session Provider",
    providerType: "openai-compatible",
    baseUrl: "https://session.example.com/v1",
    apiKey: "session-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  promptTemplateRepository.upsert({
    id: "prompt-review-zh",
    name: "Review Prompt",
    appCode: "codex",
    locale: "zh-CN",
    content: "请以严格代码审查标准输出结论。",
    tags: ["review"],
    enabled: true
  });
  skillRepository.upsert({
    id: "skill-boundary",
    name: "Boundary Checklist",
    appCode: "codex",
    promptTemplateId: "prompt-review-zh",
    content: "重点检查边界条件、回归风险、异常路径。",
    tags: ["review", "safety"],
    enabled: true
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-binding",
    mode: "managed"
  });
  workspaceRepository.upsert({
    id: "workspace-api",
    name: "API Service",
    rootPath: "/srv/api",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: "prompt-review-zh",
    defaultSkillId: "skill-boundary",
    tags: ["backend"],
    enabled: true
  });
  sessionRecordRepository.upsert({
    id: "session-review",
    workspaceId: "workspace-api",
    appCode: "codex",
    title: "Review latest patch",
    cwd: "/srv/api",
    providerId: "provider-session",
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });

  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const policyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRecordRepository),
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );

  activeContextService.activateSession("session-review");
  const resolved = policyService.resolveForApp("codex");

  assert.equal(resolved.source, "active-session");
  assert.equal(resolved.provider.id, "provider-session");
  assert.equal(resolved.promptTemplate.id, "prompt-review-zh");
  assert.equal(resolved.skill.id, "skill-boundary");
  assert.match(resolved.systemInstruction ?? "", /Prompt Template/);
  assert.match(resolved.systemInstruction ?? "", /Skill/);
  assert.equal(resolved.warnings.length, 0);

  database.close();
});

test("resolves request-scoped workspace override ahead of active context", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);

  providerRepository.upsert({
    id: "provider-binding",
    name: "Binding Provider",
    providerType: "openai-compatible",
    baseUrl: "https://binding.example.com/v1",
    apiKey: "binding-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-workspace",
    name: "Workspace Provider",
    providerType: "openai-compatible",
    baseUrl: "https://workspace.example.com/v1",
    apiKey: "workspace-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  promptTemplateRepository.upsert({
    id: "prompt-review-en",
    name: "Review Prompt",
    appCode: "codex",
    locale: "en-US",
    content: "Review the patch with explicit boundary analysis.",
    tags: ["review"],
    enabled: true
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-binding",
    mode: "managed"
  });
  workspaceRepository.upsert({
    id: "workspace-explicit",
    name: "Explicit Workspace",
    rootPath: "/srv/explicit",
    appCode: "codex",
    defaultProviderId: "provider-workspace",
    defaultPromptTemplateId: "prompt-review-en",
    defaultSkillId: null,
    tags: ["backend"],
    enabled: true
  });

  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const policyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRecordRepository),
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );

  const resolved = policyService.resolveForRequest("codex", {
    workspaceId: "workspace-explicit"
  });

  assert.equal(resolved.source, "request-workspace");
  assert.equal(resolved.provider.id, "provider-workspace");
  assert.equal(resolved.promptTemplate.id, "prompt-review-en");
  assert.equal(resolved.activeWorkspaceId, "workspace-explicit");

  database.close();
});

test("rejects request-scoped session override when app code mismatches", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);

  providerRepository.upsert({
    id: "provider-session",
    name: "Session Provider",
    providerType: "openai-compatible",
    baseUrl: "https://session.example.com/v1",
    apiKey: "session-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  sessionRecordRepository.upsert({
    id: "session-claude",
    workspaceId: null,
    appCode: "claude-code",
    title: "Claude Session",
    cwd: "/srv/claude",
    providerId: "provider-session",
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });

  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const policyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRecordRepository),
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );

  assert.throws(
    () =>
      policyService.resolveForRequest("codex", {
        sessionId: "session-claude"
      }),
    /belongs to app claude-code/
  );

  database.close();
});

test("rejects archived session when used as request-scoped runtime override", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);

  sessionRecordRepository.upsert({
    id: "session-archived",
    workspaceId: null,
    appCode: "codex",
    title: "Archived Session",
    cwd: "/srv/archived",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "archived",
    startedAt: "2026-03-20T12:00:00.000Z"
  });

  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const policyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRecordRepository),
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );

  assert.throws(
    () =>
      policyService.resolveForRequest("codex", {
        sessionId: "session-archived"
      }),
    /archived and cannot be used/
  );

  database.close();
});

test("auto associates cwd to nearest session or workspace before falling back to global state", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);

  providerRepository.upsert({
    id: "provider-main",
    name: "Main Provider",
    providerType: "openai-compatible",
    baseUrl: "https://main.example.com/v1",
    apiKey: "main-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-main",
    mode: "managed"
  });
  workspaceRepository.upsert({
    id: "workspace-api",
    name: "API Service",
    rootPath: "/srv/projects/api",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });
  sessionRecordRepository.upsert({
    id: "session-api-review",
    workspaceId: "workspace-api",
    appCode: "codex",
    title: "Review API patch",
    cwd: "/srv/projects/api/services/user",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });

  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const discoveryService = new WorkspaceDiscoveryService(
    createEnv(),
    workspaceRepository,
    sessionRecordRepository
  );
  const policyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    discoveryService,
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );

  const sessionResolved = policyService.resolveForRequest("codex", {
    cwd: "/srv/projects/api/services/user/src"
  });
  assert.equal(sessionResolved.source, "request-auto-session");
  assert.equal(sessionResolved.activeSessionId, "session-api-review");
  assert.equal(sessionResolved.activeWorkspaceId, "workspace-api");

  const workspaceResolved = policyService.resolveForRequest("codex", {
    cwd: "/srv/projects/api/docs"
  });
  assert.equal(workspaceResolved.source, "request-auto-workspace");
  assert.equal(workspaceResolved.activeWorkspaceId, "workspace-api");
  assert.equal(workspaceResolved.activeSessionId, null);

  database.close();
});

test("falls back to app binding prompt and skill when no active workspace or session exists", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);

  providerRepository.upsert({
    id: "provider-binding",
    name: "Binding Provider",
    providerType: "openai-compatible",
    baseUrl: "https://binding.example.com/v1",
    apiKey: "binding-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  promptTemplateRepository.upsert({
    id: "prompt-quick-codex",
    name: "Codex Default Prompt",
    appCode: "codex",
    locale: "zh-CN",
    content: "请优先做边界检查。",
    tags: ["quick-start"],
    enabled: true
  });
  skillRepository.upsert({
    id: "skill-quick-codex",
    name: "Codex Default Skill",
    appCode: "codex",
    promptTemplateId: "prompt-quick-codex",
    content: "重点检查回归和异常路径。",
    tags: ["quick-start"],
    enabled: true
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-binding",
    mode: "managed",
    promptTemplateId: "prompt-quick-codex",
    skillId: "skill-quick-codex"
  });

  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRecordRepository,
    workspaceContextService
  );
  const policyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRecordRepository),
    sessionRecordRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );

  const resolved = policyService.resolveForApp("codex");

  assert.equal(resolved.source, "none");
  assert.equal(resolved.provider.source, "app-binding");
  assert.equal(resolved.promptTemplate.source, "app-binding");
  assert.equal(resolved.skill.source, "app-binding");
  assert.equal(resolved.promptTemplate.id, "prompt-quick-codex");
  assert.equal(resolved.skill.id, "skill-quick-codex");
  assert.match(resolved.systemInstruction ?? "", /Prompt Template/);
  assert.match(resolved.systemInstruction ?? "", /Skill/);

  database.close();
});
