import type { ConfigImpactPreview } from "cc-switch-web-shared";

const renderImpactRiskLevel = (
  riskLevel: ConfigImpactPreview["riskLevel"],
  t: (
    key:
      | "dashboard.impact.risk.low"
      | "dashboard.impact.risk.medium"
      | "dashboard.impact.risk.high"
  ) => string
): string => {
  switch (riskLevel) {
    case "low":
      return t("dashboard.impact.risk.low");
    case "medium":
      return t("dashboard.impact.risk.medium");
    case "high":
      return t("dashboard.impact.risk.high");
  }
};

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

type ConfigImpactSummaryProps = {
  readonly impact: ConfigImpactPreview;
  readonly t: (
    key:
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
  ) => string;
};

export const ConfigImpactSummary = ({ impact, t }: ConfigImpactSummaryProps): JSX.Element => (
  <>
    <p>
      {t("dashboard.impact.summary")}: {joinPreviewValues(impact.summary, t("common.notFound"))}
    </p>
    <p>
      {t("dashboard.impact.affectedApps")}:{" "}
      {joinPreviewValues(impact.affectedAppCodes, t("common.notFound"))}
    </p>
    <p>
      {t("dashboard.impact.requiresSnapshot")}:{" "}
      {impact.requiresSnapshot ? t("common.enabled") : t("common.disabled")}
    </p>
    <p>
      {t("dashboard.impact.requiresProxyReload")}:{" "}
      {impact.requiresProxyReload ? t("common.enabled") : t("common.disabled")}
    </p>
    <p>
      {t("dashboard.impact.touchesRouting")}:{" "}
      {impact.touchesRouting ? t("common.enabled") : t("common.disabled")}
    </p>
    <p>
      {t("dashboard.impact.touchesHostManagedMcp")}:{" "}
      {impact.touchesHostManagedMcp ? t("common.enabled") : t("common.disabled")}
    </p>
    <p>
      {t("dashboard.impact.riskLevel")}: {renderImpactRiskLevel(impact.riskLevel, t)}
    </p>
  </>
);
