import type {
  AppBinding,
  PromptTemplateUpsert,
  SessionRecordUpsert,
  SkillUpsert,
  WorkspaceUpsert
} from "@cc-switch-web/shared";
import type { Dispatch, SetStateAction } from "react";

import {
  applyAssetGovernanceRepair,
  restorePromptTemplateVersion,
  restoreSkillVersion,
  savePromptTemplate,
  saveSessionRecord,
  saveSkill,
  saveWorkspace
} from "../api/load-dashboard-snapshot.js";
import {
  buildAssetGovernanceRepairFollowUpNotice,
  buildPromptGovernanceAppliedFollowUpNotice,
  buildPromptRestoredFollowUpNotice,
  buildPromptSavedFollowUpNotice,
  buildSessionSavedFollowUpNotice,
  buildSkillGovernanceAppliedFollowUpNotice,
  buildSkillRestoredFollowUpNotice,
  buildSkillSavedFollowUpNotice,
  buildWorkspaceSavedFollowUpNotice
} from "../lib/dashboardFollowUp.js";
import {
  buildPromptTemplateSaveInput,
  buildPromptTemplateVersionedEditorEcho,
  buildSkillSaveInput,
  buildSkillVersionedEditorEcho,
  buildWorkspaceSaveInput
} from "../lib/editorPersistence.js";
import {
  buildPromptTemplateEditorState,
  buildSessionEditorState,
  buildSkillEditorState,
  buildWorkspaceEditorState
} from "../lib/editorConsistency.js";

import {
  type DashboardActionLocale,
  type DashboardActionRunAction,
  type DashboardActionSetFollowUpNotice,
  localizeDashboardAction
} from "./dashboardActionTypes.js";

type AssetTranslationKey = "dashboard.forms.saveSuccess";

type CreateDashboardAssetActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: AssetTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly focusAppLogs: (appCode: AppBinding["appCode"]) => void;
  readonly focusWorkspaceLogs: (workspaceId: string) => void;
  readonly focusSessionLogs: (sessionId: string) => void;
  readonly refreshWorkspaceRuntimeDetail: (workspaceId: string) => void;
  readonly refreshSessionRuntimeDetail: (sessionId: string) => void;
  readonly refreshPromptTemplateVersionsFor: (promptTemplateId: string) => Promise<void>;
  readonly refreshSkillVersionsFor: (skillId: string) => Promise<void>;
  readonly workspaceForm: WorkspaceUpsert;
  readonly workspaceTagsText: string;
  readonly sessionForm: SessionRecordUpsert;
  readonly promptTemplateForm: PromptTemplateUpsert;
  readonly promptTagsText: string;
  readonly skillForm: SkillUpsert;
  readonly skillTagsText: string;
  readonly setWorkspaceForm: Dispatch<SetStateAction<WorkspaceUpsert>>;
  readonly setWorkspaceTagsText: Dispatch<SetStateAction<string>>;
  readonly setSessionForm: Dispatch<SetStateAction<SessionRecordUpsert>>;
  readonly setPromptTemplateForm: Dispatch<SetStateAction<PromptTemplateUpsert>>;
  readonly setPromptTagsText: Dispatch<SetStateAction<string>>;
  readonly setSkillForm: Dispatch<SetStateAction<SkillUpsert>>;
  readonly setSkillTagsText: Dispatch<SetStateAction<string>>;
};

export const createDashboardAssetActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  focusAppLogs,
  focusWorkspaceLogs,
  focusSessionLogs,
  refreshWorkspaceRuntimeDetail,
  refreshSessionRuntimeDetail,
  refreshPromptTemplateVersionsFor,
  refreshSkillVersionsFor,
  workspaceForm,
  workspaceTagsText,
  sessionForm,
  promptTemplateForm,
  promptTagsText,
  skillForm,
  skillTagsText,
  setWorkspaceForm,
  setWorkspaceTagsText,
  setSessionForm,
  setPromptTemplateForm,
  setPromptTagsText,
  setSkillForm,
  setSkillTagsText
}: CreateDashboardAssetActionsParams) => ({
  repairGovernance: (appCode?: AppBinding["appCode"]) =>
    runAction(async () => {
      const result = await applyAssetGovernanceRepair(appCode);
      if (appCode) {
        focusAppLogs(appCode);
      }
      setFollowUpNotice(
        buildAssetGovernanceRepairFollowUpNotice(locale, {
          repairedItems: result.repairedItems,
          remainingManualItems: result.remainingManualItems,
          ...(appCode ? { appCode } : {})
        })
      );
    }, localizeDashboardAction(locale, "资产治理修复已执行", "Asset governance repair applied")),
  saveWorkspace: () =>
    runAction(
      async () => {
        const { item } = await saveWorkspace(buildWorkspaceSaveInput(workspaceForm, workspaceTagsText));
        const editorState = buildWorkspaceEditorState(item);
        setWorkspaceForm(editorState.form);
        setWorkspaceTagsText(editorState.tagsText);
        refreshWorkspaceRuntimeDetail(item.id);
        focusWorkspaceLogs(item.id);
        setFollowUpNotice(buildWorkspaceSavedFollowUpNotice(locale, item));
      },
      t("dashboard.forms.saveSuccess")
    ),
  saveSession: () =>
    runAction(async () => {
      const { item } = await saveSessionRecord(sessionForm);
      setSessionForm(buildSessionEditorState(item));
      refreshSessionRuntimeDetail(item.id);
      focusSessionLogs(item.id);
      setFollowUpNotice(buildSessionSavedFollowUpNotice(locale, item));
    }, t("dashboard.forms.saveSuccess")),
  savePromptTemplate: () =>
    runAction(
      async () => {
        const { item } = await savePromptTemplate(
          buildPromptTemplateSaveInput(promptTemplateForm, promptTagsText)
        );
        const editorState = buildPromptTemplateEditorState(item);
        setPromptTemplateForm(editorState.form);
        setPromptTagsText(editorState.tagsText);
        await refreshPromptTemplateVersionsFor(item.id);
        if (item.appCode) {
          focusAppLogs(item.appCode);
        }
        setFollowUpNotice(buildPromptSavedFollowUpNotice(locale, item));
      },
      t("dashboard.forms.saveSuccess")
    ),
  savePromptTemplateItem: (input: PromptTemplateUpsert) =>
    runAction(
      async () => {
        const { item } = await savePromptTemplate(input);
        const editorEcho = buildPromptTemplateVersionedEditorEcho(promptTemplateForm.id, item);
        if (editorEcho.editorState !== null) {
          const editorState = editorEcho.editorState;
          setPromptTemplateForm(editorState.form);
          setPromptTagsText(editorState.tagsText);
        }
        if (editorEcho.refreshVersions) {
          await refreshPromptTemplateVersionsFor(item.id);
        }
        if (item.appCode) {
          focusAppLogs(item.appCode);
        }
        setFollowUpNotice(buildPromptGovernanceAppliedFollowUpNotice(locale, item));
      },
      t("dashboard.forms.saveSuccess")
    ),
  restorePromptTemplateVersion: (promptTemplateId: string, versionNumber: number) =>
    runAction(async () => {
      const { item } = await restorePromptTemplateVersion(promptTemplateId, versionNumber);
      const editorEcho = buildPromptTemplateVersionedEditorEcho(promptTemplateForm.id, item);
      if (editorEcho.editorState !== null) {
        const editorState = editorEcho.editorState;
        setPromptTemplateForm(editorState.form);
        setPromptTagsText(editorState.tagsText);
      }
      if (editorEcho.refreshVersions) {
        await refreshPromptTemplateVersionsFor(item.id);
      }
      if (item.appCode) {
        focusAppLogs(item.appCode);
      }
      setFollowUpNotice(buildPromptRestoredFollowUpNotice(locale, item));
    }, t("dashboard.forms.saveSuccess")),
  saveSkill: () =>
    runAction(
      async () => {
        const { item } = await saveSkill(buildSkillSaveInput(skillForm, skillTagsText));
        const editorState = buildSkillEditorState(item);
        setSkillForm(editorState.form);
        setSkillTagsText(editorState.tagsText);
        await refreshSkillVersionsFor(item.id);
        if (item.appCode) {
          focusAppLogs(item.appCode);
        }
        setFollowUpNotice(buildSkillSavedFollowUpNotice(locale, item));
      },
      t("dashboard.forms.saveSuccess")
    ),
  saveSkillItem: (input: SkillUpsert) =>
    runAction(
      async () => {
        const { item } = await saveSkill(input);
        const editorEcho = buildSkillVersionedEditorEcho(skillForm.id, item);
        if (editorEcho.editorState !== null) {
          const editorState = editorEcho.editorState;
          setSkillForm(editorState.form);
          setSkillTagsText(editorState.tagsText);
        }
        if (editorEcho.refreshVersions) {
          await refreshSkillVersionsFor(item.id);
        }
        if (item.appCode) {
          focusAppLogs(item.appCode);
        }
        setFollowUpNotice(buildSkillGovernanceAppliedFollowUpNotice(locale, item));
      },
      t("dashboard.forms.saveSuccess")
    ),
  restoreSkillVersion: (skillId: string, versionNumber: number) =>
    runAction(async () => {
      const { item } = await restoreSkillVersion(skillId, versionNumber);
      const editorEcho = buildSkillVersionedEditorEcho(skillForm.id, item);
      if (editorEcho.editorState !== null) {
        const editorState = editorEcho.editorState;
        setSkillForm(editorState.form);
        setSkillTagsText(editorState.tagsText);
      }
      if (editorEcho.refreshVersions) {
        await refreshSkillVersionsFor(item.id);
      }
      if (item.appCode) {
        focusAppLogs(item.appCode);
      }
      setFollowUpNotice(buildSkillRestoredFollowUpNotice(locale, item));
    }, t("dashboard.forms.saveSuccess"))
});
