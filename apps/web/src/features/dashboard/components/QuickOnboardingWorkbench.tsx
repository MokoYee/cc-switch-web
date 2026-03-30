import { useEffect, useMemo, useState } from "react";

import type {
  AppCode,
  LocaleCode,
  OnboardingAppCode,
  QuickOnboardingApplyInput,
  QuickOnboardingApplyResult,
  QuickOnboardingPreview,
  QuickOnboardingProviderInput
} from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import {
  applyQuickOnboarding,
  previewQuickOnboarding
} from "../api/load-dashboard-snapshot.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const toProviderDraft = (index: number): QuickOnboardingProviderInput => ({
  id: `provider-${index + 1}`,
  name: `Provider ${index + 1}`,
  providerType: "openai-compatible",
  baseUrl: "https://api.example.com/v1",
  apiKey: "",
  enabled: true,
  timeoutMs: 30_000
});

const normalizePriority = (
  providers: QuickOnboardingProviderInput[],
  primaryProviderId: string
): {
  readonly primaryProviderId: string;
  readonly providers: QuickOnboardingProviderInput[];
} => {
  const normalizedProviders = providers.map((provider) => ({
    ...provider,
    id: provider.id.trim(),
    name: provider.name.trim(),
    baseUrl: provider.baseUrl.trim(),
    apiKey: provider.apiKey
  }));
  const fallbackPrimary = normalizedProviders[0]?.id ?? "";
  const nextPrimaryProviderId = normalizedProviders.some((item) => item.id === primaryProviderId)
    ? primaryProviderId
    : fallbackPrimary;

  return {
    primaryProviderId: nextPrimaryProviderId,
    providers: normalizedProviders
  };
};

const deriveInitialProviders = (snapshot: DashboardSnapshot): QuickOnboardingProviderInput[] => {
  if (snapshot.providers.length === 0) {
    return [toProviderDraft(0)];
  }

  return snapshot.providers.slice(0, 2).map((provider, index) => ({
    id: provider.id,
    name: provider.name,
    providerType: provider.providerType,
    baseUrl: provider.baseUrl,
    apiKey: "",
    enabled: provider.enabled,
    timeoutMs: provider.timeoutMs || 30_000
  })) ?? [toProviderDraft(0)];
};

type QuickOnboardingWorkbenchProps = {
  readonly snapshot: DashboardSnapshot;
  readonly locale: LocaleCode;
  readonly disabled: boolean;
  readonly onRefreshSnapshot: () => void;
  readonly onOpenRuntime: () => void;
  readonly onOpenTraffic: (appCode: AppCode) => void;
  readonly onOpenAssetForms: () => void;
  readonly onApplied?: ((
    appCode: OnboardingAppCode,
    result: QuickOnboardingApplyResult
  ) => void) | undefined;
};

export const QuickOnboardingWorkbench = ({
  snapshot,
  locale,
  disabled,
  onRefreshSnapshot,
  onOpenRuntime,
  onOpenTraffic,
  onOpenAssetForms,
  onApplied
}: QuickOnboardingWorkbenchProps): JSX.Element => {
  const [appCode, setAppCode] = useState<OnboardingAppCode>("codex");
  const [mode, setMode] = useState<QuickOnboardingApplyInput["mode"]>("managed");
  const [enableProxy, setEnableProxy] = useState(true);
  const [autoApplyHostTakeover, setAutoApplyHostTakeover] = useState(true);
  const [providers, setProviders] = useState<QuickOnboardingProviderInput[]>(() =>
    deriveInitialProviders(snapshot)
  );
  const [primaryProviderId, setPrimaryProviderId] = useState<string>(() =>
    deriveInitialProviders(snapshot)[0]?.id ?? ""
  );
  const [preview, setPreview] = useState<QuickOnboardingPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setErrorMessage(null);
  }, [appCode, mode, enableProxy, autoApplyHostTakeover, providers, primaryProviderId]);

  const discovery = useMemo(
    () => snapshot.discoveries.find((item) => item.appCode === appCode) ?? null,
    [appCode, snapshot.discoveries]
  );
  const normalizedDraft = useMemo(
    () => normalizePriority(providers, primaryProviderId),
    [primaryProviderId, providers]
  );
  const providerOrder = normalizedDraft.providers.map((provider) => provider.id).filter(Boolean);
  const failoverProviderIds = providerOrder.filter(
    (providerId) => providerId !== normalizedDraft.primaryProviderId
  );
  const canAddProvider = providers.length < 6;
  const applyPayload: QuickOnboardingApplyInput = {
    appCode,
    providers: normalizedDraft.providers,
    primaryProviderId: normalizedDraft.primaryProviderId,
    failoverProviderIds,
    mode,
    autoApplyHostTakeover,
    enableProxy,
    cooldownSeconds: 30,
    maxAttempts: Math.max(1, failoverProviderIds.length + 1)
  };

  const updateProvider = (
    index: number,
    patch: Partial<QuickOnboardingProviderInput>
  ): void => {
    setProviders((current) =>
      current.map((provider, providerIndex) =>
        providerIndex === index ? { ...provider, ...patch } : provider
      )
    );
  };

  const addProvider = (): void => {
    if (!canAddProvider) {
      return;
    }

    setProviders((current) => {
      const next = [...current, toProviderDraft(current.length)];
      if (current.length === 0) {
        setPrimaryProviderId(next[0]?.id ?? "");
      }
      return next;
    });
  };

  const removeProvider = (index: number): void => {
    setProviders((current) => {
      const removedProviderId = current[index]?.id ?? "";
      const next = current.filter((_, providerIndex) => providerIndex !== index);
      const normalized = normalizePriority(next, removedProviderId === primaryProviderId ? "" : primaryProviderId);
      setPrimaryProviderId(normalized.primaryProviderId);
      return normalized.providers.length > 0 ? normalized.providers : [toProviderDraft(0)];
    });
  };

  const moveProvider = (index: number, direction: -1 | 1): void => {
    setProviders((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved === undefined) {
        return current;
      }
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handlePreview = (): void => {
    setIsPreviewing(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    void previewQuickOnboarding(applyPayload)
      .then((result) => {
        setPreview(result);
        setNoticeMessage(
          result.canApply
            ? localize(
                locale,
                "已生成一键接入预检，可以直接执行。",
                "Quick onboarding preview is ready and can be applied directly."
              )
            : localize(
                locale,
                "预检已生成，但仍有阻断项需要先处理。",
                "Preview is ready, but blocking issues still need attention first."
              )
        );
      })
      .catch((error: unknown) => {
        setPreview(null);
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => {
        setIsPreviewing(false);
      });
  };

  const handleApply = (): void => {
    setIsApplying(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    void applyQuickOnboarding(applyPayload)
      .then((result) => {
        setNoticeMessage(
          localize(
            locale,
            `已完成 ${result.appCode} 一键接入，可以直接回到真实请求验证。`,
            `${result.appCode} quick onboarding is complete. You can move straight to live request verification.`
          )
        );
        setPreview(null);
        onRefreshSnapshot();
        onApplied?.(appCode, result);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "unknown error");
      })
      .finally(() => {
        setIsApplying(false);
      });
  };

  return (
    <div className="quick-onboarding-shell">
      <div className="quick-onboarding-header">
        <div>
          <p className="eyebrow">{localize(locale, "一键接入", "Quick Onboarding")}</p>
          <h3>{localize(locale, "填完 Provider 后直接可用", "Fill Providers And Go Live")}</h3>
          <p className="panel-lead">
            {localize(
              locale,
              "这里会一次性保存 Provider、主 Binding、故障转移顺序，并可选地直接接管本机 CLI 配置。",
              "This saves providers, primary binding, failover order, and can optionally take over the host CLI config in one pass."
            )}
          </p>
        </div>
        <div className="quick-action-row">
          <button type="button" className="ghost-button" onClick={onOpenAssetForms}>
            {localize(locale, "打开完整表单", "Open Full Forms")}
          </button>
          <button type="button" className="ghost-button" onClick={onOpenRuntime}>
            {localize(locale, "查看运行态", "Open Runtime")}
          </button>
        </div>
      </div>

      <div className="quick-onboarding-grid">
        <article className="quick-onboarding-card">
          <h4>{localize(locale, "目标应用", "Target App")}</h4>
          <label className="form-field">
            <span>{localize(locale, "CLI 应用", "CLI App")}</span>
            <select
              value={appCode}
              onChange={(event) => setAppCode(event.target.value as OnboardingAppCode)}
              disabled={disabled || isApplying}
            >
              <option value="codex">Codex</option>
              <option value="claude-code">Claude Code</option>
            </select>
          </label>
          <label className="form-field">
            <span>{localize(locale, "绑定模式", "Binding Mode")}</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as QuickOnboardingApplyInput["mode"])}
              disabled={disabled || isApplying}
            >
              <option value="managed">{localize(locale, "受管", "Managed")}</option>
              <option value="observe">{localize(locale, "观察", "Observe")}</option>
            </select>
          </label>
          <div className="quick-onboarding-toggle-list">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={enableProxy}
                onChange={(event) => setEnableProxy(event.target.checked)}
                disabled={disabled || isApplying}
              />
              <span>{localize(locale, "启用本地代理", "Enable Local Proxy")}</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={autoApplyHostTakeover}
                onChange={(event) => setAutoApplyHostTakeover(event.target.checked)}
                disabled={disabled || isApplying}
              />
              <span>{localize(locale, "自动接管宿主机 CLI", "Auto Apply Host Takeover")}</span>
            </label>
          </div>
          <div className={`quick-onboarding-inline-note risk-${discovery?.envConflicts.length ? "high" : "low"}`}>
            <strong>
              {localize(locale, "当前探测", "Current Discovery")}
            </strong>
            <span>
              {discovery === null
                ? localize(locale, "尚未拿到该应用的宿主机探测结果。", "No host discovery result is available for this app yet.")
                : localize(
                    locale,
                    `${discovery.discovered ? "已识别 CLI" : "未识别 CLI"}，接管支持=${discovery.takeoverSupported ? "是" : "否"}。`,
                    `${discovery.discovered ? "CLI detected" : "CLI not detected"}, takeoverSupported=${discovery.takeoverSupported ? "yes" : "no"}.`
                  )}
            </span>
          </div>
        </article>

        <article className="quick-onboarding-card quick-onboarding-card-span-2">
          <div className="quick-onboarding-section-header">
            <div>
              <h4>{localize(locale, "Provider 列表与优先级", "Providers And Priority")}</h4>
              <p>
                {localize(
                  locale,
                  "主 Provider 负责首跳，列表中的其余 Provider 会自动按当前顺序组成故障转移链。",
                  "The primary provider handles the first hop, and every remaining provider becomes the failover chain in the current order."
                )}
              </p>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={addProvider}
              disabled={disabled || isApplying || !canAddProvider}
            >
              {localize(locale, "添加 Provider", "Add Provider")}
            </button>
          </div>

          <div className="quick-onboarding-provider-list">
            {providers.map((provider, index) => {
              const isPrimary = provider.id.trim() === normalizedDraft.primaryProviderId;
              return (
                <article
                  className={`quick-onboarding-provider-card ${isPrimary ? "is-primary" : ""}`}
                  key={`quick-onboarding-provider-${index}-${provider.id}`}
                >
                  <div className="quick-onboarding-provider-toolbar">
                    <div className="quick-onboarding-provider-badge">
                      <strong>{isPrimary ? "P1" : `P${index + 1}`}</strong>
                      <span>
                        {isPrimary
                          ? localize(locale, "主 Provider", "Primary Provider")
                          : localize(locale, "故障转移候选", "Failover Candidate")}
                      </span>
                    </div>
                    <div className="quick-action-row">
                      {!isPrimary ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setPrimaryProviderId(provider.id)}
                          disabled={disabled || isApplying}
                        >
                          {localize(locale, "设为主", "Make Primary")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => moveProvider(index, -1)}
                        disabled={disabled || isApplying || index === 0}
                      >
                        {localize(locale, "上移", "Up")}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => moveProvider(index, 1)}
                        disabled={disabled || isApplying || index === providers.length - 1}
                      >
                        {localize(locale, "下移", "Down")}
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger-text"
                        onClick={() => removeProvider(index)}
                        disabled={disabled || isApplying || providers.length === 1}
                      >
                        {localize(locale, "移除", "Remove")}
                      </button>
                    </div>
                  </div>

                  <div className="write-grid">
                    <label className="form-field">
                      <span>{localize(locale, "Provider ID", "Provider ID")}</span>
                      <input
                        value={provider.id}
                        onChange={(event) => updateProvider(index, { id: event.target.value })}
                        disabled={disabled || isApplying}
                      />
                    </label>
                    <label className="form-field">
                      <span>{localize(locale, "显示名称", "Display Name")}</span>
                      <input
                        value={provider.name}
                        onChange={(event) => updateProvider(index, { name: event.target.value })}
                        disabled={disabled || isApplying}
                      />
                    </label>
                    <label className="form-field">
                      <span>{localize(locale, "类型", "Type")}</span>
                      <select
                        value={provider.providerType}
                        onChange={(event) =>
                          updateProvider(index, {
                            providerType: event.target.value as QuickOnboardingProviderInput["providerType"]
                          })
                        }
                        disabled={disabled || isApplying}
                      >
                        <option value="openai-compatible">OpenAI Compatible</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="gemini">Gemini</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Base URL</span>
                      <input
                        value={provider.baseUrl}
                        onChange={(event) => updateProvider(index, { baseUrl: event.target.value })}
                        disabled={disabled || isApplying}
                      />
                    </label>
                    <label className="form-field quick-onboarding-span-2">
                      <span>{localize(locale, "API 密钥 / Token", "API Key / Token")}</span>
                      <input
                        type="password"
                        value={provider.apiKey}
                        onChange={(event) => updateProvider(index, { apiKey: event.target.value })}
                        placeholder={localize(
                          locale,
                          "留空则沿用同 ID 已存在的凭据",
                          "Leave blank to keep the stored credential for the same provider ID"
                        )}
                        disabled={disabled || isApplying}
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      </div>

      <div className="quick-onboarding-actions">
        <div className="quick-onboarding-priority-note">
          <strong>{localize(locale, "故障转移顺序", "Failover Order")}</strong>
          <span>
            {failoverProviderIds.length > 0
              ? failoverProviderIds.join(" -> ")
              : localize(locale, "当前只有单 Provider，暂不启用故障转移。", "Only one provider is present, so failover stays disabled for now.")}
          </span>
        </div>
        <div className="quick-action-row">
          <button
            type="button"
            className="ghost-button"
            onClick={handlePreview}
            disabled={disabled || isPreviewing || isApplying}
          >
            {isPreviewing
              ? localize(locale, "生成中...", "Generating...")
              : localize(locale, "生成预检", "Generate Preview")}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={disabled || isApplying || isPreviewing || preview === null || !preview.canApply}
          >
            {isApplying
              ? localize(locale, "接入中...", "Applying...")
              : localize(locale, "立即接入", "Apply Now")}
          </button>
        </div>
      </div>

      {noticeMessage ? <p className="panel-lead quick-onboarding-success">{noticeMessage}</p> : null}
      {errorMessage ? <p className="panel-lead danger-text">{errorMessage}</p> : null}

      {preview ? (
        <article className={`quick-onboarding-result risk-${preview.riskLevel}`}>
          <div className="quick-onboarding-result-header">
            <div>
              <h4>{localize(locale, "一键接入预检", "Quick Onboarding Preview")}</h4>
              <p>
                {preview.summary[0] ??
                  localize(locale, "当前没有可展示的预检摘要。", "No preview summary is available.")}
              </p>
            </div>
            <div className="quick-action-row">
              <button type="button" className="ghost-button" onClick={() => onOpenTraffic(appCode)}>
                {localize(locale, "查看请求验证", "Open Request Verification")}
              </button>
              <button type="button" className="ghost-button" onClick={onOpenRuntime}>
                {localize(locale, "查看运行态", "Open Runtime")}
              </button>
            </div>
          </div>

          <div className="preview-summary-grid">
            <div className={`preview-summary-tile risk-${preview.riskLevel}`}>
              <strong>{localize(locale, "整体风险", "Overall Risk")}</strong>
              <span>{preview.riskLevel.toUpperCase()}</span>
              <small>
                {preview.canApply
                  ? localize(locale, "当前可直接执行。", "Ready to apply directly.")
                  : localize(locale, "当前仍有阻断项。", "Blocking issues still exist.")}
              </small>
            </div>
            <div className={`preview-summary-tile risk-${preview.bindingPreview.impact.riskLevel}`}>
              <strong>{localize(locale, "主 Binding", "Primary Binding")}</strong>
              <span>{preview.bindingPreview.providerId}</span>
              <small>{preview.bindingPreview.executionPlan.proxyPath}</small>
            </div>
            <div className={`preview-summary-tile risk-${preview.failoverPreview.impact.riskLevel}`}>
              <strong>{localize(locale, "故障转移", "Failover")}</strong>
              <span>
                {preview.failoverPreview.enabled
                  ? localize(locale, "已启用", "Enabled")
                  : localize(locale, "未启用", "Disabled")}
              </span>
              <small>{preview.failoverPreview.executionPlan.candidates.length}</small>
            </div>
            <div className={`preview-summary-tile risk-${preview.hostTakeoverPreview?.riskLevel ?? "low"}`}>
              <strong>{localize(locale, "宿主机接管", "Host Takeover")}</strong>
              <span>
                {preview.hostTakeoverPreview === null
                  ? localize(locale, "保持不变", "Unchanged")
                  : preview.hostTakeoverPreview.riskLevel.toUpperCase()}
              </span>
              <small>
                {preview.hostTakeoverPreview === null
                  ? localize(locale, "本次不会写入本机配置。", "This run will not write host config.")
                  : preview.hostTakeoverPreview.configPath}
              </small>
            </div>
          </div>

          {preview.blockingReasons.length > 0 ? (
            <div className="governance-notice governance-high">
              <div className="governance-notice-header">
                <strong>{localize(locale, "阻断项", "Blocking Issues")}</strong>
                <span className="governance-notice-badge">
                  {preview.blockingReasons.length}
                </span>
              </div>
              <ul className="governance-suggestion-list">
                {preview.blockingReasons.map((item) => (
                  <li key={`quick-onboarding-blocking-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.warnings.length > 0 ? (
            <div className="governance-notice governance-medium">
              <div className="governance-notice-header">
                <strong>{localize(locale, "预警", "Warnings")}</strong>
                <span className="governance-notice-badge">{preview.warnings.length}</span>
              </div>
              <ul className="governance-suggestion-list">
                {preview.warnings.map((item) => (
                  <li key={`quick-onboarding-warning-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="write-grid">
            <div className="quick-onboarding-detail-card">
              <strong>{localize(locale, "摘要", "Summary")}</strong>
              <ul className="governance-suggestion-list">
                {preview.summary.map((item) => (
                  <li key={`quick-onboarding-summary-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="quick-onboarding-detail-card">
              <strong>{localize(locale, "候选链路", "Routing Candidates")}</strong>
              <ul className="governance-suggestion-list">
                {preview.failoverPreview.executionPlan.candidates.map((item) => (
                  <li key={`quick-onboarding-candidate-${item.providerId}`}>
                    {item.providerId}: {item.decision} / {item.decisionReason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      ) : null}
    </div>
  );
};
