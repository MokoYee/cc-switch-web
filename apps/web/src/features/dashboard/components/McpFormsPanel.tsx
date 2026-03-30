import { useState, type Dispatch, type SetStateAction } from "react";

import type {
  AppMcpBindingUpsert,
  McpBindingSavePreview,
  McpServerSavePreview,
  McpServerUpsert
} from "cc-switch-web-shared";

import { useI18n } from "../../../shared/i18n/I18nProvider.js";
import type { DashboardSnapshot } from "../api/load-dashboard-snapshot.js";
import { buildMcpGovernanceEntries } from "../lib/buildMcpGovernanceEntries.js";
import {
  buildMcpBindingConflictInsight,
  buildMcpServerConflictInsight
} from "../lib/buildMcpConflictInsights.js";
import { ConfigImpactSummary } from "./ConfigImpactSummary.js";
import { joinDashboardWarnings } from "../lib/formatDashboardWarning.js";
import { GovernanceNoticeCard } from "./GovernanceNoticeCard.js";

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const joinPreviewValues = (items: string[], fallback: string): string =>
  items.length > 0 ? items.join(", ") : fallback;

const buildMcpSaveNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly summary: string;
    readonly suggestions: readonly string[];
    readonly level: "low" | "medium" | "high";
  }
): {
  readonly level: "low" | "medium" | "high";
  readonly summary: string;
  readonly suggestions: string[];
} => ({
  level: input.level,
  summary: locale === "zh-CN" ? input.summary : input.summary,
  suggestions: [...input.suggestions]
});

const splitValues = (rawValue: string): string[] =>
  rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const renderMcpChangedField = (
  field: McpServerSavePreview["changedFields"][number],
  t: (
    key:
      | "dashboard.mcp.changedField.name"
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
    case "name":
      return t("dashboard.mcp.changedField.name");
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
};

const renderMcpIssueCode = (
  issueCode: McpServerSavePreview["runtimeIssueCodes"][number],
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

  return t("dashboard.mcp.issue.missingServer");
};

type McpFormsPanelProps = {
  readonly snapshot: DashboardSnapshot;
  readonly mcpServers: DashboardSnapshot["mcpServers"];
  readonly mcpServerForm: McpServerUpsert;
  readonly setMcpServerForm: Dispatch<SetStateAction<McpServerUpsert>>;
  readonly mcpEnvText: string;
  readonly setMcpEnvText: Dispatch<SetStateAction<string>>;
  readonly mcpHeadersText: string;
  readonly setMcpHeadersText: Dispatch<SetStateAction<string>>;
  readonly editingMcpServerId: string | null;
  readonly canSaveMcpServer: boolean;
  readonly mcpServerPreviewError: string | null;
  readonly mcpServerPreview: McpServerSavePreview | null;
  readonly onSaveMcpServer: () => void;
  readonly onResetMcpServer: () => void;
  readonly mcpBindingForm: AppMcpBindingUpsert;
  readonly setMcpBindingForm: Dispatch<SetStateAction<AppMcpBindingUpsert>>;
  readonly editingMcpBindingId: string | null;
  readonly canSaveMcpBinding: boolean;
  readonly mcpBindingPreview: McpBindingSavePreview | null;
  readonly onSaveMcpBinding: () => void;
  readonly onResetMcpBinding: () => void;
  readonly isWorking: boolean;
};

export const McpFormsPanel = ({
  snapshot,
  mcpServers,
  mcpServerForm,
  setMcpServerForm,
  mcpEnvText,
  setMcpEnvText,
  mcpHeadersText,
  setMcpHeadersText,
  editingMcpServerId,
  canSaveMcpServer,
  mcpServerPreviewError,
  mcpServerPreview,
  onSaveMcpServer,
  onResetMcpServer,
  mcpBindingForm,
  setMcpBindingForm,
  editingMcpBindingId,
  canSaveMcpBinding,
  mcpBindingPreview,
  onSaveMcpBinding,
  onResetMcpBinding,
  isWorking
}: McpFormsPanelProps): JSX.Element => {
  const { t, locale } = useI18n();
  const [serverDangerConfirmed, setServerDangerConfirmed] = useState(false);
  const [bindingDangerConfirmed, setBindingDangerConfirmed] = useState(false);
  const mcpGovernanceEntries = buildMcpGovernanceEntries(snapshot, locale);
  const preferredBindingServerId =
    mcpServers.find((server) => !mcpBindingPreview?.siblingServerIds.includes(server.id))?.id ??
    mcpServers[0]?.id ??
    "";
  const relatedServerEntries = mcpGovernanceEntries.filter(
    (entry) =>
      entry.problemServerIds.includes(mcpServerForm.id) || entry.affectedServerIds.includes(mcpServerForm.id)
  );
  const relatedBindingEntries = mcpGovernanceEntries.filter(
    (entry) =>
      entry.problemBindingIds.includes(mcpBindingForm.id) || entry.appCode === mcpBindingForm.appCode
  );
  const serverConflictInsight = buildMcpServerConflictInsight(snapshot, mcpServerForm.id, locale);
  const bindingConflictInsight = buildMcpBindingConflictInsight(
    snapshot,
    mcpBindingForm.id,
    mcpBindingForm.appCode,
    locale
  );
  const mcpServerNotice =
    mcpServerPreview === null
      ? null
      : buildMcpSaveNotice(locale, {
          level:
            (!mcpServerForm.command?.trim() && mcpServerForm.transport === "stdio") ||
            (!mcpServerForm.url?.trim() && mcpServerForm.transport === "http")
              ? "high"
              : mcpServerPreview.warnings.length > 0
                ? "medium"
                : "low",
          summary:
            locale === "zh-CN"
              ? !mcpServerForm.command?.trim() && mcpServerForm.transport === "stdio"
                ? "当前 stdio MCP server 缺少 command，保存后无法可靠启动。"
                : !mcpServerForm.url?.trim() && mcpServerForm.transport === "http"
                  ? "当前 http MCP server 缺少 url，保存后无法可靠连接。"
                  : mcpServerPreview.usage.enabledApps.length > 0 && mcpServerForm.enabled
                    ? "这个 MCP server 已被启用应用引用，直接修改会影响现有接入链路。"
                    : "当前 MCP server 预检没有明显阻断项。"
              : !mcpServerForm.command?.trim() && mcpServerForm.transport === "stdio"
                ? "This stdio MCP server is missing a command and will not start reliably after saving."
                : !mcpServerForm.url?.trim() && mcpServerForm.transport === "http"
                  ? "This http MCP server is missing a url and will not connect reliably after saving."
                  : mcpServerPreview.usage.enabledApps.length > 0 && mcpServerForm.enabled
                    ? "This MCP server is already referenced by enabled apps, so editing it will affect active integrations."
                    : "No obvious MCP server blocker was found in the current preview.",
          suggestions:
            locale === "zh-CN"
              ? [
                  "stdio transport 需要 command，http transport 需要 url。",
                  "如果该 server 已被启用应用引用，优先止损方式是先停用再修改。",
                  "保存前确认 impact 面板里的受影响应用是否符合预期。"
                ]
              : [
                  "A stdio transport requires a command, and a http transport requires a url.",
                  "If enabled apps already reference this server, disable it first before making disruptive changes.",
                  "Confirm the impacted apps in the impact panel before saving."
                ]
        });
  const mcpBindingNotice =
    mcpBindingPreview === null
      ? null
      : buildMcpSaveNotice(locale, {
          level:
            mcpBindingPreview.serverExists === false || mcpBindingPreview.siblingBindingIds.length > 0
              ? "high"
              : mcpBindingPreview.warnings.length > 0
                ? "medium"
                : "low",
          summary:
            locale === "zh-CN"
              ? mcpBindingPreview.serverExists === false
                ? "当前 MCP Binding 指向不存在的 server，保存后链路不会闭合。"
                : mcpBindingPreview.siblingBindingIds.length > 0
                  ? "当前应用已存在重复 MCP Binding，继续保存会放大冲突。"
                  : "当前 MCP Binding 预检没有明显阻断项。"
              : mcpBindingPreview.serverExists === false
                ? "This MCP binding points to a missing server, so the integration path will remain incomplete after saving."
                : mcpBindingPreview.siblingBindingIds.length > 0
                  ? "This app already has duplicate MCP bindings, so saving again will amplify the conflict."
                  : "No obvious MCP binding blocker was found in the current preview.",
          suggestions:
            locale === "zh-CN"
              ? [
                  "缺失 server 时先修 server，再回到 binding。",
                  "重复 binding 优先停用或合并，不要继续叠加。",
                  "保存前确认 sibling server 是否真的是你要接管的目标。"
                ]
              : [
                  "Fix the server first when it is missing, then return to the binding.",
                  "Disable or merge duplicate bindings instead of stacking more.",
                  "Confirm the sibling server list before saving."
                ]
        });
  const serverRequiresDangerConfirm = mcpServerNotice?.level === "high";
  const bindingRequiresDangerConfirm = mcpBindingNotice?.level === "high";

  return (
    <>
      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveMcpServer();
        }}
      >
        <h3>{t("dashboard.forms.mcpServerTitle")}</h3>
        {editingMcpServerId ? (
          <p className="form-hint">
            {t("dashboard.mcp.editingServer")}: {editingMcpServerId}
          </p>
        ) : null}
        <input
          value={mcpServerForm.id}
          onChange={(event) => setMcpServerForm({ ...mcpServerForm, id: event.target.value })}
          placeholder={t("dashboard.forms.id")}
        />
        <input
          value={mcpServerForm.name}
          onChange={(event) => setMcpServerForm({ ...mcpServerForm, name: event.target.value })}
          placeholder={t("dashboard.forms.name")}
        />
        <select
          value={mcpServerForm.transport}
          onChange={(event) =>
            setMcpServerForm({
              ...mcpServerForm,
              transport: event.target.value as McpServerUpsert["transport"]
            })
          }
        >
          <option value="stdio">stdio</option>
          <option value="http">http</option>
        </select>
        {mcpServerForm.transport === "stdio" ? (
          <>
            <input
              value={mcpServerForm.command ?? ""}
              onChange={(event) =>
                setMcpServerForm({ ...mcpServerForm, command: event.target.value })
              }
              placeholder={t("dashboard.forms.mcpCommand")}
            />
            <input
              value={mcpServerForm.args.join(", ")}
              onChange={(event) =>
                setMcpServerForm({
                  ...mcpServerForm,
                  args: splitValues(event.target.value)
                })
              }
              placeholder={t("dashboard.forms.mcpArgs")}
            />
            <textarea
              className="json-editor compact"
              value={mcpEnvText}
              onChange={(event) => setMcpEnvText(event.target.value)}
              placeholder={t("dashboard.forms.mcpEnv")}
            />
          </>
        ) : (
          <>
            <input
              value={mcpServerForm.url ?? ""}
              onChange={(event) =>
                setMcpServerForm({ ...mcpServerForm, url: event.target.value })
              }
              placeholder={t("dashboard.forms.mcpUrl")}
            />
            <textarea
              className="json-editor compact"
              value={mcpHeadersText}
              onChange={(event) => setMcpHeadersText(event.target.value)}
              placeholder={t("dashboard.forms.mcpHeaders")}
            />
          </>
        )}
        <label className="checkbox-row">
          <input
            checked={mcpServerForm.enabled}
            onChange={(event) =>
              setMcpServerForm({ ...mcpServerForm, enabled: event.target.checked })
            }
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button
          className="auth-button"
          type="submit"
          disabled={isWorking || !canSaveMcpServer || (serverRequiresDangerConfirm && !serverDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        <button className="inline-action" type="button" disabled={isWorking} onClick={onResetMcpServer}>
          {t("dashboard.mcp.resetEditor")}
        </button>
        {!canSaveMcpServer && !mcpServerPreviewError ? (
          <p className="form-hint">{t("dashboard.forms.previewRequired")}</p>
        ) : null}
        {mcpServerPreviewError ? <p className="form-hint">{mcpServerPreviewError}</p> : null}
        {mcpServerPreview ? (
          <div className="preview-item">
            <strong>{t("dashboard.mcp.serverPreviewTitle")}</strong>
            <p>
              {t("dashboard.mcp.previewServerExists")}:{" "}
              {mcpServerPreview.exists ? t("common.enabled") : t("common.disabled")}
            </p>
            <p>
              {t("dashboard.mcp.previewChangedFields")}:{" "}
              {mcpServerPreview.changedFields.length > 0
                ? mcpServerPreview.changedFields.map((field) => renderMcpChangedField(field, t)).join(", ")
                : t("common.notFound")}
            </p>
            <p>
              {t("dashboard.mcp.previewBoundApps")}:{" "}
              {joinPreviewValues(mcpServerPreview.usage.boundApps, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.mcp.previewEnabledApps")}:{" "}
              {joinPreviewValues(mcpServerPreview.usage.enabledApps, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.mcp.previewImportedApps")}:{" "}
              {joinPreviewValues(mcpServerPreview.usage.importedFromApps, t("common.notFound"))}
            </p>
            <p>
              {localize(locale, "关联运行态应用", "Related Runtime Apps")}:{" "}
              {joinPreviewValues(mcpServerPreview.runtimeAppCodes, t("common.notFound"))}
            </p>
            <p>
              {localize(locale, "关联运行态问题", "Related Runtime Issues")}:{" "}
              {mcpServerPreview.runtimeIssueCodes.length > 0
                ? mcpServerPreview.runtimeIssueCodes.map((item) => renderMcpIssueCode(item, t)).join(", ")
                : t("dashboard.workspace.noWarnings")}
            </p>
            <p>
              {localize(locale, "受影响绑定", "Affected Bindings")}:{" "}
              {joinPreviewValues(mcpServerPreview.affectedBindingIds, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.mcp.previewWarnings")}:{" "}
              {joinDashboardWarnings(mcpServerPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            {mcpServerNotice ? <GovernanceNoticeCard notice={mcpServerNotice} locale={locale} /> : null}
            {relatedServerEntries.length > 0 ? (
              <div className="preview-item">
                <strong>{localize(locale, "关联治理队列", "Related Governance Queue")}</strong>
                {relatedServerEntries.slice(0, 2).map((entry) => (
                  <p key={`server-governance-${entry.appCode}`}>
                    {entry.appCode}: {entry.summary}
                  </p>
                ))}
              </div>
            ) : null}
            {serverConflictInsight ? (
              <div className="preview-item">
                <strong>{serverConflictInsight.title}</strong>
                <p>{serverConflictInsight.summary}</p>
                {serverConflictInsight.reasons.map((item) => (
                  <p key={`server-conflict-reason-${item}`}>{item}</p>
                ))}
                {serverConflictInsight.nextActions.map((item) => (
                  <p key={`server-conflict-next-${item}`}>{item}</p>
                ))}
              </div>
            ) : null}
            <div className="quick-action-row">
              {mcpServerForm.enabled &&
              (mcpServerPreview.warnings.length > 0 || mcpServerPreview.usage.enabledApps.length > 0) ? (
                <button
                  className="inline-action danger"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setMcpServerForm({ ...mcpServerForm, enabled: false })}
                >
                  {localize(locale, "先停用该服务器", "Disable Server First")}
                </button>
              ) : null}
              {mcpServerForm.transport === "stdio" && !mcpServerForm.command?.trim() ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setMcpServerForm({ ...mcpServerForm, command: "npx" })}
                >
                  {localize(locale, "补一个 npx 启动命令", "Insert npx Command")}
                </button>
              ) : null}
              {mcpServerForm.transport === "http" && !mcpServerForm.url?.trim() ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setMcpServerForm({
                      ...mcpServerForm,
                      url: "http://127.0.0.1:3000/mcp"
                    })
                  }
                >
                  {localize(locale, "填入本地 HTTP 模板", "Insert Local HTTP Template")}
                </button>
              ) : null}
              {mcpServerForm.transport === "stdio" && Object.keys(mcpServerForm.env).length === 0 ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setMcpEnvText('{\n  "NODE_ENV": "production"\n}')}
                >
                  {localize(locale, "填入基础环境变量模板", "Insert Env Template")}
                </button>
              ) : null}
              {mcpServerForm.transport === "http" && Object.keys(mcpServerForm.headers).length === 0 ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() => setMcpHeadersText('{\n  "Authorization": "Bearer <token>"\n}')}
                >
                  {localize(locale, "填入请求头模板", "Insert Header Template")}
                </button>
              ) : null}
            </div>
            {serverRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  checked={serverDangerConfirmed}
                  onChange={(event) => setServerDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认这个 MCP server 仍有高风险缺口，保存只用于临时修复或止损。",
                  "I understand this MCP server still has high-risk gaps and this save is only for temporary repair or containment."
                )}
              </label>
            ) : null}
            <strong>{t("dashboard.mcp.impactTitle")}</strong>
            <ConfigImpactSummary impact={mcpServerPreview.impact} t={t} />
          </div>
        ) : null}
      </form>

      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveMcpBinding();
        }}
      >
        <h3>{t("dashboard.forms.mcpBindingTitle")}</h3>
        {editingMcpBindingId ? (
          <p className="form-hint">
            {t("dashboard.mcp.editingBinding")}: {editingMcpBindingId}
          </p>
        ) : null}
        <input
          value={mcpBindingForm.id}
          onChange={(event) => setMcpBindingForm({ ...mcpBindingForm, id: event.target.value })}
          placeholder={t("dashboard.forms.id")}
        />
        <select
          value={mcpBindingForm.appCode}
          onChange={(event) =>
            setMcpBindingForm({
              ...mcpBindingForm,
              appCode: event.target.value as AppMcpBindingUpsert["appCode"]
            })
          }
        >
          <option value="codex">codex</option>
          <option value="claude-code">claude-code</option>
          <option value="gemini-cli">gemini-cli</option>
          <option value="opencode">opencode</option>
          <option value="openclaw">openclaw</option>
        </select>
        <select
          value={mcpBindingForm.serverId}
          onChange={(event) =>
            setMcpBindingForm({ ...mcpBindingForm, serverId: event.target.value })
          }
          disabled={mcpServers.length === 0}
        >
          {mcpServers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.id}
            </option>
          ))}
        </select>
        <label className="checkbox-row">
          <input
            checked={mcpBindingForm.enabled}
            onChange={(event) =>
              setMcpBindingForm({ ...mcpBindingForm, enabled: event.target.checked })
            }
            type="checkbox"
          />{" "}
          {t("common.enabled")}
        </label>
        <button
          className="auth-button"
          type="submit"
          disabled={isWorking || !canSaveMcpBinding || (bindingRequiresDangerConfirm && !bindingDangerConfirmed)}
        >
          {t("common.save")}
        </button>
        <button className="inline-action" type="button" disabled={isWorking} onClick={onResetMcpBinding}>
          {t("dashboard.mcp.resetEditor")}
        </button>
        {mcpServers.length === 0 ? (
          <p className="form-hint">{t("dashboard.mcp.bindingRequiresServer")}</p>
        ) : !canSaveMcpBinding ? (
          <p className="form-hint">{t("dashboard.forms.previewRequired")}</p>
        ) : null}
        {mcpBindingPreview ? (
          <div className="preview-item">
            <strong>{t("dashboard.mcp.bindingPreviewTitle")}</strong>
            <p>
              {t("dashboard.mcp.previewServerExists")}:{" "}
              {mcpBindingPreview.serverExists ? t("common.enabled") : t("common.disabled")}
            </p>
            <p>
              {t("dashboard.mcp.previewSiblingBindings")}:{" "}
              {joinPreviewValues(mcpBindingPreview.siblingBindingIds, t("common.notFound"))}
            </p>
            <p>
              {t("dashboard.mcp.previewSiblingServers")}:{" "}
              {joinPreviewValues(mcpBindingPreview.siblingServerIds, t("common.notFound"))}
            </p>
            <p>
              {localize(locale, "当前运行态", "Current Runtime Status")}:{" "}
              {mcpBindingPreview.runtimeStatus}
            </p>
            <p>
              {localize(locale, "应用运行态问题", "App Runtime Issues")}:{" "}
              {mcpBindingPreview.runtimeIssueCodes.length > 0
                ? mcpBindingPreview.runtimeIssueCodes.map((item) => renderMcpIssueCode(item, t)).join(", ")
                : t("dashboard.workspace.noWarnings")}
            </p>
            <p>
              {localize(locale, "宿主机漂移", "Host Drift")}:{" "}
              {mcpBindingPreview.hostDrifted ? t("common.enabled") : t("common.disabled")}
            </p>
            <p>
              {t("dashboard.mcp.previewWarnings")}:{" "}
              {joinDashboardWarnings(mcpBindingPreview.warnings, locale, t("dashboard.workspace.noWarnings"))}
            </p>
            {mcpBindingNotice ? <GovernanceNoticeCard notice={mcpBindingNotice} locale={locale} /> : null}
            {relatedBindingEntries.length > 0 ? (
              <div className="preview-item">
                <strong>{localize(locale, "关联治理队列", "Related Governance Queue")}</strong>
                {relatedBindingEntries.slice(0, 2).map((entry) => (
                  <p key={`binding-governance-${entry.appCode}`}>
                    {entry.appCode}: {entry.summary}
                  </p>
                ))}
              </div>
            ) : null}
            {bindingConflictInsight ? (
              <div className="preview-item">
                <strong>{bindingConflictInsight.title}</strong>
                <p>{bindingConflictInsight.summary}</p>
                {bindingConflictInsight.reasons.map((item) => (
                  <p key={`binding-conflict-reason-${item}`}>{item}</p>
                ))}
                {bindingConflictInsight.nextActions.map((item) => (
                  <p key={`binding-conflict-next-${item}`}>{item}</p>
                ))}
              </div>
            ) : null}
            <div className="quick-action-row">
              {!mcpBindingPreview.serverExists && preferredBindingServerId ? (
                <button
                  className="inline-action"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setMcpBindingForm({
                      ...mcpBindingForm,
                      serverId: preferredBindingServerId
                    })
                  }
                >
                  {localize(locale, "切换到建议服务器", "Use Suggested Server")}
                </button>
              ) : null}
              {mcpBindingPreview.siblingBindingIds.length > 0 && mcpBindingForm.enabled ? (
                <button
                  className="inline-action danger"
                  type="button"
                  disabled={isWorking}
                  onClick={() =>
                    setMcpBindingForm({
                      ...mcpBindingForm,
                      enabled: false
                    })
                  }
                >
                  {localize(locale, "先停用当前重复绑定", "Disable Duplicate Binding")}
                </button>
              ) : null}
            </div>
            {bindingRequiresDangerConfirm ? (
              <label className="checkbox-row danger-confirm-row">
                <input
                  checked={bindingDangerConfirmed}
                  onChange={(event) => setBindingDangerConfirmed(event.target.checked)}
                  type="checkbox"
                />{" "}
                {localize(
                  locale,
                  "我已确认这个 MCP Binding 预检仍未通过，保存后可能继续冲突或失效。",
                  "I understand this MCP binding preview is still unsafe and saving may continue to produce conflicts or broken integrations."
                )}
              </label>
            ) : null}
            <strong>{t("dashboard.mcp.impactTitle")}</strong>
            <ConfigImpactSummary impact={mcpBindingPreview.impact} t={t} />
          </div>
        ) : null}
      </form>
    </>
  );
};
