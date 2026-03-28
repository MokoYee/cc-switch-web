import type { AppBinding } from "@cc-switch-web/shared";

import {
  activateSession,
  activateWorkspace,
  archiveSessionRecord,
  importWorkspaceDiscoveryItem,
  importWorkspaceDiscoveryItems
} from "../api/load-dashboard-snapshot.js";
import {
  buildWorkspaceDiscoveryBatchImportedFollowUpNotice,
  buildWorkspaceDiscoveryImportedFollowUpNotice
} from "../lib/dashboardFollowUp.js";
import type { ConfigDeleteTargetKind } from "../lib/editorConsistency.js";

import {
  type DashboardActionLocale,
  type DashboardActionRunAction,
  type DashboardActionSetFollowUpNotice,
  localizeDashboardAction
} from "./dashboardActionTypes.js";

type ContextTranslationKey =
  | "dashboard.workspace.activationSuccess"
  | "dashboard.workspace.archiveSuccess"
  | "dashboard.workspace.discoveryImportSuccess";

type DiscoveryItem = {
  readonly rootPath: string;
  readonly name: string;
  readonly appCodeSuggestion: AppBinding["appCode"] | null;
};

type CreateDashboardContextResourceActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: ContextTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly loadDeleteReview: (kind: ConfigDeleteTargetKind, id: string) => void;
  readonly runProjectIntakeConvergence: () => Promise<void>;
  readonly ensureSessionFromDiscovery: (
    item: DiscoveryItem,
    activate: boolean
  ) => Promise<unknown>;
};

export const createDashboardContextResourceActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  loadDeleteReview,
  runProjectIntakeConvergence,
  ensureSessionFromDiscovery
}: CreateDashboardContextResourceActionsParams) => ({
  runIntakeConvergence: () =>
    runAction(
      () => runProjectIntakeConvergence(),
      localizeDashboardAction(locale, "项目接入收敛已执行", "Project intake convergence applied")
    ),
  deletePromptTemplateReview: (id: string) => loadDeleteReview("prompt-template", id),
  deleteSkillReview: (id: string) => loadDeleteReview("skill", id),
  activateWorkspace: (id: string) =>
    runAction(() => activateWorkspace(id), t("dashboard.workspace.activationSuccess")),
  deleteWorkspaceReview: (id: string) => loadDeleteReview("workspace", id),
  importWorkspaceDiscovery: (item: DiscoveryItem) =>
    runAction(
      async () => {
        const result = await importWorkspaceDiscoveryItem({
          rootPath: item.rootPath,
          name: item.name,
          appCode: item.appCodeSuggestion ?? "codex",
          tags: ["auto-imported"],
          enabled: true
        });
        setFollowUpNotice(
          buildWorkspaceDiscoveryImportedFollowUpNotice(locale, {
            item: result.item,
            linkedSessionCount: result.linkedSessionIds.length,
            ...(result.linkedSessionIds[0]
              ? { firstLinkedSessionId: result.linkedSessionIds[0] }
              : {})
          })
        );
      },
      t("dashboard.workspace.discoveryImportSuccess")
    ),
  importAllWorkspaceDiscovery: () =>
    runAction(
      async () => {
        const result = await importWorkspaceDiscoveryItems({
          tags: ["auto-imported"],
          enabled: true
        });
        setFollowUpNotice(
          buildWorkspaceDiscoveryBatchImportedFollowUpNotice(locale, {
            importedCount: result.importedCount,
            linkedSessionCount: result.linkedSessionIds.length
          })
        );
      },
      localizeDashboardAction(locale, "工作区候选已整批归档", "Workspace candidates imported")
    ),
  ensureSessionFromDiscovery: (item: DiscoveryItem) =>
    runAction(
      async () => {
        await ensureSessionFromDiscovery(item, false);
      },
      localizeDashboardAction(locale, "会话已自动建档", "Session auto-created")
    ),
  ensureSessionAndActivateFromDiscovery: (item: DiscoveryItem) =>
    runAction(
      async () => {
        await ensureSessionFromDiscovery(item, true);
      },
      localizeDashboardAction(locale, "会话已建档并激活", "Session created and activated")
    ),
  activateSession: (id: string) =>
    runAction(() => activateSession(id), t("dashboard.workspace.activationSuccess")),
  archiveSession: (id: string) =>
    runAction(async () => {
      await archiveSessionRecord(id);
    }, t("dashboard.workspace.archiveSuccess")),
  deleteSessionReview: (id: string) => loadDeleteReview("session", id),
  deleteFailoverReview: (id: string) => loadDeleteReview("failover-chain", id),
  deleteMcpServerReview: (id: string) => loadDeleteReview("mcp-server", id),
  deleteMcpBindingReview: (id: string) => loadDeleteReview("mcp-app-binding", id)
});
