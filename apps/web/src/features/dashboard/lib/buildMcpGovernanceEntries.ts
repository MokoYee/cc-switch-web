import type { LocaleCode } from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";

export type McpGovernanceLevel = "low" | "medium" | "high";

export type McpGovernanceIssueCode =
  | "missing-server"
  | "server-disabled"
  | "duplicate-binding"
  | "missing-command"
  | "missing-url"
  | "host-drift";

export type McpGovernanceEntry = {
  readonly appCode: DashboardSnapshot["mcpRuntimeViews"][number]["appCode"];
  readonly item: DashboardSnapshot["mcpRuntimeViews"][number];
  readonly governanceLevel: McpGovernanceLevel;
  readonly priorityScore: number;
  readonly priorityLabel: string;
  readonly priorityReasons: string[];
  readonly primaryIssueCode: McpGovernanceIssueCode | null;
  readonly issueCodes: McpGovernanceIssueCode[];
  readonly affectedServerIds: string[];
  readonly problemServerIds: string[];
  readonly affectedBindingIds: string[];
  readonly problemBindingIds: string[];
  readonly summary: string;
};

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const unique = <T>(items: readonly T[]): T[] => Array.from(new Set(items));

const issuePriority: readonly McpGovernanceIssueCode[] = [
  "host-drift",
  "missing-server",
  "duplicate-binding",
  "server-disabled",
  "missing-command",
  "missing-url"
];

const governanceRank = (level: McpGovernanceLevel): number => {
  if (level === "high") {
    return 0;
  }
  if (level === "medium") {
    return 1;
  }
  return 2;
};

const pickPrimaryIssueCode = (
  issueCodes: readonly McpGovernanceIssueCode[]
): McpGovernanceIssueCode | null =>
  issuePriority.find((item) => issueCodes.includes(item)) ?? issueCodes[0] ?? null;

const toGovernanceLevel = (
  entry: DashboardSnapshot["mcpRuntimeViews"][number],
  primaryIssueCode: McpGovernanceIssueCode | null
): McpGovernanceLevel => {
  if (
    entry.hostState.drifted ||
    primaryIssueCode === "missing-server" ||
    primaryIssueCode === "duplicate-binding" ||
    primaryIssueCode === "server-disabled"
  ) {
    return "high";
  }

  if (
    entry.status !== "healthy" ||
    primaryIssueCode === "missing-command" ||
    primaryIssueCode === "missing-url"
  ) {
    return "medium";
  }

  return "low";
};

const buildSummary = (
  entry: DashboardSnapshot["mcpRuntimeViews"][number],
  issueCodes: readonly McpGovernanceIssueCode[],
  locale: LocaleCode
): string => {
  const issueLabel = issueCodes.length > 0 ? issueCodes.join(", ") : localize(locale, "无", "none");
  const problemBindings = entry.items.filter((item) => item.issueCodes.length > 0).length;

  if (entry.hostState.drifted) {
    return localize(
      locale,
      `宿主机托管配置已漂移，当前 issue：${issueLabel}。优先先修 runtime 主因，再决定是否重新同步宿主机。`,
      `Managed host MCP has drifted and current issues are ${issueLabel}. Repair the runtime cause first, then decide whether host sync is still needed.`
    );
  }

  if (issueCodes.includes("duplicate-binding")) {
    return localize(
      locale,
      `当前有 ${problemBindings} 条 MCP Binding 处于冲突状态，运行时目标不再唯一。`,
      `${problemBindings} MCP bindings are currently conflicted, so the runtime target is no longer unique.`
    );
  }

  if (issueCodes.includes("missing-server") || issueCodes.includes("server-disabled")) {
    return localize(
      locale,
      `当前有 Binding 指向缺失或停用的 server，主问题：${issueLabel}。`,
      `A binding currently points to a missing or disabled server. Primary issues: ${issueLabel}.`
    );
  }

  if (issueCodes.includes("missing-command") || issueCodes.includes("missing-url")) {
    return localize(
      locale,
      `当前 server 配置未闭合，主问题：${issueLabel}。`,
      `The current server configuration is incomplete. Primary issues: ${issueLabel}.`
    );
  }

  return localize(
    locale,
    "当前 MCP 运行态没有明显阻断项。",
    "No obvious MCP runtime blocker is active right now."
  );
};

const buildPriorityReasons = (
  entry: DashboardSnapshot["mcpRuntimeViews"][number],
  issueCodes: readonly McpGovernanceIssueCode[],
  problemServerIds: readonly string[],
  problemBindingIds: readonly string[],
  locale: LocaleCode
): string[] => {
  const reasons: string[] = [];

  if (entry.hostState.drifted) {
    reasons.push(
      localize(
        locale,
        "宿主机托管配置已漂移，继续同步前必须先确认当前控制台状态是否正确。",
        "The managed host config has drifted, so the console state must be verified before any further sync."
      )
    );
  }
  if (issueCodes.includes("duplicate-binding")) {
    reasons.push(
      localize(
        locale,
        `同一应用存在 ${problemBindingIds.length} 条冲突 Binding，运行态入口不唯一。`,
        `${problemBindingIds.length} conflicting binding(s) exist for the same app, so the runtime entry is not unique.`
      )
    );
  }
  if (issueCodes.includes("missing-server")) {
    reasons.push(
      localize(
        locale,
        `有 Binding 指向缺失 server，问题 server：${problemServerIds.join(", ") || "none"}。`,
        `A binding points to a missing server. Problem servers: ${problemServerIds.join(", ") || "none"}.`
      )
    );
  }
  if (issueCodes.includes("server-disabled")) {
    reasons.push(
      localize(
        locale,
        "启用中的 Binding 仍引用停用 server，配置链路没有真正闭合。",
        "An enabled binding still references a disabled server, so the config path is not actually closed."
      )
    );
  }
  if (issueCodes.includes("missing-command") || issueCodes.includes("missing-url")) {
    reasons.push(
      localize(
        locale,
        "server 基础配置不完整，保存或同步后仍可能无法稳定运行。",
        "The server base config is incomplete, so it may remain unstable even after save or sync."
      )
    );
  }

  return unique(reasons);
};

const buildPriorityLabel = (
  governanceLevel: McpGovernanceLevel,
  issueCodes: readonly McpGovernanceIssueCode[],
  locale: LocaleCode
): string => {
  if (governanceLevel === "high" && issueCodes.includes("host-drift")) {
    return localize(locale, "高优先级 / 宿主机已漂移", "High Priority / Host Drift");
  }
  if (governanceLevel === "high" && issueCodes.includes("duplicate-binding")) {
    return localize(locale, "高优先级 / 运行态入口冲突", "High Priority / Runtime Path Conflict");
  }
  if (governanceLevel === "high") {
    return localize(locale, "高优先级 / 接入链路未闭合", "High Priority / Incomplete Integration");
  }
  return localize(locale, "中优先级 / 配置待补全", "Medium Priority / Config Needs Completion");
};

export const buildMcpGovernanceEntries = (
  snapshot: DashboardSnapshot,
  locale: LocaleCode
): McpGovernanceEntry[] =>
  snapshot.mcpRuntimeViews
    .map((item) => {
      const issueCodes = unique<McpGovernanceIssueCode>([
        ...item.issueCodes,
        ...(item.hostState.drifted ? (["host-drift"] as const) : [])
      ]);
      const primaryIssueCode = pickPrimaryIssueCode(issueCodes);
      const affectedServerIds = unique(item.items.map((runtimeItem) => runtimeItem.serverId));
      const problemItems = item.items.filter((runtimeItem) => runtimeItem.issueCodes.length > 0);
      const problemServerIds = unique(problemItems.map((runtimeItem) => runtimeItem.serverId));
      const affectedBindingIds = unique(
        item.items
          .map((runtimeItem) => runtimeItem.bindingId)
          .filter((bindingId): bindingId is string => bindingId !== null)
      );
      const problemBindingIds = unique(
        problemItems
          .map((runtimeItem) => runtimeItem.bindingId)
          .filter((bindingId): bindingId is string => bindingId !== null)
      );
      const governanceLevel = toGovernanceLevel(item, primaryIssueCode);
      const priorityScore =
        governanceRank(governanceLevel) * 100 -
        issueCodes.length * 10 -
        problemItems.length * 5 -
        (item.hostState.drifted ? 12 : 0);
      const priorityReasons = buildPriorityReasons(
        item,
        issueCodes,
        problemServerIds,
        problemBindingIds,
        locale
      );

      return {
        appCode: item.appCode,
        item,
        governanceLevel,
        priorityScore,
        priorityLabel: buildPriorityLabel(governanceLevel, issueCodes, locale),
        priorityReasons,
        primaryIssueCode,
        issueCodes,
        affectedServerIds,
        problemServerIds,
        affectedBindingIds,
        problemBindingIds,
        summary: buildSummary(item, issueCodes, locale)
      };
    })
    .filter((item) => item.governanceLevel !== "low")
    .sort((left, right) => {
      if (left.priorityScore !== right.priorityScore) {
        return left.priorityScore - right.priorityScore;
      }

      if (right.issueCodes.length !== left.issueCodes.length) {
        return right.issueCodes.length - left.issueCodes.length;
      }

      return left.appCode.localeCompare(right.appCode);
    });
