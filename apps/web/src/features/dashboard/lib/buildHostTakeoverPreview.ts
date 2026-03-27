import type { HostCliApplyPreview, LocaleCode } from "@cc-switch-web/shared";

import type { GovernanceNotice } from "./buildGovernanceNotice.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

export const buildHostTakeoverPreviewNotice = (
  preview: HostCliApplyPreview,
  locale: LocaleCode
): GovernanceNotice => {
  const suggestions: string[] = [];

  if (preview.backupRequired) {
    suggestions.push(
      localize(
        locale,
        "当前宿主机已存在配置文件，应用前先确认备份与回滚路径都符合预期。",
        "Existing host config is present. Confirm backup and rollback coverage before applying."
      )
    );
  }

  if (preview.managedFeaturesToEnable.includes("claude-onboarding-bypassed")) {
    suggestions.push(
      localize(
        locale,
        "本次接管会同时管理 Claude 初次确认状态，应用后要实际打开 Claude Code 验证一次。",
        "This takeover also manages Claude onboarding state. Open Claude Code once after apply to validate it."
      )
    );
  }

  if (preview.warnings.length > 0) {
    suggestions.push(
      localize(
        locale,
        "先处理或理解 warning 中提到的宿主机状态，再继续应用接管。",
        "Review the warnings first and understand the current host state before applying takeover."
      )
    );
  }

  if (preview.envConflicts.length > 0) {
    suggestions.push(
      localize(
        locale,
        "检测到了 shell 或环境文件中的变量覆盖，先清理这些来源，避免接管后仍被旧变量绕过。",
        "Shell or environment-file overrides were detected. Clean those sources first so takeover is not bypassed by stale variables."
      )
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      localize(
        locale,
        "当前预检没有发现明显阻断项，可以继续进入应用接管。",
        "No obvious blocker was found in the preview. It is ready for takeover."
      )
    );
  }

  return {
    level: preview.riskLevel,
    summary:
      preview.summary[0] ??
      localize(locale, "当前预检已生成，请继续核对接管影响。", "The preview is ready. Continue reviewing the takeover impact."),
    suggestions
  };
};
