import type {
  AppBinding,
  PromptHostImportPreview,
  PromptHostSyncPreview
} from "@cc-switch-web/shared";

import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const formatDateTime = (value: string | null): string =>
  value === null ? "n/a" : value.replace("T", " ").replace(".000Z", "Z");

const previewText = (value: string, limit = 120): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...`;
};

const renderSupportLevel = (
  supportLevel: DashboardSnapshot["promptHostSyncCapabilities"][number]["supportLevel"],
  locale: "zh-CN" | "en-US"
): string =>
  supportLevel === "managed"
    ? localize(locale, "已托管", "Managed")
    : localize(locale, "规划中", "Planned");

const renderSkillDeliverySupportLevel = (
  supportLevel: DashboardSnapshot["skillDeliveryCapabilities"][number]["supportLevel"],
  locale: "zh-CN" | "en-US"
): string =>
  supportLevel === "proxy-only"
    ? localize(locale, "代理侧注入", "Proxy Injection")
    : localize(locale, "规划中", "Planned");

const renderSkillDeliveryRecommendedPath = (
  recommendedPath: DashboardSnapshot["skillDeliveryCapabilities"][number]["recommendedPath"],
  locale: "zh-CN" | "en-US"
): string =>
  recommendedPath === "active-context-injection"
    ? localize(locale, "Active Context 注入", "Active Context Injection")
    : localize(locale, "等待稳定宿主机契约", "Wait For Stable Host Contract");

const renderSelectionSource = (
  source: PromptHostSyncPreview["selectionSource"],
  locale: "zh-CN" | "en-US"
): string => {
  switch (source) {
    case "active-context":
      return localize(locale, "当前激活上下文", "Active Context");
    case "single-app-prompt":
      return localize(locale, "单一应用 Prompt 回退", "Single App Prompt");
    case "single-global-prompt":
      return localize(locale, "单一全局 Prompt 回退", "Single Global Prompt");
    case "ambiguous":
      return localize(locale, "候选冲突", "Ambiguous");
    case "missing":
      return localize(locale, "缺失可用 Prompt", "Missing Prompt");
  }
};

const renderImportStatus = (
  status: PromptHostImportPreview["status"],
  locale: "zh-CN" | "en-US"
): string => {
  switch (status) {
    case "ready-create":
      return localize(locale, "可导入为新资产", "Ready To Create");
    case "ready-match":
      return localize(locale, "已匹配现有资产", "Matched Existing Asset");
    case "missing-file":
      return localize(locale, "宿主机文件不存在", "Host File Missing");
    case "empty-file":
      return localize(locale, "宿主机文件为空", "Host File Empty");
  }
};

const buildPromptHostNotice = ({
  applyPreview,
  importPreview,
  syncState,
  locale
}: {
  readonly applyPreview: PromptHostSyncPreview | null;
  readonly importPreview: PromptHostImportPreview | null;
  readonly syncState: DashboardSnapshot["promptHostSyncStates"][number] | null;
  readonly locale: "zh-CN" | "en-US";
}): {
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly suggestions: string[];
} => {
  if (applyPreview === null) {
    return {
      level: "medium",
      summary: localize(
        locale,
        "同步预览尚未加载完成，先不要直接改宿主机文件。",
        "The sync preview is not loaded yet, so avoid changing the host file blindly."
      ),
      suggestions: [
        localize(locale, "等待控制台自动刷新预览结果。", "Wait for the console to refresh the preview."),
        localize(locale, "如需立即处理，可先回到上下文资产区检查 Prompt。", "If you need to act immediately, review prompt assets first.")
      ]
    };
  }

  if (!applyPreview.applyReady) {
    return {
      level: "high",
      summary: localize(
        locale,
        "当前没有唯一可下发的 Prompt，宿主机同步被阻断。",
        "There is no unique prompt to sync right now, so host rollout is blocked."
      ),
      suggestions: [
        localize(locale, "先收敛 Prompt 候选，只保留一个明确入口。", "Reduce prompt candidates until there is a single clear source."),
        localize(locale, "如果宿主机文件里已有可信内容，可先导入成资产再决定启用。", "If the host file already contains trusted content, import it into assets first before enabling it.")
      ]
    };
  }

  if (importPreview?.status === "ready-create") {
    return {
      level: "medium",
      summary: localize(
        locale,
        "宿主机文件里有未归档的 Prompt 内容，建议先导入资产，再决定是否继续覆盖宿主机。",
        "The host file contains prompt content that is not archived yet. Import it into assets before overwriting the host."
      ),
      suggestions: [
        localize(locale, "先执行导入，形成可回溯的禁用 Prompt 资产。", "Import it first to create a traceable disabled prompt asset."),
        localize(locale, "确认内容后，再执行 apply 统一宿主机与控制台。", "After review, run apply to align the host and console.")
      ]
    };
  }

  if (applyPreview.ignoredSkillId !== null) {
    return {
      level: "medium",
      summary: localize(
        locale,
        "当前 Skill 仍保持代理侧注入，宿主机文件只会写入 Prompt 本体。",
        "The current skill remains proxy-only, so only the prompt itself will be written to the host file."
      ),
      suggestions: [
        localize(locale, "同步后同时验证宿主机文件和代理链路。", "Validate both the host file and proxy path after syncing."),
        localize(locale, "不要误以为宿主机文件已经包含 Skill 内容。", "Do not assume the host file now includes the skill content.")
      ]
    };
  }

  if (syncState !== null && !applyPreview.hasDiff) {
    return {
      level: "low",
      summary: localize(
        locale,
        "宿主机 Prompt 文件已经与当前选择的资产一致。",
        "The host prompt file already matches the currently selected asset."
      ),
      suggestions: [
        localize(locale, "如果只是审计确认，可直接查看状态和宿主机文件路径。", "If you are only auditing, review the state and host file path."),
        localize(locale, "发生手工漂移后，再重新执行 apply。", "Run apply again only after a manual drift appears.")
      ]
    };
  }

  return {
    level: "low",
    summary: localize(
      locale,
      "当前 Prompt 选择链路看起来稳定，可以按预览结果继续下发到宿主机。",
      "The current prompt selection chain looks stable, so you can sync it to the host using the preview result."
    ),
    suggestions: [
      localize(locale, "下发前先看一眼目标 Prompt 和宿主机文件路径。", "Review the target prompt and host file path before applying."),
      localize(locale, "下发后检查运行态和宿主机审计是否一致。", "After applying, confirm runtime and host audit stay aligned.")
    ]
  };
};

type PromptHostSyncPanelProps = {
  readonly snapshot: DashboardSnapshot;
  readonly promptHostSyncPreview: Record<string, PromptHostSyncPreview | null>;
  readonly promptHostImportPreview: Record<string, PromptHostImportPreview | null>;
  readonly promptHostSyncStateByApp: Map<string, DashboardSnapshot["promptHostSyncStates"][number]>;
  readonly isWorking: boolean;
  readonly onImportFromHost: (appCode: AppBinding["appCode"]) => void;
  readonly onApplyHostSyncAll: () => void;
  readonly onApplyHostSync: (appCode: AppBinding["appCode"]) => void;
  readonly onRollbackHostSync: (appCode: AppBinding["appCode"]) => void;
  readonly onEditPromptTemplate: (item: DashboardSnapshot["promptTemplates"][number]) => void;
  readonly onOpenAssetForms: () => void;
};

export const PromptHostSyncPanel = ({
  snapshot,
  promptHostSyncPreview,
  promptHostImportPreview,
  promptHostSyncStateByApp,
  isWorking,
  onImportFromHost,
  onApplyHostSyncAll,
  onApplyHostSync,
  onRollbackHostSync,
  onEditPromptTemplate,
  onOpenAssetForms
}: PromptHostSyncPanelProps): JSX.Element => {
  const { locale } = useI18n();
  const managedCapabilities = snapshot.promptHostSyncCapabilities.filter((item) => item.supportLevel === "managed");
  const plannedCapabilities = snapshot.promptHostSyncCapabilities.filter((item) => item.supportLevel === "planned");
  const proxyOnlySkillCapabilities = snapshot.skillDeliveryCapabilities.filter(
    (item) => item.supportLevel === "proxy-only"
  );
  const plannedSkillCapabilities = snapshot.skillDeliveryCapabilities.filter(
    (item) => item.supportLevel === "planned"
  );
  const hostWritableSkillCapabilities = snapshot.skillDeliveryCapabilities.filter(
    (item) => item.hostWriteSupported
  );
  const activeSkillCount = snapshot.effectiveContexts.filter((item) => item.skill.id !== null).length;
  const batchReadyCount = managedCapabilities.filter((item) => {
    const preview = promptHostSyncPreview[item.appCode] ?? null;
    return preview !== null && preview.applyReady && preview.hasDiff;
  }).length;
  const blockedCount = managedCapabilities.filter((item) => {
    const preview = promptHostSyncPreview[item.appCode] ?? null;
    return preview !== null && !preview.applyReady;
  }).length;

  return (
    <article className="panel panel-span-2">
      <h2>{localize(locale, "Prompt 宿主机同步", "Prompt Host Sync")}</h2>
      <p className="panel-lead">
        {localize(
          locale,
          "把控制台里的 Prompt 选择结果发布到宿主机 Prompt 文件，同时支持从现有宿主机文件回收为资产。",
          "Publish the console-selected prompt into host prompt files, and import existing host prompt files back into assets."
        )}
      </p>

      <div className="preview-summary-grid">
        <div className={`preview-summary-tile risk-${managedCapabilities.length > 0 ? "low" : "medium"}`}>
          <strong>{managedCapabilities.length}</strong>
          <span>{localize(locale, "可托管应用", "Managed Apps")}</span>
        </div>
        <div className={`preview-summary-tile risk-${snapshot.promptHostSyncStates.length > 0 ? "medium" : "low"}`}>
          <strong>{snapshot.promptHostSyncStates.length}</strong>
          <span>{localize(locale, "当前已下发", "Currently Applied")}</span>
        </div>
        <div className={`preview-summary-tile risk-${batchReadyCount > 0 ? "medium" : "low"}`}>
          <strong>{batchReadyCount}</strong>
          <span>{localize(locale, "待整批同步", "Batch Ready")}</span>
        </div>
        <div className={`preview-summary-tile risk-${blockedCount > 0 ? "high" : "low"}`}>
          <strong>{blockedCount}</strong>
          <span>{localize(locale, "当前阻断", "Blocked")}</span>
        </div>
        <div className={`preview-summary-tile risk-${plannedCapabilities.length > 0 ? "medium" : "low"}`}>
          <strong>{plannedCapabilities.length}</strong>
          <span>{localize(locale, "规划中的应用", "Planned Apps")}</span>
        </div>
      </div>

      <div className="quick-action-row">
        <button
          className="inline-action"
          type="button"
          disabled={isWorking || batchReadyCount === 0}
          onClick={onApplyHostSyncAll}
        >
          {localize(locale, "整批同步到宿主机", "Apply All To Host")}
        </button>
        <button className="inline-action" type="button" onClick={onOpenAssetForms}>
          {localize(locale, "打开资产表单", "Open Asset Forms")}
        </button>
      </div>

      <div className="note-block">
        <strong>{localize(locale, "整批治理说明", "Batch Governance Guidance")}</strong>
        <p>
          {blockedCount > 0
            ? localize(
                locale,
                `当前有 ${blockedCount} 个应用仍被唯一 Prompt 选择阻断，先收敛候选，再执行整批同步。`,
                `${blockedCount} app(s) are still blocked by prompt selection ambiguity or missing prompt. Resolve those first, then run batch sync.`
              )
            : localize(
                locale,
                "当前可直接对所有存在差异的托管应用执行整批下发；Skill 仍只保留在代理侧，不会写入宿主机 Prompt 文件。",
                "You can now run batch rollout across all managed apps with pending diffs. Skills remain proxy-only and are not written into host prompt files."
              )}
        </p>
      </div>

      <div className="note-block">
        <strong>{localize(locale, "Skill 交付矩阵", "Skill Delivery Matrix")}</strong>
        <div className="preview-summary-grid">
          <div className={`preview-summary-tile risk-${proxyOnlySkillCapabilities.length > 0 ? "low" : "medium"}`}>
            <strong>{proxyOnlySkillCapabilities.length}</strong>
            <span>{localize(locale, "代理侧注入", "Proxy Injection")}</span>
          </div>
          <div className={`preview-summary-tile risk-${plannedSkillCapabilities.length > 0 ? "medium" : "low"}`}>
            <strong>{plannedSkillCapabilities.length}</strong>
            <span>{localize(locale, "待补齐 CLI", "Planned CLIs")}</span>
          </div>
          <div className={`preview-summary-tile risk-${hostWritableSkillCapabilities.length > 0 ? "medium" : "low"}`}>
            <strong>{hostWritableSkillCapabilities.length}</strong>
            <span>{localize(locale, "宿主机直写", "Host Native Write")}</span>
          </div>
          <div className={`preview-summary-tile risk-${activeSkillCount > 0 ? "medium" : "low"}`}>
            <strong>{activeSkillCount}</strong>
            <span>{localize(locale, "当前生效 Skill", "Active Skills")}</span>
          </div>
        </div>
        <p>
          {localize(
            locale,
            "当前 Prompt 宿主机同步只负责 Prompt 文件本体。Skill 是否真正参与运行，取决于请求是否已经进入 CC Switch 代理并走 Active Context 注入。",
            "Prompt host sync only manages the prompt file itself. Whether a skill actually participates at runtime depends on requests entering the CC Switch proxy and using active-context injection."
          )}
        </p>
        {snapshot.skillDeliveryCapabilities.map((item) => (
          <p key={`skill-delivery-matrix-${item.appCode}`}>
            <code>{item.appCode}</code>
            {" / "}
            {renderSkillDeliverySupportLevel(item.supportLevel, locale)}
            {" / "}
            {renderSkillDeliveryRecommendedPath(item.recommendedPath, locale)}
            {" / "}
            {item.hostWriteSupported
              ? localize(locale, "可写宿主机", "Host Writable")
              : localize(locale, "不写宿主机", "No Host Write")}
          </p>
        ))}
      </div>

      <div className="quickstart-grid">
        {snapshot.promptHostSyncCapabilities.map((capability) => {
          const applyPreview = promptHostSyncPreview[capability.appCode] ?? null;
          const importPreview = promptHostImportPreview[capability.appCode] ?? null;
          const syncState = promptHostSyncStateByApp.get(capability.appCode) ?? null;
          const skillCapability =
            snapshot.skillDeliveryCapabilities.find((item) => item.appCode === capability.appCode) ?? null;
          const editablePromptId =
            importPreview?.matchedPromptTemplateId ??
            applyPreview?.promptTemplateId ??
            syncState?.promptTemplateId ??
            null;
          const editablePrompt =
            editablePromptId === null
              ? null
              : snapshot.promptTemplates.find((item) => item.id === editablePromptId) ?? null;
          const notice = buildPromptHostNotice({
            applyPreview,
            importPreview,
            syncState,
            locale
          });

          return (
            <section key={capability.appCode} className="quickstart-step">
              <div className="governance-notice-header">
                <strong>{capability.appCode}</strong>
                <span className="governance-notice-badge">
                  {renderSupportLevel(capability.supportLevel, locale)}
                </span>
              </div>
              <p>
                {localize(locale, "宿主机文件", "Host File")}:{" "}
                <code>{applyPreview?.promptPath ?? importPreview?.promptPath ?? capability.promptFilePathHint ?? "n/a"}</code>
              </p>
              <p>
                {localize(locale, "文件名", "File Name")}: <code>{capability.promptFileName ?? "n/a"}</code>
              </p>
              <p>
                {localize(locale, "能力说明", "Capability")}: {capability.reason}
              </p>
              {skillCapability !== null ? (
                <p>
                  {localize(locale, "Skill 交付", "Skill Delivery")}:{" "}
                  {renderSkillDeliverySupportLevel(skillCapability.supportLevel, locale)}
                  {" / "}
                  {renderSkillDeliveryRecommendedPath(skillCapability.recommendedPath, locale)}
                  {" / "}
                  {skillCapability.hostWriteSupported
                    ? localize(locale, "可写宿主机", "Host Writable")
                    : localize(locale, "不写宿主机", "No Host Write")}
                </p>
              ) : null}

              {capability.supportLevel === "managed" ? (
                <>
                  <div className="preview-summary-grid">
                    <div className={`preview-summary-tile risk-${applyPreview?.applyReady ? "low" : "high"}`}>
                      <strong>
                        {applyPreview === null
                          ? localize(locale, "载入中", "Loading")
                          : applyPreview.applyReady
                            ? localize(locale, "可同步", "Ready")
                            : localize(locale, "阻断", "Blocked")}
                      </strong>
                      <span>{localize(locale, "同步预览", "Sync Preview")}</span>
                    </div>
                    <div
                      className={`preview-summary-tile risk-${
                        importPreview?.status === "ready-create"
                          ? "medium"
                          : importPreview?.status === "ready-match"
                            ? "low"
                            : "high"
                      }`}
                    >
                      <strong>
                        {importPreview === null
                          ? localize(locale, "载入中", "Loading")
                          : renderImportStatus(importPreview.status, locale)}
                      </strong>
                      <span>{localize(locale, "导入预览", "Import Preview")}</span>
                    </div>
                    <div className={`preview-summary-tile risk-${syncState !== null ? "medium" : "low"}`}>
                      <strong>
                        {syncState === null
                          ? localize(locale, "未下发", "Not Applied")
                          : renderSelectionSource(syncState.selectionSource, locale)}
                      </strong>
                      <span>{localize(locale, "当前状态", "Current State")}</span>
                    </div>
                  </div>

                  <GovernanceNoticeCard notice={notice} locale={locale} />

                  <div className="preview-item-list">
                    <div className="preview-item">
                      <strong>{localize(locale, "当前同步预览", "Current Sync Preview")}</strong>
                      <p>
                        {applyPreview?.summary[0] ??
                          localize(locale, "等待同步预览结果。", "Waiting for sync preview.")}
                      </p>
                      <p>
                        {localize(locale, "选择来源", "Selection Source")}:{" "}
                        {applyPreview === null
                          ? localize(locale, "载入中", "Loading")
                          : renderSelectionSource(applyPreview.selectionSource, locale)}
                      </p>
                      <p>
                        {localize(locale, "目标 Prompt", "Target Prompt")}:{" "}
                        <code>{applyPreview?.promptTemplateId ?? syncState?.promptTemplateId ?? "n/a"}</code>
                        {applyPreview?.promptTemplateName ? ` / ${applyPreview.promptTemplateName}` : ""}
                      </p>
                      <p>
                        {localize(locale, "宿主机是否已有文件", "Host File Exists")}:{" "}
                        {applyPreview === null
                          ? localize(locale, "载入中", "Loading")
                          : applyPreview.promptFileExists
                            ? localize(locale, "是", "Yes")
                            : localize(locale, "否", "No")}
                      </p>
                    </div>

                    <div className="preview-item">
                      <strong>{localize(locale, "宿主机导入预览", "Host Import Preview")}</strong>
                      <p>
                        {importPreview === null
                          ? localize(locale, "等待导入预览结果。", "Waiting for import preview.")
                          : localize(
                              locale,
                              `状态：${renderImportStatus(importPreview.status, locale)}`,
                              `Status: ${renderImportStatus(importPreview.status, locale)}`
                            )}
                      </p>
                      <p>
                        {localize(locale, "匹配 Prompt", "Matched Prompt")}:{" "}
                        <code>{importPreview?.matchedPromptTemplateId ?? "n/a"}</code>
                        {importPreview?.matchedPromptTemplateName ? ` / ${importPreview.matchedPromptTemplateName}` : ""}
                      </p>
                      <p>
                        {localize(locale, "大小 / 行数", "Bytes / Lines")}:{" "}
                        {importPreview === null ? localize(locale, "载入中", "Loading") : `${importPreview.contentBytes} / ${importPreview.lineCount}`}
                      </p>
                      <p>
                        {localize(locale, "推断语言", "Inferred Locale")}: <code>{importPreview?.inferredLocale ?? "n/a"}</code>
                      </p>
                    </div>

                    <div className="preview-item">
                      <strong>{localize(locale, "最近一次宿主机状态", "Last Host Sync State")}</strong>
                      <p>
                        {syncState === null
                          ? localize(locale, "当前没有已落地的宿主机状态记录。", "No applied host state is recorded yet.")
                          : localize(
                              locale,
                              `最近一次下发时间：${formatDateTime(syncState.lastAppliedAt)}`,
                              `Last applied at: ${formatDateTime(syncState.lastAppliedAt)}`
                            )}
                      </p>
                      <p>
                        {localize(locale, "回滚动作", "Rollback Action")}: <code>{syncState?.rollbackAction ?? applyPreview?.rollbackAction ?? "n/a"}</code>
                      </p>
                      <p>
                        {localize(locale, "当前文件是否存在", "Current File Exists")}:{" "}
                        {syncState === null
                          ? localize(locale, "未知", "Unknown")
                          : syncState.promptFileExists
                            ? localize(locale, "是", "Yes")
                            : localize(locale, "否", "No")}
                      </p>
                      <p>
                        {localize(locale, "当前 Prompt", "Current Prompt")}:{" "}
                        <code>{syncState?.promptTemplateId ?? "n/a"}</code>
                        {syncState?.promptTemplateName ? ` / ${syncState.promptTemplateName}` : ""}
                      </p>
                    </div>
                  </div>

                  {(applyPreview?.warnings.length ?? 0) > 0 || (importPreview?.warnings.length ?? 0) > 0 ? (
                    <div className="note-block">
                      <strong>{localize(locale, "当前提示", "Current Warnings")}</strong>
                      <ul className="governance-suggestion-list">
                        {(applyPreview?.warnings ?? []).map((item) => (
                          <li key={`apply-${capability.appCode}-${item}`}>{item}</li>
                        ))}
                        {(importPreview?.warnings ?? []).map((item) => (
                          <li key={`import-${capability.appCode}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {editablePrompt !== null ? (
                    <div className="note-block">
                      <strong>{localize(locale, "目标 Prompt 摘要", "Target Prompt Summary")}</strong>
                      <p>
                        <code>{editablePrompt.id}</code> / {editablePrompt.name}
                      </p>
                      <p>
                        {localize(locale, "启用状态", "Enabled")}:{" "}
                        {editablePrompt.enabled
                          ? localize(locale, "启用", "Enabled")
                          : localize(locale, "停用", "Disabled")}
                      </p>
                      <p>{previewText(editablePrompt.content)}</p>
                    </div>
                  ) : null}

                  <div className="quick-action-row">
                    <button
                      className="inline-action"
                      type="button"
                      disabled={
                        isWorking ||
                        importPreview === null ||
                        (importPreview.status !== "ready-create" && importPreview.status !== "ready-match")
                      }
                      onClick={() => onImportFromHost(capability.appCode)}
                    >
                      {importPreview?.status === "ready-match"
                        ? localize(locale, "复用已有 Prompt", "Reuse Existing Prompt")
                        : localize(locale, "导入宿主机 Prompt", "Import Host Prompt")}
                    </button>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking || applyPreview === null || !applyPreview.applyReady}
                      onClick={() => onApplyHostSync(capability.appCode)}
                    >
                      {localize(locale, "同步到宿主机", "Apply To Host")}
                    </button>
                    <button
                      className="inline-action danger"
                      type="button"
                      disabled={isWorking || syncState === null}
                      onClick={() => onRollbackHostSync(capability.appCode)}
                    >
                      {localize(locale, "回滚宿主机文件", "Rollback Host File")}
                    </button>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={editablePrompt === null}
                      onClick={() => {
                        if (editablePrompt !== null) {
                          onEditPromptTemplate(editablePrompt);
                        }
                      }}
                    >
                      {localize(locale, "编辑目标 Prompt", "Edit Target Prompt")}
                    </button>
                    <button className="inline-action" type="button" onClick={onOpenAssetForms}>
                      {localize(locale, "打开资产表单", "Open Asset Forms")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="note-block">
                  <strong>{localize(locale, "当前结论", "Current Conclusion")}</strong>
                  <p>
                    {localize(
                      locale,
                      "上游 Prompt 文件契约还没有在本项目里确认，因此暂不承诺自动改写宿主机文件。",
                      "The upstream prompt file contract is not verified here yet, so automatic host-file management is not committed."
                    )}
                  </p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
};
