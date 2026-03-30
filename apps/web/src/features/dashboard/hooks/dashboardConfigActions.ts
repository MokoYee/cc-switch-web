import type {
  AppBindingUpsert,
  AppMcpBinding,
  AppMcpBindingUpsert,
  AppQuotaUpsert,
  FailoverChainUpsert,
  McpServer,
  McpServerUpsert,
  ProviderUpsert,
  ProxyPolicy
} from "cc-switch-web-shared";
import type { Dispatch, SetStateAction } from "react";

import {
  saveAppMcpBinding,
  saveAppQuota,
  saveBinding,
  saveFailoverChain,
  saveMcpServer,
  saveProvider,
  saveProxyPolicy
} from "../api/load-dashboard-snapshot.js";
import {
  buildBindingSavedFollowUpNotice,
  buildFailoverSavedFollowUpNotice,
  buildMcpBindingSavedFollowUpNotice,
  buildMcpServerSavedFollowUpNotice,
  buildProviderSavedFollowUpNotice,
  buildProxyPolicySavedFollowUpNotice,
  buildQuotaSavedFollowUpNotice
} from "../lib/dashboardFollowUp.js";
import {
  buildAppQuotaEditorState,
  buildBindingEditorState,
  buildFailoverEditorState,
  buildMcpServerEditorInput,
  buildProviderEditorState
} from "../lib/editorConsistency.js";
import { writeDashboardEditorSelection } from "../lib/editorBootstrapStorage.js";

import {
  type DashboardActionLocale,
  type DashboardActionOpenAuditFocus,
  type DashboardActionRunAction,
  type DashboardActionSetFollowUpNotice
} from "./dashboardActionTypes.js";

type ConfigTranslationKey =
  | "dashboard.forms.saveSuccess"
  | "dashboard.mcp.bindingRequiresServer"
  | "dashboard.onboarding.bindingRequiresProvider"
  | "dashboard.onboarding.failoverRequiresProvider";

type CreateDashboardMcpFormActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: ConfigTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly setErrorMessage: (value: string | null) => void;
  readonly openAuditFocus: DashboardActionOpenAuditFocus;
  readonly snapshotMcpServersLength: number;
  readonly mcpServerForm: McpServerUpsert;
  readonly mcpEnvText: string;
  readonly mcpHeadersText: string;
  readonly mcpBindingForm: AppMcpBindingUpsert;
  readonly loadMcpServerToEditor: (item: McpServer) => void;
  readonly loadMcpBindingToEditor: (item: AppMcpBinding) => void;
};

export const createDashboardMcpFormActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  setErrorMessage,
  openAuditFocus,
  snapshotMcpServersLength,
  mcpServerForm,
  mcpEnvText,
  mcpHeadersText,
  mcpBindingForm,
  loadMcpServerToEditor,
  loadMcpBindingToEditor
}: CreateDashboardMcpFormActionsParams) => ({
  saveMcpServer: () =>
    runAction(
      async () => {
        const { item } = await saveMcpServer(
          buildMcpServerEditorInput(mcpServerForm, mcpEnvText, mcpHeadersText)
        );
        loadMcpServerToEditor(item);
        openAuditFocus({
          source: "mcp"
        });
        setFollowUpNotice(buildMcpServerSavedFollowUpNotice(locale));
      },
      t("dashboard.forms.saveSuccess")
    ),
  saveMcpBinding: () => {
    if (snapshotMcpServersLength === 0) {
      setErrorMessage(t("dashboard.mcp.bindingRequiresServer"));
      return;
    }
    return runAction(
      async () => {
        const { item } = await saveAppMcpBinding(mcpBindingForm);
        loadMcpBindingToEditor(item);
        openAuditFocus({
          source: "mcp",
          appCode: item.appCode
        });
        setFollowUpNotice(buildMcpBindingSavedFollowUpNotice(locale, item));
      },
      t("dashboard.forms.saveSuccess")
    );
  }
});

type CreateDashboardRoutingActionsParams = {
  readonly locale: DashboardActionLocale;
  readonly t: (key: ConfigTranslationKey) => string;
  readonly runAction: DashboardActionRunAction;
  readonly setFollowUpNotice: DashboardActionSetFollowUpNotice;
  readonly setErrorMessage: (value: string | null) => void;
  readonly openAuditFocus: DashboardActionOpenAuditFocus;
  readonly hasProviders: boolean;
  readonly providerForm: ProviderUpsert;
  readonly bindingForm: AppBindingUpsert;
  readonly appQuotaForm: AppQuotaUpsert;
  readonly proxyForm: ProxyPolicy;
  readonly failoverForm: FailoverChainUpsert;
  readonly setProviderForm: Dispatch<SetStateAction<ProviderUpsert>>;
  readonly setBindingForm: Dispatch<SetStateAction<AppBindingUpsert>>;
  readonly setAppQuotaForm: Dispatch<SetStateAction<AppQuotaUpsert>>;
  readonly setProxyForm: Dispatch<SetStateAction<ProxyPolicy>>;
  readonly setFailoverForm: Dispatch<SetStateAction<FailoverChainUpsert>>;
  readonly refreshProviderDiagnosticDetail: (providerId: string) => void;
  readonly focusProviderFailureLogs: (providerId: string) => void;
  readonly focusAppLogs: (appCode: AppMcpBinding["appCode"]) => void;
};

export const createDashboardRoutingActions = ({
  locale,
  t,
  runAction,
  setFollowUpNotice,
  setErrorMessage,
  openAuditFocus,
  hasProviders,
  providerForm,
  bindingForm,
  appQuotaForm,
  proxyForm,
  failoverForm,
  setProviderForm,
  setBindingForm,
  setAppQuotaForm,
  setProxyForm,
  setFailoverForm,
  refreshProviderDiagnosticDetail,
  focusProviderFailureLogs,
  focusAppLogs
}: CreateDashboardRoutingActionsParams) => ({
  saveProvider: () =>
    runAction(async () => {
      const { item } = await saveProvider(providerForm);
      writeDashboardEditorSelection("provider", item.id);
      setProviderForm(buildProviderEditorState(item));
      refreshProviderDiagnosticDetail(item.id);
      focusProviderFailureLogs(item.id);
      openAuditFocus({
        source: "provider-health",
        providerId: item.id
      });
      setFollowUpNotice(buildProviderSavedFollowUpNotice(locale, item));
    }, t("dashboard.forms.saveSuccess")),
  saveBinding: () => {
    if (!hasProviders) {
      setErrorMessage(t("dashboard.onboarding.bindingRequiresProvider"));
      return;
    }
    return runAction(async () => {
      const { item } = await saveBinding(bindingForm);
      setBindingForm(buildBindingEditorState(item));
      focusAppLogs(item.appCode);
      setFollowUpNotice(buildBindingSavedFollowUpNotice(locale, item));
    }, t("dashboard.forms.saveSuccess"));
  },
  saveAppQuota: () =>
    runAction(async () => {
      const { item } = await saveAppQuota(appQuotaForm);
      writeDashboardEditorSelection("app-quota", item.id);
      setAppQuotaForm(buildAppQuotaEditorState(item));
      focusAppLogs(item.appCode);
      openAuditFocus({
        source: "quota",
        appCode: item.appCode
      });
      setFollowUpNotice(buildQuotaSavedFollowUpNotice(locale, item));
    }, t("dashboard.forms.saveSuccess")),
  saveProxyPolicy: () =>
    runAction(async () => {
      const status = await saveProxyPolicy(proxyForm);
      setProxyForm(status.policy);
      openAuditFocus({
        source: "proxy-request"
      });
      setFollowUpNotice(buildProxyPolicySavedFollowUpNotice(locale));
    }, t("dashboard.forms.saveSuccess")),
  saveFailover: () => {
    if (!hasProviders) {
      setErrorMessage(t("dashboard.onboarding.failoverRequiresProvider"));
      return;
    }
    return runAction(async () => {
      const { item } = await saveFailoverChain(failoverForm);
      setFailoverForm(buildFailoverEditorState(item));
      focusAppLogs(item.appCode);
      setFollowUpNotice(buildFailoverSavedFollowUpNotice(locale, item));
    }, t("dashboard.forms.saveSuccess"));
  }
});
