import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { SettingsRepository } from "../settings/settings-repository.js";
import { SessionGovernanceService } from "./session-governance-service.js";
import { SessionRecordRepository } from "./session-record-repository.js";
import { WorkspaceContextService } from "./workspace-context-service.js";
import { WorkspaceRepository } from "./workspace-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { ActiveContextService } from "./active-context-service.js";

test("archives stale active sessions and clears active session pointer", () => {
  const database = openDatabase(":memory:");
  const sessionRecordRepository = new SessionRecordRepository(database);
  const settingsRepository = new SettingsRepository(database);
  const governanceService = new SessionGovernanceService(
    sessionRecordRepository,
    settingsRepository,
    60 * 60 * 1000
  );

  const created = sessionRecordRepository.upsert({
    id: "session-stale",
    workspaceId: null,
    appCode: "codex",
    title: "Stale Session",
    cwd: "/srv/stale",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-20T00:00:00.000Z"
  });
  settingsRepository.setActiveSessionId("session-stale");

  const result = governanceService.archiveStaleSessions(
    new Date(Date.parse(created.updatedAt) + 2 * 60 * 60 * 1000)
  );

  assert.deepEqual(result.archivedSessionIds, ["session-stale"]);
  assert.equal(result.clearedActiveSessionId, true);
  assert.equal(sessionRecordRepository.findById("session-stale")?.status, "archived");
  assert.equal(settingsRepository.getActiveSessionId(), null);

  database.close();
});

test("refreshes runtime activity for active session and keeps it routable", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);
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
  const governanceService = new SessionGovernanceService(
    sessionRecordRepository,
    settingsRepository,
    60 * 60 * 1000
  );

  sessionRecordRepository.upsert({
    id: "session-active",
    workspaceId: "workspace-a",
    appCode: "codex",
    title: "Current Session",
    cwd: "/srv/current",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T10:00:00.000Z"
  });

  governanceService.refreshActivity({
    appCode: "codex",
    source: "request-session",
    activeWorkspaceId: "workspace-a",
    activeSessionId: "session-active",
    provider: {
      id: "provider-a",
      name: "Provider A",
      bindingMode: "managed",
      source: "session-override",
      missing: false
    },
    promptTemplate: {
      id: "prompt-a",
      name: "Prompt A",
      locale: "zh-CN",
      source: "workspace-default",
      missing: false,
      content: "prompt",
      enabled: true
    },
    skill: {
      id: "skill-a",
      name: "Skill A",
      source: "workspace-default",
      missing: false,
      promptTemplateId: "prompt-a",
      content: "skill",
      enabled: true
    },
    systemInstruction: "prompt\n\nskill",
    warnings: []
  });

  const refreshed = sessionRecordRepository.findActiveById("session-active");
  assert.equal(refreshed?.providerId, "provider-a");
  assert.equal(refreshed?.promptTemplateId, "prompt-a");
  assert.equal(refreshed?.skillId, "skill-a");
  assert.doesNotThrow(() => activeContextService.activateSession("session-active"));

  database.close();
});

test("drops archived session from active context state on read", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const bindingRepository = new BindingRepository(database);
  const settingsRepository = new SettingsRepository(database);
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

  sessionRecordRepository.upsert({
    id: "session-archived",
    workspaceId: null,
    appCode: "codex",
    title: "Archived",
    cwd: "/srv/archived",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "archived",
    startedAt: "2026-03-20T10:00:00.000Z"
  });
  settingsRepository.setActiveSessionId("session-archived");

  const state = activeContextService.getState();

  assert.equal(state.activeSessionId, null);
  assert.equal(state.sessionContext, null);
  assert.equal(settingsRepository.getActiveSessionId(), null);

  database.close();
});
