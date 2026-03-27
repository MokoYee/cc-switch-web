import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { SessionRecordRepository } from "./session-record-repository.js";
import { WorkspaceRepository } from "./workspace-repository.js";

test("persists workspaces and session records with linked defaults", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);

  const workspace = workspaceRepository.upsert({
    id: "workspace-api",
    name: "API Service",
    rootPath: "/srv/api-service",
    appCode: "codex",
    defaultProviderId: "provider-primary",
    defaultPromptTemplateId: "prompt-codex-review-zh",
    defaultSkillId: "skill-review-checklist",
    tags: ["backend", "prod"],
    enabled: true
  });

  const session = sessionRepository.upsert({
    id: "session-api-001",
    workspaceId: workspace.id,
    appCode: "codex",
    title: "Repair proxy headers",
    cwd: "/srv/api-service",
    providerId: "provider-primary",
    promptTemplateId: "prompt-codex-review-zh",
    skillId: "skill-review-checklist",
    status: "active",
    startedAt: "2026-03-21T10:00:00.000Z"
  });

  assert.equal(workspaceRepository.list().length, 1);
  assert.equal(sessionRepository.list().length, 1);
  assert.equal(session.workspaceId, workspace.id);
  assert.equal(sessionRepository.countByWorkspaceId(workspace.id), 1);

  assert.equal(sessionRepository.delete(session.id), true);
  assert.equal(workspaceRepository.delete(workspace.id), true);

  database.close();
});
