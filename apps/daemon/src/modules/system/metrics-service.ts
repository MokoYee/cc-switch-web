import type {
  AppQuotaStatus,
  McpAppRuntimeView,
  ProviderDiagnostic,
  SessionRecordStatus
} from "cc-switch-web-shared";

import type { BindingRepository } from "../bindings/binding-repository.js";
import type { AppMcpBindingRepository } from "../mcp/app-mcp-binding-repository.js";
import type { McpServerRepository } from "../mcp/mcp-server-repository.js";
import type { McpService } from "../mcp/mcp-service.js";
import type { ProviderRepository } from "../providers/provider-repository.js";
import type { ProxyRuntimeService, ProxyRuntimeView } from "../proxy/proxy-runtime-service.js";
import type { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import type { AppQuotaService } from "../quotas/app-quota-service.js";
import type { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import type { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import type { WorkspaceRepository } from "../workspaces/workspace-repository.js";
import type { SystemService } from "./system-service.js";

interface MetricsSample {
  readonly labels?: Record<string, string>;
  readonly value: number;
}

export interface MetricsServiceDependencies {
  readonly systemService: Pick<SystemService, "getRuntime">;
  readonly proxyRuntimeService: Pick<ProxyRuntimeService, "getRuntimeView" | "listProviderDiagnostics">;
  readonly providerRepository: Pick<ProviderRepository, "list">;
  readonly bindingRepository: Pick<BindingRepository, "list">;
  readonly failoverChainRepository: Pick<FailoverChainRepository, "list">;
  readonly workspaceRepository: Pick<WorkspaceRepository, "list">;
  readonly sessionRecordRepository: Pick<SessionRecordRepository, "list">;
  readonly appQuotaRepository: Pick<AppQuotaRepository, "list">;
  readonly appQuotaService: Pick<AppQuotaService, "listStatuses">;
  readonly mcpServerRepository: Pick<McpServerRepository, "list">;
  readonly appMcpBindingRepository: Pick<AppMcpBindingRepository, "list">;
  readonly mcpService: Pick<McpService, "listRuntimeViews">;
}

const PROXY_RUNTIME_STATE_VALUES: Record<ProxyRuntimeView["runtimeState"], number> = {
  stopped: 0,
  starting: 1,
  running: 2
};

const SESSION_STATUSES: SessionRecordStatus[] = ["active", "archived"];
const APP_QUOTA_STATES: AppQuotaStatus["currentState"][] = ["healthy", "warning", "exceeded", "disabled"];
const MCP_RUNTIME_STATUSES: McpAppRuntimeView["status"][] = ["healthy", "warning", "error"];
const PROVIDER_DIAGNOSIS_STATUSES: ProviderDiagnostic["diagnosisStatus"][] = [
  "healthy",
  "degraded",
  "recovering",
  "down",
  "idle",
  "disabled"
];

const escapeLabelValue = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\"", "\\\"");

const formatLabels = (labels?: Record<string, string>): string => {
  if (labels === undefined || Object.keys(labels).length === 0) {
    return "";
  }

  return `{${Object.entries(labels)
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",")}}`;
};

const addMetric = (
  lines: string[],
  name: string,
  type: "gauge" | "counter",
  help: string,
  samples: readonly MetricsSample[]
): void => {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);

  for (const sample of samples) {
    lines.push(`${name}${formatLabels(sample.labels)} ${sample.value}`);
  }
};

const countByState = <TState extends string>(
  states: readonly TState[],
  values: readonly TState[]
): Record<TState, number> => {
  const counts = Object.fromEntries(states.map((state) => [state, 0])) as Record<TState, number>;

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
};

const toVersionGaugeValue = (value: number | null): number => value ?? 0;

export class MetricsService {
  constructor(private readonly dependencies: MetricsServiceDependencies) {}

  renderPrometheusText(): string {
    const systemRuntime = this.dependencies.systemService.getRuntime();
    const proxyRuntime = this.dependencies.proxyRuntimeService.getRuntimeView();
    const providerDiagnostics = this.dependencies.proxyRuntimeService.listProviderDiagnostics();
    const providers = this.dependencies.providerRepository.list();
    const sessions = this.dependencies.sessionRecordRepository.list();
    const appQuotaStatuses = this.dependencies.appQuotaService.listStatuses();
    const mcpRuntimeViews = this.dependencies.mcpService.listRuntimeViews();

    const sessionCounts = countByState(
      SESSION_STATUSES,
      sessions.map((item) => item.status)
    );
    const appQuotaStateCounts = countByState(
      APP_QUOTA_STATES,
      appQuotaStatuses.map((item) => item.currentState)
    );
    const mcpRuntimeCounts = countByState(
      MCP_RUNTIME_STATUSES,
      mcpRuntimeViews.map((item) => item.status)
    );
    const providerDiagnosisCounts = countByState(
      PROVIDER_DIAGNOSIS_STATUSES,
      providerDiagnostics.map((item) => item.diagnosisStatus)
    );

    const lines: string[] = [];

    addMetric(lines, "ccsw_daemon_info", "gauge", "Daemon runtime identity and mode.", [
      {
        labels: {
          run_mode: systemRuntime.runMode,
          daemon_host: systemRuntime.daemonHost,
          daemon_port: String(systemRuntime.daemonPort)
        },
        value: 1
      }
    ]);

    addMetric(lines, "ccsw_proxy_runtime_state", "gauge", "Proxy runtime state. stopped=0, starting=1, running=2.", [
      {
        value: PROXY_RUNTIME_STATE_VALUES[proxyRuntime.runtimeState]
      }
    ]);

    addMetric(lines, "ccsw_proxy_snapshot_version", "gauge", "Active proxy snapshot version. Zero means no loaded snapshot.", [
      {
        value: toVersionGaugeValue(proxyRuntime.snapshotVersion)
      }
    ]);

    addMetric(lines, "ccsw_proxy_request_logs_total", "gauge", "Persisted proxy request log records.", [
      {
        value: proxyRuntime.requestLogCount
      }
    ]);

    addMetric(lines, "ccsw_usage_records_total", "gauge", "Persisted usage record count.", [
      {
        value: proxyRuntime.usageRecordCount
      }
    ]);

    addMetric(lines, "ccsw_provider_total", "gauge", "Configured provider count.", [
      {
        value: providers.length
      }
    ]);

    addMetric(lines, "ccsw_provider_enabled_total", "gauge", "Enabled provider count.", [
      {
        value: providers.filter((item) => item.enabled).length
      }
    ]);

    addMetric(lines, "ccsw_provider_diagnosis_total", "gauge", "Provider diagnosis count grouped by status.", PROVIDER_DIAGNOSIS_STATUSES.map((status) => ({
      labels: { status },
      value: providerDiagnosisCounts[status]
    })));

    addMetric(lines, "ccsw_provider_requests_total", "gauge", "Provider request totals aggregated from persisted proxy logs.", providerDiagnostics.map((item) => ({
      labels: {
        provider_id: item.providerId,
        provider_name: item.providerName,
        provider_type: item.providerType
      },
      value: item.requestCount
    })));

    addMetric(lines, "ccsw_bindings_total", "gauge", "Configured app binding count.", [
      {
        value: this.dependencies.bindingRepository.list().length
      }
    ]);

    addMetric(lines, "ccsw_failover_chains_total", "gauge", "Configured failover chain count.", [
      {
        value: this.dependencies.failoverChainRepository.list().length
      }
    ]);

    addMetric(lines, "ccsw_workspaces_total", "gauge", "Configured workspace count.", [
      {
        value: this.dependencies.workspaceRepository.list().length
      }
    ]);

    addMetric(lines, "ccsw_sessions_total", "gauge", "Session records grouped by status.", SESSION_STATUSES.map((status) => ({
      labels: { status },
      value: sessionCounts[status]
    })));

    addMetric(lines, "ccsw_app_quotas_total", "gauge", "Configured app quota count.", [
      {
        value: this.dependencies.appQuotaRepository.list().length
      }
    ]);

    addMetric(lines, "ccsw_app_quota_status_total", "gauge", "App quota status count grouped by state.", APP_QUOTA_STATES.map((state) => ({
      labels: { state },
      value: appQuotaStateCounts[state]
    })));

    addMetric(lines, "ccsw_mcp_servers_total", "gauge", "Configured MCP server count.", [
      {
        value: this.dependencies.mcpServerRepository.list().length
      }
    ]);

    addMetric(lines, "ccsw_mcp_bindings_total", "gauge", "Configured MCP binding count.", [
      {
        value: this.dependencies.appMcpBindingRepository.list().length
      }
    ]);

    addMetric(lines, "ccsw_mcp_runtime_apps_total", "gauge", "MCP runtime app count grouped by status.", MCP_RUNTIME_STATUSES.map((status) => ({
      labels: { status },
      value: mcpRuntimeCounts[status]
    })));

    addMetric(lines, "ccsw_mcp_host_drift_total", "gauge", "MCP apps currently drifted from host-managed configuration.", [
      {
        value: mcpRuntimeViews.filter((item) => item.hostState.drifted).length
      }
    ]);

    addMetric(lines, "ccsw_latest_snapshot_version", "gauge", "Latest persisted configuration snapshot version. Zero means no snapshot.", [
      {
        value: toVersionGaugeValue(systemRuntime.latestSnapshotVersion)
      }
    ]);

    return `${lines.join("\n")}\n`;
  }
}
