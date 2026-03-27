import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";

import type { AppCode, EffectiveAppContext, SessionRecord } from "@cc-switch-web/shared";

import type { SessionRecordRepository } from "./session-record-repository.js";
import type { WorkspaceDiscoveryService } from "./workspace-discovery-service.js";

const normalizePath = (input: string): string => resolve(input);

const buildSessionTitle = (cwd: string): string => basename(normalizePath(cwd)) || cwd;

export class SessionLifecycleService {
  constructor(
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly workspaceDiscoveryService: WorkspaceDiscoveryService
  ) {}

  ensureFromRequest(input: {
    readonly appCode: AppCode;
    readonly cwd: string | null;
    readonly effectiveContext: EffectiveAppContext;
  }): SessionRecord | null {
    const cwd = input.cwd?.trim() ?? "";
    if (cwd.length === 0) {
      return null;
    }

    const normalizedCwd = normalizePath(cwd);
    const currentSessionId = input.effectiveContext.activeSessionId;
    if (currentSessionId !== null) {
      return this.sessionRecordRepository.touch(currentSessionId, {
        cwd: normalizedCwd,
        workspaceId: input.effectiveContext.activeWorkspaceId,
        providerId: input.effectiveContext.provider.id,
        promptTemplateId: input.effectiveContext.promptTemplate.id,
        skillId: input.effectiveContext.skill.id,
        title: buildSessionTitle(normalizedCwd),
        status: "active"
      });
    }

    const association = this.workspaceDiscoveryService.resolveAssociationByCwd({
      appCode: input.appCode,
      cwd: normalizedCwd
    });

    if (association.sessionId !== null) {
      const resolvedWorkspace =
        association.workspaceId !== null
          ? association.workspaceId
          : this.workspaceDiscoveryService.ensureWorkspaceForCwd({
              appCode: input.appCode,
              cwd: normalizedCwd
            })?.id ?? null;

      return this.sessionRecordRepository.touch(association.sessionId, {
        cwd: normalizedCwd,
        workspaceId: resolvedWorkspace,
        providerId: input.effectiveContext.provider.id,
        promptTemplateId: input.effectiveContext.promptTemplate.id,
        skillId: input.effectiveContext.skill.id,
        title: buildSessionTitle(normalizedCwd),
        status: "active"
      });
    }

    const workspace = this.workspaceDiscoveryService.ensureWorkspaceForCwd({
      appCode: input.appCode,
      cwd: normalizedCwd
    });

    if (workspace === null) {
      return null;
    }

    const mergeTarget = this.findWorkspaceMergeTarget({
      appCode: input.appCode,
      workspaceId: workspace.id
    });
    if (mergeTarget !== null) {
      return this.sessionRecordRepository.touch(mergeTarget.id, {
        cwd: normalizedCwd,
        workspaceId: workspace.id,
        providerId: input.effectiveContext.provider.id,
        promptTemplateId: input.effectiveContext.promptTemplate.id,
        skillId: input.effectiveContext.skill.id,
        title: buildSessionTitle(normalizedCwd),
        status: "active"
      });
    }

    return this.sessionRecordRepository.upsert({
      id: `session-${randomUUID()}`,
      workspaceId: workspace.id,
      appCode: input.appCode,
      title: buildSessionTitle(normalizedCwd),
      cwd: normalizedCwd,
      providerId: input.effectiveContext.provider.id,
      promptTemplateId: input.effectiveContext.promptTemplate.id,
      skillId: input.effectiveContext.skill.id,
      status: "active",
      startedAt: new Date().toISOString()
    });
  }

  ensureFromManual(input: {
    readonly appCode: AppCode;
    readonly cwd: string;
    readonly title?: string;
  }): {
    readonly session: SessionRecord;
    readonly workspace: NonNullable<ReturnType<WorkspaceDiscoveryService["ensureWorkspaceForCwd"]>>;
    readonly matchedBy: "session" | "workspace" | "new-workspace";
    readonly createdWorkspace: boolean;
    readonly createdSession: boolean;
  } {
    const normalizedCwd = normalizePath(input.cwd);
    const associationBeforeEnsure = this.workspaceDiscoveryService.resolveAssociationByCwd({
      appCode: input.appCode,
      cwd: normalizedCwd
    });
    const existingWorkspace = this.workspaceDiscoveryService.ensureWorkspaceForCwd({
      appCode: input.appCode,
      cwd: normalizedCwd
    });

    if (existingWorkspace === null) {
      throw new Error(`Unable to determine workspace for cwd: ${normalizedCwd}`);
    }

    const association = this.workspaceDiscoveryService.resolveAssociationByCwd({
      appCode: input.appCode,
      cwd: normalizedCwd
    });
    const title = input.title?.trim().length ? input.title.trim() : buildSessionTitle(normalizedCwd);
    const createdWorkspace = associationBeforeEnsure.workspaceId === null;

    if (association.sessionId !== null) {
      const session = this.sessionRecordRepository.touch(association.sessionId, {
        cwd: normalizedCwd,
        workspaceId: existingWorkspace.id,
        title,
        status: "active"
      });

      if (session === null) {
        throw new Error(`Failed to update session: ${association.sessionId}`);
      }

      return {
        session,
        workspace: existingWorkspace,
        matchedBy: "session",
        createdWorkspace,
        createdSession: false
      };
    }

    const mergeTarget = this.findWorkspaceMergeTarget({
      appCode: input.appCode,
      workspaceId: existingWorkspace.id
    });
    if (mergeTarget !== null) {
      const session = this.sessionRecordRepository.touch(mergeTarget.id, {
        cwd: normalizedCwd,
        workspaceId: existingWorkspace.id,
        title,
        status: "active"
      });

      if (session === null) {
        throw new Error(`Failed to update session: ${mergeTarget.id}`);
      }

      return {
        session,
        workspace: existingWorkspace,
        matchedBy: "workspace",
        createdWorkspace,
        createdSession: false
      };
    }

    const session = this.sessionRecordRepository.upsert({
      id: `session-${randomUUID()}`,
      workspaceId: existingWorkspace.id,
      appCode: input.appCode,
      title,
      cwd: normalizedCwd,
      providerId: null,
      promptTemplateId: null,
      skillId: null,
      status: "active",
      startedAt: new Date().toISOString()
    });

    return {
      session,
      workspace: existingWorkspace,
      matchedBy: association.workspaceId !== null ? "workspace" : "new-workspace",
      createdWorkspace,
      createdSession: true
    };
  }

  private findWorkspaceMergeTarget(input: {
    readonly appCode: AppCode;
    readonly workspaceId: string;
  }): SessionRecord | null {
    const candidates = this.sessionRecordRepository
      .list()
      .filter(
        (item) =>
          item.status === "active" &&
          item.appCode === input.appCode &&
          item.workspaceId === input.workspaceId
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return candidates.length === 1 ? candidates[0] ?? null : null;
  }
}
