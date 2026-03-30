import type {
  AppBindingRoutingPreview,
  FailoverChainRoutingPreview,
  LocaleCode,
  ProviderRoutingPreview
} from "cc-switch-web-shared";

import { buildRoutingPreviewPrimaryCause } from "./buildRoutingPrimaryCause.js";

type RoutingExecutionSummary = {
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly suggestions: string[];
};

export const buildRoutingExecutionSummary = (
  preview: ProviderRoutingPreview | AppBindingRoutingPreview | FailoverChainRoutingPreview,
  locale: LocaleCode
): RoutingExecutionSummary => {
  const cause = buildRoutingPreviewPrimaryCause(preview, locale);
  return {
    level: cause.level,
    summary: cause.summary,
    suggestions: [...cause.suggestions]
  };
};
