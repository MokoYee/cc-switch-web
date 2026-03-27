import { useMemo } from "react";

import type {
  AuditEvent,
  ConfigSnapshotDiff,
  ConfigSnapshotDiffBucket,
  ConfigImportPreview,
  ConfigRestorePreview
} from "@cc-switch-web/shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";

type UseDashboardDerivedStateParams = {
  readonly snapshot: DashboardSnapshot | null;
  readonly auditEventPageItems: AuditEvent[];
  readonly selectedSnapshotVersion: number | null;
  readonly selectedSnapshotDiff: ConfigSnapshotDiff | null;
  readonly selectedSnapshotDetail: DashboardSnapshot["latestSnapshot"] | null;
  readonly restorePreview: ConfigRestorePreview | null;
  readonly restorePreviewVersion: number | null;
  readonly importPreview: ConfigImportPreview | null;
  readonly importPreviewSourceText: string;
  readonly importText: string;
  readonly buildSnapshotDiffItems: (
    diff: ConfigSnapshotDiff | null
  ) => Array<{
    readonly key: SnapshotDiffBucketKey;
    readonly bucket: ConfigSnapshotDiffBucket;
  }>;
};

type SnapshotDiffBucketKey =
  | "providers"
  | "promptTemplates"
  | "skills"
  | "workspaces"
  | "sessionRecords"
  | "bindings"
  | "appQuotas"
  | "failoverChains"
  | "mcpServers"
  | "appMcpBindings";

export const useDashboardDerivedState = ({
  snapshot,
  auditEventPageItems,
  selectedSnapshotVersion,
  selectedSnapshotDiff,
  selectedSnapshotDetail,
  restorePreview,
  restorePreviewVersion,
  importPreview,
  importPreviewSourceText,
  importText,
  buildSnapshotDiffItems
}: UseDashboardDerivedStateParams) => {
  const hasProviders = (snapshot?.providers.length ?? 0) > 0;
  const hasBindings = (snapshot?.bindings.length ?? 0) > 0;
  const hasFailoverChains = (snapshot?.failoverChains.length ?? 0) > 0;

  const effectiveSnapshotDiff = selectedSnapshotDiff ?? snapshot?.latestSnapshotDiff ?? null;
  const effectiveSnapshotDetail = selectedSnapshotDetail ?? snapshot?.latestSnapshot ?? null;
  const snapshotDiffItems = buildSnapshotDiffItems(effectiveSnapshotDiff);
  const latestSnapshotReason = effectiveSnapshotDetail?.reason ?? null;
  const importPreviewIsCurrent =
    importPreview !== null && importPreviewSourceText === importText;
  const restorePreviewIsCurrent =
    selectedSnapshotVersion !== null &&
    restorePreview !== null &&
    restorePreviewVersion === selectedSnapshotVersion;

  const mcpAuditItems = useMemo(
    () => auditEventPageItems.filter((event) => event.source === "mcp"),
    [auditEventPageItems]
  );
  const quotaAuditItems = useMemo(
    () => auditEventPageItems.filter((event) => event.source === "quota"),
    [auditEventPageItems]
  );
  const quotaStatusByApp = useMemo(
    () => new Map((snapshot?.appQuotaStatuses ?? []).map((item) => [item.quota.appCode, item])),
    [snapshot]
  );
  const resolvedWorkspaceContextById = useMemo(
    () => new Map((snapshot?.resolvedWorkspaceContexts ?? []).map((item) => [item.workspaceId, item])),
    [snapshot]
  );
  const resolvedSessionContextById = useMemo(
    () => new Map((snapshot?.resolvedSessionContexts ?? []).map((item) => [item.sessionId, item])),
    [snapshot]
  );
  const mcpRuntimeViewByApp = useMemo(
    () => new Map((snapshot?.mcpRuntimeViews ?? []).map((item) => [item.appCode, item])),
    [snapshot]
  );
  const mcpRuntimeItemByBindingId = useMemo(
    () =>
      new Map(
        (snapshot?.mcpRuntimeViews ?? [])
          .flatMap((item) => item.items)
          .filter((item) => item.bindingId !== null)
          .map((item) => [item.bindingId as string, item])
      ),
    [snapshot]
  );
  const mcpHostSyncStateByApp = useMemo(
    () => new Map((snapshot?.mcpHostSyncStates ?? []).map((item) => [item.appCode, item])),
    [snapshot]
  );
  const promptHostSyncStateByApp = useMemo(
    () => new Map((snapshot?.promptHostSyncStates ?? []).map((item) => [item.appCode, item])),
    [snapshot]
  );
  const mcpBindingUsage = useMemo(() => {
    if (snapshot === null) {
      return new Map<string, number>();
    }

    return snapshot.appMcpBindings.reduce((map, binding) => {
      map.set(binding.serverId, (map.get(binding.serverId) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  }, [snapshot]);

  return {
    hasProviders,
    hasBindings,
    hasFailoverChains,
    effectiveSnapshotDiff,
    snapshotDiffItems,
    latestSnapshotReason,
    importPreviewIsCurrent,
    restorePreviewIsCurrent,
    mcpAuditItems,
    quotaAuditItems,
    quotaStatusByApp,
    resolvedWorkspaceContextById,
    resolvedSessionContextById,
    mcpRuntimeViewByApp,
    mcpRuntimeItemByBindingId,
    mcpHostSyncStateByApp,
    promptHostSyncStateByApp,
    mcpBindingUsage
  };
};
