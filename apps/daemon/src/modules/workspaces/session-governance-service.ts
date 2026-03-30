import type { EffectiveAppContext, SessionArchiveResult, SessionGovernanceStatus } from "cc-switch-web-shared";

import type { SettingsRepository } from "../settings/settings-repository.js";
import type { SessionRecordRepository } from "./session-record-repository.js";

const toTimestamp = (value: string): number => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export class SessionGovernanceService {
  constructor(
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly settingsRepository: SettingsRepository,
    private readonly staleAfterMs: number
  ) {}

  getStatus(now = new Date()): SessionGovernanceStatus {
    const sessions = this.sessionRecordRepository.list();
    const staleSessionIds = this.collectStaleSessionIds(now, sessions);

    return {
      staleAfterMs: this.staleAfterMs,
      evaluatedAt: now.toISOString(),
      totalSessions: sessions.length,
      activeSessions: sessions.filter((item) => item.status === "active").length,
      archivedSessions: sessions.filter((item) => item.status === "archived").length,
      staleSessionIds,
      activeSessionId: this.settingsRepository.getActiveSessionId()
    };
  }

  archiveStaleSessions(now = new Date(), limit?: number): SessionArchiveResult {
    const staleSessionIds = this.collectStaleSessionIds(now, this.sessionRecordRepository.list());
    const targetIds =
      limit === undefined || limit < 0 ? staleSessionIds : staleSessionIds.slice(0, limit);
    return this.archiveSessions(targetIds, now);
  }

  archiveSession(sessionId: string, now = new Date()): SessionArchiveResult {
    return this.archiveSessions([sessionId], now);
  }

  refreshActivity(context: EffectiveAppContext): void {
    if (context.activeSessionId === null) {
      return;
    }

    this.sessionRecordRepository.touch(context.activeSessionId, {
      workspaceId: context.activeWorkspaceId,
      providerId: context.provider.id,
      promptTemplateId: context.promptTemplate.id,
      skillId: context.skill.id,
      status: "active"
    });
  }

  private archiveSessions(sessionIds: string[], now: Date): SessionArchiveResult {
    const archivedSessionIds: string[] = [];
    const alreadyArchivedSessionIds: string[] = [];
    const missingSessionIds: string[] = [];
    const evaluatedAt = now.toISOString();
    const currentActiveSessionId = this.settingsRepository.getActiveSessionId();
    let clearedActiveSessionId = false;

    for (const sessionId of sessionIds) {
      const existing = this.sessionRecordRepository.findById(sessionId);
      if (existing === null) {
        missingSessionIds.push(sessionId);
        continue;
      }

      if (existing.status === "archived") {
        alreadyArchivedSessionIds.push(sessionId);
        continue;
      }

      this.sessionRecordRepository.touch(sessionId, {
        status: "archived"
      });
      archivedSessionIds.push(sessionId);

      if (!clearedActiveSessionId && currentActiveSessionId === sessionId) {
        this.settingsRepository.setActiveSessionId(null);
        clearedActiveSessionId = true;
      }
    }

    return {
      archivedSessionIds,
      alreadyArchivedSessionIds,
      missingSessionIds,
      clearedActiveSessionId,
      evaluatedAt
    };
  }

  private collectStaleSessionIds(
    now: Date,
    sessions: ReturnType<SessionRecordRepository["list"]>
  ): string[] {
    const cutoff = now.getTime() - this.staleAfterMs;
    return sessions
      .filter((item) => item.status === "active" && toTimestamp(item.updatedAt) <= cutoff)
      .map((item) => item.id);
  }
}
