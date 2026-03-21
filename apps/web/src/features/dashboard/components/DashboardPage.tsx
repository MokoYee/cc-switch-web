import { useEffect, useState } from "react";

import type {
  AppBinding,
  AppBindingUpsert,
  ExportPackage,
  FailoverChainUpsert,
  HostCliDiscovery,
  Provider,
  ProviderUpsert,
  ProxyPolicy
} from "@ai-cli-switch/shared";

import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher.js";
import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import {
  deleteBinding,
  deleteFailoverChain,
  deleteProvider,
  exportCurrentConfig,
  importConfigPackage,
  loadDashboardSnapshot,
  restoreLatestSnapshot,
  saveBinding,
  saveFailoverChain,
  saveProvider,
  saveProxyPolicy,
  type DashboardSnapshot
} from "../api/load-dashboard-snapshot.js";
import { MetricCard } from "./MetricCard.js";
import {
  UnauthorizedApiError,
  writeStoredControlToken
} from "../../../shared/lib/api.js";

const renderProviderType = (provider: Provider): string => provider.providerType;

const renderBindingMode = (
  binding: AppBinding,
  t: (key: "common.managed" | "common.observe") => string
): string => (binding.mode === "managed" ? t("common.managed") : t("common.observe"));

const renderDiscoveryPath = (
  discovery: HostCliDiscovery,
  t: (key: "common.notFound") => string
): string => discovery.executablePath ?? t("common.notFound");

const currentProxyFallback = (snapshot: DashboardSnapshot): ProxyPolicy => ({
  listenHost: snapshot.latestSnapshot?.payload.proxyPolicy.listenHost ?? "127.0.0.1",
  listenPort: snapshot.latestSnapshot?.payload.proxyPolicy.listenPort ?? 8788,
  enabled: snapshot.latestSnapshot?.payload.proxyPolicy.enabled ?? false,
  requestTimeoutMs: snapshot.latestSnapshot?.payload.proxyPolicy.requestTimeoutMs ?? 60000,
  failureThreshold: snapshot.latestSnapshot?.payload.proxyPolicy.failureThreshold ?? 3
});

const toJsonString = (value: ExportPackage): string => JSON.stringify(value, null, 2);
const joinProviderIds = (providerIds: string[]): string => providerIds.join(", ");
const splitProviderIds = (rawValue: string): string[] =>
  rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const buildProxyEndpoint = (
  daemonHost: string,
  daemonPort: number,
  proxyBasePath: string
): string => `http://${daemonHost}:${daemonPort}${proxyBasePath}`;

export const DashboardPage = (): JSX.Element => {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [providerForm, setProviderForm] = useState<ProviderUpsert>({
    id: "provider-new",
    name: "New Provider",
    providerType: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    apiKey: "",
    enabled: true,
    timeoutMs: 30000
  });
  const [bindingForm, setBindingForm] = useState<AppBindingUpsert>({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-openai-main",
    mode: "managed"
  });
  const [proxyForm, setProxyForm] = useState<ProxyPolicy>({
    listenHost: "127.0.0.1",
    listenPort: 8788,
    enabled: false,
    requestTimeoutMs: 60000,
    failureThreshold: 3
  });
  const [failoverForm, setFailoverForm] = useState<FailoverChainUpsert>({
    id: "failover-codex",
    appCode: "codex",
    enabled: false,
    providerIds: ["provider-openai-main"],
    cooldownSeconds: 30,
    maxAttempts: 2
  });

  const refreshSnapshot = (): void => {
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
          providerIds:
            current.providerIds.length > 0
              ? current.providerIds
              : result.providers[0]?.id
                ? [result.providers[0].id]
                : []
        }));
        setProxyForm(currentProxyFallback(result));
      })
      .catch((error: unknown) => {
        if (error instanceof UnauthorizedApiError) {
          setNeedsToken(true);
          setErrorMessage(null);
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      });
  };

  const runAction = (task: () => Promise<void>, successMessage: string): void => {
    setIsWorking(true);
    setNoticeMessage(null);
    setErrorMessage(null);

    void task()
      .then(() => {
        setNoticeMessage(successMessage);
        refreshSnapshot();
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => {
        setIsWorking(false);
      });
  };

  useEffect(() => {
    refreshSnapshot();
  }, []);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-topbar">
          <p className="eyebrow">{t("app.eyebrow")}</p>
          <LanguageSwitcher />
        </div>
        <h1>{t("app.title")}</h1>
        <p className="hero-copy">{t("app.description")}</p>
        <p className="hero-hint">{t("app.openSourceHint")}</p>
        <p className="hero-locale">
          {t("app.localeSummary")}: {snapshot?.metadata.supportedLocales.join(" / ") ?? "zh-CN / en-US"}
        </p>
      </section>

      {errorMessage ? (
        <section className="panel error-panel">
          <h2>{t("dashboard.backendErrorTitle")}</h2>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {noticeMessage ? (
        <section className="panel success-panel">
          <p>{noticeMessage}</p>
        </section>
      ) : null}

      {needsToken ? (
        <section className="panel auth-panel">
          <h2>{t("dashboard.controlTokenTitle")}</h2>
          <p>{t("dashboard.controlTokenDescription")}</p>
          <div className="auth-row">
            <input
              className="auth-input"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={t("dashboard.controlTokenPlaceholder")}
            />
            <button
              className="auth-button"
              type="button"
              onClick={() => {
                writeStoredControlToken(tokenInput);
                window.location.reload();
              }}
            >
              {t("dashboard.controlTokenSave")}
            </button>
          </div>
        </section>
      ) : null}

      {snapshot ? (
        <>
          <section className="metrics-grid">
            <MetricCard
              label={t("dashboard.metrics.serviceStatus")}
              value={snapshot.health.status}
              hint={snapshot.health.service}
            />
            <MetricCard
              label={t("dashboard.metrics.providerCount")}
              value={snapshot.providers.length}
              hint={t("dashboard.metrics.providerHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.bindingCount")}
              value={snapshot.bindings.length}
              hint={t("dashboard.metrics.bindingHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.discoveryCount")}
              value={snapshot.discoveries.filter((item) => item.discovered).length}
              hint={t("dashboard.metrics.discoveryHint")}
            />
            <MetricCard
              label={t("dashboard.metrics.proxyRequestCount")}
              value={snapshot.proxyRuntime.requestLogCount}
              hint={t("dashboard.metrics.proxyRequestHint")}
            />
          </section>

          <section className="content-grid">
            <article className="panel">
              <h2>{t("dashboard.panels.providers")}</h2>
              <div className="list">
                {snapshot.providers.map((provider) => (
                  <div className="list-row" key={provider.id}>
                    <div>
                      <strong>{provider.name}</strong>
                      <p>{renderProviderType(provider)}</p>
                    </div>
                    <div className="row-meta">
                      <span>{provider.enabled ? t("common.enabled") : t("common.disabled")}</span>
                      <code>{provider.apiKeyMasked}</code>
                      <button
                        className="inline-action danger"
                        type="button"
                        disabled={isWorking}
                        onClick={() =>
                          runAction(
                            () => deleteProvider(provider.id),
                            t("dashboard.forms.deleteSuccess")
                          )
                        }
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>{t("dashboard.panels.bindings")}</h2>
              <div className="list">
                {snapshot.bindings.map((binding) => (
                  <div className="list-row" key={binding.id}>
                    <div>
                      <strong>{binding.appCode}</strong>
                      <p>{binding.providerId}</p>
                    </div>
                    <div className="row-meta">
                      <span>{renderBindingMode(binding, t)}</span>
                      <button
                        className="inline-action danger"
                        type="button"
                        disabled={isWorking}
                        onClick={() =>
                          runAction(
                            () => deleteBinding(binding.id),
                            t("dashboard.forms.deleteSuccess")
                          )
                        }
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>{t("dashboard.panels.failoverChains")}</h2>
              <div className="list">
                {snapshot.failoverChains.map((chain) => (
                  <div className="list-row" key={chain.id}>
                    <div>
                      <strong>{chain.appCode}</strong>
                      <p>{joinProviderIds(chain.providerIds)}</p>
                    </div>
                    <div className="row-meta">
                      <span>
                        {chain.enabled ? t("common.enabled") : t("common.disabled")} / {chain.maxAttempts}
                      </span>
                      <button
                        className="inline-action danger"
                        type="button"
                        disabled={isWorking}
                        onClick={() =>
                          runAction(
                            () => deleteFailoverChain(chain.id),
                            t("dashboard.forms.deleteSuccess")
                          )
                        }
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>{t("dashboard.panels.proxyRuntime")}</h2>
              <div className="list">
                <div className="list-row">
                  <div>
                    <strong>{snapshot.proxyRuntime.runtimeState}</strong>
                    <p>{snapshot.proxyRuntime.policy.enabled ? t("common.enabled") : t("common.disabled")}</p>
                  </div>
                  <div className="row-meta">
                    <span>{t("dashboard.runtime.proxyReloadedAt")}</span>
                    <code>{snapshot.proxyRuntime.lastReloadedAt ?? "none"}</code>
                  </div>
                </div>
                {snapshot.proxyRuntime.activeBindings.map((binding) => (
                  <div className="list-row" key={binding.appCode}>
                    <div>
                      <strong>{binding.appCode}</strong>
                      <p>{binding.providerName}</p>
                    </div>
                    <div className="row-meta">
                      <span>{binding.hasCredential ? t("dashboard.runtime.credentialReady") : t("dashboard.runtime.credentialMissing")}</span>
                      <code>
                        {buildProxyEndpoint(
                          snapshot.runtime.daemonHost,
                          snapshot.runtime.daemonPort,
                          binding.proxyBasePath
                        )}
                      </code>
                    </div>
                  </div>
                ))}
                {snapshot.proxyRuntime.providerHealthStates.map((state) => (
                  <div className="list-row" key={state.providerId}>
                    <div>
                      <strong>{state.providerId}</strong>
                      <p>{state.circuitState}</p>
                    </div>
                    <div className="row-meta">
                      <span>{state.consecutiveFailures}</span>
                      <code>{state.cooldownUntil ?? "ready"}</code>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>{t("dashboard.panels.discoveries")}</h2>
              <div className="list">
                {snapshot.discoveries.map((item) => (
                  <div className="list-row" key={item.appCode}>
                    <div>
                      <strong>{item.appCode}</strong>
                      <p>{item.status}</p>
                    </div>
                    <div className="row-meta">
                      <code>{renderDiscoveryPath(item, t)}</code>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <h2>{t("dashboard.runtimeTitle")}</h2>
              <div className="list">
                <div className="list-row">
                  <div>
                    <strong>releaseStage</strong>
                    <p>{snapshot.metadata.releaseStage}</p>
                  </div>
                  <div className="row-meta">
                    <span>repositoryMode</span>
                    <code>{snapshot.metadata.repositoryMode}</code>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <strong>daemon</strong>
                    <p>
                      {snapshot.runtime.daemonHost}:{snapshot.runtime.daemonPort}
                    </p>
                  </div>
                  <div className="row-meta">
                    <span>dataDir</span>
                    <code>{snapshot.runtime.dataDir}</code>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <strong>dbPath</strong>
                    <p>{snapshot.runtime.dbPath}</p>
                  </div>
                  <div className="row-meta">
                    <span>latestSnapshot</span>
                    <code>{snapshot.runtime.latestSnapshotVersion ?? "none"}</code>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <strong>allowedOrigins</strong>
                    <p>{snapshot.runtime.allowedOrigins.join(", ")}</p>
                  </div>
                  <div className="row-meta">
                    <span>controlUi</span>
                    <code>{snapshot.metadata.webConsole.mountPath}</code>
                  </div>
                </div>
                <div className="list-row">
                  <div>
                    <strong>proxyPolicy</strong>
                    <p>
                      {snapshot.proxyRuntime.policy.listenHost}:{snapshot.proxyRuntime.policy.listenPort}
                    </p>
                  </div>
                  <div className="row-meta">
                    <span>{t("dashboard.runtime.proxySnapshot")}</span>
                    <code>{snapshot.proxyRuntime.snapshotVersion ?? "none"}</code>
                  </div>
                </div>
              </div>
            </article>

            <article className="panel panel-span-2">
              <h2>{t("dashboard.panels.requestLogs")}</h2>
              <div className="list">
                {snapshot.proxyRequestLogs.length === 0 ? (
                  <div className="list-row">
                    <div>
                      <strong>{t("dashboard.runtime.noProxyTraffic")}</strong>
                      <p>{t("dashboard.runtime.noProxyTrafficHint")}</p>
                    </div>
                  </div>
                ) : (
                  snapshot.proxyRequestLogs.map((log) => (
                    <div className="list-row" key={log.id}>
                      <div>
                        <strong>
                          {log.method} {log.appCode}
                        </strong>
                        <p>{log.path}</p>
                      </div>
                      <div className="row-meta">
                        <span>
                          {log.outcome} / {log.statusCode ?? "n/a"} / {log.latencyMs}ms
                        </span>
                        <code>{log.providerId ?? "unbound"}</code>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="panel panel-span-2">
              <h2>{t("dashboard.panels.actions")}</h2>
              <div className="write-grid">
                <form
                  className="form-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runAction(() => saveProvider(providerForm), t("dashboard.forms.saveSuccess"));
                  }}
                >
                  <h3>{t("dashboard.forms.providerTitle")}</h3>
                  <input
                    value={providerForm.id}
                    onChange={(event) => setProviderForm({ ...providerForm, id: event.target.value })}
                    placeholder={t("dashboard.forms.id")}
                  />
                  <input
                    value={providerForm.name}
                    onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })}
                    placeholder={t("dashboard.forms.name")}
                  />
                  <select
                    value={providerForm.providerType}
                    onChange={(event) =>
                      setProviderForm({
                        ...providerForm,
                        providerType: event.target.value as ProviderUpsert["providerType"]
                      })
                    }
                  >
                    <option value="openai-compatible">openai-compatible</option>
                    <option value="anthropic">anthropic</option>
                    <option value="gemini">gemini</option>
                    <option value="opencode">opencode</option>
                    <option value="custom">custom</option>
                  </select>
                  <input
                    value={providerForm.baseUrl}
                    onChange={(event) =>
                      setProviderForm({ ...providerForm, baseUrl: event.target.value })
                    }
                    placeholder={t("dashboard.forms.baseUrl")}
                  />
                  <input
                    type="password"
                    value={providerForm.apiKey}
                    onChange={(event) =>
                      setProviderForm({ ...providerForm, apiKey: event.target.value })
                    }
                    placeholder={t("dashboard.forms.apiKey")}
                  />
                  <input
                    value={providerForm.timeoutMs}
                    onChange={(event) =>
                      setProviderForm({
                        ...providerForm,
                        timeoutMs: Number(event.target.value)
                      })
                    }
                    placeholder={t("dashboard.forms.timeoutMs")}
                  />
                  <label className="checkbox-row">
                    <input
                      checked={providerForm.enabled}
                      onChange={(event) =>
                        setProviderForm({ ...providerForm, enabled: event.target.checked })
                      }
                      type="checkbox"
                    />{" "}
                    {t("common.enabled")}
                  </label>
                  <button className="auth-button" type="submit" disabled={isWorking}>
                    {t("common.save")}
                  </button>
                </form>

                <form
                  className="form-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runAction(() => saveBinding(bindingForm), t("dashboard.forms.saveSuccess"));
                  }}
                >
                  <h3>{t("dashboard.forms.bindingTitle")}</h3>
                  <input
                    value={bindingForm.id}
                    onChange={(event) => setBindingForm({ ...bindingForm, id: event.target.value })}
                    placeholder={t("dashboard.forms.id")}
                  />
                  <select
                    value={bindingForm.appCode}
                    onChange={(event) =>
                      setBindingForm({
                        ...bindingForm,
                        appCode: event.target.value as AppBindingUpsert["appCode"]
                      })
                    }
                  >
                    <option value="codex">codex</option>
                    <option value="claude-code">claude-code</option>
                    <option value="gemini-cli">gemini-cli</option>
                    <option value="opencode">opencode</option>
                    <option value="openclaw">openclaw</option>
                  </select>
                  <select
                    value={bindingForm.providerId}
                    onChange={(event) =>
                      setBindingForm({ ...bindingForm, providerId: event.target.value })
                    }
                  >
                    {snapshot.providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.id}
                      </option>
                    ))}
                  </select>
                  <select
                    value={bindingForm.mode}
                    onChange={(event) =>
                      setBindingForm({
                        ...bindingForm,
                        mode: event.target.value as AppBindingUpsert["mode"]
                      })
                    }
                  >
                    <option value="managed">managed</option>
                    <option value="observe">observe</option>
                  </select>
                  <button className="auth-button" type="submit" disabled={isWorking}>
                    {t("common.save")}
                  </button>
                </form>

                <form
                  className="form-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runAction(() => saveProxyPolicy(proxyForm), t("dashboard.forms.saveSuccess"));
                  }}
                >
                  <h3>{t("dashboard.forms.proxyTitle")}</h3>
                  <input
                    value={proxyForm.listenHost}
                    onChange={(event) =>
                      setProxyForm({ ...proxyForm, listenHost: event.target.value })
                    }
                    placeholder={t("dashboard.forms.listenHost")}
                  />
                  <input
                    value={proxyForm.listenPort}
                    onChange={(event) =>
                      setProxyForm({ ...proxyForm, listenPort: Number(event.target.value) })
                    }
                    placeholder={t("dashboard.forms.listenPort")}
                  />
                  <input
                    value={proxyForm.requestTimeoutMs}
                    onChange={(event) =>
                      setProxyForm({
                        ...proxyForm,
                        requestTimeoutMs: Number(event.target.value)
                      })
                    }
                    placeholder={t("dashboard.forms.requestTimeoutMs")}
                  />
                  <input
                    value={proxyForm.failureThreshold}
                    onChange={(event) =>
                      setProxyForm({
                        ...proxyForm,
                        failureThreshold: Number(event.target.value)
                      })
                    }
                    placeholder={t("dashboard.forms.failureThreshold")}
                  />
                  <label className="checkbox-row">
                    <input
                      checked={proxyForm.enabled}
                      onChange={(event) =>
                        setProxyForm({ ...proxyForm, enabled: event.target.checked })
                      }
                      type="checkbox"
                    />{" "}
                    {t("common.enabled")}
                  </label>
                  <button className="auth-button" type="submit" disabled={isWorking}>
                    {t("common.save")}
                  </button>
                </form>

                <form
                  className="form-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    runAction(() => saveFailoverChain(failoverForm), t("dashboard.forms.saveSuccess"));
                  }}
                >
                  <h3>{t("dashboard.forms.failoverTitle")}</h3>
                  <input
                    value={failoverForm.id}
                    onChange={(event) => setFailoverForm({ ...failoverForm, id: event.target.value })}
                    placeholder={t("dashboard.forms.id")}
                  />
                  <select
                    value={failoverForm.appCode}
                    onChange={(event) =>
                      setFailoverForm({
                        ...failoverForm,
                        appCode: event.target.value as FailoverChainUpsert["appCode"]
                      })
                    }
                  >
                    <option value="codex">codex</option>
                    <option value="claude-code">claude-code</option>
                    <option value="gemini-cli">gemini-cli</option>
                    <option value="opencode">opencode</option>
                    <option value="openclaw">openclaw</option>
                  </select>
                  <input
                    value={joinProviderIds(failoverForm.providerIds)}
                    onChange={(event) =>
                      setFailoverForm({
                        ...failoverForm,
                        providerIds: splitProviderIds(event.target.value)
                      })
                    }
                    placeholder={t("dashboard.forms.failoverProviderIds")}
                  />
                  <input
                    value={failoverForm.cooldownSeconds}
                    onChange={(event) =>
                      setFailoverForm({
                        ...failoverForm,
                        cooldownSeconds: Number(event.target.value)
                      })
                    }
                    placeholder={t("dashboard.forms.cooldownSeconds")}
                  />
                  <input
                    value={failoverForm.maxAttempts}
                    onChange={(event) =>
                      setFailoverForm({
                        ...failoverForm,
                        maxAttempts: Number(event.target.value)
                      })
                    }
                    placeholder={t("dashboard.forms.maxAttempts")}
                  />
                  <label className="checkbox-row">
                    <input
                      checked={failoverForm.enabled}
                      onChange={(event) =>
                        setFailoverForm({ ...failoverForm, enabled: event.target.checked })
                      }
                      type="checkbox"
                    />{" "}
                    {t("common.enabled")}
                  </label>
                  <button className="auth-button" type="submit" disabled={isWorking}>
                    {t("common.save")}
                  </button>
                </form>
              </div>
            </article>

            <article className="panel panel-span-2">
              <h2>{t("dashboard.panels.recovery")}</h2>
              <div className="write-grid">
                <section className="form-card">
                  <h3>{t("dashboard.forms.exportTitle")}</h3>
                  <textarea
                    className="json-editor"
                    value={exportText}
                    readOnly
                    placeholder={`{\n  "version": "0.1.0"\n}`}
                  />
                  <button
                    className="auth-button"
                    type="button"
                    disabled={isWorking}
                    onClick={() =>
                      runAction(
                        async () => {
                          const configPackage = await exportCurrentConfig();
                          setExportText(toJsonString(configPackage));
                        },
                        t("dashboard.forms.exportSuccess")
                      )
                    }
                  >
                    {t("common.export")}
                  </button>
                </section>

                <section className="form-card">
                  <h3>{t("dashboard.forms.importTitle")}</h3>
                  <textarea
                    className="json-editor"
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder={t("dashboard.forms.importPlaceholder")}
                  />
                  <div className="button-row">
                    <button
                      className="auth-button"
                      type="button"
                      disabled={isWorking}
                      onClick={() =>
                        runAction(
                          async () => {
                            const parsed = JSON.parse(importText) as unknown;
                            await importConfigPackage(parsed);
                          },
                          t("dashboard.forms.importSuccess")
                        )
                      }
                    >
                      {t("common.import")}
                    </button>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() =>
                        runAction(
                          async () => {
                            await restoreLatestSnapshot();
                          },
                          t("dashboard.forms.restoreSuccess")
                        )
                      }
                    >
                      {t("common.restore")}
                    </button>
                  </div>
                  <p className="form-hint">{t("dashboard.forms.restoreHint")}</p>
                </section>
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className="panel">
          <h2>{t("dashboard.loadingTitle")}</h2>
          <p>{t("dashboard.loadingDescription")}</p>
        </section>
      )}
    </main>
  );
};
