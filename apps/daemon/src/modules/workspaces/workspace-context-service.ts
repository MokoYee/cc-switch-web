import type {
  AppBinding,
  ResolvedProviderReference,
  ResolvedPromptReference,
  ResolvedSessionContext,
  ResolvedSkillReference,
  ResolvedWorkspaceContext,
  SessionRecord,
  Workspace
} from "cc-switch-web-shared";

import type { BindingRepository } from "../bindings/binding-repository.js";
import type { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import type { SkillRepository } from "../assets/skill-repository.js";
import type { ProviderRepository } from "../providers/provider-repository.js";
import type { SessionRecordRepository } from "./session-record-repository.js";
import type { WorkspaceRepository } from "./workspace-repository.js";

const buildProviderReference = (
  providerId: string | null,
  source: ResolvedProviderReference["source"],
  providerRepository: ProviderRepository,
  binding: AppBinding | null
): ResolvedProviderReference => {
  if (providerId === null) {
    return {
      id: null,
      name: null,
      bindingMode: binding?.mode ?? null,
      source,
      missing: false
    };
  }

  const provider = providerRepository.list().find((item) => item.id === providerId) ?? null;
  return {
    id: providerId,
    name: provider?.name ?? null,
    bindingMode: binding?.mode ?? null,
    source,
    missing: provider === null
  };
};

const buildPromptReference = (
  promptTemplateId: string | null,
  source: ResolvedPromptReference["source"],
  promptTemplateRepository: PromptTemplateRepository
): ResolvedPromptReference => {
  if (promptTemplateId === null) {
    return {
      id: null,
      name: null,
      locale: null,
      source,
      missing: false
    };
  }

  const prompt = promptTemplateRepository.list().find((item) => item.id === promptTemplateId) ?? null;
  return {
    id: promptTemplateId,
    name: prompt?.name ?? null,
    locale: prompt?.locale ?? null,
    source,
    missing: prompt === null
  };
};

const buildSkillReference = (
  skillId: string | null,
  source: ResolvedSkillReference["source"],
  skillRepository: SkillRepository
): ResolvedSkillReference => {
  if (skillId === null) {
    return {
      id: null,
      name: null,
      source,
      missing: false
    };
  }

  const skill = skillRepository.list().find((item) => item.id === skillId) ?? null;
  return {
    id: skillId,
    name: skill?.name ?? null,
    source,
    missing: skill === null
  };
};

const appendWarnings = (
  warnings: string[],
  provider: ResolvedProviderReference,
  promptTemplate: ResolvedPromptReference,
  skill: ResolvedSkillReference,
  effectiveAppCode: Workspace["appCode"] | SessionRecord["appCode"] | null
): void => {
  if (effectiveAppCode === null) {
    warnings.push("App code is not configured");
  }
  if (provider.id === null) {
    warnings.push("Provider is not configured");
  } else if (provider.missing) {
    warnings.push(`Provider not found: ${provider.id}`);
  }
  if (promptTemplate.missing && promptTemplate.id !== null) {
    warnings.push(`Prompt template not found: ${promptTemplate.id}`);
  }
  if (skill.missing && skill.id !== null) {
    warnings.push(`Skill not found: ${skill.id}`);
  }
};

export class WorkspaceContextService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly providerRepository: ProviderRepository,
    private readonly promptTemplateRepository: PromptTemplateRepository,
    private readonly skillRepository: SkillRepository,
    private readonly bindingRepository: BindingRepository
  ) {}

  listWorkspaceContexts(): ResolvedWorkspaceContext[] {
    return this.workspaceRepository.list().map((workspace) => this.resolveWorkspaceContext(workspace.id));
  }

  resolveWorkspaceContext(workspaceId: string): ResolvedWorkspaceContext {
    const workspace = this.workspaceRepository.list().find((item) => item.id === workspaceId);
    if (workspace === undefined) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const binding =
      workspace.appCode === null
        ? null
        : this.bindingRepository.list().find((item) => item.appCode === workspace.appCode) ?? null;
    const providerSource =
      workspace.defaultProviderId !== null
        ? "workspace-default"
        : binding !== null
          ? "app-binding"
          : "none";
    const provider = buildProviderReference(
      workspace.defaultProviderId ?? binding?.providerId ?? null,
      providerSource,
      this.providerRepository,
      binding
    );
    const promptTemplate = buildPromptReference(
      workspace.defaultPromptTemplateId ?? binding?.promptTemplateId ?? null,
      workspace.defaultPromptTemplateId !== null
        ? "workspace-default"
        : (binding?.promptTemplateId ?? null) !== null
          ? "app-binding"
          : "none",
      this.promptTemplateRepository
    );
    const skill = buildSkillReference(
      workspace.defaultSkillId ?? binding?.skillId ?? null,
      workspace.defaultSkillId !== null
        ? "workspace-default"
        : (binding?.skillId ?? null) !== null
          ? "app-binding"
          : "none",
      this.skillRepository
    );
    const warnings: string[] = [];
    appendWarnings(warnings, provider, promptTemplate, skill, workspace.appCode);

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      rootPath: workspace.rootPath,
      effectiveAppCode: workspace.appCode,
      provider,
      promptTemplate,
      skill,
      warnings
    };
  }

  listSessionContexts(): ResolvedSessionContext[] {
    return this.sessionRecordRepository.list().map((session) => this.resolveSessionContext(session.id));
  }

  resolveSessionContext(sessionId: string): ResolvedSessionContext {
    const session = this.sessionRecordRepository.list().find((item) => item.id === sessionId);
    if (session === undefined) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const workspace =
      session.workspaceId === null
        ? null
        : this.workspaceRepository.list().find((item) => item.id === session.workspaceId) ?? null;
    const binding =
      this.bindingRepository.list().find((item) => item.appCode === session.appCode) ?? null;

    const provider = buildProviderReference(
      session.providerId ?? workspace?.defaultProviderId ?? binding?.providerId ?? null,
      session.providerId !== null ? "session-override" : workspace?.defaultProviderId !== null ? "workspace-default" : binding !== null ? "app-binding" : "none",
      this.providerRepository,
      binding
    );
    const promptTemplate = buildPromptReference(
      session.promptTemplateId ?? workspace?.defaultPromptTemplateId ?? binding?.promptTemplateId ?? null,
      session.promptTemplateId !== null
        ? "session-override"
        : workspace?.defaultPromptTemplateId !== null
          ? "workspace-default"
          : (binding?.promptTemplateId ?? null) !== null
            ? "app-binding"
            : "none",
      this.promptTemplateRepository
    );
    const skill = buildSkillReference(
      session.skillId ?? workspace?.defaultSkillId ?? binding?.skillId ?? null,
      session.skillId !== null
        ? "session-override"
        : workspace?.defaultSkillId !== null
          ? "workspace-default"
          : (binding?.skillId ?? null) !== null
            ? "app-binding"
            : "none",
      this.skillRepository
    );
    const warnings: string[] = [];
    if (session.workspaceId !== null && workspace === null) {
      warnings.push(`Workspace not found: ${session.workspaceId}`);
    }
    appendWarnings(warnings, provider, promptTemplate, skill, session.appCode);

    return {
      sessionId: session.id,
      title: session.title,
      cwd: session.cwd,
      workspaceId: session.workspaceId,
      effectiveAppCode: session.appCode,
      provider,
      promptTemplate,
      skill,
      warnings
    };
  }
}
