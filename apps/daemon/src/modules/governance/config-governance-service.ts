import type {
  AppCode,
  ConfigDeletePreview,
  AppQuotaSavePreview,
  AppQuotaUpsert,
  ConfigImpactPreview,
  ConfigImportPreview,
  ConfigRestorePreview,
  ConfigSnapshotDiff,
  ExportPackage,
  PromptTemplateSavePreview,
  PromptTemplateUpsert,
  ProxyPolicy,
  ProxyPolicySavePreview,
  SessionRecordUpsert,
  SessionSavePreview,
  SkillSavePreview,
  SkillUpsert,
  WorkspaceSavePreview,
  WorkspaceUpsert
} from "@cc-switch-web/shared";
import { exportPackageSchema } from "@cc-switch-web/shared";

import type { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import type { SkillRepository } from "../assets/skill-repository.js";
import type { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import type { BindingRepository } from "../bindings/binding-repository.js";
import type { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import type { WorkspaceRepository } from "../workspaces/workspace-repository.js";
import type { ProviderRepository } from "../providers/provider-repository.js";
import type { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import type { AppMcpBindingRepository } from "../mcp/app-mcp-binding-repository.js";
import type { McpServerRepository } from "../mcp/mcp-server-repository.js";

export class ConfigGovernanceService {
  constructor(
    private readonly promptTemplateRepository: PromptTemplateRepository,
    private readonly skillRepository: SkillRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly appQuotaRepository: AppQuotaRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly providerRepository: ProviderRepository,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly mcpServerRepository: McpServerRepository,
    private readonly appMcpBindingRepository: AppMcpBindingRepository
  ) {}

  previewPromptTemplateUpsert(input: PromptTemplateUpsert): PromptTemplateSavePreview {
    const exists = this.promptTemplateRepository.exists(input.id);
    const linkedSkills = this.skillRepository.list().filter((item) => item.promptTemplateId === input.id);
    const referencedBindings = this.bindingRepository
      .list()
      .filter((item) => (item.promptTemplateId ?? null) === input.id);
    const referencedBySkillIds = linkedSkills.map((item) => item.id);
    const referencedSkillIds = new Set(referencedBySkillIds);
    const usedByWorkspaceIds = this.workspaceRepository
      .list()
      .filter((item) => item.defaultPromptTemplateId === input.id || (item.defaultSkillId !== null && referencedSkillIds.has(item.defaultSkillId)))
      .map((item) => item.id);
    const usedBySessionIds = this.sessionRecordRepository
      .list()
      .filter((item) => item.promptTemplateId === input.id || (item.skillId !== null && referencedSkillIds.has(item.skillId)))
      .map((item) => item.id);
    const affectedAppCodes = Array.from(
      new Set(
        [
          ...(input.appCode === null ? [] : [input.appCode]),
          ...referencedBindings.map((item) => item.appCode),
          ...linkedSkills.flatMap((item) => (item.appCode === null ? [] : [item.appCode])),
          ...this.workspaceRepository
            .list()
            .filter((item) => usedByWorkspaceIds.includes(item.id))
            .flatMap((item) => (item.appCode === null ? [] : [item.appCode])),
          ...this.sessionRecordRepository
            .list()
            .filter((item) => usedBySessionIds.includes(item.id))
            .map((item) => item.appCode)
        ]
      )
    ).sort();
    const warnings: string[] = [];

    if (!input.enabled && referencedBySkillIds.length > 0) {
      warnings.push(`Disabling prompt template ${input.id} will affect linked skills: ${referencedBySkillIds.join(", ")}`);
    }
    if (!input.enabled && referencedBindings.length > 0) {
      warnings.push(`Prompt template ${input.id} is still attached to app defaults: ${referencedBindings.map((item) => item.id).join(", ")}`);
    }
    if (!input.enabled && usedByWorkspaceIds.length > 0) {
      warnings.push(`Prompt template ${input.id} is still inherited by workspace defaults: ${usedByWorkspaceIds.join(", ")}`);
    }
    if (!input.enabled && usedBySessionIds.length > 0) {
      warnings.push(`Prompt template ${input.id} is still used by sessions: ${usedBySessionIds.join(", ")}`);
    }

    return {
      promptTemplateId: input.id,
      exists,
      referencedBySkillIds,
      usedByWorkspaceIds,
      usedBySessionIds,
      warnings,
      impact: this.buildImpact({
        summary: [
          referencedBySkillIds.length > 0
            ? `Linked skills will observe prompt changes: ${referencedBySkillIds.join(", ")}`
            : `Prompt template ${input.id} is currently standalone.`,
          referencedBindings.length > 0
            ? `App defaults currently inherit this prompt chain: ${referencedBindings.map((item) => item.id).join(", ")}`
            : `No app-level default currently inherits ${input.id}.`,
          usedByWorkspaceIds.length > 0
            ? `Workspace defaults currently inherit this prompt chain: ${usedByWorkspaceIds.join(", ")}`
            : `No workspace default currently inherits ${input.id}.`,
          usedBySessionIds.length > 0
            ? `Sessions currently resolve to this prompt chain: ${usedBySessionIds.join(", ")}`
            : `No session currently resolves to ${input.id}.`
        ],
        affectedAppCodes,
        riskLevel: warnings.length > 0 ? "high" : referencedBySkillIds.length > 0 ? "medium" : "low"
      })
    };
  }

  previewSkillUpsert(input: SkillUpsert): SkillSavePreview {
    const exists = this.skillRepository.list().some((item) => item.id === input.id);
    const promptTemplateExists =
      input.promptTemplateId === null ? true : this.promptTemplateRepository.exists(input.promptTemplateId);
    const referencedBindings = this.bindingRepository
      .list()
      .filter((item) => (item.skillId ?? null) === input.id);
    const usedByWorkspaceIds = this.workspaceRepository
      .list()
      .filter((item) => item.defaultSkillId === input.id)
      .map((item) => item.id);
    const usedBySessionIds = this.sessionRecordRepository
      .list()
      .filter((item) => item.skillId === input.id)
      .map((item) => item.id);
    const warnings: string[] = [];

    if (!promptTemplateExists) {
      warnings.push(`Referenced prompt template does not exist: ${input.promptTemplateId}`);
    }
    if (!input.enabled && referencedBindings.length > 0) {
      warnings.push(`Disabling skill ${input.id} will affect app defaults: ${referencedBindings.map((item) => item.id).join(", ")}`);
    }
    if (!input.enabled && (usedByWorkspaceIds.length > 0 || usedBySessionIds.length > 0)) {
      warnings.push(`Disabling skill ${input.id} will affect linked workspaces or sessions.`);
    }

    return {
      skillId: input.id,
      exists,
      promptTemplateExists,
      usedByWorkspaceIds,
      usedBySessionIds,
      warnings,
      impact: this.buildImpact({
        summary: [
          referencedBindings.length > 0
            ? `App defaults reference this skill: ${referencedBindings.map((item) => item.id).join(", ")}`
            : `No app-level default currently references ${input.id}.`,
          usedByWorkspaceIds.length > 0
            ? `Workspace defaults reference this skill: ${usedByWorkspaceIds.join(", ")}`
            : `No workspace default currently references ${input.id}.`,
          usedBySessionIds.length > 0
            ? `Sessions reference this skill: ${usedBySessionIds.join(", ")}`
            : `No session currently references ${input.id}.`
        ],
        affectedAppCodes: Array.from(
          new Set([
            ...(input.appCode === null ? [] : [input.appCode]),
            ...referencedBindings.map((item) => item.appCode)
          ])
        ),
        riskLevel: !promptTemplateExists || warnings.length > 0 ? "high" : "low"
      })
    };
  }

  previewWorkspaceUpsert(input: WorkspaceUpsert): WorkspaceSavePreview {
    const exists = this.workspaceRepository.list().some((item) => item.id === input.id);
    const sessionCount = this.sessionRecordRepository.countByWorkspaceId(input.id);
    const warnings: string[] = [];

    if (input.defaultProviderId !== null && !this.providerRepository.exists(input.defaultProviderId)) {
      warnings.push(`Default provider does not exist: ${input.defaultProviderId}`);
    }
    if (input.defaultPromptTemplateId !== null && !this.promptTemplateRepository.exists(input.defaultPromptTemplateId)) {
      warnings.push(`Default prompt template does not exist: ${input.defaultPromptTemplateId}`);
    }
    if (input.defaultSkillId !== null && !this.skillRepository.list().some((item) => item.id === input.defaultSkillId)) {
      warnings.push(`Default skill does not exist: ${input.defaultSkillId}`);
    }
    if (!input.enabled && sessionCount > 0) {
      warnings.push(`Disabling workspace ${input.id} may orphan ${sessionCount} linked session(s).`);
    }

    return {
      workspaceId: input.id,
      exists,
      sessionCount,
      warnings,
      impact: this.buildImpact({
        summary: [
          sessionCount > 0
            ? `Linked session count: ${sessionCount}`
            : `Workspace ${input.id} currently has no linked sessions.`
        ],
        affectedAppCodes: input.appCode === null ? [] : [input.appCode],
        riskLevel: warnings.length > 0 ? "high" : "low"
      })
    };
  }

  previewSessionUpsert(input: SessionRecordUpsert): SessionSavePreview {
    const exists = this.sessionRecordRepository.findById(input.id) !== null;
    const workspaceExists =
      input.workspaceId === null
        ? true
        : this.workspaceRepository.list().some((item) => item.id === input.workspaceId);
    const warnings: string[] = [];

    if (!workspaceExists) {
      warnings.push(`Workspace does not exist: ${input.workspaceId}`);
    }
    if (input.providerId !== null && !this.providerRepository.exists(input.providerId)) {
      warnings.push(`Provider does not exist: ${input.providerId}`);
    }
    if (input.promptTemplateId !== null && !this.promptTemplateRepository.exists(input.promptTemplateId)) {
      warnings.push(`Prompt template does not exist: ${input.promptTemplateId}`);
    }
    if (input.skillId !== null && !this.skillRepository.list().some((item) => item.id === input.skillId)) {
      warnings.push(`Skill does not exist: ${input.skillId}`);
    }

    return {
      sessionId: input.id,
      exists,
      workspaceExists,
      warnings,
      impact: this.buildImpact({
        summary: [
          input.workspaceId !== null
            ? `Session will attach to workspace ${input.workspaceId}.`
            : "Session will remain standalone without workspace linkage."
        ],
        affectedAppCodes: [input.appCode],
        riskLevel: warnings.length > 0 ? "high" : "low"
      })
    };
  }

  previewAppQuotaUpsert(input: AppQuotaUpsert): AppQuotaSavePreview {
    const exists = this.appQuotaRepository.list().some((item) => item.id === input.id);
    const warnings: string[] = [];

    if (input.enabled && input.maxRequests === null && input.maxTokens === null) {
      warnings.push(`Quota ${input.id} is enabled but no request or token limit is configured.`);
    }

    return {
      quotaId: input.id,
      exists,
      appCode: input.appCode,
      warnings,
      impact: this.buildImpact({
        summary: [`Quota policy for ${input.appCode} will affect subsequent request admission decisions.`],
        affectedAppCodes: [input.appCode],
        riskLevel: warnings.length > 0 ? "medium" : "low"
      })
    };
  }

  previewProxyPolicyUpdate(input: ProxyPolicy): ProxyPolicySavePreview {
    const boundApps = Array.from(new Set(this.bindingRepository.list().map((item) => item.appCode))).sort();
    const warnings: string[] = [];

    if (!input.enabled && boundApps.length > 0) {
      warnings.push(`Disabling proxy policy will stop managed ingress for: ${boundApps.join(", ")}`);
    }
    if (input.listenHost !== "127.0.0.1") {
      warnings.push(`Proxy listen host is no longer loopback-only: ${input.listenHost}`);
    }

    return {
      warnings,
      impact: {
        summary: [
          `Proxy listener will switch to ${input.listenHost}:${input.listenPort}.`,
          "Saving proxy policy reloads the daemon-side proxy runtime."
        ],
        affectedAppCodes: boundApps as AppCode[],
        requiresSnapshot: true,
        requiresProxyReload: true,
        touchesRouting: boundApps.length > 0,
        touchesHostManagedMcp: false,
        riskLevel: warnings.length > 0 ? "high" : "medium"
      }
    };
  }

  previewDelete(targetType: ConfigDeletePreview["targetType"], targetId: string): ConfigDeletePreview {
    const blockers: string[] = [];
    const warnings: string[] = [];
    let affectedAppCodes: AppCode[] = [];
    let exists = true;

    switch (targetType) {
      case "provider": {
        const bindings = this.bindingRepository.list().filter((item) => item.providerId === targetId);
        const chains = this.failoverChainRepository.list().filter((item) => item.providerIds.includes(targetId));
        exists = this.providerRepository.exists(targetId);
        blockers.push(...bindings.map((item) => `Referenced by binding ${item.id}`));
        blockers.push(...chains.map((item) => `Referenced by failover chain ${item.id}`));
        affectedAppCodes = Array.from(new Set([...bindings.map((item) => item.appCode), ...chains.map((item) => item.appCode)]));
        break;
      }
      case "binding": {
        const binding = this.bindingRepository.list().find((item) => item.id === targetId) ?? null;
        exists = binding !== null;
        affectedAppCodes = binding === null ? [] : [binding.appCode];
        warnings.push("Deleting a binding will remove the primary routing target for this app.");
        break;
      }
      case "app-quota": {
        const quota = this.appQuotaRepository.list().find((item) => item.id === targetId) ?? null;
        exists = quota !== null;
        affectedAppCodes = quota === null ? [] : [quota.appCode];
        break;
      }
      case "failover-chain": {
        const chain = this.failoverChainRepository.list().find((item) => item.id === targetId) ?? null;
        exists = chain !== null;
        affectedAppCodes = chain === null ? [] : [chain.appCode];
        warnings.push("Deleting a failover chain reduces retry coverage for the app.");
        break;
      }
      case "prompt-template": {
        exists = this.promptTemplateRepository.exists(targetId);
        const skills = this.skillRepository.list().filter((item) => item.promptTemplateId === targetId);
        const bindings = this.bindingRepository
          .list()
          .filter((item) => (item.promptTemplateId ?? null) === targetId);
        const workspaces = this.workspaceRepository
          .list()
          .filter((item) => item.defaultPromptTemplateId === targetId);
        const sessions = this.sessionRecordRepository
          .list()
          .filter((item) => item.promptTemplateId === targetId);
        blockers.push(...skills.map((item) => `Referenced by skill ${item.id}`));
        blockers.push(...bindings.map((item) => `Referenced by binding ${item.id}`));
        blockers.push(...workspaces.map((item) => `Referenced by workspace ${item.id}`));
        blockers.push(...sessions.map((item) => `Referenced by session ${item.id}`));
        affectedAppCodes = Array.from(new Set([
          ...skills.map((item) => item.appCode).filter((item): item is AppCode => item !== null),
          ...bindings.map((item) => item.appCode),
          ...workspaces.map((item) => item.appCode).filter((item): item is AppCode => item !== null),
          ...sessions.map((item) => item.appCode)
        ]));
        break;
      }
      case "skill": {
        exists = this.skillRepository.list().some((item) => item.id === targetId);
        const bindings = this.bindingRepository
          .list()
          .filter((item) => (item.skillId ?? null) === targetId);
        const workspaces = this.workspaceRepository.list().filter((item) => item.defaultSkillId === targetId);
        const sessions = this.sessionRecordRepository.list().filter((item) => item.skillId === targetId);
        blockers.push(...bindings.map((item) => `Referenced by binding ${item.id}`));
        blockers.push(...workspaces.map((item) => `Referenced by workspace ${item.id}`));
        blockers.push(...sessions.map((item) => `Referenced by session ${item.id}`));
        affectedAppCodes = Array.from(new Set([
          ...bindings.map((item) => item.appCode),
          ...workspaces.map((item) => item.appCode).filter((item): item is AppCode => item !== null),
          ...sessions.map((item) => item.appCode)
        ]));
        break;
      }
      case "workspace": {
        exists = this.workspaceRepository.list().some((item) => item.id === targetId);
        const sessionCount = this.sessionRecordRepository.countByWorkspaceId(targetId);
        if (sessionCount > 0) {
          blockers.push(`Referenced by ${sessionCount} session(s)`);
        }
        affectedAppCodes = Array.from(new Set(this.sessionRecordRepository.list().filter((item) => item.workspaceId === targetId).map((item) => item.appCode)));
        break;
      }
      case "session": {
        const session = this.sessionRecordRepository.findById(targetId);
        exists = session !== null;
        affectedAppCodes = session === null ? [] : [session.appCode];
        break;
      }
      case "mcp-server": {
        exists = this.mcpServerRepository.exists(targetId);
        const bindings = this.appMcpBindingRepository.list().filter((item) => item.serverId === targetId);
        blockers.push(...bindings.map((item) => `Referenced by MCP binding ${item.id}`));
        affectedAppCodes = Array.from(new Set(bindings.map((item) => item.appCode)));
        break;
      }
      case "mcp-app-binding": {
        const binding = this.appMcpBindingRepository.list().find((item) => item.id === targetId) ?? null;
        exists = binding !== null;
        affectedAppCodes = binding === null ? [] : [binding.appCode];
        break;
      }
    }

    return {
      targetType,
      targetId,
      exists,
      warnings,
      blockers,
      impact: {
        summary: blockers.length > 0 ? blockers : warnings.length > 0 ? warnings : [`Deleting ${targetType} ${targetId} has no current references.`],
        affectedAppCodes,
        requiresSnapshot: true,
        requiresProxyReload: targetType === "provider" || targetType === "binding" || targetType === "failover-chain",
        touchesRouting: targetType === "provider" || targetType === "binding" || targetType === "failover-chain",
        touchesHostManagedMcp: targetType === "mcp-server" || targetType === "mcp-app-binding",
        riskLevel: blockers.length > 0 ? "high" : warnings.length > 0 ? "medium" : "low"
      }
    };
  }

  previewImportPackage(input: unknown): ConfigImportPreview {
    const payload = exportPackageSchema.parse(input);
    const routingApps = new Set(payload.bindings.map((item) => item.appCode));
    const warnings: string[] = [];

    if (payload.proxyPolicy.listenHost !== "127.0.0.1") {
      warnings.push(`Imported proxy host is not loopback-only: ${payload.proxyPolicy.listenHost}`);
    }
    if (payload.bindings.length === 0) {
      warnings.push("Imported package contains no app bindings.");
    }

    return {
      warnings,
      counts: {
        providers: payload.providers.length,
        promptTemplates: payload.promptTemplates.length,
        skills: payload.skills.length,
        workspaces: payload.workspaces.length,
        sessionRecords: payload.sessionRecords.length,
        bindings: payload.bindings.length,
        appQuotas: payload.appQuotas.length,
        failoverChains: payload.failoverChains.length,
        mcpServers: payload.mcpServers.length,
        appMcpBindings: payload.appMcpBindings.length
      },
      impact: {
        summary: [
          "Import will replace the current persisted configuration snapshot.",
          "Proxy/runtime-related objects will be reloaded from the imported payload."
        ],
        affectedAppCodes: Array.from(routingApps),
        requiresSnapshot: true,
        requiresProxyReload: payload.bindings.length > 0 || payload.failoverChains.length > 0,
        touchesRouting: payload.bindings.length > 0 || payload.failoverChains.length > 0,
        touchesHostManagedMcp: payload.appMcpBindings.length > 0 || payload.mcpServers.length > 0,
        riskLevel: warnings.length > 0 ? "high" : "medium"
      }
    };
  }

  previewRestore(targetVersion: number, currentVersion: number | null, diff: ConfigSnapshotDiff): ConfigRestorePreview {
    const warnings: string[] = [];

    if (diff.summary.totalChanged > 0 || diff.summary.totalRemoved > 0 || diff.summary.totalAdded > 0) {
      warnings.push("Restore will overwrite current persisted objects with the selected snapshot state.");
    }
    if (diff.bindings.changed.length > 0 || diff.bindings.removed.length > 0 || diff.bindings.added.length > 0) {
      warnings.push("Restore includes routing binding changes.");
    }

    const affectedAppCodes = Array.from(
      new Set([
        ...this.bindingRepository.list().map((item) => item.appCode),
        ...this.failoverChainRepository.list().map((item) => item.appCode),
        ...this.appMcpBindingRepository.list().map((item) => item.appCode)
      ])
    );

    return {
      targetVersion,
      currentVersion,
      warnings,
      diff,
      impact: {
        summary: [
          `Restore target version: v${targetVersion}`,
          "Restore creates a new snapshot after applying the selected historical state."
        ],
        affectedAppCodes,
        requiresSnapshot: true,
        requiresProxyReload: true,
        touchesRouting: true,
        touchesHostManagedMcp: diff.mcpServers.added.length + diff.mcpServers.changed.length + diff.mcpServers.removed.length > 0,
        riskLevel: warnings.length > 1 ? "high" : "medium"
      }
    };
  }

  private buildImpact(input: {
    summary: string[];
    affectedAppCodes: AppCode[];
    riskLevel: ConfigImpactPreview["riskLevel"];
  }): ConfigImpactPreview {
    return {
      summary: input.summary,
      affectedAppCodes: input.affectedAppCodes,
      requiresSnapshot: true,
      requiresProxyReload: false,
      touchesRouting: false,
      touchesHostManagedMcp: false,
      riskLevel: input.riskLevel
    };
  }
}
