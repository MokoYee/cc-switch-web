import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher.js";
import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import { deleteBinding, deleteFailoverChain, deleteProvider, exportCurrentConfig, importConfigPackage, loadDashboardSnapshot, restoreLatestSnapshot, saveBinding, saveFailoverChain, saveProvider, saveProxyPolicy } from "../api/load-dashboard-snapshot.js";
import { MetricCard } from "./MetricCard.js";
import { UnauthorizedApiError, writeStoredControlToken } from "../../../shared/lib/api.js";
const renderProviderType = (provider) => provider.providerType;
const renderBindingMode = (binding, t) => (binding.mode === "managed" ? t("common.managed") : t("common.observe"));
const renderDiscoveryPath = (discovery, t) => discovery.executablePath ?? t("common.notFound");
const currentProxyFallback = (snapshot) => ({
    listenHost: snapshot.latestSnapshot?.payload.proxyPolicy.listenHost ?? "127.0.0.1",
    listenPort: snapshot.latestSnapshot?.payload.proxyPolicy.listenPort ?? 8788,
    enabled: snapshot.latestSnapshot?.payload.proxyPolicy.enabled ?? false,
    requestTimeoutMs: snapshot.latestSnapshot?.payload.proxyPolicy.requestTimeoutMs ?? 60000,
    failureThreshold: snapshot.latestSnapshot?.payload.proxyPolicy.failureThreshold ?? 3
});
const toJsonString = (value) => JSON.stringify(value, null, 2);
const joinProviderIds = (providerIds) => providerIds.join(", ");
const splitProviderIds = (rawValue) => rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const buildProxyEndpoint = (daemonHost, daemonPort, proxyBasePath) => `http://${daemonHost}:${daemonPort}${proxyBasePath}`;
export const DashboardPage = () => {
    const { t } = useI18n();
    const [snapshot, setSnapshot] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [noticeMessage, setNoticeMessage] = useState(null);
    const [needsToken, setNeedsToken] = useState(false);
    const [tokenInput, setTokenInput] = useState("");
    const [isWorking, setIsWorking] = useState(false);
    const [exportText, setExportText] = useState("");
    const [importText, setImportText] = useState("");
    const [providerForm, setProviderForm] = useState({
        id: "provider-new",
        name: "New Provider",
        providerType: "openai-compatible",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
        enabled: true,
        timeoutMs: 30000
    });
    const [bindingForm, setBindingForm] = useState({
        id: "binding-codex",
        appCode: "codex",
        providerId: "provider-openai-main",
        mode: "managed"
    });
    const [proxyForm, setProxyForm] = useState({
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: false,
        requestTimeoutMs: 60000,
        failureThreshold: 3
    });
    const [failoverForm, setFailoverForm] = useState({
        id: "failover-codex",
        appCode: "codex",
        enabled: false,
        providerIds: ["provider-openai-main"],
        cooldownSeconds: 30,
        maxAttempts: 2
    });
    const refreshSnapshot = () => {
        setNoticeMessage(null);
        void loadDashboardSnapshot()
            .then((result) => {
            setNeedsToken(false);
            setErrorMessage(null);
            setSnapshot(result);
            setBindingForm((current) => ({
                ...current,
                providerId: result.providers[0]?.id ?? current.providerId
            }));
            setFailoverForm((current) => ({
                ...current,
                providerIds: current.providerIds.length > 0
                    ? current.providerIds
                    : result.providers[0]?.id
                        ? [result.providers[0].id]
                        : []
            }));
            setProxyForm(currentProxyFallback(result));
        })
            .catch((error) => {
            if (error instanceof UnauthorizedApiError) {
                setNeedsToken(true);
                setErrorMessage(null);
                return;
            }
            setErrorMessage(error instanceof Error ? error.message : "unknown error");
        });
    };
    const runAction = (task, successMessage) => {
        setIsWorking(true);
        setNoticeMessage(null);
        setErrorMessage(null);
        void task()
            .then(() => {
            setNoticeMessage(successMessage);
            refreshSnapshot();
        })
            .catch((error) => {
            setErrorMessage(error instanceof Error ? error.message : "unknown error");
        })
            .finally(() => {
            setIsWorking(false);
        });
    };
    useEffect(() => {
        refreshSnapshot();
    }, []);
    return (_jsxs("main", { className: "page-shell", children: [_jsxs("section", { className: "hero", children: [_jsxs("div", { className: "hero-topbar", children: [_jsx("p", { className: "eyebrow", children: t("app.eyebrow") }), _jsx(LanguageSwitcher, {})] }), _jsx("h1", { children: t("app.title") }), _jsx("p", { className: "hero-copy", children: t("app.description") }), _jsx("p", { className: "hero-hint", children: t("app.openSourceHint") }), _jsxs("p", { className: "hero-locale", children: [t("app.localeSummary"), ": ", snapshot?.metadata.supportedLocales.join(" / ") ?? "zh-CN / en-US"] })] }), errorMessage ? (_jsxs("section", { className: "panel error-panel", children: [_jsx("h2", { children: t("dashboard.backendErrorTitle") }), _jsx("p", { children: errorMessage })] })) : null, noticeMessage ? (_jsx("section", { className: "panel success-panel", children: _jsx("p", { children: noticeMessage }) })) : null, needsToken ? (_jsxs("section", { className: "panel auth-panel", children: [_jsx("h2", { children: t("dashboard.controlTokenTitle") }), _jsx("p", { children: t("dashboard.controlTokenDescription") }), _jsxs("div", { className: "auth-row", children: [_jsx("input", { className: "auth-input", type: "password", value: tokenInput, onChange: (event) => setTokenInput(event.target.value), placeholder: t("dashboard.controlTokenPlaceholder") }), _jsx("button", { className: "auth-button", type: "button", onClick: () => {
                                    writeStoredControlToken(tokenInput);
                                    window.location.reload();
                                }, children: t("dashboard.controlTokenSave") })] })] })) : null, snapshot ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "metrics-grid", children: [_jsx(MetricCard, { label: t("dashboard.metrics.serviceStatus"), value: snapshot.health.status, hint: snapshot.health.service }), _jsx(MetricCard, { label: t("dashboard.metrics.providerCount"), value: snapshot.providers.length, hint: t("dashboard.metrics.providerHint") }), _jsx(MetricCard, { label: t("dashboard.metrics.bindingCount"), value: snapshot.bindings.length, hint: t("dashboard.metrics.bindingHint") }), _jsx(MetricCard, { label: t("dashboard.metrics.discoveryCount"), value: snapshot.discoveries.filter((item) => item.discovered).length, hint: t("dashboard.metrics.discoveryHint") }), _jsx(MetricCard, { label: t("dashboard.metrics.proxyRequestCount"), value: snapshot.proxyRuntime.requestLogCount, hint: t("dashboard.metrics.proxyRequestHint") })] }), _jsxs("section", { className: "content-grid", children: [_jsxs("article", { className: "panel", children: [_jsx("h2", { children: t("dashboard.panels.providers") }), _jsx("div", { className: "list", children: snapshot.providers.map((provider) => (_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: provider.name }), _jsx("p", { children: renderProviderType(provider) })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: provider.enabled ? t("common.enabled") : t("common.disabled") }), _jsx("code", { children: provider.apiKeyMasked }), _jsx("button", { className: "inline-action danger", type: "button", disabled: isWorking, onClick: () => runAction(() => deleteProvider(provider.id), t("dashboard.forms.deleteSuccess")), children: t("common.delete") })] })] }, provider.id))) })] }), _jsxs("article", { className: "panel", children: [_jsx("h2", { children: t("dashboard.panels.bindings") }), _jsx("div", { className: "list", children: snapshot.bindings.map((binding) => (_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: binding.appCode }), _jsx("p", { children: binding.providerId })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: renderBindingMode(binding, t) }), _jsx("button", { className: "inline-action danger", type: "button", disabled: isWorking, onClick: () => runAction(() => deleteBinding(binding.id), t("dashboard.forms.deleteSuccess")), children: t("common.delete") })] })] }, binding.id))) })] }), _jsxs("article", { className: "panel", children: [_jsx("h2", { children: t("dashboard.panels.failoverChains") }), _jsx("div", { className: "list", children: snapshot.failoverChains.map((chain) => (_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: chain.appCode }), _jsx("p", { children: joinProviderIds(chain.providerIds) })] }), _jsxs("div", { className: "row-meta", children: [_jsxs("span", { children: [chain.enabled ? t("common.enabled") : t("common.disabled"), " / ", chain.maxAttempts] }), _jsx("button", { className: "inline-action danger", type: "button", disabled: isWorking, onClick: () => runAction(() => deleteFailoverChain(chain.id), t("dashboard.forms.deleteSuccess")), children: t("common.delete") })] })] }, chain.id))) })] }), _jsxs("article", { className: "panel", children: [_jsx("h2", { children: t("dashboard.panels.proxyRuntime") }), _jsxs("div", { className: "list", children: [_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: snapshot.proxyRuntime.runtimeState }), _jsx("p", { children: snapshot.proxyRuntime.policy.enabled ? t("common.enabled") : t("common.disabled") })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: t("dashboard.runtime.proxyReloadedAt") }), _jsx("code", { children: snapshot.proxyRuntime.lastReloadedAt ?? "none" })] })] }), snapshot.proxyRuntime.activeBindings.map((binding) => (_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: binding.appCode }), _jsx("p", { children: binding.providerName })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: binding.hasCredential ? t("dashboard.runtime.credentialReady") : t("dashboard.runtime.credentialMissing") }), _jsx("code", { children: buildProxyEndpoint(snapshot.runtime.daemonHost, snapshot.runtime.daemonPort, binding.proxyBasePath) })] })] }, binding.appCode))), snapshot.proxyRuntime.providerHealthStates.map((state) => (_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: state.providerId }), _jsx("p", { children: state.circuitState })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: state.consecutiveFailures }), _jsx("code", { children: state.cooldownUntil ?? "ready" })] })] }, state.providerId)))] })] }), _jsxs("article", { className: "panel", children: [_jsx("h2", { children: t("dashboard.panels.discoveries") }), _jsx("div", { className: "list", children: snapshot.discoveries.map((item) => (_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: item.appCode }), _jsx("p", { children: item.status })] }), _jsx("div", { className: "row-meta", children: _jsx("code", { children: renderDiscoveryPath(item, t) }) })] }, item.appCode))) })] }), _jsxs("article", { className: "panel", children: [_jsx("h2", { children: t("dashboard.runtimeTitle") }), _jsxs("div", { className: "list", children: [_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: "releaseStage" }), _jsx("p", { children: snapshot.metadata.releaseStage })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: "repositoryMode" }), _jsx("code", { children: snapshot.metadata.repositoryMode })] })] }), _jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: "daemon" }), _jsxs("p", { children: [snapshot.runtime.daemonHost, ":", snapshot.runtime.daemonPort] })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: "dataDir" }), _jsx("code", { children: snapshot.runtime.dataDir })] })] }), _jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: "dbPath" }), _jsx("p", { children: snapshot.runtime.dbPath })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: "latestSnapshot" }), _jsx("code", { children: snapshot.runtime.latestSnapshotVersion ?? "none" })] })] }), _jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: "allowedOrigins" }), _jsx("p", { children: snapshot.runtime.allowedOrigins.join(", ") })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: "controlUi" }), _jsx("code", { children: snapshot.metadata.webConsole.mountPath })] })] }), _jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsx("strong", { children: "proxyPolicy" }), _jsxs("p", { children: [snapshot.proxyRuntime.policy.listenHost, ":", snapshot.proxyRuntime.policy.listenPort] })] }), _jsxs("div", { className: "row-meta", children: [_jsx("span", { children: t("dashboard.runtime.proxySnapshot") }), _jsx("code", { children: snapshot.proxyRuntime.snapshotVersion ?? "none" })] })] })] })] }), _jsxs("article", { className: "panel panel-span-2", children: [_jsx("h2", { children: t("dashboard.panels.requestLogs") }), _jsx("div", { className: "list", children: snapshot.proxyRequestLogs.length === 0 ? (_jsx("div", { className: "list-row", children: _jsxs("div", { children: [_jsx("strong", { children: t("dashboard.runtime.noProxyTraffic") }), _jsx("p", { children: t("dashboard.runtime.noProxyTrafficHint") })] }) })) : (snapshot.proxyRequestLogs.map((log) => (_jsxs("div", { className: "list-row", children: [_jsxs("div", { children: [_jsxs("strong", { children: [log.method, " ", log.appCode] }), _jsx("p", { children: log.path })] }), _jsxs("div", { className: "row-meta", children: [_jsxs("span", { children: [log.outcome, " / ", log.statusCode ?? "n/a", " / ", log.latencyMs, "ms"] }), _jsx("code", { children: log.providerId ?? "unbound" })] })] }, log.id)))) })] }), _jsxs("article", { className: "panel panel-span-2", children: [_jsx("h2", { children: t("dashboard.panels.actions") }), _jsxs("div", { className: "write-grid", children: [_jsxs("form", { className: "form-card", onSubmit: (event) => {
                                                    event.preventDefault();
                                                    runAction(() => saveProvider(providerForm), t("dashboard.forms.saveSuccess"));
                                                }, children: [_jsx("h3", { children: t("dashboard.forms.providerTitle") }), _jsx("input", { value: providerForm.id, onChange: (event) => setProviderForm({ ...providerForm, id: event.target.value }), placeholder: t("dashboard.forms.id") }), _jsx("input", { value: providerForm.name, onChange: (event) => setProviderForm({ ...providerForm, name: event.target.value }), placeholder: t("dashboard.forms.name") }), _jsxs("select", { value: providerForm.providerType, onChange: (event) => setProviderForm({
                                                            ...providerForm,
                                                            providerType: event.target.value
                                                        }), children: [_jsx("option", { value: "openai-compatible", children: "openai-compatible" }), _jsx("option", { value: "anthropic", children: "anthropic" }), _jsx("option", { value: "gemini", children: "gemini" }), _jsx("option", { value: "opencode", children: "opencode" }), _jsx("option", { value: "custom", children: "custom" })] }), _jsx("input", { value: providerForm.baseUrl, onChange: (event) => setProviderForm({ ...providerForm, baseUrl: event.target.value }), placeholder: t("dashboard.forms.baseUrl") }), _jsx("input", { type: "password", value: providerForm.apiKey, onChange: (event) => setProviderForm({ ...providerForm, apiKey: event.target.value }), placeholder: t("dashboard.forms.apiKey") }), _jsx("input", { value: providerForm.timeoutMs, onChange: (event) => setProviderForm({
                                                            ...providerForm,
                                                            timeoutMs: Number(event.target.value)
                                                        }), placeholder: t("dashboard.forms.timeoutMs") }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: providerForm.enabled, onChange: (event) => setProviderForm({ ...providerForm, enabled: event.target.checked }), type: "checkbox" }), " ", t("common.enabled")] }), _jsx("button", { className: "auth-button", type: "submit", disabled: isWorking, children: t("common.save") })] }), _jsxs("form", { className: "form-card", onSubmit: (event) => {
                                                    event.preventDefault();
                                                    runAction(() => saveBinding(bindingForm), t("dashboard.forms.saveSuccess"));
                                                }, children: [_jsx("h3", { children: t("dashboard.forms.bindingTitle") }), _jsx("input", { value: bindingForm.id, onChange: (event) => setBindingForm({ ...bindingForm, id: event.target.value }), placeholder: t("dashboard.forms.id") }), _jsxs("select", { value: bindingForm.appCode, onChange: (event) => setBindingForm({
                                                            ...bindingForm,
                                                            appCode: event.target.value
                                                        }), children: [_jsx("option", { value: "codex", children: "codex" }), _jsx("option", { value: "claude-code", children: "claude-code" }), _jsx("option", { value: "gemini-cli", children: "gemini-cli" }), _jsx("option", { value: "opencode", children: "opencode" }), _jsx("option", { value: "openclaw", children: "openclaw" })] }), _jsx("select", { value: bindingForm.providerId, onChange: (event) => setBindingForm({ ...bindingForm, providerId: event.target.value }), children: snapshot.providers.map((provider) => (_jsx("option", { value: provider.id, children: provider.id }, provider.id))) }), _jsxs("select", { value: bindingForm.mode, onChange: (event) => setBindingForm({
                                                            ...bindingForm,
                                                            mode: event.target.value
                                                        }), children: [_jsx("option", { value: "managed", children: "managed" }), _jsx("option", { value: "observe", children: "observe" })] }), _jsx("button", { className: "auth-button", type: "submit", disabled: isWorking, children: t("common.save") })] }), _jsxs("form", { className: "form-card", onSubmit: (event) => {
                                                    event.preventDefault();
                                                    runAction(() => saveProxyPolicy(proxyForm), t("dashboard.forms.saveSuccess"));
                                                }, children: [_jsx("h3", { children: t("dashboard.forms.proxyTitle") }), _jsx("input", { value: proxyForm.listenHost, onChange: (event) => setProxyForm({ ...proxyForm, listenHost: event.target.value }), placeholder: t("dashboard.forms.listenHost") }), _jsx("input", { value: proxyForm.listenPort, onChange: (event) => setProxyForm({ ...proxyForm, listenPort: Number(event.target.value) }), placeholder: t("dashboard.forms.listenPort") }), _jsx("input", { value: proxyForm.requestTimeoutMs, onChange: (event) => setProxyForm({
                                                            ...proxyForm,
                                                            requestTimeoutMs: Number(event.target.value)
                                                        }), placeholder: t("dashboard.forms.requestTimeoutMs") }), _jsx("input", { value: proxyForm.failureThreshold, onChange: (event) => setProxyForm({
                                                            ...proxyForm,
                                                            failureThreshold: Number(event.target.value)
                                                        }), placeholder: t("dashboard.forms.failureThreshold") }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: proxyForm.enabled, onChange: (event) => setProxyForm({ ...proxyForm, enabled: event.target.checked }), type: "checkbox" }), " ", t("common.enabled")] }), _jsx("button", { className: "auth-button", type: "submit", disabled: isWorking, children: t("common.save") })] }), _jsxs("form", { className: "form-card", onSubmit: (event) => {
                                                    event.preventDefault();
                                                    runAction(() => saveFailoverChain(failoverForm), t("dashboard.forms.saveSuccess"));
                                                }, children: [_jsx("h3", { children: t("dashboard.forms.failoverTitle") }), _jsx("input", { value: failoverForm.id, onChange: (event) => setFailoverForm({ ...failoverForm, id: event.target.value }), placeholder: t("dashboard.forms.id") }), _jsxs("select", { value: failoverForm.appCode, onChange: (event) => setFailoverForm({
                                                            ...failoverForm,
                                                            appCode: event.target.value
                                                        }), children: [_jsx("option", { value: "codex", children: "codex" }), _jsx("option", { value: "claude-code", children: "claude-code" }), _jsx("option", { value: "gemini-cli", children: "gemini-cli" }), _jsx("option", { value: "opencode", children: "opencode" }), _jsx("option", { value: "openclaw", children: "openclaw" })] }), _jsx("input", { value: joinProviderIds(failoverForm.providerIds), onChange: (event) => setFailoverForm({
                                                            ...failoverForm,
                                                            providerIds: splitProviderIds(event.target.value)
                                                        }), placeholder: t("dashboard.forms.failoverProviderIds") }), _jsx("input", { value: failoverForm.cooldownSeconds, onChange: (event) => setFailoverForm({
                                                            ...failoverForm,
                                                            cooldownSeconds: Number(event.target.value)
                                                        }), placeholder: t("dashboard.forms.cooldownSeconds") }), _jsx("input", { value: failoverForm.maxAttempts, onChange: (event) => setFailoverForm({
                                                            ...failoverForm,
                                                            maxAttempts: Number(event.target.value)
                                                        }), placeholder: t("dashboard.forms.maxAttempts") }), _jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: failoverForm.enabled, onChange: (event) => setFailoverForm({ ...failoverForm, enabled: event.target.checked }), type: "checkbox" }), " ", t("common.enabled")] }), _jsx("button", { className: "auth-button", type: "submit", disabled: isWorking, children: t("common.save") })] })] })] }), _jsxs("article", { className: "panel panel-span-2", children: [_jsx("h2", { children: t("dashboard.panels.recovery") }), _jsxs("div", { className: "write-grid", children: [_jsxs("section", { className: "form-card", children: [_jsx("h3", { children: t("dashboard.forms.exportTitle") }), _jsx("textarea", { className: "json-editor", value: exportText, readOnly: true, placeholder: `{\n  "version": "0.1.0"\n}` }), _jsx("button", { className: "auth-button", type: "button", disabled: isWorking, onClick: () => runAction(async () => {
                                                            const configPackage = await exportCurrentConfig();
                                                            setExportText(toJsonString(configPackage));
                                                        }, t("dashboard.forms.exportSuccess")), children: t("common.export") })] }), _jsxs("section", { className: "form-card", children: [_jsx("h3", { children: t("dashboard.forms.importTitle") }), _jsx("textarea", { className: "json-editor", value: importText, onChange: (event) => setImportText(event.target.value), placeholder: t("dashboard.forms.importPlaceholder") }), _jsxs("div", { className: "button-row", children: [_jsx("button", { className: "auth-button", type: "button", disabled: isWorking, onClick: () => runAction(async () => {
                                                                    const parsed = JSON.parse(importText);
                                                                    await importConfigPackage(parsed);
                                                                }, t("dashboard.forms.importSuccess")), children: t("common.import") }), _jsx("button", { className: "inline-action", type: "button", disabled: isWorking, onClick: () => runAction(async () => {
                                                                    await restoreLatestSnapshot();
                                                                }, t("dashboard.forms.restoreSuccess")), children: t("common.restore") })] }), _jsx("p", { className: "form-hint", children: t("dashboard.forms.restoreHint") })] })] })] })] })] })) : (_jsxs("section", { className: "panel", children: [_jsx("h2", { children: t("dashboard.loadingTitle") }), _jsx("p", { children: t("dashboard.loadingDescription") })] }))] }));
};
//# sourceMappingURL=DashboardPage.js.map