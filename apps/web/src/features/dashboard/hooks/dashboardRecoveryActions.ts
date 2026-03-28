import type { ExportPackage } from "@cc-switch-web/shared";

import {
  exportCurrentConfig,
  importConfigPackage,
  restoreSnapshotVersion
} from "../api/load-dashboard-snapshot.js";
import {
  buildConfigImportedFollowUpNotice,
  buildSnapshotRestoredFollowUpNotice
} from "../lib/dashboardFollowUp.js";

import {
  type DashboardActionLocale,
  type DashboardActionOpenAuditFocus,
  type DashboardActionRunAction,
  type DashboardActionSetFollowUpNotice
} from "./dashboardActionTypes.js";

type RecoveryTranslationKey =
  | "dashboard.forms.exportSuccess"
  | "dashboard.forms.importSuccess"
  | "dashboard.forms.restoreSuccess"
  | "dashboard.snapshots.selectedVersionNotice"
  | "dashboard.forms.restoreReviewReady";

type CreateDashboardRecoveryActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: RecoveryTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly loadImportPreview: (selectedVersionNotice: string) => void;
  readonly openAuditFocus: DashboardActionOpenAuditFocus;
  readonly selectedSnapshotVersion: number | null;
  readonly setSelectedSnapshotVersion: (value: number | null) => void;
  readonly setNoticeMessage: (value: string | null) => void;
  readonly setImportPreview: (value: null) => void;
  readonly setImportPreviewSourceText: (value: string) => void;
  readonly setExportText: (value: string) => void;
  readonly setImportText: (value: string) => void;
  readonly importText: string;
  readonly toJsonString: (value: ExportPackage) => string;
};

export const createDashboardRecoveryActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  loadImportPreview,
  openAuditFocus,
  selectedSnapshotVersion,
  setSelectedSnapshotVersion,
  setNoticeMessage,
  setImportPreview,
  setImportPreviewSourceText,
  setExportText,
  setImportText,
  importText,
  toJsonString
}: CreateDashboardRecoveryActionsParams) => ({
  onImportTextChange: (value: string) => {
    setImportText(value);
    setImportPreview(null);
    setImportPreviewSourceText("");
  },
  exportConfig: () =>
    runAction(async () => {
      const configPackage = await exportCurrentConfig();
      setExportText(toJsonString(configPackage));
    }, t("dashboard.forms.exportSuccess")),
  previewImport: () => loadImportPreview(t("dashboard.snapshots.selectedVersionNotice")),
  importConfig: () =>
    runAction(async () => {
      const parsed = JSON.parse(importText) as unknown;
      await importConfigPackage(parsed);
      openAuditFocus({
        source: "proxy-request"
      });
      setFollowUpNotice(buildConfigImportedFollowUpNotice(locale));
    }, t("dashboard.forms.importSuccess")),
  restoreSnapshot: () =>
    runAction(async () => {
      if (selectedSnapshotVersion === null) {
        return;
      }
      await restoreSnapshotVersion(selectedSnapshotVersion);
      setSelectedSnapshotVersion(null);
      openAuditFocus({
        source: "proxy-request"
      });
      setFollowUpNotice(buildSnapshotRestoredFollowUpNotice(locale));
    }, t("dashboard.forms.restoreSuccess")),
  inspectSnapshot: (version: number) => {
    setSelectedSnapshotVersion(version);
    setNoticeMessage(t("dashboard.snapshots.selectedVersionNotice"));
  },
  prepareRestoreSnapshot: (version: number) => {
    setSelectedSnapshotVersion(version);
    setNoticeMessage(t("dashboard.forms.restoreReviewReady"));
  }
});
