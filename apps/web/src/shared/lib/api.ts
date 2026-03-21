import {
  type AppBinding,
  type AppBindingUpsert,
  type ConfigSnapshot,
  exportPackageSchema,
  type ExportPackage,
  type FailoverChain,
  type FailoverChainUpsert,
  type HostCliDiscovery,
  type ProviderUpsert,
  type Provider,
  type ProxyPolicy,
  type SystemMetadata
} from "@ai-cli-switch/shared";

declare global {
  interface Window {
    AICLI_SWITCH_API_BASE_URL?: string;
  }
}

const CONTROL_TOKEN_STORAGE_KEY = "ai-cli-switch.control-token";

const resolveApiBaseUrl = (): string =>
  window.AICLI_SWITCH_API_BASE_URL ?? import.meta.env.VITE_AICLI_SWITCH_API_BASE_URL ?? "http://127.0.0.1:8787";

export class UnauthorizedApiError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export const readStoredControlToken = (): string | null =>
  window.localStorage.getItem(CONTROL_TOKEN_STORAGE_KEY);

export const writeStoredControlToken = (token: string): void => {
  window.localStorage.setItem(CONTROL_TOKEN_STORAGE_KEY, token);
};

const readJson = async <T>(path: string): Promise<T> => {
  return requestJson<T>(path, { method: "GET" });
};

const requestJson = async <T>(
  path: string,
  init: RequestInit
): Promise<T> => {
  const token = readStoredControlToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include"
  });

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const body = (await response.json()) as { message?: string };
      if (typeof body.message === "string" && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // 非 JSON 响应保留状态码即可。
    }

    throw new ApiRequestError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

const writeJson = async <T>(
  path: string,
  method: "POST" | "PUT",
  body: unknown
): Promise<T> =>
  requestJson<T>(path, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

const deleteJson = async <T>(path: string): Promise<T> =>
  requestJson<T>(path, { method: "DELETE" });

export interface DashboardSnapshot {
  readonly health: {
    readonly status: string;
    readonly service: string;
    readonly time: string;
  };
  readonly providers: Provider[];
  readonly bindings: AppBinding[];
  readonly failoverChains: FailoverChain[];
  readonly discoveries: HostCliDiscovery[];
  readonly metadata: SystemMetadata;
  readonly runtime: {
    readonly daemonHost: string;
    readonly daemonPort: number;
    readonly allowedOrigins: string[];
    readonly allowAnyOrigin: boolean;
    readonly dataDir: string;
    readonly dbPath: string;
    readonly latestSnapshotVersion: number | null;
  };
  readonly proxyRuntime: {
    readonly runtimeState: "stopped" | "starting" | "running";
    readonly policy: ProxyPolicy;
    readonly snapshotVersion: number | null;
    readonly lastReloadedAt: string | null;
    readonly activeBindings: Array<{
      readonly appCode: AppBinding["appCode"];
      readonly mode: AppBinding["mode"];
      readonly providerId: string;
      readonly providerName: string;
      readonly providerType: Provider["providerType"];
      readonly enabled: boolean;
      readonly upstreamBaseUrl: string;
      readonly hasCredential: boolean;
      readonly timeoutMs: number;
      readonly proxyBasePath: string;
    }>;
    readonly failoverChains: FailoverChain[];
    readonly providerHealthStates: Array<{
      readonly providerId: string;
      readonly circuitState: "closed" | "open" | "half-open";
      readonly consecutiveFailures: number;
      readonly lastFailureAt: string | null;
      readonly lastSuccessAt: string | null;
      readonly cooldownUntil: string | null;
      readonly lastErrorMessage: string | null;
    }>;
    readonly requestLogCount: number;
  };
  readonly proxyRequestLogs: Array<{
    readonly id: number;
    readonly appCode: AppBinding["appCode"];
    readonly providerId: string | null;
    readonly targetUrl: string | null;
    readonly method: string;
    readonly path: string;
    readonly statusCode: number | null;
    readonly latencyMs: number;
    readonly outcome: "success" | "error" | "rejected";
    readonly errorMessage: string | null;
    readonly createdAt: string;
  }>;
  readonly latestSnapshot: ConfigSnapshot | null;
}

export const loadDashboardSnapshot = async (): Promise<DashboardSnapshot> => {
  const [
    health,
    providersResult,
    bindingsResult,
    failoverChainsResult,
    discoveriesResult,
    metadata,
    runtime,
    proxyRuntime,
    proxyRequestLogsResult,
    latestSnapshot
  ] =
    await Promise.all([
      readJson<DashboardSnapshot["health"]>("/health"),
      readJson<{ items: Provider[] }>("/api/v1/providers"),
      readJson<{ items: AppBinding[] }>("/api/v1/app-bindings"),
      readJson<{ items: FailoverChain[] }>("/api/v1/failover-chains"),
      readJson<{ items: HostCliDiscovery[] }>("/api/v1/host-discovery"),
      readJson<SystemMetadata>("/api/v1/system/metadata"),
      readJson<DashboardSnapshot["runtime"]>("/api/v1/system/runtime"),
      readJson<DashboardSnapshot["proxyRuntime"]>("/api/v1/proxy-runtime"),
      readJson<{ items: DashboardSnapshot["proxyRequestLogs"] }>("/api/v1/proxy-request-logs"),
      readJson<DashboardSnapshot["latestSnapshot"]>("/api/v1/snapshots/latest")
    ]);

  return {
    health,
    providers: providersResult.items,
    bindings: bindingsResult.items,
    failoverChains: failoverChainsResult.items,
    discoveries: discoveriesResult.items,
    metadata,
    runtime,
    proxyRuntime,
    proxyRequestLogs: proxyRequestLogsResult.items,
    latestSnapshot
  };
};

export const saveProvider = async (input: ProviderUpsert): Promise<void> => {
  await writeJson("/api/v1/providers", "POST", input);
};

export const saveBinding = async (input: AppBindingUpsert): Promise<void> => {
  await writeJson("/api/v1/app-bindings", "POST", input);
};

export const saveFailoverChain = async (input: FailoverChainUpsert): Promise<void> => {
  await writeJson("/api/v1/failover-chains", "POST", input);
};

export const saveProxyPolicy = async (policy: ProxyPolicy): Promise<void> => {
  await writeJson("/api/v1/proxy-policy", "PUT", policy);
};

export const deleteProvider = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/providers/${encodeURIComponent(id)}`);
};

export const deleteBinding = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/app-bindings/${encodeURIComponent(id)}`);
};

export const deleteFailoverChain = async (id: string): Promise<void> => {
  await deleteJson(`/api/v1/failover-chains/${encodeURIComponent(id)}`);
};

export const exportCurrentConfig = async (): Promise<ExportPackage> => {
  const result = await readJson<ExportPackage>("/api/v1/import-export/export");
  return exportPackageSchema.parse(result);
};

export const importConfigPackage = async (input: unknown): Promise<ExportPackage> => {
  const result = await writeJson<ExportPackage>("/api/v1/import-export/import", "POST", input);
  return exportPackageSchema.parse(result);
};

export const restoreLatestSnapshot = async (): Promise<void> => {
  await writeJson("/api/v1/snapshots/latest/restore", "POST", {});
};
