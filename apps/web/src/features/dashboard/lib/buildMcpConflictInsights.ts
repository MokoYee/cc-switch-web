import type { LocaleCode, McpHostSyncPreview } from "@cc-switch-web/shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildMcpGovernanceEntries, type McpGovernanceEntry } from "./buildMcpGovernanceEntries.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const unique = (items: readonly string[]): string[] => Array.from(new Set(items));

export type McpConflictInsight = {
  readonly title: string;
  readonly summary: string;
  readonly reasons: string[];
  readonly nextActions: string[];
};

export type McpBatchHostSyncSummary = {
  readonly syncableApps: string[];
  readonly removalApps: string[];
  readonly totalAddedServers: number;
  readonly totalRemovedServers: number;
  readonly totalUnchangedServers: number;
  readonly summary: string;
  readonly suggestions: string[];
};

const resolveEntryReasons = (entry: McpGovernanceEntry, locale: LocaleCode): string[] => {
  const reasons: string[] = [];

  if (entry.issueCodes.includes("duplicate-binding")) {
    reasons.push(
      localize(
        locale,
        `同一应用存在重复启用 Binding，涉及 ${entry.problemBindingIds.length} 条冲突 Binding。`,
        `${entry.problemBindingIds.length} duplicate enabled binding(s) exist for the same app.`
      )
    );
  }
  if (entry.issueCodes.includes("missing-server")) {
    reasons.push(
      localize(
        locale,
        `有 Binding 指向缺失的 server，问题 server：${entry.problemServerIds.join(", ") || entry.affectedServerIds.join(", ") || "none"}。`,
        `A binding points to a missing server. Problem servers: ${entry.problemServerIds.join(", ") || entry.affectedServerIds.join(", ") || "none"}.`
      )
    );
  }
  if (entry.issueCodes.includes("server-disabled")) {
    reasons.push(
      localize(
        locale,
        "有启用中的 Binding 仍然引用停用 server，运行态目标没有真正闭合。",
        "An enabled binding still references a disabled server, so the runtime path is not fully closed."
      )
    );
  }
  if (entry.issueCodes.includes("missing-command") || entry.issueCodes.includes("missing-url")) {
    reasons.push(
      localize(
        locale,
        "server 基础配置不完整，当前 transport 所需的 command 或 url 缺失。",
        "The server config is incomplete because the current transport is missing its required command or url."
      )
    );
  }
  if (entry.issueCodes.includes("host-drift")) {
    reasons.push(
      localize(
        locale,
        "宿主机托管配置和控制台当前启用配置已经漂移，直接同步前应先确认根因。",
        "The managed host config has drifted away from the current console state. Confirm the root cause before syncing."
      )
    );
  }

  return unique(reasons);
};

export const buildMcpServerConflictInsight = (
  snapshot: DashboardSnapshot,
  serverId: string,
  locale: LocaleCode
): McpConflictInsight | null => {
  const entries = buildMcpGovernanceEntries(snapshot, locale).filter(
    (entry) => entry.problemServerIds.includes(serverId) || entry.affectedServerIds.includes(serverId)
  );

  if (entries.length === 0) {
    return null;
  }

  const reasons = unique(entries.flatMap((entry) => resolveEntryReasons(entry, locale)));
  const appCodes = unique(entries.map((entry) => entry.appCode));

  return {
    title: localize(locale, "冲突来源解释", "Conflict Source"),
    summary: localize(
      locale,
      `这个 server 正在影响 ${appCodes.length} 个应用的 MCP 治理队列：${appCodes.join(", ")}。`,
      `This server is affecting MCP governance for ${appCodes.length} app(s): ${appCodes.join(", ")}.`
    ),
    reasons,
    nextActions: unique([
      localize(locale, "先确认这个 server 是不是仍然应该承接流量或工具调用。", "Confirm whether this server should still receive traffic or tool calls."),
      localize(locale, "如果只是临时止损，优先停用 server 或解除重复 Binding，再做细修。", "If this is temporary containment, disable the server or remove duplicate bindings first."),
      localize(locale, "修完控制台配置后，再回到宿主机同步，避免把错误状态覆盖到本地文件。", "After the console state is fixed, return to host sync instead of pushing a broken state to local files.")
    ])
  };
};

export const buildMcpBindingConflictInsight = (
  snapshot: DashboardSnapshot,
  bindingId: string,
  appCode: DashboardSnapshot["appMcpBindings"][number]["appCode"],
  locale: LocaleCode
): McpConflictInsight | null => {
  const entries = buildMcpGovernanceEntries(snapshot, locale).filter(
    (entry) => entry.problemBindingIds.includes(bindingId) || entry.appCode === appCode
  );

  if (entries.length === 0) {
    return null;
  }

  const targetEntry = entries.find((entry) => entry.problemBindingIds.includes(bindingId)) ?? entries[0];
  if (targetEntry === undefined) {
    return null;
  }

  return {
    title: localize(locale, "冲突来源解释", "Conflict Source"),
    summary: localize(
      locale,
      `${appCode} 当前的 MCP 主问题仍在治理队列中，这条 Binding 和运行态结果直接相关。`,
      `${appCode} still has a MCP governance issue in the queue, and this binding directly affects the runtime result.`
    ),
    reasons: resolveEntryReasons(targetEntry, locale),
    nextActions: unique([
      localize(locale, "先保证同一 app 只有一条主 Binding 负责接入。", "Keep only one primary binding per app."),
      localize(locale, "如果目标 server 不存在或未完成配置，先修 server，再回到 Binding。", "If the target server is missing or incomplete, fix the server first."),
      localize(locale, "Binding 修完后立即回看 runtime issue code，确认冲突是否真的消失。", "After updating the binding, re-check runtime issue codes to confirm the conflict is actually gone.")
    ])
  };
};

export const buildMcpBatchHostSyncSummary = (
  snapshot: DashboardSnapshot,
  previewByApp: Record<string, McpHostSyncPreview | null>,
  locale: LocaleCode
): McpBatchHostSyncSummary => {
  const managedApps = snapshot.mcpHostSyncCapabilities
    .filter((item) => item.supportLevel === "managed")
    .map((item) => item.appCode);
  const items = managedApps
    .map((appCode) => previewByApp[appCode])
    .filter((item): item is McpHostSyncPreview => item !== null)
    .filter(
      (item) =>
        item.addedServerIds.length > 0 ||
        item.removedServerIds.length > 0 ||
        (!item.configExists && item.nextManagedServerIds.length > 0)
    );

  const syncableApps = items.map((item) => item.appCode);
  const removalApps = items.filter((item) => item.removedServerIds.length > 0).map((item) => item.appCode);
  const totalAddedServers = items.reduce((sum, item) => sum + item.addedServerIds.length, 0);
  const totalRemovedServers = items.reduce((sum, item) => sum + item.removedServerIds.length, 0);
  const totalUnchangedServers = items.reduce((sum, item) => sum + item.unchangedServerIds.length, 0);

  return {
    syncableApps,
    removalApps,
    totalAddedServers,
    totalRemovedServers,
    totalUnchangedServers,
    summary:
      items.length === 0
        ? localize(
            locale,
            "当前没有待执行的整批宿主机同步差异，控制台状态和宿主机托管状态基本一致。",
            "There is no pending batch host sync diff right now. Console and managed host state are largely aligned."
          )
        : localize(
            locale,
            `当前有 ${items.length} 个应用存在待同步差异，其中新增 ${totalAddedServers} 个、移除 ${totalRemovedServers} 个宿主机托管条目。`,
            `${items.length} app(s) currently need host sync, with ${totalAddedServers} additions and ${totalRemovedServers} removals across managed host entries.`
          ),
    suggestions:
      items.length === 0
        ? [
            localize(
              locale,
              "优先继续看 runtime 和审计，确认 MCP 治理已经真正收敛。",
              "Continue with runtime and audit checks to confirm MCP governance has truly converged."
            )
          ]
        : unique([
            removalApps.length > 0
              ? localize(
                  locale,
                  `其中 ${removalApps.length} 个应用包含移除项，执行前应先逐项确认危险删除。`,
                  `${removalApps.length} app(s) include removals, so confirm each destructive change before applying.`
                )
              : localize(
                  locale,
                  "当前整批同步主要是增量收敛，可以直接优先处理这一批应用。",
                  "This batch is mainly additive convergence and can be applied first."
                ),
            localize(
              locale,
              "如果治理队列里仍有 duplicate-binding 或 missing-server，先修控制台根因，不要把 host sync 当成第一修复手段。",
              "If duplicate-binding or missing-server still exists in the queue, fix the console root cause before using host sync."
            )
          ])
  };
};
