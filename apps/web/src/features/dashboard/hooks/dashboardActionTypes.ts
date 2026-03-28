import type { AppBinding } from "@cc-switch-web/shared";

import type { DashboardFollowUpNotice } from "../lib/dashboardFollowUp.js";

export type DashboardActionLocale = "zh-CN" | "en-US";

export type DashboardActionAuditFilters = {
  readonly source?: "host-integration" | "provider-health" | "proxy-request" | "mcp" | "quota";
  readonly appCode?: AppBinding["appCode"];
  readonly providerId?: string;
  readonly level?: "info" | "warn" | "error";
};

export type DashboardActionRunAction = (
  task: () => Promise<void>,
  successMessage: string
) => void;

export type DashboardActionSetFollowUpNotice = (
  value: DashboardFollowUpNotice | null
) => void;

export type DashboardActionOpenAuditFocus = (
  filters: DashboardActionAuditFilters
) => void;

export const localizeDashboardAction = (
  locale: DashboardActionLocale,
  zhCN: string,
  enUS: string
): string => (locale === "zh-CN" ? zhCN : enUS);
