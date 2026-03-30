import { useEffect, useState } from "react";

import type {
  AppBindingRoutingPreview,
  AppBindingUpsert,
  AppMcpBindingUpsert,
  AppQuotaSavePreview,
  AppQuotaUpsert,
  ConfigRestorePreview,
  ConfigSnapshotDiff,
  FailoverChainRoutingPreview,
  FailoverChainUpsert,
  McpBindingSavePreview,
  McpGovernanceRepairPreview,
  McpHostSyncPreview,
  McpImportOptions,
  McpServerSavePreview,
  McpServerUpsert,
  PromptHostImportPreview,
  PromptHostSyncPreview,
  PromptTemplateSavePreview,
  PromptTemplateUpsert,
  ProviderRoutingPreview,
  ProviderUpsert,
  ProxyPolicy,
  ProxyPolicySavePreview,
  SessionRecordUpsert,
  SessionSavePreview,
  SkillSavePreview,
  SkillUpsert,
  WorkspaceSavePreview,
  WorkspaceUpsert
} from "@cc-switch-web/shared";

import {
  loadSnapshotByVersion,
  loadSnapshotDiffByVersion,
  previewAppMcpBindingUpsert,
  previewAppQuotaUpsert,
  previewBindingUpsert,
  previewFailoverChainUpsert,
  previewMcpGovernanceRepair,
  previewHostMcpSyncApply,
  previewPromptHostImport,
  previewPromptHostSyncApply,
  previewMcpServerUpsert,
  previewPromptTemplateUpsert,
  previewProviderUpsert,
  previewProxyPolicyUpdate,
  previewRestoreSnapshotVersion,
  previewSessionRecordUpsert,
  previewSkillUpsert,
  previewWorkspaceUpsert,
  type DashboardSnapshot
} from "../api/load-dashboard-snapshot.js";
import {
  buildMcpServerEditorInput,
  buildMcpServerEditorSignature,
  buildPreviewSignature,
  canPreviewBindingUpsert,
  canPreviewFailoverChainUpsert,
  isPreviewInSync
} from "../lib/editorConsistency.js";
import {
  buildPromptTemplatePreviewState,
  buildSkillPreviewState,
  buildWorkspacePreviewState,
  isPromptTemplatePreviewInSync,
  isSkillPreviewInSync,
  isWorkspacePreviewInSync
} from "../lib/previewConsistency.js";

type UseDashboardPreviewStateParams = {
  readonly snapshot: DashboardSnapshot | null;
  readonly selectedSnapshotVersion: number | null;
  readonly setErrorMessage: (message: string | null) => void;
  readonly promptTemplateForm: PromptTemplateUpsert;
  readonly promptTagsText: string;
  readonly skillForm: SkillUpsert;
  readonly skillTagsText: string;
  readonly workspaceForm: WorkspaceUpsert;
  readonly workspaceTagsText: string;
  readonly sessionForm: SessionRecordUpsert;
  readonly appQuotaForm: AppQuotaUpsert;
  readonly proxyForm: ProxyPolicy;
  readonly providerForm: ProviderUpsert;
  readonly bindingForm: AppBindingUpsert;
  readonly failoverForm: FailoverChainUpsert;
  readonly mcpServerForm: McpServerUpsert;
  readonly mcpEnvText: string;
  readonly mcpHeadersText: string;
  readonly mcpBindingForm: AppMcpBindingUpsert;
  readonly mcpImportOptions: McpImportOptions;
};

export const useDashboardPreviewState = ({
  snapshot,
  selectedSnapshotVersion,
  setErrorMessage,
  promptTemplateForm,
  promptTagsText,
  skillForm,
  skillTagsText,
  workspaceForm,
  workspaceTagsText,
  sessionForm,
  appQuotaForm,
  proxyForm,
  providerForm,
  bindingForm,
  failoverForm,
  mcpServerForm,
  mcpEnvText,
  mcpHeadersText,
  mcpBindingForm,
  mcpImportOptions
}: UseDashboardPreviewStateParams) => {
  const hasProviders = (snapshot?.providers.length ?? 0) > 0;
  const [promptTemplatePreview, setPromptTemplatePreview] = useState<PromptTemplateSavePreview | null>(null);
  const [promptTemplatePreviewSignature, setPromptTemplatePreviewSignature] = useState("");
  const [skillPreview, setSkillPreview] = useState<SkillSavePreview | null>(null);
  const [skillPreviewSignature, setSkillPreviewSignature] = useState("");
  const [workspacePreview, setWorkspacePreview] = useState<WorkspaceSavePreview | null>(null);
  const [workspacePreviewSignature, setWorkspacePreviewSignature] = useState("");
  const [sessionPreview, setSessionPreview] = useState<SessionSavePreview | null>(null);
  const [sessionPreviewSignature, setSessionPreviewSignature] = useState("");
  const [appQuotaPreview, setAppQuotaPreview] = useState<AppQuotaSavePreview | null>(null);
  const [appQuotaPreviewSignature, setAppQuotaPreviewSignature] = useState("");
  const [proxyPolicyPreview, setProxyPolicyPreview] = useState<ProxyPolicySavePreview | null>(null);
  const [proxyPolicyPreviewSignature, setProxyPolicyPreviewSignature] = useState("");
  const [restorePreview, setRestorePreview] = useState<ConfigRestorePreview | null>(null);
  const [restorePreviewVersion, setRestorePreviewVersion] = useState<number | null>(null);
  const [selectedSnapshotDetail, setSelectedSnapshotDetail] = useState<DashboardSnapshot["latestSnapshot"] | null>(null);
  const [selectedSnapshotDiff, setSelectedSnapshotDiff] = useState<ConfigSnapshotDiff | null>(null);
  const [mcpServerPreview, setMcpServerPreview] = useState<McpServerSavePreview | null>(null);
  const [mcpServerPreviewSignature, setMcpServerPreviewSignature] = useState("");
  const [mcpBindingPreview, setMcpBindingPreview] = useState<McpBindingSavePreview | null>(null);
  const [mcpBindingPreviewSignature, setMcpBindingPreviewSignature] = useState("");
  const [mcpHostSyncPreview, setMcpHostSyncPreview] = useState<Record<string, McpHostSyncPreview | null>>({});
  const [promptHostSyncPreview, setPromptHostSyncPreview] = useState<Record<string, PromptHostSyncPreview | null>>({});
  const [promptHostImportPreview, setPromptHostImportPreview] = useState<Record<string, PromptHostImportPreview | null>>({});
  const [mcpGovernancePreview, setMcpGovernancePreview] = useState<Record<string, McpGovernanceRepairPreview | null>>({});
  const [providerPreview, setProviderPreview] = useState<ProviderRoutingPreview | null>(null);
  const [providerPreviewSignature, setProviderPreviewSignature] = useState("");
  const [bindingPreview, setBindingPreview] = useState<AppBindingRoutingPreview | null>(null);
  const [bindingPreviewSignature, setBindingPreviewSignature] = useState("");
  const [failoverPreview, setFailoverPreview] = useState<FailoverChainRoutingPreview | null>(null);
  const [failoverPreviewSignature, setFailoverPreviewSignature] = useState("");
  const [mcpServerPreviewError, setMcpServerPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (snapshot === null) {
      setMcpServerPreview(null);
      setMcpServerPreviewError(null);
      setMcpServerPreviewSignature("");
      return;
    }

    try {
      const input: McpServerUpsert = buildMcpServerEditorInput(
        mcpServerForm,
        mcpEnvText,
        mcpHeadersText
      );
      let cancelled = false;
      const signature = buildMcpServerEditorSignature(
        mcpServerForm,
        mcpEnvText,
        mcpHeadersText
      );
      setMcpServerPreviewError(null);

      void previewMcpServerUpsert(input)
        .then((result) => {
          if (!cancelled) {
            setMcpServerPreview(result);
            setMcpServerPreviewSignature(signature);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setMcpServerPreview(null);
            setMcpServerPreviewSignature("");
            setMcpServerPreviewError(error instanceof Error ? error.message : "unknown error");
          }
        });

      return () => {
        cancelled = true;
      };
    } catch (error) {
      setMcpServerPreview(null);
      setMcpServerPreviewSignature("");
      setMcpServerPreviewError(error instanceof Error ? error.message : "unknown error");
    }
  }, [snapshot, mcpServerForm, mcpEnvText, mcpHeadersText]);

  useEffect(() => {
    if (snapshot === null || snapshot.mcpServers.length === 0) {
      setMcpBindingPreview(null);
      setMcpBindingPreviewSignature("");
      return;
    }

    let cancelled = false;
    const signature = buildPreviewSignature(mcpBindingForm);
    void previewAppMcpBindingUpsert(mcpBindingForm)
      .then((result) => {
        if (!cancelled) {
          setMcpBindingPreview(result);
          setMcpBindingPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMcpBindingPreview(null);
          setMcpBindingPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot, mcpBindingForm]);

  useEffect(() => {
    if (snapshot === null) {
      setMcpHostSyncPreview({});
      return;
    }

    const appCodes = snapshot.mcpHostSyncCapabilities
      .filter((item) => item.supportLevel === "managed")
      .map((item) => item.appCode);
    let cancelled = false;

    void Promise.all(
      appCodes.map(async (appCode) => [appCode, await previewHostMcpSyncApply(appCode)] as const)
    )
      .then((items) => {
        if (!cancelled) {
          setMcpHostSyncPreview(Object.fromEntries(items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMcpHostSyncPreview({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot, mcpImportOptions]);

  useEffect(() => {
    if (snapshot === null) {
      setPromptHostSyncPreview({});
      return;
    }

    const appCodes = snapshot.promptHostSyncCapabilities
      .filter((item) => item.supportLevel === "managed")
      .map((item) => item.appCode);
    let cancelled = false;

    void Promise.all(
      appCodes.map(async (appCode) => [appCode, await previewPromptHostSyncApply(appCode)] as const)
    )
      .then((items) => {
        if (!cancelled) {
          setPromptHostSyncPreview(Object.fromEntries(items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromptHostSyncPreview({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  useEffect(() => {
    if (snapshot === null) {
      setPromptHostImportPreview({});
      return;
    }

    const appCodes = snapshot.promptHostSyncCapabilities
      .filter((item) => item.supportLevel === "managed")
      .map((item) => item.appCode);
    let cancelled = false;

    void Promise.all(
      appCodes.map(async (appCode) => [appCode, await previewPromptHostImport(appCode)] as const)
    )
      .then((items) => {
        if (!cancelled) {
          setPromptHostImportPreview(Object.fromEntries(items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromptHostImportPreview({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  useEffect(() => {
    if (snapshot === null) {
      setMcpGovernancePreview({});
      return;
    }

    const appCodes = snapshot.mcpRuntimeViews
      .filter((item) => item.issueCodes.length > 0 || item.hostState.drifted)
      .map((item) => item.appCode);
    if (appCodes.length === 0) {
      setMcpGovernancePreview({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      appCodes.map(async (appCode) => [appCode, await previewMcpGovernanceRepair(appCode)] as const)
    )
      .then((items) => {
        if (!cancelled) {
          setMcpGovernancePreview(Object.fromEntries(items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMcpGovernancePreview({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    const { saveInput: input, previewSignature: signature } = buildPromptTemplatePreviewState(
      promptTemplateForm,
      promptTagsText
    );

    void previewPromptTemplateUpsert(input)
      .then((result) => {
        if (!cancelled) {
          setPromptTemplatePreview(result);
          setPromptTemplatePreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromptTemplatePreview(null);
          setPromptTemplatePreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [promptTemplateForm, promptTagsText]);

  useEffect(() => {
    let cancelled = false;
    const { saveInput: input, previewSignature: signature } = buildSkillPreviewState(
      skillForm,
      skillTagsText
    );

    void previewSkillUpsert(input)
      .then((result) => {
        if (!cancelled) {
          setSkillPreview(result);
          setSkillPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSkillPreview(null);
          setSkillPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [skillForm, skillTagsText]);

  useEffect(() => {
    let cancelled = false;
    const { saveInput: input, previewSignature: signature } = buildWorkspacePreviewState(
      workspaceForm,
      workspaceTagsText
    );

    void previewWorkspaceUpsert(input)
      .then((result) => {
        if (!cancelled) {
          setWorkspacePreview(result);
          setWorkspacePreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspacePreview(null);
          setWorkspacePreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceForm, workspaceTagsText]);

  useEffect(() => {
    let cancelled = false;
    const signature = buildPreviewSignature(sessionForm);

    void previewSessionRecordUpsert(sessionForm)
      .then((result) => {
        if (!cancelled) {
          setSessionPreview(result);
          setSessionPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionPreview(null);
          setSessionPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionForm]);

  useEffect(() => {
    let cancelled = false;
    const signature = buildPreviewSignature(appQuotaForm);

    void previewAppQuotaUpsert(appQuotaForm)
      .then((result) => {
        if (!cancelled) {
          setAppQuotaPreview(result);
          setAppQuotaPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppQuotaPreview(null);
          setAppQuotaPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appQuotaForm]);

  useEffect(() => {
    let cancelled = false;
    const signature = buildPreviewSignature(proxyForm);

    void previewProxyPolicyUpdate(proxyForm)
      .then((result) => {
        if (!cancelled) {
          setProxyPolicyPreview(result);
          setProxyPolicyPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProxyPolicyPreview(null);
          setProxyPolicyPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [proxyForm]);

  useEffect(() => {
    let cancelled = false;
    const signature = buildPreviewSignature(providerForm);

    void previewProviderUpsert(providerForm)
      .then((result) => {
        if (!cancelled) {
          setProviderPreview(result);
          setProviderPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProviderPreview(null);
          setProviderPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerForm]);

  useEffect(() => {
    if (!hasProviders || !canPreviewBindingUpsert(bindingForm)) {
      setBindingPreview(null);
      setBindingPreviewSignature("");
      return;
    }

    let cancelled = false;
    const signature = buildPreviewSignature(bindingForm);

    void previewBindingUpsert(bindingForm)
      .then((result) => {
        if (!cancelled) {
          setBindingPreview(result);
          setBindingPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBindingPreview(null);
          setBindingPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bindingForm, hasProviders]);

  useEffect(() => {
    if (!hasProviders || !canPreviewFailoverChainUpsert(failoverForm)) {
      setFailoverPreview(null);
      setFailoverPreviewSignature("");
      return;
    }

    let cancelled = false;
    const signature = buildPreviewSignature(failoverForm);

    void previewFailoverChainUpsert(failoverForm)
      .then((result) => {
        if (!cancelled) {
          setFailoverPreview(result);
          setFailoverPreviewSignature(signature);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailoverPreview(null);
          setFailoverPreviewSignature("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [failoverForm, hasProviders]);

  useEffect(() => {
    if (selectedSnapshotVersion === null) {
      setSelectedSnapshotDetail(null);
      setSelectedSnapshotDiff(null);
      setRestorePreview(null);
      setRestorePreviewVersion(null);
      return;
    }

    let cancelled = false;

    void Promise.all([
      loadSnapshotByVersion(selectedSnapshotVersion),
      loadSnapshotDiffByVersion(selectedSnapshotVersion),
      previewRestoreSnapshotVersion(selectedSnapshotVersion)
    ])
      .then(([detail, diff, preview]) => {
        if (!cancelled) {
          setSelectedSnapshotDetail(detail);
          setSelectedSnapshotDiff(diff);
          setRestorePreview(preview);
          setRestorePreviewVersion(selectedSnapshotVersion);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSelectedSnapshotDetail(null);
          setSelectedSnapshotDiff(null);
          setRestorePreview(null);
          setRestorePreviewVersion(null);
          setErrorMessage(error instanceof Error ? error.message : "unknown error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSnapshotVersion, setErrorMessage]);

  const mcpServerCurrentInput = (() => {
    try {
      return buildMcpServerEditorInput(mcpServerForm, mcpEnvText, mcpHeadersText);
    } catch {
      return null;
    }
  })();

  const canSaveWorkspace = isWorkspacePreviewInSync(
    workspacePreview,
    workspacePreviewSignature,
    workspaceForm,
    workspaceTagsText
  );
  const canSaveSession = isPreviewInSync(
    sessionPreview,
    sessionPreviewSignature,
    sessionForm
  );
  const canSavePromptTemplate = isPromptTemplatePreviewInSync(
    promptTemplatePreview,
    promptTemplatePreviewSignature,
    promptTemplateForm,
    promptTagsText
  );
  const canSaveSkill = isSkillPreviewInSync(
    skillPreview,
    skillPreviewSignature,
    skillForm,
    skillTagsText
  );
  const canSaveMcpServer =
    mcpServerPreviewError === null &&
    mcpServerCurrentInput !== null &&
    isPreviewInSync(
      mcpServerPreview,
      mcpServerPreviewSignature,
      mcpServerCurrentInput
    );
  const canSaveMcpBinding =
    snapshot !== null &&
    snapshot.mcpServers.length > 0 &&
    isPreviewInSync(mcpBindingPreview, mcpBindingPreviewSignature, mcpBindingForm);
  const canSaveProvider = isPreviewInSync(
    providerPreview,
    providerPreviewSignature,
    providerForm
  );
  const canSaveBinding =
    (snapshot?.providers.length ?? 0) > 0 &&
    isPreviewInSync(bindingPreview, bindingPreviewSignature, bindingForm);
  const canSaveAppQuota = isPreviewInSync(
    appQuotaPreview,
    appQuotaPreviewSignature,
    appQuotaForm
  );
  const canSaveProxyPolicy = isPreviewInSync(
    proxyPolicyPreview,
    proxyPolicyPreviewSignature,
    proxyForm
  );
  const canSaveFailover =
    (snapshot?.providers.length ?? 0) > 0 &&
    isPreviewInSync(failoverPreview, failoverPreviewSignature, failoverForm);

  return {
    promptTemplatePreview,
    skillPreview,
    workspacePreview,
    sessionPreview,
    appQuotaPreview,
    proxyPolicyPreview,
    restorePreview,
    restorePreviewVersion,
    selectedSnapshotDetail,
    selectedSnapshotDiff,
    mcpServerPreview,
    mcpBindingPreview,
    mcpHostSyncPreview,
    promptHostSyncPreview,
    promptHostImportPreview,
    mcpGovernancePreview,
    providerPreview,
    bindingPreview,
    failoverPreview,
    mcpServerPreviewError,
    canSaveWorkspace,
    canSaveSession,
    canSavePromptTemplate,
    canSaveSkill,
    canSaveMcpServer,
    canSaveMcpBinding,
    canSaveProvider,
    canSaveBinding,
    canSaveAppQuota,
    canSaveProxyPolicy,
    canSaveFailover,
    setMcpServerPreview,
    setMcpServerPreviewSignature,
    setMcpServerPreviewError,
    setMcpBindingPreview,
    setMcpBindingPreviewSignature
  };
};
