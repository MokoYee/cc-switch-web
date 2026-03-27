import type {
  AppBinding,
  AppCode,
  EffectiveAppContext,
  LocaleCode,
  PromptTemplateUpsert,
  QuickContextAssetApplyResult,
  QuickContextAssetInput,
  QuickContextAssetPreview,
  QuickContextAssetResolvedTargetMode,
  QuickContextAssetTargetResolution,
  SessionRecord,
  SkillUpsert,
  Workspace
} from "@cc-switch-web/shared";
import { quickContextAssetInputSchema } from "@cc-switch-web/shared";

import type { AssetVersionService } from "../assets/asset-version-service.js";
import type { BindingRepository } from "../bindings/binding-repository.js";
import type { SnapshotService } from "../snapshots/snapshot-service.js";
import type { ActiveContextPolicyService } from "../workspaces/active-context-policy-service.js";
import type { ActiveContextService } from "../workspaces/active-context-service.js";
import type { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import type { WorkspaceRepository } from "../workspaces/workspace-repository.js";

type TargetPlan = {
  readonly resolution: QuickContextAssetTargetResolution;
  readonly binding: AppBinding | null;
  readonly workspace: Workspace | null;
  readonly session: SessionRecord | null;
  readonly blockingReasons: string[];
  readonly warnings: string[];
};

type QuickContextAssetPlan = {
  readonly input: QuickContextAssetInput;
  readonly promptInput: PromptTemplateUpsert;
  readonly skillInput: SkillUpsert | null;
  readonly target: TargetPlan;
  readonly blockingReasons: string[];
  readonly warnings: string[];
  readonly summary: string[];
  readonly effectiveContext: EffectiveAppContext;
};

const trimToNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const dedupe = (items: readonly string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const buildPromptId = (appCode: AppCode): string => `prompt-quick-${appCode}`;

const buildSkillId = (appCode: AppCode): string => `skill-quick-${appCode}`;

const buildPromptName = (appCode: AppCode, locale: LocaleCode): string =>
  locale === "zh-CN" ? `${appCode} 默认 Prompt` : `${appCode} Default Prompt`;

const buildSkillName = (appCode: AppCode, locale: LocaleCode): string =>
  locale === "zh-CN" ? `${appCode} 默认 Skill` : `${appCode} Default Skill`;

const buildSystemInstruction = (
  promptInput: PromptTemplateUpsert,
  skillInput: SkillUpsert | null
): string => {
  const sections = [`Prompt Template (${promptInput.locale}):\n${promptInput.content.trim()}`];

  if (skillInput !== null) {
    sections.push(`Skill:\n${skillInput.content.trim()}`);
  }

  return sections.join("\n\n");
};

export class QuickContextAssetService {
  constructor(
    private readonly assetVersionService: AssetVersionService,
    private readonly bindingRepository: BindingRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly activeContextService: ActiveContextService,
    private readonly activeContextPolicyService: ActiveContextPolicyService,
    private readonly snapshotService: SnapshotService
  ) {}

  preview(rawInput: QuickContextAssetInput): QuickContextAssetPreview {
    const plan = this.buildPlan(quickContextAssetInputSchema.parse(rawInput));

    return {
      appCode: plan.input.appCode,
      promptTemplateId: plan.promptInput.id,
      skillId: plan.skillInput?.id ?? null,
      target: plan.target.resolution,
      canApply: plan.blockingReasons.length === 0,
      blockingReasons: plan.blockingReasons,
      warnings: plan.warnings,
      summary: plan.summary,
      effectiveContext: plan.effectiveContext
    };
  }

  apply(rawInput: QuickContextAssetInput): QuickContextAssetApplyResult {
    const plan = this.buildPlan(quickContextAssetInputSchema.parse(rawInput));

    if (plan.blockingReasons.length > 0) {
      throw new Error(plan.blockingReasons.join(" "));
    }

    const promptTemplate = this.assetVersionService.upsertPromptTemplate(plan.promptInput).item;
    const skill =
      plan.skillInput === null
        ? null
        : this.assetVersionService.upsertSkill(plan.skillInput).item;

    this.applyTarget(plan.target, promptTemplate.id, skill?.id ?? null);

    const snapshot = this.snapshotService.create(
      `quick-context-asset:${plan.input.appCode}:${plan.target.resolution.resolvedMode}`
    );
    const effectiveContext = this.activeContextPolicyService.resolveForApp(plan.input.appCode);

    return {
      appCode: plan.input.appCode,
      promptTemplate,
      skill,
      target: plan.target.resolution,
      warnings: plan.warnings,
      summary: plan.summary,
      effectiveContext,
      snapshotVersion: snapshot.version
    };
  }

  private buildPlan(input: QuickContextAssetInput): QuickContextAssetPlan {
    const promptInput: PromptTemplateUpsert = {
      id: buildPromptId(input.appCode),
      name: trimToNull(input.promptName) ?? buildPromptName(input.appCode, input.promptLocale),
      appCode: input.appCode,
      locale: input.promptLocale,
      content: input.promptContent.trim(),
      tags: ["quick-start", "default-context", input.appCode],
      enabled: true
    };
    const normalizedSkillContent = trimToNull(input.skillContent);
    const skillInput =
      normalizedSkillContent === null
        ? null
        : {
            id: buildSkillId(input.appCode),
            name: trimToNull(input.skillName) ?? buildSkillName(input.appCode, input.promptLocale),
            appCode: input.appCode,
            promptTemplateId: promptInput.id,
            content: normalizedSkillContent,
            tags: ["quick-start", "default-context", input.appCode],
            enabled: true
          } satisfies SkillUpsert;
    const target = this.resolveTarget(input.appCode, input.targetMode);
    const blockingReasons = [...target.blockingReasons];
    const warnings = [...target.warnings];
    const summary = [
      `Prompt asset ${promptInput.id} will be saved for ${input.appCode}.`,
      skillInput === null
        ? `Skill fallback will be cleared for ${input.appCode}.`
        : `Skill asset ${skillInput.id} will be saved for ${input.appCode}.`,
      this.describeTargetSummary(target.resolution)
    ];

    const effectiveContext = this.buildProjectedEffectiveContext(
      input.appCode,
      promptInput,
      skillInput,
      target
    );

    if (target.resolution.resolvedMode === "asset-only") {
      warnings.push(
        `No runtime target is currently available for ${input.appCode}, so the assets will be created without changing live context.`
      );
    }

    return {
      input,
      promptInput,
      skillInput,
      target,
      blockingReasons: dedupe(blockingReasons),
      warnings: dedupe(warnings),
      summary: dedupe(summary),
      effectiveContext
    };
  }

  private resolveTarget(
    appCode: AppCode,
    requestedMode: QuickContextAssetInput["targetMode"]
  ): TargetPlan {
    const state = this.activeContextService.getState();
    const binding =
      this.bindingRepository.list().find((item) => item.appCode === appCode) ?? null;
    const matchingSession =
      state.sessionContext !== null && state.sessionContext.effectiveAppCode === appCode
        ? this.sessionRecordRepository.findActiveById(state.sessionContext.sessionId)
        : null;
    const matchingWorkspace =
      state.workspaceContext !== null && state.workspaceContext.effectiveAppCode === appCode
        ? this.workspaceRepository.list().find((item) => item.id === state.workspaceContext?.workspaceId) ?? null
        : null;
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    const buildResolution = (
      resolvedMode: QuickContextAssetResolvedTargetMode
    ): QuickContextAssetTargetResolution => {
      switch (resolvedMode) {
        case "app-binding":
          return {
            requestedMode,
            resolvedMode,
            targetType: "binding",
            targetId: binding?.id ?? null,
            targetLabel: binding === null ? null : `${binding.id} (${binding.appCode})`,
            bindingId: binding?.id ?? null,
            workspaceId: null,
            sessionId: null
          };
        case "active-workspace":
          return {
            requestedMode,
            resolvedMode,
            targetType: "workspace",
            targetId: matchingWorkspace?.id ?? null,
            targetLabel: matchingWorkspace?.name ?? null,
            bindingId: binding?.id ?? null,
            workspaceId: matchingWorkspace?.id ?? null,
            sessionId: null
          };
        case "active-session":
          return {
            requestedMode,
            resolvedMode,
            targetType: "session",
            targetId: matchingSession?.id ?? null,
            targetLabel: matchingSession?.title ?? null,
            bindingId: binding?.id ?? null,
            workspaceId: matchingSession?.workspaceId ?? null,
            sessionId: matchingSession?.id ?? null
          };
        case "asset-only":
          return {
            requestedMode,
            resolvedMode,
            targetType: "none",
            targetId: null,
            targetLabel: null,
            bindingId: binding?.id ?? null,
            workspaceId: null,
            sessionId: null
          };
      }
    };

    if (requestedMode === "auto") {
      if (matchingSession !== null) {
        return {
          resolution: buildResolution("active-session"),
          binding,
          workspace: matchingWorkspace,
          session: matchingSession,
          blockingReasons,
          warnings
        };
      }

      if (matchingWorkspace !== null) {
        return {
          resolution: buildResolution("active-workspace"),
          binding,
          workspace: matchingWorkspace,
          session: matchingSession,
          blockingReasons,
          warnings
        };
      }

      if (binding !== null) {
        return {
          resolution: buildResolution("app-binding"),
          binding,
          workspace: matchingWorkspace,
          session: matchingSession,
          blockingReasons,
          warnings
        };
      }

      return {
        resolution: buildResolution("asset-only"),
        binding,
        workspace: matchingWorkspace,
        session: matchingSession,
        blockingReasons,
        warnings
      };
    }

    if (requestedMode === "app-binding") {
      if (binding === null) {
        blockingReasons.push(`App binding does not exist for ${appCode}, so app-level default context cannot be attached yet.`);
      } else if (matchingSession !== null || matchingWorkspace !== null) {
        warnings.push(
          `An active session or workspace currently overrides ${appCode}, so the app-level default will not become effective until the override is cleared.`
        );
      }

      return {
        resolution: buildResolution(binding === null ? "asset-only" : "app-binding"),
        binding,
        workspace: matchingWorkspace,
        session: matchingSession,
        blockingReasons,
        warnings
      };
    }

    if (requestedMode === "active-workspace") {
      if (matchingWorkspace === null) {
        blockingReasons.push(`No active workspace currently matches ${appCode}.`);
      }
      if (matchingSession !== null) {
        warnings.push(
          `The active session still overrides workspace defaults for ${appCode}, so the new workspace context will take effect only after the session override is cleared.`
        );
      }

      return {
        resolution: buildResolution(matchingWorkspace === null ? "asset-only" : "active-workspace"),
        binding,
        workspace: matchingWorkspace,
        session: matchingSession,
        blockingReasons,
        warnings
      };
    }

    if (requestedMode === "active-session") {
      if (matchingSession === null) {
        blockingReasons.push(`No active session currently matches ${appCode}.`);
      }

      return {
        resolution: buildResolution(matchingSession === null ? "asset-only" : "active-session"),
        binding,
        workspace: matchingWorkspace,
        session: matchingSession,
        blockingReasons,
        warnings
      };
    }

    return {
      resolution: buildResolution("asset-only"),
      binding,
      workspace: matchingWorkspace,
      session: matchingSession,
      blockingReasons,
      warnings
    };
  }

  private buildProjectedEffectiveContext(
    appCode: AppCode,
    promptInput: PromptTemplateUpsert,
    skillInput: SkillUpsert | null,
    target: TargetPlan
  ): EffectiveAppContext {
    const current = this.activeContextPolicyService.resolveForApp(appCode);
    const targetNowEffective = this.isTargetEffectiveNow(appCode, target.resolution.resolvedMode);

    if (!targetNowEffective) {
      return current;
    }

    return {
      ...current,
      promptTemplate: {
        id: promptInput.id,
        name: promptInput.name,
        locale: promptInput.locale,
        source:
          target.resolution.resolvedMode === "active-session"
            ? "session-override"
            : target.resolution.resolvedMode === "active-workspace"
              ? "workspace-default"
              : "app-binding",
        missing: false,
        content: promptInput.content,
        enabled: true
      },
      skill: skillInput === null
        ? {
            id: null,
            name: null,
            source: "none",
            missing: false,
            promptTemplateId: null,
            content: null,
            enabled: null
          }
        : {
            id: skillInput.id,
            name: skillInput.name,
            source:
              target.resolution.resolvedMode === "active-session"
                ? "session-override"
                : target.resolution.resolvedMode === "active-workspace"
                  ? "workspace-default"
                  : "app-binding",
            missing: false,
            promptTemplateId: promptInput.id,
            content: skillInput.content,
            enabled: true
          },
      systemInstruction: buildSystemInstruction(promptInput, skillInput)
    };
  }

  private isTargetEffectiveNow(
    appCode: AppCode,
    resolvedMode: QuickContextAssetResolvedTargetMode
  ): boolean {
    const state = this.activeContextService.getState();
    const hasMatchingSession =
      state.sessionContext !== null && state.sessionContext.effectiveAppCode === appCode;
    const hasMatchingWorkspace =
      state.workspaceContext !== null && state.workspaceContext.effectiveAppCode === appCode;

    if (resolvedMode === "active-session") {
      return hasMatchingSession;
    }

    if (resolvedMode === "active-workspace") {
      return !hasMatchingSession && hasMatchingWorkspace;
    }

    if (resolvedMode === "app-binding") {
      return !hasMatchingSession && !hasMatchingWorkspace;
    }

    return false;
  }

  private applyTarget(
    target: TargetPlan,
    promptTemplateId: string,
    skillId: string | null
  ): void {
    switch (target.resolution.resolvedMode) {
      case "app-binding": {
        if (target.binding === null) {
          throw new Error(`App binding disappeared during quick context apply: ${target.resolution.targetId}`);
        }

        this.bindingRepository.upsert({
          id: target.binding.id,
          appCode: target.binding.appCode,
          providerId: target.binding.providerId,
          mode: target.binding.mode,
          promptTemplateId,
          skillId
        });
        return;
      }
      case "active-workspace": {
        if (target.workspace === null) {
          throw new Error(`Active workspace disappeared during quick context apply: ${target.resolution.targetId}`);
        }

        this.workspaceRepository.upsert({
          id: target.workspace.id,
          name: target.workspace.name,
          rootPath: target.workspace.rootPath,
          appCode: target.workspace.appCode,
          defaultProviderId: target.workspace.defaultProviderId,
          defaultPromptTemplateId: promptTemplateId,
          defaultSkillId: skillId,
          tags: target.workspace.tags,
          enabled: target.workspace.enabled
        });
        return;
      }
      case "active-session": {
        if (target.session === null) {
          throw new Error(`Active session disappeared during quick context apply: ${target.resolution.targetId}`);
        }

        const touched = this.sessionRecordRepository.touch(target.session.id, {
          promptTemplateId,
          skillId
        });
        if (touched === null) {
          throw new Error(`Failed to update session context: ${target.session.id}`);
        }
        return;
      }
      case "asset-only":
        return;
    }
  }

  private describeTargetSummary(target: QuickContextAssetTargetResolution): string {
    switch (target.resolvedMode) {
      case "app-binding":
        return `App-level default context will attach to binding ${target.bindingId}.`;
      case "active-workspace":
        return `Active workspace ${target.targetId} will receive the new default prompt and skill.`;
      case "active-session":
        return `Active session ${target.targetId} will receive the new prompt and skill override.`;
      case "asset-only":
        return "Assets will be created without attaching to a live runtime target yet.";
    }
  }
}
