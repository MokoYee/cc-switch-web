import {
  nowIso,
  type AppCode,
  type FailoverChain,
  type ProviderDiagnostic,
  type ProviderDiagnosticDetail,
  type ProviderFailureCategory,
  type ProviderHealthEvent,
  type ProxyRequestLogPage,
  type ProxyRequestLogQuery,
  type ProxyPolicy,
  type ProxyRequestDecisionReason,
  type ProviderType,
  type UsageRecord,
  type UsageRecordPage,
  type UsageRecordQuery,
  type UsageSummary,
  type UsageTimeseries,
  type UsageTimeseriesQuery
} from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";
import type { BindingRepository } from "../bindings/binding-repository.js";
import type { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import type { RuntimeProvider, ProviderRepository } from "../providers/provider-repository.js";
import type { ProxyStatus } from "./proxy-service.js";

export interface ProxyRequestLog {
  readonly id: number;
  readonly appCode: AppCode;
  readonly providerId: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly contextSource:
    | "request-session"
    | "request-workspace"
    | "request-auto-session"
    | "request-auto-workspace"
    | "active-session"
    | "active-workspace"
    | "none"
    | null;
  readonly promptTemplateId: string | null;
  readonly skillId: string | null;
  readonly targetUrl: string | null;
  readonly method: string;
  readonly path: string;
  readonly statusCode: number | null;
  readonly latencyMs: number;
  readonly outcome: "success" | "error" | "rejected" | "failover";
  readonly decisionReason: ProxyRequestDecisionReason | null;
  readonly nextProviderId: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
}

const mapRequestLogRow = (row: {
  id: number;
  app_code: AppCode;
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
  decision_reason: ProxyRequestDecisionReason | null;
  next_provider_id: string | null;
  error_message: string | null;
  created_at: string;
}): ProxyRequestLog => ({
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
});

export interface ProviderHealthState {
  readonly providerId: string;
  readonly circuitState: "closed" | "open" | "half-open";
  readonly consecutiveFailures: number;
  readonly lastFailureAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastRecoveredAt: string | null;
  readonly lastProbeAt: string | null;
  readonly lastProbeResult: "healthy" | "unhealthy" | null;
  readonly recoveryProbeInFlight: boolean;
  readonly recoveryAttemptCount: number;
  readonly nextRecoveryProbeAt: string | null;
  readonly cooldownUntil: string | null;
  readonly lastErrorMessage: string | null;
}

export interface ProxyBindingRuntime {
  readonly appCode: AppCode;
  readonly mode: "observe" | "managed";
  readonly providerId: string;
  readonly providerName: string;
  readonly providerType: ProviderType;
  readonly enabled: boolean;
  readonly upstreamBaseUrl: string;
  readonly hasCredential: boolean;
  readonly timeoutMs: number;
  readonly proxyBasePath: string;
  readonly failoverEnabled: boolean;
  readonly failoverTargets: string[];
  readonly maxAttempts: number;
  readonly cooldownSeconds: number;
}

export interface RuntimeTarget extends ProxyBindingRuntime {
  readonly apiKeyPlaintext: string;
}

export interface ProxyExecutionPlan {
  readonly appCode: AppCode;
  readonly candidates: RuntimeTarget[];
  readonly candidateDecisions: ProxyExecutionCandidateDecision[];
  readonly failoverEnabled: boolean;
  readonly openedCircuits: string[];
  readonly maxAttempts: number;
}

export type ProxyExecutionCandidateDecisionReason =
  | "ready"
  | "unexecutable-disabled"
  | "unexecutable-missing-credential"
  | "circuit-open"
  | "recent-unhealthy-demoted"
  | "half-open-fallback";

export interface ProxyExecutionCandidateDecision {
  readonly providerId: string;
  readonly providerName: string;
  readonly decision: "selected" | "excluded" | "degraded" | "fallback";
  readonly reason: ProxyExecutionCandidateDecisionReason;
  readonly selected: boolean;
}

export interface PreviewExecutionPlanOptions {
  readonly failoverEnabled: boolean;
  readonly maxAttempts: number;
  readonly cooldownSeconds: number;
}

export interface ProxyRuntimeView {
  readonly runtimeState: ProxyStatus["runtimeState"];
  readonly policy: ProxyPolicy;
  readonly snapshotVersion: number | null;
  readonly lastReloadedAt: string | null;
  readonly activeBindings: ProxyBindingRuntime[];
  readonly failoverChains: FailoverChain[];
  readonly providerHealthStates: ProviderHealthState[];
  readonly providerHealthEvents: ProviderHealthEvent[];
  readonly requestLogCount: number;
  readonly usageRecordCount: number;
}

export interface ProviderRecoveryProbeTarget {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerType: ProviderType;
  readonly upstreamBaseUrl: string;
  readonly apiKeyPlaintext: string;
  readonly cooldownSeconds: number;
}

export interface ProviderHealthActionResult {
  readonly providerId: string;
  readonly action: "probe" | "isolate" | "reset";
  readonly circuitState: ProviderHealthState["circuitState"];
  readonly cooldownUntil: string | null;
  readonly message: string;
}

export interface ProxyRequestLogAppendInput {
  readonly appCode: AppCode;
  readonly providerId: string | null;
  readonly workspaceId?: string | null;
  readonly sessionId?: string | null;
  readonly contextSource?: ProxyRequestLog["contextSource"];
  readonly promptTemplateId?: string | null;
  readonly skillId?: string | null;
  readonly targetUrl: string | null;
  readonly method: string;
  readonly path: string;
  readonly statusCode: number | null;
  readonly latencyMs: number;
  readonly outcome: "success" | "error" | "rejected" | "failover";
  readonly decisionReason?: ProxyRequestDecisionReason | null;
  readonly nextProviderId?: string | null;
  readonly errorMessage: string | null;
}

const mapUsageRecordRow = (row: {
  id: number;
  request_log_id: number | null;
  app_code: AppCode;
  provider_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
}): UsageRecord => ({
  id: row.id,
  requestLogId: row.request_log_id,
  appCode: row.app_code,
  providerId: row.provider_id,
  model: row.model,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  totalTokens: row.total_tokens,
  createdAt: row.created_at
});

interface MutableProviderHealthState {
  providerId: string;
  consecutiveFailures: number;
  circuitOpenedAt: number | null;
  cooldownUntil: number | null;
  recoveryAttemptCount: number;
  recoveryProbeInFlight: boolean;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  lastRecoveredAt: string | null;
  lastProbeAt: string | null;
  lastProbeResult: "healthy" | "unhealthy" | null;
  lastErrorMessage: string | null;
}

const buildRecoveryProbeUrl = (baseUrl: string): string => {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  if (normalizedBaseUrl.endsWith("/v1")) {
    return `${normalizedBaseUrl}/models`;
  }

  return normalizedBaseUrl;
};

const MAX_RECOVERY_BACKOFF_SECONDS = 300;

const classifyProviderFailure = (
  statusCode: number | null,
  messages: string[]
): ProviderFailureCategory => {
  const normalized = messages.join(" ").toLowerCase();

  if (normalized.includes("manual isolate") || normalized.includes("manually isolated")) {
    return "manual-isolation";
  }
  if (statusCode === 401 || statusCode === 403 || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "auth";
  }
  if (statusCode === 429 || normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "rate-limit";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out") || statusCode === 408) {
    return "timeout";
  }
  if (
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    normalized.includes("connection refused") ||
    normalized.includes("bad gateway") ||
    normalized.includes("service unavailable")
  ) {
    return "upstream-unavailable";
  }
  if (
    normalized.includes("network") ||
    normalized.includes("socket") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("fetch failed")
  ) {
    return "network";
  }
  if (messages.length === 0 && statusCode === null) {
    return "none";
  }

  return messages.length > 0 || statusCode !== null ? "unknown" : "none";
};

const isExecutableTarget = (
  target: Pick<RuntimeTarget, "enabled" | "hasCredential">
): boolean => target.enabled && target.hasCredential;

const getUnexecutableReason = (
  target: Pick<RuntimeTarget, "enabled" | "hasCredential">
): ProxyExecutionCandidateDecisionReason | null => {
  if (!target.enabled) {
    return "unexecutable-disabled";
  }
  if (!target.hasCredential) {
    return "unexecutable-missing-credential";
  }
  return null;
};

const hasIsoPriority = (left: string | null, right: string | null): boolean => {
  if (left === null) {
    return false;
  }
  if (right === null) {
    return true;
  }
  return left > right;
};

const computeRecoveryBackoffSeconds = (
  cooldownSeconds: number,
  recoveryAttemptCount: number
): number => {
  const normalizedBase = Math.max(cooldownSeconds, 5);
  const multiplier = 2 ** Math.max(recoveryAttemptCount - 1, 0);
  return Math.min(normalizedBase * multiplier, MAX_RECOVERY_BACKOFF_SECONDS);
};

const buildUsageWhereClause = (
  query: Omit<UsageRecordQuery, "limit" | "offset">
): {
  readonly whereSql: string;
  readonly parameters: Array<string | number>;
} => {
  const whereClauses: string[] = [];
  const parameters: Array<string | number> = [];

  if (query.appCode !== undefined) {
    whereClauses.push("app_code = ?");
    parameters.push(query.appCode);
  }

  if (query.providerId !== undefined) {
    whereClauses.push("provider_id = ?");
    parameters.push(query.providerId);
  }

  if (query.model !== undefined) {
    whereClauses.push("model = ?");
    parameters.push(query.model);
  }

  if (query.startAt !== undefined) {
    whereClauses.push("created_at >= ?");
    parameters.push(query.startAt);
  }

  if (query.endAt !== undefined) {
    whereClauses.push("created_at <= ?");
    parameters.push(query.endAt);
  }

  return {
    whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "",
    parameters
  };
};

export class ProxyRuntimeService {
  private runtimeTargets = new Map<AppCode, RuntimeTarget[]>();
  private failoverChains = new Map<AppCode, FailoverChain>();
  private providerHealthStates = new Map<string, MutableProviderHealthState>();
  private snapshotVersion: number | null = null;
  private lastReloadedAt: string | null = null;

  constructor(
    private readonly database: SqliteDatabase,
    private readonly providerRepository: ProviderRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly readProxyStatus: () => ProxyStatus
  ) {}

  reload(snapshotVersion: number | null): ProxyRuntimeView {
    const providers = new Map<string, RuntimeProvider>(
      this.providerRepository.listRuntime().map((provider) => [provider.id, provider])
    );
    const chains = new Map<AppCode, FailoverChain>(
      this.failoverChainRepository.list().map((chain) => [chain.appCode, chain])
    );
    const nextTargets = new Map<AppCode, RuntimeTarget[]>();

    for (const binding of this.bindingRepository.list()) {
      const chain = chains.get(binding.appCode);
      const orderedProviderIds = this.buildProviderOrder(binding.providerId, chain);
      const candidates = orderedProviderIds
        .map((providerId) => providers.get(providerId))
        .filter((provider): provider is RuntimeProvider => provider !== undefined)
        .map((provider) => ({
          appCode: binding.appCode,
          mode: binding.mode,
          providerId: provider.id,
          providerName: provider.name,
          providerType: provider.providerType,
          enabled: provider.enabled,
          upstreamBaseUrl: provider.baseUrl,
          hasCredential: provider.apiKeyPlaintext.trim().length > 0,
          timeoutMs: provider.timeoutMs,
          proxyBasePath: `/proxy/${binding.appCode}`,
          failoverEnabled: chain?.enabled ?? false,
          failoverTargets: chain?.providerIds ?? [binding.providerId],
          maxAttempts: chain?.maxAttempts ?? 1,
          cooldownSeconds: chain?.cooldownSeconds ?? 30,
          apiKeyPlaintext: provider.apiKeyPlaintext
        }));

      nextTargets.set(binding.appCode, candidates);

      for (const providerId of orderedProviderIds) {
        this.ensureProviderHealthState(providerId);
      }
    }

    this.runtimeTargets = nextTargets;
    this.failoverChains = chains;
    this.snapshotVersion = snapshotVersion;
    this.lastReloadedAt = nowIso();

    return this.getRuntimeView();
  }

  createExecutionPlan(appCode: string, preferredProviderId: string | null = null): ProxyExecutionPlan | null {
    const existingCandidates = this.runtimeTargets.get(appCode as AppCode);
    if (existingCandidates === undefined || existingCandidates.length === 0) {
      return null;
    }

    const primary = existingCandidates[0];
    if (primary === undefined) {
      return null;
    }
    const candidates = this.reorderCandidates(primary, existingCandidates, preferredProviderId);
    const maxAttempts = Math.min(
      primary.failoverEnabled ? Math.max(primary.maxAttempts, 1) : 1,
      candidates.length
    );
    return this.buildExecutionPlan(primary.appCode, candidates, primary.failoverEnabled, maxAttempts);
  }

  createPreviewExecutionPlan(
    appCode: AppCode,
    providerOrder: string[],
    options: PreviewExecutionPlanOptions
  ): ProxyExecutionPlan | null {
    const providers = new Map<string, RuntimeProvider>(
      this.providerRepository.listRuntime().map((provider) => [provider.id, provider])
    );
    const candidates = providerOrder
      .map((providerId) => providers.get(providerId))
      .filter((provider): provider is RuntimeProvider => provider !== undefined)
      .map((provider) => ({
        appCode,
        mode: "managed" as const,
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.providerType,
        enabled: provider.enabled,
        upstreamBaseUrl: provider.baseUrl,
        hasCredential: provider.apiKeyPlaintext.trim().length > 0,
        timeoutMs: provider.timeoutMs,
        proxyBasePath: `/proxy/${appCode}`,
        failoverEnabled: options.failoverEnabled,
        failoverTargets: providerOrder,
        maxAttempts: options.maxAttempts,
        cooldownSeconds: options.cooldownSeconds,
        apiKeyPlaintext: provider.apiKeyPlaintext
      }));

    if (candidates.length === 0) {
      return null;
    }

    const primary = candidates[0];
    if (primary === undefined) {
      return null;
    }

    const maxAttempts = Math.min(
      options.failoverEnabled ? Math.max(options.maxAttempts, 1) : 1,
      candidates.length
    );
    return this.buildExecutionPlan(appCode, candidates, options.failoverEnabled, maxAttempts);
  }

  private reorderCandidates(
    primary: RuntimeTarget,
    candidates: RuntimeTarget[],
    preferredProviderId: string | null
  ): RuntimeTarget[] {
    if (preferredProviderId === null || preferredProviderId.trim().length === 0) {
      return candidates;
    }

    const existing = candidates.find((item) => item.providerId === preferredProviderId);
    if (existing !== undefined) {
      return [existing, ...candidates.filter((item) => item.providerId !== preferredProviderId)];
    }

    const provider = this.providerRepository
      .listRuntime()
      .find((item) => item.id === preferredProviderId);
    if (provider === undefined) {
      return candidates;
    }

    const preferredCandidate: RuntimeTarget = {
      ...primary,
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.providerType,
      enabled: provider.enabled,
      upstreamBaseUrl: provider.baseUrl,
      hasCredential: provider.apiKeyPlaintext.trim().length > 0,
      timeoutMs: provider.timeoutMs,
      failoverTargets: [provider.id, ...primary.failoverTargets.filter((item) => item !== provider.id)],
      apiKeyPlaintext: provider.apiKeyPlaintext
    };

    return [preferredCandidate, ...candidates];
  }

  private buildExecutionPlan(
    appCode: AppCode,
    candidates: RuntimeTarget[],
    failoverEnabled: boolean,
    maxAttempts: number
  ): ProxyExecutionPlan {
    const openedCircuits: string[] = [];
    const candidateDecisions: ProxyExecutionCandidateDecision[] = [];
    const readyCandidates: RuntimeTarget[] = [];
    const degradedReadyCandidates: RuntimeTarget[] = [];
    const fallbackCandidates: RuntimeTarget[] = [];

    for (const candidate of candidates) {
      const unexecutableReason = getUnexecutableReason(candidate);
      if (unexecutableReason !== null) {
        candidateDecisions.push({
          providerId: candidate.providerId,
          providerName: candidate.providerName,
          decision: "excluded",
          reason: unexecutableReason,
          selected: false
        });
        continue;
      }

      const state = this.readCircuitState(candidate.providerId, candidate.cooldownSeconds);
      if (state === "open") {
        openedCircuits.push(candidate.providerId);
        candidateDecisions.push({
          providerId: candidate.providerId,
          providerName: candidate.providerName,
          decision: "excluded",
          reason: "circuit-open",
          selected: false
        });
        continue;
      }

      if (state === "half-open") {
        fallbackCandidates.push(candidate);
        candidateDecisions.push({
          providerId: candidate.providerId,
          providerName: candidate.providerName,
          decision: "fallback",
          reason: "half-open-fallback",
          selected: false
        });
        continue;
      }

      if (this.hasRecentUnhealthySignal(candidate.providerId)) {
        degradedReadyCandidates.push(candidate);
        candidateDecisions.push({
          providerId: candidate.providerId,
          providerName: candidate.providerName,
          decision: "degraded",
          reason: "recent-unhealthy-demoted",
          selected: false
        });
        continue;
      }

      readyCandidates.push(candidate);
      candidateDecisions.push({
        providerId: candidate.providerId,
        providerName: candidate.providerName,
        decision: "selected",
        reason: "ready",
        selected: false
      });
    }

    const orderedCandidates = [...readyCandidates, ...degradedReadyCandidates, ...fallbackCandidates].slice(0, maxAttempts);
    const selectedProviderIds = new Set(orderedCandidates.map((candidate) => candidate.providerId));
    const finalizedDecisions = candidateDecisions.map((decision) => ({
      ...decision,
      selected: selectedProviderIds.has(decision.providerId)
    }));

    return {
      appCode,
      candidates: orderedCandidates,
      candidateDecisions: finalizedDecisions,
      failoverEnabled,
      openedCircuits,
      maxAttempts
    };
  }

  recordSuccess(providerId: string): void {
    const state = this.ensureProviderHealthState(providerId);
    const hadOpenCircuit = state.cooldownUntil !== null || state.circuitOpenedAt !== null;
    state.consecutiveFailures = 0;
    state.circuitOpenedAt = null;
    state.cooldownUntil = null;
    state.recoveryAttemptCount = 0;
    state.recoveryProbeInFlight = false;
    state.lastSuccessAt = nowIso();
    state.lastProbeAt = nowIso();
    state.lastProbeResult = "healthy";
    if (hadOpenCircuit) {
      state.lastRecoveredAt = state.lastSuccessAt;
    }
    state.lastErrorMessage = null;
  }

  recordFailure(
    providerId: string,
    cooldownSeconds: number,
    failureThreshold: number,
    errorMessage: string
  ): void {
    const state = this.ensureProviderHealthState(providerId);
    state.consecutiveFailures += 1;
    state.lastFailureAt = nowIso();
    state.lastProbeAt = state.lastFailureAt;
    state.lastProbeResult = "unhealthy";
    state.lastErrorMessage = errorMessage;

    if (state.consecutiveFailures >= failureThreshold) {
      state.circuitOpenedAt = Date.now();
      state.cooldownUntil = Date.now() + cooldownSeconds * 1000;
      state.recoveryAttemptCount = 0;
      state.recoveryProbeInFlight = false;
    }
  }

  getRuntimeView(): ProxyRuntimeView {
    return {
      runtimeState: this.readProxyStatus().runtimeState,
      policy: this.readProxyStatus().policy,
      snapshotVersion: this.snapshotVersion,
      lastReloadedAt: this.lastReloadedAt,
      activeBindings: Array.from(this.runtimeTargets.values()).flatMap((targets) =>
        targets[0] !== undefined ? [this.stripSecret(targets[0])] : []
      ),
      failoverChains: Array.from(this.failoverChains.values()),
      providerHealthStates: this.listProviderHealthStates(),
      providerHealthEvents: this.listRecentProviderHealthEvents(12),
      requestLogCount: this.countRequestLogs(),
      usageRecordCount: this.countUsageRecords()
    };
  }

  getProviderCircuitState(providerId: string, cooldownSeconds: number): "closed" | "open" | "half-open" {
    return this.readCircuitState(providerId, cooldownSeconds);
  }

  listProviderDiagnostics(): ProviderDiagnostic[] {
    const providers = this.providerRepository.list();
    const providerRuntimeTargets = new Map<string, RuntimeTarget>();

    for (const runtimeTargets of this.runtimeTargets.values()) {
      for (const target of runtimeTargets) {
        if (!providerRuntimeTargets.has(target.providerId)) {
          providerRuntimeTargets.set(target.providerId, target);
        }
      }
    }

    const bindingAppCodesByProvider = new Map<string, Set<AppCode>>();
    for (const binding of this.bindingRepository.list()) {
      const appCodes = bindingAppCodesByProvider.get(binding.providerId) ?? new Set<AppCode>();
      appCodes.add(binding.appCode);
      bindingAppCodesByProvider.set(binding.providerId, appCodes);
    }

    const failoverAppCodesByProvider = new Map<string, Set<AppCode>>();
    for (const chain of this.failoverChainRepository.list()) {
      for (const providerId of chain.providerIds) {
        const appCodes = failoverAppCodesByProvider.get(providerId) ?? new Set<AppCode>();
        appCodes.add(chain.appCode);
        failoverAppCodesByProvider.set(providerId, appCodes);
      }
    }

    const aggregateRows = this.database
      .prepare(`
        SELECT
          provider_id,
          COUNT(*) AS request_count,
          SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN outcome = 'error' THEN 1 ELSE 0 END) AS error_count,
          SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
          SUM(CASE WHEN outcome = 'failover' THEN 1 ELSE 0 END) AS failover_count,
          AVG(latency_ms) AS average_latency_ms,
          MAX(created_at) AS last_request_at
        FROM proxy_request_logs
        WHERE provider_id IS NOT NULL
        GROUP BY provider_id
      `)
      .all() as Array<{
        provider_id: string;
        request_count: number;
        success_count: number;
        error_count: number;
        rejected_count: number;
        failover_count: number;
        average_latency_ms: number | null;
        last_request_at: string | null;
      }>;
    const aggregateByProvider = new Map(aggregateRows.map((row) => [row.provider_id, row]));

    const lastRequestRows = this.database
      .prepare(`
        SELECT provider_id, method, path, status_code, error_message, created_at
        FROM proxy_request_logs
        WHERE provider_id IS NOT NULL
        ORDER BY id DESC
      `)
      .all() as Array<{
        provider_id: string;
        method: string;
        path: string;
        status_code: number | null;
        error_message: string | null;
        created_at: string;
      }>;
    const lastRequestByProvider = new Map<string, (typeof lastRequestRows)[number]>();
    const recentErrorsByProvider = new Map<string, string[]>();
    for (const row of lastRequestRows) {
      if (!lastRequestByProvider.has(row.provider_id)) {
        lastRequestByProvider.set(row.provider_id, row);
      }
      if (row.error_message !== null && row.error_message.trim().length > 0) {
        const recentErrors = recentErrorsByProvider.get(row.provider_id) ?? [];
        if (recentErrors.length < 3 && !recentErrors.includes(row.error_message)) {
          recentErrors.push(row.error_message);
          recentErrorsByProvider.set(row.provider_id, recentErrors);
        }
      }
    }

    return providers.map((provider) => {
      const runtimeTarget = providerRuntimeTargets.get(provider.id) ?? null;
      const healthState = this.ensureProviderHealthState(provider.id);
      const aggregate = aggregateByProvider.get(provider.id);
      const lastRequest = lastRequestByProvider.get(provider.id) ?? null;
      const circuitState =
        healthState.cooldownUntil === null
          ? "closed"
          : Date.now() >= healthState.cooldownUntil
            ? "half-open"
            : "open";

      const diagnosisStatus = !provider.enabled
        ? "disabled"
        : circuitState === "open"
          ? "down"
          : circuitState === "half-open"
            ? "recovering"
            : aggregate === undefined
              ? "idle"
              : (aggregate.error_count > 0 ||
                  aggregate.rejected_count > 0 ||
                  aggregate.failover_count > 0 ||
                  healthState.lastProbeResult === "unhealthy")
                ? "degraded"
                : "healthy";

      return {
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.providerType,
        enabled: provider.enabled,
        bindingAppCodes: Array.from(bindingAppCodesByProvider.get(provider.id) ?? []).sort(),
        failoverAppCodes: Array.from(failoverAppCodesByProvider.get(provider.id) ?? []).sort(),
        requestCount: aggregate?.request_count ?? 0,
        successCount: aggregate?.success_count ?? 0,
        errorCount: aggregate?.error_count ?? 0,
        rejectedCount: aggregate?.rejected_count ?? 0,
        failoverCount: aggregate?.failover_count ?? 0,
        successRate:
          aggregate === undefined || aggregate.request_count === 0
            ? null
            : aggregate.success_count / aggregate.request_count,
        averageLatencyMs: aggregate?.average_latency_ms ?? null,
        lastRequestAt: aggregate?.last_request_at ?? null,
        lastSuccessAt: healthState.lastSuccessAt,
        lastFailureAt: healthState.lastFailureAt,
        lastRecoveredAt: healthState.lastRecoveredAt,
        lastProbeAt: healthState.lastProbeAt,
        lastProbeResult: healthState.lastProbeResult,
        recoveryProbeInFlight: healthState.recoveryProbeInFlight,
        recoveryAttemptCount: healthState.recoveryAttemptCount,
        nextRecoveryProbeAt:
          healthState.cooldownUntil === null ? null : new Date(healthState.cooldownUntil).toISOString(),
        circuitState,
        diagnosisStatus,
        cooldownUntil:
          healthState.cooldownUntil === null ? null : new Date(healthState.cooldownUntil).toISOString(),
        recoveryProbeUrl:
          runtimeTarget === null ? null : buildRecoveryProbeUrl(runtimeTarget.upstreamBaseUrl),
        lastRequestPath: lastRequest?.path ?? null,
        lastRequestMethod: lastRequest?.method ?? null,
        lastStatusCode: lastRequest?.status_code ?? null,
        lastErrorMessage: healthState.lastErrorMessage ?? lastRequest?.error_message ?? null,
        recentErrorMessages: recentErrorsByProvider.get(provider.id) ?? []
      } satisfies ProviderDiagnostic;
    });
  }

  getProviderDiagnosticDetail(providerId: string): ProviderDiagnosticDetail {
    const diagnostic = this.listProviderDiagnostics().find((item) => item.providerId === providerId);
    if (diagnostic === undefined) {
      throw new Error(`Provider diagnostic not found: ${providerId}`);
    }

    const recentRequestLogs = this.listRequestLogs({
      providerId,
      limit: 10,
      offset: 0
    }).items;
    const recentHealthEvents = this.listRecentProviderHealthEventsForProvider(providerId, 10);

    const recentMessages = [
      diagnostic.lastErrorMessage,
      ...diagnostic.recentErrorMessages
    ]
      .filter((item): item is string => item !== null && item.trim().length > 0)
    const failureCategory = classifyProviderFailure(diagnostic.lastStatusCode, recentMessages);
    const normalizedMessages = recentMessages.join(" ").toLowerCase();

    let recommendation: ProviderDiagnosticDetail["recommendation"] = "ready";
    let recommendationMessage = "Provider runtime looks ready for traffic.";

    if (failureCategory === "auth") {
      recommendation = "check-credentials";
      recommendationMessage = "Recent failures suggest credential or permission issues. Verify API key and upstream access policy.";
    } else if (failureCategory === "rate-limit") {
      recommendation = "check-rate-limit";
      recommendationMessage = "Recent failures suggest upstream rate limiting. Check quota, retry window, or switch failover target.";
    } else if (
      diagnostic.diagnosisStatus === "down" ||
      failureCategory === "upstream-unavailable" ||
      failureCategory === "timeout" ||
      normalizedMessages.includes("503") ||
      normalizedMessages.includes("502")
    ) {
      recommendation = "check-upstream-availability";
      recommendationMessage = "Provider appears unavailable. Check upstream health, network reachability, and recovery probe target.";
    } else if (diagnostic.diagnosisStatus === "degraded" || diagnostic.recentErrorMessages.length > 0) {
      recommendation = "observe-recent-failures";
      recommendationMessage = "Provider is partially degraded. Inspect recent failed requests and probe history before restoring full traffic.";
    }

    return {
      diagnostic,
      recentRequestLogs,
      recentHealthEvents,
      failureCategory,
      recommendation,
      recommendationMessage
    };
  }

  listRecentRequestLogs(limit = 20): ProxyRequestLog[] {
    return this.listRequestLogs({ limit, offset: 0 }).items;
  }

  listRequestLogs(query: ProxyRequestLogQuery): ProxyRequestLogPage {
    const whereClauses: string[] = [];
    const parameters: Array<string | number> = [];

    if (query.appCode !== undefined) {
      whereClauses.push("app_code = ?");
      parameters.push(query.appCode);
    }

    if (query.providerId !== undefined) {
      whereClauses.push("provider_id = ?");
      parameters.push(query.providerId);
    }

    if (query.workspaceId !== undefined) {
      whereClauses.push("workspace_id = ?");
      parameters.push(query.workspaceId);
    }

    if (query.sessionId !== undefined) {
      whereClauses.push("session_id = ?");
      parameters.push(query.sessionId);
    }

    if (query.outcome !== undefined) {
      whereClauses.push("outcome = ?");
      parameters.push(query.outcome);
    }

    if (query.method !== undefined) {
      whereClauses.push("UPPER(method) = UPPER(?)");
      parameters.push(query.method);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS count FROM proxy_request_logs ${whereSql}`)
      .get(...parameters) as { count: number };
    const rows = this.database
      .prepare(`
        SELECT id, app_code, provider_id, target_url, method, path, status_code, latency_ms, outcome, decision_reason, next_provider_id, error_message, created_at
             , workspace_id, session_id, context_source, prompt_template_id, skill_id
        FROM proxy_request_logs
        ${whereSql}
        ORDER BY id DESC
        LIMIT ?
        OFFSET ?
      `)
      .all(...parameters, query.limit, query.offset) as Array<{
        id: number;
        app_code: AppCode;
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
        decision_reason: ProxyRequestDecisionReason | null;
        next_provider_id: string | null;
        error_message: string | null;
        created_at: string;
      }>;

    return {
      items: rows.map(mapRequestLogRow),
      total: totalRow.count,
      limit: query.limit,
      offset: query.offset
    };
  }

  appendRequestLog(input: ProxyRequestLogAppendInput): ProxyRequestLog {
    const createdAt = nowIso();
    const result = this.database
      .prepare(`
        INSERT INTO proxy_request_logs (
          app_code, provider_id, workspace_id, session_id, context_source, prompt_template_id, skill_id,
          target_url, method, path, status_code, latency_ms, outcome, decision_reason, next_provider_id, error_message, created_at
        ) VALUES (
          @appCode, @providerId, @workspaceId, @sessionId, @contextSource, @promptTemplateId, @skillId,
          @targetUrl, @method, @path, @statusCode, @latencyMs, @outcome, @decisionReason, @nextProviderId, @errorMessage, @createdAt
        )
      `)
      .run({
        ...input,
        workspaceId: input.workspaceId ?? null,
        sessionId: input.sessionId ?? null,
        contextSource: input.contextSource ?? null,
        promptTemplateId: input.promptTemplateId ?? null,
        skillId: input.skillId ?? null,
        decisionReason: input.decisionReason ?? null,
        nextProviderId: input.nextProviderId ?? null,
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      appCode: input.appCode,
      providerId: input.providerId,
      workspaceId: input.workspaceId ?? null,
      sessionId: input.sessionId ?? null,
      contextSource: input.contextSource ?? null,
      promptTemplateId: input.promptTemplateId ?? null,
      skillId: input.skillId ?? null,
      targetUrl: input.targetUrl,
      method: input.method,
      path: input.path,
      statusCode: input.statusCode,
      latencyMs: input.latencyMs,
      outcome: input.outcome,
      decisionReason: input.decisionReason ?? null,
      nextProviderId: input.nextProviderId ?? null,
      errorMessage: input.errorMessage
    };
  }

  appendUsageRecord(input: Omit<UsageRecord, "id" | "createdAt" | "totalTokens">): UsageRecord {
    const createdAt = nowIso();
    const totalTokens = input.inputTokens + input.outputTokens;
    const result = this.database
      .prepare(`
        INSERT INTO usage_records (
          request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
        ) VALUES (
          @requestLogId, @appCode, @providerId, @model, @inputTokens, @outputTokens, @totalTokens, @createdAt
        )
      `)
      .run({
        ...input,
        totalTokens,
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      totalTokens,
      ...input
    };
  }

  listUsageRecords(query: UsageRecordQuery): UsageRecordPage {
    const { whereSql, parameters } = buildUsageWhereClause(query);
    const totalRow = this.database
      .prepare(`SELECT COUNT(*) AS count FROM usage_records ${whereSql}`)
      .get(...parameters) as { count: number };
    const rows = this.database
      .prepare(`
        SELECT id, request_log_id, app_code, provider_id, model, input_tokens, output_tokens, total_tokens, created_at
        FROM usage_records
        ${whereSql}
        ORDER BY id DESC
        LIMIT ?
        OFFSET ?
      `)
      .all(...parameters, query.limit, query.offset) as Array<{
        id: number;
        request_log_id: number | null;
        app_code: AppCode;
        provider_id: string | null;
        model: string;
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        created_at: string;
      }>;

    return {
      items: rows.map(mapUsageRecordRow),
      total: totalRow.count,
      limit: query.limit,
      offset: query.offset
    };
  }

  summarizeUsage(query: Omit<UsageRecordQuery, "limit" | "offset"> = {}): UsageSummary {
    const { whereSql, parameters } = buildUsageWhereClause(query);
    const totals = this.database
      .prepare(`
        SELECT
          COUNT(*) AS total_requests,
          COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM usage_records
        ${whereSql}
      `)
      .get(...parameters) as {
        total_requests: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_tokens: number;
      };

    const byApp = this.database
      .prepare(`
        SELECT app_code, COUNT(*) AS request_count, COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM usage_records
        ${whereSql}
        GROUP BY app_code
        ORDER BY total_tokens DESC, app_code ASC
      `)
      .all(...parameters) as Array<{
        app_code: AppCode;
        request_count: number;
        total_tokens: number;
      }>;

    const byProvider = this.database
      .prepare(`
        SELECT provider_id, COUNT(*) AS request_count, COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM usage_records
        ${whereSql}
        GROUP BY provider_id
        ORDER BY total_tokens DESC, provider_id ASC
      `)
      .all(...parameters) as Array<{
        provider_id: string | null;
        request_count: number;
        total_tokens: number;
      }>;

    const byModel = this.database
      .prepare(`
        SELECT model, COUNT(*) AS request_count, COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM usage_records
        ${whereSql}
        GROUP BY model
        ORDER BY total_tokens DESC, model ASC
      `)
      .all(...parameters) as Array<{
        model: string;
        request_count: number;
        total_tokens: number;
      }>;

    return {
      totalRequests: totals.total_requests,
      totalInputTokens: totals.total_input_tokens,
      totalOutputTokens: totals.total_output_tokens,
      totalTokens: totals.total_tokens,
      byApp: byApp.map((row) => ({
        appCode: row.app_code,
        requestCount: row.request_count,
        totalTokens: row.total_tokens
      })),
      byProvider: byProvider.map((row) => ({
        providerId: row.provider_id,
        requestCount: row.request_count,
        totalTokens: row.total_tokens
      })),
      byModel: byModel.map((row) => ({
        model: row.model,
        requestCount: row.request_count,
        totalTokens: row.total_tokens
      }))
    };
  }

  summarizeUsageTimeseries(query: UsageTimeseriesQuery): UsageTimeseries {
    const { whereSql, parameters } = buildUsageWhereClause(query);
    const bucketExpression =
      query.bucket === "hour"
        ? "strftime('%Y-%m-%dT%H:00:00.000Z', created_at)"
        : "strftime('%Y-%m-%dT00:00:00.000Z', created_at)";

    const rows = this.database
      .prepare(`
        SELECT
          ${bucketExpression} AS bucket_start,
          COUNT(*) AS request_count,
          COALESCE(SUM(total_tokens), 0) AS total_tokens,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM usage_records
        ${whereSql}
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
      `)
      .all(...parameters) as Array<{
        bucket_start: string;
        request_count: number;
        total_tokens: number;
        input_tokens: number;
        output_tokens: number;
      }>;

    return {
      bucket: query.bucket,
      points: rows.map((row) => ({
        bucketStart: row.bucket_start,
        requestCount: row.request_count,
        totalTokens: row.total_tokens,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens
      }))
    };
  }

  appendProviderHealthEvent(
    input: Omit<ProviderHealthEvent, "id" | "createdAt">
  ): ProviderHealthEvent {
    const createdAt = nowIso();
    const result = this.database
      .prepare(`
        INSERT INTO provider_health_events (
          provider_id, trigger, status, status_code, probe_url, message, created_at
        ) VALUES (
          @providerId, @trigger, @status, @statusCode, @probeUrl, @message, @createdAt
        )
      `)
      .run({
        ...input,
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      ...input
    };
  }

  listRecentProviderHealthEvents(limit = 20): ProviderHealthEvent[] {
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

  listRecentProviderHealthEventsForProvider(providerId: string, limit = 20): ProviderHealthEvent[] {
    const rows = this.database
      .prepare(`
        SELECT id, provider_id, trigger, status, status_code, probe_url, message, created_at
        FROM provider_health_events
        WHERE provider_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(providerId, limit) as Array<{
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

  listRecoveryProbeTargets(): ProviderRecoveryProbeTarget[] {
    const targets = new Map<string, ProviderRecoveryProbeTarget>();

    for (const runtimeTargets of this.runtimeTargets.values()) {
      for (const target of runtimeTargets) {
        if (!isExecutableTarget(target)) {
          continue;
        }

        const state = this.ensureProviderHealthState(target.providerId);
        if (state.cooldownUntil === null || Date.now() < state.cooldownUntil) {
          continue;
        }
        if (state.recoveryProbeInFlight) {
          continue;
        }

        if (!targets.has(target.providerId)) {
          targets.set(target.providerId, {
            providerId: target.providerId,
            providerName: target.providerName,
            providerType: target.providerType,
            upstreamBaseUrl: target.upstreamBaseUrl,
            apiKeyPlaintext: target.apiKeyPlaintext,
            cooldownSeconds: target.cooldownSeconds
          });
        }
      }
    }

    return Array.from(targets.values());
  }

  getProbeTarget(providerId: string): ProviderRecoveryProbeTarget | null {
    for (const runtimeTargets of this.runtimeTargets.values()) {
      for (const target of runtimeTargets) {
        if (target.providerId === providerId) {
          return {
            providerId: target.providerId,
            providerName: target.providerName,
            providerType: target.providerType,
            upstreamBaseUrl: target.upstreamBaseUrl,
            apiKeyPlaintext: target.apiKeyPlaintext,
            cooldownSeconds: target.cooldownSeconds
          };
        }
      }
    }

    const runtimeProvider = this.providerRepository
      .listRuntime()
      .find((provider) => provider.id === providerId);
    if (runtimeProvider !== undefined) {
      return {
        providerId: runtimeProvider.id,
        providerName: runtimeProvider.name,
        providerType: runtimeProvider.providerType,
        upstreamBaseUrl: runtimeProvider.baseUrl,
        apiKeyPlaintext: runtimeProvider.apiKeyPlaintext,
        cooldownSeconds: 30
      };
    }

    return null;
  }

  beginRecoveryProbe(providerId: string): boolean {
    const state = this.ensureProviderHealthState(providerId);
    if (state.recoveryProbeInFlight) {
      return false;
    }

    state.recoveryProbeInFlight = true;
    state.lastProbeAt = nowIso();
    return true;
  }

  markProbeRecoverySuccess(providerId: string): void {
    this.recordSuccess(providerId);
  }

  markProbeRecoveryFailure(
    providerId: string,
    cooldownSeconds: number,
    errorMessage: string
  ): void {
    const state = this.ensureProviderHealthState(providerId);
    state.recoveryAttemptCount += 1;
    const backoffSeconds = computeRecoveryBackoffSeconds(
      cooldownSeconds,
      state.recoveryAttemptCount
    );
    state.recoveryProbeInFlight = false;
    state.circuitOpenedAt = Date.now();
    state.cooldownUntil = Date.now() + backoffSeconds * 1000;
    state.lastFailureAt = nowIso();
    state.lastProbeAt = state.lastFailureAt;
    state.lastProbeResult = "unhealthy";
    state.lastErrorMessage = errorMessage;
  }

  isolateProvider(
    providerId: string,
    reason: string,
    cooldownSeconds?: number
  ): ProviderHealthActionResult {
    const target = this.getProbeTarget(providerId);
    if (target === null) {
      throw new Error(`Provider not available for isolate: ${providerId}`);
    }

    const nextCooldownSeconds = Math.max(cooldownSeconds ?? target.cooldownSeconds, 5);
    const state = this.ensureProviderHealthState(providerId);
    const eventTime = nowIso();
    state.consecutiveFailures = Math.max(state.consecutiveFailures, 1);
    state.circuitOpenedAt = Date.now();
    state.cooldownUntil = Date.now() + nextCooldownSeconds * 1000;
    state.recoveryAttemptCount = 0;
    state.recoveryProbeInFlight = false;
    state.lastFailureAt = eventTime;
    state.lastProbeAt = eventTime;
    state.lastProbeResult = "unhealthy";
    state.lastErrorMessage = reason;

    return {
      providerId,
      action: "isolate",
      circuitState: "open",
      cooldownUntil: new Date(state.cooldownUntil).toISOString(),
      message: reason
    };
  }

  resetProviderCircuit(providerId: string, reason: string): ProviderHealthActionResult {
    const target = this.getProbeTarget(providerId);
    if (target === null) {
      throw new Error(`Provider not available for reset: ${providerId}`);
    }

    const state = this.ensureProviderHealthState(providerId);
    const eventTime = nowIso();
    state.consecutiveFailures = 0;
    state.circuitOpenedAt = null;
    state.cooldownUntil = null;
    state.recoveryAttemptCount = 0;
    state.recoveryProbeInFlight = false;
    state.lastRecoveredAt = eventTime;
    state.lastSuccessAt = eventTime;
    state.lastProbeAt = eventTime;
    state.lastProbeResult = "healthy";
    state.lastErrorMessage = null;

    return {
      providerId,
      action: "reset",
      circuitState: "closed",
      cooldownUntil: null,
      message: reason
    };
  }

  private buildProviderOrder(primaryProviderId: string, chain: FailoverChain | undefined): string[] {
    return Array.from(
      new Set([primaryProviderId, ...(chain?.providerIds ?? [])])
    );
  }

  private ensureProviderHealthState(providerId: string): MutableProviderHealthState {
    const existing = this.providerHealthStates.get(providerId);
    if (existing !== undefined) {
      return existing;
    }

    const state: MutableProviderHealthState = {
      providerId,
      consecutiveFailures: 0,
      circuitOpenedAt: null,
      cooldownUntil: null,
      recoveryAttemptCount: 0,
      recoveryProbeInFlight: false,
      lastFailureAt: null,
      lastSuccessAt: null,
      lastRecoveredAt: null,
      lastProbeAt: null,
      lastProbeResult: null,
      lastErrorMessage: null
    };
    this.providerHealthStates.set(providerId, state);
    return state;
  }

  private hasRecentUnhealthySignal(providerId: string): boolean {
    const state = this.ensureProviderHealthState(providerId);
    if (state.lastProbeResult !== "unhealthy") {
      return false;
    }

    return !hasIsoPriority(state.lastSuccessAt, state.lastFailureAt);
  }

  private readCircuitState(
    providerId: string,
    cooldownSeconds: number
  ): ProviderHealthState["circuitState"] {
    const state = this.ensureProviderHealthState(providerId);
    if (state.cooldownUntil === null) {
      return "closed";
    }

    if (Date.now() >= state.cooldownUntil) {
      return "half-open";
    }

    return "open";
  }

  private listProviderHealthStates(): ProviderHealthState[] {
    return Array.from(this.providerHealthStates.values()).map((state) => ({
      providerId: state.providerId,
      circuitState:
        state.cooldownUntil === null
          ? "closed"
          : Date.now() >= state.cooldownUntil
            ? "half-open"
            : "open",
      consecutiveFailures: state.consecutiveFailures,
      lastFailureAt: state.lastFailureAt,
      lastSuccessAt: state.lastSuccessAt,
      lastRecoveredAt: state.lastRecoveredAt,
      lastProbeAt: state.lastProbeAt,
      lastProbeResult: state.lastProbeResult,
      recoveryProbeInFlight: state.recoveryProbeInFlight,
      recoveryAttemptCount: state.recoveryAttemptCount,
      nextRecoveryProbeAt:
        state.cooldownUntil === null ? null : new Date(state.cooldownUntil).toISOString(),
      cooldownUntil:
        state.cooldownUntil === null ? null : new Date(state.cooldownUntil).toISOString(),
      lastErrorMessage: state.lastErrorMessage
    }));
  }

  private stripSecret(target: RuntimeTarget): ProxyBindingRuntime {
    const { apiKeyPlaintext: _apiKeyPlaintext, ...rest } = target;
    return rest;
  }

  private countRequestLogs(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM proxy_request_logs")
      .get() as { count: number };

    return row.count;
  }

  private countUsageRecords(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS count FROM usage_records")
      .get() as { count: number };

    return row.count;
  }
}
