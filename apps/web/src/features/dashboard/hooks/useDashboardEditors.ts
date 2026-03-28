import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  AppMcpBindingUpsert,
  McpBindingSavePreview,
  McpServerSavePreview,
  McpServerUpsert,
  PromptTemplateUpsert,
  PromptTemplateVersion,
  SessionRecordUpsert,
  SkillUpsert,
  SkillVersion,
  WorkspaceUpsert
} from "@cc-switch-web/shared";

import {
  loadPromptTemplateVersions,
  loadSkillVersions,
  type DashboardSnapshot
} from "../api/load-dashboard-snapshot.js";
import {
  buildMcpBindingEditorState,
  buildMcpServerEditorState,
  buildPromptTemplateEditorState,
  buildSessionEditorState,
  buildSkillEditorState,
  buildWorkspaceEditorState
} from "../lib/editorConsistency.js";

type UseDashboardEditorsParams = {
  readonly setPromptTemplateForm: Dispatch<SetStateAction<PromptTemplateUpsert>>;
  readonly setPromptTagsText: Dispatch<SetStateAction<string>>;
  readonly setPromptTemplateVersions: Dispatch<SetStateAction<PromptTemplateVersion[]>>;
  readonly setSkillForm: Dispatch<SetStateAction<SkillUpsert>>;
  readonly setSkillTagsText: Dispatch<SetStateAction<string>>;
  readonly setSkillVersions: Dispatch<SetStateAction<SkillVersion[]>>;
  readonly setWorkspaceForm: Dispatch<SetStateAction<WorkspaceUpsert>>;
  readonly setWorkspaceTagsText: Dispatch<SetStateAction<string>>;
  readonly setSessionForm: Dispatch<SetStateAction<SessionRecordUpsert>>;
  readonly setMcpServerForm: Dispatch<SetStateAction<McpServerUpsert>>;
  readonly setMcpEnvText: Dispatch<SetStateAction<string>>;
  readonly setMcpHeadersText: Dispatch<SetStateAction<string>>;
  readonly setMcpServerPreview: Dispatch<SetStateAction<McpServerSavePreview | null>>;
  readonly setMcpServerPreviewSignature: Dispatch<SetStateAction<string>>;
  readonly setMcpServerPreviewError: Dispatch<SetStateAction<string | null>>;
  readonly setMcpBindingForm: Dispatch<SetStateAction<AppMcpBindingUpsert>>;
  readonly setMcpBindingPreview: Dispatch<SetStateAction<McpBindingSavePreview | null>>;
  readonly setMcpBindingPreviewSignature: Dispatch<SetStateAction<string>>;
  readonly createDefaultMcpServerForm: () => McpServerUpsert;
  readonly createDefaultMcpBindingForm: () => AppMcpBindingUpsert;
};

export const useDashboardEditors = ({
  setPromptTemplateForm,
  setPromptTagsText,
  setPromptTemplateVersions,
  setSkillForm,
  setSkillTagsText,
  setSkillVersions,
  setWorkspaceForm,
  setWorkspaceTagsText,
  setSessionForm,
  setMcpServerForm,
  setMcpEnvText,
  setMcpHeadersText,
  setMcpServerPreview,
  setMcpServerPreviewSignature,
  setMcpServerPreviewError,
  setMcpBindingForm,
  setMcpBindingPreview,
  setMcpBindingPreviewSignature,
  createDefaultMcpServerForm,
  createDefaultMcpBindingForm
}: UseDashboardEditorsParams) => {
  const [editingMcpServerId, setEditingMcpServerId] = useState<string | null>(null);
  const [editingMcpBindingId, setEditingMcpBindingId] = useState<string | null>(null);

  const resetMcpServerEditor = (): void => {
    setEditingMcpServerId(null);
    setMcpServerForm(createDefaultMcpServerForm());
    setMcpEnvText('{\n  "ROOT_PATH": "/tmp"\n}');
    setMcpHeadersText("{}");
    setMcpServerPreview(null);
    setMcpServerPreviewSignature("");
    setMcpServerPreviewError(null);
  };

  const resetMcpBindingEditor = (): void => {
    setEditingMcpBindingId(null);
    setMcpBindingForm(createDefaultMcpBindingForm());
    setMcpBindingPreview(null);
    setMcpBindingPreviewSignature("");
  };

  const loadPromptTemplateToEditor = (
    item: DashboardSnapshot["promptTemplates"][number]
  ): void => {
    const editorState = buildPromptTemplateEditorState(item);
    setPromptTemplateForm(editorState.form);
    setPromptTagsText(editorState.tagsText);
    void loadPromptTemplateVersions(item.id)
      .then((items) => {
        setPromptTemplateVersions(items);
      })
      .catch(() => {
        setPromptTemplateVersions([]);
      });
  };

  const loadSkillToEditor = (item: DashboardSnapshot["skills"][number]): void => {
    const editorState = buildSkillEditorState(item);
    setSkillForm(editorState.form);
    setSkillTagsText(editorState.tagsText);
    void loadSkillVersions(item.id)
      .then((items) => {
        setSkillVersions(items);
      })
      .catch(() => {
        setSkillVersions([]);
      });
  };

  const loadWorkspaceToEditor = (
    item: DashboardSnapshot["workspaces"][number]
  ): void => {
    const editorState = buildWorkspaceEditorState(item);
    setWorkspaceForm(editorState.form);
    setWorkspaceTagsText(editorState.tagsText);
  };

  const loadSessionToEditor = (
    item: DashboardSnapshot["sessionRecords"][number]
  ): void => {
    setSessionForm(buildSessionEditorState(item));
  };

  const startEditMcpServer = (
    server: DashboardSnapshot["mcpServers"][number]
  ): void => {
    const editorState = buildMcpServerEditorState(server);
    setEditingMcpServerId(server.id);
    setMcpServerForm(editorState.form);
    setMcpEnvText(editorState.envText);
    setMcpHeadersText(editorState.headersText);
  };

  const startEditMcpBinding = (
    binding: DashboardSnapshot["appMcpBindings"][number]
  ): void => {
    setEditingMcpBindingId(binding.id);
    setMcpBindingForm(buildMcpBindingEditorState(binding));
  };

  return {
    editingMcpServerId,
    editingMcpBindingId,
    resetMcpServerEditor,
    resetMcpBindingEditor,
    loadPromptTemplateToEditor,
    loadSkillToEditor,
    loadWorkspaceToEditor,
    loadSessionToEditor,
    startEditMcpServer,
    startEditMcpBinding
  };
};
