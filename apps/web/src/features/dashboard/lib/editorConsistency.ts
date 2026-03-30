import type {
  AppQuota,
  AppQuotaUpsert,
  AppBinding,
  AppBindingUpsert,
  AppMcpBinding,
  AppMcpBindingUpsert,
  FailoverChain,
  FailoverChainUpsert,
  McpServer,
  McpServerUpsert,
  PromptTemplate,
  PromptTemplateUpsert,
  Provider,
  ProviderUpsert,
  ProxyPolicy,
  SessionRecord,
  SessionRecordUpsert,
  Skill,
  SkillUpsert,
  Workspace,
  WorkspaceUpsert
} from "@cc-switch-web/shared";

type WithId = {
  readonly id: string;
};

const DEFAULT_PROXY_POLICY_FORM: ProxyPolicy = {
  listenHost: "127.0.0.1",
  listenPort: 8788,
  enabled: false,
  requestTimeoutMs: 60000,
  failureThreshold: 3
};

export const createDefaultProviderForm = (): ProviderUpsert => ({
  id: "provider-primary",
  name: "Primary Provider",
  providerType: "openai-compatible",
  baseUrl: "https://api.example.com/v1",
  apiKey: "",
  enabled: true,
  timeoutMs: 30000
});

export const createDefaultBindingForm = (): AppBindingUpsert => ({
  id: "binding-codex",
  appCode: "codex",
  providerId: "",
  mode: "managed",
  promptTemplateId: null,
  skillId: null
});

export const createDefaultAppQuotaForm = (): AppQuotaUpsert => ({
  id: "quota-codex",
  appCode: "codex",
  enabled: false,
  period: "day",
  maxRequests: null,
  maxTokens: null
});

export const createDefaultFailoverForm = (): FailoverChainUpsert => ({
  id: "failover-codex",
  appCode: "codex",
  enabled: false,
  providerIds: [],
  cooldownSeconds: 30,
  maxAttempts: 2
});

export const createDefaultPromptTemplateForm = (): PromptTemplateUpsert => ({
  id: "prompt-codex-review-zh",
  name: "Code Review",
  appCode: "codex",
  locale: "zh-CN",
  content: "请先检查 correctness、边界条件与回归风险。",
  tags: ["review"],
  enabled: true
});

export const createDefaultSkillForm = (): SkillUpsert => ({
  id: "skill-review-checklist",
  name: "Review Checklist",
  appCode: "codex",
  promptTemplateId: null,
  content: "输出前先完成 correctness、maintainability、regression risk 三项检查。",
  tags: ["review"],
  enabled: true
});

export const createDefaultWorkspaceForm = (): WorkspaceUpsert => ({
  id: "workspace-api",
  name: "API Service",
  rootPath: "/srv/api-service",
  appCode: "codex",
  defaultProviderId: null,
  defaultPromptTemplateId: null,
  defaultSkillId: null,
  tags: ["backend"],
  enabled: true
});

export const createDefaultSessionForm = (
  startedAt: string = new Date().toISOString()
): SessionRecordUpsert => ({
  id: "session-api-001",
  workspaceId: null,
  appCode: "codex",
  title: "Repair proxy headers",
  cwd: "/srv/api-service",
  providerId: null,
  promptTemplateId: null,
  skillId: null,
  status: "active",
  startedAt
});

export const buildPreviewSignature = (value: unknown): string => JSON.stringify(value);

const hasNonEmptyText = (value: string): boolean => value.trim().length > 0;

export const canPreviewBindingUpsert = (
  input: Pick<AppBindingUpsert, "providerId">
): boolean => hasNonEmptyText(input.providerId);

export const canPreviewFailoverChainUpsert = (
  input: Pick<FailoverChainUpsert, "providerIds">
): boolean => input.providerIds.some((providerId) => hasNonEmptyText(providerId));

export const normalizeTagText = (rawValue: string): string[] =>
  rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const parseJsonRecord = (raw: string): Record<string, string> => {
  if (raw.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("JSON object expected");
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)])
  );
};

export const sortRecordEntries = (
  value: Record<string, string>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );

export const formatJsonRecord = (value: Record<string, string>): string =>
  JSON.stringify(sortRecordEntries(value), null, 2);

export const formatTagsText = (tags: readonly string[]): string => tags.join(", ");

export const withNormalizedTags = <T extends { readonly tags: string[] }>(
  form: T,
  tagsText: string
): T => ({
  ...form,
  tags: normalizeTagText(tagsText)
});

export const buildMcpServerEditorInput = (
  form: McpServerUpsert,
  envText: string,
  headersText: string
): McpServerUpsert => ({
  ...form,
  env: sortRecordEntries(parseJsonRecord(envText)),
  headers: sortRecordEntries(parseJsonRecord(headersText)),
  command: form.transport === "stdio" ? form.command : null,
  url: form.transport === "http" ? form.url : null
});

export const buildMcpServerEditorSignature = (
  form: McpServerUpsert,
  envText: string,
  headersText: string
): string => buildPreviewSignature(buildMcpServerEditorInput(form, envText, headersText));

export const buildMcpServerEditorState = (
  item: McpServer
): {
  readonly form: McpServerUpsert;
  readonly envText: string;
  readonly headersText: string;
} => ({
  form: {
    id: item.id,
    name: item.name,
    transport: item.transport,
    command: item.command,
    args: [...item.args],
    url: item.url,
    env: item.env,
    headers: item.headers,
    enabled: item.enabled
  },
  envText: formatJsonRecord(item.env),
  headersText: formatJsonRecord(item.headers)
});

export const buildMcpBindingEditorState = (item: AppMcpBinding): AppMcpBindingUpsert => ({
  id: item.id,
  appCode: item.appCode,
  serverId: item.serverId,
  enabled: item.enabled
});

export const buildPromptTemplateEditorState = (
  item: PromptTemplate
): {
  readonly form: PromptTemplateUpsert;
  readonly tagsText: string;
} => ({
  form: {
    id: item.id,
    name: item.name,
    appCode: item.appCode,
    locale: item.locale,
    content: item.content,
    tags: item.tags,
    enabled: item.enabled
  },
  tagsText: formatTagsText(item.tags)
});

export const buildProviderEditorState = (item: Provider): ProviderUpsert => ({
  id: item.id,
  name: item.name,
  providerType: item.providerType,
  baseUrl: item.baseUrl,
  apiKey: "",
  apiKeyMasked: item.apiKeyMasked,
  enabled: item.enabled,
  timeoutMs: item.timeoutMs
});

export const buildBindingEditorState = (item: AppBinding): AppBindingUpsert => ({
  id: item.id,
  appCode: item.appCode,
  providerId: item.providerId,
  mode: item.mode,
  promptTemplateId: item.promptTemplateId,
  skillId: item.skillId
});

export const buildAppQuotaEditorState = (item: AppQuota): AppQuotaUpsert => ({
  id: item.id,
  appCode: item.appCode,
  enabled: item.enabled,
  period: item.period,
  maxRequests: item.maxRequests,
  maxTokens: item.maxTokens
});

export const buildSkillEditorState = (
  item: Skill
): {
  readonly form: SkillUpsert;
  readonly tagsText: string;
} => ({
  form: {
    id: item.id,
    name: item.name,
    appCode: item.appCode,
    promptTemplateId: item.promptTemplateId,
    content: item.content,
    tags: item.tags,
    enabled: item.enabled
  },
  tagsText: formatTagsText(item.tags)
});

export const buildWorkspaceEditorState = (
  item: Workspace
): {
  readonly form: WorkspaceUpsert;
  readonly tagsText: string;
} => ({
  form: {
    id: item.id,
    name: item.name,
    rootPath: item.rootPath,
    appCode: item.appCode,
    defaultProviderId: item.defaultProviderId,
    defaultPromptTemplateId: item.defaultPromptTemplateId,
    defaultSkillId: item.defaultSkillId,
    tags: item.tags,
    enabled: item.enabled
  },
  tagsText: formatTagsText(item.tags)
});

export const buildSessionEditorState = (item: SessionRecord): SessionRecordUpsert => ({
  id: item.id,
  workspaceId: item.workspaceId,
  appCode: item.appCode,
  title: item.title,
  cwd: item.cwd,
  providerId: item.providerId,
  promptTemplateId: item.promptTemplateId,
  skillId: item.skillId,
  status: item.status,
  startedAt: item.startedAt
});

export const buildFailoverEditorState = (item: FailoverChain): FailoverChainUpsert => ({
  id: item.id,
  appCode: item.appCode,
  enabled: item.enabled,
  providerIds: [...item.providerIds],
  cooldownSeconds: item.cooldownSeconds,
  maxAttempts: item.maxAttempts
});

export const isPreviewInSync = (
  preview: unknown,
  previewSignature: string,
  currentValue: unknown
): boolean => preview !== null && previewSignature === buildPreviewSignature(currentValue);

type TaggedEditorState<TForm extends { readonly tags: string[] }> = {
  readonly form: TForm;
  readonly tagsText: string;
};

const resolveByIdOrFallback = <T extends WithId>(
  items: readonly T[],
  currentId: string,
  fallback: (item: T) => boolean
): T | null => items.find((item) => item.id === currentId) ?? items.find(fallback) ?? null;

const resolveByPreferredIdOrFallback = <T extends WithId>(
  items: readonly T[],
  preferredId: string | null,
  currentId: string,
  fallback: (item: T) => boolean
): T | null => {
  if (preferredId !== null) {
    const preferred = items.find((item) => item.id === preferredId);
    if (preferred !== undefined) {
      return preferred;
    }
  }

  return resolveByIdOrFallback(items, currentId, fallback);
};

const normalizeCurrentTaggedEditorState = <T extends { readonly tags: string[] }>(
  form: T,
  tagsText: string
): TaggedEditorState<T> => {
  const normalizedTagsText = formatTagsText(normalizeTagText(tagsText));

  return {
    form: withNormalizedTags(form, normalizedTagsText),
    tagsText: normalizedTagsText
  };
};

export const syncProviderFormWithBootstrap = (
  current: ProviderUpsert,
  providers: readonly Provider[],
  preferredId: string | null
): ProviderUpsert => {
  const saved = resolveByPreferredIdOrFallback(
    providers,
    preferredId,
    current.id,
    () => false
  );

  return saved !== null ? buildProviderEditorState(saved) : current;
};

export const syncBindingFormWithBootstrap = (
  current: AppBindingUpsert,
  bindings: readonly AppBinding[],
  providers: readonly WithId[]
): AppBindingUpsert => {
  const saved = resolveByIdOrFallback(
    bindings,
    current.id,
    (item) => item.appCode === current.appCode
  );

  if (saved !== null) {
    return {
      id: saved.id,
      appCode: saved.appCode,
      providerId: saved.providerId,
      mode: saved.mode
    };
  }

  return {
    ...current,
    providerId:
      providers.some((provider) => provider.id === current.providerId)
        ? current.providerId
        : (providers[0]?.id ?? "")
  };
};

export const syncAppQuotaFormWithBootstrap = (
  current: AppQuotaUpsert,
  appQuotas: readonly AppQuota[],
  preferredId: string | null
): AppQuotaUpsert => {
  const saved = resolveByPreferredIdOrFallback(
    appQuotas,
    preferredId,
    current.id,
    (item) => item.appCode === current.appCode
  );

  return saved !== null ? buildAppQuotaEditorState(saved) : current;
};

export const syncMcpBindingFormWithBootstrap = (
  current: AppMcpBindingUpsert,
  bindings: readonly AppMcpBinding[],
  servers: readonly McpServer[]
): AppMcpBindingUpsert => {
  const saved = resolveByIdOrFallback(
    bindings,
    current.id,
    (item) => item.appCode === current.appCode
  );

  if (saved !== null) {
    return {
      id: saved.id,
      appCode: saved.appCode,
      serverId: saved.serverId,
      enabled: saved.enabled
    };
  }

  return {
    ...current,
    serverId:
      servers.some((server) => server.id === current.serverId)
        ? current.serverId
        : (servers[0]?.id ?? current.serverId)
  };
};

export const syncFailoverFormWithBootstrap = (
  current: FailoverChainUpsert,
  failoverChains: readonly FailoverChain[],
  providers: readonly WithId[]
): FailoverChainUpsert => {
  const saved = resolveByIdOrFallback(
    failoverChains,
    current.id,
    (item) => item.appCode === current.appCode
  );

  if (saved !== null) {
    return {
      id: saved.id,
      appCode: saved.appCode,
      enabled: saved.enabled,
      providerIds: [...saved.providerIds],
      cooldownSeconds: saved.cooldownSeconds,
      maxAttempts: saved.maxAttempts
    };
  }

  return {
    ...current,
    providerIds: current.providerIds.filter((providerId) =>
      providers.some((provider) => provider.id === providerId)
    )
  };
};

export const syncPromptTemplateEditorWithBootstrap = (
  current: PromptTemplateUpsert,
  currentTagsText: string,
  promptTemplates: readonly PromptTemplate[],
  preferredId: string | null
): TaggedEditorState<PromptTemplateUpsert> => {
  const saved = resolveByPreferredIdOrFallback(
    promptTemplates,
    preferredId,
    current.id,
    (item) => item.appCode === current.appCode && item.locale === current.locale
  );

  if (saved !== null) {
    return buildPromptTemplateEditorState(saved);
  }

  return normalizeCurrentTaggedEditorState(current, currentTagsText);
};

export const syncSkillEditorWithBootstrap = (
  current: SkillUpsert,
  currentTagsText: string,
  skills: readonly Skill[],
  preferredId: string | null
): TaggedEditorState<SkillUpsert> => {
  const saved = resolveByPreferredIdOrFallback(
    skills,
    preferredId,
    current.id,
    (item) => item.appCode === current.appCode
  );

  if (saved !== null) {
    return buildSkillEditorState(saved);
  }

  return normalizeCurrentTaggedEditorState(current, currentTagsText);
};

export const syncWorkspaceEditorWithBootstrap = (
  current: WorkspaceUpsert,
  currentTagsText: string,
  workspaces: readonly Workspace[],
  preferredId: string | null
): TaggedEditorState<WorkspaceUpsert> => {
  const saved = resolveByPreferredIdOrFallback(
    workspaces,
    preferredId,
    current.id,
    (item) =>
      item.rootPath === current.rootPath ||
      (current.appCode !== null && item.appCode === current.appCode)
  );

  if (saved !== null) {
    return buildWorkspaceEditorState(saved);
  }

  return normalizeCurrentTaggedEditorState(current, currentTagsText);
};

export const syncSessionFormWithBootstrap = (
  current: SessionRecordUpsert,
  sessions: readonly SessionRecord[],
  preferredId: string | null
): SessionRecordUpsert => {
  const saved = resolveByPreferredIdOrFallback(
    sessions,
    preferredId,
    current.id,
    (item) => item.cwd === current.cwd || item.appCode === current.appCode
  );

  return saved !== null ? buildSessionEditorState(saved) : current;
};

export const resolveProxyPolicyFormFromBootstrap = (
  latestSnapshot: {
    readonly payload: {
      readonly proxyPolicy: ProxyPolicy;
    };
  } | null
): ProxyPolicy => latestSnapshot?.payload.proxyPolicy ?? DEFAULT_PROXY_POLICY_FORM;

export type VersionedEditorSyncPlan = {
  readonly syncCurrentEditor: boolean;
  readonly refreshVersions: boolean;
};

export const resolveVersionedEditorSyncPlan = (
  currentEditorId: string,
  persistedItemId: string
): VersionedEditorSyncPlan => {
  const syncCurrentEditor = currentEditorId === persistedItemId;

  return {
    syncCurrentEditor,
    refreshVersions: syncCurrentEditor
  };
};

export type ConfigDeleteTargetKind =
  | "provider"
  | "binding"
  | "app-quota"
  | "failover-chain"
  | "prompt-template"
  | "skill"
  | "workspace"
  | "session"
  | "mcp-server"
  | "mcp-app-binding";

export type DeleteEditorResetPlan = {
  readonly resetProvider: boolean;
  readonly resetBinding: boolean;
  readonly resetAppQuota: boolean;
  readonly resetFailover: boolean;
  readonly resetPromptTemplate: boolean;
  readonly clearPromptTemplateVersions: boolean;
  readonly resetSkill: boolean;
  readonly clearSkillVersions: boolean;
  readonly resetWorkspace: boolean;
  readonly resetSession: boolean;
  readonly resetMcpServer: boolean;
  readonly resetMcpBinding: boolean;
};

type DeleteEditorResetPlanParams = {
  readonly kind: ConfigDeleteTargetKind;
  readonly deletedId: string;
  readonly providerFormId: string;
  readonly bindingFormId: string;
  readonly appQuotaFormId: string;
  readonly failoverFormId: string;
  readonly promptTemplateFormId: string;
  readonly skillFormId: string;
  readonly workspaceFormId: string;
  readonly sessionFormId: string;
  readonly editingMcpServerId: string | null;
  readonly editingMcpBindingId: string | null;
};

const EMPTY_DELETE_EDITOR_RESET_PLAN: DeleteEditorResetPlan = {
  resetProvider: false,
  resetBinding: false,
  resetAppQuota: false,
  resetFailover: false,
  resetPromptTemplate: false,
  clearPromptTemplateVersions: false,
  resetSkill: false,
  clearSkillVersions: false,
  resetWorkspace: false,
  resetSession: false,
  resetMcpServer: false,
  resetMcpBinding: false
};

export const resolveDeleteEditorResetPlan = ({
  kind,
  deletedId,
  providerFormId,
  bindingFormId,
  appQuotaFormId,
  failoverFormId,
  promptTemplateFormId,
  skillFormId,
  workspaceFormId,
  sessionFormId,
  editingMcpServerId,
  editingMcpBindingId
}: DeleteEditorResetPlanParams): DeleteEditorResetPlan => {
  const isDeletedEditor = (editorId: string | null): boolean => editorId === deletedId;

  switch (kind) {
    case "provider":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetProvider: isDeletedEditor(providerFormId)
      };
    case "binding":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetBinding: isDeletedEditor(bindingFormId)
      };
    case "app-quota":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetAppQuota: isDeletedEditor(appQuotaFormId)
      };
    case "failover-chain":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetFailover: isDeletedEditor(failoverFormId)
      };
    case "prompt-template": {
      const resetPromptTemplate = isDeletedEditor(promptTemplateFormId);
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetPromptTemplate,
        clearPromptTemplateVersions: resetPromptTemplate
      };
    }
    case "skill": {
      const resetSkill = isDeletedEditor(skillFormId);
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetSkill,
        clearSkillVersions: resetSkill
      };
    }
    case "workspace":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetWorkspace: isDeletedEditor(workspaceFormId)
      };
    case "session":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetSession: isDeletedEditor(sessionFormId)
      };
    case "mcp-server":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetMcpServer: isDeletedEditor(editingMcpServerId)
      };
    case "mcp-app-binding":
      return {
        ...EMPTY_DELETE_EDITOR_RESET_PLAN,
        resetMcpBinding: isDeletedEditor(editingMcpBindingId)
      };
  }
};
