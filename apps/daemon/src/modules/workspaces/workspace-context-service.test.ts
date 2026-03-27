import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { SessionRecordRepository } from "./session-record-repository.js";
import { WorkspaceContextService } from "./workspace-context-service.js";
import { WorkspaceRepository } from "./workspace-repository.js";

test("resolves workspace and session effective context with fallback order", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);

  providerRepository.upsert({
    id: "provider-primary",
    name: "Primary",
    providerType: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    apiKey: "secret",
    enabled: true,
    timeoutMs: 30000
  });
  providerRepository.upsert({
    id: "provider-session",
    name: "Session Provider",
    providerType: "openai-compatible",
    baseUrl: "https://api.session.example/v1",
    apiKey: "secret",
    enabled: true,
    timeoutMs: 30000
  });
  promptTemplateRepository.upsert({
    id: "prompt-review-zh",
    name: "Review",
    appCode: "codex",
    locale: "zh-CN",
    content: "请做代码审查。",
    tags: ["review"],
    enabled: true
  });
  skillRepository.upsert({
    id: "skill-review",
    name: "Review Checklist",
    appCode: "codex",
    promptTemplateId: "prompt-review-zh",
    content: "检查边界条件。",
    tags: ["review"],
    enabled: true
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-primary",
    mode: "managed"
  });
  workspaceRepository.upsert({
    id: "workspace-api",
    name: "API Service",
    rootPath: "/srv/api",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: "prompt-review-zh",
    defaultSkillId: "skill-review",
    tags: ["backend"],
    enabled: true
  });
  sessionRecordRepository.upsert({
    id: "session-1",
    workspaceId: "workspace-api",
    appCode: "codex",
    title: "Fix headers",
    cwd: "/srv/api",
    providerId: "provider-session",
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });

  const service = new WorkspaceContextService(
    workspaceRepository,
    sessionRecordRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );

  const workspaceContext = service.resolveWorkspaceContext("workspace-api");
  assert.equal(workspaceContext.provider.id, "provider-primary");
  assert.equal(workspaceContext.provider.source, "app-binding");
  assert.equal(workspaceContext.promptTemplate.id, "prompt-review-zh");
  assert.equal(workspaceContext.skill.id, "skill-review");
  assert.equal(workspaceContext.warnings.length, 0);

  const sessionContext = service.resolveSessionContext("session-1");
  assert.equal(sessionContext.provider.id, "provider-session");
  assert.equal(sessionContext.provider.source, "session-override");
  assert.equal(sessionContext.promptTemplate.id, "prompt-review-zh");
  assert.equal(sessionContext.promptTemplate.source, "workspace-default");
  assert.equal(sessionContext.skill.id, "skill-review");
  assert.equal(sessionContext.warnings.length, 0);

  database.close();
});
