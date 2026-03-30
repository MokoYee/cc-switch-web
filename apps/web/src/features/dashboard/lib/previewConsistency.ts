import type {
  PromptTemplate,
  PromptTemplateUpsert,
  Skill,
  SkillUpsert,
  Workspace,
  WorkspaceUpsert
} from "cc-switch-web-shared";

import {
  buildPreviewSignature,
  buildPromptTemplateEditorState,
  buildSkillEditorState,
  buildWorkspaceEditorState,
  isPreviewInSync
} from "./editorConsistency.js";
import {
  buildPromptTemplateSaveInput,
  buildSkillSaveInput,
  buildWorkspaceSaveInput
} from "./editorPersistence.js";

type TaggedEditorState<TForm extends { readonly tags: string[] }> = {
  readonly form: TForm;
  readonly tagsText: string;
};

type TaggedSaveInputBuilder<TForm extends { readonly tags: string[] }> = (
  form: TForm,
  tagsText: string
) => TForm;

const buildTaggedPreviewState = <TForm extends { readonly tags: string[] }>(
  form: TForm,
  tagsText: string,
  buildSaveInput: TaggedSaveInputBuilder<TForm>
): {
  readonly saveInput: TForm;
  readonly previewSignature: string;
} => {
  const saveInput = buildSaveInput(form, tagsText);

  return {
    saveInput,
    previewSignature: buildPreviewSignature(saveInput)
  };
};

const isTaggedPreviewInSync = <TForm extends { readonly tags: string[] }>(
  preview: unknown,
  previewSignature: string,
  form: TForm,
  tagsText: string,
  buildSaveInput: TaggedSaveInputBuilder<TForm>
): boolean => isPreviewInSync(preview, previewSignature, buildSaveInput(form, tagsText));

const isTaggedEditorStateInSync = <TForm extends { readonly tags: string[] }>(
  previewSignature: string,
  editorState: TaggedEditorState<TForm>,
  buildSaveInput: TaggedSaveInputBuilder<TForm>
): boolean =>
  isPreviewInSync(
    editorState,
    previewSignature,
    buildSaveInput(editorState.form, editorState.tagsText)
  );

export const buildPromptTemplatePreviewState = (
  form: PromptTemplateUpsert,
  tagsText: string
) => buildTaggedPreviewState(form, tagsText, buildPromptTemplateSaveInput);

export const isPromptTemplatePreviewInSync = (
  preview: unknown,
  previewSignature: string,
  form: PromptTemplateUpsert,
  tagsText: string
): boolean =>
  isTaggedPreviewInSync(
    preview,
    previewSignature,
    form,
    tagsText,
    buildPromptTemplateSaveInput
  );

export const isPromptTemplateEditorStateInSync = (
  previewSignature: string,
  item: PromptTemplate
): boolean =>
  isTaggedEditorStateInSync(
    previewSignature,
    buildPromptTemplateEditorState(item),
    buildPromptTemplateSaveInput
  );

export const buildSkillPreviewState = (
  form: SkillUpsert,
  tagsText: string
) => buildTaggedPreviewState(form, tagsText, buildSkillSaveInput);

export const isSkillPreviewInSync = (
  preview: unknown,
  previewSignature: string,
  form: SkillUpsert,
  tagsText: string
): boolean => isTaggedPreviewInSync(preview, previewSignature, form, tagsText, buildSkillSaveInput);

export const isSkillEditorStateInSync = (
  previewSignature: string,
  item: Skill
): boolean =>
  isTaggedEditorStateInSync(
    previewSignature,
    buildSkillEditorState(item),
    buildSkillSaveInput
  );

export const buildWorkspacePreviewState = (
  form: WorkspaceUpsert,
  tagsText: string
) => buildTaggedPreviewState(form, tagsText, buildWorkspaceSaveInput);

export const isWorkspacePreviewInSync = (
  preview: unknown,
  previewSignature: string,
  form: WorkspaceUpsert,
  tagsText: string
): boolean =>
  isTaggedPreviewInSync(
    preview,
    previewSignature,
    form,
    tagsText,
    buildWorkspaceSaveInput
  );

export const isWorkspaceEditorStateInSync = (
  previewSignature: string,
  item: Workspace
): boolean =>
  isTaggedEditorStateInSync(
    previewSignature,
    buildWorkspaceEditorState(item),
    buildWorkspaceSaveInput
  );
