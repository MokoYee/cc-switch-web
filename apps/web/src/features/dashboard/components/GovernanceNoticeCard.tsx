import type { LocaleCode } from "@cc-switch-web/shared";

import type { GovernanceNotice } from "../lib/buildGovernanceNotice.js";

type GovernanceNoticeCardProps = {
  readonly notice: GovernanceNotice;
  readonly locale: LocaleCode;
};

const localize = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const renderLevelLabel = (
  level: GovernanceNotice["level"],
  locale: LocaleCode
): string => {
  if (level === "high") {
    return localize(locale, "高风险", "High Risk");
  }
  if (level === "medium") {
    return localize(locale, "需注意", "Needs Review");
  }
  return localize(locale, "较稳定", "Looks Stable");
};

export const GovernanceNoticeCard = ({
  notice,
  locale
}: GovernanceNoticeCardProps): JSX.Element => (
  <div className={`governance-notice governance-${notice.level}`}>
    <div className="governance-notice-header">
      <strong>{localize(locale, "操作建议", "Recommended Next Step")}</strong>
      <span className="governance-notice-badge">{renderLevelLabel(notice.level, locale)}</span>
    </div>
    <p>{notice.summary}</p>
    <ul className="governance-suggestion-list">
      {notice.suggestions.map((item) => (
        <li key={`${notice.level}-${item}`}>{item}</li>
      ))}
    </ul>
  </div>
);
