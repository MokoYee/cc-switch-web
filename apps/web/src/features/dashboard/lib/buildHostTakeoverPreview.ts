import type { HostCliApplyPreview, LocaleCode } from "cc-switch-web-shared";

import type { GovernanceNotice } from "./buildGovernanceNotice.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

export const buildHostTakeoverPreviewNotice = (
  preview: HostCliApplyPreview,
  locale: LocaleCode
): GovernanceNotice => {
  const suggestions: string[] = [];

  if (preview.takeoverMode === "environment-override" && preview.environmentOverride !== null) {
    suggestions.push(
      localize(
        locale,
        "这次接管只会生成可 source 的环境脚本，不会改写原始 CLI 配置文件；必须在目标 shell 中显式执行激活命令。",
        "This takeover only generates a source-able environment script and does not rewrite the original CLI config file. You must run the activation command in the target shell."
      )
    );
  }

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

  if (preview.lifecycleMode === "foreground-session") {
    suggestions.push(
      localize(
        locale,
        preview.takeoverMode === "environment-override"
          ? "这次接管属于临时接管；daemon 正常退出后会清理托管脚本，但已经导出的环境变量仍需手动 unset 或重新开 shell。"
          : "这次接管属于临时接管，daemon 正常退出后会自动回滚；如果希望重启后继续生效，应改用 systemd user service。",
        preview.takeoverMode === "environment-override"
          ? "This takeover is temporary. A clean daemon shutdown removes the managed script, but already-exported variables still need 'unset' or a new shell."
          : "This takeover is temporary and will auto-rollback when the daemon exits cleanly. Use a systemd user service if it must survive restarts."
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
