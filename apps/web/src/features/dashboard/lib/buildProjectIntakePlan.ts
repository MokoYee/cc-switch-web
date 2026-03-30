import type { AppCode } from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";

type ProjectIntakeCandidate = DashboardSnapshot["workspaceDiscovery"][number];

export type ProjectIntakePlanMode =
  | "stable"
  | "ensure-primary"
  | "batch-import"
  | "import-primary"
  | "archive-only";

export type ProjectIntakePlan = {
  readonly discoveryCandidates: ProjectIntakeCandidate[];
  readonly primaryCandidate: ProjectIntakeCandidate | null;
  readonly linkedSessionCount: number;
  readonly staleSessionIds: string[];
  readonly activeWorkspaceId: string | null;
  readonly activeSessionId: string | null;
  readonly activeAppCode: AppCode | null;
  readonly hasActiveContext: boolean;
  readonly shouldArchiveStaleSessions: boolean;
  readonly shouldBatchImportCandidates: boolean;
  readonly shouldEnsurePrimaryCandidate: boolean;
  readonly shouldImportPrimaryCandidate: boolean;
  readonly recommendedActionCount: number;
  readonly mode: ProjectIntakePlanMode;
  readonly intakeLevel: "low" | "medium";
};

export const buildProjectIntakeCandidatePriority = (item: ProjectIntakeCandidate): number => {
  if (item.status === "existing-session-root") {
    return 0;
  }
  if (item.existingSessionIds.length > 0) {
    return 1;
  }
  if (item.appCodeSuggestion !== null) {
    return 2;
  }
  return 3;
};

export const listProjectIntakeCandidates = (
  snapshot: DashboardSnapshot
): ProjectIntakeCandidate[] =>
  snapshot.workspaceDiscovery
    .filter((item) => item.status !== "existing-workspace")
    .sort((left, right) => {
      const priorityDiff =
        buildProjectIntakeCandidatePriority(left) - buildProjectIntakeCandidatePriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const depthDiff = left.depth - right.depth;
      if (depthDiff !== 0) {
        return depthDiff;
      }

      return left.rootPath.localeCompare(right.rootPath);
    });

export const buildProjectIntakePlan = (
  snapshot: DashboardSnapshot
): ProjectIntakePlan => {
  const discoveryCandidates = listProjectIntakeCandidates(snapshot);
  const primaryCandidate = discoveryCandidates[0] ?? null;
  const linkedSessionCount = discoveryCandidates.reduce(
    (total, item) => total + item.existingSessionIds.length,
    0
  );
  const staleSessionIds = snapshot.sessionGovernance.staleSessionIds;
  const activeWorkspaceId = snapshot.activeContext.activeWorkspaceId;
  const activeSessionId = snapshot.activeContext.activeSessionId;
  const activeAppCode =
    snapshot.activeContext.sessionContext?.effectiveAppCode ??
    snapshot.activeContext.workspaceContext?.effectiveAppCode ??
    null;
  const hasActiveContext = activeSessionId !== null || activeWorkspaceId !== null;
  const shouldArchiveStaleSessions = staleSessionIds.length > 0;
  const shouldBatchImportCandidates = discoveryCandidates.length > 1;
  const shouldEnsurePrimaryCandidate = !hasActiveContext && primaryCandidate !== null;
  const shouldImportPrimaryCandidate =
    hasActiveContext && primaryCandidate !== null && !shouldBatchImportCandidates;
  const recommendedActionCount =
    (shouldArchiveStaleSessions ? 1 : 0) +
    (shouldBatchImportCandidates ? 1 : 0) +
    (shouldEnsurePrimaryCandidate ? 1 : 0) +
    (shouldImportPrimaryCandidate ? 1 : 0);
  const mode: ProjectIntakePlanMode = shouldEnsurePrimaryCandidate
    ? "ensure-primary"
    : shouldBatchImportCandidates
      ? "batch-import"
      : shouldImportPrimaryCandidate
        ? "import-primary"
        : shouldArchiveStaleSessions
          ? "archive-only"
          : "stable";
  const intakeLevel =
    discoveryCandidates.length > 0
      ? "medium"
      : staleSessionIds.length > 0
        ? "medium"
        : hasActiveContext
          ? "low"
          : "medium";

  return {
    discoveryCandidates,
    primaryCandidate,
    linkedSessionCount,
    staleSessionIds,
    activeWorkspaceId,
    activeSessionId,
    activeAppCode,
    hasActiveContext,
    shouldArchiveStaleSessions,
    shouldBatchImportCandidates,
    shouldEnsurePrimaryCandidate,
    shouldImportPrimaryCandidate,
    recommendedActionCount,
    mode,
    intakeLevel
  };
};
