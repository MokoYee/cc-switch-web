import type { LocaleCode, McpGovernanceRepairPreview } from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const unique = <T>(items: readonly T[]): T[] => Array.from(new Set(items));

export type McpGovernanceBatchSummary = {
  readonly totalApps: number;
  readonly repairableApps: string[];
  readonly hostSyncRequiredApps: string[];
  readonly topIssueCodes: string[];
  readonly totalPlannedActions: number;
  readonly summary: string;
  readonly suggestions: string[];
};

export type McpGovernanceDiffSummary = {
  readonly appCode: DashboardSnapshot["mcpRuntimeViews"][number]["appCode"];
  readonly beforeStatus: McpGovernanceRepairPreview["statusBefore"];
  readonly afterStatus: McpGovernanceRepairPreview["predictedStatusAfter"];
  readonly resolvedIssueCodes: string[];
  readonly remainingIssueCodes: string[];
  readonly unchangedIssueCodes: string[];
  readonly summary: string;
};

export const buildMcpGovernanceBatchSummary = (
  snapshot: DashboardSnapshot,
  previewByApp: Record<string, McpGovernanceRepairPreview | null>,
  locale: LocaleCode
): McpGovernanceBatchSummary => {
  const runtimeApps = snapshot.mcpRuntimeViews
    .filter((item) => item.issueCodes.length > 0 || item.hostState.drifted)
    .map((item) => item.appCode);
  const previews = runtimeApps
    .map((appCode) => previewByApp[appCode])
    .filter((item): item is McpGovernanceRepairPreview => item !== null);
  const repairableApps = previews
    .filter((item) => item.plannedActions.length > 0)
    .map((item) => item.appCode);
  const hostSyncRequiredApps = previews
    .filter((item) => item.requiresHostSync)
    .map((item) => item.appCode);
  const topIssueCodes = unique(previews.flatMap((item) => item.issueCodesBefore)).slice(0, 6);
  const totalPlannedActions = previews.reduce((sum, item) => sum + item.plannedActions.length, 0);

  return {
    totalApps: previews.length,
    repairableApps,
    hostSyncRequiredApps,
    topIssueCodes,
    totalPlannedActions,
    summary:
      previews.length === 0
        ? localize(
            locale,
            "当前没有待执行的一键治理项，MCP 运行态没有明显自动修复入口。",
            "There is no guided repair work pending right now, and MCP runtime has no obvious auto-repair entry."
          )
        : localize(
            locale,
            `当前有 ${previews.length} 个应用进入 MCP 治理视图，其中 ${repairableApps.length} 个可直接一键治理，预计执行 ${totalPlannedActions} 个修复动作。`,
            `${previews.length} app(s) are currently in the MCP governance view, ${repairableApps.length} of them can be repaired directly, and ${totalPlannedActions} repair action(s) are planned.`
          ),
    suggestions: unique([
      repairableApps.length > 0
        ? localize(
            locale,
            "优先执行可自动治理的 app，把 duplicate-binding、invalid-binding 这类控制台主因先收敛掉。",
            "Prioritize apps that can be repaired automatically so console-side issues like duplicate-binding and invalid-binding are converged first."
          )
        : localize(
            locale,
            "当前更多是手工修复场景，应直接编辑 MCP server 或 binding。",
            "This currently looks more like a manual repair scenario, so edit MCP servers or bindings directly."
          ),
      hostSyncRequiredApps.length > 0
        ? localize(
            locale,
            `其中 ${hostSyncRequiredApps.length} 个应用修完后仍需要 host sync，不要把第一步和第二步混在一起。`,
            `${hostSyncRequiredApps.length} app(s) will still need host sync afterward, so do not mix the first and second steps together.`
          )
        : localize(
            locale,
            "当前一键治理完成后预计不需要额外宿主机同步，可以先观察 runtime 是否收敛。",
            "No additional host sync is expected after guided repair right now, so watch runtime convergence first."
          )
    ])
  };
};

export const buildMcpGovernanceDiffSummary = (
  preview: McpGovernanceRepairPreview,
  locale: LocaleCode
): McpGovernanceDiffSummary => {
  const before = new Set(preview.issueCodesBefore);
  const after = new Set(preview.predictedIssueCodesAfter);
  const resolvedIssueCodes = preview.issueCodesBefore.filter((item) => !after.has(item));
  const remainingIssueCodes = preview.predictedIssueCodesAfter;
  const unchangedIssueCodes = preview.issueCodesBefore.filter((item) => after.has(item));

  return {
    appCode: preview.appCode,
    beforeStatus: preview.statusBefore,
    afterStatus: preview.predictedStatusAfter,
    resolvedIssueCodes,
    remainingIssueCodes,
    unchangedIssueCodes,
    summary:
      resolvedIssueCodes.length > 0
        ? localize(
            locale,
            `预计会先消除 ${resolvedIssueCodes.length} 类运行态问题，${remainingIssueCodes.length} 类问题可能仍会保留。`,
            `${resolvedIssueCodes.length} runtime issue type(s) are expected to be removed first, while ${remainingIssueCodes.length} issue type(s) may still remain.`
          )
        : localize(
            locale,
            "这次治理更多是在止损和收敛配置，运行态问题类型可能不会立刻全部消失。",
            "This repair is more about containment and config convergence, so runtime issue types may not disappear immediately."
          )
  };
};
