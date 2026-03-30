import { useEffect, useState } from "react";

import type {
  ConfigImportPreview,
  ConfigRestorePreview,
  ConfigSnapshotDiff,
  ConfigSnapshotDiffBucket
} from "@cc-switch-web/shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { ConfigImpactSummary } from "./ConfigImpactSummary.js";
import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

type SnapshotDiffBucketKey =
  | "providers"
  | "promptTemplates"
  | "skills"
  | "workspaces"
  | "sessionRecords"
  | "bindings"
  | "appQuotas"
  | "failoverChains"
  | "mcpServers"
  | "appMcpBindings";

type RecoveryPanelProps = {
  readonly exportText: string;
  readonly importText: string;
  readonly importPreview: ConfigImportPreview | null;
  readonly importPreviewIsCurrent: boolean;
  readonly restorePreview: ConfigRestorePreview | null;
  readonly restorePreviewIsCurrent: boolean;
  readonly selectedSnapshotVersion: number | null;
  readonly effectiveSnapshotDiff: ConfigSnapshotDiff | null;
  readonly latestSnapshotReason: string | null;
  readonly snapshotDiffItems: Array<{
    readonly key: SnapshotDiffBucketKey;
    readonly bucket: ConfigSnapshotDiffBucket;
  }>;
  readonly recentSnapshots: DashboardSnapshot["recentSnapshots"];
  readonly isWorking: boolean;
  readonly onImportTextChange: (value: string) => void;
  readonly onExport: (options?: { readonly includeSecrets?: boolean }) => void;
  readonly onPreviewImport: () => void;
  readonly onImport: () => void;
  readonly onRestore: () => void;
  readonly onInspectSnapshot: (version: number) => void;
  readonly onPrepareRestoreSnapshot: (version: number) => void;
  readonly onOpenAssetForms: () => void;
  readonly onOpenRoutingForms: () => void;
  readonly onOpenMcpForms: () => void;
  readonly formatNumber: (value: number) => string;
  readonly formatDateTime: (value: string) => string;
  readonly formatSnapshotDiffItems: (bucket: ConfigSnapshotDiffBucket, emptyLabel: string) => string;
  readonly renderSnapshotDiffBucketLabel: (
    key: SnapshotDiffBucketKey,
    t: RecoveryPanelProps["t"]
  ) => string;
  readonly t: (
    key:
      | "dashboard.panels.recovery"
      | "common.export"
      | "common.import"
      | "common.refresh"
      | "common.restore"
      | "common.notFound"
      | "dashboard.forms.exportTitle"
      | "dashboard.forms.importTitle"
      | "dashboard.forms.importPlaceholder"
      | "dashboard.forms.restoreHint"
      | "dashboard.forms.importReviewRequired"
      | "dashboard.forms.restoreReviewRequired"
      | "dashboard.forms.restoreReviewReady"
      | "dashboard.snapshots.recentTitle"
      | "dashboard.snapshots.inspectVersion"
      | "dashboard.snapshots.restoreVersion"
      | "dashboard.snapshots.selectedVersion"
      | "dashboard.snapshots.selectedVersionNotice"
      | "dashboard.snapshots.latestDiffTitle"
      | "dashboard.snapshots.currentVersion"
      | "dashboard.snapshots.targetVersion"
      | "dashboard.snapshots.changeReason"
      | "dashboard.snapshots.latestDiffSummary"
      | "dashboard.snapshots.rollbackObjects"
      | "dashboard.snapshots.bucket.providers"
      | "dashboard.snapshots.bucket.promptTemplates"
      | "dashboard.snapshots.bucket.skills"
      | "dashboard.snapshots.bucket.workspaces"
      | "dashboard.snapshots.bucket.sessionRecords"
      | "dashboard.snapshots.bucket.bindings"
      | "dashboard.snapshots.bucket.appQuotas"
      | "dashboard.snapshots.bucket.failoverChains"
      | "dashboard.snapshots.bucket.mcpServers"
      | "dashboard.snapshots.bucket.appMcpBindings"
      | "dashboard.routing.impactTitle"
      | "dashboard.impact.warnings"
      | "dashboard.impact.summary"
      | "dashboard.impact.affectedApps"
      | "dashboard.impact.requiresSnapshot"
      | "dashboard.impact.requiresProxyReload"
      | "dashboard.impact.touchesRouting"
      | "dashboard.impact.touchesHostManagedMcp"
      | "dashboard.impact.riskLevel"
      | "dashboard.impact.risk.low"
      | "dashboard.impact.risk.medium"
      | "dashboard.impact.risk.high"
      | "dashboard.workspace.noWarnings"
      | "common.enabled"
      | "common.disabled"
  ) => string;
};

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

const summarizeBucketMagnitude = (bucket: ConfigSnapshotDiffBucket): number =>
  bucket.added.length + bucket.changed.length + bucket.removed.length;

const buildRecoveryNotice = (
  locale: "zh-CN" | "en-US",
  warnings: string[],
  riskLevel: "low" | "medium" | "high",
  mode: "import" | "restore",
  touchedBuckets: string[]
) => ({
  level: riskLevel,
  summary:
    mode === "import"
      ? localize(
          locale,
          "这次导入会替换当前持久化配置，执行前应确认覆盖范围与运行面影响。",
          "This import replaces the current persisted config. Confirm the overwrite scope and runtime impact before executing."
        )
      : localize(
          locale,
          "这次恢复会把系统切回历史快照，并基于该状态重新生成新快照。",
          "This restore switches the system back to a historical snapshot and creates a new snapshot from that state."
        ),
  suggestions:
    warnings.length > 0
      ? [
          ...warnings.map((item) => item),
          localize(
            locale,
            `优先核对这些变更桶：${joinPreviewValues(touchedBuckets, "none")}。`,
            `Review these change buckets first: ${joinPreviewValues(touchedBuckets, "none")}.`
          )
        ]
      : [
          localize(
            locale,
            `重点确认这些对象类别：${joinPreviewValues(touchedBuckets, "none")}。`,
            `Focus on these object groups: ${joinPreviewValues(touchedBuckets, "none")}.`
          )
        ]
});

const buildRecoveryRunbook = (
  locale: "zh-CN" | "en-US",
  mode: "import" | "restore",
  touchedBuckets: string[],
  riskLevel: "low" | "medium" | "high",
  hasHostMcpImpact: boolean
): string[] => {
  const focusBuckets = joinPreviewValues(
    touchedBuckets,
    localize(locale, "无", "none")
  );

  return [
    mode === "import"
      ? localize(
          locale,
          `先确认导入内容覆盖范围，重点看这些对象桶：${focusBuckets}。`,
          `First confirm the import overwrite scope, especially these buckets: ${focusBuckets}.`
        )
      : localize(
          locale,
          `先确认恢复目标版本和差异桶，重点看这些对象桶：${focusBuckets}。`,
          `First confirm the target restore version and diff buckets, especially: ${focusBuckets}.`
        ),
    riskLevel === "high"
      ? localize(
          locale,
          "再检查路由与运行态影响，确认这次动作不会把当前 managed 流量切到不可执行状态。",
          "Then inspect routing and runtime impact so managed traffic is not pushed into an unroutable state."
        )
      : localize(
          locale,
          "再检查核心运行态，确认代理、绑定和上下文对象仍然处于可用状态。",
          "Then inspect core runtime so the proxy, bindings, and context assets remain usable."
        ),
    hasHostMcpImpact
      ? localize(
          locale,
          "最后检查 MCP 宿主机同步结果，确认没有留下 drift、missing server 或 disabled binding。",
          "Finally inspect MCP host sync results and confirm there is no drift, missing server, or disabled binding left behind."
        )
      : localize(
          locale,
          "最后看真实请求与审计事件，确认新的错误、拒绝或故障转移没有上升。",
          "Finally inspect live requests and audit events to confirm new errors, rejections, or failovers are not rising."
        )
  ];
};

const buildRecoveryValidationChecklist = (
  locale: "zh-CN" | "en-US",
  mode: "import" | "restore",
  riskLevel: "low" | "medium" | "high",
  touchesRouting: boolean,
  touchesHostManagedMcp: boolean
): string[] => {
  const items = [
    mode === "import"
      ? localize(
          locale,
          "导入后的对象计数和预览一致，没有出现缺失桶或意外新增桶。",
          "The imported object counts match the preview, with no missing or unexpected buckets."
        )
      : localize(
          locale,
          "恢复后的当前版本、目标版本和差异摘要与预期一致，没有恢复错版本。",
          "The restored current version, target version, and diff summary match expectations."
        ),
    touchesRouting
      ? localize(
          locale,
          "相关应用的 binding / failover 仍然可执行，没有新增 no-binding、provider-disabled 或 no-routable-provider。",
          "Related app binding and failover remain executable, with no new no-binding, provider-disabled, or no-routable-provider states."
        )
      : localize(
          locale,
          "运行时健康状态维持稳定，没有因为对象回滚导致核心服务退化。",
          "Runtime health remains stable and the action did not degrade core services."
        )
  ];

  if (touchesHostManagedMcp) {
    items.push(
      localize(
        locale,
        "MCP runtime 与宿主机同步状态收敛，没有新增 drift、missing command 或 duplicate binding。",
        "MCP runtime and host sync converge without new drift, missing command, or duplicate binding issues."
      )
    );
  }

  if (riskLevel === "high") {
    items.push(
      localize(
        locale,
        "高风险信号应在执行后持续观察一轮，请求错误率和审计异常不能继续上升。",
        "High-risk signals should be observed for another cycle after execution; request error rate and audit anomalies must not keep rising."
      )
    );
  }

  return items;
};

const resolveBucketAction = (
  key: SnapshotDiffBucketKey,
  onOpenAssetForms: () => void,
  onOpenRoutingForms: () => void,
  onOpenMcpForms: () => void
): (() => void) => {
  switch (key) {
    case "providers":
    case "bindings":
    case "appQuotas":
    case "failoverChains":
      return onOpenRoutingForms;
    case "mcpServers":
    case "appMcpBindings":
      return onOpenMcpForms;
    default:
      return onOpenAssetForms;
  }
};

export const RecoveryPanel = ({
  exportText,
  importText,
  importPreview,
  importPreviewIsCurrent,
  restorePreview,
  restorePreviewIsCurrent,
  selectedSnapshotVersion,
  effectiveSnapshotDiff,
  latestSnapshotReason,
  snapshotDiffItems,
  recentSnapshots,
  isWorking,
  onImportTextChange,
  onExport,
  onPreviewImport,
  onImport,
  onRestore,
  onInspectSnapshot,
  onPrepareRestoreSnapshot,
  onOpenAssetForms,
  onOpenRoutingForms,
  onOpenMcpForms,
  formatNumber,
  formatDateTime,
  formatSnapshotDiffItems,
  renderSnapshotDiffBucketLabel,
  t
}: RecoveryPanelProps): JSX.Element => {
  const { locale } = useI18n();
  const [includeSensitiveExport, setIncludeSensitiveExport] = useState(false);
  const [sensitiveExportConfirmed, setSensitiveExportConfirmed] = useState(false);
  const [importRiskConfirmed, setImportRiskConfirmed] = useState(false);
  const [restoreRiskConfirmed, setRestoreRiskConfirmed] = useState(false);
  const importRequiresConfirmation =
    importPreview !== null &&
    (importPreview.warnings.length > 0 ||
      importPreview.impact.riskLevel === "high" ||
      importPreview.impact.requiresProxyReload ||
      importPreview.impact.touchesRouting ||
      importPreview.impact.touchesHostManagedMcp);
  const restoreRequiresConfirmation =
    restorePreview !== null &&
    (restorePreview.warnings.length > 0 ||
      restorePreview.impact.riskLevel !== "low" ||
      restorePreview.impact.requiresProxyReload ||
      restorePreview.impact.touchesRouting ||
      restorePreview.impact.touchesHostManagedMcp);
  const importObjectCount =
    (importPreview?.counts.providers ?? 0) +
    (importPreview?.counts.promptTemplates ?? 0) +
    (importPreview?.counts.skills ?? 0) +
    (importPreview?.counts.workspaces ?? 0) +
    (importPreview?.counts.sessionRecords ?? 0) +
    (importPreview?.counts.bindings ?? 0) +
    (importPreview?.counts.appQuotas ?? 0) +
    (importPreview?.counts.failoverChains ?? 0) +
    (importPreview?.counts.mcpServers ?? 0) +
    (importPreview?.counts.appMcpBindings ?? 0);
  const changedSnapshotBuckets = snapshotDiffItems
    .filter(({ bucket }) => summarizeBucketMagnitude(bucket) > 0)
    .sort((left, right) => summarizeBucketMagnitude(right.bucket) - summarizeBucketMagnitude(left.bucket));
  const importTouchedBuckets = importPreview
    ? snapshotDiffItems
        .filter(({ key }) => (importPreview.counts[key] ?? 0) > 0)
        .map(({ key }) => renderSnapshotDiffBucketLabel(key, t))
    : [];
  const restoreTouchedBuckets = changedSnapshotBuckets.map(({ key }) =>
    renderSnapshotDiffBucketLabel(key, t)
  );
  const importRunbook =
    importPreview === null
      ? []
      : buildRecoveryRunbook(
          locale,
          "import",
          importTouchedBuckets,
          importPreview.impact.riskLevel,
          importPreview.impact.touchesHostManagedMcp
        );
  const restoreRunbook =
    restorePreview === null
      ? []
      : buildRecoveryRunbook(
          locale,
          "restore",
          restoreTouchedBuckets,
          restorePreview.impact.riskLevel,
          restorePreview.impact.touchesHostManagedMcp
        );
  const importValidationChecklist =
    importPreview === null
      ? []
      : buildRecoveryValidationChecklist(
          locale,
          "import",
          importPreview.impact.riskLevel,
          importPreview.impact.touchesRouting,
          importPreview.impact.touchesHostManagedMcp
        );
  const restoreValidationChecklist =
    restorePreview === null
      ? []
      : buildRecoveryValidationChecklist(
          locale,
          "restore",
          restorePreview.impact.riskLevel,
          restorePreview.impact.touchesRouting,
          restorePreview.impact.touchesHostManagedMcp
        );

  useEffect(() => {
    setImportRiskConfirmed(false);
  }, [importPreview]);

  useEffect(() => {
    setRestoreRiskConfirmed(false);
  }, [restorePreview, selectedSnapshotVersion]);

  return (
    <article className="panel panel-span-2">
      <h2>{t("dashboard.panels.recovery")}</h2>
      <div className="write-grid">
        <section className="form-card" data-testid="recovery-export-panel">
          <h3>{t("dashboard.forms.exportTitle")}</h3>
          <textarea
            data-testid="recovery-export-textarea"
            className="json-editor"
            value={exportText}
            readOnly
            placeholder={`{\n  "version": "0.1.0"\n}`}
          />
          <label className="checkbox-row">
            <input
              data-testid="recovery-export-include-secrets-checkbox"
              checked={includeSensitiveExport}
              onChange={(event) => {
                setIncludeSensitiveExport(event.target.checked);
                if (!event.target.checked) {
                  setSensitiveExportConfirmed(false);
                }
              }}
              type="checkbox"
            />{" "}
            {localize(
              locale,
              "导出含 Provider 凭证的恢复包",
              "Export Recovery Bundle With Provider Credentials"
            )}
          </label>
          {includeSensitiveExport ? (
            <label className="danger-confirm-row checkbox-row">
              <input
                data-testid="recovery-export-secrets-confirm"
                checked={sensitiveExportConfirmed}
                onChange={(event) => setSensitiveExportConfirmed(event.target.checked)}
                type="checkbox"
              />{" "}
              {localize(
                locale,
                "我已确认该导出包会包含敏感凭证，只能在受控环境中临时传输和保存。",
                "I understand this export bundle includes sensitive credentials and must only be transferred or stored in a controlled environment."
              )}
            </label>
          ) : null}
          <button
            className="auth-button"
            data-testid="recovery-export-button"
            type="button"
            disabled={isWorking || (includeSensitiveExport && !sensitiveExportConfirmed)}
            onClick={() => onExport({ includeSecrets: includeSensitiveExport })}
          >
            {t("common.export")}
          </button>
        </section>

        <section className="form-card" data-testid="recovery-import-panel">
          <h3>{t("dashboard.forms.importTitle")}</h3>
          <textarea
            data-testid="recovery-import-textarea"
            className="json-editor"
            value={importText}
            onChange={(event) => onImportTextChange(event.target.value)}
            placeholder={t("dashboard.forms.importPlaceholder")}
          />
          <div className="button-row">
            <button
              className="inline-action"
              data-testid="recovery-preview-import-button"
              type="button"
              disabled={isWorking}
              onClick={onPreviewImport}
            >
              {t("common.refresh")}
            </button>
            <button
              className="auth-button"
              data-testid="recovery-import-button"
              type="button"
              disabled={isWorking || !importPreviewIsCurrent || (importRequiresConfirmation && !importRiskConfirmed)}
              onClick={onImport}
            >
              {t("common.import")}
            </button>
            <button
              className="inline-action"
              data-testid="recovery-restore-button"
              type="button"
              disabled={isWorking || !restorePreviewIsCurrent || (restoreRequiresConfirmation && !restoreRiskConfirmed)}
              onClick={onRestore}
            >
              {t("common.restore")}
            </button>
          </div>
          <p className="form-hint">{t("dashboard.forms.restoreHint")}</p>
          {!importPreviewIsCurrent ? (
            <p className="form-hint">{t("dashboard.forms.importReviewRequired")}</p>
          ) : null}
          {!restorePreviewIsCurrent ? (
            <p className="form-hint">{t("dashboard.forms.restoreReviewRequired")}</p>
          ) : null}
          {importPreview ? (
            <div className="preview-item" data-testid="recovery-import-preview">
              <strong>{t("dashboard.routing.impactTitle")}</strong>
              <GovernanceNoticeCard
                locale={locale}
                notice={buildRecoveryNotice(
                  locale,
                  importPreview.warnings.map((item) => joinDashboardWarnings([item], locale, item)),
                  importPreview.impact.riskLevel,
                  "import",
                  importTouchedBuckets
                )}
              />
              <div className="preview-summary-grid">
                <div className="preview-summary-tile">
                  <strong>{formatNumber(importObjectCount)}</strong>
                  <span>{localize(locale, "导入对象总数", "Imported Objects")}</span>
                </div>
                <div className="preview-summary-tile">
                  <strong>{formatNumber(importPreview.counts.bindings + importPreview.counts.failoverChains)}</strong>
                  <span>{localize(locale, "路由相关对象", "Routing Objects")}</span>
                </div>
                <div className="preview-summary-tile">
                  <strong>{formatNumber(importPreview.counts.mcpServers + importPreview.counts.appMcpBindings)}</strong>
                  <span>{localize(locale, "MCP 相关对象", "MCP Objects")}</span>
                </div>
                <div className={`preview-summary-tile risk-${importPreview.impact.riskLevel}`}>
                  <strong>{t(`dashboard.impact.risk.${importPreview.impact.riskLevel}` as never)}</strong>
                  <span>{localize(locale, "执行风险等级", "Execution Risk")}</span>
                </div>
              </div>
              <p>
                {t("dashboard.impact.warnings")}:{" "}
                {joinDashboardWarnings(importPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
              </p>
              <div className="operation-guide-grid">
                <div className="preview-item">
                  <strong>{localize(locale, "执行后应验证", "Validate After Import")}</strong>
                  <ul className="operation-checklist">
                    {importValidationChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="preview-item">
                  <strong>{localize(locale, "推荐检查顺序", "Recommended Check Order")}</strong>
                  <ol className="operation-checklist ordered">
                    {importRunbook.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="preview-diff-list">
                {snapshotDiffItems
                  .filter(({ key }) => (importPreview.counts[key] ?? 0) > 0)
                  .sort((left, right) => (importPreview.counts[right.key] ?? 0) - (importPreview.counts[left.key] ?? 0))
                  .map(({ key }) => (
                    <div className="preview-diff-row" key={`import-count-${key}`}>
                      <strong>{renderSnapshotDiffBucketLabel(key, t)}</strong>
                      <p>
                        {localize(locale, "将导入对象数", "Objects To Import")}:{" "}
                        {formatNumber(importPreview.counts[key] ?? 0)}
                      </p>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={resolveBucketAction(key, onOpenAssetForms, onOpenRoutingForms, onOpenMcpForms)}
                      >
                        {localize(locale, "打开对应修复区", "Open Repair Section")}
                      </button>
                    </div>
                  ))}
              </div>
              <ConfigImpactSummary impact={importPreview.impact} t={t} />
              {importRequiresConfirmation ? (
                <label className="danger-confirm-row checkbox-row">
                  <input
                    data-testid="recovery-import-confirm"
                    checked={importRiskConfirmed}
                    onChange={(event) => setImportRiskConfirmed(event.target.checked)}
                    type="checkbox"
                  />{" "}
                  {localize(
                    locale,
                    "我已确认导入将覆盖当前持久化配置，并接受可能触发代理重载或宿主机 MCP 变更。",
                    "I understand this import will overwrite persisted config and may trigger proxy reload or host MCP changes."
                  )}
                </label>
              ) : null}
            </div>
          ) : null}
          {recentSnapshots.length > 0 ? (
            <div className="preview-item" data-testid="recovery-snapshot-list">
              <strong>{t("dashboard.snapshots.recentTitle")}</strong>
              {recentSnapshots.map((item) => (
                <p data-testid={`recovery-snapshot-${item.version}`} key={`snapshot-${item.version}`}>
                  v{item.version} / {item.reason} / {formatDateTime(item.createdAt)} / providers{" "}
                  {formatNumber(item.counts.providers)} / bindings {formatNumber(item.counts.bindings)}{" "}
                  <button
                    className="inline-action"
                    data-testid={`recovery-snapshot-inspect-${item.version}`}
                    type="button"
                    disabled={isWorking}
                    onClick={() => onInspectSnapshot(item.version)}
                  >
                    {selectedSnapshotVersion === item.version
                      ? t("dashboard.snapshots.selectedVersion")
                      : t("dashboard.snapshots.inspectVersion")}
                  </button>{" "}
                  <button
                    className="inline-action"
                    data-testid={`recovery-snapshot-restore-${item.version}`}
                    type="button"
                    disabled={isWorking}
                    onClick={() => onPrepareRestoreSnapshot(item.version)}
                  >
                    {t("dashboard.snapshots.restoreVersion")}
                  </button>
                </p>
              ))}
            </div>
          ) : null}
          {effectiveSnapshotDiff ? (
            <div className="preview-item" data-testid="recovery-restore-preview">
              <strong>{t("dashboard.snapshots.latestDiffTitle")}</strong>
              {restorePreview ? (
                <>
                  <GovernanceNoticeCard
                    locale={locale}
                    notice={buildRecoveryNotice(
                      locale,
                      restorePreview.warnings.map((item) => joinDashboardWarnings([item], locale, item)),
                      restorePreview.impact.riskLevel,
                      "restore",
                      restoreTouchedBuckets
                    )}
                  />
                  <p>
                    {t("dashboard.impact.warnings")}:{" "}
                    {joinDashboardWarnings(restorePreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
                  </p>
                  <div className="operation-guide-grid">
                    <div className="preview-item">
                      <strong>{localize(locale, "执行后应验证", "Validate After Restore")}</strong>
                      <ul className="operation-checklist">
                        {restoreValidationChecklist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="preview-item">
                      <strong>{localize(locale, "推荐检查顺序", "Recommended Check Order")}</strong>
                      <ol className="operation-checklist ordered">
                        {restoreRunbook.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  <ConfigImpactSummary impact={restorePreview.impact} t={t} />
                </>
              ) : null}
              <p>{t("dashboard.snapshots.currentVersion")}: v{effectiveSnapshotDiff.toVersion}</p>
              <p>
                {t("dashboard.snapshots.targetVersion")}:{" "}
                {effectiveSnapshotDiff.fromVersion === null
                  ? t("common.notFound")
                  : `v${effectiveSnapshotDiff.fromVersion}`}
              </p>
              <p>{t("dashboard.snapshots.changeReason")}: {latestSnapshotReason ?? t("common.notFound")}</p>
              <p>
                {t("dashboard.snapshots.latestDiffSummary")}: +
                {formatNumber(effectiveSnapshotDiff.summary.totalAdded)} / -
                {formatNumber(effectiveSnapshotDiff.summary.totalRemoved)} / ~
                {formatNumber(effectiveSnapshotDiff.summary.totalChanged)}
              </p>
              <p>{t("dashboard.snapshots.rollbackObjects")}</p>
              <div className="preview-diff-list">
                {changedSnapshotBuckets.length === 0 ? (
                  <div className="preview-diff-row">
                    <strong>{localize(locale, "当前没有对象差异", "No Object Diff")}</strong>
                    <p>{t("common.notFound")}</p>
                  </div>
                ) : (
                  changedSnapshotBuckets.map(({ key, bucket }) => (
                    <div className="preview-diff-row" key={`snapshot-diff-${key}`}>
                      <strong>{renderSnapshotDiffBucketLabel(key, t)}</strong>
                      <p>{formatSnapshotDiffItems(bucket, t("common.notFound"))}</p>
                      <p>
                        {localize(locale, "变更规模", "Change Magnitude")}:{" "}
                        {formatNumber(summarizeBucketMagnitude(bucket))}
                      </p>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={resolveBucketAction(key, onOpenAssetForms, onOpenRoutingForms, onOpenMcpForms)}
                      >
                        {localize(locale, "打开对应修复区", "Open Repair Section")}
                      </button>
                    </div>
                  ))
                )}
              </div>
              {restoreRequiresConfirmation ? (
                <label className="danger-confirm-row checkbox-row">
                  <input
                    data-testid="recovery-restore-confirm"
                    checked={restoreRiskConfirmed}
                    onChange={(event) => setRestoreRiskConfirmed(event.target.checked)}
                    type="checkbox"
                  />{" "}
                  {localize(
                    locale,
                    "我已确认恢复会用所选快照覆盖当前配置，未导出的新变更可能丢失。",
                    "I understand restore will replace the current config with the selected snapshot and newer unexported changes may be lost."
                  )}
                </label>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </article>
  );
};
