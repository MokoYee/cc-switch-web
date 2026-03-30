import type {
  AppCode,
  AssetGovernanceIssueCode,
  AssetGovernancePreview,
  AssetGovernancePreviewItem,
  AssetGovernanceRepairAction,
  AssetGovernanceRepairResult,
  PromptTemplate,
  Skill
} from "cc-switch-web-shared";

import type { AssetVersionService } from "../assets/asset-version-service.js";
import type { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import type { SkillRepository } from "../assets/skill-repository.js";
import type { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import type { WorkspaceRepository } from "../workspaces/workspace-repository.js";

const sortAppCodes = (values: Iterable<AppCode>): AppCode[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const sortStrings = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const rankLevel = (level: AssetGovernancePreviewItem["level"]): number => {
  if (level === "high") {
    return 0;
  }
  if (level === "medium") {
    return 1;
  }
  return 2;
};

export class AssetGovernanceService {
  constructor(
    private readonly promptTemplateRepository: PromptTemplateRepository,
    private readonly skillRepository: SkillRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly assetVersionService: AssetVersionService
  ) {}

  preview(scopeAppCode: AppCode | null = null): AssetGovernancePreview {
    const items = this.listPreviewItems()
      .filter((item) => scopeAppCode === null || item.affectedAppCodes.includes(scopeAppCode))
      .sort((left, right) => {
        const levelDiff = rankLevel(left.level) - rankLevel(right.level);
        if (levelDiff !== 0) {
          return levelDiff;
        }
        if (right.relationCount !== left.relationCount) {
          return right.relationCount - left.relationCount;
        }
        return `${left.targetType}:${left.targetId}`.localeCompare(`${right.targetType}:${right.targetId}`);
      });

    return {
      scopeAppCode,
      totalItems: items.length,
      highRiskItems: items.filter((item) => item.issueCodes.length > 0).length,
      repairableItems: items.filter((item) => item.repairable).length,
      pendingManualItems: items.filter((item) =>
        item.issueCodes.some((issueCode) => isAutoRepairableIssue(item, issueCode) === false)
      ).length,
      totalPlannedActions: items.reduce((sum, item) => sum + item.plannedActions.length, 0),
      items
    };
  }

  repair(scopeAppCode: AppCode | null = null): AssetGovernanceRepairResult {
    const preview = this.preview(scopeAppCode);
    const promptIdsToEnable = new Set<string>();
    const skillIdsToEnable = new Set<string>();

    for (const item of preview.items) {
      for (const action of item.plannedActions) {
        if (action === "enable-prompt") {
          if (item.targetType === "prompt-template") {
            promptIdsToEnable.add(item.targetId);
          } else if (item.linkedPromptId !== null) {
            promptIdsToEnable.add(item.linkedPromptId);
          }
        }

        if (action === "enable-skill" && item.targetType === "skill") {
          skillIdsToEnable.add(item.targetId);
        }
      }
    }

    const changedPromptTemplateIds: string[] = [];
    const changedSkillIds: string[] = [];

    for (const promptTemplateId of sortStrings(promptIdsToEnable)) {
      const current = this.promptTemplateRepository.get(promptTemplateId);
      if (current === null || current.enabled) {
        continue;
      }

      this.assetVersionService.upsertPromptTemplate(toPromptTemplateUpsert(current, true));
      changedPromptTemplateIds.push(promptTemplateId);
    }

    for (const skillId of sortStrings(skillIdsToEnable)) {
      const current = this.skillRepository.get(skillId);
      if (current === null || current.enabled) {
        continue;
      }

      this.assetVersionService.upsertSkill(toSkillUpsert(current, true));
      changedSkillIds.push(skillId);
    }

    const postRepair = this.preview(scopeAppCode);
    const executedActions = [
      ...(changedPromptTemplateIds.length > 0 ? ([ "enable-prompt" ] as const) : []),
      ...(changedSkillIds.length > 0 ? ([ "enable-skill" ] as const) : [])
    ];

    return {
      scopeAppCode,
      executedActions,
      changedPromptTemplateIds,
      changedSkillIds,
      repairedItems: changedPromptTemplateIds.length + changedSkillIds.length,
      remainingManualItems: postRepair.items.filter((item) => item.issueCodes.length > 0).length,
      remainingIssueCodes: sortStrings(
        postRepair.items.flatMap((item) => item.issueCodes)
      ) as AssetGovernanceIssueCode[],
      message: buildRepairMessage({
        scopeAppCode,
        repairedItems: changedPromptTemplateIds.length + changedSkillIds.length,
        remainingManualItems: postRepair.items.filter((item) => item.issueCodes.length > 0).length
      })
    };
  }

  private listPreviewItems(): AssetGovernancePreviewItem[] {
    const promptTemplates = this.promptTemplateRepository.list();
    const skills = this.skillRepository.list();
    const workspaces = this.workspaceRepository.list();
    const sessionRecords = this.sessionRecordRepository.list();

    const promptItems = promptTemplates.map((item) =>
      this.buildPromptPreviewItem(item, skills, workspaces, sessionRecords)
    );
    const skillItems = skills.map((item) =>
      this.buildSkillPreviewItem(item, promptTemplates, workspaces, sessionRecords)
    );

    return [...promptItems, ...skillItems];
  }

  private buildPromptPreviewItem(
    item: PromptTemplate,
    skills: Skill[],
    workspaces: ReturnType<WorkspaceRepository["list"]>,
    sessionRecords: ReturnType<SessionRecordRepository["list"]>
  ): AssetGovernancePreviewItem {
    const referencedSkills = skills.filter((skill) => skill.promptTemplateId === item.id);
    const referencedSkillIds = new Set(referencedSkills.map((skill) => skill.id));
    const referencedBySkillIds = sortStrings(referencedSkillIds);
    const usedByWorkspaceIds = sortStrings(
      workspaces
        .filter(
          (workspace) =>
            workspace.defaultPromptTemplateId === item.id ||
            (workspace.defaultSkillId !== null && referencedSkillIds.has(workspace.defaultSkillId))
        )
        .map((workspace) => workspace.id)
    );
    const usedBySessionIds = sortStrings(
      sessionRecords
        .filter(
          (session) =>
            session.promptTemplateId === item.id ||
            (session.skillId !== null && referencedSkillIds.has(session.skillId))
        )
        .map((session) => session.id)
    );
    const affectedAppCodes = sortAppCodes([
      ...referencedSkills
        .map((skill) => skill.appCode)
        .filter((appCode): appCode is AppCode => appCode !== null),
      ...workspaces
        .filter((workspace) => usedByWorkspaceIds.includes(workspace.id))
        .map((workspace) => workspace.appCode)
        .filter((appCode): appCode is AppCode => appCode !== null),
      ...sessionRecords
        .filter((session) => usedBySessionIds.includes(session.id))
        .map((session) => session.appCode),
      ...(item.appCode === null ? [] : [item.appCode])
    ]);
    const relationCount =
      referencedBySkillIds.length + usedByWorkspaceIds.length + usedBySessionIds.length;
    const issueCodes: AssetGovernanceIssueCode[] =
      !item.enabled && relationCount > 0 ? ["prompt-disabled-in-use"] : [];
    const plannedActions: AssetGovernanceRepairAction[] =
      issueCodes.includes("prompt-disabled-in-use") ? ["enable-prompt"] : [];

    return {
      targetType: "prompt-template",
      targetId: item.id,
      appCode: item.appCode,
      affectedAppCodes,
      level: issueCodes.length > 0 ? "high" : relationCount > 0 ? "medium" : "low",
      issueCodes,
      relationCount,
      linkedPromptId: null,
      referencedBySkillIds,
      usedByWorkspaceIds,
      usedBySessionIds,
      repairable: plannedActions.length > 0,
      plannedActions
    };
  }

  private buildSkillPreviewItem(
    item: Skill,
    promptTemplates: PromptTemplate[],
    workspaces: ReturnType<WorkspaceRepository["list"]>,
    sessionRecords: ReturnType<SessionRecordRepository["list"]>
  ): AssetGovernancePreviewItem {
    const linkedPrompt =
      item.promptTemplateId === null
        ? null
        : promptTemplates.find((promptTemplate) => promptTemplate.id === item.promptTemplateId) ?? null;
    const usedByWorkspaceIds = sortStrings(
      workspaces
        .filter((workspace) => workspace.defaultSkillId === item.id)
        .map((workspace) => workspace.id)
    );
    const usedBySessionIds = sortStrings(
      sessionRecords
        .filter((session) => session.skillId === item.id)
        .map((session) => session.id)
    );
    const relationCount = usedByWorkspaceIds.length + usedBySessionIds.length;
    const issueCodes: AssetGovernanceIssueCode[] = [];

    if (item.promptTemplateId !== null && linkedPrompt === null) {
      issueCodes.push("skill-missing-prompt");
    }
    if (linkedPrompt !== null && linkedPrompt.enabled === false) {
      issueCodes.push("skill-prompt-disabled");
    }
    if (item.enabled === false && relationCount > 0) {
      issueCodes.push("skill-disabled-in-use");
    }

    const plannedActions: AssetGovernanceRepairAction[] = [];
    if (linkedPrompt !== null && linkedPrompt.enabled === false) {
      plannedActions.push("enable-prompt");
    }
    if (item.enabled === false && relationCount > 0) {
      plannedActions.push("enable-skill");
    }

    return {
      targetType: "skill",
      targetId: item.id,
      appCode: item.appCode,
      affectedAppCodes: sortAppCodes([
        ...workspaces
          .filter((workspace) => usedByWorkspaceIds.includes(workspace.id))
          .map((workspace) => workspace.appCode)
          .filter((appCode): appCode is AppCode => appCode !== null),
        ...sessionRecords
          .filter((session) => usedBySessionIds.includes(session.id))
          .map((session) => session.appCode),
        ...(item.appCode === null ? [] : [item.appCode])
      ]),
      level: issueCodes.length > 0 ? "high" : relationCount > 0 ? "medium" : "low",
      issueCodes,
      relationCount,
      linkedPromptId: item.promptTemplateId,
      referencedBySkillIds: [],
      usedByWorkspaceIds,
      usedBySessionIds,
      repairable: plannedActions.length > 0,
      plannedActions: sortStrings(plannedActions) as AssetGovernanceRepairAction[]
    };
  }
}

const toPromptTemplateUpsert = (
  item: PromptTemplate,
  enabled: boolean
): Parameters<AssetVersionService["upsertPromptTemplate"]>[0] => ({
  id: item.id,
  name: item.name,
  appCode: item.appCode,
  locale: item.locale,
  content: item.content,
  tags: item.tags,
  enabled
});

const toSkillUpsert = (
  item: Skill,
  enabled: boolean
): Parameters<AssetVersionService["upsertSkill"]>[0] => ({
  id: item.id,
  name: item.name,
  appCode: item.appCode,
  promptTemplateId: item.promptTemplateId,
  content: item.content,
  tags: item.tags,
  enabled
});

const isAutoRepairableIssue = (
  item: AssetGovernancePreviewItem,
  issueCode: AssetGovernanceIssueCode
): boolean => {
  if (issueCode === "prompt-disabled-in-use") {
    return item.targetType === "prompt-template" && item.plannedActions.includes("enable-prompt");
  }
  if (issueCode === "skill-disabled-in-use") {
    return item.targetType === "skill" && item.plannedActions.includes("enable-skill");
  }
  if (issueCode === "skill-prompt-disabled") {
    return item.targetType === "skill" && item.plannedActions.includes("enable-prompt");
  }
  return false;
};

const buildRepairMessage = ({
  scopeAppCode,
  repairedItems,
  remainingManualItems
}: {
  readonly scopeAppCode: AppCode | null;
  readonly repairedItems: number;
  readonly remainingManualItems: number;
}): string => {
  const scopeLabel = scopeAppCode ?? "all-apps";
  if (repairedItems === 0) {
    return remainingManualItems > 0
      ? `No safe asset governance repair could be applied for ${scopeLabel}; manual review is still required.`
      : `No asset governance repair was required for ${scopeLabel}.`;
  }

  if (remainingManualItems > 0) {
    return `Applied asset governance repair for ${scopeLabel}; ${remainingManualItems} high-risk item(s) still need manual review.`;
  }

  return `Applied asset governance repair for ${scopeLabel}; high-risk assets are now converged.`;
};
