import type { ConfigDeletePreview } from "cc-switch-web-shared";

import { ConfigImpactSummary } from "./ConfigImpactSummary.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";
import type { LocaleCode } from "cc-switch-web-shared";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const buildDeleteNotice = (
  locale: LocaleCode,
  preview: ConfigDeletePreview
) => ({
  level:
    preview.blockers.length > 0
      ? "high"
      : preview.impact.riskLevel,
  summary:
    preview.blockers.length > 0
      ? localize(
          locale,
          "当前删除动作仍存在阻断项，先解除引用链或风险源，再继续执行删除。",
          "This deletion is still blocked. Clear the reference chain or risk source before continuing."
        )
      : localize(
          locale,
          "删除前先确认引用链、受影响应用和恢复路径，避免把局部清理演变成运行面故障。",
          "Before deleting, confirm references, impacted apps, and the recovery path so cleanup does not turn into a runtime incident."
        ),
  suggestions:
    preview.blockers.length > 0
      ? [
          ...preview.blockers.map((item) => joinDashboardWarnings([item], locale, item)),
          localize(
            locale,
            "优先处理阻断项，再重新生成删除预检。",
            "Resolve the blocking items first, then regenerate the delete preview."
          )
        ]
      : [
          localize(
            locale,
            `重点关注受影响应用：${joinPreviewValues(preview.impact.affectedAppCodes, "none")}。`,
            `Focus on impacted apps: ${joinPreviewValues(preview.impact.affectedAppCodes, "none")}.`
          ),
          localize(
            locale,
            "执行后优先检查运行态和请求面，确认删除没有造成新的缺口。",
            "After deletion, inspect runtime and request signals first to confirm the deletion did not create new gaps."
          )
        ]
});

const buildDeleteRunbook = (
  locale: LocaleCode,
  preview: ConfigDeletePreview
): string[] => {
  const targetLabel = renderDeleteReviewTargetType(preview.targetType, (key) => {
    const mapping: Record<typeof key, string> = {
      "dashboard.deleteReview.target.provider": localize(locale, "Provider", "Provider"),
      "dashboard.deleteReview.target.binding": localize(locale, "应用绑定", "App Binding"),
      "dashboard.deleteReview.target.appQuota": localize(locale, "应用配额", "App Quota"),
      "dashboard.deleteReview.target.failoverChain": localize(locale, "故障转移链", "Failover Chain"),
      "dashboard.deleteReview.target.promptTemplate": localize(locale, "Prompt 模板", "Prompt Template"),
      "dashboard.deleteReview.target.skill": localize(locale, "Skill", "Skill"),
      "dashboard.deleteReview.target.workspace": localize(locale, "工作区", "Workspace"),
      "dashboard.deleteReview.target.session": localize(locale, "会话", "Session"),
      "dashboard.deleteReview.target.mcpServer": localize(locale, "MCP Server", "MCP Server"),
      "dashboard.deleteReview.target.mcpAppBinding": localize(locale, "MCP 应用绑定", "MCP App Binding")
    };
    return mapping[key];
  });

  return [
    localize(
      locale,
      `先确认 ${targetLabel} 的引用链已经收敛，尤其是 warning / blocker 中提到的对象。`,
      `First confirm the ${targetLabel} reference chain has converged, especially the objects named in warnings or blockers.`
    ),
    localize(
      locale,
      "再核对受影响应用和路由面，确认不会把 managed 流量直接打空。",
      "Then verify impacted apps and routing so managed traffic is not left without a path."
    ),
    preview.impact.touchesHostManagedMcp
      ? localize(
          locale,
          "删除后立即检查宿主机 MCP 同步状态，确认没有留下漂移或失效绑定。",
          "After deletion, inspect host MCP sync immediately and confirm no drift or broken bindings remain."
        )
      : localize(
          locale,
          "删除后查看运行态与请求日志，确认没有出现新的拒绝、超时或故障转移尖峰。",
          "After deletion, inspect runtime and request logs for new rejections, timeouts, or failover spikes."
        )
  ];
};

const buildDeleteValidationChecklist = (
  locale: LocaleCode,
  preview: ConfigDeletePreview
): string[] => {
  const items = [
    localize(
      locale,
      "被删对象不再出现在对应治理列表，且关联对象没有残留孤儿引用。",
      "The deleted object no longer appears in the governance list, and linked objects have no orphaned references."
    ),
    preview.impact.touchesRouting
      ? localize(
          locale,
          "相关应用的 binding / failover 仍然可执行，没有出现 no-binding 或 no-routable-provider。",
          "Related app binding and failover remain executable, with no no-binding or no-routable-provider states."
        )
      : localize(
          locale,
          "运行时主链没有新增阻塞，健康状态和请求成功率保持稳定。",
          "The main runtime path has no new blockers, and health plus request success remain stable."
        )
  ];

  if (preview.impact.touchesHostManagedMcp) {
    items.push(
      localize(
        locale,
        "MCP runtime 中没有新增 host drift、missing server 或 duplicate binding。",
        "MCP runtime shows no new host drift, missing server, or duplicate binding issues."
      )
    );
  }

  return items;
};

const renderDeleteReviewTargetType = (
  targetType: ConfigDeletePreview["targetType"],
  t: (
    key:
      | "dashboard.deleteReview.target.provider"
      | "dashboard.deleteReview.target.binding"
      | "dashboard.deleteReview.target.appQuota"
      | "dashboard.deleteReview.target.failoverChain"
      | "dashboard.deleteReview.target.promptTemplate"
      | "dashboard.deleteReview.target.skill"
      | "dashboard.deleteReview.target.workspace"
      | "dashboard.deleteReview.target.session"
      | "dashboard.deleteReview.target.mcpServer"
      | "dashboard.deleteReview.target.mcpAppBinding"
  ) => string
): string => {
  switch (targetType) {
    case "provider":
      return t("dashboard.deleteReview.target.provider");
    case "binding":
      return t("dashboard.deleteReview.target.binding");
    case "app-quota":
      return t("dashboard.deleteReview.target.appQuota");
    case "failover-chain":
      return t("dashboard.deleteReview.target.failoverChain");
    case "prompt-template":
      return t("dashboard.deleteReview.target.promptTemplate");
    case "skill":
      return t("dashboard.deleteReview.target.skill");
    case "workspace":
      return t("dashboard.deleteReview.target.workspace");
    case "session":
      return t("dashboard.deleteReview.target.session");
    case "mcp-server":
      return t("dashboard.deleteReview.target.mcpServer");
    case "mcp-app-binding":
      return t("dashboard.deleteReview.target.mcpAppBinding");
  }
};

type DeleteReviewPanelProps = {
  readonly review: {
    readonly kind: ConfigDeletePreview["targetType"];
    readonly id: string;
    readonly preview: ConfigDeletePreview;
  };
  readonly isWorking: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly locale: LocaleCode;
  readonly t: (
    key:
      | "dashboard.deleteReview.title"
      | "dashboard.deleteReview.targetType"
      | "dashboard.deleteReview.targetId"
      | "dashboard.deleteReview.warnings"
      | "dashboard.deleteReview.blockers"
      | "dashboard.deleteReview.confirm"
      | "dashboard.deleteReview.cancel"
      | "dashboard.deleteReview.blockedHint"
      | "dashboard.deleteReview.target.provider"
      | "dashboard.deleteReview.target.binding"
      | "dashboard.deleteReview.target.appQuota"
      | "dashboard.deleteReview.target.failoverChain"
      | "dashboard.deleteReview.target.promptTemplate"
      | "dashboard.deleteReview.target.skill"
      | "dashboard.deleteReview.target.workspace"
      | "dashboard.deleteReview.target.session"
      | "dashboard.deleteReview.target.mcpServer"
      | "dashboard.deleteReview.target.mcpAppBinding"
      | "dashboard.impact.summary"
      | "dashboard.impact.affectedApps"
      | "dashboard.impact.requiresSnapshot"
      | "dashboard.impact.requiresProxyReload"
      | "dashboard.impact.touchesRouting"
      | "dashboard.impact.touchesHostManagedMcp"
      | "dashboard.impact.riskLevel"
      | "dashboard.impact.risk.low"
      | "dashboard.impact.risk.medium"
      | "dashboard.impact.risk.high"
      | "common.enabled"
      | "common.disabled"
      | "common.notFound"
      | "dashboard.workspace.noWarnings"
  ) => string;
};

export const DeleteReviewPanel = ({
  review,
  isWorking,
  onConfirm,
  onCancel,
  locale,
  t
}: DeleteReviewPanelProps): JSX.Element => {
  const deleteRunbook = buildDeleteRunbook(locale, review.preview);
  const deleteValidationChecklist = buildDeleteValidationChecklist(locale, review.preview);

  return (
    <section className="panel">
      <h2>{t("dashboard.deleteReview.title")}</h2>
      <p>
        {t("dashboard.deleteReview.targetType")}:{" "}
        {renderDeleteReviewTargetType(review.preview.targetType, t)}
      </p>
      <p>
        {t("dashboard.deleteReview.targetId")}: <code>{review.id}</code>
      </p>
      <GovernanceNoticeCard notice={buildDeleteNotice(locale, review.preview)} locale={locale} />
      <div className="preview-summary-grid">
        <div className="preview-summary-tile">
          <strong>{review.preview.blockers.length}</strong>
          <span>{localize(locale, "阻断项", "Blockers")}</span>
        </div>
        <div className="preview-summary-tile">
          <strong>{review.preview.warnings.length}</strong>
          <span>{localize(locale, "预警项", "Warnings")}</span>
        </div>
        <div className={`preview-summary-tile risk-${review.preview.impact.riskLevel}`}>
          <strong>{t(`dashboard.impact.risk.${review.preview.impact.riskLevel}` as never)}</strong>
          <span>{localize(locale, "执行风险", "Execution Risk")}</span>
        </div>
        <div className="preview-summary-tile">
          <strong>{review.preview.impact.affectedAppCodes.length}</strong>
          <span>{localize(locale, "受影响应用", "Impacted Apps")}</span>
        </div>
      </div>
      <p>
        {t("dashboard.deleteReview.warnings")}:{" "}
        {joinDashboardWarnings(review.preview.warnings, locale, t("dashboard.workspace.noWarnings"))}
      </p>
      <p>
        {t("dashboard.deleteReview.blockers")}:{" "}
        {joinDashboardWarnings(review.preview.blockers, locale, t("dashboard.workspace.noWarnings"))}
      </p>
      <div className="operation-guide-grid">
        <div className="preview-item">
          <strong>{localize(locale, "执行后应验证", "Validate After Deletion")}</strong>
          <ul className="operation-checklist">
            {deleteValidationChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="preview-item">
          <strong>{localize(locale, "推荐检查顺序", "Recommended Check Order")}</strong>
          <ol className="operation-checklist ordered">
            {deleteRunbook.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </div>
      <ConfigImpactSummary impact={review.preview.impact} t={t} />
      {review.preview.blockers.length > 0 ? (
        <p className="form-hint">{t("dashboard.deleteReview.blockedHint")}</p>
      ) : null}
      <div className="button-row">
        <button
          className="inline-action danger"
          type="button"
          disabled={isWorking || review.preview.blockers.length > 0}
          onClick={onConfirm}
        >
          {t("dashboard.deleteReview.confirm")}
        </button>
        <button className="inline-action" type="button" disabled={isWorking} onClick={onCancel}>
          {t("dashboard.deleteReview.cancel")}
        </button>
      </div>
    </section>
  );
};
