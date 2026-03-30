import type { LocaleCode } from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildProjectIntakePlan } from "../lib/buildProjectIntakePlan.js";

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const renderDiscoveryStatus = (
  status: DashboardSnapshot["workspaceDiscovery"][number]["status"],
  locale: LocaleCode
): string => {
  switch (status) {
    case "new":
      return localize(locale, "新候选", "New Candidate");
    case "existing-session-root":
      return localize(locale, "已有会话待补工作区", "Session Root Needs Workspace");
    case "existing-workspace":
      return localize(locale, "已归档工作区", "Workspace Recorded");
  }

  return localize(locale, "未识别", "Unknown");
};

const renderPrimaryIntakeActionLabel = (
  mode: ReturnType<typeof buildProjectIntakePlan>["mode"],
  locale: LocaleCode
): string => {
  if (mode === "ensure-primary") {
    return localize(locale, "一键建档并激活", "Ensure And Activate");
  }
  if (mode === "batch-import") {
    return localize(locale, "一键清理并归档", "Clean Up And Import");
  }
  if (mode === "import-primary") {
    return localize(locale, "归档候选但保留当前激活", "Import And Keep Active Context");
  }
  if (mode === "archive-only") {
    return localize(locale, "清理陈旧会话", "Archive Stale Sessions");
  }
  return localize(locale, "接入队列已稳定", "Intake Queue Stable");
};

type ProjectIntakeWorkbenchProps = {
  readonly snapshot: DashboardSnapshot;
  readonly locale: LocaleCode;
  readonly disabled: boolean;
  readonly onOpenContextResources: () => void;
  readonly onImportAllWorkspaceDiscovery: () => void;
  readonly onEnsureSessionAndActivateFromDiscovery: (
    item: DashboardSnapshot["workspaceDiscovery"][number]
  ) => void;
  readonly onRunIntakeConvergence: () => void;
  readonly onArchiveStaleSessions: () => void;
  readonly onClearActiveWorkspace: () => void;
  readonly onClearActiveSession: () => void;
};

export const ProjectIntakeWorkbench = ({
  snapshot,
  locale,
  disabled,
  onOpenContextResources,
  onImportAllWorkspaceDiscovery,
  onEnsureSessionAndActivateFromDiscovery,
  onRunIntakeConvergence,
  onArchiveStaleSessions,
  onClearActiveWorkspace,
  onClearActiveSession
}: ProjectIntakeWorkbenchProps): JSX.Element => {
  const intakePlan = buildProjectIntakePlan(snapshot);
  const discoveryCandidates = intakePlan.discoveryCandidates;
  const primaryCandidate = intakePlan.primaryCandidate;
  const previewCandidates = discoveryCandidates.slice(0, 3);
  const linkedSessionCount = intakePlan.linkedSessionCount;
  const staleSessionIds = intakePlan.staleSessionIds;
  const activeWorkspaceId = intakePlan.activeWorkspaceId;
  const activeSessionId = intakePlan.activeSessionId;
  const activeAppCode = intakePlan.activeAppCode;
  const activeContextLabel =
    activeSessionId !== null
      ? localize(locale, `会话 ${activeSessionId}`, `Session ${activeSessionId}`)
      : activeWorkspaceId !== null
        ? localize(locale, `工作区 ${activeWorkspaceId}`, `Workspace ${activeWorkspaceId}`)
        : localize(locale, "未激活", "Not Active");
  const intakeLevel = intakePlan.intakeLevel;
  const hasRecommendedAction = intakePlan.recommendedActionCount > 0;
  const primaryActionLabel = renderPrimaryIntakeActionLabel(intakePlan.mode, locale);

  return (
    <div className="note-block">
      <strong>{localize(locale, "项目接入工作台", "Project Intake Workbench")}</strong>
      <p>
        {localize(
          locale,
          "把宿主机探测到的项目候选收成工作区，把即时请求沉淀成会话，再决定当前激活上下文。这样后续 Prompt / Skill / 路由治理才会真正跟项目绑定。",
          "Turn host-discovered project candidates into workspaces, capture live request paths as sessions, and then decide the active context. That is what makes later prompt, skill, and routing governance truly project-aware."
        )}
      </p>

      <div className="preview-summary-grid">
        <div className={`preview-summary-tile risk-${discoveryCandidates.length > 0 ? "medium" : "low"}`}>
          <strong>{discoveryCandidates.length}</strong>
          <span>{localize(locale, "待接入项目", "Projects To Intake")}</span>
        </div>
        <div className={`preview-summary-tile risk-${linkedSessionCount > 0 ? "medium" : "low"}`}>
          <strong>{linkedSessionCount}</strong>
          <span>{localize(locale, "可挂回会话", "Recoverable Sessions")}</span>
        </div>
        <div className={`preview-summary-tile risk-${staleSessionIds.length > 0 ? "high" : "low"}`}>
          <strong>{staleSessionIds.length}</strong>
          <span>{localize(locale, "陈旧会话", "Stale Sessions")}</span>
        </div>
        <div className={`preview-summary-tile risk-${activeAppCode !== null ? "low" : "medium"}`}>
          <strong>{activeAppCode ?? localize(locale, "未绑定", "Unbound")}</strong>
          <span>{localize(locale, "当前激活应用", "Active App")}</span>
        </div>
      </div>

      <ul className="governance-suggestion-list">
        <li>
          {localize(locale, "当前接入焦点", "Current Intake Focus")}: {activeContextLabel}
        </li>
        {primaryCandidate ? (
          <li>
            {localize(locale, "优先候选", "Primary Candidate")}: {primaryCandidate.name} /{" "}
            {renderDiscoveryStatus(primaryCandidate.status, locale)} /{" "}
            {primaryCandidate.appCodeSuggestion ?? localize(locale, "待确认应用", "App Pending")}
          </li>
        ) : null}
        {primaryCandidate ? <li>{primaryCandidate.rootPath}</li> : null}
        {primaryCandidate?.existingSessionIds.length ? (
          <li>
            {localize(locale, "可直接挂回的历史会话", "Historical Sessions Ready To Reattach")}:{" "}
            {primaryCandidate.existingSessionIds.join(", ")}
          </li>
        ) : null}
        {staleSessionIds.length > 0 ? (
          <li>
            {localize(locale, "建议先清理这些陈旧会话", "Stale sessions worth archiving first")}:{" "}
            {staleSessionIds.slice(0, 4).join(", ")}
            {staleSessionIds.length > 4 ? ` +${staleSessionIds.length - 4}` : ""}
          </li>
        ) : null}
        {intakePlan.shouldBatchImportCandidates ? (
          <li>
            {localize(locale, "本轮建议动作", "Recommended Run")}:
            {" "}
            {localize(
              locale,
              `整批归档 ${discoveryCandidates.length} 个候选，并保留当前激活上下文不被误切换。`,
              `Import ${discoveryCandidates.length} candidates in batch while keeping the current active context unchanged.`
            )}
          </li>
        ) : null}
        {intakePlan.shouldEnsurePrimaryCandidate && primaryCandidate ? (
          <li>
            {localize(locale, "本轮建议动作", "Recommended Run")}:
            {" "}
            {localize(
              locale,
              `直接为 ${primaryCandidate.name} 建档并激活，让后续 Prompt / MCP / 路由治理立刻跟项目绑定。`,
              `Create and activate ${primaryCandidate.name} directly so prompt, MCP, and routing governance attach to the project immediately.`
            )}
          </li>
        ) : null}
        {intakePlan.shouldImportPrimaryCandidate && primaryCandidate ? (
          <li>
            {localize(locale, "本轮建议动作", "Recommended Run")}:
            {" "}
            {localize(
              locale,
              `先归档 ${primaryCandidate.name}，但保留当前激活上下文不变，避免打断正在运行的项目。`,
              `Import ${primaryCandidate.name} first while keeping the current active context unchanged to avoid interrupting the running project.`
            )}
          </li>
        ) : null}
        {discoveryCandidates.length === 0 && staleSessionIds.length === 0 ? (
          <li>
            {localize(
              locale,
              "当前工作区候选和会话健康度都比较稳定，可以继续做 Prompt / MCP / 流量治理。",
              "Workspace candidates and session health are stable right now, so you can keep focusing on prompt, MCP, and traffic governance."
            )}
          </li>
        ) : null}
      </ul>

      {previewCandidates.length > 0 ? (
        <div className="list">
          {previewCandidates.map((item) => (
            <div className="list-row" key={`project-intake-${item.rootPath}`}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.rootPath}</p>
                <p>
                  {renderDiscoveryStatus(item.status, locale)}
                  {" / "}
                  {item.appCodeSuggestion ?? localize(locale, "待确认应用", "App Pending")}
                  {" / depth "}
                  {item.depth}
                </p>
                {item.existingSessionIds.length > 0 ? (
                  <p>
                    {localize(locale, "关联会话", "Linked Sessions")}: {item.existingSessionIds.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="row-meta">
                <button
                  className="inline-action"
                  type="button"
                  disabled={disabled}
                  onClick={() => onEnsureSessionAndActivateFromDiscovery(item)}
                >
                  {localize(locale, "建并激活", "Ensure And Activate")}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="quick-action-row">
        {hasRecommendedAction ? (
          <button
            className="inline-action"
            type="button"
            disabled={disabled}
            onClick={onRunIntakeConvergence}
          >
            {primaryActionLabel}
          </button>
        ) : null}
        {primaryCandidate ? (
          <button
            className="inline-action"
            type="button"
            disabled={disabled}
            onClick={() => onEnsureSessionAndActivateFromDiscovery(primaryCandidate)}
          >
            {localize(locale, "处理优先候选", "Process Primary Candidate")}
          </button>
        ) : null}
        {discoveryCandidates.length > 1 ? (
          <button
            className="inline-action"
            type="button"
            disabled={disabled}
            onClick={onImportAllWorkspaceDiscovery}
          >
            {localize(locale, "整批归档候选", "Import Candidates In Batch")}
          </button>
        ) : null}
        {staleSessionIds.length > 0 ? (
          <button
            className="inline-action"
            type="button"
            disabled={disabled}
            onClick={onArchiveStaleSessions}
          >
            {localize(locale, "清理陈旧会话", "Archive Stale Sessions")}
          </button>
        ) : null}
        <button
          className="inline-action"
          type="button"
          disabled={disabled}
          onClick={onOpenContextResources}
        >
          {localize(locale, "打开上下文资源", "Open Context Resources")}
        </button>
        {activeSessionId !== null ? (
          <button
            className="inline-action"
            type="button"
            disabled={disabled}
            onClick={onClearActiveSession}
          >
            {localize(locale, "清除会话激活", "Clear Session Activation")}
          </button>
        ) : activeWorkspaceId !== null ? (
          <button
            className="inline-action"
            type="button"
            disabled={disabled}
            onClick={onClearActiveWorkspace}
          >
            {localize(locale, "清除工作区激活", "Clear Workspace Activation")}
          </button>
        ) : null}
      </div>

      <p>
        {localize(
          locale,
          `当前结论：${intakeLevel === "low" ? "项目接入面基本稳定。" : "还存在需要收口的项目接入动作。"}${hasRecommendedAction ? ` 推荐先执行“${primaryActionLabel}”。` : ""}`,
          `Current verdict: ${intakeLevel === "low" ? "project intake looks stable." : "there are still project intake actions to close out."}${hasRecommendedAction ? ` Start with "${primaryActionLabel}".` : ""}`
        )}
      </p>
    </div>
  );
};
