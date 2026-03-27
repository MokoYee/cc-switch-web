import { useEffect, useMemo, useState } from "react";

import type {
  AppCode,
  LocaleCode,
  QuickContextAssetApplyResult,
  QuickContextAssetPreview,
  QuickContextAssetTargetMode
} from "@cc-switch-web/shared";

import {
  applyQuickContextAsset,
  previewQuickContextAsset
} from "../api/load-dashboard-snapshot.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

type QuickContextAssetWorkbenchProps = {
  readonly appCode: AppCode;
  readonly locale: LocaleCode;
  readonly disabled: boolean;
  readonly initialPromptContent: string | null;
  readonly initialSkillContent: string | null;
  readonly bindingExists: boolean;
  readonly onRefreshSnapshot: () => void;
  readonly onApplied?: ((
    appCode: AppCode,
    result: QuickContextAssetApplyResult
  ) => void) | undefined;
};

const renderTargetModeLabel = (
  locale: LocaleCode,
  mode: QuickContextAssetTargetMode
): string => {
  switch (mode) {
    case "auto":
      return localize(locale, "自动挂载", "Auto Attach");
    case "app-binding":
      return localize(locale, "应用默认", "App Default");
    case "active-workspace":
      return localize(locale, "当前工作区", "Active Workspace");
    case "active-session":
      return localize(locale, "当前会话", "Active Session");
    case "asset-only":
      return localize(locale, "仅创建资产", "Assets Only");
  }
};

const renderResolvedTarget = (
  locale: LocaleCode,
  preview: QuickContextAssetPreview | QuickContextAssetApplyResult
): string => {
  const { target } = preview;

  switch (target.resolvedMode) {
    case "app-binding":
      return localize(
        locale,
        `将挂到应用默认链路 ${target.bindingId ?? target.targetId ?? "-"}`,
        `Will attach to app default binding ${target.bindingId ?? target.targetId ?? "-"}`
      );
    case "active-workspace":
      return localize(
        locale,
        `将挂到当前工作区 ${target.targetLabel ?? target.targetId ?? "-"}`,
        `Will attach to active workspace ${target.targetLabel ?? target.targetId ?? "-"}`
      );
    case "active-session":
      return localize(
        locale,
        `将挂到当前会话 ${target.targetLabel ?? target.targetId ?? "-"}`,
        `Will attach to active session ${target.targetLabel ?? target.targetId ?? "-"}`
      );
    case "asset-only":
      return localize(locale, "只会创建资产，不改运行态", "Assets will be created without changing runtime");
  }
};

export const QuickContextAssetWorkbench = ({
  appCode,
  locale,
  disabled,
  initialPromptContent,
  initialSkillContent,
  bindingExists,
  onRefreshSnapshot,
  onApplied
}: QuickContextAssetWorkbenchProps): JSX.Element => {
  const [promptLocale, setPromptLocale] = useState<LocaleCode>(
    locale === "en-US" ? "en-US" : "zh-CN"
  );
  const [promptContent, setPromptContent] = useState(initialPromptContent ?? "");
  const [skillContent, setSkillContent] = useState(initialSkillContent ?? "");
  const [targetMode, setTargetMode] = useState<QuickContextAssetTargetMode>(
    bindingExists ? "auto" : "asset-only"
  );
  const [preview, setPreview] = useState<QuickContextAssetPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  useEffect(() => {
    setPromptContent(initialPromptContent ?? "");
    setSkillContent(initialSkillContent ?? "");
  }, [initialPromptContent, initialSkillContent]);

  useEffect(() => {
    setPreview(null);
    setErrorMessage(null);
  }, [appCode, promptContent, promptLocale, skillContent, targetMode]);

  useEffect(() => {
    if (!bindingExists && targetMode === "auto") {
      setTargetMode("asset-only");
    }
  }, [bindingExists, targetMode]);

  const payload = useMemo(
    () => ({
      appCode,
      promptLocale,
      promptContent,
      skillContent,
      targetMode
    }),
    [appCode, promptContent, promptLocale, skillContent, targetMode]
  );
  const canSubmit = promptContent.trim().length > 0;

  const handlePreview = (): void => {
    if (!canSubmit) {
      return;
    }

    setIsPreviewing(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    void previewQuickContextAsset(payload)
      .then((result) => {
        setPreview(result);
        setNoticeMessage(
          result.canApply
            ? localize(locale, "默认 Prompt / Skill 预检已生成。", "Default prompt and skill preview is ready.")
            : localize(locale, "预检已生成，但仍有阻断项。", "Preview is ready, but blocking issues remain.")
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
    if (!canSubmit) {
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    void applyQuickContextAsset(payload)
      .then((result) => {
        setPreview(null);
        setNoticeMessage(
          localize(
            locale,
            `${appCode} 默认 Prompt / Skill 已保存。`,
            `${appCode} default prompt and skill have been saved.`
          )
        );
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
    <div className="quick-context-shell">
      <div className="quick-onboarding-section-header">
        <div>
          <strong>{localize(locale, "默认资产创建", "Default Asset Bootstrap")}</strong>
          <p>
            {localize(
              locale,
              "没有现成 Prompt / Skill 时，先在这里创建一份默认资产并直接挂到运行链路。",
              "When no reusable prompt or skill exists yet, create a default pair here and attach it straight to runtime."
            )}
          </p>
        </div>
        <div className="quick-onboarding-inline-note">
          <strong>{renderTargetModeLabel(locale, targetMode)}</strong>
          <span>
            {bindingExists
              ? localize(locale, "已检测到应用绑定，可自动挂载。", "App binding detected, so auto attach is available.")
              : localize(locale, "当前没有应用绑定，默认只能先创建资产。", "No app binding exists yet, so assets-only is the safe default.")}
          </span>
        </div>
      </div>

      <div className="quick-context-grid">
        <label>
          <span>{localize(locale, "Prompt 语言", "Prompt Locale")}</span>
          <select value={promptLocale} onChange={(event) => setPromptLocale(event.target.value as LocaleCode)}>
            <option value="zh-CN">zh-CN</option>
            <option value="en-US">en-US</option>
          </select>
        </label>

        <label>
          <span>{localize(locale, "挂载目标", "Attach Target")}</span>
          <select
            value={targetMode}
            onChange={(event) => setTargetMode(event.target.value as QuickContextAssetTargetMode)}
          >
            <option value="auto">{localize(locale, "自动选择（推荐）", "Auto (Recommended)")}</option>
            <option value="app-binding">{localize(locale, "应用默认链路", "App Default Binding")}</option>
            <option value="active-workspace">{localize(locale, "当前工作区", "Active Workspace")}</option>
            <option value="active-session">{localize(locale, "当前会话", "Active Session")}</option>
            <option value="asset-only">{localize(locale, "仅创建资产", "Assets Only")}</option>
          </select>
        </label>

        <label className="quick-context-span-2">
          <span>{localize(locale, "默认 Prompt", "Default Prompt")}</span>
          <textarea
            value={promptContent}
            onChange={(event) => setPromptContent(event.target.value)}
            rows={6}
            placeholder={localize(
              locale,
              "输入这条应用默认要带上的系统 Prompt。",
              "Enter the system prompt that should become the app default."
            )}
          />
        </label>

        <label className="quick-context-span-2">
          <span>{localize(locale, "默认 Skill（可选）", "Default Skill (Optional)")}</span>
          <textarea
            value={skillContent}
            onChange={(event) => setSkillContent(event.target.value)}
            rows={4}
            placeholder={localize(
              locale,
              "可留空。填写后会同时创建一份默认 Skill 并与 Prompt 绑定。",
              "Optional. When filled, a default skill will be created and linked to the prompt."
            )}
          />
        </label>
      </div>

      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      {noticeMessage ? <p className="form-notice">{noticeMessage}</p> : null}

      {preview ? (
        <div className={`quick-onboarding-result ${preview.canApply ? "risk-low" : "risk-high"}`}>
          <div className="quick-onboarding-result-header">
            <div>
              <h4>{localize(locale, "默认资产预检", "Default Asset Preview")}</h4>
              <p>{renderResolvedTarget(locale, preview)}</p>
            </div>
          </div>
          <ul className="governance-suggestion-list">
            <li>{renderResolvedTarget(locale, preview)}</li>
            {preview.summary.map((item) => (
              <li key={`${preview.appCode}-summary-${item}`}>{item}</li>
            ))}
            {preview.warnings.map((item) => (
              <li key={`${preview.appCode}-warning-${item}`}>{item}</li>
            ))}
            {preview.blockingReasons.map((item) => (
              <li key={`${preview.appCode}-blocking-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="quick-action-row">
        <button
          type="button"
          className="ghost-button"
          onClick={handlePreview}
          disabled={disabled || isPreviewing || isApplying || !canSubmit}
        >
          {isPreviewing ? localize(locale, "预检中…", "Previewing…") : localize(locale, "预检默认资产", "Preview Default Assets")}
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={disabled || isPreviewing || isApplying || !canSubmit}
        >
          {isApplying ? localize(locale, "保存中…", "Applying…") : localize(locale, "保存并挂载", "Save And Attach")}
        </button>
      </div>
    </div>
  );
};
