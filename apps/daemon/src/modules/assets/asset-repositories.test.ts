import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "./prompt-template-repository.js";
import { SkillRepository } from "./skill-repository.js";

test("persists prompt templates and skills with tags and optional prompt references", () => {
  const database = openDatabase(":memory:");
  const promptRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);

  const prompt = promptRepository.upsert({
    id: "prompt-codex-review-zh",
    name: "Code Review",
    appCode: "codex",
    locale: "zh-CN",
    content: "请先做边界条件审查。",
    tags: ["review", "safety"],
    enabled: true
  });

  const skill = skillRepository.upsert({
    id: "skill-review-checklist",
    name: "Review Checklist",
    appCode: "codex",
    promptTemplateId: prompt.id,
    content: "检查 correctness, maintainability, regression risk。",
    tags: ["review"],
    enabled: true
  });

  assert.equal(promptRepository.list().length, 1);
  assert.deepEqual(promptRepository.list()[0]?.tags, ["review", "safety"]);
  assert.equal(skillRepository.list().length, 1);
  assert.equal(skillRepository.list()[0]?.promptTemplateId, prompt.id);
  assert.equal(skillRepository.countByPromptTemplateId(prompt.id), 1);

  assert.equal(skillRepository.delete(skill.id), true);
  assert.equal(promptRepository.delete(prompt.id), true);
  assert.equal(promptRepository.list().length, 0);

  database.close();
});
