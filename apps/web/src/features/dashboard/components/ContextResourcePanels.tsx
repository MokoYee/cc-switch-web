import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildPromptGovernanceEntries, buildSkillGovernanceEntries } from "../lib/buildAssetGovernanceEntries.js";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const joinProviderIds = (providerIds: string[]): string => providerIds.join(", ");

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

const buildAssetGovernanceBadge = (
  locale: "zh-CN" | "en-US",
  level: "low" | "medium" | "high"
): string => {
  if (level === "high") {
    return localize(locale, "优先治理", "Priority");
  }
  if (level === "medium") {
    return localize(locale, "建议处理", "Review");
  }
  return localize(locale, "稳定", "Stable");
};

const renderContextSource = (
  source: DashboardSnapshot["resolvedWorkspaceContexts"][number]["provider"]["source"],
  t: (
    key:
      | "dashboard.workspace.source.workspaceDefault"
      | "dashboard.workspace.source.sessionOverride"
      | "dashboard.workspace.source.appBinding"
      | "dashboard.workspace.source.none"
  ) => string
): string => {
  if (source === "workspace-default") {
    return t("dashboard.workspace.source.workspaceDefault");
  }
  if (source === "session-override") {
    return t("dashboard.workspace.source.sessionOverride");
  }
  if (source === "app-binding") {
    return t("dashboard.workspace.source.appBinding");
  }
  return t("dashboard.workspace.source.none");
};

const renderWorkspaceDiscoveryStatus = (
  status: DashboardSnapshot["workspaceDiscovery"][number]["status"],
  t: (
    key:
      | "dashboard.workspace.discoveryStatus.new"
      | "dashboard.workspace.discoveryStatus.existingWorkspace"
      | "dashboard.workspace.discoveryStatus.existingSessionRoot"
      | "common.notFound"
  ) => string
): string => {
  switch (status) {
    case "new":
      return t("dashboard.workspace.discoveryStatus.new");
    case "existing-workspace":
      return t("dashboard.workspace.discoveryStatus.existingWorkspace");
    case "existing-session-root":
      return t("dashboard.workspace.discoveryStatus.existingSessionRoot");
    default:
      return t("common.notFound");
  }
};

const renderMcpRuntimeStatus = (
  status: DashboardSnapshot["mcpRuntimeViews"][number]["status"] | DashboardSnapshot["mcpRuntimeViews"][number]["items"][number]["status"],
  t: (
    key:
      | "dashboard.mcp.status.healthy"
      | "dashboard.mcp.status.warning"
      | "dashboard.mcp.status.error"
  ) => string
): string => {
  if (status === "healthy") {
    return t("dashboard.mcp.status.healthy");
  }
  if (status === "warning") {
    return t("dashboard.mcp.status.warning");
  }
  return t("dashboard.mcp.status.error");
};

const renderMcpIssueCode = (
  issueCode: DashboardSnapshot["mcpRuntimeViews"][number]["issueCodes"][number],
  t: (
    key:
      | "dashboard.mcp.issue.missingServer"
      | "dashboard.mcp.issue.serverDisabled"
      | "dashboard.mcp.issue.duplicateBinding"
      | "dashboard.mcp.issue.missingCommand"
      | "dashboard.mcp.issue.missingUrl"
      | "dashboard.mcp.issue.hostDrift"
  ) => string
): string => {
  switch (issueCode) {
    case "missing-server":
      return t("dashboard.mcp.issue.missingServer");
    case "server-disabled":
      return t("dashboard.mcp.issue.serverDisabled");
    case "duplicate-binding":
      return t("dashboard.mcp.issue.duplicateBinding");
    case "missing-command":
      return t("dashboard.mcp.issue.missingCommand");
    case "missing-url":
      return t("dashboard.mcp.issue.missingUrl");
    case "host-drift":
      return t("dashboard.mcp.issue.hostDrift");
  }
};

type ContextResourcePanelsProps = {
  readonly snapshot: DashboardSnapshot;
  readonly resolvedWorkspaceContextById: Map<
    string,
    DashboardSnapshot["resolvedWorkspaceContexts"][number]
  >;
  readonly resolvedSessionContextById: Map<
    string,
    DashboardSnapshot["resolvedSessionContexts"][number]
  >;
  readonly mcpRuntimeItemByBindingId: Map<
    string,
    DashboardSnapshot["mcpRuntimeViews"][number]["items"][number]
  >;
  readonly mcpBindingUsage: Map<string, number>;
  readonly isWorking: boolean;
  readonly onEditPromptTemplate: (item: DashboardSnapshot["promptTemplates"][number]) => void;
  readonly onDeletePromptTemplate: (id: string) => void;
  readonly onOpenWorkspaceBatchReview: (
    workspaceIds: string[],
    sourceLabel: string,
    appCode: DashboardSnapshot["promptTemplates"][number]["appCode"]
  ) => void;
  readonly onOpenSessionBatchReview: (
    sessionIds: string[],
    sourceLabel: string,
    appCode: DashboardSnapshot["promptTemplates"][number]["appCode"]
  ) => void;
  readonly onEditSkill: (item: DashboardSnapshot["skills"][number]) => void;
  readonly onDeleteSkill: (id: string) => void;
  readonly onEditWorkspace: (item: DashboardSnapshot["workspaces"][number]) => void;
  readonly onActivateWorkspace: (id: string) => void;
  readonly onDeleteWorkspace: (id: string) => void;
  readonly onImportAllWorkspaceDiscovery: () => void;
  readonly onImportWorkspaceDiscovery: (item: DashboardSnapshot["workspaceDiscovery"][number]) => void;
  readonly onEnsureSessionFromDiscovery: (item: DashboardSnapshot["workspaceDiscovery"][number]) => void;
  readonly onEnsureSessionAndActivateFromDiscovery: (
    item: DashboardSnapshot["workspaceDiscovery"][number]
  ) => void;
  readonly onEditSession: (item: DashboardSnapshot["sessionRecords"][number]) => void;
  readonly onActivateSession: (id: string) => void;
  readonly onArchiveSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => void;
  readonly onEditFailoverChain: (item: DashboardSnapshot["failoverChains"][number]) => void;
  readonly onDeleteFailoverChain: (id: string) => void;
  readonly onEditMcpServer: (item: DashboardSnapshot["mcpServers"][number]) => void;
  readonly onDeleteMcpServer: (id: string) => void;
  readonly onEditMcpBinding: (item: DashboardSnapshot["appMcpBindings"][number]) => void;
  readonly onDeleteMcpBinding: (id: string) => void;
};

export const ContextResourcePanels = ({
  snapshot,
  resolvedWorkspaceContextById,
  resolvedSessionContextById,
  mcpRuntimeItemByBindingId,
  mcpBindingUsage,
  isWorking,
  onEditPromptTemplate,
  onDeletePromptTemplate,
  onOpenWorkspaceBatchReview,
  onOpenSessionBatchReview,
  onEditSkill,
  onDeleteSkill,
  onEditWorkspace,
  onActivateWorkspace,
  onDeleteWorkspace,
  onImportAllWorkspaceDiscovery,
  onImportWorkspaceDiscovery,
  onEnsureSessionFromDiscovery,
  onEnsureSessionAndActivateFromDiscovery,
  onEditSession,
  onActivateSession,
  onArchiveSession,
  onDeleteSession,
  onEditFailoverChain,
  onDeleteFailoverChain,
  onEditMcpServer,
  onDeleteMcpServer,
  onEditMcpBinding,
  onDeleteMcpBinding
}: ContextResourcePanelsProps): JSX.Element => {
  const { t, locale } = useI18n();
  const promptEntries = buildPromptGovernanceEntries(snapshot, locale);
  const skillEntries = buildSkillGovernanceEntries(snapshot, locale);
  const workspaceDiscoveryCandidates = snapshot.workspaceDiscovery.filter(
    (item) => item.status !== "existing-workspace"
  );

  const buildMiniNotice = (warnings: string[]) => {
    const level =
      warnings.some(
        (item) =>
          item.includes("not found") ||
          item.includes("does not exist") ||
          item.includes("不存在") ||
          item.includes("未找到")
      )
        ? "high"
        : "medium";

    return {
      level,
      summary:
        level === "high"
          ? localize(locale, "当前对象存在缺失引用或不可用配置，建议先修复。", "This item has missing references or unavailable config. Repair it first.")
          : localize(locale, "当前对象存在注意项，建议进入编辑器确认。", "This item has cautions. Review it in the editor."),
      suggestions: warnings.map((item) => item)
    } as const;
  };

  const buildAssetImpactSummary = (
    workspaceIds: string[],
    sessionIds: string[]
  ): string =>
    localize(
      locale,
      `影响 ${workspaceIds.length} 个工作区 / ${sessionIds.length} 个会话`,
      `Impacts ${workspaceIds.length} workspaces / ${sessionIds.length} sessions`
    );

  return (
    <>
      <article className="panel">
        <h2>{t("dashboard.panels.promptTemplates")}</h2>
        <div className="list">
          {snapshot.promptTemplates.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.promptTemplates")}</strong>
                <p>{t("dashboard.assets.emptyPrompts")}</p>
              </div>
            </div>
          ) : (
            promptEntries.map(({ item, linkedWorkspaceIds, linkedSessionIds, warnings, governanceLevel }) => (
                  <div className={`list-row asset-list-row asset-list-row-${governanceLevel}`} key={item.id}>
                    <div>
                      <strong>
                        {item.name}
                        <span className={`asset-governance-badge asset-governance-badge-${governanceLevel}`}>
                          {buildAssetGovernanceBadge(locale, governanceLevel)}
                        </span>
                      </strong>
                      <p>
                        {item.id} / {item.locale} / {item.appCode ?? t("dashboard.assets.globalScope")}
                      </p>
                      <p>{item.tags.join(", ") || t("common.notFound")}</p>
                      {(linkedWorkspaceIds.length > 0 || linkedSessionIds.length > 0) ? (
                        <p>{buildAssetImpactSummary(linkedWorkspaceIds, linkedSessionIds)}</p>
                      ) : null}
                      {warnings.length > 0 ? <GovernanceNoticeCard notice={buildMiniNotice(warnings)} locale={locale} /> : null}
                    </div>
                    <div className="row-meta">
                      <span>{item.enabled ? t("common.enabled") : t("common.disabled")}</span>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onEditPromptTemplate(item)}
                      >
                        {warnings.length > 0
                          ? localize(locale, "编辑并修复", "Edit to Repair")
                          : t("dashboard.assets.editAction")}
                      </button>
                      {linkedWorkspaceIds.length > 1 ? (
                        <button
                          className="inline-action"
                          type="button"
                          disabled={isWorking}
                          onClick={() =>
                            onOpenWorkspaceBatchReview(
                              linkedWorkspaceIds,
                              localize(locale, `Prompt ${item.id}`, `Prompt ${item.id}`),
                              item.appCode
                            )
                          }
                        >
                          {localize(locale, "治理工作区", "Review Workspaces")}
                        </button>
                      ) : null}
                      {linkedSessionIds.length > 1 ? (
                        <button
                          className="inline-action"
                          type="button"
                          disabled={isWorking}
                          onClick={() =>
                            onOpenSessionBatchReview(
                              linkedSessionIds,
                              localize(locale, `Prompt ${item.id}`, `Prompt ${item.id}`),
                              item.appCode
                            )
                          }
                        >
                          {localize(locale, "治理会话", "Review Sessions")}
                        </button>
                      ) : null}
                      <button
                        className="inline-action danger"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onDeletePromptTemplate(item.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
            ))
          )}
        </div>
      </article>

      <article className="panel">
        <h2>{t("dashboard.panels.skills")}</h2>
        <div className="list">
          {snapshot.skills.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.skills")}</strong>
                <p>{t("dashboard.assets.emptySkills")}</p>
              </div>
            </div>
          ) : (
            skillEntries.map(({ item, linkedWorkspaceIds, linkedSessionIds, warnings, governanceLevel }) => (
                  <div className={`list-row asset-list-row asset-list-row-${governanceLevel}`} key={item.id}>
                    <div>
                      <strong>
                        {item.name}
                        <span className={`asset-governance-badge asset-governance-badge-${governanceLevel}`}>
                          {buildAssetGovernanceBadge(locale, governanceLevel)}
                        </span>
                      </strong>
                      <p>{item.id} / {item.appCode ?? t("dashboard.assets.globalScope")}</p>
                      <p>
                        {t("dashboard.assets.linkedPrompt")}: {item.promptTemplateId ?? t("common.notFound")}
                      </p>
                      <p>{item.tags.join(", ") || t("common.notFound")}</p>
                      {(linkedWorkspaceIds.length > 0 || linkedSessionIds.length > 0) ? (
                        <p>{buildAssetImpactSummary(linkedWorkspaceIds, linkedSessionIds)}</p>
                      ) : null}
                      {warnings.length > 0 ? <GovernanceNoticeCard notice={buildMiniNotice(warnings)} locale={locale} /> : null}
                    </div>
                    <div className="row-meta">
                      <span>{item.enabled ? t("common.enabled") : t("common.disabled")}</span>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onEditSkill(item)}
                      >
                        {warnings.length > 0
                          ? localize(locale, "编辑并修复", "Edit to Repair")
                          : t("dashboard.assets.editAction")}
                      </button>
                      {linkedWorkspaceIds.length > 1 ? (
                        <button
                          className="inline-action"
                          type="button"
                          disabled={isWorking}
                          onClick={() =>
                            onOpenWorkspaceBatchReview(
                              linkedWorkspaceIds,
                              localize(locale, `Skill ${item.id}`, `Skill ${item.id}`),
                              item.appCode
                            )
                          }
                        >
                          {localize(locale, "治理工作区", "Review Workspaces")}
                        </button>
                      ) : null}
                      {linkedSessionIds.length > 1 ? (
                        <button
                          className="inline-action"
                          type="button"
                          disabled={isWorking}
                          onClick={() =>
                            onOpenSessionBatchReview(
                              linkedSessionIds,
                              localize(locale, `Skill ${item.id}`, `Skill ${item.id}`),
                              item.appCode
                            )
                          }
                        >
                          {localize(locale, "治理会话", "Review Sessions")}
                        </button>
                      ) : null}
                      <button
                        className="inline-action danger"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onDeleteSkill(item.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
            ))
          )}
        </div>
      </article>

      <article className="panel">
        <h2>{t("dashboard.panels.workspaces")}</h2>
        <div className="list">
          {snapshot.workspaces.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.workspaces")}</strong>
                <p>{t("dashboard.workspace.emptyWorkspaces")}</p>
              </div>
            </div>
          ) : (
            snapshot.workspaces.map((item) => {
              const context = resolvedWorkspaceContextById.get(item.id);

              return (
                <div className="list-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.rootPath}</p>
                    <p>
                      {item.appCode ?? t("dashboard.assets.globalScope")} / {item.defaultProviderId ?? t("common.notFound")}
                    </p>
                    <p>
                      {item.defaultPromptTemplateId ?? t("common.notFound")} / {item.defaultSkillId ?? t("common.notFound")}
                    </p>
                    {context ? (
                      <>
                        <p>
                          {t("dashboard.workspace.effectiveProvider")}: {context.provider.id ?? t("common.notFound")} /{" "}
                          {renderContextSource(context.provider.source, t)}
                        </p>
                        <p>
                          {t("dashboard.workspace.effectivePrompt")}: {context.promptTemplate.id ?? t("common.notFound")} /{" "}
                          {renderContextSource(context.promptTemplate.source, t)}
                        </p>
                        <p>
                          {t("dashboard.workspace.effectiveSkill")}: {context.skill.id ?? t("common.notFound")} /{" "}
                          {renderContextSource(context.skill.source, t)}
                        </p>
                        <p>
                          {t("dashboard.workspace.warnings")}: {joinDashboardWarnings(context.warnings, locale, t("dashboard.workspace.noWarnings"))}
                        </p>
                        {context.warnings.length > 0 ? (
                          <GovernanceNoticeCard notice={buildMiniNotice(context.warnings)} locale={locale} />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="row-meta">
                    <span>{item.enabled ? t("common.enabled") : t("common.disabled")}</span>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onEditWorkspace(item)}
                    >
                      {context?.warnings.length
                        ? localize(locale, "编辑并修复", "Edit to Repair")
                        : t("dashboard.assets.editAction")}
                    </button>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onActivateWorkspace(item.id)}
                    >
                      {t("dashboard.workspace.activateAction")}
                    </button>
                    <button
                      className="inline-action danger"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onDeleteWorkspace(item.id)}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </article>

      <article className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >
          <h2>{t("dashboard.panels.workspaceDiscovery")}</h2>
          {workspaceDiscoveryCandidates.length > 1 ? (
            <button
              className="inline-action"
              type="button"
              disabled={isWorking}
              onClick={onImportAllWorkspaceDiscovery}
            >
              {localize(
                locale,
                `一键归档 ${workspaceDiscoveryCandidates.length} 个候选`,
                `Import ${workspaceDiscoveryCandidates.length} Candidates`
              )}
            </button>
          ) : null}
        </div>
        <div className="list">
          {snapshot.workspaceDiscovery.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.workspaceDiscovery")}</strong>
                <p>{t("common.notFound")}</p>
              </div>
            </div>
          ) : (
            snapshot.workspaceDiscovery.map((item) => (
              <div className="list-row" key={`workspace-discovery-${item.rootPath}`}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.rootPath}</p>
                  <p>{renderWorkspaceDiscoveryStatus(item.status, t)}</p>
                  <p>
                    {t("dashboard.workspace.discoveryMarkers")}: {item.markers.join(", ") || t("common.notFound")}
                  </p>
                  <p>
                    app: {item.appCodeSuggestion ?? t("common.notFound")} / git:{" "}
                    {item.hasGitRepository ? t("common.enabled") : t("common.disabled")}
                  </p>
                  {item.existingSessionIds.length > 0 ? (
                    <p>
                      {localize(locale, "关联会话", "Linked Sessions")}: {item.existingSessionIds.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="row-meta">
                  <span>{item.depth}</span>
                  {item.status !== "existing-workspace" ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onImportWorkspaceDiscovery(item)}
                    >
                      {item.status === "existing-session-root"
                        ? localize(locale, "补工作区归档", "Attach Workspace")
                        : t("dashboard.workspace.discoveryImportAction")}
                    </button>
                  ) : null}
                  {item.status !== "existing-workspace" ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onEnsureSessionFromDiscovery(item)}
                    >
                      {localize(locale, "一键建会话", "Ensure Session")}
                    </button>
                  ) : null}
                  {item.status !== "existing-workspace" ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onEnsureSessionAndActivateFromDiscovery(item)}
                    >
                      {localize(locale, "建并激活", "Ensure And Activate")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="panel">
        <h2>{t("dashboard.panels.sessions")}</h2>
        <div className="list">
          {snapshot.sessionRecords.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.sessions")}</strong>
                <p>{t("dashboard.workspace.emptySessions")}</p>
              </div>
            </div>
          ) : (
            snapshot.sessionRecords.map((item) => {
              const context = resolvedSessionContextById.get(item.id);

              return (
                <div className="list-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>
                      {item.appCode} /{" "}
                      {item.status === "active"
                        ? t("dashboard.workspace.sessionActive")
                        : t("dashboard.workspace.sessionArchived")}
                    </p>
                    <p>{item.cwd}</p>
                    <p>{item.workspaceId ?? t("common.notFound")} / {item.providerId ?? t("common.notFound")}</p>
                    {context ? (
                      <>
                        <p>
                          {t("dashboard.workspace.effectiveProvider")}: {context.provider.id ?? t("common.notFound")} /{" "}
                          {renderContextSource(context.provider.source, t)}
                        </p>
                        <p>
                          {t("dashboard.workspace.effectivePrompt")}: {context.promptTemplate.id ?? t("common.notFound")} /{" "}
                          {renderContextSource(context.promptTemplate.source, t)}
                        </p>
                        <p>
                          {t("dashboard.workspace.effectiveSkill")}: {context.skill.id ?? t("common.notFound")} /{" "}
                          {renderContextSource(context.skill.source, t)}
                        </p>
                        <p>
                          {t("dashboard.workspace.warnings")}: {joinDashboardWarnings(context.warnings, locale, t("dashboard.workspace.noWarnings"))}
                        </p>
                        {context.warnings.length > 0 ? (
                          <GovernanceNoticeCard notice={buildMiniNotice(context.warnings)} locale={locale} />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="row-meta">
                    <code>{item.updatedAt}</code>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onEditSession(item)}
                    >
                      {context?.warnings.length
                        ? localize(locale, "编辑并修复", "Edit to Repair")
                        : t("dashboard.assets.editAction")}
                    </button>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onActivateSession(item.id)}
                    >
                      {t("dashboard.workspace.activateAction")}
                    </button>
                    {item.status === "active" ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onArchiveSession(item.id)}
                      >
                        {t("dashboard.workspace.archiveAction")}
                      </button>
                    ) : null}
                    <button
                      className="inline-action danger"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onDeleteSession(item.id)}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </article>

      <article className="panel">
        <h2>{t("dashboard.panels.failoverChains")}</h2>
        <div className="list">
          {snapshot.failoverChains.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.failoverChains")}</strong>
                <p>{t("dashboard.onboarding.emptyFailover")}</p>
              </div>
            </div>
          ) : (
            snapshot.failoverChains.map((chain) => (
              <div className="list-row" key={chain.id}>
                <div>
                  <strong>{chain.appCode}</strong>
                  <p>{joinProviderIds(chain.providerIds)}</p>
                </div>
                <div className="row-meta">
                  <span>{chain.enabled ? t("common.enabled") : t("common.disabled")} / {chain.maxAttempts}</span>
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() => onEditFailoverChain(chain)}
                  >
                    {localize(locale, "编辑并修复", "Edit to Repair")}
                  </button>
                  <button
                    className="inline-action danger"
                    type="button"
                    disabled={isWorking}
                    onClick={() => onDeleteFailoverChain(chain.id)}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="panel">
        <h2>{t("dashboard.panels.mcpServers")}</h2>
        <div className="list">
          {snapshot.mcpServers.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.mcpServers")}</strong>
                <p>{t("dashboard.mcp.emptyServers")}</p>
              </div>
            </div>
          ) : (
            snapshot.mcpServers.map((server) => (
              (() => {
                const relatedRuntimeItems = snapshot.mcpRuntimeViews.flatMap((view) =>
                  view.items.filter((item) => item.serverId === server.id)
                );
                const warnings = [
                  ...new Set(relatedRuntimeItems.flatMap((item) => item.warnings))
                ];

                return (
                  <div className="list-row" key={server.id}>
                    <div>
                      <strong>{server.name}</strong>
                      <p>{server.id} / {server.transport}</p>
                      <p>{server.command ?? server.url ?? t("common.notFound")}</p>
                      <p>{t("dashboard.mcp.bindingUsage")}: {mcpBindingUsage.get(server.id) ?? 0}</p>
                      <p>
                        {t("dashboard.mcp.previewBoundApps")}:{" "}
                        {joinPreviewValues(
                          snapshot.mcpRuntimeViews
                            .filter((view) => view.items.some((item) => item.serverId === server.id))
                            .map((view) => view.appCode),
                          t("common.notFound")
                        )}
                      </p>
                      <p>
                        {t("dashboard.mcp.runtimeManagedOnHost")}:{" "}
                        {snapshot.mcpHostSyncStates.some((item) => item.syncedServerIds.includes(server.id))
                          ? t("common.enabled")
                          : t("common.disabled")}
                      </p>
                      {warnings.length > 0 ? <GovernanceNoticeCard notice={buildMiniNotice(warnings)} locale={locale} /> : null}
                    </div>
                    <div className="row-meta">
                      <span>{server.enabled ? t("common.enabled") : t("common.disabled")}</span>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onEditMcpServer(server)}
                      >
                        {warnings.length > 0
                          ? localize(locale, "编辑并修复", "Edit to Repair")
                          : t("dashboard.mcp.editAction")}
                      </button>
                      <button
                        className="inline-action danger"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onDeleteMcpServer(server.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                );
              })()
            ))
          )}
        </div>
      </article>

      <article className="panel">
        <h2>{t("dashboard.panels.mcpBindings")}</h2>
        <div className="list">
          {snapshot.appMcpBindings.length === 0 ? (
            <div className="list-row">
              <div>
                <strong>{t("dashboard.panels.mcpBindings")}</strong>
                <p>{t("dashboard.mcp.emptyBindings")}</p>
              </div>
            </div>
          ) : (
            snapshot.appMcpBindings.map((binding) => {
              const runtimeItem = mcpRuntimeItemByBindingId.get(binding.id);

              return (
                <div className="list-row" key={binding.id}>
                  <div>
                    <strong>{binding.appCode}</strong>
                    <p>{binding.serverId}</p>
                    {runtimeItem ? (
                      <>
                        <p>
                          {t("dashboard.mcp.runtimeStatus")}: {renderMcpRuntimeStatus(runtimeItem.status, t)}
                        </p>
                        <p>
                          {t("dashboard.mcp.runtimeIssueCodes")}:{" "}
                          {runtimeItem.issueCodes.length > 0
                            ? runtimeItem.issueCodes.map((item) => renderMcpIssueCode(item, t)).join(" / ")
                            : t("dashboard.workspace.noWarnings")}
                        </p>
                        <p>
                          {t("dashboard.mcp.runtimeManagedOnHost")}:{" "}
                          {runtimeItem.managedOnHost ? t("common.enabled") : t("common.disabled")}
                        </p>
                        {runtimeItem.warnings.length > 0 ? (
                          <GovernanceNoticeCard notice={buildMiniNotice(runtimeItem.warnings)} locale={locale} />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div className="row-meta">
                    <span>{binding.enabled ? t("common.enabled") : t("common.disabled")}</span>
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onEditMcpBinding(binding)}
                    >
                      {runtimeItem?.warnings.length
                        ? localize(locale, "编辑并修复", "Edit to Repair")
                        : t("dashboard.mcp.editAction")}
                    </button>
                    <button
                      className="inline-action danger"
                      type="button"
                      disabled={isWorking}
                      onClick={() => onDeleteMcpBinding(binding.id)}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </article>
    </>
  );
};
