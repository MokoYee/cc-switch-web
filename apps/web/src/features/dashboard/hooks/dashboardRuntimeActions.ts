import type { AppBinding } from "cc-switch-web-shared";

import {
  activateSession,
  activateWorkspace,
  applyHostCliManagedConfig,
  archiveSessionRecord,
  isolateProviderHealth,
  probeProviderHealth,
  recoverProviderHealth,
  resetProviderHealth,
  rollbackForegroundHostCliManagedConfigs,
  rollbackHostCliManagedConfig
} from "../api/load-dashboard-snapshot.js";
import {
  buildForegroundHostTakeoversRolledBackFollowUpNotice,
  buildHostTakeoverAppliedFollowUpNotice,
  buildHostTakeoverRolledBackFollowUpNotice,
  buildProviderIsolatedFollowUpNotice,
  buildProviderProbedFollowUpNotice,
  buildProviderRecoveredFollowUpNotice,
  buildProviderResetFollowUpNotice
} from "../lib/dashboardFollowUp.js";

import {
  type DashboardActionLocale,
  type DashboardActionOpenAuditFocus,
  type DashboardActionRunAction,
  type DashboardActionSetFollowUpNotice,
  localizeDashboardAction
} from "./dashboardActionTypes.js";

type RuntimeTranslationKey =
  | "dashboard.runtime.recoverSuccess"
  | "dashboard.runtime.isolateSuccess"
  | "dashboard.runtime.resetSuccess"
  | "dashboard.runtime.probeSuccess"
  | "dashboard.discovery.applySuccess"
  | "dashboard.discovery.rollbackSuccess"
  | "dashboard.workspace.activationSuccess"
  | "dashboard.workspace.archiveSuccess";

type CreateDashboardRuntimeActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: RuntimeTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly openAuditFocus: DashboardActionOpenAuditFocus;
  readonly refreshProviderDiagnosticDetail: (providerId: string) => void;
  readonly refreshWorkspaceRuntimeDetail: (workspaceId: string) => void;
  readonly refreshSessionRuntimeDetail: (sessionId: string) => void;
  readonly focusProviderFailureLogs: (providerId: string) => void;
  readonly setSelectedProviderDiagnosticId: (value: string | null) => void;
  readonly setSelectedProviderDiagnosticDetail: (value: null) => void;
  readonly setSelectedWorkspaceRuntimeDetail: (value: null) => void;
  readonly setSelectedSessionRuntimeDetail: (value: null) => void;
};

export const createDashboardRuntimeActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  openAuditFocus,
  refreshProviderDiagnosticDetail,
  refreshWorkspaceRuntimeDetail,
  refreshSessionRuntimeDetail,
  focusProviderFailureLogs,
  setSelectedProviderDiagnosticId,
  setSelectedProviderDiagnosticDetail,
  setSelectedWorkspaceRuntimeDetail,
  setSelectedSessionRuntimeDetail
}: CreateDashboardRuntimeActionsParams) => ({
  recoverProvider: (providerId: string) =>
    runAction(async () => {
      await recoverProviderHealth(providerId);
      refreshProviderDiagnosticDetail(providerId);
      focusProviderFailureLogs(providerId);
      openAuditFocus({
        source: "provider-health",
        providerId
      });
      setFollowUpNotice(buildProviderRecoveredFollowUpNotice(locale, providerId));
    }, t("dashboard.runtime.recoverSuccess")),
  isolateProvider: (providerId: string) =>
    runAction(async () => {
      await isolateProviderHealth(providerId, {
        reason: `Operator isolated ${providerId} from dashboard`
      });
      refreshProviderDiagnosticDetail(providerId);
      focusProviderFailureLogs(providerId);
      openAuditFocus({
        source: "provider-health",
        providerId
      });
      setFollowUpNotice(buildProviderIsolatedFollowUpNotice(locale, providerId));
    }, t("dashboard.runtime.isolateSuccess")),
  resetProvider: (providerId: string) =>
    runAction(async () => {
      await resetProviderHealth(providerId, {
        reason: `Operator reset ${providerId} from dashboard`
      });
      refreshProviderDiagnosticDetail(providerId);
      focusProviderFailureLogs(providerId);
      openAuditFocus({
        source: "provider-health",
        providerId
      });
      setFollowUpNotice(buildProviderResetFollowUpNotice(locale, providerId));
    }, t("dashboard.runtime.resetSuccess")),
  probeProvider: (providerId: string) =>
    runAction(async () => {
      await probeProviderHealth(providerId);
      refreshProviderDiagnosticDetail(providerId);
      openAuditFocus({
        source: "provider-health",
        providerId
      });
      setFollowUpNotice(buildProviderProbedFollowUpNotice(locale, providerId));
    }, t("dashboard.runtime.probeSuccess")),
  closeProviderDetail: () => {
    setSelectedProviderDiagnosticId(null);
    setSelectedProviderDiagnosticDetail(null);
  },
  applyHostCliManagedConfig: (appCode: string) =>
    runAction(async () => {
      const targetAppCode = appCode as AppBinding["appCode"];
      await applyHostCliManagedConfig(targetAppCode);
      openAuditFocus({
        source: "host-integration",
        appCode: targetAppCode
      });
      setFollowUpNotice(buildHostTakeoverAppliedFollowUpNotice(locale, targetAppCode));
    }, t("dashboard.discovery.applySuccess")),
  rollbackHostCliManagedConfig: (appCode: string) =>
    runAction(async () => {
      const targetAppCode = appCode as AppBinding["appCode"];
      await rollbackHostCliManagedConfig(targetAppCode);
      openAuditFocus({
        source: "host-integration",
        appCode: targetAppCode
      });
      setFollowUpNotice(buildHostTakeoverRolledBackFollowUpNotice(locale, targetAppCode));
    }, t("dashboard.discovery.rollbackSuccess")),
  rollbackForegroundHostCliManagedConfigs: () =>
    runAction(async () => {
      const result = await rollbackForegroundHostCliManagedConfigs();
      openAuditFocus({
        source: "host-integration"
      });
      setFollowUpNotice(
        buildForegroundHostTakeoversRolledBackFollowUpNotice(locale, {
          rolledBackAppCount: result.rolledBackApps.length,
          failedAppCount: result.failedApps.length
        })
      );
    }, localizeDashboardAction(locale, "临时宿主机接管已回滚", "Temporary host takeovers rolled back")),
  activateWorkspace: (workspaceId: string) =>
    runAction(async () => {
      await activateWorkspace(workspaceId);
      refreshWorkspaceRuntimeDetail(workspaceId);
    }, t("dashboard.workspace.activationSuccess")),
  closeWorkspaceRuntimeDetail: () => setSelectedWorkspaceRuntimeDetail(null),
  activateSession: (sessionId: string) =>
    runAction(async () => {
      await activateSession(sessionId);
      refreshSessionRuntimeDetail(sessionId);
    }, t("dashboard.workspace.activationSuccess")),
  archiveSession: (sessionId: string) =>
    runAction(async () => {
      await archiveSessionRecord(sessionId);
      setSelectedSessionRuntimeDetail(null);
    }, t("dashboard.workspace.archiveSuccess")),
  closeSessionRuntimeDetail: () => setSelectedSessionRuntimeDetail(null)
});
