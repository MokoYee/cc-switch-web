import type {
  AppCode,
  AppBinding,
  EffectiveAppContext,
  PromptTemplate,
  ResolvedPromptReference,
  ResolvedSessionContext,
  ResolvedSkillReference,
  ResolvedWorkspaceContext,
  Skill
} from "@cc-switch-web/shared";

import type { BindingRepository } from "../bindings/binding-repository.js";
import type { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import type { SkillRepository } from "../assets/skill-repository.js";
import type { ProviderRepository } from "../providers/provider-repository.js";
import type { ActiveContextService } from "./active-context-service.js";
import type { SessionRecordRepository } from "./session-record-repository.js";
import type { WorkspaceContextService } from "./workspace-context-service.js";
import type { WorkspaceDiscoveryService } from "./workspace-discovery-service.js";

export interface RequestContextOverride {
  readonly workspaceId?: string | null;
  readonly sessionId?: string | null;
  readonly cwd?: string | null;
}

const clonePromptReference = (
  reference: ResolvedPromptReference,
  prompt: PromptTemplate | null
): EffectiveAppContext["promptTemplate"] => ({
  ...reference,
  content: prompt?.content ?? null,
  enabled: prompt?.enabled ?? null
});

const cloneSkillReference = (
  reference: ResolvedSkillReference,
  skill: Skill | null
): EffectiveAppContext["skill"] => ({
  ...reference,
  promptTemplateId: skill?.promptTemplateId ?? null,
  content: skill?.content ?? null,
  enabled: skill?.enabled ?? null
});

const buildInstructionSection = (title: string, content: string): string =>
  `${title}:\n${content.trim()}`;

export class ActiveContextPolicyService {
  constructor(
    private readonly activeContextService: ActiveContextService,
    private readonly workspaceContextService: WorkspaceContextService,
    private readonly workspaceDiscoveryService: WorkspaceDiscoveryService,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly providerRepository: ProviderRepository,
    private readonly promptTemplateRepository: PromptTemplateRepository,
    private readonly skillRepository: SkillRepository
  ) {}

  resolveForApp(appCode: AppCode): EffectiveAppContext {
    const state = this.activeContextService.getState();
    const matchedSession =
      state.sessionContext !== null && state.sessionContext.effectiveAppCode === appCode
        ? state.sessionContext
        : null;

    if (matchedSession !== null) {
      return this.buildResolvedContext(appCode, "active-session", matchedSession, state.activeWorkspaceId);
    }

    const matchedWorkspace =
      state.workspaceContext !== null && state.workspaceContext.effectiveAppCode === appCode
        ? state.workspaceContext
        : null;

    if (matchedWorkspace !== null) {
      return this.buildResolvedContext(appCode, "active-workspace", matchedWorkspace, state.activeWorkspaceId);
    }

    const binding =
      this.bindingRepository.list().find((item) => item.appCode === appCode) ?? null;
    if (binding !== null) {
      return this.buildBindingFallbackContext(appCode, binding);
    }

    return {
      appCode,
      source: "none",
      activeWorkspaceId: null,
      activeSessionId: null,
      provider: {
        id: null,
        name: null,
        bindingMode: null,
        source: "none",
        missing: false
      },
      promptTemplate: {
        id: null,
        name: null,
        locale: null,
        source: "none",
        missing: false,
        content: null,
        enabled: null
      },
      skill: {
        id: null,
        name: null,
        source: "none",
        missing: false,
        promptTemplateId: null,
        content: null,
        enabled: null
      },
      systemInstruction: null,
      warnings: []
    };
  }

  resolveForRequest(appCode: AppCode, override: RequestContextOverride): EffectiveAppContext {
    const requestedSessionId = override.sessionId ?? null;
    const requestedWorkspaceId = override.workspaceId ?? null;
    const requestedCwd = override.cwd ?? null;

    if (requestedSessionId !== null) {
      const session = this.sessionRecordRepository.findById(requestedSessionId);
      if (session === null) {
        throw new Error(`Session not found: ${requestedSessionId}`);
      }
      if (session.status !== "active") {
        throw new Error(`Session is archived and cannot be used for runtime routing: ${requestedSessionId}`);
      }

      const sessionContext = this.workspaceContextService.resolveSessionContext(requestedSessionId);
      if (sessionContext.effectiveAppCode !== appCode) {
        throw new Error(
          `Session ${requestedSessionId} belongs to app ${sessionContext.effectiveAppCode}, not ${appCode}`
        );
      }
      if (
        requestedWorkspaceId !== null &&
        sessionContext.workspaceId !== null &&
        sessionContext.workspaceId !== requestedWorkspaceId
      ) {
        throw new Error(
          `Session ${requestedSessionId} is linked to workspace ${sessionContext.workspaceId}, not ${requestedWorkspaceId}`
        );
      }

      return this.buildResolvedContext(
        appCode,
        "request-session",
        sessionContext,
        sessionContext.workspaceId ?? requestedWorkspaceId
      );
    }

    if (requestedWorkspaceId !== null) {
      const workspaceContext = this.workspaceContextService.resolveWorkspaceContext(requestedWorkspaceId);
      if (workspaceContext.effectiveAppCode !== null && workspaceContext.effectiveAppCode !== appCode) {
        throw new Error(
          `Workspace ${requestedWorkspaceId} belongs to app ${workspaceContext.effectiveAppCode}, not ${appCode}`
        );
      }

      return this.buildResolvedContext(
        appCode,
        "request-workspace",
        workspaceContext,
        requestedWorkspaceId
      );
    }

    if (requestedCwd !== null && requestedCwd.trim().length > 0) {
      const association = this.workspaceDiscoveryService.resolveAssociationByCwd({
        appCode,
        cwd: requestedCwd
      });

      if (association.matchedBy === "session" && association.sessionId !== null) {
        const sessionContext = this.workspaceContextService.resolveSessionContext(association.sessionId);
        return this.buildResolvedContext(
          appCode,
          "request-auto-session",
          sessionContext,
          sessionContext.workspaceId
        );
      }

      if (association.matchedBy === "workspace" && association.workspaceId !== null) {
        const workspaceContext = this.workspaceContextService.resolveWorkspaceContext(association.workspaceId);
        return this.buildResolvedContext(
          appCode,
          "request-auto-workspace",
          workspaceContext,
          association.workspaceId
        );
      }
    }

    return this.resolveForApp(appCode);
  }

  private buildResolvedContext(
    appCode: AppCode,
    source: EffectiveAppContext["source"],
    context: ResolvedWorkspaceContext | ResolvedSessionContext,
    activeWorkspaceId: string | null
  ): EffectiveAppContext {
    const warnings = [...context.warnings];
    const prompt =
      context.promptTemplate.id === null
        ? null
        : this.promptTemplateRepository.list().find((item) => item.id === context.promptTemplate.id) ?? null;
    const skill =
      context.skill.id === null
        ? null
        : this.skillRepository.list().find((item) => item.id === context.skill.id) ?? null;

    if (prompt !== null && !prompt.enabled) {
      warnings.push(`Prompt template is disabled: ${prompt.id}`);
    }
    if (skill !== null && !skill.enabled) {
      warnings.push(`Skill is disabled: ${skill.id}`);
    }

    const systemInstruction = this.buildSystemInstruction(prompt, skill);

    return {
      appCode,
      source,
      activeWorkspaceId,
      activeSessionId: "sessionId" in context ? context.sessionId : null,
      provider: context.provider,
      promptTemplate: clonePromptReference(context.promptTemplate, prompt),
      skill: cloneSkillReference(context.skill, skill),
      systemInstruction,
      warnings
    };
  }

  private buildSystemInstruction(prompt: PromptTemplate | null, skill: Skill | null): string | null {
    const sections: string[] = [];

    if (prompt !== null && prompt.enabled && prompt.content.trim().length > 0) {
      sections.push(
        buildInstructionSection(
          `Prompt Template${prompt.locale ? ` (${prompt.locale})` : ""}`,
          prompt.content
        )
      );
    }

    if (skill !== null && skill.enabled && skill.content.trim().length > 0) {
      sections.push(buildInstructionSection("Skill", skill.content));
    }

    return sections.length > 0 ? sections.join("\n\n") : null;
  }

  private buildBindingFallbackContext(
    appCode: AppCode,
    binding: AppBinding
  ): EffectiveAppContext {
    const warnings: string[] = [];
    const prompt =
      (binding.promptTemplateId ?? null) === null
        ? null
        : this.promptTemplateRepository.list().find((item) => item.id === binding.promptTemplateId) ?? null;
    const skill =
      (binding.skillId ?? null) === null
        ? null
        : this.skillRepository.list().find((item) => item.id === binding.skillId) ?? null;

    const promptReference: EffectiveAppContext["promptTemplate"] = {
      id: binding.promptTemplateId ?? null,
      name: prompt?.name ?? null,
      locale: prompt?.locale ?? null,
      source: (binding.promptTemplateId ?? null) === null ? "none" : "app-binding",
      missing: (binding.promptTemplateId ?? null) !== null && prompt === null,
      content: prompt?.content ?? null,
      enabled: prompt?.enabled ?? null
    };

    const skillReference: EffectiveAppContext["skill"] = {
      id: binding.skillId ?? null,
      name: skill?.name ?? null,
      source: (binding.skillId ?? null) === null ? "none" : "app-binding",
      missing: (binding.skillId ?? null) !== null && skill === null,
      promptTemplateId: skill?.promptTemplateId ?? null,
      content: skill?.content ?? null,
      enabled: skill?.enabled ?? null
    };

    if (promptReference.missing && promptReference.id !== null) {
      warnings.push(`Prompt template not found: ${promptReference.id}`);
    }
    if (skillReference.missing && skillReference.id !== null) {
      warnings.push(`Skill not found: ${skillReference.id}`);
    }
    if (!this.providerRepository.exists(binding.providerId)) {
      warnings.push(`Provider not found: ${binding.providerId}`);
    }
    if (prompt !== null && !prompt.enabled) {
      warnings.push(`Prompt template is disabled: ${prompt.id}`);
    }
    if (skill !== null && !skill.enabled) {
      warnings.push(`Skill is disabled: ${skill.id}`);
    }

    return {
      appCode,
      source: "none",
      activeWorkspaceId: null,
      activeSessionId: null,
      provider: {
        id: binding.providerId,
        name:
          this.providerRepository.list().find((item) => item.id === binding.providerId)?.name ?? null,
        bindingMode: binding.mode,
        source: "app-binding",
        missing: !this.providerRepository.exists(binding.providerId)
      },
      promptTemplate: promptReference,
      skill: skillReference,
      systemInstruction: this.buildSystemInstruction(prompt, skill),
      warnings
    };
  }
}
