import type {
  AppBinding,
  AppBindingUpsert,
  AppQuotaUpsert,
  FailoverChainUpsert,
  PromptTemplateVersion,
  PromptTemplateUpsert,
  ProviderUpsert,
  SessionRecordUpsert,
  SkillUpsert,
  SkillVersion,
  WorkspaceUpsert
} from "cc-switch-web-shared";
import type { Dispatch, SetStateAction } from "react";

import {
  activateSession,
  activateWorkspace,
  archiveStaleSessionRecords,
  ensureSessionRecord,
  importWorkspaceDiscoveryItem,
  importWorkspaceDiscoveryItems,
  loadPromptTemplateVersions,
  loadSkillVersions
} from "../api/load-dashboard-snapshot.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildProjectIntakePlan } from "../lib/buildProjectIntakePlan.js";
import {
  buildArchiveStaleSessionsFollowUpNotice,
  buildDeleteCompletedFollowUpNotice,
  buildProjectIntakeConvergedFollowUpNotice,
  buildProjectIntakeStableFollowUpNotice,
  buildSessionDiscoveryFollowUpNotice,
  type DashboardFollowUpAction
} from "../lib/dashboardFollowUp.js";
import {
  createDefaultAppQuotaForm,
  createDefaultBindingForm,
  createDefaultFailoverForm,
  createDefaultPromptTemplateForm,
  createDefaultProviderForm,
  createDefaultSessionForm,
  createDefaultSkillForm,
  createDefaultWorkspaceForm,
  type ConfigDeleteTargetKind,
  formatTagsText,
  resolveDeleteEditorResetPlan
} from "../lib/editorConsistency.js";

import {
  type DashboardActionLocale,
  type DashboardActionOpenAuditFocus,
  type DashboardActionRunAction,
  type DashboardActionSetFollowUpNotice,
  localizeDashboardAction
} from "./dashboardActionTypes.js";

type CommonTranslationKey =
  | "dashboard.workspace.activationCleared"
  | "dashboard.workspace.archiveSuccess"
  | "dashboard.forms.deleteSuccess";

type CreateDashboardOrchestrationActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: CommonTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly executeDelete: (kind: ConfigDeleteTargetKind, id: string) => Promise<void>;
  readonly openAuditFocus: DashboardActionOpenAuditFocus;
  readonly loadDeleteReview: (kind: ConfigDeleteTargetKind, id: string) => void;
  readonly dashboardSnapshot: DashboardSnapshot | null;
  readonly editingMcpServerId: string | null;
  readonly editingMcpBindingId: string | null;
  readonly providerForm: ProviderUpsert;
  readonly bindingForm: AppBindingUpsert;
  readonly appQuotaForm: AppQuotaUpsert;
  readonly failoverForm: FailoverChainUpsert;
  readonly promptTemplateForm: PromptTemplateUpsert;
  readonly skillForm: SkillUpsert;
  readonly workspaceForm: WorkspaceUpsert;
  readonly sessionForm: SessionRecordUpsert;
  readonly setPendingDeleteReview: (value: null) => void;
  readonly setBindingForm: Dispatch<SetStateAction<AppBindingUpsert>>;
  readonly setAppQuotaForm: Dispatch<SetStateAction<AppQuotaUpsert>>;
  readonly setFailoverForm: Dispatch<SetStateAction<FailoverChainUpsert>>;
  readonly setWorkspaceForm: Dispatch<SetStateAction<WorkspaceUpsert>>;
  readonly setWorkspaceTagsText: Dispatch<SetStateAction<string>>;
  readonly setSessionForm: Dispatch<SetStateAction<SessionRecordUpsert>>;
  readonly setProviderForm: Dispatch<SetStateAction<ProviderUpsert>>;
  readonly setPromptTemplateForm: Dispatch<SetStateAction<PromptTemplateUpsert>>;
  readonly setPromptTagsText: Dispatch<SetStateAction<string>>;
  readonly setPromptTemplateVersions: Dispatch<SetStateAction<PromptTemplateVersion[]>>;
  readonly setSkillForm: Dispatch<SetStateAction<SkillUpsert>>;
  readonly setSkillTagsText: Dispatch<SetStateAction<string>>;
  readonly setSkillVersions: Dispatch<SetStateAction<SkillVersion[]>>;
  readonly resetMcpServerEditor: () => void;
  readonly resetMcpBindingEditor: () => void;
};

type DiscoveryItem = {
  readonly rootPath: string;
  readonly name: string;
  readonly appCodeSuggestion: AppBinding["appCode"] | null;
};

export const createDashboardOrchestrationActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  executeDelete,
  openAuditFocus,
  loadDeleteReview,
  dashboardSnapshot,
  editingMcpServerId,
  editingMcpBindingId,
  providerForm,
  bindingForm,
  appQuotaForm,
  failoverForm,
  promptTemplateForm,
  skillForm,
  workspaceForm,
  sessionForm,
  setPendingDeleteReview,
  setBindingForm,
  setAppQuotaForm,
  setFailoverForm,
  setWorkspaceForm,
  setWorkspaceTagsText,
  setSessionForm,
  setProviderForm,
  setPromptTemplateForm,
  setPromptTagsText,
  setPromptTemplateVersions,
  setSkillForm,
  setSkillTagsText,
  setSkillVersions,
  resetMcpServerEditor,
  resetMcpBindingEditor
}: CreateDashboardOrchestrationActionsParams) => {
  const refreshPromptTemplateVersionsFor = async (promptTemplateId: string): Promise<void> => {
    try {
      setPromptTemplateVersions(await loadPromptTemplateVersions(promptTemplateId));
    } catch {
      // 保留当前版本列表，避免在保存成功后因附属刷新失败把面板清空。
    }
  };

  const refreshSkillVersionsFor = async (skillId: string): Promise<void> => {
    try {
      setSkillVersions(await loadSkillVersions(skillId));
    } catch {
      // 保留当前版本列表，避免在保存成功后因附属刷新失败把面板清空。
    }
  };

  const resetDeletedEditorIfNeeded = (kind: ConfigDeleteTargetKind, deletedId: string): void => {
    const resetPlan = resolveDeleteEditorResetPlan({
      kind,
      deletedId,
      providerFormId: providerForm.id,
      bindingFormId: bindingForm.id,
      appQuotaFormId: appQuotaForm.id,
      failoverFormId: failoverForm.id,
      promptTemplateFormId: promptTemplateForm.id,
      skillFormId: skillForm.id,
      workspaceFormId: workspaceForm.id,
      sessionFormId: sessionForm.id,
      editingMcpServerId,
      editingMcpBindingId
    });

    if (resetPlan.resetProvider) {
      setProviderForm(createDefaultProviderForm());
    }
    if (resetPlan.resetBinding) {
      setBindingForm(createDefaultBindingForm());
    }
    if (resetPlan.resetAppQuota) {
      setAppQuotaForm(createDefaultAppQuotaForm());
    }
    if (resetPlan.resetFailover) {
      setFailoverForm(createDefaultFailoverForm());
    }
    if (resetPlan.resetPromptTemplate) {
      const defaultPromptTemplateForm = createDefaultPromptTemplateForm();
      setPromptTemplateForm(defaultPromptTemplateForm);
      setPromptTagsText(formatTagsText(defaultPromptTemplateForm.tags));
    }
    if (resetPlan.clearPromptTemplateVersions) {
      setPromptTemplateVersions([]);
    }
    if (resetPlan.resetSkill) {
      const defaultSkillForm = createDefaultSkillForm();
      setSkillForm(defaultSkillForm);
      setSkillTagsText(formatTagsText(defaultSkillForm.tags));
    }
    if (resetPlan.clearSkillVersions) {
      setSkillVersions([]);
    }
    if (resetPlan.resetWorkspace) {
      const defaultWorkspaceForm = createDefaultWorkspaceForm();
      setWorkspaceForm(defaultWorkspaceForm);
      setWorkspaceTagsText(formatTagsText(defaultWorkspaceForm.tags));
    }
    if (resetPlan.resetSession) {
      setSessionForm(createDefaultSessionForm());
    }
    if (resetPlan.resetMcpServer) {
      resetMcpServerEditor();
    }
    if (resetPlan.resetMcpBinding) {
      resetMcpBindingEditor();
    }
  };

  const ensureSessionFromDiscovery = async (
    item: DiscoveryItem,
    activate: boolean
  ): Promise<Awaited<ReturnType<typeof ensureSessionRecord>>> => {
    const result = await ensureSessionRecord({
      appCode: item.appCodeSuggestion ?? "codex",
      cwd: item.rootPath,
      title: item.name,
      activate
    });
    setFollowUpNotice(
      buildSessionDiscoveryFollowUpNotice(locale, {
        activate,
        createdWorkspace: result.createdWorkspace,
        session: result.session,
        workspace: result.workspace
      })
    );
    return result;
  };

  const runProjectIntakeConvergence = async (): Promise<void> => {
    if (dashboardSnapshot === null) {
      return;
    }

    const intakePlan = buildProjectIntakePlan(dashboardSnapshot);
    if (intakePlan.recommendedActionCount === 0) {
      setFollowUpNotice(buildProjectIntakeStableFollowUpNotice(locale));
      return;
    }

    const summaryParts: string[] = [];
    const followUpActions: DashboardFollowUpAction[] = [];

    if (intakePlan.shouldArchiveStaleSessions) {
      const archiveResult = await archiveStaleSessionRecords();
      summaryParts.push(
        archiveResult.archivedSessionIds.length > 0
          ? localizeDashboardAction(
              locale,
              `已先归档 ${archiveResult.archivedSessionIds.length} 个陈旧会话，避免历史上下文继续干扰当前项目判断。`,
              `${archiveResult.archivedSessionIds.length} stale session(s) were archived first so historical context stops interfering with the current project decision.`
            )
          : localizeDashboardAction(
              locale,
              "陈旧会话列表已重新检查，本轮没有新的归档对象。",
              "The stale-session list was re-evaluated and there was nothing new to archive."
            )
      );
    }

    if (intakePlan.shouldBatchImportCandidates) {
      const importResult = await importWorkspaceDiscoveryItems({
        tags: ["auto-imported"],
        enabled: true
      });
      summaryParts.push(
        importResult.importedCount > 0
          ? localizeDashboardAction(
              locale,
              `已整批归档 ${importResult.importedCount} 个项目候选，并自动挂回 ${importResult.linkedSessionIds.length} 个历史会话。`,
              `Imported ${importResult.importedCount} project candidate(s) in batch and relinked ${importResult.linkedSessionIds.length} historical session(s).`
            )
          : localizeDashboardAction(
              locale,
              "候选列表已重新对齐，当前没有新的工作区需要归档。",
              "Discovery was reconciled again and there is no new workspace left to import."
            )
      );

      const primaryWorkspace = importResult.items[0] ?? null;
      if (primaryWorkspace) {
        followUpActions.push({
          id: `project-intake-batch-workspace-${primaryWorkspace.id}`,
          label: localizeDashboardAction(locale, "查看首个工作区运行态", "Open Primary Workspace Runtime"),
          kind: "workspace-runtime",
          workspaceId: primaryWorkspace.id,
          ...(primaryWorkspace.appCode ? { appCode: primaryWorkspace.appCode } : {})
        });
      }
      if (importResult.linkedSessionIds[0]) {
        followUpActions.push({
          id: `project-intake-batch-session-${importResult.linkedSessionIds[0]}`,
          label: localizeDashboardAction(locale, "查看挂回会话", "Open Relinked Session"),
          kind: "session-runtime",
          sessionId: importResult.linkedSessionIds[0]
        });
      }
    } else if (intakePlan.shouldImportPrimaryCandidate && intakePlan.primaryCandidate !== null) {
      const importResult = await importWorkspaceDiscoveryItem({
        rootPath: intakePlan.primaryCandidate.rootPath,
        name: intakePlan.primaryCandidate.name,
        appCode: intakePlan.primaryCandidate.appCodeSuggestion ?? "codex",
        tags: ["auto-imported"],
        enabled: true
      });
      summaryParts.push(
        localizeDashboardAction(
          locale,
          `已归档 ${intakePlan.primaryCandidate.name}，并保留当前激活上下文不变，避免打断正在运行的项目。`,
          `${intakePlan.primaryCandidate.name} was imported while the current active context stayed unchanged to avoid interrupting the running project.`
        )
      );
      followUpActions.push({
        id: `project-intake-primary-workspace-${importResult.item.id}`,
        label: localizeDashboardAction(locale, "查看新工作区运行态", "Open Imported Workspace Runtime"),
        kind: "workspace-runtime",
        workspaceId: importResult.item.id,
        ...(importResult.item.appCode ? { appCode: importResult.item.appCode } : {})
      });
      if (importResult.linkedSessionIds[0]) {
        followUpActions.push({
          id: `project-intake-primary-session-${importResult.linkedSessionIds[0]}`,
          label: localizeDashboardAction(locale, "查看关联会话", "Open Linked Session"),
          kind: "session-runtime",
          sessionId: importResult.linkedSessionIds[0],
          ...(importResult.item.appCode ? { appCode: importResult.item.appCode } : {})
        });
      }
    } else if (intakePlan.shouldEnsurePrimaryCandidate && intakePlan.primaryCandidate !== null) {
      const result = await ensureSessionFromDiscovery(intakePlan.primaryCandidate, true);
      summaryParts.push(
        localizeDashboardAction(
          locale,
          `已直接为 ${intakePlan.primaryCandidate.name} 建档并激活，后续 Prompt / MCP / 路由治理现在会跟着这个项目走。`,
          `${intakePlan.primaryCandidate.name} was created and activated directly, so prompt, MCP, and routing governance now follow this project.`
        )
      );
      followUpActions.push({
        id: `project-intake-ensure-runtime-${result.session.id}`,
        label: localizeDashboardAction(locale, "查看当前会话运行态", "Open Current Session Runtime"),
        kind: "session-runtime",
        sessionId: result.session.id,
        appCode: result.session.appCode
      });
      followUpActions.push({
        id: `project-intake-ensure-logs-${result.session.appCode}`,
        label: localizeDashboardAction(locale, "查看该项目请求", "Open Project Requests"),
        kind: "app-logs",
        appCode: result.session.appCode
      });
    }

    if (followUpActions.length === 0) {
      followUpActions.push(
        {
          id: "project-intake-follow-assets",
          label: localizeDashboardAction(locale, "返回上下文资源", "Back To Context Resources"),
          kind: "section",
          section: "assets"
        },
        {
          id: "project-intake-follow-runtime",
          label: localizeDashboardAction(locale, "查看运行态", "Open Runtime"),
          kind: "section",
          section: "runtime"
        }
      );
    } else {
      followUpActions.push({
        id: "project-intake-follow-assets",
        label: localizeDashboardAction(locale, "返回上下文资源", "Back To Context Resources"),
        kind: "section",
        section: "assets"
      });
    }

    setFollowUpNotice(
      buildProjectIntakeConvergedFollowUpNotice(locale, {
        category: intakePlan.shouldEnsurePrimaryCandidate ? "session" : "workspace",
        summary: summaryParts.join(" "),
        actions: followUpActions.slice(0, 3)
      })
    );
  };

  const commonActions = {
    confirmDelete: (kind: ConfigDeleteTargetKind, id: string) =>
      runAction(async () => {
        await executeDelete(kind, id);
        resetDeletedEditorIfNeeded(kind, id);
        setPendingDeleteReview(null);
        openAuditFocus({
          source:
            kind === "mcp-server" || kind === "mcp-app-binding"
              ? "mcp"
              : kind === "app-quota"
                ? "quota"
                : "proxy-request"
        });
        setFollowUpNotice(buildDeleteCompletedFollowUpNotice(locale, kind));
      }, t("dashboard.forms.deleteSuccess")),
    clearActiveWorkspace: () =>
      runAction(() => activateWorkspace(null), t("dashboard.workspace.activationCleared")),
    clearActiveSession: () =>
      runAction(() => activateSession(null), t("dashboard.workspace.activationCleared")),
    archiveStaleSessions: () =>
      runAction(async () => {
        const result = await archiveStaleSessionRecords();
        setFollowUpNotice(buildArchiveStaleSessionsFollowUpNotice(locale, result.archivedSessionIds.length));
      }, t("dashboard.workspace.archiveSuccess")),
    deleteProviderReview: (id: string) => loadDeleteReview("provider", id),
    deleteBindingReview: (id: string) => loadDeleteReview("binding", id),
    deleteAppQuotaReview: (id: string) => loadDeleteReview("app-quota", id)
  };

  return {
    refreshPromptTemplateVersionsFor,
    refreshSkillVersionsFor,
    ensureSessionFromDiscovery,
    runProjectIntakeConvergence,
    commonActions
  };
};
