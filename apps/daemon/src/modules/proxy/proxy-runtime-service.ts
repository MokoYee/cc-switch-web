import {
  nowIso,
  type AppCode,
  type FailoverChain,
  type ProxyPolicy,
  type ProviderType
} from "@ai-cli-switch/shared";

import type { SqliteDatabase } from "../../db/database.js";
import type { BindingRepository } from "../bindings/binding-repository.js";
import type { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import type { RuntimeProvider, ProviderRepository } from "../providers/provider-repository.js";
import type { ProxyStatus } from "./proxy-service.js";

export interface ProxyRequestLog {
  readonly id: number;
  readonly appCode: AppCode;
  readonly providerId: string | null;
  readonly targetUrl: string | null;
  readonly method: string;
  readonly path: string;
  readonly statusCode: number | null;
  readonly latencyMs: number;
  readonly outcome: "success" | "error" | "rejected" | "failover";
  readonly errorMessage: string | null;
  readonly createdAt: string;
}

export interface ProviderHealthState {
  readonly providerId: string;
  readonly circuitState: "closed" | "open" | "half-open";
  readonly consecutiveFailures: number;
  readonly lastFailureAt: string | null;
  readonly lastSuccessAt: string | null;
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
  readonly failoverEnabled: boolean;
  readonly openedCircuits: string[];
  readonly maxAttempts: number;
}

export interface ProxyRuntimeView {
  readonly runtimeState: ProxyStatus["runtimeState"];
  readonly policy: ProxyPolicy;
  readonly snapshotVersion: number | null;
  readonly lastReloadedAt: string | null;
  readonly activeBindings: ProxyBindingRuntime[];
  readonly failoverChains: FailoverChain[];
  readonly providerHealthStates: ProviderHealthState[];
  readonly requestLogCount: number;
}

interface MutableProviderHealthState {
  providerId: string;
  consecutiveFailures: number;
  circuitOpenedAt: number | null;
  cooldownUntil: number | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  lastErrorMessage: string | null;
}

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

  createExecutionPlan(appCode: string): ProxyExecutionPlan | null {
    const candidates = this.runtimeTargets.get(appCode as AppCode);
    if (candidates === undefined || candidates.length === 0) {
      return null;
    }

    const primary = candidates[0];
    if (primary === undefined) {
      return null;
    }
    const openedCircuits: string[] = [];
    const readyCandidates: RuntimeTarget[] = [];
    const fallbackCandidates: RuntimeTarget[] = [];
    const maxAttempts = Math.min(
      primary.failoverEnabled ? Math.max(primary.maxAttempts, 1) : 1,
      candidates.length
    );

    for (const candidate of candidates) {
      const state = this.readCircuitState(candidate.providerId, candidate.cooldownSeconds);
      if (state === "open") {
        openedCircuits.push(candidate.providerId);
        continue;
      }

      if (state === "half-open") {
        fallbackCandidates.push(candidate);
        continue;
      }

      readyCandidates.push(candidate);
    }

    const orderedCandidates = [...readyCandidates, ...fallbackCandidates].slice(0, maxAttempts);

    return {
      appCode: primary.appCode,
      candidates: orderedCandidates,
      failoverEnabled: primary.failoverEnabled,
      openedCircuits,
      maxAttempts
    };
  }

  recordSuccess(providerId: string): void {
    const state = this.ensureProviderHealthState(providerId);
    state.consecutiveFailures = 0;
    state.circuitOpenedAt = null;
    state.cooldownUntil = null;
    state.lastSuccessAt = nowIso();
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
    state.lastErrorMessage = errorMessage;

    if (state.consecutiveFailures >= failureThreshold) {
      state.circuitOpenedAt = Date.now();
      state.cooldownUntil = Date.now() + cooldownSeconds * 1000;
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
      requestLogCount: this.countRequestLogs()
    };
  }

  listRecentRequestLogs(limit = 20): ProxyRequestLog[] {
    const rows = this.database
      .prepare(`
        SELECT id, app_code, provider_id, target_url, method, path, status_code, latency_ms, outcome, error_message, created_at
        FROM proxy_request_logs
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        app_code: AppCode;
        provider_id: string | null;
        target_url: string | null;
        method: string;
        path: string;
        status_code: number | null;
        latency_ms: number;
        outcome: ProxyRequestLog["outcome"];
        error_message: string | null;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      appCode: row.app_code,
      providerId: row.provider_id,
      targetUrl: row.target_url,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      latencyMs: row.latency_ms,
      outcome: row.outcome,
      errorMessage: row.error_message,
      createdAt: row.created_at
    }));
  }

  appendRequestLog(input: Omit<ProxyRequestLog, "id" | "createdAt">): ProxyRequestLog {
    const createdAt = nowIso();
    const result = this.database
      .prepare(`
        INSERT INTO proxy_request_logs (
          app_code, provider_id, target_url, method, path, status_code, latency_ms, outcome, error_message, created_at
        ) VALUES (
          @appCode, @providerId, @targetUrl, @method, @path, @statusCode, @latencyMs, @outcome, @errorMessage, @createdAt
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
      lastFailureAt: null,
      lastSuccessAt: null,
      lastErrorMessage: null
    };
    this.providerHealthStates.set(providerId, state);
    return state;
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
      state.cooldownUntil = null;
      state.circuitOpenedAt = null;
      state.consecutiveFailures = 0;
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
}
