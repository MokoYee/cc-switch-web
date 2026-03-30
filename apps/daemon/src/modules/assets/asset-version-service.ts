import type {
  PromptTemplate,
  PromptTemplateUpsert,
  PromptTemplateVersion,
  Skill,
  SkillUpsert,
  SkillVersion
} from "cc-switch-web-shared";

import type { PromptTemplateRepository } from "./prompt-template-repository.js";
import type { PromptTemplateVersionRepository } from "./prompt-template-version-repository.js";
import type { SkillRepository } from "./skill-repository.js";
import type { SkillVersionRepository } from "./skill-version-repository.js";

export class AssetVersionService {
  constructor(
    private readonly promptTemplateRepository: PromptTemplateRepository,
    private readonly promptTemplateVersionRepository: PromptTemplateVersionRepository,
    private readonly skillRepository: SkillRepository,
    private readonly skillVersionRepository: SkillVersionRepository
  ) {}

  upsertPromptTemplate(input: PromptTemplateUpsert): {
    readonly item: PromptTemplate;
    readonly version: PromptTemplateVersion;
  } {
    const previous = this.promptTemplateRepository.get(input.id);
    const item = this.promptTemplateRepository.upsert(input);
    const version =
      previous !== null && isSamePromptTemplateSnapshot(previous, item)
        ? this.getLatestPromptTemplateVersion(item.id) ?? this.promptTemplateVersionRepository.append(item)
        : this.promptTemplateVersionRepository.append(item);
    return { item, version };
  }

  listPromptTemplateVersions(promptTemplateId: string): PromptTemplateVersion[] {
    return this.promptTemplateVersionRepository.list(promptTemplateId);
  }

  restorePromptTemplateVersion(promptTemplateId: string, versionNumber: number): {
    readonly item: PromptTemplate;
    readonly version: PromptTemplateVersion;
  } {
    const version = this.promptTemplateVersionRepository.get(promptTemplateId, versionNumber);
    if (version === null) {
      throw new Error(`Prompt template version not found: ${promptTemplateId}#${versionNumber}`);
    }

    return this.upsertPromptTemplate({
      id: version.item.id,
      name: version.item.name,
      appCode: version.item.appCode,
      locale: version.item.locale,
      content: version.item.content,
      tags: version.item.tags,
      enabled: version.item.enabled
    });
  }

  upsertSkill(input: SkillUpsert): {
    readonly item: Skill;
    readonly version: SkillVersion;
  } {
    const previous = this.skillRepository.get(input.id);
    const item = this.skillRepository.upsert(input);
    const version =
      previous !== null && isSameSkillSnapshot(previous, item)
        ? this.getLatestSkillVersion(item.id) ?? this.skillVersionRepository.append(item)
        : this.skillVersionRepository.append(item);
    return { item, version };
  }

  listSkillVersions(skillId: string): SkillVersion[] {
    return this.skillVersionRepository.list(skillId);
  }

  restoreSkillVersion(skillId: string, versionNumber: number): {
    readonly item: Skill;
    readonly version: SkillVersion;
  } {
    const version = this.skillVersionRepository.get(skillId, versionNumber);
    if (version === null) {
      throw new Error(`Skill version not found: ${skillId}#${versionNumber}`);
    }

    return this.upsertSkill({
      id: version.item.id,
      name: version.item.name,
      appCode: version.item.appCode,
      promptTemplateId: version.item.promptTemplateId,
      content: version.item.content,
      tags: version.item.tags,
      enabled: version.item.enabled
    });
  }

  private getLatestPromptTemplateVersion(promptTemplateId: string): PromptTemplateVersion | null {
    return this.promptTemplateVersionRepository.list(promptTemplateId)[0] ?? null;
  }

  private getLatestSkillVersion(skillId: string): SkillVersion | null {
    return this.skillVersionRepository.list(skillId)[0] ?? null;
  }
}

const isSamePromptTemplateSnapshot = (
  left: PromptTemplate,
  right: PromptTemplate
): boolean =>
  left.id === right.id &&
  left.name === right.name &&
  left.appCode === right.appCode &&
  left.locale === right.locale &&
  left.content === right.content &&
  left.enabled === right.enabled &&
  JSON.stringify(left.tags) === JSON.stringify(right.tags);

const isSameSkillSnapshot = (left: Skill, right: Skill): boolean =>
  left.id === right.id &&
  left.name === right.name &&
  left.appCode === right.appCode &&
  left.promptTemplateId === right.promptTemplateId &&
  left.content === right.content &&
  left.enabled === right.enabled &&
  JSON.stringify(left.tags) === JSON.stringify(right.tags);
