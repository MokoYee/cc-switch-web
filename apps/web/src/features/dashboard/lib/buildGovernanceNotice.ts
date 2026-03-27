import type {
  AppBindingRoutingPreview,
  LocaleCode,
  McpHostSyncPreview,
  ProviderRoutingPreview,
  FailoverChainRoutingPreview
} from "@cc-switch-web/shared";

import { buildRoutingPreviewPrimaryCause } from "./buildRoutingPrimaryCause.js";

type NoticeLevel = "low" | "medium" | "high";

export type GovernanceNotice = {
  readonly level: NoticeLevel;
  readonly summary: string;
  readonly suggestions: string[];
};

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const unique = (items: string[]): string[] => Array.from(new Set(items));

const buildLevelSummary = (level: NoticeLevel, locale: LocaleCode): string => {
  if (level === "high") {
    return localize(locale, "当前变更存在高风险，建议先处理冲突后再保存。", "This change has high risk. Resolve conflicts before saving.");
  }
  if (level === "medium") {
    return localize(locale, "当前变更存在注意项，建议先核对受影响对象。", "This change has cautions. Review affected objects before saving.");
  }
  return localize(locale, "当前预检未发现明显阻断项。", "No obvious blockers were found in this preview.");
};

const buildRoutingSuggestions = (
  warnings: string[],
  issueCodes: string[],
  locale: LocaleCode
): string[] => {
  const suggestions: string[] = [];

  if (issueCodes.includes("credential-missing")) {
    suggestions.push(
      localize(locale, "补充 API Key 或确认已有凭证回退仍然可用。", "Provide an API key or confirm the existing credential fallback is still valid.")
    );
  }
  if (issueCodes.includes("provider-missing") || warnings.some((item) => item.includes("provider does not exist"))) {
    suggestions.push(
      localize(locale, "先创建目标 Provider，或把绑定改到已有 Provider。", "Create the target provider first, or repoint the binding to an existing provider.")
    );
  }
  if (issueCodes.includes("duplicate-app-binding")) {
    suggestions.push(
      localize(locale, "收敛同一应用的重复绑定，只保留一个主绑定。", "Reduce duplicate bindings for the same app and keep a single primary binding.")
    );
  }
  if (issueCodes.includes("observe-mode-with-failover")) {
    suggestions.push(
      localize(locale, "如果希望真实接管流量，将绑定模式切到 managed，或停用故障转移链。", "Switch the binding to managed if you want real traffic takeover, or disable the failover chain.")
    );
  }
  if (
    issueCodes.includes("failover-provider-missing") ||
    issueCodes.includes("failover-provider-duplicate") ||
    issueCodes.includes("failover-missing-primary") ||
    issueCodes.includes("failover-max-attempts-exceeds-candidates")
  ) {
    suggestions.push(
      localize(locale, "整理故障转移链：移除不存在/重复的 Provider，并确保包含主绑定 Provider。", "Normalize the failover chain: remove missing/duplicate providers and include the primary bound provider.")
    );
  }
  if (issueCodes.includes("no-routable-provider") || issueCodes.includes("circuit-open")) {
    suggestions.push(
      localize(locale, "先恢复至少一个可路由 Provider，再执行保存或切流。", "Recover at least one routable provider before saving or switching traffic.")
    );
  }
  if (warnings.some((item) => item.includes("loopback-only"))) {
    suggestions.push(
      localize(locale, "确认监听地址是否需要暴露到外网；默认建议保持 127.0.0.1。", "Confirm whether the listener should be exposed externally; defaulting to 127.0.0.1 is safer.")
    );
  }

  return unique(
    suggestions.length > 0
      ? suggestions
      : [
          localize(
            locale,
            "核对受影响应用与执行计划，确认后再保存。",
            "Review affected apps and the execution plan before saving."
          )
        ]
  );
};

export const buildRoutingGovernanceNotice = (
  preview: ProviderRoutingPreview | AppBindingRoutingPreview | FailoverChainRoutingPreview,
  locale: LocaleCode
): GovernanceNotice => {
  const primaryCause = buildRoutingPreviewPrimaryCause(preview, locale);
  const level: NoticeLevel = primaryCause.level;

  return {
    level,
    summary:
      level === "low" && preview.warnings.length === 0
        ? buildLevelSummary(level, locale)
        : primaryCause.summary,
    suggestions: unique([
      ...primaryCause.suggestions,
      ...buildRoutingSuggestions(preview.warnings, preview.issueCodes, locale)
    ])
  };
};

export const buildMcpHostSyncNotice = (
  preview: McpHostSyncPreview,
  locale: LocaleCode
): GovernanceNotice => {
  const level: NoticeLevel =
    preview.removedServerIds.length > 0 ? "high" : preview.warnings.length > 0 ? "medium" : "low";

  const suggestions: string[] = [];
  if (!preview.configExists) {
    suggestions.push(
      localize(locale, "这是首次生成宿主机 MCP 配置，建议先预览导入差异再执行同步。", "This is the first host MCP config generation. Preview the import diff before syncing.")
    );
  }
  if (preview.removedServerIds.length > 0) {
    suggestions.push(
      localize(
        locale,
        `确认这些托管条目可以被移除：${preview.removedServerIds.join(", ")}。`,
        `Confirm these managed entries can be removed: ${preview.removedServerIds.join(", ")}.`
      )
    );
  }
  if (preview.addedServerIds.length > 0) {
    suggestions.push(
      localize(
        locale,
        `同步前确认这些服务器已经在当前控制台内配置完成：${preview.addedServerIds.join(", ")}。`,
        `Confirm these servers are fully configured in the console before syncing: ${preview.addedServerIds.join(", ")}.`
      )
    );
  }
  if (suggestions.length === 0) {
    suggestions.push(
      localize(
        locale,
        "当前同步预检较为稳定，可以继续执行宿主机同步。",
        "The sync preview looks stable and is ready for host sync."
      )
    );
  }

  return {
    level,
    summary: buildLevelSummary(level, locale),
    suggestions: unique(suggestions)
  };
};
