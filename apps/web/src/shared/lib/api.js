import { exportPackageSchema } from "@ai-cli-switch/shared";
const CONTROL_TOKEN_STORAGE_KEY = "ai-cli-switch.control-token";
const resolveApiBaseUrl = () => window.AICLI_SWITCH_API_BASE_URL ?? import.meta.env.VITE_AICLI_SWITCH_API_BASE_URL ?? "http://127.0.0.1:8787";
export class UnauthorizedApiError extends Error {
    constructor() {
        super("Unauthorized");
    }
}
export class ApiRequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export const readStoredControlToken = () => window.localStorage.getItem(CONTROL_TOKEN_STORAGE_KEY);
export const writeStoredControlToken = (token) => {
    window.localStorage.setItem(CONTROL_TOKEN_STORAGE_KEY, token);
};
const readJson = async (path) => {
    return requestJson(path, { method: "GET" });
};
const requestJson = async (path, init) => {
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
            const body = (await response.json());
            if (typeof body.message === "string" && body.message.length > 0) {
                message = body.message;
            }
        }
        catch {
            // 非 JSON 响应保留状态码即可。
        }
        throw new ApiRequestError(response.status, message);
    }
    if (response.status === 204) {
        return undefined;
    }
    return (await response.json());
};
const writeJson = async (path, method, body) => requestJson(path, {
    method,
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
});
const deleteJson = async (path) => requestJson(path, { method: "DELETE" });
export const loadDashboardSnapshot = async () => {
    const [health, providersResult, bindingsResult, failoverChainsResult, discoveriesResult, metadata, runtime, proxyRuntime, proxyRequestLogsResult, latestSnapshot] = await Promise.all([
        readJson("/health"),
        readJson("/api/v1/providers"),
        readJson("/api/v1/app-bindings"),
        readJson("/api/v1/failover-chains"),
        readJson("/api/v1/host-discovery"),
        readJson("/api/v1/system/metadata"),
        readJson("/api/v1/system/runtime"),
        readJson("/api/v1/proxy-runtime"),
        readJson("/api/v1/proxy-request-logs"),
        readJson("/api/v1/snapshots/latest")
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
export const saveProvider = async (input) => {
    await writeJson("/api/v1/providers", "POST", input);
};
export const saveBinding = async (input) => {
    await writeJson("/api/v1/app-bindings", "POST", input);
};
export const saveFailoverChain = async (input) => {
    await writeJson("/api/v1/failover-chains", "POST", input);
};
export const saveProxyPolicy = async (policy) => {
    await writeJson("/api/v1/proxy-policy", "PUT", policy);
};
export const deleteProvider = async (id) => {
    await deleteJson(`/api/v1/providers/${encodeURIComponent(id)}`);
};
export const deleteBinding = async (id) => {
    await deleteJson(`/api/v1/app-bindings/${encodeURIComponent(id)}`);
};
export const deleteFailoverChain = async (id) => {
    await deleteJson(`/api/v1/failover-chains/${encodeURIComponent(id)}`);
};
export const exportCurrentConfig = async () => {
    const result = await readJson("/api/v1/import-export/export");
    return exportPackageSchema.parse(result);
};
export const importConfigPackage = async (input) => {
    const result = await writeJson("/api/v1/import-export/import", "POST", input);
    return exportPackageSchema.parse(result);
};
export const restoreLatestSnapshot = async () => {
    await writeJson("/api/v1/snapshots/latest/restore", "POST", {});
};
//# sourceMappingURL=api.js.map