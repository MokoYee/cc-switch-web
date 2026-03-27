import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { AssetVersionService } from "../assets/asset-version-service.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { PromptTemplateVersionRepository } from "../assets/prompt-template-version-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { SkillVersionRepository } from "../assets/skill-version-repository.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";
import { AssetGovernanceService } from "./asset-governance-service.js";

test("previews and repairs conservative asset governance issues", () => {
  const database = openDatabase(":memory:");
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const promptTemplateVersionRepository = new PromptTemplateVersionRepository(database);
  const skillRepository = new SkillRepository(database);
  const skillVersionRepository = new SkillVersionRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const assetVersionService = new AssetVersionService(
    promptTemplateRepository,
    promptTemplateVersionRepository,
    skillRepository,
    skillVersionRepository
  );
  const service = new AssetGovernanceService(
    promptTemplateRepository,
    skillRepository,
    workspaceRepository,
    sessionRecordRepository,
    assetVersionService
  );

  promptTemplateRepository.upsert({
    id: "prompt-a",
    name: "Prompt A",
    appCode: "codex",
    locale: "zh-CN",
    content: "prompt-a",
    tags: [],
    enabled: false
  });
  promptTemplateRepository.upsert({
    id: "prompt-b",
    name: "Prompt B",
    appCode: "codex",
    locale: "zh-CN",
    content: "prompt-b",
    tags: [],
    enabled: true
  });
  promptTemplateRepository.upsert({
    id: "prompt-c",
    name: "Prompt C",
    appCode: "codex",
    locale: "zh-CN",
    content: "prompt-c",
    tags: [],
    enabled: false
  });

  skillRepository.upsert({
    id: "skill-a",
    name: "Skill A",
    appCode: "codex",
    promptTemplateId: "prompt-a",
    content: "skill-a",
    tags: [],
    enabled: true
  });
  skillRepository.upsert({
    id: "skill-b",
    name: "Skill B",
    appCode: "codex",
    promptTemplateId: "prompt-b",
    content: "skill-b",
    tags: [],
    enabled: false
  });
  skillRepository.upsert({
    id: "skill-c",
    name: "Skill C",
    appCode: "codex",
    promptTemplateId: "prompt-c",
    content: "skill-c",
    tags: [],
    enabled: true
  });
  skillRepository.upsert({
    id: "skill-d",
    name: "Skill D",
    appCode: "codex",
    promptTemplateId: "prompt-missing",
    content: "skill-d",
    tags: [],
    enabled: true
  });

  workspaceRepository.upsert({
    id: "workspace-a",
    name: "Workspace A",
    rootPath: "/tmp/workspace-a",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: "skill-a",
    tags: [],
    enabled: true
  });
  workspaceRepository.upsert({
    id: "workspace-b",
    name: "Workspace B",
    rootPath: "/tmp/workspace-b",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: "skill-b",
    tags: [],
    enabled: true
  });

  sessionRecordRepository.upsert({
    id: "session-a",
    workspaceId: "workspace-a",
    appCode: "codex",
    title: "Session A",
    cwd: "/tmp/workspace-a",
    providerId: null,
    promptTemplateId: null,
    skillId: "skill-a",
    status: "active",
    startedAt: "2026-03-23T00:00:00.000Z"
  });
  sessionRecordRepository.upsert({
    id: "session-b",
    workspaceId: "workspace-b",
    appCode: "codex",
    title: "Session B",
    cwd: "/tmp/workspace-b",
    providerId: null,
    promptTemplateId: null,
    skillId: "skill-b",
    status: "active",
    startedAt: "2026-03-23T00:00:00.000Z"
  });

  const preview = service.preview("codex");
  assert.equal(preview.scopeAppCode, "codex");
  assert.equal(preview.highRiskItems, 6);
  assert.equal(preview.repairableItems, 5);
  assert.equal(preview.pendingManualItems, 1);
  assert.equal(preview.totalPlannedActions, 5);

  const promptIssue = preview.items.find((item) => item.targetId === "prompt-a");
  assert.deepEqual(promptIssue?.issueCodes, ["prompt-disabled-in-use"]);
  assert.deepEqual(promptIssue?.plannedActions, ["enable-prompt"]);

  const missingPromptIssue = preview.items.find((item) => item.targetId === "skill-d");
  assert.deepEqual(missingPromptIssue?.issueCodes, ["skill-missing-prompt"]);
  assert.deepEqual(missingPromptIssue?.plannedActions, []);

  const repairResult = service.repair("codex");
  assert.deepEqual(repairResult.executedActions, ["enable-prompt", "enable-skill"]);
  assert.deepEqual(repairResult.changedPromptTemplateIds, ["prompt-a", "prompt-c"]);
  assert.deepEqual(repairResult.changedSkillIds, ["skill-b"]);
  assert.equal(repairResult.repairedItems, 3);
  assert.equal(repairResult.remainingManualItems, 1);
  assert.deepEqual(repairResult.remainingIssueCodes, ["skill-missing-prompt"]);

  assert.equal(promptTemplateRepository.get("prompt-a")?.enabled, true);
  assert.equal(promptTemplateRepository.get("prompt-c")?.enabled, true);
  assert.equal(skillRepository.get("skill-b")?.enabled, true);
  assert.equal(skillRepository.get("skill-d")?.promptTemplateId, "prompt-missing");

  database.close();
});
