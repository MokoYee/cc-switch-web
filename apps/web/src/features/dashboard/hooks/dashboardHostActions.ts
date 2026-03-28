import type { AppBinding, McpImportOptions } from "@cc-switch-web/shared";

import {
  applyHostMcpSync,
  applyHostMcpSyncAll,
  applyMcpGovernanceRepair,
  applyMcpGovernanceRepairAll,
  applyPromptHostSync,
  applyPromptHostSyncAll,
  importMcpFromHost,
  importPromptFromHost,
  rollbackHostMcpSync,
  rollbackPromptHostSync
} from "../api/load-dashboard-snapshot.js";
import {
  buildBatchMcpGovernanceAppliedFollowUpNotice,
  buildBatchMcpHostSyncAppliedFollowUpNotice,
  buildBatchPromptHostSyncAppliedFollowUpNotice,
  buildMcpGovernanceRepairFollowUpNotice,
  buildMcpHostSyncAppliedFollowUpNotice,
  buildMcpHostSyncRolledBackFollowUpNotice,
  buildMcpImportedFromHostFollowUpNotice,
  buildPromptHostImportedFollowUpNotice,
  buildPromptHostSyncAppliedFollowUpNotice,
  buildPromptHostSyncRolledBackFollowUpNotice
} from "../lib/dashboardFollowUp.js";

import {
  type DashboardActionLocale,
  type DashboardActionOpenAuditFocus,
  type DashboardActionRunAction,
  type DashboardActionSetFollowUpNotice,
  localizeDashboardAction
} from "./dashboardActionTypes.js";

type McpTranslationKey =
  | "dashboard.mcp.importSuccess"
  | "dashboard.mcp.applySuccess"
  | "dashboard.mcp.rollbackSuccess";

type CreateDashboardMcpHostActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: McpTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly openAuditFocus: DashboardActionOpenAuditFocus;
  readonly mcpImportOptions: McpImportOptions;
};

export const createDashboardMcpHostActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  openAuditFocus,
  mcpImportOptions
}: CreateDashboardMcpHostActionsParams) => ({
  repairGovernanceAll: () =>
    runAction(async () => {
      const result = await applyMcpGovernanceRepairAll();
      openAuditFocus({
        source: "mcp"
      });
      setFollowUpNotice(
        buildBatchMcpGovernanceAppliedFollowUpNotice(locale, {
          repairedAppCount: result.repairedApps,
          hostSyncRequiredAppCount: result.hostSyncRequiredApps.length
        })
      );
    }, localizeDashboardAction(locale, "整批 MCP 治理已执行", "Batch MCP governance applied")),
  repairGovernance: (appCode: AppBinding["appCode"]) =>
    runAction(async () => {
      const result = await applyMcpGovernanceRepair(appCode);
      openAuditFocus({
        source: "mcp",
        appCode
      });
      setFollowUpNotice(
        buildMcpGovernanceRepairFollowUpNotice(locale, {
          appCode,
          requiresHostSync: result.requiresHostSync
        })
      );
    }, localizeDashboardAction(locale, "MCP 治理修复已执行", "MCP governance repair applied")),
  importFromHost: (appCode: AppBinding["appCode"]) =>
    runAction(async () => {
      await importMcpFromHost(appCode, mcpImportOptions);
      openAuditFocus({
        source: "mcp",
        appCode
      });
      setFollowUpNotice(buildMcpImportedFromHostFollowUpNotice(locale, appCode));
    }, t("dashboard.mcp.importSuccess")),
  applyHostSync: (appCode: AppBinding["appCode"]) =>
    runAction(async () => {
      await applyHostMcpSync(appCode);
      openAuditFocus({
        source: "mcp",
        appCode
      });
      setFollowUpNotice(buildMcpHostSyncAppliedFollowUpNotice(locale, appCode));
    }, t("dashboard.mcp.applySuccess")),
  applyHostSyncAll: () =>
    runAction(async () => {
      const result = await applyHostMcpSyncAll();
      openAuditFocus({
        source: "mcp"
      });
      setFollowUpNotice(buildBatchMcpHostSyncAppliedFollowUpNotice(locale, result.appliedApps.length));
    }, localizeDashboardAction(locale, "整批宿主机同步已执行", "Batch host sync applied")),
  rollbackHostSync: (appCode: AppBinding["appCode"]) =>
    runAction(async () => {
      await rollbackHostMcpSync(appCode);
      openAuditFocus({
        source: "mcp",
        appCode
      });
      setFollowUpNotice(buildMcpHostSyncRolledBackFollowUpNotice(locale, appCode));
    }, t("dashboard.mcp.rollbackSuccess"))
});

type CreateDashboardPromptHostActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly openAuditFocus: DashboardActionOpenAuditFocus;
};

export const createDashboardPromptHostActions = ({
  locale,
  runAction,
  setFollowUpNotice,
  openAuditFocus
}: CreateDashboardPromptHostActionsParams) => ({
  importFromHost: (appCode: AppBinding["appCode"]) =>
    runAction(async () => {
      const result = await importPromptFromHost(appCode);
      setFollowUpNotice(
        buildPromptHostImportedFollowUpNotice(locale, {
          appCode,
          matchedExisting: result.item.status === "matched-existing"
        })
      );
    }, localizeDashboardAction(locale, "宿主机 Prompt 已导入", "Host prompt imported")),
  applyHostSyncAll: () =>
    runAction(async () => {
      const result = await applyPromptHostSyncAll();
      setFollowUpNotice(buildBatchPromptHostSyncAppliedFollowUpNotice(locale, result.appliedApps.length));
    }, localizeDashboardAction(locale, "整批 Prompt 宿主机同步已执行", "Batch prompt host sync applied")),
  applyHostSync: (appCode: AppBinding["appCode"]) =>
    runAction(async () => {
      const result = await applyPromptHostSync(appCode);
      openAuditFocus({
        source: "host-integration",
        appCode
      });
      setFollowUpNotice(
        buildPromptHostSyncAppliedFollowUpNotice(locale, {
          appCode,
          ignoredSkillId: result.ignoredSkillId
        })
      );
    }, localizeDashboardAction(locale, "宿主机 Prompt 已同步", "Host prompt applied")),
  rollbackHostSync: (appCode: AppBinding["appCode"]) =>
    runAction(async () => {
      await rollbackPromptHostSync(appCode);
      openAuditFocus({
        source: "host-integration",
        appCode
      });
      setFollowUpNotice(buildPromptHostSyncRolledBackFollowUpNotice(locale, appCode));
    }, localizeDashboardAction(locale, "宿主机 Prompt 已回滚", "Host prompt rolled back"))
});
