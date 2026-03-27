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
    setPromptTemplateForm({
      id: item.id,
      name: item.name,
      appCode: item.appCode,
      locale: item.locale,
      content: item.content,
      tags: item.tags,
      enabled: item.enabled
    });
    setPromptTagsText(item.tags.join(", "));
    void loadPromptTemplateVersions(item.id)
      .then((items) => {
        setPromptTemplateVersions(items);
      })
      .catch(() => {
        setPromptTemplateVersions([]);
      });
  };

  const loadSkillToEditor = (item: DashboardSnapshot["skills"][number]): void => {
    setSkillForm({
      id: item.id,
      name: item.name,
      appCode: item.appCode,
      promptTemplateId: item.promptTemplateId,
      content: item.content,
      tags: item.tags,
      enabled: item.enabled
    });
    setSkillTagsText(item.tags.join(", "));
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
    setWorkspaceForm({
      id: item.id,
      name: item.name,
      rootPath: item.rootPath,
      appCode: item.appCode,
      defaultProviderId: item.defaultProviderId,
      defaultPromptTemplateId: item.defaultPromptTemplateId,
      defaultSkillId: item.defaultSkillId,
      tags: item.tags,
      enabled: item.enabled
    });
    setWorkspaceTagsText(item.tags.join(", "));
  };

  const loadSessionToEditor = (
    item: DashboardSnapshot["sessionRecords"][number]
  ): void => {
    setSessionForm({
      id: item.id,
      workspaceId: item.workspaceId,
      appCode: item.appCode,
      title: item.title,
      cwd: item.cwd,
      providerId: item.providerId,
      promptTemplateId: item.promptTemplateId,
      skillId: item.skillId,
      status: item.status,
      startedAt: item.startedAt
    });
  };

  const startEditMcpServer = (
    server: DashboardSnapshot["mcpServers"][number]
  ): void => {
    setEditingMcpServerId(server.id);
    setMcpServerForm({
      id: server.id,
      name: server.name,
      transport: server.transport,
      command: server.command,
      args: server.args,
      url: server.url,
      env: server.env,
      headers: server.headers,
      enabled: server.enabled
    });
    setMcpEnvText(JSON.stringify(server.env, null, 2));
    setMcpHeadersText(JSON.stringify(server.headers, null, 2));
  };

  const startEditMcpBinding = (
    binding: DashboardSnapshot["appMcpBindings"][number]
  ): void => {
    setEditingMcpBindingId(binding.id);
    setMcpBindingForm({
      id: binding.id,
      appCode: binding.appCode,
      serverId: binding.serverId,
      enabled: binding.enabled
    });
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
