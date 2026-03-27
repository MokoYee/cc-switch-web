import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { AssetVersionService } from "./asset-version-service.js";
import { PromptTemplateRepository } from "./prompt-template-repository.js";
import { PromptTemplateVersionRepository } from "./prompt-template-version-repository.js";
import { SkillRepository } from "./skill-repository.js";
import { SkillVersionRepository } from "./skill-version-repository.js";

test("records prompt template and skill versions and restores prior revisions", () => {
  const database = openDatabase(":memory:");
  const service = new AssetVersionService(
    new PromptTemplateRepository(database),
    new PromptTemplateVersionRepository(database),
    new SkillRepository(database),
    new SkillVersionRepository(database)
  );

  const promptV1 = service.upsertPromptTemplate({
    id: "prompt-review",
    name: "Review",
    appCode: "codex",
    locale: "zh-CN",
    content: "第一版提示词",
    tags: ["review"],
    enabled: true
  });
  const promptV2 = service.upsertPromptTemplate({
    id: "prompt-review",
    name: "Review",
    appCode: "codex",
    locale: "zh-CN",
    content: "第二版提示词",
    tags: ["review", "strict"],
    enabled: true
  });

  assert.equal(promptV1.version.versionNumber, 1);
  assert.equal(promptV2.version.versionNumber, 2);
  assert.equal(service.listPromptTemplateVersions("prompt-review").length, 2);

  const restoredPrompt = service.restorePromptTemplateVersion("prompt-review", 1);
  assert.equal(restoredPrompt.item.content, "第一版提示词");
  assert.equal(restoredPrompt.version.versionNumber, 3);

  const skillV1 = service.upsertSkill({
    id: "skill-review",
    name: "Review Skill",
    appCode: "codex",
    promptTemplateId: "prompt-review",
    content: "第一版技能",
    tags: ["review"],
    enabled: true
  });
  const skillV2 = service.upsertSkill({
    id: "skill-review",
    name: "Review Skill",
    appCode: "codex",
    promptTemplateId: "prompt-review",
    content: "第二版技能",
    tags: ["review", "strict"],
    enabled: true
  });

  assert.equal(skillV1.version.versionNumber, 1);
  assert.equal(skillV2.version.versionNumber, 2);
  assert.equal(service.listSkillVersions("skill-review").length, 2);

  const restoredSkill = service.restoreSkillVersion("skill-review", 1);
  assert.equal(restoredSkill.item.content, "第一版技能");
  assert.equal(restoredSkill.version.versionNumber, 3);

  database.close();
});

test("does not create duplicate prompt template or skill versions for unchanged saves", () => {
  const database = openDatabase(":memory:");
  const service = new AssetVersionService(
    new PromptTemplateRepository(database),
    new PromptTemplateVersionRepository(database),
    new SkillRepository(database),
    new SkillVersionRepository(database)
  );

  const promptV1 = service.upsertPromptTemplate({
    id: "prompt-stable",
    name: "Stable Prompt",
    appCode: "codex",
    locale: "zh-CN",
    content: "稳定版本",
    tags: ["stable"],
    enabled: true
  });
  const promptNoop = service.upsertPromptTemplate({
    id: "prompt-stable",
    name: "Stable Prompt",
    appCode: "codex",
    locale: "zh-CN",
    content: "稳定版本",
    tags: ["stable"],
    enabled: true
  });

  assert.equal(promptV1.version.versionNumber, 1);
  assert.equal(promptNoop.version.versionNumber, 1);
  assert.equal(service.listPromptTemplateVersions("prompt-stable").length, 1);

  const skillV1 = service.upsertSkill({
    id: "skill-stable",
    name: "Stable Skill",
    appCode: "codex",
    promptTemplateId: "prompt-stable",
    content: "稳定技能",
    tags: ["stable"],
    enabled: true
  });
  const skillNoop = service.upsertSkill({
    id: "skill-stable",
    name: "Stable Skill",
    appCode: "codex",
    promptTemplateId: "prompt-stable",
    content: "稳定技能",
    tags: ["stable"],
    enabled: true
  });

  assert.equal(skillV1.version.versionNumber, 1);
  assert.equal(skillNoop.version.versionNumber, 1);
  assert.equal(service.listSkillVersions("skill-stable").length, 1);

  database.close();
});
