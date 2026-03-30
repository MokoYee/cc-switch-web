import type {
  PromptTemplate,
  PromptTemplateUpsert,
  Skill,
  SkillUpsert,
  WorkspaceUpsert
} from "cc-switch-web-shared";

import {
  buildPromptTemplateEditorState,
  buildSkillEditorState,
  resolveVersionedEditorSyncPlan,
  withNormalizedTags
} from "./editorConsistency.js";

export const buildPromptTemplateSaveInput = (
  form: PromptTemplateUpsert,
  tagsText: string
): PromptTemplateUpsert => withNormalizedTags(form, tagsText);

export const buildSkillSaveInput = (
  form: SkillUpsert,
  tagsText: string
): SkillUpsert => withNormalizedTags(form, tagsText);

export const buildWorkspaceSaveInput = (
  form: WorkspaceUpsert,
  tagsText: string
): WorkspaceUpsert => withNormalizedTags(form, tagsText);

export type VersionedEditorEcho<T> = {
  readonly editorState: T | null;
  readonly refreshVersions: boolean;
};

const buildVersionedEditorEcho = <TItem extends { readonly id: string }, TEditorState>(
  currentEditorId: string,
  item: TItem,
  buildEditorState: (item: TItem) => TEditorState
): VersionedEditorEcho<TEditorState> => {
  const syncPlan = resolveVersionedEditorSyncPlan(currentEditorId, item.id);

  return {
    editorState: syncPlan.syncCurrentEditor ? buildEditorState(item) : null,
    refreshVersions: syncPlan.refreshVersions
  };
};

export const buildPromptTemplateVersionedEditorEcho = (
  currentEditorId: string,
  item: PromptTemplate
): VersionedEditorEcho<ReturnType<typeof buildPromptTemplateEditorState>> =>
  buildVersionedEditorEcho(currentEditorId, item, buildPromptTemplateEditorState);

export const buildSkillVersionedEditorEcho = (
  currentEditorId: string,
  item: Skill
): VersionedEditorEcho<ReturnType<typeof buildSkillEditorState>> =>
  buildVersionedEditorEcho(currentEditorId, item, buildSkillEditorState);
