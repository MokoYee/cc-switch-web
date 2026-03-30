import type {
  AppCode,
  LocaleCode,
  McpVerificationHistoryPage,
  McpGovernanceRepairPreview,
  McpHostSyncPreview,
  PromptHostImportPreview,
  PromptHostSyncPreview,
  QuickContextAssetApplyResult
} from "cc-switch-web-shared";

import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildMcpVerificationHistory } from "../lib/buildMcpVerificationHistory.js";
import { buildMcpVerificationPlan } from "../lib/buildMcpVerificationPlan.js";
import { QuickContextAssetWorkbench } from "./QuickContextAssetWorkbench.js";

const APP_CODES: AppCode[] = ["codex", "claude-code"];

const buildQuickPromptId = (appCode: AppCode): string => `prompt-quick-${appCode}`;
const buildQuickSkillId = (appCode: AppCode): string => `skill-quick-${appCode}`;
const buildQuickAssetCardTestId = (appCode: AppCode): string => `quick-asset-card-${appCode}`;
const buildQuickPromptSectionTestId = (appCode: AppCode): string => `quick-prompt-section-${appCode}`;
const buildQuickPromptStatusTestId = (appCode: AppCode): string => `quick-prompt-status-${appCode}`;
const buildQuickPromptImportButtonTestId = (appCode: AppCode): string =>
  `quick-prompt-import-button-${appCode}`;
const buildQuickPromptPublishButtonTestId = (appCode: AppCode): string =>
  `quick-prompt-publish-button-${appCode}`;
const buildQuickPromptRollbackButtonTestId = (appCode: AppCode): string =>
  `quick-prompt-rollback-button-${appCode}`;

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const formatDateTime = (value: string): string =>
  value.replace("T", " ").replace(".000Z", "Z");

const renderRiskLevel = (
  locale: LocaleCode,
  level: "low" | "medium" | "high"
): string => {
  if (level === "high") {
    return localize(locale, "高风险", "High Risk");
  }
  if (level === "medium") {
    return localize(locale, "需关注", "Needs Attention");
  }
  return localize(locale, "已就绪", "Ready");
};

const renderContextSource = (
  locale: LocaleCode,
  source: DashboardSnapshot["effectiveContexts"][number]["promptTemplate"]["source"]
): string => {
  switch (source) {
    case "session-override":
      return localize(locale, "会话覆盖", "Session Override");
    case "workspace-default":
      return localize(locale, "工作区默认", "Workspace Default");
    case "app-binding":
      return localize(locale, "应用回退", "App Fallback");
    case "none":
      return localize(locale, "未设置", "Not Set");
  }
};

const renderSkillDeliverySupportLevel = (
  supportLevel: DashboardSnapshot["skillDeliveryCapabilities"][number]["supportLevel"],
  locale: LocaleCode
): string =>
  supportLevel === "proxy-only"
    ? localize(locale, "代理侧注入", "Proxy Injection")
    : localize(locale, "规划中", "Planned");

const renderSkillDeliveryPath = (
  recommendedPath: DashboardSnapshot["skillDeliveryCapabilities"][number]["recommendedPath"],
  locale: LocaleCode
): string =>
  recommendedPath === "active-context-injection"
    ? localize(locale, "Active Context 注入", "Active Context Injection")
    : localize(locale, "等待稳定宿主机契约", "Wait For Stable Host Contract");

const hasMcpHostDiff = (preview: McpHostSyncPreview | null): boolean =>
  preview !== null &&
  (preview.addedServerIds.length > 0 ||
    preview.removedServerIds.length > 0 ||
    (!preview.configExists && preview.nextManagedServerIds.length > 0));

const buildPromptRiskLevel = ({
  effectiveContext,
  applyPreview,
  importPreview
}: {
  readonly effectiveContext: DashboardSnapshot["effectiveContexts"][number] | null;
  readonly applyPreview: PromptHostSyncPreview | null;
  readonly importPreview: PromptHostImportPreview | null;
}): "low" | "medium" | "high" => {
  if (effectiveContext?.promptTemplate.missing || applyPreview?.applyReady === false) {
    return "high";
  }
  if (
    importPreview?.status === "ready-create" ||
    applyPreview?.warnings.length ||
    applyPreview?.ignoredSkillId !== null
  ) {
    return "medium";
  }
  return "low";
};

const buildMcpRiskLevel = ({
  runtimeView,
  governancePreview,
  hostPreview
}: {
  readonly runtimeView: DashboardSnapshot["mcpRuntimeViews"][number] | null;
  readonly governancePreview: McpGovernanceRepairPreview | null;
  readonly hostPreview: McpHostSyncPreview | null;
}): "low" | "medium" | "high" => {
  if (
    runtimeView?.status === "error" ||
    runtimeView?.hostState.drifted ||
    (governancePreview?.plannedActions.length ?? 0) > 0
  ) {
    return "high";
  }
  if (
    runtimeView?.status === "warning" ||
    hostPreview?.warnings.length ||
    hasMcpHostDiff(hostPreview)
  ) {
    return "medium";
  }
  return "low";
};

type QuickAssetDeliveryWorkbenchProps = {
  readonly snapshot: DashboardSnapshot;
  readonly locale: LocaleCode;
  readonly disabled: boolean;
  readonly onRefreshSnapshot: () => void;
  readonly promptHostSyncPreview: Record<string, PromptHostSyncPreview | null>;
  readonly promptHostImportPreview: Record<string, PromptHostImportPreview | null>;
  readonly promptHostSyncStateByApp: Map<string, DashboardSnapshot["promptHostSyncStates"][number]>;
  readonly mcpHostSyncPreview: Record<string, McpHostSyncPreview | null>;
  readonly mcpGovernancePreview: Record<string, McpGovernanceRepairPreview | null>;
  readonly mcpVerificationHistoryByApp: Record<string, McpVerificationHistoryPage | null>;
  readonly mcpRuntimeViewByApp: Map<string, DashboardSnapshot["mcpRuntimeViews"][number]>;
  readonly mcpHostSyncStateByApp: Map<string, DashboardSnapshot["mcpHostSyncStates"][number]>;
  readonly onImportPromptFromHost: (appCode: AppCode) => void;
  readonly onApplyPromptHostSync: (appCode: AppCode) => void;
  readonly onRollbackPromptHostSync: (appCode: AppCode) => void;
  readonly onImportMcpFromHost: (appCode: AppCode) => void;
  readonly onRepairMcpGovernance: (appCode: AppCode) => void;
  readonly onApplyMcpHostSync: (appCode: AppCode) => void;
  readonly onRollbackMcpHostSync: (appCode: AppCode) => void;
  readonly onOpenAssetForms: () => void;
  readonly onOpenMcpForms: () => void;
  readonly onOpenMcpVerificationHistory: (appCode: AppCode) => void;
  readonly onOpenTraffic: (appCode: AppCode) => void;
  readonly onOpenMcpRuntime: (appCode: AppCode) => void;
  readonly onOpenMcpAudit: (appCode: AppCode) => void;
  readonly onQuickContextApplied?: ((
    appCode: AppCode,
    result: QuickContextAssetApplyResult
  ) => void) | undefined;
};

export const QuickAssetDeliveryWorkbench = ({
  snapshot,
  locale,
  disabled,
  onRefreshSnapshot,
  promptHostSyncPreview,
  promptHostImportPreview,
  promptHostSyncStateByApp,
  mcpHostSyncPreview,
  mcpGovernancePreview,
  mcpVerificationHistoryByApp,
  mcpRuntimeViewByApp,
  mcpHostSyncStateByApp,
  onImportPromptFromHost,
  onApplyPromptHostSync,
  onRollbackPromptHostSync,
  onImportMcpFromHost,
  onRepairMcpGovernance,
  onApplyMcpHostSync,
  onRollbackMcpHostSync,
  onOpenAssetForms,
  onOpenMcpForms,
  onOpenMcpVerificationHistory,
  onOpenTraffic,
  onOpenMcpRuntime,
  onOpenMcpAudit,
  onQuickContextApplied
}: QuickAssetDeliveryWorkbenchProps): JSX.Element => {
  return (
    <div className="quick-asset-shell" data-testid="quick-asset-delivery">
      <div className="quick-asset-header">
        <div>
          <p className="eyebrow">{localize(locale, "资产发布", "Asset Delivery")}</p>
          <h3>{localize(locale, "把 Prompt / Skill / MCP 推到可用状态", "Publish Prompt / Skill / MCP Into Runtime")}</h3>
          <p className="panel-lead">
            {localize(
              locale,
              "这里聚焦 Codex 和 Claude Code 的首屏交付动作：确认当前有效 Prompt / Skill，处理 MCP 冲突，并把需要的配置真正同步到宿主机。",
              "This focuses the first-run delivery path for Codex and Claude Code: validate effective prompt and skill, resolve MCP conflicts, and sync the required config to the host."
            )}
          </p>
        </div>
        <div className="quick-action-row">
          <button type="button" className="ghost-button" onClick={onOpenAssetForms}>
            {localize(locale, "打开资产区", "Open Asset Forms")}
          </button>
          <button type="button" className="ghost-button" onClick={onOpenMcpForms}>
            {localize(locale, "打开 MCP 区", "Open MCP Forms")}
          </button>
        </div>
      </div>

      <div className="quick-asset-grid">
        {APP_CODES.map((appCode) => {
          const effectiveContext =
            snapshot.effectiveContexts.find((item) => item.appCode === appCode) ?? null;
          const promptPreview = promptHostSyncPreview[appCode] ?? null;
          const promptImportPreview = promptHostImportPreview[appCode] ?? null;
          const promptSyncState = promptHostSyncStateByApp.get(appCode) ?? null;
          const mcpRuntimeView = mcpRuntimeViewByApp.get(appCode) ?? null;
          const governancePreview = mcpGovernancePreview[appCode] ?? null;
          const mcpPreview = mcpHostSyncPreview[appCode] ?? null;
          const mcpSyncState = mcpHostSyncStateByApp.get(appCode) ?? null;
          const binding = snapshot.bindings.find((item) => item.appCode === appCode) ?? null;
          const skillDeliveryCapability =
            snapshot.skillDeliveryCapabilities.find((item) => item.appCode === appCode) ?? null;
          const existingQuickPrompt =
            snapshot.promptTemplates.find((item) => item.id === buildQuickPromptId(appCode)) ?? null;
          const existingQuickSkill =
            snapshot.skills.find((item) => item.id === buildQuickSkillId(appCode)) ?? null;
          const promptRiskLevel = buildPromptRiskLevel({
            effectiveContext,
            applyPreview: promptPreview,
            importPreview: promptImportPreview
          });
          const mcpRiskLevel = buildMcpRiskLevel({
            runtimeView: mcpRuntimeView,
            governancePreview,
            hostPreview: mcpPreview
          });
          const mcpVerificationPlan = buildMcpVerificationPlan({
            snapshot,
            appCode,
            locale,
            governancePreview,
            hostPreview: mcpPreview
          });
          const mcpVerificationHistory = buildMcpVerificationHistory({
            snapshot,
            appCode,
            locale,
            governancePreview,
            hostPreview: mcpPreview,
            historyPage: mcpVerificationHistoryByApp[appCode] ?? null,
            limit: 2
          });
          const latestVerificationBaseline = mcpVerificationHistory.items[0] ?? null;
          const previousVerificationBaseline = mcpVerificationHistory.items[1] ?? null;

          return (
            <article
              className="quick-asset-card"
              key={`quick-asset-${appCode}`}
              data-testid={buildQuickAssetCardTestId(appCode)}
            >
              <div className="quick-asset-card-header">
                <div>
                  <h4>{appCode}</h4>
                  <p>
                    {localize(
                      locale,
                      "把当前上下文里的 Prompt / Skill 与 MCP 宿主机状态收敛到可直接使用。",
                      "Converge the current prompt, skill, and MCP host state into a directly usable setup."
                    )}
                  </p>
                </div>
                <button type="button" className="ghost-button" onClick={() => onOpenTraffic(appCode)}>
                  {localize(locale, "看请求", "Open Requests")}
                </button>
              </div>

              <div className="write-grid">
                <div
                  className={`quick-asset-section risk-${promptRiskLevel}`}
                  data-testid={buildQuickPromptSectionTestId(appCode)}
                >
                  <div className="quick-asset-section-header">
                    <strong>{localize(locale, "Prompt / Skill", "Prompt / Skill")}</strong>
                    <span>{renderRiskLevel(locale, promptRiskLevel)}</span>
                  </div>
                  <ul
                    className="governance-suggestion-list"
                    data-testid={buildQuickPromptStatusTestId(appCode)}
                  >
                    <li>
                      {localize(locale, "当前 Prompt", "Effective Prompt")}:{" "}
                      {effectiveContext?.promptTemplate.id ?? localize(locale, "未设置", "Not Set")}
                      {" / "}
                      {renderContextSource(locale, effectiveContext?.promptTemplate.source ?? "none")}
                    </li>
                    <li>
                      {localize(locale, "当前 Skill", "Effective Skill")}:{" "}
                      {effectiveContext?.skill.id ?? localize(locale, "未设置", "Not Set")}
                      {" / "}
                      {renderContextSource(locale, effectiveContext?.skill.source ?? "none")}
                    </li>
                    <li>
                      {localize(locale, "Skill 交付", "Skill Delivery")}:{" "}
                      {skillDeliveryCapability === null
                        ? localize(locale, "未建模", "Not Modeled")
                        : `${renderSkillDeliverySupportLevel(skillDeliveryCapability.supportLevel, locale)} / ${renderSkillDeliveryPath(skillDeliveryCapability.recommendedPath, locale)}`}
                    </li>
                    <li>
                      {localize(locale, "宿主机 Prompt", "Host Prompt File")}:{" "}
                      {promptPreview?.promptPath ??
                        promptImportPreview?.promptPath ??
                        localize(locale, "无可用预览", "No Preview")}
                    </li>
                    <li>
                      {promptPreview === null
                        ? localize(locale, "还没有 Prompt 下发预览。", "Prompt rollout preview is not available yet.")
                        : promptPreview.applyReady
                          ? localize(locale, "当前 Prompt 可直接下发到宿主机。", "The current prompt can be published to the host.")
                          : localize(locale, "当前 Prompt 选择链路还不能直接下发。", "The current prompt selection chain is not ready to publish.")}
                    </li>
                    {promptPreview?.ignoredSkillId ? (
                      <li>
                        {localize(
                          locale,
                          `Skill ${promptPreview.ignoredSkillId} 仍保持代理侧注入，宿主机文件只会写入 Prompt 本体。`,
                          `Skill ${promptPreview.ignoredSkillId} remains proxy-only, so only the prompt itself will be written to the host file.`
                        )}
                      </li>
                    ) : null}
                    {skillDeliveryCapability !== null ? (
                      <li>{skillDeliveryCapability.reason}</li>
                    ) : null}
                    {promptImportPreview?.status === "ready-create" ? (
                      <li>
                        {localize(
                          locale,
                          "宿主机文件里有未归档 Prompt，建议先导入再覆盖。",
                          "The host file contains unarchived prompt content. Import it before overwriting."
                        )}
                      </li>
                    ) : null}
                    {promptSyncState ? (
                      <li>
                        {localize(locale, "最近已下发", "Last Applied")}: {promptSyncState.lastAppliedAt}
                      </li>
                    ) : null}
                  </ul>
                  <div className="quick-action-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onImportPromptFromHost(appCode)}
                      disabled={disabled}
                      data-testid={buildQuickPromptImportButtonTestId(appCode)}
                    >
                      {localize(locale, "导入宿主机 Prompt", "Import Host Prompt")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyPromptHostSync(appCode)}
                      disabled={disabled || promptPreview === null || !promptPreview.applyReady}
                      data-testid={buildQuickPromptPublishButtonTestId(appCode)}
                    >
                      {localize(locale, "发布 Prompt", "Publish Prompt")}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onRollbackPromptHostSync(appCode)}
                      disabled={disabled || promptSyncState === null}
                      data-testid={buildQuickPromptRollbackButtonTestId(appCode)}
                    >
                      {localize(locale, "回滚 Prompt", "Rollback Prompt")}
                    </button>
                  </div>
                  <QuickContextAssetWorkbench
                    appCode={appCode}
                    locale={locale}
                    disabled={disabled}
                    initialPromptContent={
                      effectiveContext?.promptTemplate.content ??
                      existingQuickPrompt?.content ??
                      null
                    }
                    initialSkillContent={
                      effectiveContext?.skill.content ??
                      existingQuickSkill?.content ??
                      null
                    }
                    bindingExists={binding !== null}
                    onRefreshSnapshot={onRefreshSnapshot}
                    onApplied={onQuickContextApplied}
                  />
                </div>

                <div className={`quick-asset-section risk-${mcpRiskLevel}`}>
                  <div className="quick-asset-section-header">
                    <strong>MCP</strong>
                    <span>{renderRiskLevel(locale, mcpRiskLevel)}</span>
                  </div>
                  <ul className="governance-suggestion-list">
                    <li>
                      {localize(locale, "当前运行态", "Runtime Status")}:{" "}
                      {mcpRuntimeView?.status ?? localize(locale, "未知", "Unknown")}
                    </li>
                    <li>
                      {localize(locale, "运行态问题数", "Runtime Issues")}:{" "}
                      {mcpRuntimeView?.issueCodes.length ?? 0}
                    </li>
                    <li>
                      {localize(locale, "宿主机托管路径", "Managed Host File")}:{" "}
                      {mcpPreview?.configPath ??
                        mcpSyncState?.configPath ??
                        localize(locale, "无可用预览", "No Preview")}
                    </li>
                    <li>
                      {governancePreview === null
                        ? localize(locale, "还没有治理预检结果。", "Governance preview is not available yet.")
                        : governancePreview.plannedActions.length > 0
                          ? localize(
                              locale,
                              `当前还有 ${governancePreview.plannedActions.length} 个治理动作待执行。`,
                              `${governancePreview.plannedActions.length} governance action(s) are still pending.`
                            )
                          : localize(locale, "当前没有明显 MCP 治理动作待执行。", "No obvious MCP governance action is pending.")}
                    </li>
                    {hasMcpHostDiff(mcpPreview) ? (
                      <li>
                        {localize(
                          locale,
                          `宿主机将新增 ${mcpPreview?.addedServerIds.length ?? 0} 个、移除 ${mcpPreview?.removedServerIds.length ?? 0} 个 MCP server。`,
                          `Host sync will add ${mcpPreview?.addedServerIds.length ?? 0} and remove ${mcpPreview?.removedServerIds.length ?? 0} MCP server(s).`
                        )}
                      </li>
                    ) : null}
                    {mcpRuntimeView?.hostState.drifted ? (
                      <li>
                        {localize(
                          locale,
                          "当前宿主机 MCP 托管配置已经漂移，控制台和落地文件不一致。",
                          "The managed host MCP config has drifted and no longer matches the console state."
                        )}
                      </li>
                    ) : null}
                    {mcpSyncState ? (
                      <li>
                        {localize(locale, "最近已下发", "Last Applied")}: {mcpSyncState.lastAppliedAt}
                      </li>
                    ) : null}
                    <li>
                      {localize(locale, "自动验证状态", "Auto Verification Status")}:{" "}
                      {mcpVerificationPlan.verificationStatusLabel}
                    </li>
                    <li>
                      {localize(locale, "当前验证结论", "Current Verification Verdict")}:{" "}
                      {mcpVerificationPlan.verificationStatusSummary}
                    </li>
                    {latestVerificationBaseline ? (
                      <li>
                        {localize(locale, "最近治理基线", "Latest Governance Baseline")}:{" "}
                        {latestVerificationBaseline.baselineSourceLabel}
                        {" / "}
                        {formatDateTime(latestVerificationBaseline.baselineAt)}
                      </li>
                    ) : null}
                    {previousVerificationBaseline ? (
                      <li>
                        {localize(locale, "上一轮收尾", "Previous Cycle Verdict")}:{" "}
                        {previousVerificationBaseline.baselineSourceLabel}
                        {" / "}
                        {previousVerificationBaseline.verificationStatusLabel}
                      </li>
                    ) : null}
                    {latestVerificationBaseline === null && mcpVerificationPlan.verificationBaselineAt ? (
                      <li>
                        {localize(locale, "最近治理基线", "Latest Governance Baseline")}:{" "}
                        {formatDateTime(mcpVerificationPlan.verificationBaselineAt)}
                      </li>
                    ) : null}
                    {mcpVerificationPlan.latestSuccessAt ? (
                      <li>
                        {localize(locale, "最近成功请求", "Latest Successful Request")}:{" "}
                        {formatDateTime(mcpVerificationPlan.latestSuccessAt)}
                      </li>
                    ) : null}
                    {mcpVerificationPlan.latestFailureAt ? (
                      <li>
                        {localize(locale, "最近失败请求", "Latest Failed Request")}:{" "}
                        {formatDateTime(mcpVerificationPlan.latestFailureAt)}
                      </li>
                    ) : null}
                    {mcpVerificationPlan.checkpoints.slice(0, 2).map((item) => (
                      <li key={`${appCode}-${item.id}`}>
                        {item.label}: {item.value}
                      </li>
                    ))}
                  </ul>
                  <div className="quick-action-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onImportMcpFromHost(appCode)}
                      disabled={disabled}
                    >
                      {localize(locale, "导入宿主机 MCP", "Import Host MCP")}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onRepairMcpGovernance(appCode)}
                      disabled={disabled || governancePreview === null || governancePreview.plannedActions.length === 0}
                    >
                      {localize(locale, "先修治理", "Repair Governance")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyMcpHostSync(appCode)}
                      disabled={disabled || mcpPreview === null}
                    >
                      {localize(locale, "发布 MCP", "Publish MCP")}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onRollbackMcpHostSync(appCode)}
                      disabled={disabled || mcpSyncState === null}
                    >
                      {localize(locale, "回滚 MCP", "Rollback MCP")}
                    </button>
                  </div>
                  <ul className="governance-suggestion-list">
                    {mcpVerificationPlan.nextActions.slice(0, 2).map((item) => (
                      <li key={`${appCode}-mcp-next-${item}`}>{item}</li>
                    ))}
                  </ul>
                  <div className="quick-action-row">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onOpenMcpRuntime(appCode)}
                    >
                      {localize(locale, "查看 Runtime", "Open Runtime")}
                    </button>
                    {(mcpVerificationPlan.hasRuntimeIssues || mcpVerificationPlan.needsHostSync) && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={onOpenMcpForms}
                      >
                        {localize(locale, "回到 MCP 修复区", "Back To MCP Repair")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onOpenMcpVerificationHistory(appCode)}
                    >
                      {localize(locale, "查看基线历史", "Open Baselines")}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => onOpenMcpAudit(appCode)}
                    >
                      {localize(locale, "聚焦 MCP 审计", "Focus MCP Audit")}
                    </button>
                    {(mcpVerificationPlan.needsTrafficVerification || mcpVerificationPlan.level === "low") && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => onOpenTraffic(appCode)}
                      >
                        {localize(locale, "验证真实请求", "Validate Live Requests")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
