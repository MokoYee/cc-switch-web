import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type {
  PromptTemplateSavePreview,
  PromptTemplateUpsert,
  PromptTemplateVersion,
  SessionRecordUpsert,
  SessionSavePreview,
  SkillSavePreview,
  SkillUpsert,
  SkillVersion,
  WorkspaceSavePreview,
  WorkspaceUpsert
} from "cc-switch-web-shared";

import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { ConfigImpactSummary } from "./ConfigImpactSummary.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";

const APP_CODES = ["codex", "claude-code", "gemini-cli", "opencode", "openclaw"] as const;

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

const warningIncludes = (warnings: string[], fragment: string): boolean =>
  warnings.some((item) => item.includes(fragment));

const buildAssetNotice = (
  level: "low" | "medium" | "high",
  summary: string,
  suggestions: readonly string[]
): {
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly suggestions: string[];
} => ({
  level,
  summary,
  suggestions: [...suggestions]
});

const buildPromptVersionDiff = (
  current: DashboardSnapshot["promptTemplates"][number] | null,
  version: PromptTemplateVersion
): string[] => {
  if (current === null) {
    return ["missing-current"];
  }

  const diffs: string[] = [];
  if (current.name !== version.item.name) {
    diffs.push("name");
  }
  if (current.locale !== version.item.locale) {
    diffs.push("locale");
  }
  if (current.appCode !== version.item.appCode) {
    diffs.push("appCode");
  }
  if (current.enabled !== version.item.enabled) {
    diffs.push("enabled");
  }
  if (current.content !== version.item.content) {
    diffs.push("content");
  }
  if (JSON.stringify(current.tags) !== JSON.stringify(version.item.tags)) {
    diffs.push("tags");
  }
  return diffs;
};

const buildSkillVersionDiff = (
  current: DashboardSnapshot["skills"][number] | null,
  version: SkillVersion
): string[] => {
  if (current === null) {
    return ["missing-current"];
  }

  const diffs: string[] = [];
  if (current.name !== version.item.name) {
    diffs.push("name");
  }
  if (current.appCode !== version.item.appCode) {
    diffs.push("appCode");
  }
  if (current.promptTemplateId !== version.item.promptTemplateId) {
    diffs.push("promptTemplateId");
  }
  if (current.enabled !== version.item.enabled) {
    diffs.push("enabled");
  }
  if (current.content !== version.item.content) {
    diffs.push("content");
  }
  if (JSON.stringify(current.tags) !== JSON.stringify(version.item.tags)) {
    diffs.push("tags");
  }
  return diffs;
};

type VersionFieldDiff = {
  readonly key:
    | "name"
    | "locale"
    | "appCode"
    | "enabled"
    | "content"
    | "tags"
    | "promptTemplateId"
    | "missing-current";
  readonly label: string;
  readonly currentValue: string;
  readonly targetValue: string;
  readonly riskLevel: "low" | "medium";
};

const normalizeVersionText = (value: string): string => value.trim().replace(/\s+/g, " ");

const previewVersionText = (value: string, limit = 120): string => {
  const normalized = normalizeVersionText(value);
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
};

const formatVersionValue = (
  value: string | boolean | null,
  locale: "zh-CN" | "en-US",
  t: AssetContextFormsPanelProps["formatNumber"] extends never ? never : ReturnType<typeof useI18n>["t"]
): string => {
  if (typeof value === "boolean") {
    return value ? t("common.enabled") : t("common.disabled");
  }
  if (value === null || value.length === 0) {
    return locale === "zh-CN" ? "未设置" : "Not Set";
  }
  return value;
};

const buildVersionFieldLabel = (
  key: VersionFieldDiff["key"],
  locale: "zh-CN" | "en-US"
): string => {
  switch (key) {
    case "name":
      return localize(locale, "名称", "Name");
    case "locale":
      return localize(locale, "语言", "Locale");
    case "appCode":
      return localize(locale, "应用范围", "App Scope");
    case "enabled":
      return localize(locale, "启用状态", "Enabled State");
    case "content":
      return localize(locale, "内容", "Content");
    case "tags":
      return localize(locale, "标签", "Tags");
    case "promptTemplateId":
      return localize(locale, "关联 Prompt", "Linked Prompt");
    case "missing-current":
      return localize(locale, "当前对象", "Current Asset");
  }
};

const buildPromptVersionFieldDiffs = (
  current: DashboardSnapshot["promptTemplates"][number] | null,
  version: PromptTemplateVersion,
  locale: "zh-CN" | "en-US",
  t: ReturnType<typeof useI18n>["t"]
): VersionFieldDiff[] => {
  if (current === null) {
    return [
      {
        key: "missing-current",
        label: buildVersionFieldLabel("missing-current", locale),
        currentValue: localize(locale, "当前表单对应 Prompt 不存在", "The current prompt no longer exists"),
        targetValue: localize(locale, "恢复该历史版本并重新创建", "Restore this version and recreate it"),
        riskLevel: "medium"
      }
    ];
  }

  const diffs: VersionFieldDiff[] = [];
  if (current.name !== version.item.name) {
    diffs.push({
      key: "name",
      label: buildVersionFieldLabel("name", locale),
      currentValue: current.name,
      targetValue: version.item.name,
      riskLevel: "low"
    });
  }
  if (current.locale !== version.item.locale) {
    diffs.push({
      key: "locale",
      label: buildVersionFieldLabel("locale", locale),
      currentValue: current.locale,
      targetValue: version.item.locale,
      riskLevel: "low"
    });
  }
  if (current.appCode !== version.item.appCode) {
    diffs.push({
      key: "appCode",
      label: buildVersionFieldLabel("appCode", locale),
      currentValue: formatVersionValue(current.appCode, locale, t),
      targetValue: formatVersionValue(version.item.appCode, locale, t),
      riskLevel: "medium"
    });
  }
  if (current.enabled !== version.item.enabled) {
    diffs.push({
      key: "enabled",
      label: buildVersionFieldLabel("enabled", locale),
      currentValue: formatVersionValue(current.enabled, locale, t),
      targetValue: formatVersionValue(version.item.enabled, locale, t),
      riskLevel: "medium"
    });
  }
  if (current.content !== version.item.content) {
    diffs.push({
      key: "content",
      label: buildVersionFieldLabel("content", locale),
      currentValue: previewVersionText(current.content),
      targetValue: previewVersionText(version.item.content),
      riskLevel: "medium"
    });
  }
  if (JSON.stringify(current.tags) !== JSON.stringify(version.item.tags)) {
    diffs.push({
      key: "tags",
      label: buildVersionFieldLabel("tags", locale),
      currentValue: current.tags.length > 0 ? current.tags.join(", ") : formatVersionValue(null, locale, t),
      targetValue:
        version.item.tags.length > 0 ? version.item.tags.join(", ") : formatVersionValue(null, locale, t),
      riskLevel: "low"
    });
  }
  return diffs;
};

const buildSkillVersionFieldDiffs = (
  current: DashboardSnapshot["skills"][number] | null,
  version: SkillVersion,
  locale: "zh-CN" | "en-US",
  t: ReturnType<typeof useI18n>["t"]
): VersionFieldDiff[] => {
  if (current === null) {
    return [
      {
        key: "missing-current",
        label: buildVersionFieldLabel("missing-current", locale),
        currentValue: localize(locale, "当前表单对应 Skill 不存在", "The current skill no longer exists"),
        targetValue: localize(locale, "恢复该历史版本并重新创建", "Restore this version and recreate it"),
        riskLevel: "medium"
      }
    ];
  }

  const diffs: VersionFieldDiff[] = [];
  if (current.name !== version.item.name) {
    diffs.push({
      key: "name",
      label: buildVersionFieldLabel("name", locale),
      currentValue: current.name,
      targetValue: version.item.name,
      riskLevel: "low"
    });
  }
  if (current.appCode !== version.item.appCode) {
    diffs.push({
      key: "appCode",
      label: buildVersionFieldLabel("appCode", locale),
      currentValue: formatVersionValue(current.appCode, locale, t),
      targetValue: formatVersionValue(version.item.appCode, locale, t),
      riskLevel: "medium"
    });
  }
  if (current.promptTemplateId !== version.item.promptTemplateId) {
    diffs.push({
      key: "promptTemplateId",
      label: buildVersionFieldLabel("promptTemplateId", locale),
      currentValue: formatVersionValue(current.promptTemplateId, locale, t),
      targetValue: formatVersionValue(version.item.promptTemplateId, locale, t),
      riskLevel: "medium"
    });
  }
  if (current.enabled !== version.item.enabled) {
    diffs.push({
      key: "enabled",
      label: buildVersionFieldLabel("enabled", locale),
      currentValue: formatVersionValue(current.enabled, locale, t),
      targetValue: formatVersionValue(version.item.enabled, locale, t),
      riskLevel: "medium"
    });
  }
  if (current.content !== version.item.content) {
    diffs.push({
      key: "content",
      label: buildVersionFieldLabel("content", locale),
      currentValue: previewVersionText(current.content),
      targetValue: previewVersionText(version.item.content),
      riskLevel: "medium"
    });
  }
  if (JSON.stringify(current.tags) !== JSON.stringify(version.item.tags)) {
    diffs.push({
      key: "tags",
      label: buildVersionFieldLabel("tags", locale),
      currentValue: current.tags.length > 0 ? current.tags.join(", ") : formatVersionValue(null, locale, t),
      targetValue:
        version.item.tags.length > 0 ? version.item.tags.join(", ") : formatVersionValue(null, locale, t),
      riskLevel: "low"
    });
  }
  return diffs;
};

type AssetQueueFilter = "all" | "high" | "prompt" | "skill" | "shared";
type AssetQueueAppFilter = "all" | "shared" | (typeof APP_CODES)[number];

type AssetGovernanceEntry = {
  readonly kind: "prompt" | "skill";
  readonly id: string;
  readonly name: string;
  readonly appCode: PromptTemplateUpsert["appCode"] | SkillUpsert["appCode"];
  readonly enabled: boolean;
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly relationCount: number;
  readonly linkedPromptId: string | null;
  readonly linkedPromptMissing: boolean;
  readonly linkedPromptDisabled: boolean;
  readonly referencedBySkillIds: readonly string[];
  readonly usedByWorkspaceIds: readonly string[];
  readonly usedBySessionIds: readonly string[];
};

const ASSET_QUEUE_FILTER_STORAGE_KEY = "cc-switch-web.asset-queue-filter";
const ASSET_QUEUE_EXPANDED_STORAGE_KEY = "cc-switch-web.asset-queue-expanded";
const ASSET_QUEUE_APP_FILTER_STORAGE_KEY = "cc-switch-web.asset-queue-app-filter";

const readStoredAssetQueueFilter = (): AssetQueueFilter => {
  if (typeof window === "undefined") {
    return "all";
  }

  try {
    const stored = window.sessionStorage.getItem(ASSET_QUEUE_FILTER_STORAGE_KEY);
    return stored === "all" ||
      stored === "high" ||
      stored === "prompt" ||
      stored === "skill" ||
      stored === "shared"
      ? stored
      : "all";
  } catch {
    return "all";
  }
};

const readStoredAssetQueueExpanded = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(ASSET_QUEUE_EXPANDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const readStoredAssetQueueAppFilter = (): AssetQueueAppFilter => {
  if (typeof window === "undefined") {
    return "all";
  }

  try {
    const stored = window.sessionStorage.getItem(ASSET_QUEUE_APP_FILTER_STORAGE_KEY);
    return stored === "all" ||
      stored === "shared" ||
      APP_CODES.includes(stored as (typeof APP_CODES)[number])
      ? (stored as AssetQueueAppFilter)
      : "all";
  } catch {
    return "all";
  }
};

const renderAssetQueueAppFilterLabel = (
  filter: AssetQueueAppFilter,
  locale: "zh-CN" | "en-US"
): string => {
  if (filter === "all") {
    return localize(locale, "全部应用范围", "All App Scopes");
  }
  if (filter === "shared") {
    return localize(locale, "仅全局共享", "Global Shared Only");
  }
  return filter;
};

const toPromptTemplateUpsert = (
  item: DashboardSnapshot["promptTemplates"][number]
): PromptTemplateUpsert => ({
  id: item.id,
  name: item.name,
  appCode: item.appCode,
  locale: item.locale,
  content: item.content,
  tags: item.tags,
  enabled: item.enabled
});

const toSkillUpsert = (item: DashboardSnapshot["skills"][number]): SkillUpsert => ({
  id: item.id,
  name: item.name,
  appCode: item.appCode,
  promptTemplateId: item.promptTemplateId,
  content: item.content,
  tags: item.tags,
  enabled: item.enabled
});

const rankRiskLevel = (level: AssetGovernanceEntry["level"]): number => {
  if (level === "high") {
    return 3;
  }
  if (level === "medium") {
    return 2;
  }
  return 1;
};

const buildPromptGovernanceEntry = ({
  item,
  skills,
  workspaces,
  sessionRecords,
  locale
}: {
  readonly item: DashboardSnapshot["promptTemplates"][number];
  readonly skills: DashboardSnapshot["skills"];
  readonly workspaces: DashboardSnapshot["workspaces"];
  readonly sessionRecords: DashboardSnapshot["sessionRecords"];
  readonly locale: "zh-CN" | "en-US";
}): AssetGovernanceEntry => {
  const referencedBySkillIds = skills
    .filter((skill) => skill.promptTemplateId === item.id)
    .map((skill) => skill.id);
  const usedByWorkspaceIds = workspaces
    .filter((workspace) => workspace.defaultPromptTemplateId === item.id)
    .map((workspace) => workspace.id);
  const usedBySessionIds = sessionRecords
    .filter((session) => session.promptTemplateId === item.id)
    .map((session) => session.id);
  const relationCount =
    referencedBySkillIds.length + usedByWorkspaceIds.length + usedBySessionIds.length;
  const level: AssetGovernanceEntry["level"] =
    !item.enabled && relationCount > 0
      ? "high"
      : relationCount > 0
        ? "medium"
        : "low";

  return {
    kind: "prompt",
    id: item.id,
    name: item.name,
    appCode: item.appCode,
    enabled: item.enabled,
    level,
    summary:
      !item.enabled && relationCount > 0
        ? localize(
            locale,
            `当前 Prompt 已停用，但仍影响 ${relationCount} 个下游对象，继续修改前应先收敛引用链。`,
            `This prompt is disabled but still affects ${relationCount} downstream object(s), so the reference chain should be reduced first.`
          )
        : relationCount > 0
          ? localize(
              locale,
              `当前 Prompt 正被 ${referencedBySkillIds.length} 个 Skill、${usedByWorkspaceIds.length} 个工作区和 ${usedBySessionIds.length} 个会话引用。`,
              `This prompt is currently referenced by ${referencedBySkillIds.length} skill(s), ${usedByWorkspaceIds.length} workspace(s), and ${usedBySessionIds.length} session(s).`
            )
          : localize(
              locale,
              "当前 Prompt 没有明显下游引用，更适合做内容整理或版本归档。",
              "This prompt has no obvious downstream references, so it is better suited for cleanup or version curation."
            ),
    relationCount,
    linkedPromptId: null,
    linkedPromptMissing: false,
    linkedPromptDisabled: false,
    referencedBySkillIds,
    usedByWorkspaceIds,
    usedBySessionIds
  };
};

const buildSkillGovernanceEntry = ({
  item,
  promptTemplates,
  workspaces,
  sessionRecords,
  locale
}: {
  readonly item: DashboardSnapshot["skills"][number];
  readonly promptTemplates: DashboardSnapshot["promptTemplates"];
  readonly workspaces: DashboardSnapshot["workspaces"];
  readonly sessionRecords: DashboardSnapshot["sessionRecords"];
  readonly locale: "zh-CN" | "en-US";
}): AssetGovernanceEntry => {
  const linkedPrompt =
    item.promptTemplateId === null
      ? null
      : promptTemplates.find((prompt) => prompt.id === item.promptTemplateId) ?? null;
  const usedByWorkspaceIds = workspaces
    .filter((workspace) => workspace.defaultSkillId === item.id)
    .map((workspace) => workspace.id);
  const usedBySessionIds = sessionRecords
    .filter((session) => session.skillId === item.id)
    .map((session) => session.id);
  const relationCount = usedByWorkspaceIds.length + usedBySessionIds.length;
  const linkedPromptMissing = item.promptTemplateId !== null && linkedPrompt === null;
  const linkedPromptDisabled = linkedPrompt !== null && !linkedPrompt.enabled;
  const level: AssetGovernanceEntry["level"] =
    linkedPromptMissing || (!item.enabled && relationCount > 0)
      ? "high"
      : linkedPromptDisabled || relationCount > 0
        ? "medium"
        : "low";

  return {
    kind: "skill",
    id: item.id,
    name: item.name,
    appCode: item.appCode,
    enabled: item.enabled,
    level,
    summary: linkedPromptMissing
      ? localize(
          locale,
          "当前 Skill 依赖的 Prompt 已缺失，先补 Prompt 或清空引用，再继续治理上下文。",
          "The linked prompt for this skill is missing. Restore the prompt or clear the reference before continuing context governance."
        )
      : !item.enabled && relationCount > 0
        ? localize(
            locale,
            `当前 Skill 已停用，但仍被 ${relationCount} 个工作区/会话挂载，继续修改前应先解除在途引用。`,
            `This skill is disabled but still attached to ${relationCount} workspace/session context(s), so in-flight references should be cleared first.`
          )
        : linkedPromptDisabled
          ? localize(
              locale,
              "当前 Skill 依赖的 Prompt 已停用，运行态注入链会持续变弱。",
              "The linked prompt for this skill is disabled, so the runtime instruction chain will remain weak."
            )
          : relationCount > 0
            ? localize(
                locale,
                `当前 Skill 正被 ${usedByWorkspaceIds.length} 个工作区和 ${usedBySessionIds.length} 个会话使用。`,
                `This skill is currently used by ${usedByWorkspaceIds.length} workspace(s) and ${usedBySessionIds.length} session(s).`
              )
            : localize(
                locale,
                "当前 Skill 没有明显上下文引用，更适合做内容整理或版本归档。",
                "This skill has no obvious context references, so it is better suited for cleanup or version curation."
              ),
    relationCount,
    linkedPromptId: item.promptTemplateId,
    linkedPromptMissing,
    linkedPromptDisabled,
    referencedBySkillIds: [],
    usedByWorkspaceIds,
    usedBySessionIds
  };
};

type AssetContextFormsPanelProps = {
  readonly providers: DashboardSnapshot["providers"];
  readonly promptTemplates: DashboardSnapshot["promptTemplates"];
  readonly skills: DashboardSnapshot["skills"];
  readonly workspaces: DashboardSnapshot["workspaces"];
  readonly sessionRecords: DashboardSnapshot["sessionRecords"];
  readonly workspaceForm: WorkspaceUpsert;
  readonly setWorkspaceForm: Dispatch<SetStateAction<WorkspaceUpsert>>;
  readonly workspaceTagsText: string;
  readonly setWorkspaceTagsText: Dispatch<SetStateAction<string>>;
  readonly canSaveWorkspace: boolean;
  readonly workspacePreview: WorkspaceSavePreview | null;
  readonly onSaveWorkspace: () => void;
  readonly sessionForm: SessionRecordUpsert;
  readonly setSessionForm: Dispatch<SetStateAction<SessionRecordUpsert>>;
  readonly canSaveSession: boolean;
  readonly sessionPreview: SessionSavePreview | null;
  readonly onSaveSession: () => void;
  readonly promptTemplateForm: PromptTemplateUpsert;
  readonly setPromptTemplateForm: Dispatch<SetStateAction<PromptTemplateUpsert>>;
  readonly promptTagsText: string;
  readonly setPromptTagsText: Dispatch<SetStateAction<string>>;
  readonly canSavePromptTemplate: boolean;
  readonly promptTemplatePreview: PromptTemplateSavePreview | null;
  readonly promptTemplateVersions: PromptTemplateVersion[];
  readonly onSavePromptTemplate: () => void;
  readonly onQuickSavePromptTemplate: (input: PromptTemplateUpsert) => void;
  readonly onRepairGovernance: (appCode?: (typeof APP_CODES)[number]) => void;
  readonly onRestorePromptTemplateVersion: (
    promptTemplateId: string,
    versionNumber: number
  ) => void;
  readonly onLoadPromptTemplateToEditor: (
    item: DashboardSnapshot["promptTemplates"][number]
  ) => void;
  readonly onInspectWorkspaceRuntime: (workspaceId: string) => void;
  readonly onInspectSessionRuntime: (sessionId: string) => void;
  readonly onOpenWorkspaceBatchReview: (
    workspaceIds: string[],
    sourceLabel: string,
    appCode: WorkspaceUpsert["appCode"] | SkillUpsert["appCode"] | PromptTemplateUpsert["appCode"]
  ) => void;
  readonly onOpenSessionBatchReview: (
    sessionIds: string[],
    sourceLabel: string,
    appCode: WorkspaceUpsert["appCode"] | SkillUpsert["appCode"] | PromptTemplateUpsert["appCode"]
  ) => void;
  readonly skillForm: SkillUpsert;
  readonly setSkillForm: Dispatch<SetStateAction<SkillUpsert>>;
  readonly skillTagsText: string;
  readonly setSkillTagsText: Dispatch<SetStateAction<string>>;
  readonly canSaveSkill: boolean;
  readonly skillPreview: SkillSavePreview | null;
  readonly skillVersions: SkillVersion[];
  readonly onSaveSkill: () => void;
  readonly onQuickSaveSkill: (input: SkillUpsert) => void;
  readonly onRestoreSkillVersion: (skillId: string, versionNumber: number) => void;
  readonly onLoadSkillToEditor: (item: DashboardSnapshot["skills"][number]) => void;
  readonly isWorking: boolean;
  readonly formatNumber: (value: number) => string;
};

export const AssetContextFormsPanel = ({
  providers,
  promptTemplates,
  skills,
  workspaces,
  sessionRecords,
  workspaceForm,
  setWorkspaceForm,
  workspaceTagsText,
  setWorkspaceTagsText,
  canSaveWorkspace,
  workspacePreview,
  onSaveWorkspace,
  sessionForm,
  setSessionForm,
  canSaveSession,
  sessionPreview,
  onSaveSession,
  promptTemplateForm,
  setPromptTemplateForm,
  promptTagsText,
  setPromptTagsText,
  canSavePromptTemplate,
  promptTemplatePreview,
  promptTemplateVersions,
  onSavePromptTemplate,
  onQuickSavePromptTemplate,
  onRepairGovernance,
  onRestorePromptTemplateVersion,
  onLoadPromptTemplateToEditor,
  onInspectWorkspaceRuntime,
  onInspectSessionRuntime,
  onOpenWorkspaceBatchReview,
  onOpenSessionBatchReview,
  skillForm,
  setSkillForm,
  skillTagsText,
  setSkillTagsText,
  canSaveSkill,
  skillPreview,
  skillVersions,
  onSaveSkill,
  onQuickSaveSkill,
  onRestoreSkillVersion,
  onLoadSkillToEditor,
  isWorking,
  formatNumber
}: AssetContextFormsPanelProps): JSX.Element => {
  const { t, locale } = useI18n();
  const [workspaceDangerConfirmed, setWorkspaceDangerConfirmed] = useState(false);
  const [sessionDangerConfirmed, setSessionDangerConfirmed] = useState(false);
  const [promptDangerConfirmed, setPromptDangerConfirmed] = useState(false);
  const [skillDangerConfirmed, setSkillDangerConfirmed] = useState(false);
  const [inspectedPromptVersion, setInspectedPromptVersion] = useState<number | null>(null);
  const [inspectedSkillVersion, setInspectedSkillVersion] = useState<number | null>(null);
  const [promptRestoreConfirmedVersion, setPromptRestoreConfirmedVersion] = useState<number | null>(null);
  const [skillRestoreConfirmedVersion, setSkillRestoreConfirmedVersion] = useState<number | null>(null);
  const [assetQueueFilter, setAssetQueueFilter] =
    useState<AssetQueueFilter>(readStoredAssetQueueFilter);
  const [assetQueueAppFilter, setAssetQueueAppFilter] =
    useState<AssetQueueAppFilter>(readStoredAssetQueueAppFilter);
  const [showAllAssetGovernanceEntries, setShowAllAssetGovernanceEntries] =
    useState<boolean>(readStoredAssetQueueExpanded);
  const assetGovernanceEntries = [
    ...promptTemplates.map((item) =>
      buildPromptGovernanceEntry({
        item,
        skills,
        workspaces,
        sessionRecords,
        locale
      })
    ),
    ...skills.map((item) =>
      buildSkillGovernanceEntry({
        item,
        promptTemplates,
        workspaces,
        sessionRecords,
        locale
      })
    )
  ].sort((left, right) => {
    const levelDiff = rankRiskLevel(right.level) - rankRiskLevel(left.level);
    if (levelDiff !== 0) {
      return levelDiff;
    }

    const relationDiff = right.relationCount - left.relationCount;
    if (relationDiff !== 0) {
      return relationDiff;
    }

    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }

    return left.id.localeCompare(right.id);
  });
  const filteredAssetGovernanceEntries = assetGovernanceEntries.filter((entry) => {
    if (assetQueueAppFilter === "shared" && entry.appCode !== null) {
      return false;
    }
    if (
      assetQueueAppFilter !== "all" &&
      assetQueueAppFilter !== "shared" &&
      entry.appCode !== assetQueueAppFilter
    ) {
      return false;
    }

    if (assetQueueFilter === "high") {
      return entry.level === "high";
    }
    if (assetQueueFilter === "prompt") {
      return entry.kind === "prompt";
    }
    if (assetQueueFilter === "skill") {
      return entry.kind === "skill";
    }
    if (assetQueueFilter === "shared") {
      return entry.appCode === null;
    }
    return true;
  });
  const visibleAssetGovernanceEntries = showAllAssetGovernanceEntries
    ? filteredAssetGovernanceEntries
    : filteredAssetGovernanceEntries.slice(0, 6);
  const filteredHighRiskAssetCount = filteredAssetGovernanceEntries.filter(
    (entry) => entry.level === "high"
  ).length;
  const highRiskAssetCount = assetGovernanceEntries.filter((entry) => entry.level === "high").length;
  const sharedAssetCount = assetGovernanceEntries.filter((entry) => entry.appCode === null).length;
  const promptInUseCount = assetGovernanceEntries.filter(
    (entry) => entry.kind === "prompt" && entry.relationCount > 0
  ).length;
  const skillInUseCount = assetGovernanceEntries.filter(
    (entry) => entry.kind === "skill" && entry.relationCount > 0
  ).length;
  const currentRepairScopeAppCode =
    assetQueueAppFilter === "all" || assetQueueAppFilter === "shared"
      ? undefined
      : assetQueueAppFilter;
  const canBatchRepairCurrentFilter =
    assetQueueAppFilter !== "shared" && filteredHighRiskAssetCount > 0;
  const repairCurrentFilterLabel =
    currentRepairScopeAppCode === undefined
      ? localize(locale, "整批修复高风险资产", "Repair High-Risk Assets")
      : localize(
          locale,
          `修复 ${currentRepairScopeAppCode} 高风险资产`,
          `Repair ${currentRepairScopeAppCode} High-Risk Assets`
        );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(ASSET_QUEUE_FILTER_STORAGE_KEY, assetQueueFilter);
    } catch {
      // 会话存储不可用时退化为内存态即可。
    }
  }, [assetQueueFilter]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(ASSET_QUEUE_APP_FILTER_STORAGE_KEY, assetQueueAppFilter);
    } catch {
      // 会话存储不可用时退化为内存态即可。
    }
  }, [assetQueueAppFilter]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(
        ASSET_QUEUE_EXPANDED_STORAGE_KEY,
        showAllAssetGovernanceEntries ? "true" : "false"
      );
    } catch {
      // 会话存储不可用时退化为内存态即可。
    }
  }, [showAllAssetGovernanceEntries]);
  const suggestedWorkspaceProviderId =
    providers.find((item) => item.enabled)?.id ?? providers[0]?.id ?? null;
  const suggestedWorkspacePromptTemplateId =
    promptTemplates.find(
      (item) =>
        item.enabled &&
        (item.appCode === workspaceForm.appCode || item.appCode === null)
    )?.id ??
    promptTemplates.find((item) => item.enabled)?.id ??
    promptTemplates[0]?.id ??
    null;
  const suggestedWorkspaceSkillId =
    skills.find(
      (item) =>
        item.enabled &&
        (item.appCode === workspaceForm.appCode || item.appCode === null)
    )?.id ??
    skills.find((item) => item.enabled)?.id ??
    skills[0]?.id ??
    null;
  const suggestedSessionWorkspaceId =
    workspaces.find((item) => sessionForm.cwd.startsWith(item.rootPath))?.id ??
    workspaces.find((item) => item.enabled && item.appCode === sessionForm.appCode)?.id ??
    workspaces.find((item) => item.enabled)?.id ??
    workspaces[0]?.id ??
    null;
  const suggestedSessionProviderId =
    providers.find((item) => item.enabled)?.id ?? providers[0]?.id ?? null;
  const suggestedSessionPromptTemplateId =
    promptTemplates.find(
      (item) => item.enabled && (item.appCode === sessionForm.appCode || item.appCode === null)
    )?.id ??
    promptTemplates.find((item) => item.enabled)?.id ??
    promptTemplates[0]?.id ??
    null;
  const suggestedSessionSkillId =
    skills.find(
      (item) => item.enabled && (item.appCode === sessionForm.appCode || item.appCode === null)
    )?.id ??
    skills.find((item) => item.enabled)?.id ??
    skills[0]?.id ??
    null;
  const suggestedSkillPromptTemplateId =
    promptTemplates.find(
      (item) => item.enabled && (item.appCode === skillForm.appCode || item.appCode === null)
    )?.id ??
    promptTemplates.find((item) => item.enabled)?.id ??
    promptTemplates[0]?.id ??
    null;
  const workspaceNotice =
    workspacePreview === null
      ? null
      : buildAssetNotice(
          warningIncludes(workspacePreview.warnings, "does not exist") && workspacePreview.sessionCount > 0
            ? "high"
            : workspacePreview.warnings.length > 0
              ? "medium"
              : "low",
          localize(
            locale,
            warningIncludes(workspacePreview.warnings, "does not exist") && workspacePreview.sessionCount > 0
              ? "当前工作区默认对象存在缺失，且已有会话依赖它，直接保存会把错误继续传递到运行态。"
              : workspacePreview.warnings.length > 0
                ? "当前工作区预检存在注意项，保存前应先修默认 Provider、Prompt 或 Skill。"
                : "当前工作区预检没有明显阻断项。",
            warningIncludes(workspacePreview.warnings, "does not exist") && workspacePreview.sessionCount > 0
              ? "This workspace has missing defaults while active sessions still depend on it, so saving would continue propagating errors into runtime."
              : workspacePreview.warnings.length > 0
                ? "This workspace preview has caution items. Fix the default provider, prompt, or skill before saving."
                : "No obvious blocker was found in the current workspace preview."
          ),
          [
            localize(locale, "如果已有会话引用该工作区，优先把缺失默认对象补齐。", "If sessions already reference this workspace, restore the missing defaults first."),
            localize(locale, "工作区默认项属于批量配置，保存前要确认影响范围。", "Workspace defaults behave like bulk configuration, so confirm the blast radius before saving."),
            localize(locale, "修复后回到运行时确认热点工作区是否恢复。", "Return to runtime after the fix and confirm the workspace hotspot is actually recovered.")
          ]
        );
  const sessionNotice =
    sessionPreview === null
      ? null
      : buildAssetNotice(
          sessionPreview.workspaceExists === false ||
            warningIncludes(sessionPreview.warnings, "Provider does not exist") ||
            warningIncludes(sessionPreview.warnings, "Prompt template does not exist") ||
            warningIncludes(sessionPreview.warnings, "Skill does not exist")
            ? "high"
            : sessionPreview.warnings.length > 0
              ? "medium"
              : "low",
          localize(
            locale,
            sessionPreview.workspaceExists === false
              ? "当前会话没有落到有效工作区，保存后上下文治理会继续变弱。"
              : sessionPreview.warnings.length > 0
                ? "当前会话仍引用无效对象，保存前应先清理失效 Provider、Prompt 或 Skill。"
                : "当前会话预检没有明显阻断项。",
            sessionPreview.workspaceExists === false
              ? "This session is not attached to a valid workspace, so context governance will remain weak after saving."
              : sessionPreview.warnings.length > 0
                ? "This session still references invalid objects. Clear the broken provider, prompt, or skill before saving."
                : "No obvious blocker was found in the current session preview."
          ),
          [
            localize(locale, "会话级覆盖容易掩盖上层默认配置问题。", "Session-level overrides often hide higher-level default issues."),
            localize(locale, "如果 cwd 已匹配工作区，优先重新挂回工作区。", "If the cwd already matches a workspace, reconnect the session to that workspace first."),
            localize(locale, "修复后再看最近请求是否恢复 workspace/session 上下文。", "Check recent requests again after the fix to verify workspace/session context has returned.")
          ]
        );
  const promptNotice =
    promptTemplatePreview === null
      ? null
      : buildAssetNotice(
          !promptTemplateForm.enabled && promptTemplatePreview.referencedBySkillIds.length > 0
            ? "high"
            : promptTemplatePreview.warnings.length > 0
              ? "medium"
              : "low",
          localize(
            locale,
            !promptTemplateForm.enabled && promptTemplatePreview.referencedBySkillIds.length > 0
              ? "当前 Prompt 仍被 Skill 引用，直接停用会影响下游技能链路。"
              : promptTemplatePreview.warnings.length > 0
                ? "当前 Prompt 预检存在注意项，保存前应先确认引用链。"
                : "当前 Prompt 预检没有明显阻断项。",
            !promptTemplateForm.enabled && promptTemplatePreview.referencedBySkillIds.length > 0
              ? "This prompt is still referenced by skills, so disabling it will affect downstream skill chains."
              : promptTemplatePreview.warnings.length > 0
                ? "This prompt preview has caution items. Review the reference chain before saving."
                : "No obvious blocker was found in the current prompt preview."
          ),
          [
            localize(locale, "Prompt 是共享资产，真实影响面往往大于当前表单显示。", "Prompts are shared assets, and the real blast radius is often wider than this form suggests."),
            localize(locale, "如果只是改文案，优先考虑版本化更新。", "If you only want to revise the content, prefer a versioned update."),
            localize(locale, "保存后检查 Skill 与 Session 是否仍命中正确 Prompt。", "After saving, confirm that skills and sessions still resolve to the correct prompt.")
          ]
        );
  const skillNotice =
    skillPreview === null
      ? null
      : buildAssetNotice(
          skillPreview.promptTemplateExists === false ||
            (!skillForm.enabled &&
              (skillPreview.usedByWorkspaceIds.length > 0 || skillPreview.usedBySessionIds.length > 0))
            ? "high"
            : skillPreview.warnings.length > 0
              ? "medium"
              : "low",
          localize(
            locale,
            skillPreview.promptTemplateExists === false
              ? "当前 Skill 依赖的 Prompt 不存在，保存后技能链路会保持失效。"
              : !skillForm.enabled &&
                  (skillPreview.usedByWorkspaceIds.length > 0 || skillPreview.usedBySessionIds.length > 0)
                ? "当前 Skill 仍被工作区或会话引用，直接停用会影响在途上下文。"
                : skillPreview.warnings.length > 0
                  ? "当前 Skill 预检存在注意项，保存前应先确认引用面。"
                  : "当前 Skill 预检没有明显阻断项。",
            skillPreview.promptTemplateExists === false
              ? "This skill depends on a missing prompt, so the skill chain will remain broken after saving."
              : !skillForm.enabled &&
                  (skillPreview.usedByWorkspaceIds.length > 0 || skillPreview.usedBySessionIds.length > 0)
                ? "This skill is still referenced by workspaces or sessions, so disabling it will affect active context."
                : skillPreview.warnings.length > 0
                  ? "This skill preview has caution items. Review its reference surface before saving."
                  : "No obvious blocker was found in the current skill preview."
          ),
          [
            localize(locale, "Skill 是 Prompt 与运行态之间的桥接层。", "Skills bridge prompts and runtime context."),
            localize(locale, "缺 Prompt 时优先补 Prompt 或清空引用。", "When the prompt is missing, restore it or clear the reference first."),
            localize(locale, "保存后回到工作区和会话运行态确认 Skill 解析是否正确。", "Return to workspace and session runtime after saving to confirm skill resolution remains correct.")
          ]
        );
  const workspaceRequiresDangerConfirm = workspaceNotice?.level === "high";
  const sessionRequiresDangerConfirm = sessionNotice?.level === "high";
  const promptRequiresDangerConfirm = promptNotice?.level === "high";
  const skillRequiresDangerConfirm = skillNotice?.level === "high";
  const renderRuntimeLinks = (
    ids: string[],
    kind: "workspace" | "session",
    sourceLabel: string,
    appCode: WorkspaceUpsert["appCode"] | SkillUpsert["appCode"] | PromptTemplateUpsert["appCode"]
  ): JSX.Element | null => {
    if (ids.length === 0) {
      return null;
    }

    return (
      <div className="quick-action-row">
        {ids.length > 1 ? (
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() =>
              kind === "workspace"
                ? onOpenWorkspaceBatchReview(ids, sourceLabel, appCode)
                : onOpenSessionBatchReview(ids, sourceLabel, appCode)
            }
          >
            {kind === "workspace"
              ? localize(locale, "打开工作区治理批次", "Open Workspace Batch")
              : localize(locale, "打开会话治理批次", "Open Session Batch")}
          </button>
        ) : null}
        {ids.slice(0, 3).map((id) => (
          <button
            className="inline-action"
            key={`${kind}-${id}`}
            type="button"
            disabled={isWorking}
            onClick={() =>
              kind === "workspace"
                ? onInspectWorkspaceRuntime(id)
                : onInspectSessionRuntime(id)
            }
          >
            {kind === "workspace"
              ? localize(locale, `打开工作区 ${id}`, `Open Workspace ${id}`)
              : localize(locale, `打开会话 ${id}`, `Open Session ${id}`)}
          </button>
        ))}
      </div>
    );
  };

  return (
    <>
      <article className="form-card">
        <h3>{localize(locale, "Prompt / Skill 资产治理队列", "Prompt / Skill Asset Queue")}</h3>
        <p className="form-hint">
          {localize(
            locale,
            "先在这里看共享 Prompt、Skill 与上下文引用面，再决定进入哪一个编辑器。这样比盲目改单条资产更稳。",
            "Review shared prompts, skills, and context blast radius here first, then decide which editor to open. This is safer than changing single assets blindly."
          )}
        </p>
        <div className="preview-summary-grid">
          <div className={`preview-summary-tile risk-${highRiskAssetCount > 0 ? "high" : "low"}`}>
            <strong>{highRiskAssetCount}</strong>
            <span>{localize(locale, "高风险资产", "High-Risk Assets")}</span>
          </div>
          <div className={`preview-summary-tile risk-${sharedAssetCount > 0 ? "medium" : "low"}`}>
            <strong>{sharedAssetCount}</strong>
            <span>{localize(locale, "共享资产", "Shared Assets")}</span>
          </div>
          <div className={`preview-summary-tile risk-${promptInUseCount > 0 ? "medium" : "low"}`}>
            <strong>{promptInUseCount}</strong>
            <span>{localize(locale, "生效中的 Prompt", "Prompts In Use")}</span>
          </div>
          <div className={`preview-summary-tile risk-${skillInUseCount > 0 ? "medium" : "low"}`}>
            <strong>{skillInUseCount}</strong>
            <span>{localize(locale, "生效中的 Skill", "Skills In Use")}</span>
          </div>
        </div>
        <div className="quick-action-row">
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => setAssetQueueFilter("all")}
          >
            {localize(locale, "全部", "All")}
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => setAssetQueueFilter("high")}
          >
            {localize(locale, "仅高风险", "High Risk")}
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => setAssetQueueFilter("prompt")}
          >
            Prompt
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => setAssetQueueFilter("skill")}
          >
            Skill
          </button>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={() => setAssetQueueFilter("shared")}
          >
            {localize(locale, "仅共享", "Shared")}
          </button>
        </div>
        <p className="form-hint">
          {localize(locale, "当前筛选", "Current Filter")}:{" "}
          {assetQueueFilter === "all"
            ? localize(locale, "全部资产", "All Assets")
            : assetQueueFilter === "high"
              ? localize(locale, "仅高风险资产", "High-Risk Assets")
              : assetQueueFilter === "prompt"
                ? "Prompt"
                : assetQueueFilter === "skill"
                  ? "Skill"
                  : localize(locale, "仅共享资产", "Shared Assets")}
        </p>
        <label className="form-hint">
          {localize(locale, "应用范围", "App Scope")}:{" "}
          <select
            value={assetQueueAppFilter}
            onChange={(event) =>
              setAssetQueueAppFilter(event.target.value as AssetQueueAppFilter)
            }
          >
            <option value="all">{localize(locale, "全部应用范围", "All App Scopes")}</option>
            <option value="shared">{localize(locale, "仅全局共享", "Global Shared Only")}</option>
            {APP_CODES.map((appCode) => (
              <option key={`asset-queue-app-filter-${appCode}`} value={appCode}>
                {appCode}
              </option>
            ))}
          </select>
        </label>
        <p className="form-hint">
          {localize(locale, "当前应用范围", "Current App Scope")}:{" "}
          {renderAssetQueueAppFilterLabel(assetQueueAppFilter, locale)}
        </p>
        <div className="quick-action-row">
          <button
            className="inline-action"
            type="button"
            disabled={isWorking || !canBatchRepairCurrentFilter}
            onClick={() => onRepairGovernance(currentRepairScopeAppCode)}
          >
            {repairCurrentFilterLabel}
          </button>
        </div>
        {assetQueueAppFilter === "shared" ? (
          <p className="form-hint">
            {localize(
              locale,
              "共享资产会同时影响多个应用，当前建议逐项检查后再修复。",
              "Shared assets affect multiple apps at once, so review them item by item before repairing."
            )}
          </p>
        ) : null}
        {visibleAssetGovernanceEntries.length === 0 ? (
          <p className="form-hint">
            {localize(locale, "当前筛选下没有需要优先处理的资产。", "No prioritized assets match the current filter.")}
          </p>
        ) : (
          <div className="list">
            {visibleAssetGovernanceEntries.map((entry) => {
              const linkedPrompt =
                entry.kind === "skill" && entry.linkedPromptId !== null
                  ? promptTemplates.find((item) => item.id === entry.linkedPromptId) ?? null
                  : null;
              const promptItem =
                entry.kind === "prompt"
                  ? promptTemplates.find((item) => item.id === entry.id) ?? null
                  : null;
              const skillItem =
                entry.kind === "skill"
                  ? skills.find((item) => item.id === entry.id) ?? null
                  : null;
              const suggestedQueuePrompt =
                entry.kind === "skill"
                  ? promptTemplates.find(
                      (item) =>
                        item.enabled &&
                        (item.appCode === entry.appCode || item.appCode === null) &&
                        item.id !== entry.linkedPromptId
                    ) ??
                    promptTemplates.find(
                      (item) => item.enabled && item.id !== entry.linkedPromptId
                    ) ??
                    null
                  : null;

              return (
                <div className="list-row" key={`asset-governance-${entry.kind}-${entry.id}`}>
                  <div>
                    <strong>
                      {entry.kind === "prompt" ? "Prompt" : "Skill"} / {entry.id}
                    </strong>
                    <p>{entry.name}</p>
                    <p>
                      {localize(locale, "作用域", "Scope")}:{" "}
                      {entry.appCode ?? localize(locale, "全局共享", "Global Shared")} /{" "}
                      {entry.enabled ? t("common.enabled") : t("common.disabled")}
                    </p>
                    <p>{entry.summary}</p>
                    {entry.kind === "prompt" ? (
                      <p>
                        {localize(locale, "关联 Skill", "Linked Skills")}:{" "}
                        {joinPreviewValues([...entry.referencedBySkillIds], t("common.notFound"))}
                      </p>
                    ) : null}
                    {entry.kind === "skill" ? (
                      <p>
                        {localize(locale, "关联 Prompt", "Linked Prompt")}:{" "}
                        {entry.linkedPromptMissing
                          ? localize(locale, "缺失", "Missing")
                          : entry.linkedPromptDisabled
                            ? localize(locale, `${entry.linkedPromptId ?? "Prompt"} / 已停用`, `${entry.linkedPromptId ?? "Prompt"} / Disabled`)
                            : entry.linkedPromptId ?? t("common.notFound")}
                      </p>
                    ) : null}
                    <p>
                      {localize(locale, "影响工作区", "Affected Workspaces")}:{" "}
                      {joinPreviewValues([...entry.usedByWorkspaceIds], t("common.notFound"))}
                    </p>
                    <p>
                      {localize(locale, "影响会话", "Affected Sessions")}:{" "}
                      {joinPreviewValues([...entry.usedBySessionIds], t("common.notFound"))}
                    </p>
                    {entry.usedByWorkspaceIds.length > 0
                      ? renderRuntimeLinks(
                          [...entry.usedByWorkspaceIds],
                          "workspace",
                          entry.kind === "prompt"
                            ? localize(locale, `Prompt ${entry.id}`, `Prompt ${entry.id}`)
                            : localize(locale, `Skill ${entry.id}`, `Skill ${entry.id}`),
                          entry.appCode
                        )
                      : null}
                    {entry.usedBySessionIds.length > 0
                      ? renderRuntimeLinks(
                          [...entry.usedBySessionIds],
                          "session",
                          entry.kind === "prompt"
                            ? localize(locale, `Prompt ${entry.id}`, `Prompt ${entry.id}`)
                            : localize(locale, `Skill ${entry.id}`, `Skill ${entry.id}`),
                          entry.appCode
                        )
                      : null}
                  </div>
                  <div className="row-meta stack-actions">
                    <span>{entry.level}</span>
                    {entry.kind === "prompt" && promptItem ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onLoadPromptTemplateToEditor(promptItem)}
                      >
                        {localize(locale, "载入 Prompt 编辑器", "Load Prompt Editor")}
                      </button>
                    ) : null}
                    {entry.kind === "skill" && skillItem ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onLoadSkillToEditor(skillItem)}
                      >
                        {localize(locale, "载入 Skill 编辑器", "Load Skill Editor")}
                      </button>
                    ) : null}
                    {entry.kind === "skill" && linkedPrompt ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onLoadPromptTemplateToEditor(linkedPrompt)}
                      >
                        {localize(locale, "打开关联 Prompt", "Open Linked Prompt")}
                      </button>
                    ) : null}
                    {entry.kind === "prompt" && promptItem && !promptItem.enabled ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() =>
                          onQuickSavePromptTemplate({
                            ...toPromptTemplateUpsert(promptItem),
                            enabled: true
                          })
                        }
                      >
                        {localize(locale, "一键重新启用 Prompt", "Re-enable Prompt")}
                      </button>
                    ) : null}
                    {entry.kind === "skill" && skillItem && !skillItem.enabled ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() =>
                          onQuickSaveSkill({
                            ...toSkillUpsert(skillItem),
                            enabled: true
                          })
                        }
                      >
                        {localize(locale, "一键重新启用 Skill", "Re-enable Skill")}
                      </button>
                    ) : null}
                    {entry.kind === "skill" && linkedPrompt && !linkedPrompt.enabled ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() =>
                          onQuickSavePromptTemplate({
                            ...toPromptTemplateUpsert(linkedPrompt),
                            enabled: true
                          })
                        }
                      >
                        {localize(locale, "重新启用关联 Prompt", "Re-enable Linked Prompt")}
                      </button>
                    ) : null}
                    {entry.kind === "skill" &&
                    skillItem &&
                    suggestedQueuePrompt &&
                    (entry.linkedPromptMissing || entry.linkedPromptDisabled) ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() =>
                          onQuickSaveSkill({
                            ...toSkillUpsert(skillItem),
                            promptTemplateId: suggestedQueuePrompt.id
                          })
                        }
                      >
                        {localize(locale, "挂回建议 Prompt", "Attach Suggested Prompt")}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {filteredAssetGovernanceEntries.length > 6 ? (
              <div className="list-row">
                <div>
                  <strong>
                    {showAllAssetGovernanceEntries
                      ? localize(locale, "已展开全部资产治理项", "All Asset Entries Expanded")
                      : localize(
                          locale,
                          `还有 ${filteredAssetGovernanceEntries.length - 6} 个资产治理项未展开`,
                          `${filteredAssetGovernanceEntries.length - 6} More Asset Entry(s)`
                        )}
                  </strong>
                  <p>
                    {showAllAssetGovernanceEntries
                      ? localize(locale, "当前已展示完整资产治理队列，可逐项进入对应编辑器。", "The full asset queue is visible and can be opened item by item.")
                      : localize(locale, "当前只展示优先级最高的前六项。展开后可查看完整资产队列。", "Only the top six highest-priority items are shown right now. Expand to review the full asset queue.")}
                  </p>
                </div>
                <div className="row-meta stack-actions">
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => setShowAllAssetGovernanceEntries((current) => !current)}
                  >
                    {showAllAssetGovernanceEntries
                      ? localize(locale, "收起资产队列", "Collapse Asset Queue")
                      : localize(locale, "展开全部资产项", "Expand Asset Queue")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </article>

      <form
        className="form-card"
        data-testid="workspace-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveWorkspace();
        }}
      >
        <h3>{t("dashboard.forms.workspaceTitle")}</h3>
        <input
          data-testid="workspace-id-input"
          value={workspaceForm.id}
          onChange={(event) => setWorkspaceForm({ ...workspaceForm, id: event.target.value })}
          placeholder={t("dashboard.forms.id")}
        />
        <input
          data-testid="workspace-name-input"
          value={workspaceForm.name}
          onChange={(event) => setWorkspaceForm({ ...workspaceForm, name: event.target.value })}
          placeholder={t("dashboard.forms.name")}
        />
        <input
          data-testid="workspace-root-input"
          value={workspaceForm.rootPath}
          onChange={(event) => setWorkspaceForm({ ...workspaceForm, rootPath: event.target.value })}
          placeholder={t("dashboard.forms.rootPath")}
        />
        <select
          data-testid="workspace-app-select"
          value={workspaceForm.appCode ?? ""}
          onChange={(event) =>
            setWorkspaceForm({
              ...workspaceForm,
              appCode:
                event.target.value.length === 0
                  ? null
                  : (event.target.value as WorkspaceUpsert["appCode"])
            })
          }
        >
          <option value="">{t("dashboard.assets.globalScope")}</option>
          {APP_CODES.map((appCode) => (
            <option key={appCode} value={appCode}>
              {appCode}
            </option>
          ))}
        </select>
        <select
          data-testid="workspace-provider-select"
          value={workspaceForm.defaultProviderId ?? ""}
          onChange={(event) =>
            setWorkspaceForm({
              ...workspaceForm,
              defaultProviderId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.workspace.defaultProvider")}</option>
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <select
          data-testid="workspace-prompt-select"
          value={workspaceForm.defaultPromptTemplateId ?? ""}
          onChange={(event) =>
            setWorkspaceForm({
              ...workspaceForm,
              defaultPromptTemplateId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.workspace.defaultPrompt")}</option>
          {promptTemplates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <select
          data-testid="workspace-skill-select"
          value={workspaceForm.defaultSkillId ?? ""}
          onChange={(event) =>
            setWorkspaceForm({
              ...workspaceForm,
              defaultSkillId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.workspace.defaultSkill")}</option>
          {skills.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <input
          data-testid="workspace-tags-input"
          value={workspaceTagsText}
          onChange={(event) => setWorkspaceTagsText(event.target.value)}
          placeholder={t("dashboard.forms.tags")}
        />
        <label className="checkbox-row">
          <input
            data-testid="workspace-enabled-checkbox"
            checked={workspaceForm.enabled}
            onChange={(event) => setWorkspaceForm({ ...workspaceForm, enabled: event.target.checked })}
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button
          className="auth-button"
          type="submit"
          data-testid="workspace-save-button"
          disabled={isWorking || !canSaveWorkspace || (workspaceRequiresDangerConfirm && !workspaceDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        {!canSaveWorkspace ? <p className="form-hint">{t("dashboard.forms.previewRequired")}</p> : null}
        {workspacePreview ? (
          <div className="preview-item" data-testid="workspace-preview">
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <p>{t("dashboard.impact.linkedSessionCount")}: {formatNumber(workspacePreview.sessionCount)}</p>
            <p>
              {t("dashboard.impact.warnings")}:{" "}
              {joinDashboardWarnings(workspacePreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            <div className="quick-action-row">
              {warningIncludes(workspacePreview.warnings, "Default provider does not exist") &&
              suggestedWorkspaceProviderId ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setWorkspaceForm({
                      ...workspaceForm,
                      defaultProviderId: suggestedWorkspaceProviderId
                    })
                  }
                >
                  {localize(locale, "改用建议 Provider", "Use Suggested Provider")}
                </button>
              ) : null}
              {warningIncludes(workspacePreview.warnings, "Default prompt template does not exist") &&
              suggestedWorkspacePromptTemplateId ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setWorkspaceForm({
                      ...workspaceForm,
                      defaultPromptTemplateId: suggestedWorkspacePromptTemplateId
                    })
                  }
                >
                  {localize(locale, "改用建议 Prompt", "Use Suggested Prompt")}
                </button>
              ) : null}
              {warningIncludes(workspacePreview.warnings, "Default skill does not exist") &&
              suggestedWorkspaceSkillId ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setWorkspaceForm({
                      ...workspaceForm,
                      defaultSkillId: suggestedWorkspaceSkillId
                    })
                  }
                >
                  {localize(locale, "改用建议 Skill", "Use Suggested Skill")}
                </button>
              ) : null}
              {!workspaceForm.enabled && workspacePreview.sessionCount > 0 ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setWorkspaceForm({ ...workspaceForm, enabled: true })}
                >
                  {localize(locale, "重新启用工作区", "Re-enable Workspace")}
                </button>
              ) : null}
            </div>
            {workspaceNotice ? <GovernanceNoticeCard notice={workspaceNotice} locale={locale} /> : null}
            {workspaceRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  data-testid="workspace-danger-confirm"
                  checked={workspaceDangerConfirmed}
                  onChange={(event) => setWorkspaceDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认这个工作区预检仍有高风险，保存后可能继续影响已关联会话。",
                  "I understand this workspace preview is still high-risk and saving may continue affecting linked sessions."
                )}
              </label>
            ) : null}
            <ConfigImpactSummary impact={workspacePreview.impact} t={t} />
          </div>
        ) : null}
      </form>

      <form
        className="form-card"
        data-testid="session-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveSession();
        }}
      >
        <h3>{t("dashboard.forms.sessionTitle")}</h3>
        <input
          data-testid="session-id-input"
          value={sessionForm.id}
          onChange={(event) => setSessionForm({ ...sessionForm, id: event.target.value })}
          placeholder={t("dashboard.forms.id")}
        />
        <input
          data-testid="session-title-input"
          value={sessionForm.title}
          onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })}
          placeholder={t("dashboard.workspace.sessionTitle")}
        />
        <input
          data-testid="session-cwd-input"
          value={sessionForm.cwd}
          onChange={(event) => setSessionForm({ ...sessionForm, cwd: event.target.value })}
          placeholder={t("dashboard.forms.cwd")}
        />
        <select
          data-testid="session-workspace-select"
          value={sessionForm.workspaceId ?? ""}
          onChange={(event) =>
            setSessionForm({
              ...sessionForm,
              workspaceId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.workspace.linkedWorkspace")}</option>
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <select
          data-testid="session-app-select"
          value={sessionForm.appCode}
          onChange={(event) =>
            setSessionForm({
              ...sessionForm,
              appCode: event.target.value as SessionRecordUpsert["appCode"]
            })
          }
        >
          {APP_CODES.map((appCode) => (
            <option key={appCode} value={appCode}>
              {appCode}
            </option>
          ))}
        </select>
        <select
          data-testid="session-provider-select"
          value={sessionForm.providerId ?? ""}
          onChange={(event) =>
            setSessionForm({
              ...sessionForm,
              providerId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.workspace.defaultProvider")}</option>
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <select
          data-testid="session-prompt-select"
          value={sessionForm.promptTemplateId ?? ""}
          onChange={(event) =>
            setSessionForm({
              ...sessionForm,
              promptTemplateId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.workspace.defaultPrompt")}</option>
          {promptTemplates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <select
          data-testid="session-skill-select"
          value={sessionForm.skillId ?? ""}
          onChange={(event) =>
            setSessionForm({
              ...sessionForm,
              skillId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.workspace.defaultSkill")}</option>
          {skills.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <select
          data-testid="session-status-select"
          value={sessionForm.status}
          onChange={(event) =>
            setSessionForm({
              ...sessionForm,
              status: event.target.value as SessionRecordUpsert["status"]
            })
          }
        >
          <option value="active">{t("dashboard.workspace.sessionActive")}</option>
          <option value="archived">{t("dashboard.workspace.sessionArchived")}</option>
        </select>
        <button
          className="auth-button"
          type="submit"
          data-testid="session-save-button"
          disabled={isWorking || !canSaveSession || (sessionRequiresDangerConfirm && !sessionDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        {!canSaveSession ? <p className="form-hint">{t("dashboard.forms.previewRequired")}</p> : null}
        {sessionPreview ? (
          <div className="preview-item" data-testid="session-preview">
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <p>
              {t("dashboard.impact.targetWorkspaceExists")}:{" "}
              {sessionPreview.workspaceExists ? t("common.enabled") : t("common.disabled")}
            </p>
            <p>
              {t("dashboard.impact.warnings")}:{" "}
              {joinDashboardWarnings(sessionPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            <div className="quick-action-row">
              {warningIncludes(sessionPreview.warnings, "Workspace does not exist") &&
              suggestedSessionWorkspaceId ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setSessionForm({
                      ...sessionForm,
                      workspaceId: suggestedSessionWorkspaceId
                    })
                  }
                >
                  {localize(locale, "挂到建议工作区", "Attach Suggested Workspace")}
                </button>
              ) : null}
              {warningIncludes(sessionPreview.warnings, "Provider does not exist") ? (
                <>
                  {suggestedSessionProviderId ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() =>
                        setSessionForm({
                          ...sessionForm,
                          providerId: suggestedSessionProviderId
                        })
                      }
                    >
                      {localize(locale, "改用建议 Provider", "Use Suggested Provider")}
                    </button>
                  ) : null}
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => setSessionForm({ ...sessionForm, providerId: null })}
                  >
                    {localize(locale, "清空失效 Provider", "Clear Missing Provider")}
                  </button>
                </>
              ) : null}
              {warningIncludes(sessionPreview.warnings, "Prompt template does not exist") ? (
                <>
                  {suggestedSessionPromptTemplateId ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() =>
                        setSessionForm({
                          ...sessionForm,
                          promptTemplateId: suggestedSessionPromptTemplateId
                        })
                      }
                    >
                      {localize(locale, "改用建议 Prompt", "Use Suggested Prompt")}
                    </button>
                  ) : null}
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => setSessionForm({ ...sessionForm, promptTemplateId: null })}
                  >
                    {localize(locale, "清空失效 Prompt", "Clear Missing Prompt")}
                  </button>
                </>
              ) : null}
              {warningIncludes(sessionPreview.warnings, "Skill does not exist") ? (
                <>
                  {suggestedSessionSkillId ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() =>
                        setSessionForm({
                          ...sessionForm,
                          skillId: suggestedSessionSkillId
                        })
                      }
                    >
                      {localize(locale, "改用建议 Skill", "Use Suggested Skill")}
                    </button>
                  ) : null}
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => setSessionForm({ ...sessionForm, skillId: null })}
                  >
                    {localize(locale, "清空失效 Skill", "Clear Missing Skill")}
                  </button>
                </>
              ) : null}
            </div>
            {sessionNotice ? <GovernanceNoticeCard notice={sessionNotice} locale={locale} /> : null}
            {sessionRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  data-testid="session-danger-confirm"
                  checked={sessionDangerConfirmed}
                  onChange={(event) => setSessionDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认这个会话仍引用无效上下文对象，保存后可能继续产生弱上下文流量。",
                  "I understand this session still references invalid context objects and saving may continue to produce weak-context traffic."
                )}
              </label>
            ) : null}
            <ConfigImpactSummary impact={sessionPreview.impact} t={t} />
          </div>
        ) : null}
      </form>

      <form
        className="form-card"
        data-testid="prompt-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSavePromptTemplate();
        }}
      >
        <h3>{t("dashboard.forms.promptTemplateTitle")}</h3>
        <input
          data-testid="prompt-id-input"
          value={promptTemplateForm.id}
          onChange={(event) =>
            setPromptTemplateForm({ ...promptTemplateForm, id: event.target.value })
          }
          placeholder={t("dashboard.forms.id")}
        />
        <input
          data-testid="prompt-name-input"
          value={promptTemplateForm.name}
          onChange={(event) =>
            setPromptTemplateForm({ ...promptTemplateForm, name: event.target.value })
          }
          placeholder={t("dashboard.forms.name")}
        />
        <select
          data-testid="prompt-app-select"
          value={promptTemplateForm.appCode ?? ""}
          onChange={(event) =>
            setPromptTemplateForm({
              ...promptTemplateForm,
              appCode:
                event.target.value.length === 0
                  ? null
                  : (event.target.value as PromptTemplateUpsert["appCode"])
            })
          }
        >
          <option value="">{t("dashboard.assets.globalScope")}</option>
          {APP_CODES.map((appCode) => (
            <option key={appCode} value={appCode}>
              {appCode}
            </option>
          ))}
        </select>
        <select
          data-testid="prompt-locale-select"
          value={promptTemplateForm.locale}
          onChange={(event) =>
            setPromptTemplateForm({
              ...promptTemplateForm,
              locale: event.target.value as PromptTemplateUpsert["locale"]
            })
          }
        >
          <option value="zh-CN">zh-CN</option>
          <option value="en-US">en-US</option>
        </select>
        <input
          data-testid="prompt-tags-input"
          value={promptTagsText}
          onChange={(event) => setPromptTagsText(event.target.value)}
          placeholder={t("dashboard.forms.tags")}
        />
        <textarea
          className="json-editor compact"
          data-testid="prompt-content-input"
          value={promptTemplateForm.content}
          onChange={(event) =>
            setPromptTemplateForm({ ...promptTemplateForm, content: event.target.value })
          }
          placeholder={t("dashboard.forms.promptContent")}
        />
        <label className="checkbox-row">
          <input
            data-testid="prompt-enabled-checkbox"
            checked={promptTemplateForm.enabled}
            onChange={(event) =>
              setPromptTemplateForm({ ...promptTemplateForm, enabled: event.target.checked })
            }
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button
          className="auth-button"
          type="submit"
          data-testid="prompt-save-button"
          disabled={isWorking || !canSavePromptTemplate || (promptRequiresDangerConfirm && !promptDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        {!canSavePromptTemplate ? (
          <p className="form-hint">{t("dashboard.forms.previewRequired")}</p>
        ) : null}
        {promptTemplatePreview ? (
          <div className="preview-item" data-testid="prompt-preview">
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <p>
              {t("dashboard.impact.linkedSkills")}:{" "}
              {joinPreviewValues(promptTemplatePreview.referencedBySkillIds, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.impact.linkedWorkspaces")}:{" "}
              {joinPreviewValues(promptTemplatePreview.usedByWorkspaceIds, t("common.notFound"))}
            </p>
            {renderRuntimeLinks(
              promptTemplatePreview.usedByWorkspaceIds,
              "workspace",
              localize(locale, `Prompt ${promptTemplateForm.id}`, `Prompt ${promptTemplateForm.id}`),
              promptTemplateForm.appCode
            )}
            <p>
              {t("dashboard.impact.linkedSessions")}:{" "}
              {joinPreviewValues(promptTemplatePreview.usedBySessionIds, t("common.notFound"))}
            </p>
            {renderRuntimeLinks(
              promptTemplatePreview.usedBySessionIds,
              "session",
              localize(locale, `Prompt ${promptTemplateForm.id}`, `Prompt ${promptTemplateForm.id}`),
              promptTemplateForm.appCode
            )}
            <p>
              {t("dashboard.impact.warnings")}:{" "}
              {joinDashboardWarnings(promptTemplatePreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            <div className="quick-action-row">
              {!promptTemplateForm.enabled && promptTemplatePreview.referencedBySkillIds.length > 0 ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setPromptTemplateForm({
                      ...promptTemplateForm,
                      enabled: true
                    })
                  }
                >
                  {localize(locale, "重新启用 Prompt", "Re-enable Prompt")}
                </button>
              ) : null}
              {!promptTemplateForm.enabled &&
              (promptTemplatePreview.usedByWorkspaceIds.length > 0 ||
                promptTemplatePreview.usedBySessionIds.length > 0) ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setPromptTemplateForm({
                      ...promptTemplateForm,
                      enabled: true
                    })
                  }
                >
                  {localize(locale, "保持 Prompt 可继承", "Keep Prompt Inheritable")}
                </button>
              ) : null}
            </div>
            {promptNotice ? <GovernanceNoticeCard notice={promptNotice} locale={locale} /> : null}
            {promptRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  data-testid="prompt-danger-confirm"
                  checked={promptDangerConfirmed}
                  onChange={(event) => setPromptDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认这个 Prompt 仍被下游引用，当前保存会影响共享引用链。",
                  "I understand this prompt is still referenced downstream and saving now will affect a shared dependency chain."
                )}
              </label>
            ) : null}
            <ConfigImpactSummary impact={promptTemplatePreview.impact} t={t} />
          </div>
        ) : null}
        <div className="preview-item">
          <strong>{t("dashboard.assets.versionHistory")}</strong>
          {promptTemplateVersions.length === 0 ? (
            <p>{t("dashboard.assets.noVersionHistory")}</p>
          ) : (
            promptTemplateVersions.map((version) => {
              const current = promptTemplates.find((item) => item.id === promptTemplateForm.id) ?? null;
              const diffs = buildPromptVersionDiff(current, version);
              const fieldDiffs = buildPromptVersionFieldDiffs(current, version, locale, t);
              const isInspecting = inspectedPromptVersion === version.versionNumber;
              const isRestoreConfirmed = promptRestoreConfirmedVersion === version.versionNumber;
              return (
                <div className="preview-diff-row" key={`prompt-version-${version.versionNumber}`}>
                  <strong>
                    v{version.versionNumber} / {t("dashboard.assets.versionCreatedAt")}: {version.createdAt}
                  </strong>
                  <p>
                    {t("dashboard.assets.versionDiff")}:{" "}
                    {diffs.length > 0 ? diffs.join(", ") : t("dashboard.assets.versionCurrent")}
                  </p>
                  {fieldDiffs.length > 0 ? (
                    <div className="version-change-list">
                      {fieldDiffs.map((diff) => (
                        <div
                          className={`version-change-card version-change-card-${diff.riskLevel}`}
                          key={`${version.versionNumber}-${diff.key}`}
                        >
                          <strong>{diff.label}</strong>
                          <p>
                            {t("dashboard.assets.versionCurrent")}: <code>{diff.currentValue}</code>
                          </p>
                          <p>
                            {localize(locale, "恢复后", "After Restore")}: <code>{diff.targetValue}</code>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="quick-action-row">
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => {
                        setInspectedPromptVersion(
                          isInspecting ? null : version.versionNumber
                        );
                        setPromptRestoreConfirmedVersion(null);
                      }}
                    >
                      {isInspecting
                        ? t("dashboard.assets.versionCollapse")
                        : t("dashboard.assets.versionInspect")}
                    </button>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking || !isInspecting || !isRestoreConfirmed}
                      onClick={() =>
                        onRestorePromptTemplateVersion(version.promptTemplateId, version.versionNumber)
                      }
                    >
                      {t("dashboard.assets.versionRestore")}
                    </button>
                  </div>
                  {isInspecting ? (
                    <div className="version-restore-confirm">
                      <p className="form-hint">
                        {fieldDiffs.some((item) => item.riskLevel === "medium")
                          ? t("dashboard.assets.versionRestoreRiskHigh")
                          : t("dashboard.assets.versionRestoreRiskLow")}
                      </p>
                      <label className="checkbox-row danger-confirm-row">
                        <input
                          checked={isRestoreConfirmed}
                          onChange={(event) =>
                            setPromptRestoreConfirmedVersion(
                              event.target.checked ? version.versionNumber : null
                            )
                          }
                          type="checkbox"
                        />{" "}
                        {t("dashboard.assets.versionRestoreConfirm")}
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </form>

      <form
        className="form-card"
        data-testid="skill-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveSkill();
        }}
      >
        <h3>{t("dashboard.forms.skillTitle")}</h3>
        <input
          data-testid="skill-id-input"
          value={skillForm.id}
          onChange={(event) => setSkillForm({ ...skillForm, id: event.target.value })}
          placeholder={t("dashboard.forms.id")}
        />
        <input
          data-testid="skill-name-input"
          value={skillForm.name}
          onChange={(event) => setSkillForm({ ...skillForm, name: event.target.value })}
          placeholder={t("dashboard.forms.name")}
        />
        <select
          data-testid="skill-app-select"
          value={skillForm.appCode ?? ""}
          onChange={(event) =>
            setSkillForm({
              ...skillForm,
              appCode:
                event.target.value.length === 0
                  ? null
                  : (event.target.value as SkillUpsert["appCode"])
            })
          }
        >
          <option value="">{t("dashboard.assets.globalScope")}</option>
          {APP_CODES.map((appCode) => (
            <option key={appCode} value={appCode}>
              {appCode}
            </option>
          ))}
        </select>
        <select
          data-testid="skill-prompt-select"
          value={skillForm.promptTemplateId ?? ""}
          onChange={(event) =>
            setSkillForm({
              ...skillForm,
              promptTemplateId: event.target.value.length === 0 ? null : event.target.value
            })
          }
        >
          <option value="">{t("dashboard.assets.linkedPrompt")}</option>
          {promptTemplates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <input
          data-testid="skill-tags-input"
          value={skillTagsText}
          onChange={(event) => setSkillTagsText(event.target.value)}
          placeholder={t("dashboard.forms.tags")}
        />
        <textarea
          className="json-editor compact"
          data-testid="skill-content-input"
          value={skillForm.content}
          onChange={(event) => setSkillForm({ ...skillForm, content: event.target.value })}
          placeholder={t("dashboard.forms.skillContent")}
        />
        <label className="checkbox-row">
          <input
            data-testid="skill-enabled-checkbox"
            checked={skillForm.enabled}
            onChange={(event) => setSkillForm({ ...skillForm, enabled: event.target.checked })}
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button
          className="auth-button"
          type="submit"
          data-testid="skill-save-button"
          disabled={isWorking || !canSaveSkill || (skillRequiresDangerConfirm && !skillDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        {!canSaveSkill ? <p className="form-hint">{t("dashboard.forms.previewRequired")}</p> : null}
        {skillPreview ? (
          <div className="preview-item" data-testid="skill-preview">
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <p>
              {t("dashboard.impact.linkedPromptExists")}:{" "}
              {skillPreview.promptTemplateExists ? t("common.enabled") : t("common.disabled")}
            </p>
            <p>
              {t("dashboard.impact.linkedWorkspaces")}:{" "}
              {joinPreviewValues(skillPreview.usedByWorkspaceIds, t("common.notFound"))}
            </p>
            {renderRuntimeLinks(
              skillPreview.usedByWorkspaceIds,
              "workspace",
              localize(locale, `Skill ${skillForm.id}`, `Skill ${skillForm.id}`),
              skillForm.appCode
            )}
            <p>
              {t("dashboard.impact.linkedSessions")}:{" "}
              {joinPreviewValues(skillPreview.usedBySessionIds, t("common.notFound"))}
            </p>
            {renderRuntimeLinks(
              skillPreview.usedBySessionIds,
              "session",
              localize(locale, `Skill ${skillForm.id}`, `Skill ${skillForm.id}`),
              skillForm.appCode
            )}
            <p>
              {t("dashboard.impact.warnings")}:{" "}
              {joinDashboardWarnings(skillPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            <div className="quick-action-row">
              {!skillPreview.promptTemplateExists && suggestedSkillPromptTemplateId ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setSkillForm({
                      ...skillForm,
                      promptTemplateId: suggestedSkillPromptTemplateId
                    })
                  }
                >
                  {localize(locale, "改用建议 Prompt", "Use Suggested Prompt")}
                </button>
              ) : null}
              {!skillPreview.promptTemplateExists ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setSkillForm({ ...skillForm, promptTemplateId: null })}
                >
                  {localize(locale, "先取消关联 Prompt", "Clear Missing Prompt")}
                </button>
              ) : null}
              {!skillForm.enabled &&
              (skillPreview.usedByWorkspaceIds.length > 0 || skillPreview.usedBySessionIds.length > 0) ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setSkillForm({
                      ...skillForm,
                      enabled: true
                    })
                  }
                >
                  {localize(locale, "重新启用 Skill", "Re-enable Skill")}
                </button>
              ) : null}
            </div>
            {skillNotice ? <GovernanceNoticeCard notice={skillNotice} locale={locale} /> : null}
            {skillRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  data-testid="skill-danger-confirm"
                  checked={skillDangerConfirmed}
                  onChange={(event) => setSkillDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认这个 Skill 仍存在高风险依赖缺口，保存后可能影响工作区和会话解析。",
                  "I understand this skill still has high-risk dependency gaps and saving may affect workspace and session resolution."
                )}
              </label>
            ) : null}
            <ConfigImpactSummary impact={skillPreview.impact} t={t} />
          </div>
        ) : null}
        <div className="preview-item">
          <strong>{t("dashboard.assets.versionHistory")}</strong>
          {skillVersions.length === 0 ? (
            <p>{t("dashboard.assets.noVersionHistory")}</p>
          ) : (
            skillVersions.map((version) => {
              const current = skills.find((item) => item.id === skillForm.id) ?? null;
              const diffs = buildSkillVersionDiff(current, version);
              const fieldDiffs = buildSkillVersionFieldDiffs(current, version, locale, t);
              const isInspecting = inspectedSkillVersion === version.versionNumber;
              const isRestoreConfirmed = skillRestoreConfirmedVersion === version.versionNumber;
              return (
                <div className="preview-diff-row" key={`skill-version-${version.versionNumber}`}>
                  <strong>
                    v{version.versionNumber} / {t("dashboard.assets.versionCreatedAt")}: {version.createdAt}
                  </strong>
                  <p>
                    {t("dashboard.assets.versionDiff")}:{" "}
                    {diffs.length > 0 ? diffs.join(", ") : t("dashboard.assets.versionCurrent")}
                  </p>
                  {fieldDiffs.length > 0 ? (
                    <div className="version-change-list">
                      {fieldDiffs.map((diff) => (
                        <div
                          className={`version-change-card version-change-card-${diff.riskLevel}`}
                          key={`${version.versionNumber}-${diff.key}`}
                        >
                          <strong>{diff.label}</strong>
                          <p>
                            {t("dashboard.assets.versionCurrent")}: <code>{diff.currentValue}</code>
                          </p>
                          <p>
                            {localize(locale, "恢复后", "After Restore")}: <code>{diff.targetValue}</code>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="quick-action-row">
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => {
                        setInspectedSkillVersion(isInspecting ? null : version.versionNumber);
                        setSkillRestoreConfirmedVersion(null);
                      }}
                    >
                      {isInspecting
                        ? t("dashboard.assets.versionCollapse")
                        : t("dashboard.assets.versionInspect")}
                    </button>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking || !isInspecting || !isRestoreConfirmed}
                      onClick={() => onRestoreSkillVersion(version.skillId, version.versionNumber)}
                    >
                      {t("dashboard.assets.versionRestore")}
                    </button>
                  </div>
                  {isInspecting ? (
                    <div className="version-restore-confirm">
                      <p className="form-hint">
                        {fieldDiffs.some((item) => item.riskLevel === "medium")
                          ? t("dashboard.assets.versionRestoreRiskHigh")
                          : t("dashboard.assets.versionRestoreRiskLow")}
                      </p>
                      <label className="checkbox-row danger-confirm-row">
                        <input
                          checked={isRestoreConfirmed}
                          onChange={(event) =>
                            setSkillRestoreConfirmedVersion(
                              event.target.checked ? version.versionNumber : null
                            )
                          }
                          type="checkbox"
                        />{" "}
                        {t("dashboard.assets.versionRestoreConfirm")}
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </form>
    </>
  );
};
