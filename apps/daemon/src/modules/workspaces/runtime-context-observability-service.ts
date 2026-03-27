import type {
  ContextFailureBreakdown,
  ContextModelBreakdown,
  ContextProviderBreakdown,
  ContextTimelineEvent,
  RuntimeContextOverview,
  SessionRuntimeDetail,
  SessionRuntimeSummary,
  WorkspaceRuntimeDetail,
  WorkspaceRuntimeSummary
} from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";
import type { ActiveContextService } from "./active-context-service.js";
import type { SessionGovernanceService } from "./session-governance-service.js";
import type { WorkspaceContextService } from "./workspace-context-service.js";
import type { QuotaEventRepository } from "../quotas/quota-event-repository.js";
import type { SessionRecordRepository } from "./session-record-repository.js";
import type { WorkspaceRepository } from "./workspace-repository.js";

export class RuntimeContextObservabilityService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly workspaceContextService: WorkspaceContextService,
    private readonly activeContextService: ActiveContextService,
    private readonly sessionGovernanceService: SessionGovernanceService,
    private readonly quotaEventRepository: QuotaEventRepository
  ) {}

  getOverview(): RuntimeContextOverview {
    return {
      workspaces: this.listWorkspaceSummaries(),
      sessions: this.listSessionSummaries()
    };
  }

  getWorkspaceDetail(workspaceId: string): WorkspaceRuntimeDetail {
    const summary = this.listWorkspaceSummaries().find((item) => item.workspaceId === workspaceId);
    if (summary === undefined) {
      throw new Error(`Workspace runtime summary not found: ${workspaceId}`);
    }
    const activeState = this.activeContextService.getState();

    return {
      summary,
      resolvedContext: this.workspaceContextService.resolveWorkspaceContext(workspaceId),
      isActive: activeState.activeWorkspaceId === workspaceId,
      providerBreakdown: this.listProviderBreakdown("workspace_id", workspaceId),
      failureBreakdown: this.listFailureBreakdown("workspace_id", workspaceId),
      modelBreakdown: this.listModelBreakdown("workspace_id", workspaceId),
      recentRequestLogs: this.listRecentRequestLogs("workspace_id", workspaceId),
      timeline: this.listTimeline("workspace_id", workspaceId, summary.appCode)
    };
  }

  getSessionDetail(sessionId: string): SessionRuntimeDetail {
    const summary = this.listSessionSummaries().find((item) => item.sessionId === sessionId);
    if (summary === undefined) {
      throw new Error(`Session runtime summary not found: ${sessionId}`);
    }
    const activeState = this.activeContextService.getState();
    const governanceState = this.sessionGovernanceService.getStatus();

    return {
      summary,
      resolvedContext: this.workspaceContextService.resolveSessionContext(sessionId),
      isActive: activeState.activeSessionId === sessionId,
      isStale: governanceState.staleSessionIds.includes(sessionId),
      providerBreakdown: this.listProviderBreakdown("session_id", sessionId),
      failureBreakdown: this.listFailureBreakdown("session_id", sessionId),
      modelBreakdown: this.listModelBreakdown("session_id", sessionId),
      recentRequestLogs: this.listRecentRequestLogs("session_id", sessionId),
      timeline: this.listTimeline("session_id", sessionId, summary.appCode)
    };
  }

  private listWorkspaceSummaries(): WorkspaceRuntimeSummary[] {
    const aggregateRows = this.database
      .prepare(`
        SELECT
          workspace_id,
          COUNT(*) AS request_count,
          SUM(CASE WHEN outcome <> 'success' THEN 1 ELSE 0 END) AS error_count,
          MAX(created_at) AS last_request_at,
          MAX(id) AS last_request_id
        FROM proxy_request_logs
        WHERE workspace_id IS NOT NULL
        GROUP BY workspace_id
      `)
      .all() as Array<{
        workspace_id: string;
        request_count: number;
        error_count: number;
        last_request_at: string | null;
        last_request_id: number | null;
      }>;
    const aggregateByWorkspace = new Map(aggregateRows.map((row) => [row.workspace_id, row]));

    const tokensRows = this.database
      .prepare(`
        SELECT l.workspace_id, COALESCE(SUM(u.total_tokens), 0) AS total_tokens
        FROM proxy_request_logs l
        LEFT JOIN usage_records u ON u.request_log_id = l.id
        WHERE l.workspace_id IS NOT NULL
        GROUP BY l.workspace_id
      `)
      .all() as Array<{
        workspace_id: string;
        total_tokens: number;
      }>;
    const tokensByWorkspace = new Map(tokensRows.map((row) => [row.workspace_id, row.total_tokens]));

    const lastProviderRows = this.database
      .prepare(`
        SELECT workspace_id, provider_id
        FROM proxy_request_logs
        WHERE workspace_id IS NOT NULL
        ORDER BY id DESC
      `)
      .all() as Array<{
        workspace_id: string;
        provider_id: string | null;
      }>;
    const lastProviderByWorkspace = new Map<string, string | null>();
    for (const row of lastProviderRows) {
      if (!lastProviderByWorkspace.has(row.workspace_id)) {
        lastProviderByWorkspace.set(row.workspace_id, row.provider_id);
      }
    }

    return this.workspaceRepository.list().map((workspace) => ({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      rootPath: workspace.rootPath,
      appCode: workspace.appCode,
      sessionCount: this.sessionRecordRepository.countByWorkspaceId(workspace.id),
      requestCount: aggregateByWorkspace.get(workspace.id)?.request_count ?? 0,
      errorCount: aggregateByWorkspace.get(workspace.id)?.error_count ?? 0,
      totalTokens: tokensByWorkspace.get(workspace.id) ?? 0,
      lastRequestAt: aggregateByWorkspace.get(workspace.id)?.last_request_at ?? null,
      lastProviderId: lastProviderByWorkspace.get(workspace.id) ?? null
    }));
  }

  private listSessionSummaries(): SessionRuntimeSummary[] {
    const aggregateRows = this.database
      .prepare(`
        SELECT
          session_id,
          COUNT(*) AS request_count,
          SUM(CASE WHEN outcome <> 'success' THEN 1 ELSE 0 END) AS error_count,
          MAX(created_at) AS last_request_at
        FROM proxy_request_logs
        WHERE session_id IS NOT NULL
        GROUP BY session_id
      `)
      .all() as Array<{
        session_id: string;
        request_count: number;
        error_count: number;
        last_request_at: string | null;
      }>;
    const aggregateBySession = new Map(aggregateRows.map((row) => [row.session_id, row]));

    const tokensRows = this.database
      .prepare(`
        SELECT l.session_id, COALESCE(SUM(u.total_tokens), 0) AS total_tokens
        FROM proxy_request_logs l
        LEFT JOIN usage_records u ON u.request_log_id = l.id
        WHERE l.session_id IS NOT NULL
        GROUP BY l.session_id
      `)
      .all() as Array<{
        session_id: string;
        total_tokens: number;
      }>;
    const tokensBySession = new Map(tokensRows.map((row) => [row.session_id, row.total_tokens]));

    const lastProviderRows = this.database
      .prepare(`
        SELECT session_id, provider_id
        FROM proxy_request_logs
        WHERE session_id IS NOT NULL
        ORDER BY id DESC
      `)
      .all() as Array<{
        session_id: string;
        provider_id: string | null;
      }>;
    const lastProviderBySession = new Map<string, string | null>();
    for (const row of lastProviderRows) {
      if (!lastProviderBySession.has(row.session_id)) {
        lastProviderBySession.set(row.session_id, row.provider_id);
      }
    }

    return this.sessionRecordRepository.list().map((session) => ({
      sessionId: session.id,
      title: session.title,
      cwd: session.cwd,
      workspaceId: session.workspaceId,
      appCode: session.appCode,
      status: session.status,
      requestCount: aggregateBySession.get(session.id)?.request_count ?? 0,
      errorCount: aggregateBySession.get(session.id)?.error_count ?? 0,
      totalTokens: tokensBySession.get(session.id) ?? 0,
      lastRequestAt: aggregateBySession.get(session.id)?.last_request_at ?? null,
      lastProviderId: lastProviderBySession.get(session.id) ?? null
    }));
  }

  private listProviderBreakdown(
    dimension: "workspace_id" | "session_id",
    identifier: string
  ): ContextProviderBreakdown[] {
    const rows = this.database
      .prepare(`
        SELECT
          l.provider_id,
          COUNT(*) AS request_count,
          SUM(CASE WHEN l.outcome <> 'success' THEN 1 ELSE 0 END) AS error_count,
          COALESCE(SUM(u.total_tokens), 0) AS total_tokens,
          MAX(l.created_at) AS last_request_at
        FROM proxy_request_logs l
        LEFT JOIN usage_records u ON u.request_log_id = l.id
        WHERE l.${dimension} = ?
        GROUP BY l.provider_id
        ORDER BY request_count DESC, total_tokens DESC, l.provider_id ASC
      `)
      .all(identifier) as Array<{
        provider_id: string | null;
        request_count: number;
        error_count: number;
        total_tokens: number;
        last_request_at: string | null;
      }>;

    return rows.map((row) => ({
      providerId: row.provider_id,
      requestCount: row.request_count,
      errorCount: row.error_count,
      totalTokens: row.total_tokens,
      lastRequestAt: row.last_request_at
    }));
  }

  private listFailureBreakdown(
    dimension: "workspace_id" | "session_id",
    identifier: string
  ): ContextFailureBreakdown[] {
    const rows = this.database
      .prepare(`
        SELECT outcome AS label, COUNT(*) AS count, MAX(created_at) AS last_seen_at
        FROM proxy_request_logs
        WHERE ${dimension} = ? AND outcome <> 'success'
        GROUP BY outcome
        ORDER BY count DESC, label ASC
      `)
      .all(identifier) as Array<{
        label: string;
        count: number;
        last_seen_at: string | null;
      }>;

    return rows.map((row) => ({
      label: row.label,
      count: row.count,
      lastSeenAt: row.last_seen_at
    }));
  }

  private listModelBreakdown(
    dimension: "workspace_id" | "session_id",
    identifier: string
  ): ContextModelBreakdown[] {
    const rows = this.database
      .prepare(`
        SELECT
          u.model,
          COUNT(*) AS request_count,
          COALESCE(SUM(u.total_tokens), 0) AS total_tokens
        FROM proxy_request_logs l
        INNER JOIN usage_records u ON u.request_log_id = l.id
        WHERE l.${dimension} = ?
        GROUP BY u.model
        ORDER BY total_tokens DESC, request_count DESC, u.model ASC
      `)
      .all(identifier) as Array<{
        model: string;
        request_count: number;
        total_tokens: number;
      }>;

    return rows.map((row) => ({
      model: row.model,
      requestCount: row.request_count,
      totalTokens: row.total_tokens
    }));
  }

  private listRecentRequestLogs(
    dimension: "workspace_id" | "session_id",
    identifier: string
  ): WorkspaceRuntimeDetail["recentRequestLogs"] {
    const rows = this.database
      .prepare(`
        SELECT
          id, app_code, provider_id, workspace_id, session_id, context_source, prompt_template_id, skill_id,
          target_url, method, path, status_code, latency_ms, outcome, decision_reason, next_provider_id, error_message, created_at
        FROM proxy_request_logs
        WHERE ${dimension} = ?
        ORDER BY id DESC
        LIMIT 10
      `)
      .all(identifier) as Array<{
        id: number;
        app_code: WorkspaceRuntimeDetail["recentRequestLogs"][number]["appCode"];
        provider_id: string | null;
        workspace_id: string | null;
        session_id: string | null;
        context_source: WorkspaceRuntimeDetail["recentRequestLogs"][number]["contextSource"];
        prompt_template_id: string | null;
        skill_id: string | null;
        target_url: string | null;
        method: string;
        path: string;
        status_code: number | null;
        latency_ms: number;
        outcome: WorkspaceRuntimeDetail["recentRequestLogs"][number]["outcome"];
        decision_reason: WorkspaceRuntimeDetail["recentRequestLogs"][number]["decisionReason"];
        next_provider_id: string | null;
        error_message: string | null;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      providerId: row.provider_id,
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      contextSource: row.context_source,
      promptTemplateId: row.prompt_template_id,
      skillId: row.skill_id,
      targetUrl: row.target_url,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      latencyMs: row.latency_ms,
      outcome: row.outcome,
      decisionReason: row.decision_reason,
      nextProviderId: row.next_provider_id,
      errorMessage: row.error_message,
      createdAt: row.created_at
    }));
  }

  private listTimeline(
    dimension: "workspace_id" | "session_id",
    identifier: string,
    appCode: WorkspaceRuntimeSummary["appCode"] | SessionRuntimeSummary["appCode"]
  ): ContextTimelineEvent[] {
    const recentRequestLogs = this.listRecentRequestLogs(dimension, identifier);
    const recentProviderIds = [...new Set(recentRequestLogs.map((item) => item.providerId).filter((item): item is string => item !== null))];
    const requestEvents = recentRequestLogs.map((item): ContextTimelineEvent => ({
      id: `request-${item.id}`,
      source: "proxy-request",
      createdAt: item.createdAt,
      appCode: item.appCode,
      providerId: item.providerId,
      workspaceId: item.workspaceId,
      sessionId: item.sessionId,
      level:
        item.outcome === "success"
          ? "info"
          : item.outcome === "failover"
            ? "warn"
            : "error",
      title: `${item.method} ${item.appCode}`,
      summary: item.errorMessage ?? item.path,
      metadata: {
        path: item.path,
        statusCode: item.statusCode === null ? null : String(item.statusCode),
        latencyMs: String(item.latencyMs),
        contextSource: item.contextSource,
        decisionReason: item.decisionReason,
        nextProviderId: item.nextProviderId
      }
    }));
    const anchorCreatedAt = recentRequestLogs[0]?.createdAt ?? null;
    const providerHealthEvents = this.listTimelineProviderHealthEvents(recentProviderIds, anchorCreatedAt, identifier, dimension);
    const quotaEvents = appCode === null ? [] : this.listTimelineQuotaEvents(appCode, anchorCreatedAt, identifier, dimension);

    return [...requestEvents, ...providerHealthEvents, ...quotaEvents]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 20);
  }

  private listTimelineProviderHealthEvents(
    providerIds: string[],
    anchorCreatedAt: string | null,
    identifier: string,
    dimension: "workspace_id" | "session_id"
  ): ContextTimelineEvent[] {
    if (providerIds.length === 0) {
      return [];
    }

    const rows = this.database
      .prepare(`
        SELECT id, provider_id, trigger, status, status_code, probe_url, message, created_at
        FROM provider_health_events
        ORDER BY id DESC
        LIMIT 200
      `)
      .all() as Array<{
        id: number;
        provider_id: string;
        trigger: string;
        status: "healthy" | "unhealthy";
        status_code: number | null;
        probe_url: string;
        message: string;
        created_at: string;
      }>;

    return rows
      .filter((row) => providerIds.includes(row.provider_id))
      .filter((row) => this.isTimelineRelevant(row.created_at, anchorCreatedAt))
      .slice(0, 8)
      .map((row) => ({
        id: `health-${row.id}`,
        source: "provider-health",
        createdAt: row.created_at,
        appCode: null,
        providerId: row.provider_id,
        workspaceId: dimension === "workspace_id" ? identifier : null,
        sessionId: dimension === "session_id" ? identifier : null,
        level: row.status === "healthy" ? "info" : "warn",
        title: `${row.provider_id} / ${row.status}`,
        summary: row.message,
        metadata: {
          trigger: row.trigger,
          statusCode: row.status_code === null ? null : String(row.status_code),
          probeUrl: row.probe_url
        }
      }));
  }

  private listTimelineQuotaEvents(
    appCode: SessionRuntimeSummary["appCode"],
    anchorCreatedAt: string | null,
    identifier: string,
    dimension: "workspace_id" | "session_id"
  ): ContextTimelineEvent[] {
    return this.quotaEventRepository
      .list(100)
      .filter((row) => row.appCode === appCode)
      .filter((row) => this.isTimelineRelevant(row.createdAt, anchorCreatedAt))
      .slice(0, 6)
      .map((row) => ({
        id: `quota-${row.id}`,
        source: "quota",
        createdAt: row.createdAt,
        appCode: row.appCode,
        providerId: null,
        workspaceId: dimension === "workspace_id" ? identifier : null,
        sessionId: dimension === "session_id" ? identifier : null,
        level: row.decision === "rejected" ? "error" : "info",
        title: `${row.appCode} / ${row.decision}`,
        summary: `${row.reason} (app-level)`,
        metadata: {
          requestsUsed: String(row.requestsUsed),
          tokensUsed: String(row.tokensUsed),
          windowStartedAt: row.windowStartedAt
        }
      }));
  }

  private isTimelineRelevant(createdAt: string, anchorCreatedAt: string | null): boolean {
    if (anchorCreatedAt === null) {
      return true;
    }

    const anchorTime = Date.parse(anchorCreatedAt);
    const eventTime = Date.parse(createdAt);
    if (Number.isNaN(anchorTime) || Number.isNaN(eventTime)) {
      return true;
    }

    return Math.abs(anchorTime - eventTime) <= 24 * 60 * 60 * 1000;
  }
}
