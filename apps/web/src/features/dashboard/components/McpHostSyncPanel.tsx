import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type {
  AppBinding,
  McpVerificationHistoryPage,
  McpGovernanceRepairPlanItem,
  McpGovernanceRepairPreview,
  McpHostSyncPreview,
  McpImportOptions,
  McpImportPreview
} from "cc-switch-web-shared";

import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildMcpGovernanceEntries } from "../lib/buildMcpGovernanceEntries.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";
import { buildMcpHostSyncNotice } from "../lib/buildGovernanceNotice.js";
import { buildMcpBatchHostSyncSummary } from "../lib/buildMcpConflictInsights.js";
import {
  buildMcpGovernanceBatchSummary,
  buildMcpGovernanceDiffSummary
} from "../lib/buildMcpGovernanceSummaries.js";
import {
  buildMcpVerificationBatchSummary,
  buildMcpVerificationPlan
} from "../lib/buildMcpVerificationPlan.js";
import { buildMcpVerificationHistory } from "../lib/buildMcpVerificationHistory.js";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

const unique = <T,>(items: readonly T[]): T[] => Array.from(new Set(items));

const hasMaterialHostSyncDiff = (preview: McpHostSyncPreview | null | undefined): boolean =>
  preview !== null &&
  preview !== undefined &&
  (preview.addedServerIds.length > 0 ||
    preview.removedServerIds.length > 0 ||
    (!preview.configExists && preview.nextManagedServerIds.length > 0));

const formatDateTime = (value: string): string =>
  value.replace("T", " ").replace(".000Z", "Z");

const renderMcpHostSyncLevel = (
  capability: DashboardSnapshot["mcpHostSyncCapabilities"][number],
  t: (
    key:
      | "dashboard.mcp.host.level.managed"
      | "dashboard.mcp.host.level.planned"
      | "dashboard.mcp.host.level.unsupported"
  ) => string
): string => {
  if (capability.supportLevel === "managed") {
    return t("dashboard.mcp.host.level.managed");
  }
  if (capability.supportLevel === "unsupported") {
    return t("dashboard.mcp.host.level.unsupported");
  }
  return t("dashboard.mcp.host.level.planned");
};

const renderMcpRuntimeStatus = (
  status: DashboardSnapshot["mcpRuntimeViews"][number]["status"],
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

const renderMcpChangedField = (
  field: McpImportPreview["items"][number]["changedFields"][number],
  t: (
    key:
      | "dashboard.mcp.changedField.transport"
      | "dashboard.mcp.changedField.command"
      | "dashboard.mcp.changedField.args"
      | "dashboard.mcp.changedField.url"
      | "dashboard.mcp.changedField.env"
      | "dashboard.mcp.changedField.headers"
      | "dashboard.mcp.changedField.enabled"
  ) => string
): string => {
  switch (field) {
    case "transport":
      return t("dashboard.mcp.changedField.transport");
    case "command":
      return t("dashboard.mcp.changedField.command");
    case "args":
      return t("dashboard.mcp.changedField.args");
    case "url":
      return t("dashboard.mcp.changedField.url");
    case "env":
      return t("dashboard.mcp.changedField.env");
    case "headers":
      return t("dashboard.mcp.changedField.headers");
    case "enabled":
      return t("dashboard.mcp.changedField.enabled");
  }

  return t("dashboard.mcp.changedField.transport");
};

const renderMcpPreviewStatus = (
  status: McpImportPreview["items"][number]["status"],
  t: (
    key:
      | "dashboard.mcp.previewStatus.new"
      | "dashboard.mcp.previewStatus.update"
      | "dashboard.mcp.previewStatus.skipExisting"
      | "dashboard.mcp.previewStatus.bindingOnly"
  ) => string
): string => {
  if (status === "new") {
    return t("dashboard.mcp.previewStatus.new");
  }
  if (status === "update") {
    return t("dashboard.mcp.previewStatus.update");
  }
  if (status === "skip-existing") {
    return t("dashboard.mcp.previewStatus.skipExisting");
  }
  return t("dashboard.mcp.previewStatus.bindingOnly");
};

const renderMcpPreviewBindingStatus = (
  status: McpImportPreview["items"][number]["bindingStatus"],
  t: (
    key:
      | "dashboard.mcp.previewBindingStatus.create"
      | "dashboard.mcp.previewBindingStatus.alreadyEnabled"
  ) => string
): string =>
  status === "create"
    ? t("dashboard.mcp.previewBindingStatus.create")
    : t("dashboard.mcp.previewBindingStatus.alreadyEnabled");

const renderMcpImportDiffValue = (
  value: string | null,
  t: (key: "common.notFound") => string
): string => value ?? t("common.notFound");

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const buildMcpSummaryTileTestId = (name: string): string => `mcp-host-sync-summary-${name}`;
const buildMcpCapabilityCardTestId = (appCode: AppBinding["appCode"]): string =>
  `mcp-host-sync-card-${appCode}`;
const buildMcpDangerConfirmTestId = (appCode: AppBinding["appCode"]): string =>
  `mcp-host-sync-danger-confirm-${appCode}`;
const buildMcpApplyButtonTestId = (appCode: AppBinding["appCode"]): string =>
  `mcp-host-sync-apply-button-${appCode}`;
const buildMcpRollbackButtonTestId = (appCode: AppBinding["appCode"]): string =>
  `mcp-host-sync-rollback-button-${appCode}`;
const buildMcpImportPreviewButtonTestId = (appCode: AppBinding["appCode"]): string =>
  `mcp-import-preview-button-${appCode}`;
const buildMcpImportButtonTestId = (appCode: AppBinding["appCode"]): string =>
  `mcp-import-button-${appCode}`;
const buildMcpImportPreviewCardTestId = (appCode: string): string =>
  `mcp-import-preview-card-${appCode}`;
const buildMcpImportPreviewItemTestId = (appCode: string, serverId: string): string =>
  `mcp-import-preview-item-${appCode}-${serverId}`;

const renderGovernanceActionTitle = (
  action: McpGovernanceRepairPlanItem["action"],
  locale: "zh-CN" | "en-US"
): string => {
  if (action === "disable-duplicate-bindings") {
    return localize(locale, "停用重复 Binding", "Disable Duplicate Bindings");
  }
  if (action === "disable-invalid-bindings") {
    return localize(locale, "停用失效 Binding", "Disable Invalid Bindings");
  }
  return localize(locale, "启用被引用 Server", "Enable Referenced Servers");
};

const renderGovernanceActionSummary = (
  item: McpGovernanceRepairPlanItem,
  locale: "zh-CN" | "en-US"
): string => {
  if (item.action === "disable-duplicate-bindings") {
    return localize(
      locale,
      `将停用 ${item.bindingIds.length} 条重复启用的 Binding，先把运行时目标收敛为唯一入口。`,
      `${item.bindingIds.length} duplicate enabled binding(s) will be disabled to converge the runtime path to a single target.`
    );
  }
  if (item.action === "disable-invalid-bindings") {
    return localize(
      locale,
      `将停用 ${item.bindingIds.length} 条失效 Binding，避免缺失 Server 或不完整配置继续进入运行态。`,
      `${item.bindingIds.length} invalid binding(s) will be disabled so missing servers or incomplete configs stop leaking into runtime.`
    );
  }
  return localize(
    locale,
    `将重新启用 ${item.serverIds.length} 个被当前 Binding 引用但处于停用状态的 Server。`,
    `${item.serverIds.length} currently referenced server(s) will be re-enabled.`
  );
};

const buildRuntimeRepairNotice = (
  runtimeView: DashboardSnapshot["mcpRuntimeViews"][number],
  locale: "zh-CN" | "en-US"
): {
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly suggestions: string[];
} => {
  if (runtimeView.hostState.drifted) {
    return {
      level: "high",
      summary: localize(
        locale,
        "宿主机上的 MCP 托管配置已经漂移，当前控制台配置与落地文件不再一致。",
        "The managed MCP config on the host has drifted and no longer matches the console state."
      ),
      suggestions: [
        localize(locale, "先预览 host sync 变更，确认哪些服务器将被新增、保留或移除。", "Preview the host sync diff first to confirm which servers will be added, kept, or removed."),
        localize(locale, "如果漂移来自手工修改，先把控制台数据修正到目标状态，再重新 apply。", "If the drift came from manual edits, reconcile the console state first and then apply again."),
        localize(locale, "不要在未确认移除项之前直接覆盖宿主机配置。", "Do not overwrite host configuration before confirming the removals.")
      ]
    };
  }

  if (runtimeView.issueCodes.includes("duplicate-binding")) {
    return {
      level: "high",
      summary: localize(
        locale,
        "同一应用存在重复 MCP Binding，运行时目标不再唯一。",
        "This app has duplicate MCP bindings, so the runtime target is no longer unique."
      ),
      suggestions: [
        localize(locale, "先收敛重复 Binding，只保留一条主绑定链路。", "Reduce duplicate bindings and keep a single primary binding path."),
        localize(locale, "如果多个 server 都要保留，请通过不同 app 或场景拆开，而不是叠在同一 binding。", "If multiple servers must remain, split them by app or scenario instead of stacking them on the same binding."),
        localize(locale, "修复后重新看 runtime issue code，确认 duplicate-binding 已消失。", "Check the runtime issue codes again after the fix to confirm duplicate-binding is gone.")
      ]
    };
  }

  if (runtimeView.issueCodes.includes("missing-server") || runtimeView.issueCodes.includes("server-disabled")) {
    return {
      level: "high",
      summary: localize(
        locale,
        "当前有 MCP Binding 指向不存在或已停用的 server，接入链路并未闭合。",
        "A MCP binding currently points to a missing or disabled server, so the integration path is incomplete."
      ),
      suggestions: [
        localize(locale, "先定位缺失或停用的 server，决定是恢复它还是把 binding 改到现有 server。", "Locate the missing or disabled server first and decide whether to restore it or repoint the binding."),
        localize(locale, "不要只修 host sync；根因通常在控制台配置本身。", "Do not fix only the host sync; the root cause is usually in the console config itself."),
        localize(locale, "修复后再回到 host sync，确认宿主机托管配置是否还需要更新。", "Return to host sync after the fix and confirm whether the managed host config still needs to be updated.")
      ]
    };
  }

  if (runtimeView.issueCodes.includes("missing-command") || runtimeView.issueCodes.includes("missing-url")) {
    return {
      level: "medium",
      summary: localize(
        locale,
        "当前 MCP server 配置不完整，运行时无法稳定启动或连接。",
        "The MCP server configuration is incomplete, so the runtime cannot start or connect reliably."
      ),
      suggestions: [
        localize(locale, "stdio transport 需要 command，http transport 需要 url。", "A stdio transport requires a command, and a http transport requires a url."),
        localize(locale, "优先把 server 配置补完整，再考虑导入或 host sync。", "Complete the server configuration first before importing or running host sync."),
        localize(locale, "如果只是临时模板，保存前先停用它，避免进入运行态后继续报错。", "If this is only a draft template, disable it before saving to avoid continued runtime errors.")
      ]
    };
  }

  return {
    level: runtimeView.status === "healthy" ? "low" : "medium",
    summary: localize(
      locale,
      "当前 MCP 运行态没有明显阻断项，可以继续做宿主机同步或导入预览。",
      "There is no obvious MCP blocker right now. You can continue with host sync or import preview."
    ),
    suggestions: [
      localize(locale, "先看 runtime issue code 是否为空，再决定是否 apply。", "Check that the runtime issue code list is empty before applying."),
      localize(locale, "如果宿主机最近被手工改过，仍建议先做一次 preview。", "If the host was edited manually recently, it is still safer to run a preview first."),
      localize(locale, "对外开放前，确认所有启用的 server 都有明确 command 或 url。", "Before broader rollout, confirm every enabled server has a clear command or url.")
    ]
  };
};

type McpHostSyncPanelProps = {
  readonly snapshot: DashboardSnapshot;
  readonly focusRequest?: {
    readonly appCode: AppBinding["appCode"];
    readonly target: "history";
    readonly nonce: number;
  } | null;
  readonly mcpImportOptions: McpImportOptions;
  readonly setMcpImportOptions: Dispatch<SetStateAction<McpImportOptions>>;
  readonly mcpHostSyncPreview: Record<string, McpHostSyncPreview | null>;
  readonly mcpGovernancePreview: Record<string, McpGovernanceRepairPreview | null>;
  readonly mcpImportPreview: Record<string, McpImportPreview | null>;
  readonly mcpVerificationHistoryByApp: Record<string, McpVerificationHistoryPage | null>;
  readonly mcpVerificationHistoryLoadingByApp: Record<string, boolean>;
  readonly mcpRuntimeViewByApp: Map<string, DashboardSnapshot["mcpRuntimeViews"][number]>;
  readonly mcpHostSyncStateByApp: Map<string, DashboardSnapshot["mcpHostSyncStates"][number]>;
  readonly isWorking: boolean;
  readonly onLoadImportPreview: (appCode: AppBinding["appCode"]) => void;
  readonly onLoadMoreVerificationHistory: (appCode: AppBinding["appCode"]) => void;
  readonly onConvergeAll: (confirmedRemovalAppCodes: readonly AppBinding["appCode"][]) => void;
  readonly onRepairGovernanceAll: () => void;
  readonly onRepairGovernance: (appCode: AppBinding["appCode"]) => void;
  readonly onImportFromHost: (appCode: AppBinding["appCode"]) => void;
  readonly onApplyHostSyncAll: () => void;
  readonly onRollbackHostSyncAll: () => void;
  readonly onApplyHostSync: (appCode: AppBinding["appCode"]) => void;
  readonly onRollbackHostSync: (appCode: AppBinding["appCode"]) => void;
  readonly onEditMcpServer: (item: DashboardSnapshot["mcpServers"][number]) => void;
  readonly onEditMcpBinding: (item: DashboardSnapshot["appMcpBindings"][number]) => void;
  readonly onOpenMcpForms: () => void;
  readonly onOpenRuntime: (appCode: AppBinding["appCode"]) => void;
  readonly onOpenAudit: (appCode: AppBinding["appCode"]) => void;
  readonly onOpenTraffic: (appCode: AppBinding["appCode"]) => void;
};

type GovernanceFilter = "all" | "high" | "host-sync" | "active-app";
type HostCapabilityFilter = "all" | "managed" | "unsupported" | "planned";
type HostCapabilityExpandedState = Record<string, boolean>;

const GOVERNANCE_FILTER_STORAGE_KEY = "ai-cli-switch.mcp-governance-filter";
const GOVERNANCE_EXPANDED_STORAGE_KEY = "ai-cli-switch.mcp-governance-expanded";
const HOST_CAPABILITY_FILTER_STORAGE_KEY = "ai-cli-switch.mcp-host-capability-filter";
const HOST_CAPABILITY_EXPANDED_STORAGE_KEY = "ai-cli-switch.mcp-host-capability-expanded";

const readStoredGovernanceFilter = (): GovernanceFilter => {
  if (typeof window === "undefined") {
    return "all";
  }

  try {
    const stored = window.sessionStorage.getItem(GOVERNANCE_FILTER_STORAGE_KEY);
    return stored === "all" ||
      stored === "high" ||
      stored === "host-sync" ||
      stored === "active-app"
      ? stored
      : "all";
  } catch {
    return "all";
  }
};

const readStoredGovernanceExpanded = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(GOVERNANCE_EXPANDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const readStoredHostCapabilityFilter = (): HostCapabilityFilter => {
  if (typeof window === "undefined") {
    return "all";
  }

  try {
    const stored = window.sessionStorage.getItem(HOST_CAPABILITY_FILTER_STORAGE_KEY);
    return stored === "all" ||
      stored === "managed" ||
      stored === "unsupported" ||
      stored === "planned"
      ? stored
      : "all";
  } catch {
    return "all";
  }
};

const readStoredHostCapabilityExpanded = (): HostCapabilityExpandedState => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const stored = window.sessionStorage.getItem(HOST_CAPABILITY_EXPANDED_STORAGE_KEY);
    if (stored === null) {
      return {};
    }

    const parsed = JSON.parse(stored) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
      )
    );
  } catch {
    return {};
  }
};

const renderHostCapabilityFilterLabel = (
  filter: HostCapabilityFilter,
  locale: "zh-CN" | "en-US"
): string => {
  if (filter === "managed") {
    return localize(locale, "仅已托管", "Managed Only");
  }
  if (filter === "unsupported") {
    return localize(locale, "仅桥接/非托管", "Bridge / Unsupported");
  }
  if (filter === "planned") {
    return localize(locale, "仅待扩展", "Planned Only");
  }
  return localize(locale, "全部生态项", "All Ecosystem Entries");
};

const renderHostRecommendedPathLabel = (
  recommendedPath: DashboardSnapshot["mcpHostSyncCapabilities"][number]["recommendedPath"],
  locale: "zh-CN" | "en-US"
): string => {
  if (recommendedPath === "managed-host-sync") {
    return localize(locale, "宿主机托管同步", "Managed Host Sync");
  }
  if (recommendedPath === "external-bridge") {
    return localize(locale, "外部桥接接入", "External Bridge");
  }
  return localize(locale, "等待稳定配置契约", "Wait For Stable Config");
};

const buildHostCapabilityRunbook = (
  capability: DashboardSnapshot["mcpHostSyncCapabilities"][number],
  locale: "zh-CN" | "en-US"
): {
  readonly summary: string;
  readonly steps: string[];
  readonly avoid: string;
} => {
  if (capability.recommendedPath === "managed-host-sync") {
    return {
      summary: localize(
        locale,
        "当前 CLI 已进入正式宿主机托管路径，控制台负责治理数据，宿主机文件负责真实落地。",
        "This CLI is on the managed host path. The console governs the data and the host files carry the real rollout."
      ),
      steps: [
        localize(locale, "先检查 runtime issue、治理预览和 host diff，确认根因在控制台还是宿主机。", "Check runtime issues, governance preview, and host diff first to identify whether the root cause is in console config or on the host."),
        localize(locale, "控制台配置收敛后，再执行 Host Sync 或回滚，而不是直接覆盖宿主机文件。", "Once console config converges, run Host Sync or rollback instead of overwriting host files blindly."),
        localize(locale, "同步完成后回看审计和真实请求，确认代理链路已经跟着恢复。", "After syncing, inspect audit events and live requests to confirm the proxy path recovered as well.")
      ],
      avoid: localize(
        locale,
        "不要在有漂移或待移除项未确认时直接 apply。",
        "Do not apply directly while host drift or unconfirmed removals still exist."
      )
    };
  }

  if (capability.recommendedPath === "external-bridge") {
    return {
      summary: localize(
        locale,
        "当前 CLI 更适合作为桥接生态接入，本项目控制台主要负责 MCP 资产治理，而不是托管写入宿主机配置。",
        "This CLI fits a bridge-based ecosystem better. The console should govern MCP assets here instead of writing managed host config."
      ),
      steps: [
        localize(locale, "继续在控制台维护 server、binding 与运行态治理，先保证资产模型本身干净。", "Keep maintaining servers, bindings, and runtime governance in the console so the asset model stays clean."),
        localize(locale, "实际接入路径跟随上游 bridge 文档，而不是套用 codex / claude-code 的宿主机同步方式。", "Follow the upstream bridge documentation for the real rollout instead of reusing the codex / claude-code host sync path."),
        localize(locale, "验证时优先看桥接层请求链路和上游生态文档，不要只盯本地配置文件。", "When validating, prioritize bridge request flow and upstream docs rather than looking only at local config files.")
      ],
      avoid: localize(
        locale,
        "不要对外承诺 openclaw 这类桥接生态已经支持宿主机文件同步。",
        "Do not claim host-managed file sync is available for bridge-first ecosystems such as OpenClaw."
      )
    };
  }

  return {
    summary: localize(
      locale,
      "当前生态位已经预留，但上游配置格式或启动契约还不稳定，现阶段应以控制台治理为主。",
      "The ecosystem slot is reserved, but upstream config or startup contracts are not stable yet, so console-side governance should remain primary."
    ),
    steps: [
      localize(locale, "先把 MCP server、binding、运行态告警和导入策略在控制台内治理清楚。", "Stabilize MCP servers, bindings, runtime warnings, and import strategy inside the console first."),
      localize(locale, "持续观察上游 CLI 的稳定配置格式，再决定是否进入正式 host sync 适配。", "Track the upstream CLI until its config format is stable before deciding on formal host-sync support."),
      localize(locale, "对外只说明‘已预留治理入口’，不要把未验证的接管方式发布为可用能力。", "Externally, describe this as a reserved governance entry point rather than shipping an unverified takeover path.")
    ],
    avoid: localize(
      locale,
      "不要为了追求覆盖面而写入猜测性的宿主机配置。",
      "Do not write speculative host configuration just to claim broader coverage."
    )
  };
};

const buildHostCapabilityNotice = (
  capability: DashboardSnapshot["mcpHostSyncCapabilities"][number],
  locale: "zh-CN" | "en-US"
): {
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly suggestions: string[];
} => {
  if (capability.recommendedPath === "managed-host-sync") {
    return {
      level: "low",
      summary: localize(
        locale,
        "当前 CLI 已进入 MCP 宿主机托管范围，可以直接走导入预览、Host Sync 与回滚闭环。",
        "This CLI is already inside the managed MCP host-sync path, so you can use import preview, host sync, and rollback directly."
      ),
      suggestions: [
        localize(locale, "先看导入预览，再确认控制台与宿主机差异。", "Review the import preview first, then confirm console-to-host differences."),
        localize(locale, "如果运行态仍有主因，先修控制台配置，再执行 Host Sync。", "If runtime still has a primary blocker, fix console configuration before running host sync.")
      ]
    };
  }

  if (capability.recommendedPath === "external-bridge") {
    return {
      level: "medium",
      summary: localize(
        locale,
        "当前 CLI 不走本项目的宿主机托管同步主链路，更适合通过外部桥接层接入 MCP。",
        "This CLI does not follow the managed host-sync path here and is better integrated through an external MCP bridge."
      ),
      suggestions: [
        localize(locale, "不要把它当成与 codex / claude-code 同类的托管文件同步目标。", "Do not treat it like the same managed file-sync target as codex or claude-code."),
        localize(locale, "先保留控制台内的 MCP 资产治理，再根据上游产品的桥接方案决定实际投放路径。", "Keep MCP asset governance in the console first, then decide the real rollout path based on the upstream bridge model.")
      ]
    };
  }

  return {
    level: "medium",
    summary: localize(
      locale,
      "当前 CLI 仍处于待扩展阶段，生态入口已预留，但还没有稳定的宿主机同步契约。",
      "This CLI is still in the planned stage. The ecosystem slot is reserved, but there is no stable host-sync contract yet."
    ),
    suggestions: [
      localize(locale, "先把 MCP server 与 binding 治理好，等待该 CLI 的稳定配置格式再接入。", "Stabilize MCP servers and bindings first, then integrate once this CLI has a stable config format."),
      localize(locale, "当前不要对外承诺宿主机同步可用。", "Do not promise host-sync availability externally yet.")
    ]
  };
};

export const McpHostSyncPanel = ({
  snapshot,
  focusRequest = null,
  mcpImportOptions,
  setMcpImportOptions,
  mcpHostSyncPreview,
  mcpGovernancePreview,
  mcpImportPreview,
  mcpVerificationHistoryByApp,
  mcpVerificationHistoryLoadingByApp,
  mcpRuntimeViewByApp,
  mcpHostSyncStateByApp,
  isWorking,
  onLoadImportPreview,
  onLoadMoreVerificationHistory,
  onConvergeAll,
  onRepairGovernanceAll,
  onRepairGovernance,
  onImportFromHost,
  onApplyHostSyncAll,
  onRollbackHostSyncAll,
  onApplyHostSync,
  onRollbackHostSync,
  onEditMcpServer,
  onEditMcpBinding,
  onOpenMcpForms,
  onOpenRuntime,
  onOpenAudit,
  onOpenTraffic
}: McpHostSyncPanelProps): JSX.Element => {
  const { t, locale } = useI18n();
  const [dangerConfirmByApp, setDangerConfirmByApp] = useState<Record<string, boolean>>({});
  const [showAllGovernanceEntries, setShowAllGovernanceEntries] =
    useState<boolean>(readStoredGovernanceExpanded);
  const [governanceFilter, setGovernanceFilter] =
    useState<GovernanceFilter>(readStoredGovernanceFilter);
  const [hostCapabilityFilter, setHostCapabilityFilter] =
    useState<HostCapabilityFilter>(readStoredHostCapabilityFilter);
  const [expandedHostCapabilities, setExpandedHostCapabilities] =
    useState<HostCapabilityExpandedState>(readStoredHostCapabilityExpanded);
  const [expandedVerificationHistoryByApp, setExpandedVerificationHistoryByApp] =
    useState<Record<string, boolean>>({});
  const capabilityRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const verificationHistoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handledFocusRequestNonceRef = useRef<number | null>(null);
  const scrolledFocusRequestNonceRef = useRef<number | null>(null);
  const governanceEntries = buildMcpGovernanceEntries(snapshot, locale);
  const governanceEntryByApp = new Map(governanceEntries.map((item) => [item.appCode, item] as const));
  const activeAppCode =
    snapshot.activeContext.sessionContext?.effectiveAppCode ??
    snapshot.activeContext.workspaceContext?.effectiveAppCode ??
    null;
  const managedCapabilities = snapshot.mcpHostSyncCapabilities.filter(
    (item) => item.supportLevel === "managed"
  );
  const unsupportedCapabilities = snapshot.mcpHostSyncCapabilities.filter(
    (item) => item.supportLevel === "unsupported"
  );
  const plannedCapabilities = snapshot.mcpHostSyncCapabilities.filter(
    (item) => item.supportLevel === "planned"
  );

  useEffect(() => {
    if (governanceFilter === "active-app" && activeAppCode === null) {
      setGovernanceFilter("all");
    }
  }, [activeAppCode, governanceFilter]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(GOVERNANCE_FILTER_STORAGE_KEY, governanceFilter);
    } catch {
      // 会话存储不可用时退化为内存态即可。
    }
  }, [governanceFilter]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(
        GOVERNANCE_EXPANDED_STORAGE_KEY,
        showAllGovernanceEntries ? "true" : "false"
      );
    } catch {
      // 会话存储不可用时退化为内存态即可。
    }
  }, [showAllGovernanceEntries]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(
        HOST_CAPABILITY_FILTER_STORAGE_KEY,
        hostCapabilityFilter
      );
    } catch {
      // 会话存储不可用时退化为内存态即可。
    }
  }, [hostCapabilityFilter]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(
        HOST_CAPABILITY_EXPANDED_STORAGE_KEY,
        JSON.stringify(expandedHostCapabilities)
      );
    } catch {
      // 会话存储不可用时退化为内存态即可。
    }
  }, [expandedHostCapabilities]);

  const filteredGovernanceEntries = governanceEntries.filter((entry) => {
    if (governanceFilter === "high") {
      return entry.governanceLevel === "high";
    }
    if (governanceFilter === "host-sync") {
      return mcpGovernancePreview[entry.appCode]?.requiresHostSync ?? false;
    }
    if (governanceFilter === "active-app") {
      return activeAppCode !== null && entry.appCode === activeAppCode;
    }
    return true;
  });
  const visibleGovernanceEntries = showAllGovernanceEntries
    ? filteredGovernanceEntries
    : filteredGovernanceEntries.slice(0, 3);
  const visibleHostCapabilities = snapshot.mcpHostSyncCapabilities.filter((capability) => {
    if (hostCapabilityFilter === "managed") {
      return capability.supportLevel === "managed";
    }
    if (hostCapabilityFilter === "unsupported") {
      return capability.supportLevel === "unsupported";
    }
    if (hostCapabilityFilter === "planned") {
      return capability.supportLevel === "planned";
    }
    return true;
  });

  useEffect(() => {
    if (focusRequest === null || handledFocusRequestNonceRef.current === focusRequest.nonce) {
      return;
    }

    const targetCapability =
      snapshot.mcpHostSyncCapabilities.find((item) => item.appCode === focusRequest.appCode) ?? null;
    if (targetCapability === null) {
      return;
    }

    if (
      hostCapabilityFilter !== "all" &&
      hostCapabilityFilter !== targetCapability.supportLevel
    ) {
      setHostCapabilityFilter(targetCapability.supportLevel);
    }
    setExpandedHostCapabilities((current) => ({
      ...current,
      [focusRequest.appCode]: true
    }));
    if (focusRequest.target === "history") {
      setExpandedVerificationHistoryByApp((current) => ({
        ...current,
        [focusRequest.appCode]: true
      }));
    }

    handledFocusRequestNonceRef.current = focusRequest.nonce;
  }, [focusRequest, hostCapabilityFilter, snapshot.mcpHostSyncCapabilities]);

  useEffect(() => {
    if (focusRequest === null || scrolledFocusRequestNonceRef.current === focusRequest.nonce) {
      return;
    }

    const target =
      focusRequest.target === "history"
        ? verificationHistoryRefs.current[focusRequest.appCode] ??
          capabilityRowRefs.current[focusRequest.appCode]
        : capabilityRowRefs.current[focusRequest.appCode];
    if (target === null || target === undefined) {
      return;
    }

    scrolledFocusRequestNonceRef.current = focusRequest.nonce;
    if (typeof window === "undefined") {
      target.scrollIntoView();
      return;
    }

    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }, [focusRequest, expandedHostCapabilities, expandedVerificationHistoryByApp, visibleHostCapabilities]);

  const batchHostSyncCandidates = snapshot.mcpHostSyncCapabilities
    .filter((item) => item.supportLevel === "managed")
    .map((item) => item.appCode)
    .filter((appCode) => hasMaterialHostSyncDiff(mcpHostSyncPreview[appCode]));
  const batchHostSyncRemovalApps = batchHostSyncCandidates.filter((appCode) => {
    const preview = mcpHostSyncPreview[appCode];
    return (preview?.removedServerIds.length ?? 0) > 0;
  });
  const batchRollbackCandidates = snapshot.mcpHostSyncCapabilities
    .filter((item) => item.supportLevel === "managed")
    .map((item) => item.appCode)
    .filter((appCode) => mcpHostSyncStateByApp.has(appCode));
  const batchHostSyncDangerConfirmed = batchHostSyncRemovalApps.every(
    (appCode) => dangerConfirmByApp[appCode] ?? false
  );
  const batchHostSyncSummary = buildMcpBatchHostSyncSummary(snapshot, mcpHostSyncPreview, locale);
  const governanceBatchSummary = buildMcpGovernanceBatchSummary(snapshot, mcpGovernancePreview, locale);
  const batchConvergencePreviewPendingApps = unique([
    ...governanceEntries
      .map((entry) => entry.appCode)
      .filter((appCode) => mcpGovernancePreview[appCode] === undefined),
    ...managedCapabilities
      .map((item) => item.appCode)
      .filter((appCode) => mcpHostSyncPreview[appCode] === undefined)
  ]);
  const batchConvergenceNeedsManualRepairApps = governanceEntries
    .map((entry) => {
      const preview = mcpGovernancePreview[entry.appCode];
      if (preview === null || preview === undefined) {
        return null;
      }

      return preview.predictedIssueCodesAfter.some((issueCode) => issueCode !== "host-drift")
        ? entry.appCode
        : null;
    })
    .filter((appCode): appCode is AppBinding["appCode"] => appCode !== null);
  const batchConvergenceConfirmedRemovalApps = unique(
    batchHostSyncRemovalApps.filter((appCode) => dangerConfirmByApp[appCode] ?? false)
  );
  const batchConvergenceCurrentRemovalReviewApps = batchHostSyncRemovalApps.filter(
    (appCode) => !(dangerConfirmByApp[appCode] ?? false)
  );
  const batchConvergenceHasWork =
    governanceBatchSummary.repairableApps.length > 0 || batchHostSyncCandidates.length > 0;
  const batchConvergenceDisabled =
    isWorking ||
    !batchConvergenceHasWork ||
    batchConvergencePreviewPendingApps.length > 0 ||
    batchConvergenceNeedsManualRepairApps.length > 0;
  const verificationBatchSummary = buildMcpVerificationBatchSummary({
    snapshot,
    locale,
    previewByApp: mcpGovernancePreview,
    hostPreviewByApp: mcpHostSyncPreview
  });
  const focusCapabilityCard = (appCode: AppBinding["appCode"]): void => {
    setExpandedHostCapabilities((current) => ({
      ...current,
      [appCode]: true
    }));
    const target = capabilityRowRefs.current[appCode];
    if (target === null || target === undefined) {
      return;
    }
    if (typeof window === "undefined") {
      target.scrollIntoView();
      return;
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  };

  const reviewHostSyncForApp = (appCode: AppBinding["appCode"]): void => {
    focusCapabilityCard(appCode);
    onLoadImportPreview(appCode);
  };

  const renderVerificationJumpButtons = (
    bucketId: string,
    appCodes: readonly AppBinding["appCode"][],
    onJump: (appCode: AppBinding["appCode"]) => void
  ): JSX.Element =>
    appCodes.length === 0 ? (
      <span className="filter-summary-chip">{t("common.notFound")}</span>
    ) : (
      <div className="quick-action-row">
        {appCodes.map((appCode) => (
          <button
            className="inline-action"
            key={`${bucketId}-${appCode}`}
            type="button"
            onClick={() => onJump(appCode)}
          >
            {appCode}
          </button>
        ))}
      </div>
    );

  return (
    <article className="panel panel-span-2" data-testid="mcp-host-sync-panel">
      <h2>{t("dashboard.panels.mcpHostSync")}</h2>
      {governanceEntries.length > 0 ? (
        <div className="list">
          <div className="list-row">
            <div>
              <strong>{locale === "zh-CN" ? "MCP 修复队列" : "MCP Repair Queue"}</strong>
              <p>
                {locale === "zh-CN"
                  ? "先修运行态主因，再做宿主机导入或同步。下面按当前风险优先级排序。"
                  : "Repair runtime first, then run host import or sync. The queue below is ordered by current risk."}
              </p>
            </div>
            <div className="row-meta stack-actions">
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={onRepairGovernanceAll}
              >
                {locale === "zh-CN" ? "整批执行一键治理" : "Apply Guided Repair For Queue"}
              </button>
            </div>
          </div>
          <div className="preview-item">
            <strong>{locale === "zh-CN" ? "整批治理前摘要" : "Batch Governance Summary"}</strong>
            <div className="preview-summary-grid">
              <div className={`preview-summary-tile risk-${governanceBatchSummary.totalApps > 0 ? "medium" : "low"}`}>
                <strong>{governanceBatchSummary.totalApps}</strong>
                <span>{locale === "zh-CN" ? "治理中的应用" : "Apps In Governance"}</span>
              </div>
              <div className={`preview-summary-tile risk-${governanceBatchSummary.repairableApps.length > 0 ? "low" : "medium"}`}>
                <strong>{governanceBatchSummary.repairableApps.length}</strong>
                <span>{locale === "zh-CN" ? "可一键治理" : "Directly Repairable"}</span>
              </div>
              <div className={`preview-summary-tile risk-${governanceBatchSummary.hostSyncRequiredApps.length > 0 ? "medium" : "low"}`}>
                <strong>{governanceBatchSummary.hostSyncRequiredApps.length}</strong>
                <span>{locale === "zh-CN" ? "后续仍需同步" : "Need Host Sync Later"}</span>
              </div>
              <div className={`preview-summary-tile risk-${governanceBatchSummary.totalPlannedActions > 0 ? "medium" : "low"}`}>
                <strong>{governanceBatchSummary.totalPlannedActions}</strong>
                <span>{locale === "zh-CN" ? "计划动作数" : "Planned Actions"}</span>
              </div>
            </div>
            <p>{governanceBatchSummary.summary}</p>
            <p>
              {locale === "zh-CN" ? "高频问题代码" : "Top Issue Codes"}:{" "}
              {joinPreviewValues(governanceBatchSummary.topIssueCodes, t("common.notFound"))}
            </p>
            <p>
              {locale === "zh-CN" ? "可一键治理应用" : "Directly Repairable Apps"}:{" "}
              {joinPreviewValues(governanceBatchSummary.repairableApps, t("common.notFound"))}
            </p>
            <p>
              {locale === "zh-CN" ? "后续仍需 Host Sync 的应用" : "Apps Still Requiring Host Sync"}:{" "}
              {joinPreviewValues(governanceBatchSummary.hostSyncRequiredApps, t("common.notFound"))}
            </p>
            {governanceBatchSummary.suggestions.map((item) => (
              <p key={`governance-batch-summary-${item}`}>{item}</p>
            ))}
            <div className="quick-action-row">
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => setGovernanceFilter("all")}
              >
                {locale === "zh-CN" ? "全部" : "All"}
              </button>
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => setGovernanceFilter("high")}
              >
                {locale === "zh-CN" ? "仅高优先级" : "High Priority"}
              </button>
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={() => setGovernanceFilter("host-sync")}
              >
                {locale === "zh-CN" ? "仅需 Host Sync" : "Needs Host Sync"}
              </button>
              {activeAppCode ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setGovernanceFilter("active-app")}
                >
                  {locale === "zh-CN" ? "当前激活应用" : "Active App"}
                </button>
              ) : null}
            </div>
            <p>
              {locale === "zh-CN" ? "当前筛选" : "Current Filter"}:{" "}
              {governanceFilter === "all"
                ? localize(locale, "全部治理项", "All Governance Items")
                : governanceFilter === "high"
                  ? localize(locale, "仅高优先级", "High Priority Only")
                  : governanceFilter === "host-sync"
                    ? localize(locale, "仅需 Host Sync", "Host Sync Required Only")
                    : activeAppCode ?? t("common.notFound")}
            </p>
          </div>
          {visibleGovernanceEntries.map((entry) => {
            const governancePreview = mcpGovernancePreview[entry.appCode] ?? null;
            const primaryServer =
              snapshot.mcpServers.find((item) => item.id === (entry.problemServerIds[0] ?? entry.affectedServerIds[0])) ??
              null;
            const primaryBinding =
              snapshot.appMcpBindings.find((item) => item.id === (entry.problemBindingIds[0] ?? entry.affectedBindingIds[0])) ??
              null;

            return (
              <div className="list-row" key={`mcp-queue-${entry.appCode}`}>
                <div>
                  <strong>{entry.appCode}</strong>
                  <p>{entry.summary}</p>
                  <p>
                    {locale === "zh-CN" ? "优先级解释" : "Priority"}: {entry.priorityLabel}
                  </p>
                  <p>
                    {locale === "zh-CN" ? "问题代码" : "Issue Codes"}:{" "}
                    {entry.issueCodes.length > 0
                      ? entry.issueCodes.map((item) => renderMcpIssueCode(item, t)).join(" / ")
                      : t("dashboard.workspace.noWarnings")}
                  </p>
                  <p>
                    {locale === "zh-CN" ? "问题 Server" : "Problem Servers"}:{" "}
                    {joinPreviewValues(entry.problemServerIds, t("common.notFound"))}
                  </p>
                  <p>
                    {locale === "zh-CN" ? "问题 Binding" : "Problem Bindings"}:{" "}
                    {joinPreviewValues(entry.problemBindingIds, t("common.notFound"))}
                  </p>
                  {entry.priorityReasons.slice(0, 2).map((reason) => (
                    <p key={`${entry.appCode}-${reason}`}>{reason}</p>
                  ))}
                </div>
                <div className="row-meta">
                  <span>{entry.governanceLevel}</span>
                  <div className="stack-actions">
                    {primaryServer ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onEditMcpServer(primaryServer)}
                      >
                        {locale === "zh-CN" ? "编辑问题 Server" : "Edit Problem Server"}
                      </button>
                    ) : null}
                    {primaryBinding ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onEditMcpBinding(primaryBinding)}
                      >
                        {locale === "zh-CN" ? "编辑问题 Binding" : "Edit Problem Binding"}
                      </button>
                    ) : null}
                    <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenMcpForms}>
                      {locale === "zh-CN" ? "打开 MCP 修复区" : "Open MCP Repair"}
                    </button>
                    {governancePreview && governancePreview.plannedActions.length > 0 ? (
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onRepairGovernance(entry.appCode)}
                      >
                        {locale === "zh-CN" ? "执行一键治理" : "Apply Guided Repair"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredGovernanceEntries.length > 3 ? (
            <div className="list-row">
              <div>
                <strong>
                  {showAllGovernanceEntries
                    ? localize(locale, "已展开全部治理项", "All Governance Items Expanded")
                    : localize(locale, `还有 ${filteredGovernanceEntries.length - 3} 个治理项未展开`, `${filteredGovernanceEntries.length - 3} More Governance Item(s)`)}
                </strong>
                <p>
                  {showAllGovernanceEntries
                    ? localize(locale, "当前已展示完整 MCP 修复队列，可逐项进入修复。", "The full MCP repair queue is visible now and can be repaired item by item.")
                    : localize(locale, "当前只展示风险最高的前三项。展开后可查看完整治理队列。", "Only the top three highest-risk items are shown right now. Expand to view the full queue.")}
                </p>
              </div>
              <div className="row-meta stack-actions">
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setShowAllGovernanceEntries((current) => !current)}
                >
                  {showAllGovernanceEntries
                    ? localize(locale, "收起治理队列", "Collapse Queue")
                    : localize(locale, "展开全部治理项", "Expand Full Queue")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="list">
        <div className="list-row">
          <div>
            <strong>{t("dashboard.mcp.importStrategyTitle")}</strong>
            <p>{t("dashboard.mcp.importStrategyHint")}</p>
            <p>{batchHostSyncSummary.summary}</p>
            <p>
              {locale === "zh-CN" ? "整批收敛状态" : "Batch Convergence Status"}:{" "}
              {batchConvergencePreviewPendingApps.length > 0
                ? localize(locale, "等待预览补齐", "Waiting For Preview State")
                : batchConvergenceNeedsManualRepairApps.length > 0
                  ? localize(locale, "仍有应用需人工修复", "Manual Repair Still Required")
                  : batchConvergenceHasWork
                    ? localize(locale, "可执行一键收敛", "Ready For One-Step Convergence")
                    : localize(locale, "当前无需继续收敛", "Already Converged")}
            </p>
            {batchConvergencePreviewPendingApps.length > 0 ? (
              <p>
                {locale === "zh-CN" ? "仍在加载预览的应用" : "Apps Still Loading Preview"}:{" "}
                {joinPreviewValues(batchConvergencePreviewPendingApps, t("common.notFound"))}
              </p>
            ) : null}
            {batchConvergenceNeedsManualRepairApps.length > 0 ? (
              <p>
                {locale === "zh-CN"
                  ? "一键治理后仍会保留非宿主机问题的应用"
                  : "Apps Still Leaving Non-Host Issues After Guided Repair"}
                :{" "}
                {joinPreviewValues(batchConvergenceNeedsManualRepairApps, t("common.notFound"))}
              </p>
            ) : null}
            {batchConvergenceCurrentRemovalReviewApps.length > 0 ? (
              <p>
                {locale === "zh-CN" ? "当前仍需确认移除项的应用" : "Apps Still Requiring Removal Review"}:{" "}
                {joinPreviewValues(batchConvergenceCurrentRemovalReviewApps, t("common.notFound"))}
              </p>
            ) : null}
            {batchConvergenceConfirmedRemovalApps.length > 0 ? (
              <p>
                {locale === "zh-CN" ? "已确认允许移除的应用" : "Apps Already Confirmed For Removal"}:{" "}
                {joinPreviewValues(batchConvergenceConfirmedRemovalApps, t("common.notFound"))}
              </p>
            ) : null}
          </div>
          <div className="row-meta stack-actions">
            <button
              className="inline-action"
              type="button"
              disabled={batchConvergenceDisabled}
              onClick={() => onConvergeAll(batchConvergenceConfirmedRemovalApps)}
              data-testid="mcp-host-sync-converge-all-button"
            >
              {locale === "zh-CN" ? "整批收敛 MCP" : "Converge MCP Queue"}
            </button>
            {batchHostSyncCandidates.length > 0 ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking || (batchHostSyncRemovalApps.length > 0 && !batchHostSyncDangerConfirmed)}
                onClick={onApplyHostSyncAll}
                data-testid="mcp-host-sync-apply-all-button"
              >
                {locale === "zh-CN" ? "整批同步宿主机" : "Apply Host Sync For Queue"}
              </button>
            ) : null}
            {batchRollbackCandidates.length > 0 ? (
              <button
                className="inline-action"
                type="button"
                disabled={isWorking}
                onClick={onRollbackHostSyncAll}
                data-testid="mcp-host-sync-rollback-all-button"
              >
                {locale === "zh-CN" ? "整批回滚宿主机" : "Rollback Host Sync For Queue"}
              </button>
            ) : null}
            <select
              value={mcpImportOptions.existingServerStrategy}
              onChange={(event) =>
                setMcpImportOptions((current) => ({
                  ...current,
                  existingServerStrategy: event.target.value as McpImportOptions["existingServerStrategy"]
                }))
              }
            >
              <option value="overwrite">{t("dashboard.mcp.strategy.existing.overwrite")}</option>
              <option value="skip">{t("dashboard.mcp.strategy.existing.skip")}</option>
            </select>
            <select
              value={mcpImportOptions.missingBindingStrategy}
              onChange={(event) =>
                setMcpImportOptions((current) => ({
                  ...current,
                  missingBindingStrategy: event.target.value as McpImportOptions["missingBindingStrategy"]
                }))
              }
            >
              <option value="create">{t("dashboard.mcp.strategy.binding.create")}</option>
              <option value="skip">{t("dashboard.mcp.strategy.binding.skip")}</option>
            </select>
          </div>
        </div>
        <div className="preview-item">
          <strong>{locale === "zh-CN" ? "整批宿主机同步摘要" : "Batch Host Sync Summary"}</strong>
          <div className="preview-summary-grid">
            <div
              className={`preview-summary-tile risk-${batchHostSyncSummary.syncableApps.length > 0 ? "medium" : "low"}`}
              data-testid={buildMcpSummaryTileTestId("apps-to-sync")}
            >
              <strong>{batchHostSyncSummary.syncableApps.length}</strong>
              <span>{locale === "zh-CN" ? "待同步应用" : "Apps To Sync"}</span>
            </div>
            <div
              className={`preview-summary-tile risk-${batchHostSyncSummary.totalAddedServers > 0 ? "low" : "medium"}`}
              data-testid={buildMcpSummaryTileTestId("added-entries")}
            >
              <strong>{batchHostSyncSummary.totalAddedServers}</strong>
              <span>{locale === "zh-CN" ? "新增托管项" : "Added Entries"}</span>
            </div>
            <div
              className={`preview-summary-tile risk-${batchHostSyncSummary.totalRemovedServers > 0 ? "high" : "low"}`}
              data-testid={buildMcpSummaryTileTestId("removed-entries")}
            >
              <strong>{batchHostSyncSummary.totalRemovedServers}</strong>
              <span>{locale === "zh-CN" ? "移除托管项" : "Removed Entries"}</span>
            </div>
            <div
              className="preview-summary-tile risk-low"
              data-testid={buildMcpSummaryTileTestId("unchanged-entries")}
            >
              <strong>{batchHostSyncSummary.totalUnchangedServers}</strong>
              <span>{locale === "zh-CN" ? "保持不变" : "Unchanged"}</span>
            </div>
          </div>
          <p>
            {locale === "zh-CN" ? "待同步应用" : "Apps To Sync"}:{" "}
            {joinPreviewValues(batchHostSyncSummary.syncableApps, t("common.notFound"))}
          </p>
          <p>
            {locale === "zh-CN" ? "包含移除的应用" : "Apps With Removals"}:{" "}
            {joinPreviewValues(batchHostSyncSummary.removalApps, t("common.notFound"))}
          </p>
          <p>
            {locale === "zh-CN" ? "当前可整批回滚的应用" : "Apps Ready For Batch Rollback"}:{" "}
            {joinPreviewValues(batchRollbackCandidates, t("common.notFound"))}
          </p>
          {batchHostSyncSummary.suggestions.map((item) => (
            <p key={`batch-host-sync-summary-${item}`}>{item}</p>
          ))}
        </div>
        <div className="preview-item">
          <strong>{localize(locale, "治理后验证摘要", "Post-Repair Verification Summary")}</strong>
          <div className="preview-summary-grid">
            <div className={`preview-summary-tile risk-${verificationBatchSummary.totalApps > 0 ? "medium" : "low"}`}>
              <strong>{verificationBatchSummary.totalApps}</strong>
              <span>{localize(locale, "验证对象", "Verification Targets")}</span>
            </div>
            <div className={`preview-summary-tile risk-${verificationBatchSummary.verifiedApps.length > 0 ? "low" : "medium"}`}>
              <strong>{verificationBatchSummary.verifiedApps.length}</strong>
              <span>{localize(locale, "已自动验证", "Auto-Verified")}</span>
            </div>
            <div className={`preview-summary-tile risk-${verificationBatchSummary.needsHostSyncApps.length > 0 ? "medium" : "low"}`}>
              <strong>{verificationBatchSummary.needsHostSyncApps.length}</strong>
              <span>{localize(locale, "仍需宿主机确认", "Need Host Confirmation")}</span>
            </div>
            <div className={`preview-summary-tile risk-${verificationBatchSummary.regressedApps.length > 0 ? "high" : "low"}`}>
              <strong>{verificationBatchSummary.regressedApps.length}</strong>
              <span>{localize(locale, "回退/阻断风险", "Regression / Blocker Risk")}</span>
            </div>
          </div>
          <p>{verificationBatchSummary.summary}</p>
          <p>
            {localize(locale, "自动验证通过", "Auto-Verified Apps")}:{" "}
            {joinPreviewValues(verificationBatchSummary.verifiedApps, t("common.notFound"))}
          </p>
          <p>
            {localize(locale, "仍需 Host Sync / 漂移确认", "Still Need Host Sync / Drift Review")}:{" "}
            {joinPreviewValues(verificationBatchSummary.needsHostSyncApps, t("common.notFound"))}
          </p>
          <p>
            {localize(locale, "回退/阻断风险应用", "Regression / Blocker Risk Apps")}:{" "}
            {joinPreviewValues(verificationBatchSummary.regressedApps, t("common.notFound"))}
          </p>
          <p>
            {localize(locale, "仍需真实请求验证", "Still Need Live Request Verification")}:{" "}
            {joinPreviewValues(verificationBatchSummary.needsTrafficVerificationApps, t("common.notFound"))}
          </p>
          {verificationBatchSummary.suggestions.map((item) => (
            <p key={`mcp-verification-summary-${item}`}>{item}</p>
          ))}
          <div className="preview-item-list">
            <div className="preview-item">
              <strong>{localize(locale, "回退/阻断风险", "Regression / Blocker Risk")}</strong>
              <p>
                {verificationBatchSummary.highRiskApps.length > 0
                  ? localize(
                      locale,
                      "点击应用可直接跳到对应卡片，优先看 runtime 主阻断项，以及最近治理动作后是否已经出现回退。",
                      "Jump into the matching app card first, then prioritize runtime blockers and whether regression has already appeared after the latest governance action."
                    )
                  : localize(
                      locale,
                      "当前没有明显回退/阻断风险对象，说明最危险的主阻断项已经先被压住。",
                      "There is no obvious regression or blocker risk target right now, which means the biggest primary blockers are already contained."
                    )}
              </p>
              {renderVerificationJumpButtons(
                "verification-high-risk",
                verificationBatchSummary.highRiskApps,
                focusCapabilityCard
              )}
            </div>
            <div className="preview-item">
              <strong>{localize(locale, "待宿主机确认", "Need Host Confirmation")}</strong>
              <p>
                {verificationBatchSummary.needsHostSyncApps.length > 0
                  ? localize(
                      locale,
                      "点击应用会展开对应卡片并重新拉一遍 host preview，适合先核对增删项再决定 apply。",
                      "Click an app to expand its card and refresh host preview so additions and removals can be reviewed before apply."
                    )
                  : localize(
                      locale,
                      "当前没有额外 Host Sync 待确认应用，宿主机托管层看起来已基本对齐。",
                      "There is no extra app waiting for host confirmation, so the managed host layer already looks mostly aligned."
                    )}
              </p>
              {renderVerificationJumpButtons(
                "verification-host-review",
                verificationBatchSummary.needsHostSyncApps,
                reviewHostSyncForApp
              )}
            </div>
            <div className="preview-item">
              <strong>{localize(locale, "待真实请求验证", "Need Live Request Verification")}</strong>
              <p>
                {verificationBatchSummary.needsTrafficVerificationApps.length > 0
                  ? localize(
                      locale,
                      "点击应用可先定位到对应卡片，再发起一次真实 CLI 请求确认修复不再传导到流量面。",
                      "Jump to the app card first, then trigger a real CLI request to confirm the repair no longer propagates into traffic."
                    )
                  : localize(
                      locale,
                      "当前没有明显缺少真实请求验证的应用，可以继续观察回归窗口。",
                      "There is no obvious app still missing live request verification right now, so you can continue observing the regression window."
                    )}
              </p>
              {renderVerificationJumpButtons(
                "verification-traffic",
                verificationBatchSummary.needsTrafficVerificationApps,
                focusCapabilityCard
              )}
            </div>
            <div className="preview-item">
              <strong>{localize(locale, "已自动验证", "Auto-Verified")}</strong>
              <p>
                {verificationBatchSummary.verifiedApps.length > 0
                  ? localize(
                      locale,
                      "这些应用已经通过自动验证，点击可回看 checkpoint，并继续盯住是否出现回退。",
                      "These apps have passed automatic verification. Jump in to review checkpoints and continue watching for regressions."
                    )
                  : localize(
                      locale,
                      "当前还没有进入“已自动验证”分组的应用，说明验证闭环仍在推进中。",
                      "No app is inside the auto-verified group yet, so the verification loop is still moving forward."
                    )}
              </p>
              {renderVerificationJumpButtons(
                "verification-stable",
                verificationBatchSummary.verifiedApps,
                focusCapabilityCard
              )}
            </div>
          </div>
        </div>
        <div className="preview-item">
          <strong>{localize(locale, "MCP 宿主机生态矩阵", "MCP Host Ecosystem Matrix")}</strong>
          <div className="preview-summary-grid">
            <div className={`preview-summary-tile risk-${managedCapabilities.length > 0 ? "low" : "medium"}`}>
              <strong>{managedCapabilities.length}</strong>
              <span>{localize(locale, "已托管 CLI", "Managed CLIs")}</span>
            </div>
            <div className={`preview-summary-tile risk-${unsupportedCapabilities.length > 0 ? "medium" : "low"}`}>
              <strong>{unsupportedCapabilities.length}</strong>
              <span>{localize(locale, "桥接/非托管", "Bridge / Unsupported")}</span>
            </div>
            <div className={`preview-summary-tile risk-${plannedCapabilities.length > 0 ? "medium" : "low"}`}>
              <strong>{plannedCapabilities.length}</strong>
              <span>{localize(locale, "待扩展 CLI", "Planned CLIs")}</span>
            </div>
            <div className="preview-summary-tile risk-low">
              <strong>{visibleHostCapabilities.length}</strong>
              <span>{localize(locale, "当前视图", "Current View")}</span>
            </div>
          </div>
          <p>
            {localize(locale, "已托管", "Managed")}:{" "}
            {joinPreviewValues(managedCapabilities.map((item) => item.appCode), t("common.notFound"))}
          </p>
          <p>
            {localize(locale, "桥接/非托管", "Bridge / Unsupported")}:{" "}
            {joinPreviewValues(unsupportedCapabilities.map((item) => item.appCode), t("common.notFound"))}
          </p>
          <p>
            {localize(locale, "待扩展", "Planned")}:{" "}
            {joinPreviewValues(plannedCapabilities.map((item) => item.appCode), t("common.notFound"))}
          </p>
          <div className="quick-action-row">
            <button
              className="inline-action"
              type="button"
              disabled={isWorking}
              onClick={() => setHostCapabilityFilter("all")}
            >
              {localize(locale, "全部生态项", "All")}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={isWorking}
              onClick={() => setHostCapabilityFilter("managed")}
            >
              {localize(locale, "仅已托管", "Managed")}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={isWorking}
              onClick={() => setHostCapabilityFilter("unsupported")}
            >
              {localize(locale, "仅桥接/非托管", "Bridge")}
            </button>
            <button
              className="inline-action"
              type="button"
              disabled={isWorking}
              onClick={() => setHostCapabilityFilter("planned")}
            >
              {localize(locale, "仅待扩展", "Planned")}
            </button>
          </div>
          <p>
            {localize(locale, "当前筛选", "Current Filter")}:{" "}
            {renderHostCapabilityFilterLabel(hostCapabilityFilter, locale)}
          </p>
        </div>
        {visibleHostCapabilities.map((capability) => {
          const runtimeView = mcpRuntimeViewByApp.get(capability.appCode);
          const governanceEntry = governanceEntryByApp.get(capability.appCode) ?? null;
          const syncState = mcpHostSyncStateByApp.get(capability.appCode);
          const hostPreview = mcpHostSyncPreview[capability.appCode];
          const governancePreview = mcpGovernancePreview[capability.appCode] ?? null;
          const runtimeRepairNotice = runtimeView ? buildRuntimeRepairNotice(runtimeView, locale) : null;
          const capabilityNotice = buildHostCapabilityNotice(capability, locale);
          const capabilityRunbook = buildHostCapabilityRunbook(capability, locale);
          const verificationPlan = buildMcpVerificationPlan({
            snapshot,
            appCode: capability.appCode,
            locale,
            governancePreview,
            hostPreview
          });
          const verificationHistoryPage = mcpVerificationHistoryByApp[capability.appCode] ?? null;
          const loadedVerificationHistoryCount = verificationHistoryPage?.items.length ?? 0;
          const verificationHistoryExpanded =
            expandedVerificationHistoryByApp[capability.appCode] ?? false;
          const verificationHistoryLimit = verificationHistoryExpanded
            ? Math.max(loadedVerificationHistoryCount, 3)
            : 3;
          const verificationHistory = buildMcpVerificationHistory({
            snapshot,
            appCode: capability.appCode,
            locale,
            governancePreview,
            hostPreview,
            historyPage: verificationHistoryPage,
            limit: verificationHistoryLimit
          });
          const isVerificationHistoryLoading =
            mcpVerificationHistoryLoadingByApp[capability.appCode] ?? false;
          const hasMoreVerificationHistory =
            verificationHistoryPage !== null &&
            verificationHistoryPage.total > loadedVerificationHistoryCount;
          const canRetryVerificationHistory = verificationHistoryPage === null;
          const shouldShowVerificationHistoryActions =
            hasMoreVerificationHistory ||
            canRetryVerificationHistory ||
            verificationHistoryExpanded;
          const primaryRuntimeServer =
            governanceEntry?.problemServerIds[0] ??
            runtimeView?.items.find((item) => item.issueCodes.length > 0)?.serverId ??
            runtimeView?.items[0]?.serverId ??
            null;
          const primaryRuntimeServerEntity =
            primaryRuntimeServer === null
              ? null
              : snapshot.mcpServers.find((item) => item.id === primaryRuntimeServer) ?? null;
          const primaryRuntimeBinding =
            governanceEntry?.problemBindingIds[0] ??
            runtimeView?.items.find((item) => item.issueCodes.length > 0)?.bindingId ??
            null;
          const primaryRuntimeBindingEntity =
            primaryRuntimeBinding === null
              ? null
              : snapshot.appMcpBindings.find((item) => item.id === primaryRuntimeBinding) ?? null;
          const requiresDangerConfirm = (hostPreview?.removedServerIds.length ?? 0) > 0;
          const dangerConfirmed = dangerConfirmByApp[capability.appCode] ?? false;
          const capabilityExpanded = expandedHostCapabilities[capability.appCode] ?? true;

          return (
            <div
              className="list-row"
              key={capability.appCode}
              data-testid={buildMcpCapabilityCardTestId(capability.appCode)}
              ref={(node) => {
                capabilityRowRefs.current[capability.appCode] = node;
              }}
            >
              <div>
                <strong>{capability.appCode}</strong>
                <p>{renderMcpHostSyncLevel(capability, t)}</p>
                <p>
                  {localize(locale, "建议路径", "Recommended Path")}:{" "}
                  {renderHostRecommendedPathLabel(capability.recommendedPath, locale)}
                </p>
                <p>{capability.reason}</p>
                <p>{capability.configPathHint ?? t("common.notFound")}</p>
                {capabilityExpanded && capability.supportLevel !== "managed" ? (
                  <>
                    <GovernanceNoticeCard notice={capabilityNotice} locale={locale} />
                    <div className="preview-item">
                      <strong>{localize(locale, "生态接入手册", "Ecosystem Runbook")}</strong>
                      <p>{capabilityRunbook.summary}</p>
                      {capabilityRunbook.steps.map((step) => (
                        <p key={`${capability.appCode}-${step}`}>{step}</p>
                      ))}
                      <p>
                        {localize(locale, "避免动作", "Avoid")}: {capabilityRunbook.avoid}
                      </p>
                    </div>
                  </>
                ) : null}
                {capabilityExpanded && (runtimeView || syncState) ? (
                  <div className="preview-item">
                    <strong>{t("dashboard.mcp.runtimeTitle")}</strong>
                    {runtimeView ? (
                      <>
                        <p>
                          {t("dashboard.mcp.runtimeStatus")}: {renderMcpRuntimeStatus(runtimeView.status, t)}
                        </p>
                        <p>
                          {t("dashboard.mcp.runtimeIssueCodes")}:{" "}
                          {runtimeView.issueCodes.length > 0
                            ? runtimeView.issueCodes.map((item) => renderMcpIssueCode(item, t)).join(" / ")
                            : t("dashboard.workspace.noWarnings")}
                        </p>
                        <p>
                          {t("dashboard.mcp.runtimeDrifted")}:{" "}
                          {runtimeView.hostState.drifted ? t("common.enabled") : t("common.disabled")}
                        </p>
                        <p>
                          {t("dashboard.mcp.runtimeSyncedServers")}:{" "}
                          {joinPreviewValues(runtimeView.hostState.syncedServerIds, t("common.notFound"))}
                        </p>
                        {governanceEntry ? (
                          <p>
                            {locale === "zh-CN" ? "治理摘要" : "Governance Summary"}: {governanceEntry.summary}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {syncState ? (
                      <p>{t("dashboard.mcp.runtimeLastAppliedAt")}: {formatDateTime(syncState.lastAppliedAt)}</p>
                    ) : null}
                    {runtimeRepairNotice ? (
                      <>
                        <GovernanceNoticeCard notice={runtimeRepairNotice} locale={locale} />
                        {governancePreview ? (
                          <div className="preview-item">
                            {(() => {
                              const diffSummary = buildMcpGovernanceDiffSummary(governancePreview, locale);
                              return (
                                <>
                                  <strong>{localize(locale, "一键治理预览", "Guided Repair Preview")}</strong>
                                  <p>
                                    {localize(locale, "修复前状态", "Before Repair")}: {renderMcpRuntimeStatus(governancePreview.statusBefore, t)}
                                  </p>
                                  <p>
                                    {localize(locale, "修复后预测", "Predicted After Repair")}:{" "}
                                    {renderMcpRuntimeStatus(governancePreview.predictedStatusAfter, t)}
                                  </p>
                                  <p>{diffSummary.summary}</p>
                                  <p>
                                    {localize(locale, "预计消除的问题", "Issues Expected To Resolve")}:{" "}
                                    {joinPreviewValues(diffSummary.resolvedIssueCodes.map((item) => renderMcpIssueCode(item as DashboardSnapshot["mcpRuntimeViews"][number]["issueCodes"][number], t)), t("common.notFound"))}
                                  </p>
                                  <p>
                                    {localize(locale, "预计保留的问题", "Issues Likely To Remain")}:{" "}
                                    {joinPreviewValues(diffSummary.remainingIssueCodes.map((item) => renderMcpIssueCode(item as DashboardSnapshot["mcpRuntimeViews"][number]["issueCodes"][number], t)), t("common.notFound"))}
                                  </p>
                                  <p>
                                    {localize(locale, "未变化的问题", "Unchanged Issues")}:{" "}
                                    {joinPreviewValues(diffSummary.unchangedIssueCodes.map((item) => renderMcpIssueCode(item as DashboardSnapshot["mcpRuntimeViews"][number]["issueCodes"][number], t)), t("common.notFound"))}
                                  </p>
                                </>
                              );
                            })()}
                            <p>
                              {localize(locale, "修复后剩余问题", "Remaining Issues After Repair")}:{" "}
                              {governancePreview.predictedIssueCodesAfter.length > 0
                                ? governancePreview.predictedIssueCodesAfter.map((item) => renderMcpIssueCode(item, t)).join(" / ")
                                : t("dashboard.workspace.noWarnings")}
                            </p>
                            {governancePreview.plannedActions.length > 0 ? (
                              <div className="preview-item-list">
                                {governancePreview.plannedActions.map((item) => (
                                  <div className="preview-item" key={`${capability.appCode}-${item.action}`}>
                                    <strong>{renderGovernanceActionTitle(item.action, locale)}</strong>
                                    <p>{renderGovernanceActionSummary(item, locale)}</p>
                                    {item.bindingIds.length > 0 ? (
                                      <p>
                                        {localize(locale, "涉及 Binding", "Bindings")}: {joinPreviewValues(item.bindingIds, t("common.notFound"))}
                                      </p>
                                    ) : null}
                                    {item.serverIds.length > 0 ? (
                                      <p>
                                        {localize(locale, "涉及 Server", "Servers")}: {joinPreviewValues(item.serverIds, t("common.notFound"))}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p>
                                {governancePreview.requiresHostSync
                                  ? localize(locale, "当前没有额外控制台修复动作，主要剩余宿主机同步。", "No additional console repair action is required. The main remaining task is host sync.")
                                  : localize(locale, "当前没有可自动执行的一键治理动作。", "No automatic guided repair action is currently available.")}
                              </p>
                            )}
                            {governancePreview.warnings.map((warning) => (
                              <p key={`${capability.appCode}-${warning}`}>{warning}</p>
                            ))}
                          </div>
                        ) : null}
                        <div className="quick-action-row">
                          <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenMcpForms}>
                            {locale === "zh-CN" ? "打开 MCP 修复区" : "Open MCP Repair"}
                          </button>
                          {governancePreview && governancePreview.plannedActions.length > 0 ? (
                            <button
                              className="inline-action"
                              type="button"
                              disabled={isWorking}
                              onClick={() => onRepairGovernance(capability.appCode)}
                            >
                              {localize(locale, "执行一键治理", "Apply Guided Repair")}
                            </button>
                          ) : null}
                          {primaryRuntimeServerEntity ? (
                            <button
                              className="inline-action"
                              type="button"
                              disabled={isWorking}
                              onClick={() => onEditMcpServer(primaryRuntimeServerEntity)}
                            >
                              {locale === "zh-CN" ? "编辑问题 Server" : "Edit Problem Server"}
                            </button>
                          ) : null}
                          {primaryRuntimeBindingEntity ? (
                            <button
                              className="inline-action"
                              type="button"
                              disabled={isWorking}
                              onClick={() => onEditMcpBinding(primaryRuntimeBindingEntity)}
                            >
                              {locale === "zh-CN" ? "编辑问题 Binding" : "Edit Problem Binding"}
                            </button>
                          ) : null}
                          <button
                            className="inline-action"
                            type="button"
                            disabled={isWorking}
                            onClick={() => onLoadImportPreview(capability.appCode)}
                          >
                            {locale === "zh-CN" ? "重新预览宿主机差异" : "Refresh Host Preview"}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {capabilityExpanded && hostPreview ? (
                  <div className="preview-item">
                    <strong>{t("dashboard.mcp.hostPreviewTitle")}</strong>
                    <p>
                      {t("dashboard.mcp.previewCurrentManaged")}:{" "}
                      {joinPreviewValues(hostPreview.currentManagedServerIds, t("common.notFound"))}
                    </p>
                    <p>
                      {t("dashboard.mcp.previewNextManaged")}:{" "}
                      {joinPreviewValues(hostPreview.nextManagedServerIds, t("common.notFound"))}
                    </p>
                    <p>
                      {t("dashboard.mcp.previewAdded")}:{" "}
                      {joinPreviewValues(hostPreview.addedServerIds, t("common.notFound"))}
                    </p>
                    <p>
                      {t("dashboard.mcp.previewRemoved")}:{" "}
                      {joinPreviewValues(hostPreview.removedServerIds, t("common.notFound"))}
                    </p>
                    <p>
                      {t("dashboard.mcp.previewUnchanged")}:{" "}
                      {joinPreviewValues(hostPreview.unchangedServerIds, t("common.notFound"))}
                    </p>
                    <p>
                      {t("dashboard.mcp.previewWarnings")}:{" "}
                      {joinDashboardWarnings(hostPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
                    </p>
                    <GovernanceNoticeCard
                      notice={buildMcpHostSyncNotice(hostPreview, locale)}
                      locale={locale}
                    />
                    <div className="quick-action-row">
                      <button className="inline-action" type="button" disabled={isWorking} onClick={onOpenMcpForms}>
                        {locale === "zh-CN" ? "打开 MCP 修复区" : "Open MCP Repair"}
                      </button>
                    </div>
                    <div className="preview-summary-grid">
                      <div className="preview-summary-tile">
                        <strong>{hostPreview.addedServerIds.length}</strong>
                        <span>{locale === "zh-CN" ? "新增" : "Added"}</span>
                      </div>
                      <div className="preview-summary-tile">
                        <strong>{hostPreview.removedServerIds.length}</strong>
                        <span>{locale === "zh-CN" ? "移除" : "Removed"}</span>
                      </div>
                      <div className="preview-summary-tile">
                        <strong>{hostPreview.unchangedServerIds.length}</strong>
                        <span>{locale === "zh-CN" ? "保持" : "Unchanged"}</span>
                      </div>
                    </div>
                    {requiresDangerConfirm ? (
                      <label className="checkbox-row danger-confirm-row">
                        <input
                          data-testid={buildMcpDangerConfirmTestId(capability.appCode)}
                          checked={dangerConfirmed}
                          onChange={(event) =>
                            setDangerConfirmByApp((current) => ({
                              ...current,
                              [capability.appCode]: event.target.checked
                            }))
                          }
                          type="checkbox"
                        />{" "}
                        {locale === "zh-CN"
                          ? "我已确认允许移除上述宿主机托管 MCP 条目"
                          : "I confirm that the managed host MCP entries above may be removed"}
                      </label>
                    ) : null}
                  </div>
                ) : null}
                {capabilityExpanded ? (
                  <div className="preview-item">
                    <strong>{localize(locale, "治理后验证手册", "Post-Repair Verification Runbook")}</strong>
                    <p>
                      {localize(locale, "自动验证状态", "Auto Verification Status")}:{" "}
                      {verificationPlan.verificationStatusLabel}
                    </p>
                    <p>{verificationPlan.verificationStatusSummary}</p>
                    {verificationPlan.verificationBaselineAt ? (
                      <p>
                        {localize(locale, "最近治理基线", "Latest Governance Baseline")}:{" "}
                        {formatDateTime(verificationPlan.verificationBaselineAt)}
                      </p>
                    ) : null}
                    {verificationPlan.latestSuccessAt ? (
                      <p>
                        {localize(locale, "最近成功请求", "Latest Successful Request")}:{" "}
                        {formatDateTime(verificationPlan.latestSuccessAt)}
                      </p>
                    ) : null}
                    {verificationPlan.latestFailureAt ? (
                      <p>
                        {localize(locale, "最近失败请求", "Latest Failed Request")}:{" "}
                        {formatDateTime(verificationPlan.latestFailureAt)}
                      </p>
                    ) : null}
                    {verificationPlan.checkpoints.map((item) => (
                      <p key={`${capability.appCode}-${item.id}`}>
                        {item.label}: {item.value}
                      </p>
                    ))}
                    {verificationPlan.nextActions.map((item) => (
                      <p key={`${capability.appCode}-verification-step-${item}`}>{item}</p>
                    ))}
                    <div className="quick-action-row">
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onOpenRuntime(capability.appCode)}
                      >
                        {localize(locale, "查看 Runtime", "Open Runtime")}
                      </button>
                      {capability.supportLevel === "managed" && verificationPlan.needsHostSync ? (
                        <button
                          className="inline-action"
                          type="button"
                          disabled={isWorking}
                          onClick={() => reviewHostSyncForApp(capability.appCode)}
                        >
                          {localize(locale, "复核 Host Sync", "Review Host Sync")}
                        </button>
                      ) : null}
                      {governancePreview && governancePreview.plannedActions.length > 0 ? (
                        <button
                          className="inline-action"
                          type="button"
                          disabled={isWorking}
                          onClick={onOpenMcpForms}
                        >
                          {localize(locale, "回到 MCP 修复区", "Back To MCP Repair")}
                        </button>
                      ) : null}
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onOpenAudit(capability.appCode)}
                      >
                        {localize(locale, "聚焦 MCP 审计", "Focus MCP Audit")}
                      </button>
                      {verificationPlan.needsTrafficVerification || verificationPlan.level === "low" ? (
                        <button
                          className="inline-action"
                          type="button"
                          disabled={isWorking}
                          onClick={() => onOpenTraffic(capability.appCode)}
                        >
                          {localize(locale, "验证真实请求", "Validate Live Requests")}
                        </button>
                      ) : null}
                    </div>
                    {verificationHistory.items.length > 0 ||
                    verificationHistory.previewNote !== null ||
                    shouldShowVerificationHistoryActions ? (
                      <div
                        className="preview-item"
                        ref={(node) => {
                          verificationHistoryRefs.current[capability.appCode] = node;
                        }}
                      >
                        <strong>{localize(locale, "最近治理基线历史", "Recent Governance Baselines")}</strong>
                        {verificationHistory.previewNote ? <p>{verificationHistory.previewNote}</p> : null}
                        {verificationHistoryPage ? (
                          <p>
                            {localize(locale, "已加载基线", "Loaded Baselines")}:{" "}
                            {`${Math.min(loadedVerificationHistoryCount, verificationHistoryPage.total)} / ${verificationHistoryPage.total}`}
                          </p>
                        ) : null}
                        <div className="preview-item-list">
                          {verificationHistory.items.map((item) => (
                            <div className="preview-item" key={`${capability.appCode}-${item.id}`}>
                              <strong>{item.baselineSourceLabel}</strong>
                              <p>
                                {localize(locale, "基线时间", "Baseline Time")}:{" "}
                                {formatDateTime(item.baselineAt)}
                              </p>
                              <p>
                                {localize(locale, "闭环状态", "Cycle Verdict")}:{" "}
                                {item.verificationStatusLabel}
                              </p>
                              <p>{item.verificationStatusSummary}</p>
                              <p>{item.baselineSummary}</p>
                              {item.nextBaselineAt ? (
                                <p>
                                  {localize(locale, "下一次治理接管", "Next Baseline Took Over")}:{" "}
                                  {formatDateTime(item.nextBaselineAt)}
                                </p>
                              ) : null}
                              {item.latestSuccessAt ? (
                                <p>
                                  {localize(locale, "窗口内最近成功请求", "Latest Success In Cycle")}:{" "}
                                  {formatDateTime(item.latestSuccessAt)}
                                </p>
                              ) : null}
                              {item.latestFailureAt ? (
                                <p>
                                  {localize(locale, "窗口内最近失败请求", "Latest Failure In Cycle")}:{" "}
                                  {formatDateTime(item.latestFailureAt)}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        {shouldShowVerificationHistoryActions ? (
                          <div className="quick-action-row">
                            {(hasMoreVerificationHistory || canRetryVerificationHistory) ? (
                              <button
                                className="inline-action"
                                type="button"
                                disabled={isWorking || isVerificationHistoryLoading}
                                onClick={() => {
                                  setExpandedVerificationHistoryByApp((current) => ({
                                    ...current,
                                    [capability.appCode]: true
                                  }));
                                  onLoadMoreVerificationHistory(capability.appCode);
                                }}
                              >
                                {isVerificationHistoryLoading
                                  ? localize(locale, "正在加载基线…", "Loading Baselines...")
                                  : canRetryVerificationHistory
                                    ? localize(locale, "补拉后端基线", "Load Server History")
                                    : localize(
                                        locale,
                                        `查看更多基线（${loadedVerificationHistoryCount}/${verificationHistoryPage!.total}）`,
                                        `Load More Baselines (${loadedVerificationHistoryCount}/${verificationHistoryPage!.total})`
                                      )}
                              </button>
                            ) : null}
                            {verificationHistoryExpanded && verificationHistory.items.length > 3 ? (
                              <button
                                className="inline-action"
                                type="button"
                                disabled={isWorking}
                                onClick={() =>
                                  setExpandedVerificationHistoryByApp((current) => ({
                                    ...current,
                                    [capability.appCode]: false
                                  }))
                                }
                              >
                                {localize(locale, "收起历史", "Collapse History")}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="row-meta">
                <span>{capability.configFormat ?? "n/a"}</span>
                <div className="stack-actions">
                  <button
                    className="inline-action"
                    type="button"
                    disabled={isWorking}
                    onClick={() =>
                      setExpandedHostCapabilities((current) => ({
                        ...current,
                        [capability.appCode]: !(current[capability.appCode] ?? true)
                      }))
                    }
                  >
                    {capabilityExpanded
                      ? localize(locale, "收起生态卡片", "Collapse Card")
                      : localize(locale, "展开生态卡片", "Expand Card")}
                  </button>
                  {capability.supportLevel !== "managed" ? (
                    <button
                      className="inline-action"
                      type="button"
                      disabled={isWorking}
                      onClick={onOpenMcpForms}
                    >
                      {localize(locale, "保留控制台治理", "Keep Console Governance")}
                    </button>
                  ) : null}
                  {capability.docsUrl ? (
                    <a
                      className="inline-action"
                      href={capability.docsUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {localize(locale, "查看上游说明", "Open Upstream Docs")}
                    </a>
                  ) : null}
                  {(capability.appCode === "codex" ||
                    capability.appCode === "claude-code" ||
                    capability.appCode === "gemini-cli" ||
                    capability.appCode === "opencode") ? (
                    <>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onLoadImportPreview(capability.appCode)}
                        data-testid={buildMcpImportPreviewButtonTestId(capability.appCode)}
                      >
                        {t("dashboard.mcp.previewAction")}
                      </button>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onImportFromHost(capability.appCode)}
                        data-testid={buildMcpImportButtonTestId(capability.appCode)}
                      >
                        {t("dashboard.mcp.importAction")}
                      </button>
                    </>
                  ) : null}
                  {capability.supportLevel === "managed" ? (
                    <>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking || (requiresDangerConfirm && !dangerConfirmed)}
                        onClick={() => onApplyHostSync(capability.appCode)}
                        data-testid={buildMcpApplyButtonTestId(capability.appCode)}
                      >
                        {t("dashboard.mcp.applyAction")}
                      </button>
                      <button
                        className="inline-action"
                        type="button"
                        disabled={isWorking}
                        onClick={() => onRollbackHostSync(capability.appCode)}
                        data-testid={buildMcpRollbackButtonTestId(capability.appCode)}
                      >
                        {t("dashboard.mcp.rollbackAction")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {Object.values(mcpImportPreview).some((item) => item !== null) ? (
        <div className="list mcp-preview-list">
          {Object.entries(mcpImportPreview).map(([appCode, preview]) =>
            preview === null ? null : (
              <div className="list-row" key={appCode} data-testid={buildMcpImportPreviewCardTestId(appCode)}>
                <div>
                  <strong>
                    {appCode} / {t("dashboard.mcp.previewTitle")}
                  </strong>
                  <p>{preview.configPath}</p>
                  <p>{t("dashboard.mcp.previewTotal")}: {preview.totalDiscovered}</p>
                  <div className="preview-item-list">
                    {preview.items.map((item) => (
                      (() => {
                        const existingServer =
                          snapshot.mcpServers.find((server) => server.id === item.serverId) ?? null;

                        return (
                          <div
                            className="preview-item"
                            key={`${appCode}-${item.serverId}`}
                            data-testid={buildMcpImportPreviewItemTestId(appCode, item.serverId)}
                          >
                            <strong>{item.serverId}</strong>
                            <p>
                              {renderMcpPreviewStatus(item.status, t)} / {renderMcpPreviewBindingStatus(item.bindingStatus, t)}
                            </p>
                            <p>
                              {t("dashboard.mcp.previewChangedFields")}:{" "}
                              {item.changedFields.map((field) => renderMcpChangedField(field, t)).join(", ") || t("common.notFound")}
                            </p>
                            <div className="quick-action-row">
                              {existingServer ? (
                                <button
                                  className="inline-action"
                                  type="button"
                                  disabled={isWorking}
                                  onClick={() => onEditMcpServer(existingServer)}
                                >
                                  {locale === "zh-CN" ? "载入到 MCP 编辑器" : "Load Into MCP Editor"}
                                </button>
                              ) : (
                                <button
                                  className="inline-action"
                                  type="button"
                                  disabled={isWorking}
                                  onClick={onOpenMcpForms}
                                >
                                  {locale === "zh-CN" ? "打开 MCP 编辑区" : "Open MCP Editor"}
                                </button>
                              )}
                            </div>
                            {item.fieldDiffs.length > 0 ? (
                              <div className="preview-diff-list">
                                {item.fieldDiffs.map((fieldDiff) => (
                                  <div className="preview-diff-row" key={`${appCode}-${item.serverId}-${fieldDiff.field}`}>
                                    <strong>{renderMcpChangedField(fieldDiff.field, t)}</strong>
                                    <p>
                                      {t("dashboard.mcp.previewCurrentValue")}:{" "}
                                      <code>{renderMcpImportDiffValue(fieldDiff.currentValue, t)}</code>
                                    </p>
                                    <p>
                                      {t("dashboard.mcp.previewIncomingValue")}:{" "}
                                      <code>{renderMcpImportDiffValue(fieldDiff.incomingValue, t)}</code>
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()
                    ))}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      ) : null}
    </article>
  );
};
