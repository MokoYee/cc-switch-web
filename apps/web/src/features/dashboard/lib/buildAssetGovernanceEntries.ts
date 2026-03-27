import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";

export type AssetGovernanceLevel = "low" | "medium" | "high";

export type PromptGovernanceEntry = {
  readonly item: DashboardSnapshot["promptTemplates"][number];
  readonly linkedSkillIds: string[];
  readonly linkedWorkspaceIds: string[];
  readonly linkedSessionIds: string[];
  readonly warnings: string[];
  readonly governanceLevel: AssetGovernanceLevel;
  readonly impactScore: number;
};

export type SkillGovernanceEntry = {
  readonly item: DashboardSnapshot["skills"][number];
  readonly linkedWorkspaceIds: string[];
  readonly linkedSessionIds: string[];
  readonly warnings: string[];
  readonly governanceLevel: AssetGovernanceLevel;
  readonly impactScore: number;
  readonly missingPrompt: boolean;
};

const governanceRank = (level: AssetGovernanceLevel): number => {
  if (level === "high") {
    return 0;
  }
  if (level === "medium") {
    return 1;
  }
  return 2;
};

const toGovernanceLevel = (level: AssetGovernanceLevel): AssetGovernanceLevel => level;

export const buildPromptGovernanceEntries = (
  snapshot: DashboardSnapshot,
  locale: "zh-CN" | "en-US"
): PromptGovernanceEntry[] =>
  snapshot.promptTemplates
    .map((item) => {
      const linkedSkillIds = snapshot.skills
        .filter((skill) => skill.promptTemplateId === item.id)
        .map((skill) => skill.id);
      const linkedWorkspaceIds = snapshot.workspaces
        .filter(
          (workspace) =>
            workspace.defaultPromptTemplateId === item.id ||
            (workspace.defaultSkillId !== null && linkedSkillIds.includes(workspace.defaultSkillId))
        )
        .map((workspace) => workspace.id);
      const linkedSessionIds = snapshot.sessionRecords
        .filter(
          (session) =>
            session.promptTemplateId === item.id ||
            (session.skillId !== null && linkedSkillIds.includes(session.skillId))
        )
        .map((session) => session.id);
      const warnings: string[] = [];

      if (!item.enabled && linkedSkillIds.length > 0) {
        warnings.push(
          locale === "zh-CN"
            ? `该 Prompt 已停用，但仍被这些 Skill 引用：${linkedSkillIds.join(", ")}。`
            : `This prompt is disabled but still referenced by these skills: ${linkedSkillIds.join(", ")}.`
        );
      }

      const governanceLevel = toGovernanceLevel(
        warnings.length > 0
          ? "high"
          : linkedWorkspaceIds.length > 0 || linkedSessionIds.length > 0
            ? "medium"
            : "low"
      );

      return {
        item,
        linkedSkillIds,
        linkedWorkspaceIds,
        linkedSessionIds,
        warnings,
        governanceLevel,
        impactScore: linkedWorkspaceIds.length * 2 + linkedSessionIds.length + linkedSkillIds.length
      };
    })
    .sort((left, right) => {
      const rankDiff = governanceRank(left.governanceLevel) - governanceRank(right.governanceLevel);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      if (right.impactScore !== left.impactScore) {
        return right.impactScore - left.impactScore;
      }
      return left.item.name.localeCompare(right.item.name);
    });

export const buildSkillGovernanceEntries = (
  snapshot: DashboardSnapshot,
  locale: "zh-CN" | "en-US"
): SkillGovernanceEntry[] => {
  const promptTemplateIds = new Set(snapshot.promptTemplates.map((item) => item.id));
  const enabledPromptTemplateIds = new Set(
    snapshot.promptTemplates.filter((item) => item.enabled).map((item) => item.id)
  );

  return snapshot.skills
    .map((item) => {
      const linkedWorkspaceIds = snapshot.workspaces
        .filter((workspace) => workspace.defaultSkillId === item.id)
        .map((workspace) => workspace.id);
      const linkedSessionIds = snapshot.sessionRecords
        .filter((session) => session.skillId === item.id)
        .map((session) => session.id);
      const warnings: string[] = [];
      const missingPrompt =
        item.promptTemplateId !== null && promptTemplateIds.has(item.promptTemplateId) === false;

      if (item.promptTemplateId && missingPrompt) {
        warnings.push(
          locale === "zh-CN"
            ? `关联 Prompt 不存在：${item.promptTemplateId}。`
            : `Linked prompt does not exist: ${item.promptTemplateId}.`
        );
      }
      if (
        item.promptTemplateId &&
        enabledPromptTemplateIds.has(item.promptTemplateId) === false &&
        promptTemplateIds.has(item.promptTemplateId)
      ) {
        warnings.push(
          locale === "zh-CN"
            ? `关联 Prompt 已停用：${item.promptTemplateId}。`
            : `Linked prompt is disabled: ${item.promptTemplateId}.`
        );
      }
      if (!item.enabled && (linkedWorkspaceIds.length > 0 || linkedSessionIds.length > 0)) {
        warnings.push(
          locale === "zh-CN"
            ? "该 Skill 已停用，但仍被工作区或会话引用。"
            : "This skill is disabled but still referenced by workspaces or sessions."
        );
      }

      const governanceLevel = toGovernanceLevel(
        warnings.length > 0
          ? "high"
          : linkedWorkspaceIds.length > 0 || linkedSessionIds.length > 0
            ? "medium"
            : "low"
      );

      return {
        item,
        linkedWorkspaceIds,
        linkedSessionIds,
        warnings,
        governanceLevel,
        impactScore: linkedWorkspaceIds.length * 2 + linkedSessionIds.length,
        missingPrompt
      };
    })
    .sort((left, right) => {
      const rankDiff = governanceRank(left.governanceLevel) - governanceRank(right.governanceLevel);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      if (right.impactScore !== left.impactScore) {
        return right.impactScore - left.impactScore;
      }
      return left.item.name.localeCompare(right.item.name);
    });
};
