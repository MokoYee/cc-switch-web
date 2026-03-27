import type { ActiveContextState } from "@cc-switch-web/shared";

import type { SettingsRepository } from "../settings/settings-repository.js";
import type { WorkspaceContextService } from "./workspace-context-service.js";
import type { SessionRecordRepository } from "./session-record-repository.js";
import type { WorkspaceRepository } from "./workspace-repository.js";

export class ActiveContextService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly workspaceContextService: WorkspaceContextService
  ) {}

  getState(): ActiveContextState {
    const activeWorkspaceId = this.settingsRepository.getActiveWorkspaceId();
    const requestedSessionId = this.settingsRepository.getActiveSessionId();
    const sessionContext =
      requestedSessionId === null ? null : this.safeResolveActiveSession(requestedSessionId);

    if (requestedSessionId !== null && sessionContext === null) {
      this.settingsRepository.setActiveSessionId(null);
    }

    return {
      activeWorkspaceId,
      activeSessionId: sessionContext?.sessionId ?? null,
      workspaceContext:
        activeWorkspaceId === null ? null : this.safeResolveWorkspace(activeWorkspaceId),
      sessionContext
    };
  }

  activateWorkspace(workspaceId: string | null): ActiveContextState {
    if (
      workspaceId !== null &&
      !this.workspaceRepository.list().some((item) => item.id === workspaceId)
    ) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    this.settingsRepository.setActiveWorkspaceId(workspaceId);
    if (workspaceId === null) {
      this.settingsRepository.setActiveSessionId(null);
    }

    return this.getState();
  }

  activateSession(sessionId: string | null): ActiveContextState {
    if (sessionId !== null) {
      const session = this.sessionRecordRepository.findById(sessionId);
      if (session === null) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      if (session.status !== "active") {
        throw new Error(`Session is archived and cannot be activated: ${sessionId}`);
      }
    }

    this.settingsRepository.setActiveSessionId(sessionId);

    if (sessionId !== null) {
      const session = this.sessionRecordRepository.list().find((item) => item.id === sessionId) ?? null;
      this.settingsRepository.setActiveWorkspaceId(session?.workspaceId ?? null);
    }

    return this.getState();
  }

  private safeResolveWorkspace(workspaceId: string) {
    try {
      return this.workspaceContextService.resolveWorkspaceContext(workspaceId);
    } catch {
      return null;
    }
  }

  private safeResolveSession(sessionId: string) {
    try {
      return this.workspaceContextService.resolveSessionContext(sessionId);
    } catch {
      return null;
    }
  }

  private safeResolveActiveSession(sessionId: string) {
    const session = this.sessionRecordRepository.findActiveById(sessionId);
    if (session === null) {
      return null;
    }

    return this.safeResolveSession(session.id);
  }
}
