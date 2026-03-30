import type {
  AuditEvent,
  AuditEventPage,
  AuditEventQuery,
  HostIntegrationEvent,
  AppCode,
  ProviderHealthEvent,
  ProxyRequestLog
} from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

interface McpEventRecord {
  readonly id: number;
  readonly appCode: AppCode | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly message: string;
  readonly createdAt: string;
}

interface QuotaEventRecord {
  readonly id: number;
  readonly appCode: AppCode;
  readonly decision: "allowed" | "rejected";
  readonly reason: string;
  readonly requestsUsed: number;
  readonly tokensUsed: number;
  readonly windowStartedAt: string;
  readonly createdAt: string;
}

interface SnapshotAuditRecord {
  readonly version: number;
  readonly reason: string;
  readonly createdAt: string;
}

interface SystemServiceAuditRecord {
  readonly id: number;
  readonly action: "sync-env" | "install";
  readonly status: "success" | "warning";
  readonly message: string;
  readonly details: Record<string, string | null>;
  readonly createdAt: string;
}

const toHostAuditEvent = (event: HostIntegrationEvent): AuditEvent => ({
  id: `host-${event.id}`,
  source: "host-integration",
  title: `${event.appCode} / ${event.kind === "prompt-file" ? "prompt-sync" : event.action}`,
  summary: event.message,
  level: event.action === "rollback" ? "warn" : "info",
  appCode: event.appCode,
  providerId: null,
  status: event.integrationState,
  createdAt: event.createdAt,
  metadata: {
    kind: event.kind,
    configPath: event.configPath,
    backupPath: event.backupPath,
    action: event.action
  }
});

const toProviderHealthAuditEvent = (event: ProviderHealthEvent): AuditEvent => ({
  id: `health-${event.id}`,
  source: "provider-health",
  title: `${event.providerId} / ${event.status}`,
  summary: event.message,
  level: event.status === "healthy" ? "info" : "warn",
  appCode: null,
  providerId: event.providerId,
  status: event.status,
  createdAt: event.createdAt,
  metadata: {
    trigger: event.trigger,
    statusCode: event.statusCode === null ? null : String(event.statusCode),
    probeUrl: event.probeUrl
  }
});

const toProxyRequestAuditEvent = (event: ProxyRequestLog): AuditEvent => ({
  id: `request-${event.id}`,
  source: "proxy-request",
  title: `${event.method} ${event.appCode}`,
  summary: event.errorMessage ?? event.path,
  level:
    event.outcome === "success"
      ? "info"
      : event.outcome === "failover"
        ? "warn"
        : "error",
  appCode: event.appCode,
  providerId: event.providerId,
  status: event.outcome,
  createdAt: event.createdAt,
  metadata: {
    path: event.path,
    statusCode: event.statusCode === null ? null : String(event.statusCode),
    latencyMs: String(event.latencyMs),
    targetUrl: event.targetUrl,
    decisionReason: event.decisionReason,
    nextProviderId: event.nextProviderId,
    workspaceId: event.workspaceId,
    sessionId: event.sessionId,
    promptTemplateId: event.promptTemplateId,
    skillId: event.skillId
  }
});

const toMcpAuditEvent = (event: McpEventRecord): AuditEvent => ({
  id: `mcp-${event.id}`,
  source: "mcp",
  title: `${event.targetType} / ${event.action}`,
  summary: event.message,
  level: event.action.includes("delete") || event.action.includes("rollback") ? "warn" : "info",
  appCode: event.appCode,
  providerId: null,
  status: event.action,
  createdAt: event.createdAt,
  metadata: {
    targetType: event.targetType,
    targetId: event.targetId
  }
});

const toQuotaAuditEvent = (event: QuotaEventRecord): AuditEvent => ({
  id: `quota-${event.id}`,
  source: "quota",
  title: `${event.appCode} / ${event.decision}`,
  summary: event.reason,
  level: event.decision === "rejected" ? "error" : "info",
  appCode: event.appCode,
  providerId: null,
  status: event.decision,
  createdAt: event.createdAt,
  metadata: {
    requestsUsed: String(event.requestsUsed),
    tokensUsed: String(event.tokensUsed),
    windowStartedAt: event.windowStartedAt
  }
});

const toSnapshotAuditEvent = (event: SnapshotAuditRecord): AuditEvent => ({
  id: `snapshot-${event.version}`,
  source: "config-snapshot",
  title: `snapshot / v${event.version}`,
  summary: event.reason,
  level:
    event.reason.startsWith("restore:") || event.reason.includes("-delete:")
      ? "warn"
      : "info",
  appCode: null,
  providerId: null,
  status: event.reason,
  createdAt: event.createdAt,
  metadata: {
    version: String(event.version),
    reason: event.reason
  }
});

const toSystemServiceAuditEvent = (event: SystemServiceAuditRecord): AuditEvent => ({
  id: `system-service-${event.id}`,
  source: "system-service",
  title: `service / ${event.action}`,
  summary: event.message,
  level: event.status === "success" ? "info" : "warn",
  appCode: null,
  providerId: null,
  status: event.status,
  createdAt: event.createdAt,
  metadata: event.details
});

export class AuditEventService {
  constructor(private readonly database: SqliteDatabase) {}

  list(query: AuditEventQuery): AuditEventPage {
    const allItems = [
      ...this.listHostEvents().map(toHostAuditEvent),
      ...this.listProviderHealthEvents().map(toProviderHealthAuditEvent),
      ...this.listProxyRequestLogs().map(toProxyRequestAuditEvent),
      ...this.listMcpEvents().map(toMcpAuditEvent),
      ...this.listQuotaEvents().map(toQuotaAuditEvent),
      ...this.listSnapshotEvents().map(toSnapshotAuditEvent),
      ...this.listSystemServiceEvents().map(toSystemServiceAuditEvent)
    ]
      .filter((item) => {
        if (query.source !== undefined && item.source !== query.source) {
          return false;
        }
        if (query.appCode !== undefined && item.appCode !== query.appCode) {
          return false;
        }
        if (query.providerId !== undefined && item.providerId !== query.providerId) {
          return false;
        }
        if (query.level !== undefined && item.level !== query.level) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      items: allItems.slice(query.offset, query.offset + query.limit),
      total: allItems.length,
      limit: query.limit,
      offset: query.offset
    };
  }

  private listHostEvents(limit = 500): HostIntegrationEvent[] {
    const rows = this.database
      .prepare(`
        SELECT id, kind, app_code, action, config_path, backup_path, integration_state, message, created_at
        FROM host_integration_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        kind: HostIntegrationEvent["kind"];
        app_code: HostIntegrationEvent["appCode"];
        action: HostIntegrationEvent["action"];
        config_path: string;
        backup_path: string | null;
        integration_state: HostIntegrationEvent["integrationState"];
        message: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind === "prompt-file" ? "prompt-file" : "proxy-config",
      appCode: row.app_code,
      action: row.action,
      configPath: row.config_path,
      backupPath: row.backup_path,
      integrationState: row.integration_state,
      message: row.message,
      createdAt: row.created_at
    }));
  }

  private listProviderHealthEvents(limit = 500): ProviderHealthEvent[] {
    const rows = this.database
      .prepare(`
        SELECT id, provider_id, trigger, status, status_code, probe_url, message, created_at
        FROM provider_health_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        provider_id: string;
        trigger: ProviderHealthEvent["trigger"];
        status: ProviderHealthEvent["status"];
        status_code: number | null;
        probe_url: string;
        message: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      trigger: row.trigger,
      status: row.status,
      statusCode: row.status_code,
      probeUrl: row.probe_url,
      message: row.message,
      createdAt: row.created_at
    }));
  }

  private listProxyRequestLogs(limit = 500): ProxyRequestLog[] {
    const rows = this.database
      .prepare(`
        SELECT
          id, app_code, provider_id, workspace_id, session_id, context_source, prompt_template_id, skill_id,
          target_url, method, path, status_code, latency_ms, outcome, decision_reason, next_provider_id, error_message, created_at
        FROM proxy_request_logs
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        app_code: ProxyRequestLog["appCode"];
        provider_id: string | null;
        workspace_id: string | null;
        session_id: string | null;
        context_source: ProxyRequestLog["contextSource"];
        prompt_template_id: string | null;
        skill_id: string | null;
        target_url: string | null;
        method: string;
        path: string;
        status_code: number | null;
        latency_ms: number;
        outcome: ProxyRequestLog["outcome"];
        decision_reason: ProxyRequestLog["decisionReason"];
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

  private listMcpEvents(limit = 500): McpEventRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, action, target_type, target_id, message, created_at
        FROM mcp_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        app_code: AppCode | null;
        action: string;
        target_type: string;
        target_id: string;
        message: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      message: row.message,
      createdAt: row.created_at
    }));
  }

  private listQuotaEvents(limit = 500): QuotaEventRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, decision, reason, requests_used, tokens_used, window_started_at, created_at
        FROM quota_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        app_code: AppCode;
        decision: "allowed" | "rejected";
        reason: string;
        requests_used: number;
        tokens_used: number;
        window_started_at: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      decision: row.decision,
      reason: row.reason,
      requestsUsed: row.requests_used,
      tokensUsed: row.tokens_used,
      windowStartedAt: row.window_started_at,
      createdAt: row.created_at
    }));
  }

  private listSnapshotEvents(limit = 500): SnapshotAuditRecord[] {
    const rows = this.database
      .prepare(`
        SELECT version, reason, created_at
        FROM config_snapshots
        ORDER BY version DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        version: number;
        reason: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      version: row.version,
      reason: row.reason,
      createdAt: row.created_at
    }));
  }

  private listSystemServiceEvents(limit = 500): SystemServiceAuditRecord[] {
    const rows = this.database
      .prepare(`
        SELECT id, action, status, message, details_json, created_at
        FROM system_service_events
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        action: SystemServiceAuditRecord["action"];
        status: SystemServiceAuditRecord["status"];
        message: string;
        details_json: string;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      message: row.message,
      details: JSON.parse(row.details_json) as Record<string, string | null>,
      createdAt: row.created_at
    }));
  }
}
