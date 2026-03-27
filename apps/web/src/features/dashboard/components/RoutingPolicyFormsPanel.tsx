import { useState, type Dispatch, type SetStateAction } from "react";

import type {
  AppBinding,
  AppBindingRoutingPreview,
  AppBindingUpsert,
  AppQuotaSavePreview,
  AppQuotaUpsert,
  FailoverChainRoutingPreview,
  FailoverChainUpsert,
  ProviderRoutingPreview,
  ProviderUpsert,
  ProxyPolicy,
  ProxyPolicySavePreview
} from "@cc-switch-web/shared";

import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";
import { buildRoutingGovernanceNotice } from "../lib/buildGovernanceNotice.js";
import { buildRoutingExecutionSummary } from "../lib/buildRoutingExecutionSummary.js";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";
import { ConfigImpactSummary } from "./ConfigImpactSummary.js";

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

const splitValues = (rawValue: string): string[] =>
  rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const joinValues = (items: string[]): string => items.join(", ");

const uniqueValues = (items: string[]): string[] => Array.from(new Set(items));

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const moveArrayItem = (items: string[], fromIndex: number, toIndex: number): string[] => {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) {
    return items;
  }
  next.splice(toIndex, 0, moved);
  return next;
};

const reorderProviderIds = (
  providerIds: string[],
  draggedProviderId: string,
  targetProviderId: string
): string[] => {
  const fromIndex = providerIds.indexOf(draggedProviderId);
  const toIndex = providerIds.indexOf(targetProviderId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return providerIds;
  }
  return moveArrayItem(providerIds, fromIndex, toIndex);
};

type FailoverPriorityEditorProps = {
  readonly locale: "zh-CN" | "en-US";
  readonly providers: DashboardSnapshot["providers"];
  readonly providerIds: string[];
  readonly bindingProviderId: string | null;
  readonly isWorking: boolean;
  readonly onChange: (providerIds: string[]) => void;
};

const FailoverPriorityEditor = ({
  locale,
  providers,
  providerIds,
  bindingProviderId,
  isWorking,
  onChange
}: FailoverPriorityEditorProps): JSX.Element => {
  const [candidateProviderId, setCandidateProviderId] = useState("");
  const [draggingProviderId, setDraggingProviderId] = useState<string | null>(null);
  const selectedProviders = providerIds
    .map((providerId) => providers.find((provider) => provider.id === providerId) ?? null)
    .filter((provider): provider is DashboardSnapshot["providers"][number] => provider !== null);
  const missingProviderIds = providerIds.filter(
    (providerId) => !providers.some((provider) => provider.id === providerId)
  );
  const availableProviders = providers.filter(
    (provider) => !providerIds.includes(provider.id)
  );

  const addProviderToChain = (providerId: string): void => {
    if (providerId.length === 0 || providerIds.includes(providerId)) {
      return;
    }
    onChange([...providerIds, providerId]);
    setCandidateProviderId("");
  };

  const removeProviderFromChain = (providerId: string): void => {
    onChange(providerIds.filter((item) => item !== providerId));
  };

  const moveProviderInChain = (providerId: string, direction: -1 | 1): void => {
    const index = providerIds.indexOf(providerId);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= providerIds.length) {
      return;
    }
    onChange(moveArrayItem(providerIds, index, nextIndex));
  };

  const applyBoundPrimaryFirst = (): void => {
    if (bindingProviderId === null || bindingProviderId.length === 0) {
      return;
    }
    const nextProviderIds = providerIds.filter((providerId) => providerId !== bindingProviderId);
    onChange([bindingProviderId, ...nextProviderIds]);
  };

  const applyEnabledProviders = (): void => {
    const enabledProviderIds = providers.filter((provider) => provider.enabled).map((provider) => provider.id);
    const fallbackProviderIds = providers.map((provider) => provider.id);
    onChange(enabledProviderIds.length > 0 ? enabledProviderIds : fallbackProviderIds);
  };

  return (
    <div className="priority-editor">
      <div className="priority-editor-toolbar">
        <select
          value={candidateProviderId}
          onChange={(event) => setCandidateProviderId(event.target.value)}
          disabled={isWorking || availableProviders.length === 0}
        >
          <option value="">
            {localize(locale, "选择 Provider 加入链路", "Select Provider To Add")}
          </option>
          {availableProviders.map((provider) => (
            <option key={`candidate-${provider.id}`} value={provider.id}>
              {provider.name} ({provider.id})
            </option>
          ))}
        </select>
        <button
          className="inline-action"
          type="button"
          disabled={isWorking || candidateProviderId.length === 0}
          onClick={() => addProviderToChain(candidateProviderId)}
        >
          {localize(locale, "加入链路", "Add To Chain")}
        </button>
        <button
          className="inline-action"
          type="button"
          disabled={isWorking || providers.length === 0}
          onClick={applyEnabledProviders}
        >
          {localize(locale, "使用全部启用 Provider", "Use All Enabled Providers")}
        </button>
      </div>

      {bindingProviderId !== null && bindingProviderId.length > 0 ? (
        <div className="priority-editor-hint-row">
          <span>
            {localize(locale, "当前主 Binding Provider", "Current Primary Binding Provider")}:{" "}
            <code>{bindingProviderId}</code>
          </span>
          <button
            className="inline-action"
            type="button"
            disabled={isWorking}
            onClick={applyBoundPrimaryFirst}
          >
            {localize(locale, "设为 P1", "Set As P1")}
          </button>
        </div>
      ) : null}

      {providerIds.length === 0 ? (
        <div className="priority-empty-state">
          {localize(
            locale,
            "当前还没有故障转移链路。至少加入 2 个 Provider 才有自动切换意义。",
            "No failover chain is configured yet. It becomes meaningful once at least 2 providers are added."
          )}
        </div>
      ) : (
        <ol className="priority-list">
          {selectedProviders.map((provider, index) => {
            const isPrimaryBindingProvider = bindingProviderId === provider.id;
            return (
              <li
                key={`priority-${provider.id}`}
                className={`priority-item${draggingProviderId === provider.id ? " is-dragging" : ""}`}
                draggable={!isWorking}
                onDragStart={() => setDraggingProviderId(provider.id)}
                onDragEnd={() => setDraggingProviderId(null)}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingProviderId === null) {
                    return;
                  }
                  onChange(reorderProviderIds(providerIds, draggingProviderId, provider.id));
                  setDraggingProviderId(null);
                }}
              >
                <div className="priority-item-main">
                  <span className="priority-item-rank">P{index + 1}</span>
                  <div className="priority-item-body">
                    <strong>{provider.name}</strong>
                    <span>
                      <code>{provider.id}</code>
                      {!provider.enabled
                        ? ` / ${localize(locale, "已停用", "Disabled")}`
                        : provider.apiKeyMasked.trim().length === 0
                          ? ` / ${localize(locale, "缺少凭证", "Missing Credential")}`
                          : ""}
                    </span>
                  </div>
                </div>
                <div className="priority-item-actions">
                  {isPrimaryBindingProvider ? (
                    <span className="priority-item-badge">
                      {localize(locale, "主 Binding", "Primary Binding")}
                    </span>
                  ) : null}
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking || index === 0}
                    onClick={() => moveProviderInChain(provider.id, -1)}
                  >
                    {localize(locale, "上移", "Move Up")}
                  </button>
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking || index === selectedProviders.length - 1}
                    onClick={() => moveProviderInChain(provider.id, 1)}
                  >
                    {localize(locale, "下移", "Move Down")}
                  </button>
                  <button
                    className="inline-action danger"
                    type="button"
                    disabled={isWorking}
                    onClick={() => removeProviderFromChain(provider.id)}
                  >
                    {localize(locale, "移除", "Remove")}
                  </button>
                </div>
              </li>
            );
          })}
          {missingProviderIds.map((providerId) => (
            <li key={`priority-missing-${providerId}`} className="priority-item missing-provider">
              <div className="priority-item-main">
                <span className="priority-item-rank">!</span>
                <div className="priority-item-body">
                  <strong>{localize(locale, "缺失 Provider", "Missing Provider")}</strong>
                  <span>
                    <code>{providerId}</code>
                  </span>
                </div>
              </div>
              <div className="priority-item-actions">
                <button
                  className="inline-action danger"
                  type="button"
                  disabled={isWorking}
                  onClick={() => removeProviderFromChain(providerId)}
                >
                  {localize(locale, "从链路移除", "Remove From Chain")}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="form-hint">
        {localize(
          locale,
          "支持拖拽或用按钮调整顺序。P1 是首选上游，后续按顺序接替。",
          "Drag or use the buttons to reorder. P1 is the preferred upstream and the rest act as ordered fallbacks."
        )}
      </p>
    </div>
  );
};

const renderRoutingIssueCode = (
  issueCode:
    | ProviderRoutingPreview["issueCodes"][number]
    | AppBindingRoutingPreview["issueCodes"][number]
    | FailoverChainRoutingPreview["issueCodes"][number],
  t: (
    key:
      | "dashboard.routing.issue.providerMissing"
      | "dashboard.routing.issue.providerDisabled"
      | "dashboard.routing.issue.credentialMissing"
      | "dashboard.routing.issue.duplicateAppBinding"
      | "dashboard.routing.issue.failoverProviderMissing"
      | "dashboard.routing.issue.failoverProviderDuplicate"
      | "dashboard.routing.issue.failoverMissingPrimary"
      | "dashboard.routing.issue.failoverMaxAttemptsExceeded"
      | "dashboard.routing.issue.observeModeWithFailover"
      | "dashboard.routing.issue.noRoutableProvider"
      | "dashboard.routing.issue.circuitOpen"
  ) => string
): string => {
  switch (issueCode) {
    case "provider-missing":
      return t("dashboard.routing.issue.providerMissing");
    case "provider-disabled":
      return t("dashboard.routing.issue.providerDisabled");
    case "credential-missing":
      return t("dashboard.routing.issue.credentialMissing");
    case "duplicate-app-binding":
      return t("dashboard.routing.issue.duplicateAppBinding");
    case "failover-provider-missing":
      return t("dashboard.routing.issue.failoverProviderMissing");
    case "failover-provider-duplicate":
      return t("dashboard.routing.issue.failoverProviderDuplicate");
    case "failover-missing-primary":
      return t("dashboard.routing.issue.failoverMissingPrimary");
    case "failover-max-attempts-exceeds-candidates":
      return t("dashboard.routing.issue.failoverMaxAttemptsExceeded");
    case "observe-mode-with-failover":
      return t("dashboard.routing.issue.observeModeWithFailover");
    case "no-routable-provider":
      return t("dashboard.routing.issue.noRoutableProvider");
    case "circuit-open":
      return t("dashboard.routing.issue.circuitOpen");
  }
};

const renderCandidateDecisionLabel = (
  decision: AppBindingRoutingPreview["executionPlan"]["candidates"][number]["decision"],
  t: (
    key:
      | "dashboard.routing.candidate.selected"
      | "dashboard.routing.candidate.excluded"
      | "dashboard.routing.candidate.degraded"
      | "dashboard.routing.candidate.fallback"
  ) => string
): string => {
  switch (decision) {
    case "selected":
      return t("dashboard.routing.candidate.selected");
    case "excluded":
      return t("dashboard.routing.candidate.excluded");
    case "degraded":
      return t("dashboard.routing.candidate.degraded");
    case "fallback":
      return t("dashboard.routing.candidate.fallback");
  }
};

const renderCandidateDecisionReason = (
  reason: AppBindingRoutingPreview["executionPlan"]["candidates"][number]["decisionReason"],
  t: (
    key:
      | "dashboard.routing.reason.ready"
      | "dashboard.routing.reason.unexecutableDisabled"
      | "dashboard.routing.reason.unexecutableMissingCredential"
      | "dashboard.routing.reason.circuitOpen"
      | "dashboard.routing.reason.recentUnhealthyDemoted"
      | "dashboard.routing.reason.halfOpenFallback"
  ) => string
): string => {
  switch (reason) {
    case "ready":
      return t("dashboard.routing.reason.ready");
    case "unexecutable-disabled":
      return t("dashboard.routing.reason.unexecutableDisabled");
    case "unexecutable-missing-credential":
      return t("dashboard.routing.reason.unexecutableMissingCredential");
    case "circuit-open":
      return t("dashboard.routing.reason.circuitOpen");
    case "recent-unhealthy-demoted":
      return t("dashboard.routing.reason.recentUnhealthyDemoted");
    case "half-open-fallback":
      return t("dashboard.routing.reason.halfOpenFallback");
  }
};

type RoutingPolicyFormsPanelProps = {
  readonly providers: DashboardSnapshot["providers"];
  readonly bindings: AppBinding[];
  readonly providerForm: ProviderUpsert;
  readonly setProviderForm: Dispatch<SetStateAction<ProviderUpsert>>;
  readonly canSaveProvider: boolean;
  readonly providerPreview: ProviderRoutingPreview | null;
  readonly onSaveProvider: () => void;
  readonly bindingForm: AppBindingUpsert;
  readonly setBindingForm: Dispatch<SetStateAction<AppBindingUpsert>>;
  readonly canSaveBinding: boolean;
  readonly bindingPreview: AppBindingRoutingPreview | null;
  readonly onSaveBinding: () => void;
  readonly hasProviders: boolean;
  readonly appQuotaForm: AppQuotaUpsert;
  readonly setAppQuotaForm: Dispatch<SetStateAction<AppQuotaUpsert>>;
  readonly canSaveAppQuota: boolean;
  readonly appQuotaPreview: AppQuotaSavePreview | null;
  readonly onSaveAppQuota: () => void;
  readonly proxyForm: ProxyPolicy;
  readonly setProxyForm: Dispatch<SetStateAction<ProxyPolicy>>;
  readonly canSaveProxyPolicy: boolean;
  readonly proxyPolicyPreview: ProxyPolicySavePreview | null;
  readonly onSaveProxyPolicy: () => void;
  readonly failoverForm: FailoverChainUpsert;
  readonly setFailoverForm: Dispatch<SetStateAction<FailoverChainUpsert>>;
  readonly canSaveFailover: boolean;
  readonly failoverPreview: FailoverChainRoutingPreview | null;
  readonly onSaveFailover: () => void;
  readonly isWorking: boolean;
};

export const RoutingPolicyFormsPanel = ({
  providers,
  bindings,
  providerForm,
  setProviderForm,
  canSaveProvider,
  providerPreview,
  onSaveProvider,
  bindingForm,
  setBindingForm,
  canSaveBinding,
  bindingPreview,
  onSaveBinding,
  hasProviders,
  appQuotaForm,
  setAppQuotaForm,
  canSaveAppQuota,
  appQuotaPreview,
  onSaveAppQuota,
  proxyForm,
  setProxyForm,
  canSaveProxyPolicy,
  proxyPolicyPreview,
  onSaveProxyPolicy,
  failoverForm,
  setFailoverForm,
  canSaveFailover,
  failoverPreview,
  onSaveFailover,
  isWorking
}: RoutingPolicyFormsPanelProps): JSX.Element => {
  const { t, locale } = useI18n();
  const [providerDangerConfirmed, setProviderDangerConfirmed] = useState(false);
  const [bindingDangerConfirmed, setBindingDangerConfirmed] = useState(false);
  const [failoverDangerConfirmed, setFailoverDangerConfirmed] = useState(false);
  const firstProviderId = providers[0]?.id ?? "";
  const bindingSuggestedProviderId =
    bindingPreview?.executionPlan.candidates[0]?.providerId ?? firstProviderId;
  const failoverSuggestedMaxAttempts =
    failoverPreview?.executionPlan.candidates.length ?? failoverForm.maxAttempts;
  const providerRiskNotice = providerPreview ? buildRoutingGovernanceNotice(providerPreview, locale) : null;
  const bindingRiskNotice = bindingPreview ? buildRoutingGovernanceNotice(bindingPreview, locale) : null;
  const failoverRiskNotice = failoverPreview ? buildRoutingGovernanceNotice(failoverPreview, locale) : null;
  const providerExecutionSummary = providerPreview
    ? buildRoutingExecutionSummary(providerPreview, locale)
    : null;
  const bindingExecutionSummary = bindingPreview
    ? buildRoutingExecutionSummary(bindingPreview, locale)
    : null;
  const failoverExecutionSummary = failoverPreview
    ? buildRoutingExecutionSummary(failoverPreview, locale)
    : null;
  const providerRequiresDangerConfirm =
    providerPreview?.issueCodes.includes("credential-missing") === true ||
    providerPreview?.issueCodes.includes("circuit-open") === true;
  const bindingRequiresDangerConfirm =
    bindingPreview?.issueCodes.includes("duplicate-app-binding") === true ||
    bindingPreview?.issueCodes.includes("no-routable-provider") === true;
  const failoverRequiresDangerConfirm =
    failoverPreview?.issueCodes.includes("failover-provider-missing") === true ||
    failoverPreview?.issueCodes.includes("failover-missing-primary") === true ||
    failoverPreview?.issueCodes.includes("no-routable-provider") === true;
  const currentBindingProviderId =
    (bindingForm.appCode === failoverForm.appCode ? bindingForm.providerId : null) ??
    bindings.find((binding) => binding.appCode === failoverForm.appCode)?.providerId ??
    null;

  return (
    <>
      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveProvider();
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
          onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })}
          placeholder={t("dashboard.forms.baseUrl")}
        />
        <input
          type="password"
          value={providerForm.apiKey}
          onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })}
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
            onChange={(event) => setProviderForm({ ...providerForm, enabled: event.target.checked })}
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button
          className="auth-button"
          type="submit"
          disabled={isWorking || !canSaveProvider || (providerRequiresDangerConfirm && !providerDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        {!canSaveProvider ? <p className="form-hint">{t("dashboard.forms.previewRequired")}</p> : null}
        {providerPreview ? (
          <div className="preview-item">
            <strong>{t("dashboard.routing.providerPreviewTitle")}</strong>
            <p>
              {t("dashboard.routing.boundApps")}:{" "}
              {joinPreviewValues(providerPreview.boundAppCodes, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.routing.failoverApps")}:{" "}
              {joinPreviewValues(providerPreview.failoverAppCodes, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.routing.issueCodes")}:{" "}
              {providerPreview.issueCodes.length > 0
                ? providerPreview.issueCodes.map((item) => renderRoutingIssueCode(item, t)).join(" / ")
                : t("dashboard.workspace.noWarnings")}
            </p>
            <p>
              {t("dashboard.routing.previewWarnings")}:{" "}
              {joinDashboardWarnings(providerPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            {providerRiskNotice ? <GovernanceNoticeCard notice={providerRiskNotice} locale={locale} /> : null}
            {providerExecutionSummary ? (
              <GovernanceNoticeCard notice={providerExecutionSummary} locale={locale} />
            ) : null}
            {providerPreview.issueCodes.includes("credential-missing") ? (
              <div className="quick-action-row">
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setProviderForm({ ...providerForm, enabled: false })}
                >
                  {locale === "zh-CN" ? "先停用此 Provider" : "Disable Provider First"}
                </button>
              </div>
            ) : null}
            {providerRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  checked={providerDangerConfirmed}
                  onChange={(event) => setProviderDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认当前 Provider 仍存在高风险问题，保存仅用于止损或临时修复。",
                  "I understand this provider still has high-risk issues and this save is only for containment or temporary repair."
                )}
              </label>
            ) : null}
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <ConfigImpactSummary impact={providerPreview.impact} t={t} />
          </div>
        ) : null}
      </form>

      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveBinding();
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
          onChange={(event) => setBindingForm({ ...bindingForm, providerId: event.target.value })}
          disabled={!hasProviders}
        >
          {providers.map((provider) => (
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
        <button
          className="auth-button"
          type="submit"
          disabled={isWorking || !canSaveBinding || (bindingRequiresDangerConfirm && !bindingDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        {!hasProviders ? (
          <p className="form-hint">{t("dashboard.onboarding.bindingRequiresProvider")}</p>
        ) : !canSaveBinding ? (
          <p className="form-hint">{t("dashboard.forms.previewRequired")}</p>
        ) : null}
        {bindingPreview ? (
          <div className="preview-item">
            <strong>{t("dashboard.routing.bindingPreviewTitle")}</strong>
            <p>
              {t("dashboard.routing.issueCodes")}:{" "}
              {bindingPreview.issueCodes.length > 0
                ? bindingPreview.issueCodes.map((item) => renderRoutingIssueCode(item, t)).join(" / ")
                : t("dashboard.workspace.noWarnings")}
            </p>
            <p>
              {t("dashboard.routing.previewWarnings")}:{" "}
              {joinDashboardWarnings(bindingPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            {bindingRiskNotice ? <GovernanceNoticeCard notice={bindingRiskNotice} locale={locale} /> : null}
            {bindingExecutionSummary ? (
              <GovernanceNoticeCard notice={bindingExecutionSummary} locale={locale} />
            ) : null}
            <div className="quick-action-row">
              {bindingPreview.issueCodes.includes("provider-missing") && bindingSuggestedProviderId.length > 0 ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setBindingForm({
                      ...bindingForm,
                      providerId: bindingSuggestedProviderId
                    })
                  }
                >
                  {locale === "zh-CN" ? `改用 ${bindingSuggestedProviderId}` : `Use ${bindingSuggestedProviderId}`}
                </button>
              ) : null}
              {bindingPreview.issueCodes.includes("observe-mode-with-failover") ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setBindingForm({
                      ...bindingForm,
                      mode: "managed"
                    })
                  }
                >
                  {locale === "zh-CN" ? "切换到 managed" : "Switch To Managed"}
                </button>
              ) : null}
            </div>
            {bindingRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  checked={bindingDangerConfirmed}
                  onChange={(event) => setBindingDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认这个 Binding 预检仍未通过，保存后可能继续产生未命中或重复路由。",
                  "I understand this binding preview is still unsafe and saving may continue to produce unroutable or duplicate traffic."
                )}
              </label>
            ) : null}
            <p>{t("dashboard.routing.executionPlan")}: {bindingPreview.executionPlan.proxyPath}</p>
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <ConfigImpactSummary impact={bindingPreview.impact} t={t} />
            {bindingPreview.executionPlan.candidates.map((candidate) => (
              <p key={`binding-preview-${candidate.providerId}`}>
                {candidate.providerId} / {candidate.source} / {candidate.circuitState} /{" "}
                {candidate.willReceiveTraffic ? t("common.enabled") : t("common.disabled")} /{" "}
                {t("dashboard.routing.candidateState")}: {renderCandidateDecisionLabel(candidate.decision, t)} /{" "}
                {renderCandidateDecisionReason(candidate.decisionReason, t)}
              </p>
            ))}
          </div>
        ) : null}
      </form>

      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveAppQuota();
        }}
      >
        <h3>{t("dashboard.forms.appQuotaTitle")}</h3>
        <input
          value={appQuotaForm.id}
          onChange={(event) => setAppQuotaForm({ ...appQuotaForm, id: event.target.value })}
          placeholder={t("dashboard.forms.id")}
        />
        <select
          value={appQuotaForm.appCode}
          onChange={(event) =>
            setAppQuotaForm({
              ...appQuotaForm,
              appCode: event.target.value as AppQuotaUpsert["appCode"]
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
          value={appQuotaForm.period}
          onChange={(event) =>
            setAppQuotaForm({
              ...appQuotaForm,
              period: event.target.value as AppQuotaUpsert["period"]
            })
          }
        >
          <option value="day">day</option>
        </select>
        <input
          value={appQuotaForm.maxRequests ?? ""}
          onChange={(event) =>
            setAppQuotaForm({
              ...appQuotaForm,
              maxRequests: event.target.value.trim().length === 0 ? null : Number(event.target.value)
            })
          }
          placeholder={t("dashboard.forms.maxRequests")}
        />
        <input
          value={appQuotaForm.maxTokens ?? ""}
          onChange={(event) =>
            setAppQuotaForm({
              ...appQuotaForm,
              maxTokens: event.target.value.trim().length === 0 ? null : Number(event.target.value)
            })
          }
          placeholder={t("dashboard.forms.maxTokens")}
        />
        <label className="checkbox-row">
          <input
            checked={appQuotaForm.enabled}
            onChange={(event) => setAppQuotaForm({ ...appQuotaForm, enabled: event.target.checked })}
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button className="auth-button" type="submit" disabled={isWorking || !canSaveAppQuota}>
          {t("common.save")}
        </button>
        {!canSaveAppQuota ? <p className="form-hint">{t("dashboard.forms.previewRequired")}</p> : null}
        {appQuotaPreview ? (
          <div className="preview-item">
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <p>{t("dashboard.impact.appScope")}: {appQuotaPreview.appCode}</p>
            <p>
              {t("dashboard.impact.warnings")}:{" "}
              {joinDashboardWarnings(appQuotaPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            <ConfigImpactSummary impact={appQuotaPreview.impact} t={t} />
          </div>
        ) : null}
      </form>

      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveProxyPolicy();
        }}
      >
        <h3>{t("dashboard.forms.proxyTitle")}</h3>
        <input
          value={proxyForm.listenHost}
          onChange={(event) => setProxyForm({ ...proxyForm, listenHost: event.target.value })}
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
            setProxyForm({ ...proxyForm, requestTimeoutMs: Number(event.target.value) })
          }
          placeholder={t("dashboard.forms.requestTimeoutMs")}
        />
        <input
          value={proxyForm.failureThreshold}
          onChange={(event) =>
            setProxyForm({ ...proxyForm, failureThreshold: Number(event.target.value) })
          }
          placeholder={t("dashboard.forms.failureThreshold")}
        />
        <label className="checkbox-row">
          <input
            checked={proxyForm.enabled}
            onChange={(event) => setProxyForm({ ...proxyForm, enabled: event.target.checked })}
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button className="auth-button" type="submit" disabled={isWorking || !canSaveProxyPolicy}>
          {t("common.save")}
        </button>
        {!canSaveProxyPolicy ? <p className="form-hint">{t("dashboard.forms.previewRequired")}</p> : null}
        {proxyPolicyPreview ? (
          <div className="preview-item">
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <p>
              {t("dashboard.impact.warnings")}:{" "}
              {joinDashboardWarnings(proxyPolicyPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            <ConfigImpactSummary impact={proxyPolicyPreview.impact} t={t} />
          </div>
        ) : null}
      </form>

      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveFailover();
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
        <FailoverPriorityEditor
          locale={locale}
          providers={providers}
          providerIds={failoverForm.providerIds}
          bindingProviderId={currentBindingProviderId}
          isWorking={isWorking || !hasProviders}
          onChange={(providerIds) =>
            setFailoverForm({
              ...failoverForm,
              providerIds
            })
          }
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
        <button
          className="auth-button"
          type="submit"
          disabled={isWorking || !canSaveFailover || (failoverRequiresDangerConfirm && !failoverDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        {!hasProviders ? (
          <p className="form-hint">{t("dashboard.onboarding.failoverRequiresProvider")}</p>
        ) : !canSaveFailover ? (
          <p className="form-hint">{t("dashboard.forms.previewRequired")}</p>
        ) : null}
        {failoverPreview ? (
          <div className="preview-item">
            <strong>{t("dashboard.routing.failoverPreviewTitle")}</strong>
            <p>
              {t("dashboard.routing.normalizedProviders")}:{" "}
              {joinPreviewValues(failoverPreview.normalizedProviderIds, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.routing.issueCodes")}:{" "}
              {failoverPreview.issueCodes.length > 0
                ? failoverPreview.issueCodes.map((item) => renderRoutingIssueCode(item, t)).join(" / ")
                : t("dashboard.workspace.noWarnings")}
            </p>
            <p>
              {t("dashboard.routing.previewWarnings")}:{" "}
              {joinDashboardWarnings(failoverPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            {failoverRiskNotice ? <GovernanceNoticeCard notice={failoverRiskNotice} locale={locale} /> : null}
            {failoverExecutionSummary ? (
              <GovernanceNoticeCard notice={failoverExecutionSummary} locale={locale} />
            ) : null}
            <div className="quick-action-row">
              {joinValues(failoverPreview.normalizedProviderIds) !== joinValues(failoverForm.providerIds) ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setFailoverForm({
                      ...failoverForm,
                      providerIds: uniqueValues(failoverPreview.normalizedProviderIds)
                    })
                  }
                >
                  {locale === "zh-CN" ? "应用归一化 Provider 列表" : "Apply Normalized Providers"}
                </button>
              ) : null}
              {failoverPreview.issueCodes.includes("failover-max-attempts-exceeds-candidates") ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setFailoverForm({
                      ...failoverForm,
                      maxAttempts: Math.max(1, failoverSuggestedMaxAttempts)
                    })
                  }
                >
                  {locale === "zh-CN"
                    ? `将最大尝试次数调整为 ${Math.max(1, failoverSuggestedMaxAttempts)}`
                    : `Set Max Attempts To ${Math.max(1, failoverSuggestedMaxAttempts)}`}
                </button>
              ) : null}
            </div>
            {failoverRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  checked={failoverDangerConfirmed}
                  onChange={(event) => setFailoverDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认故障转移链仍存在高风险缺口，保存后可能无法正确兜底流量。",
                  "I understand this failover chain still has high-risk gaps and may fail to protect traffic after saving."
                )}
              </label>
            ) : null}
            <p>{t("dashboard.routing.executionPlan")}: {failoverPreview.executionPlan.proxyPath}</p>
            <strong>{t("dashboard.routing.impactTitle")}</strong>
            <ConfigImpactSummary impact={failoverPreview.impact} t={t} />
            {failoverPreview.executionPlan.candidates.map((candidate) => (
              <p key={`failover-preview-${candidate.providerId}`}>
                {candidate.providerId} / {candidate.source} / {candidate.circuitState} /{" "}
                {candidate.willReceiveTraffic ? t("common.enabled") : t("common.disabled")} /{" "}
                {t("dashboard.routing.candidateState")}: {renderCandidateDecisionLabel(candidate.decision, t)} /{" "}
                {renderCandidateDecisionReason(candidate.decisionReason, t)}
              </p>
            ))}
          </div>
        ) : null}
      </form>
    </>
  );
};
