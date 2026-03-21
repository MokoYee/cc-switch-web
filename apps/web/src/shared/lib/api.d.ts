import { type AppBinding, type AppBindingUpsert, type ConfigSnapshot, type ExportPackage, type FailoverChain, type FailoverChainUpsert, type HostCliDiscovery, type ProviderUpsert, type Provider, type ProxyPolicy, type SystemMetadata } from "@ai-cli-switch/shared";
declare global {
    interface Window {
        AICLI_SWITCH_API_BASE_URL?: string;
    }
}
export declare class UnauthorizedApiError extends Error {
    constructor();
}
export declare class ApiRequestError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
export declare const readStoredControlToken: () => string | null;
export declare const writeStoredControlToken: (token: string) => void;
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
export declare const loadDashboardSnapshot: () => Promise<DashboardSnapshot>;
export declare const saveProvider: (input: ProviderUpsert) => Promise<void>;
export declare const saveBinding: (input: AppBindingUpsert) => Promise<void>;
export declare const saveFailoverChain: (input: FailoverChainUpsert) => Promise<void>;
export declare const saveProxyPolicy: (policy: ProxyPolicy) => Promise<void>;
export declare const deleteProvider: (id: string) => Promise<void>;
export declare const deleteBinding: (id: string) => Promise<void>;
export declare const deleteFailoverChain: (id: string) => Promise<void>;
export declare const exportCurrentConfig: () => Promise<ExportPackage>;
export declare const importConfigPackage: (input: unknown) => Promise<ExportPackage>;
export declare const restoreLatestSnapshot: () => Promise<void>;
