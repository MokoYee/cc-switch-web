import type {
  AppCode,
  AppMcpBinding,
  McpGovernanceRepairPreview,
  McpHostSyncPreview,
  McpServer,
  McpVerificationBaselineAction,
  McpVerificationHistoryItem,
  McpVerificationHistoryPage,
  McpVerificationHistoryQuery,
  McpVerificationHistoryStatus
} from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";
import type { AppMcpBindingRepository } from "./app-mcp-binding-repository.js";
import type { McpHostSyncService } from "./mcp-host-sync-service.js";
import type { McpServerRepository } from "./mcp-server-repository.js";
import type { McpService } from "./mcp-service.js";

const SYNTHETIC_BASELINE_TOLERANCE_MS = 60_000;

type McpBaselineEventRecord = {
  readonly id: string;
  readonly appCode: AppCode;
  readonly baselineAt: string;
  readonly baselineAction: McpVerificationBaselineAction;
  readonly baselineSummary: string;
  readonly synthetic: boolean;
};

type ProxyRequestLogRecord = {
  readonly outcome: "success" | "error" | "rejected" | "failover";
  readonly createdAt: string;
};

const parseTimestamp = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const pickLatestTimestamp = (values: readonly string[]): string | null => {
  let latestValue: string | null = null;
  let latestEpoch: number | null = null;

  for (const value of values) {
    const epoch = parseTimestamp(value);
    if (epoch === null) {
      continue;
    }
    if (latestEpoch === null || epoch > latestEpoch) {
      latestEpoch = epoch;
      latestValue = value;
    }
  }

  return latestValue;
};

const isWithinWindow = (
  value: string,
  windowStartAt: string,
  windowEndAt: string | null
): boolean => {
  const valueEpoch = parseTimestamp(value);
  const startEpoch = parseTimestamp(windowStartAt);
  if (valueEpoch === null || startEpoch === null || valueEpoch < startEpoch) {
    return false;
  }

  const endEpoch = parseTimestamp(windowEndAt);
  if (endEpoch === null) {
    return true;
  }

  return valueEpoch < endEpoch;
};

const isSameTimeWindow = (
  left: string,
  right: string,
  toleranceMs = SYNTHETIC_BASELINE_TOLERANCE_MS
): boolean => {
  const leftEpoch = parseTimestamp(left);
  const rightEpoch = parseTimestamp(right);
  if (leftEpoch === null || rightEpoch === null) {
    return false;
  }

  return Math.abs(leftEpoch - rightEpoch) <= toleranceMs;
};

const isWarnAction = (action: McpVerificationBaselineAction): boolean =>
  action.includes("delete") || action.includes("rollback");

const hasHostSyncDiff = (preview: McpHostSyncPreview | null): boolean =>
  preview !== null &&
  (preview.addedServerIds.length > 0 ||
    preview.removedServerIds.length > 0 ||
    (!preview.configExists && preview.nextManagedServerIds.length > 0));

const toHistoryStatus = ({
  runtimeStatus,
  runtimeIssueCount,
  hostDrifted,
  governancePreview,
  hostPreview,
  cycleLogs,
  cycleEvents
}: {
  readonly runtimeStatus: "healthy" | "warning" | "error";
  readonly runtimeIssueCount: number;
  readonly hostDrifted: boolean;
  readonly governancePreview: McpGovernanceRepairPreview;
  readonly hostPreview: McpHostSyncPreview | null;
  readonly cycleLogs: readonly ProxyRequestLogRecord[];
  readonly cycleEvents: readonly McpBaselineEventRecord[];
}): McpVerificationHistoryStatus => {
  const runtimeHealthy = runtimeStatus === "healthy" && !hostDrifted && runtimeIssueCount === 0;
  const hostSyncPending = governancePreview.requiresHostSync || hasHostSyncDiff(hostPreview);
  const latestRequestAt = pickLatestTimestamp(cycleLogs.map((item) => item.createdAt));
  const latestSuccessAt = pickLatestTimestamp(
    cycleLogs.filter((item) => item.outcome === "success").map((item) => item.createdAt)
  );
  const latestFailureAt = pickLatestTimestamp(
    cycleLogs.filter((item) => item.outcome !== "success").map((item) => item.createdAt)
  );
  const hasWarnAfterBaseline = cycleEvents.some((item) => isWarnAction(item.baselineAction));
  const hasFreshRequestAfterBaseline = latestRequestAt !== null;
  const hasRecentSuccessAfterBaseline = latestSuccessAt !== null;
  const hasRecentFailureAfterBaseline = latestFailureAt !== null;

  if (!runtimeHealthy) {
    return hasRecentFailureAfterBaseline ? "regressed" : "pending-runtime";
  }
  if (hostSyncPending) {
    return "pending-host-sync";
  }
  if (hasWarnAfterBaseline) {
    return "pending-audit";
  }
  if (hasFreshRequestAfterBaseline && !hasRecentSuccessAfterBaseline) {
    return "regressed";
  }
  if (!hasRecentSuccessAfterBaseline) {
    return "pending-traffic";
  }
  return "verified";
};

const toHistoricalStatus = ({
  cycleLogs,
  cycleEvents
}: {
  readonly cycleLogs: readonly ProxyRequestLogRecord[];
  readonly cycleEvents: readonly McpBaselineEventRecord[];
}): McpVerificationHistoryStatus | "superseded" => {
  const latestSuccessAt = pickLatestTimestamp(
    cycleLogs.filter((item) => item.outcome === "success").map((item) => item.createdAt)
  );
  const latestFailureAt = pickLatestTimestamp(
    cycleLogs.filter((item) => item.outcome !== "success").map((item) => item.createdAt)
  );
  if (latestFailureAt !== null || cycleEvents.some((item) => isWarnAction(item.baselineAction))) {
    return "regressed";
  }
  if (latestSuccessAt !== null) {
    return "verified";
  }
  return "superseded";
};

export class McpVerificationHistoryService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly appMcpBindingRepository: AppMcpBindingRepository,
    private readonly mcpServerRepository: McpServerRepository,
    private readonly mcpHostSyncService: McpHostSyncService,
    private readonly mcpService: McpService
  ) {}

  list(appCode: AppCode, query: McpVerificationHistoryQuery): McpVerificationHistoryPage {
    const allItems = this.listRelevantBaselineEvents(appCode);
    const pagedItems = allItems.slice(query.offset, query.offset + query.limit);

    if (pagedItems.length === 0) {
      return {
        items: [],
        total: allItems.length,
        limit: query.limit,
        offset: query.offset
      };
    }

    const oldestBaselineAt = pagedItems[pagedItems.length - 1]?.baselineAt ?? null;
    const cycleLogs =
      oldestBaselineAt === null ? [] : this.listProxyRequestLogs(appCode, oldestBaselineAt);
    const runtimeView = this.mcpService.getRuntimeView(appCode);
    const governancePreview = this.mcpService.previewGovernanceRepair(appCode);
    const hostPreview = this.previewHostSync(appCode);

    return {
      items: pagedItems.map((item, index) => {
        const absoluteIndex = query.offset + index;
        const nextBaselineAt = absoluteIndex === 0 ? null : allItems[absoluteIndex - 1]?.baselineAt ?? null;
        const cycleEventWindow = allItems.filter((event) =>
          isWithinWindow(event.baselineAt, item.baselineAt, nextBaselineAt)
        );
        const cycleLogWindow = cycleLogs.filter((event) =>
          isWithinWindow(event.createdAt, item.baselineAt, nextBaselineAt)
        );

        return {
          id: item.id,
          appCode: item.appCode,
          baselineAt: item.baselineAt,
          baselineAction: item.baselineAction,
          baselineSummary: item.baselineSummary,
          verificationStatus:
            absoluteIndex === 0
              ? toHistoryStatus({
                  runtimeStatus: runtimeView.status,
                  runtimeIssueCount: runtimeView.issueCodes.length,
                  hostDrifted: runtimeView.hostState.drifted,
                  governancePreview,
                  hostPreview,
                  cycleLogs: cycleLogWindow,
                  cycleEvents: cycleEventWindow
                })
              : toHistoricalStatus({
                  cycleLogs: cycleLogWindow,
                  cycleEvents: cycleEventWindow
                }),
          latestSuccessAt: pickLatestTimestamp(
            cycleLogWindow.filter((event) => event.outcome === "success").map((event) => event.createdAt)
          ),
          latestFailureAt: pickLatestTimestamp(
            cycleLogWindow.filter((event) => event.outcome !== "success").map((event) => event.createdAt)
          ),
          latestAuditAt: pickLatestTimestamp(cycleEventWindow.map((event) => event.baselineAt)),
          nextBaselineAt,
          currentCycle: absoluteIndex === 0,
          synthetic: item.synthetic
        } satisfies McpVerificationHistoryItem;
      }),
      total: allItems.length,
      limit: query.limit,
      offset: query.offset
    };
  }

  private listRelevantBaselineEvents(appCode: AppCode): McpBaselineEventRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT id, app_code, action, target_type, target_id, message, created_at
          FROM mcp_events
          WHERE app_code = @appCode
             OR (target_type = 'host-sync' AND target_id = @appCode)
             OR (target_type = 'binding' AND app_code IS NULL AND target_id LIKE @legacyBindingPrefix)
          ORDER BY created_at DESC, id DESC
        `
      )
      .all({
        appCode,
        legacyBindingPrefix: `${appCode}-%`
      }) as Array<{
        id: number;
        app_code: AppCode | null;
        action: McpVerificationBaselineAction;
        target_type: string;
        target_id: string;
        message: string;
        created_at: string;
      }>;

    const events = rows.map((row) => ({
      id: `mcp-history-${row.id}`,
      appCode,
      baselineAt: row.created_at,
      baselineAction: row.action,
      baselineSummary: row.message,
      synthetic: false
    }));
    const hostSyncState =
      this.mcpHostSyncService.listSyncStates().find((item) => item.appCode === appCode) ?? null;

    if (
      hostSyncState?.lastAppliedAt &&
      !events.some((item) => isSameTimeWindow(item.baselineAt, hostSyncState.lastAppliedAt))
    ) {
      events.unshift({
        id: `mcp-history-snapshot-${appCode}`,
        appCode,
        baselineAt: hostSyncState.lastAppliedAt,
        baselineAction: "host-apply-snapshot",
        baselineSummary: `Recovered MCP host apply baseline for ${appCode} from host sync state`,
        synthetic: true
      });
    }

    return events.sort((left, right) => right.baselineAt.localeCompare(left.baselineAt));
  }

  private listProxyRequestLogs(appCode: AppCode, startAt: string): ProxyRequestLogRecord[] {
    const rows = this.database
      .prepare(
        `
          SELECT outcome, created_at
          FROM proxy_request_logs
          WHERE app_code = ? AND created_at >= ?
          ORDER BY created_at DESC, id DESC
        `
      )
      .all(appCode, startAt) as Array<{
        outcome: ProxyRequestLogRecord["outcome"];
        created_at: string;
      }>;

    return rows.map((row) => ({
      outcome: row.outcome,
      createdAt: row.created_at
    }));
  }

  private previewHostSync(appCode: AppCode): McpHostSyncPreview | null {
    try {
      return this.mcpHostSyncService.previewApply(
        appCode,
        this.appMcpBindingRepository.list() as AppMcpBinding[],
        this.mcpServerRepository.list() as McpServer[]
      );
    } catch {
      return null;
    }
  }
}
