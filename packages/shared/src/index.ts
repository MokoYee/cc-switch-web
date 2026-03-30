import { z } from "zod";

export const providerTypeSchema = z.enum([
  "openai-compatible",
  "anthropic",
  "gemini",
  "opencode",
  "custom"
]);

export const appCodeSchema = z.enum([
  "codex",
  "claude-code",
  "gemini-cli",
  "opencode",
  "openclaw"
]);

export const localeCodeSchema = z.enum(["zh-CN", "en-US"]);

export const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerType: providerTypeSchema,
  baseUrl: z.string().url(),
  apiKeyMasked: z.string(),
  enabled: z.boolean(),
  timeoutMs: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const providerUpsertSchema = providerSchema.pick({
  id: true,
  name: true,
  providerType: true,
  baseUrl: true,
  enabled: true,
  timeoutMs: true
}).extend({
  apiKey: z.string().trim().optional().default(""),
  apiKeyMasked: z.string().trim().optional()
});

export const exportProviderSchema = providerSchema.extend({
  apiKey: z.string().trim().optional()
});

export const appBindingSchema = z.object({
  id: z.string().min(1),
  appCode: appCodeSchema,
  providerId: z.string().min(1),
  mode: z.enum(["observe", "managed"]),
  promptTemplateId: z.string().min(1).nullable().optional(),
  skillId: z.string().min(1).nullable().optional(),
  updatedAt: z.string().datetime()
});

export const appBindingUpsertSchema = appBindingSchema.pick({
  id: true,
  appCode: true,
  providerId: true,
  mode: true,
  promptTemplateId: true,
  skillId: true
});

export const routingPreviewIssueCodeSchema = z.enum([
  "provider-missing",
  "provider-disabled",
  "credential-missing",
  "duplicate-app-binding",
  "failover-provider-missing",
  "failover-provider-duplicate",
  "failover-missing-primary",
  "failover-max-attempts-exceeds-candidates",
  "observe-mode-with-failover",
  "no-routable-provider",
  "circuit-open"
]);

export const routingPlanCandidateSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().nullable(),
  enabled: z.boolean(),
  hasCredential: z.boolean(),
  circuitState: z.enum(["closed", "open", "half-open"]),
  source: z.enum(["binding-primary", "failover"]),
  willReceiveTraffic: z.boolean(),
  decision: z.enum(["selected", "excluded", "degraded", "fallback"]),
  decisionReason: z.enum([
    "ready",
    "unexecutable-disabled",
    "unexecutable-missing-credential",
    "circuit-open",
    "recent-unhealthy-demoted",
    "half-open-fallback"
  ])
});

export const configImpactPreviewSchema = z.object({
  summary: z.array(z.string()),
  affectedAppCodes: z.array(appCodeSchema),
  requiresSnapshot: z.boolean(),
  requiresProxyReload: z.boolean(),
  touchesRouting: z.boolean(),
  touchesHostManagedMcp: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"])
});

export const routingExecutionPlanPreviewSchema = z.object({
  appCode: appCodeSchema,
  proxyPath: z.string().min(1),
  failoverEnabled: z.boolean(),
  maxAttempts: z.number().int().min(1),
  candidates: z.array(routingPlanCandidateSchema)
});

export const providerRoutingPreviewSchema = z.object({
  providerId: z.string().min(1),
  exists: z.boolean(),
  boundAppCodes: z.array(appCodeSchema),
  failoverAppCodes: z.array(appCodeSchema),
  issueCodes: z.array(routingPreviewIssueCodeSchema),
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const appQuotaPeriodSchema = z.enum(["day"]);

export const appQuotaSchema = z.object({
  id: z.string().min(1),
  appCode: appCodeSchema,
  enabled: z.boolean(),
  period: appQuotaPeriodSchema,
  maxRequests: z.number().int().positive().nullable(),
  maxTokens: z.number().int().positive().nullable(),
  updatedAt: z.string().datetime()
});

export const appQuotaUpsertSchema = appQuotaSchema.pick({
  id: true,
  appCode: true,
  enabled: true,
  period: true,
  maxRequests: true,
  maxTokens: true
});

export const appQuotaUsageStateSchema = z.enum(["healthy", "warning", "exceeded", "disabled"]);

export const appQuotaStatusSchema = z.object({
  quota: appQuotaSchema,
  requestsUsed: z.number().int().min(0),
  tokensUsed: z.number().int().min(0),
  requestsRemaining: z.number().int().min(0).nullable(),
  tokensRemaining: z.number().int().min(0).nullable(),
  requestUtilization: z.number().min(0).max(1).nullable(),
  tokenUtilization: z.number().min(0).max(1).nullable(),
  currentState: appQuotaUsageStateSchema,
  windowStartedAt: z.string().datetime(),
  evaluatedAt: z.string().datetime()
});

export const proxyPolicySchema = z.object({
  listenHost: z.string().min(1),
  listenPort: z.number().int().min(1).max(65535),
  enabled: z.boolean(),
  requestTimeoutMs: z.number().int().positive(),
  failureThreshold: z.number().int().positive()
});

export const failoverChainSchema = z.object({
  id: z.string().min(1),
  appCode: appCodeSchema,
  enabled: z.boolean(),
  providerIds: z.array(z.string().min(1)).min(1),
  cooldownSeconds: z.number().int().min(5).max(3600),
  maxAttempts: z.number().int().min(1).max(10),
  updatedAt: z.string().datetime()
});

export const failoverChainUpsertSchema = failoverChainSchema.pick({
  id: true,
  appCode: true,
  enabled: true,
  providerIds: true,
  cooldownSeconds: true,
  maxAttempts: true
});

export const appBindingRoutingPreviewSchema = z.object({
  bindingId: z.string().min(1),
  appCode: appCodeSchema,
  exists: z.boolean(),
  mode: z.enum(["observe", "managed"]),
  providerId: z.string().min(1),
  issueCodes: z.array(routingPreviewIssueCodeSchema),
  warnings: z.array(z.string()),
  executionPlan: routingExecutionPlanPreviewSchema,
  impact: configImpactPreviewSchema
});

export const failoverChainRoutingPreviewSchema = z.object({
  chainId: z.string().min(1),
  appCode: appCodeSchema,
  exists: z.boolean(),
  enabled: z.boolean(),
  normalizedProviderIds: z.array(z.string().min(1)),
  issueCodes: z.array(routingPreviewIssueCodeSchema),
  warnings: z.array(z.string()),
  executionPlan: routingExecutionPlanPreviewSchema,
  impact: configImpactPreviewSchema
});

export const promptTemplateSavePreviewSchema = z.object({
  promptTemplateId: z.string().min(1),
  exists: z.boolean(),
  referencedBySkillIds: z.array(z.string().min(1)),
  usedByWorkspaceIds: z.array(z.string().min(1)),
  usedBySessionIds: z.array(z.string().min(1)),
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const skillSavePreviewSchema = z.object({
  skillId: z.string().min(1),
  exists: z.boolean(),
  promptTemplateExists: z.boolean(),
  usedByWorkspaceIds: z.array(z.string().min(1)),
  usedBySessionIds: z.array(z.string().min(1)),
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const assetGovernanceIssueCodeSchema = z.enum([
  "prompt-disabled-in-use",
  "skill-disabled-in-use",
  "skill-missing-prompt",
  "skill-prompt-disabled"
]);

export const assetGovernanceRepairActionSchema = z.enum([
  "enable-prompt",
  "enable-skill"
]);

export const assetGovernanceTargetTypeSchema = z.enum([
  "prompt-template",
  "skill"
]);

export const assetGovernancePreviewItemSchema = z.object({
  targetType: assetGovernanceTargetTypeSchema,
  targetId: z.string().min(1),
  appCode: appCodeSchema.nullable(),
  affectedAppCodes: z.array(appCodeSchema),
  level: z.enum(["low", "medium", "high"]),
  issueCodes: z.array(assetGovernanceIssueCodeSchema),
  relationCount: z.number().int().min(0),
  linkedPromptId: z.string().nullable(),
  referencedBySkillIds: z.array(z.string().min(1)),
  usedByWorkspaceIds: z.array(z.string().min(1)),
  usedBySessionIds: z.array(z.string().min(1)),
  repairable: z.boolean(),
  plannedActions: z.array(assetGovernanceRepairActionSchema)
});

export const assetGovernancePreviewSchema = z.object({
  scopeAppCode: appCodeSchema.nullable(),
  totalItems: z.number().int().min(0),
  highRiskItems: z.number().int().min(0),
  repairableItems: z.number().int().min(0),
  pendingManualItems: z.number().int().min(0),
  totalPlannedActions: z.number().int().min(0),
  items: z.array(assetGovernancePreviewItemSchema)
});

export const assetGovernanceRepairResultSchema = z.object({
  scopeAppCode: appCodeSchema.nullable(),
  executedActions: z.array(assetGovernanceRepairActionSchema),
  changedPromptTemplateIds: z.array(z.string().min(1)),
  changedSkillIds: z.array(z.string().min(1)),
  repairedItems: z.number().int().min(0),
  remainingManualItems: z.number().int().min(0),
  remainingIssueCodes: z.array(assetGovernanceIssueCodeSchema),
  message: z.string().min(1)
});

export const workspaceSavePreviewSchema = z.object({
  workspaceId: z.string().min(1),
  exists: z.boolean(),
  sessionCount: z.number().int().min(0),
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const sessionSavePreviewSchema = z.object({
  sessionId: z.string().min(1),
  exists: z.boolean(),
  workspaceExists: z.boolean(),
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const appQuotaSavePreviewSchema = z.object({
  quotaId: z.string().min(1),
  exists: z.boolean(),
  appCode: appCodeSchema,
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const proxyPolicySavePreviewSchema = z.object({
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const mcpServerTransportSchema = z.enum(["stdio", "http"]);

export const mcpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: mcpServerTransportSchema,
  command: z.string().min(1).nullable(),
  args: z.array(z.string()).default([]),
  url: z.string().url().nullable(),
  env: z.record(z.string(), z.string()).default({}),
  headers: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const mcpServerUpsertSchema = mcpServerSchema.pick({
  id: true,
  name: true,
  transport: true,
  command: true,
  args: true,
  url: true,
  env: true,
  headers: true,
  enabled: true
});

export const appMcpBindingSchema = z.object({
  id: z.string().min(1),
  appCode: appCodeSchema,
  serverId: z.string().min(1),
  enabled: z.boolean(),
  updatedAt: z.string().datetime()
});

export const appMcpBindingUpsertSchema = appMcpBindingSchema.pick({
  id: true,
  appCode: true,
  serverId: true,
  enabled: true
});

export const hostMcpSyncCapabilitySchema = z.object({
  appCode: appCodeSchema,
  supportLevel: z.enum(["managed", "planned", "unsupported"]),
  recommendedPath: z.enum([
    "managed-host-sync",
    "external-bridge",
    "wait-for-stable-config"
  ]),
  configPathHint: z.string().nullable().default(null),
  configFormat: z.enum(["toml", "json"]).nullable().default(null),
  docsUrl: z.string().url().nullable().default(null),
  reason: z.string().min(1)
});

export const hostMcpSyncResultSchema = z.object({
  appCode: appCodeSchema,
  action: z.enum(["apply", "rollback"]),
  configPath: z.string().min(1),
  backupPath: z.string().nullable(),
  syncedServerIds: z.array(z.string().min(1)),
  message: z.string().min(1)
});

export const mcpExistingServerStrategySchema = z.enum(["overwrite", "skip"]);
export const mcpMissingBindingStrategySchema = z.enum(["create", "skip"]);

export const mcpImportOptionsSchema = z.object({
  existingServerStrategy: mcpExistingServerStrategySchema.default("overwrite"),
  missingBindingStrategy: mcpMissingBindingStrategySchema.default("create")
});

export const mcpImportFieldDiffSchema = z.object({
  field: z.enum(["transport", "command", "args", "url", "env", "headers", "enabled"]),
  currentValue: z.string().nullable(),
  incomingValue: z.string().nullable()
});

export const mcpImportPreviewItemSchema = z.object({
  serverId: z.string().min(1),
  status: z.enum(["new", "update", "skip-existing", "binding-only"]),
  bindingStatus: z.enum(["create", "already-enabled"]),
  changedFields: z.array(
    z.enum(["transport", "command", "args", "url", "env", "headers", "enabled"])
  ),
  fieldDiffs: z.array(mcpImportFieldDiffSchema)
});

export const mcpImportPreviewSchema = z.object({
  appCode: appCodeSchema,
  configPath: z.string().min(1),
  totalDiscovered: z.number().int().min(0),
  newServerIds: z.array(z.string().min(1)),
  existingServerIds: z.array(z.string().min(1)),
  bindingToCreateServerIds: z.array(z.string().min(1)),
  bindingAlreadyEnabledServerIds: z.array(z.string().min(1)),
  items: z.array(mcpImportPreviewItemSchema)
});

export const mcpRuntimeItemSchema = z.object({
  bindingId: z.string().nullable(),
  appCode: appCodeSchema,
  serverId: z.string().min(1),
  serverName: z.string().nullable(),
  transport: mcpServerTransportSchema.nullable(),
  command: z.string().nullable(),
  url: z.string().nullable(),
  bindingEnabled: z.boolean(),
  serverEnabled: z.boolean(),
  effectiveEnabled: z.boolean(),
  status: z.enum(["healthy", "warning", "error"]),
  issueCodes: z.array(
    z.enum([
      "missing-server",
      "server-disabled",
      "duplicate-binding",
      "missing-command",
      "missing-url"
    ])
  ),
  managedOnHost: z.boolean(),
  warnings: z.array(z.string())
});

export const mcpRuntimeIssueCodeSchema = z.enum([
  "missing-server",
  "server-disabled",
  "duplicate-binding",
  "missing-command",
  "missing-url",
  "host-drift"
]);

export const mcpHostSyncStateSchema = z.object({
  appCode: appCodeSchema,
  configPath: z.string().min(1),
  backupPath: z.string().nullable(),
  syncedServerIds: z.array(z.string().min(1)),
  lastAppliedAt: z.string().datetime(),
  configExists: z.boolean()
});

export const mcpRuntimeHostStateSchema = z.object({
  synced: z.boolean(),
  drifted: z.boolean(),
  configPath: z.string().nullable(),
  lastAppliedAt: z.string().datetime().nullable(),
  syncedServerIds: z.array(z.string().min(1))
});

export const mcpAppRuntimeViewSchema = z.object({
  appCode: appCodeSchema,
  totalBindings: z.number().int().min(0),
  enabledBindings: z.number().int().min(0),
  enabledServers: z.number().int().min(0),
  status: z.enum(["healthy", "warning", "error"]),
  issueCodes: z.array(mcpRuntimeIssueCodeSchema),
  hostState: mcpRuntimeHostStateSchema,
  items: z.array(mcpRuntimeItemSchema),
  warnings: z.array(z.string())
});

export const mcpServerUsageSchema = z.object({
  serverId: z.string().min(1),
  serverName: z.string().nullable(),
  exists: z.boolean(),
  bindingIds: z.array(z.string().min(1)),
  boundApps: z.array(appCodeSchema),
  enabledApps: z.array(appCodeSchema),
  hostManagedApps: z.array(appCodeSchema),
  importedFromApps: z.array(appCodeSchema)
});

export const mcpServerSavePreviewSchema = z.object({
  serverId: z.string().min(1),
  exists: z.boolean(),
  changedFields: z.array(
    z.enum(["name", "transport", "command", "args", "url", "env", "headers", "enabled"])
  ),
  usage: mcpServerUsageSchema,
  runtimeAppCodes: z.array(appCodeSchema),
  runtimeIssueCodes: z.array(mcpRuntimeIssueCodeSchema),
  affectedBindingIds: z.array(z.string().min(1)),
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const mcpBindingSavePreviewSchema = z.object({
  bindingId: z.string().min(1),
  appCode: appCodeSchema,
  serverId: z.string().min(1),
  exists: z.boolean(),
  serverExists: z.boolean(),
  siblingBindingIds: z.array(z.string().min(1)),
  siblingServerIds: z.array(z.string().min(1)),
  runtimeStatus: z.enum(["healthy", "warning", "error"]),
  runtimeIssueCodes: z.array(mcpRuntimeIssueCodeSchema),
  hostDrifted: z.boolean(),
  warnings: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const mcpHostSyncPreviewSchema = z.object({
  appCode: appCodeSchema,
  configPath: z.string().min(1),
  configExists: z.boolean(),
  backupRequired: z.boolean(),
  rollbackAction: z.enum(["restore", "delete"]),
  currentManagedServerIds: z.array(z.string().min(1)),
  nextManagedServerIds: z.array(z.string().min(1)),
  addedServerIds: z.array(z.string().min(1)),
  removedServerIds: z.array(z.string().min(1)),
  unchangedServerIds: z.array(z.string().min(1)),
  warnings: z.array(z.string())
});

export const mcpHostSyncBatchPreviewSchema = z.object({
  totalApps: z.number().int().min(0),
  syncableApps: z.number().int().min(0),
  items: z.array(mcpHostSyncPreviewSchema),
  warnings: z.array(z.string())
});

export const mcpHostSyncBatchResultSchema = z.object({
  totalApps: z.number().int().min(0),
  appliedApps: z.array(appCodeSchema),
  skippedApps: z.array(appCodeSchema),
  syncedServerIds: z.array(z.string().min(1)),
  items: z.array(hostMcpSyncResultSchema),
  message: z.string().min(1)
});

export const mcpHostSyncBatchRollbackResultSchema = z.object({
  totalApps: z.number().int().min(0),
  rolledBackApps: z.array(appCodeSchema),
  skippedApps: z.array(appCodeSchema),
  restoredServerIds: z.array(z.string().min(1)),
  items: z.array(hostMcpSyncResultSchema),
  message: z.string().min(1)
});

export const mcpGovernanceRepairActionSchema = z.enum([
  "disable-duplicate-bindings",
  "disable-invalid-bindings",
  "enable-referenced-servers"
]);

export const mcpGovernanceRepairPlanItemSchema = z.object({
  action: mcpGovernanceRepairActionSchema,
  riskLevel: z.enum(["low", "medium", "high"]),
  issueCodes: z.array(mcpRuntimeIssueCodeSchema),
  bindingIds: z.array(z.string().min(1)),
  serverIds: z.array(z.string().min(1))
});

export const mcpGovernanceRepairPreviewSchema = z.object({
  appCode: appCodeSchema,
  statusBefore: z.enum(["healthy", "warning", "error"]),
  issueCodesBefore: z.array(mcpRuntimeIssueCodeSchema),
  plannedActions: z.array(mcpGovernanceRepairPlanItemSchema),
  predictedStatusAfter: z.enum(["healthy", "warning", "error"]),
  predictedIssueCodesAfter: z.array(mcpRuntimeIssueCodeSchema),
  requiresHostSync: z.boolean(),
  warnings: z.array(z.string())
});

export const mcpGovernanceRepairResultSchema = z.object({
  appCode: appCodeSchema,
  executedActions: z.array(mcpGovernanceRepairActionSchema),
  changedBindingIds: z.array(z.string().min(1)),
  changedServerIds: z.array(z.string().min(1)),
  statusAfter: z.enum(["healthy", "warning", "error"]),
  issueCodesAfter: z.array(mcpRuntimeIssueCodeSchema),
  requiresHostSync: z.boolean(),
  message: z.string().min(1)
});

export const mcpGovernanceBatchPreviewSchema = z.object({
  totalApps: z.number().int().min(0),
  repairableApps: z.number().int().min(0),
  hostSyncRequiredApps: z.number().int().min(0),
  items: z.array(mcpGovernanceRepairPreviewSchema),
  warnings: z.array(z.string())
});

export const mcpGovernanceBatchResultSchema = z.object({
  totalApps: z.number().int().min(0),
  repairedApps: z.number().int().min(0),
  changedBindingIds: z.array(z.string().min(1)),
  changedServerIds: z.array(z.string().min(1)),
  hostSyncRequiredApps: z.array(appCodeSchema),
  items: z.array(mcpGovernanceRepairResultSchema),
  message: z.string().min(1)
});

export const mcpVerificationHistoryStatusSchema = z.enum([
  "verified",
  "pending-runtime",
  "pending-host-sync",
  "pending-audit",
  "pending-traffic",
  "regressed",
  "superseded"
]);

export const mcpVerificationBaselineActionSchema = z.enum([
  "server-upsert",
  "server-delete",
  "binding-upsert",
  "binding-delete",
  "import",
  "governance-repair",
  "host-apply",
  "host-rollback",
  "host-apply-snapshot"
]);

export const mcpVerificationHistoryItemSchema = z.object({
  id: z.string().min(1),
  appCode: appCodeSchema,
  baselineAt: z.string().datetime(),
  baselineAction: mcpVerificationBaselineActionSchema,
  baselineSummary: z.string().min(1),
  verificationStatus: mcpVerificationHistoryStatusSchema,
  latestSuccessAt: z.string().datetime().nullable(),
  latestFailureAt: z.string().datetime().nullable(),
  latestAuditAt: z.string().datetime().nullable(),
  nextBaselineAt: z.string().datetime().nullable(),
  currentCycle: z.boolean(),
  synthetic: z.boolean()
});

export const mcpVerificationHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(5),
  offset: z.coerce.number().int().min(0).default(0)
});

export const mcpVerificationHistoryPageSchema = z.object({
  items: z.array(mcpVerificationHistoryItemSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0)
});

const tagsSchema = z.array(z.string().min(1)).default([]);

export const promptTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  appCode: appCodeSchema.nullable(),
  locale: localeCodeSchema,
  content: z.string().min(1),
  tags: tagsSchema,
  enabled: z.boolean(),
  updatedAt: z.string().datetime()
});

export const promptTemplateUpsertSchema = promptTemplateSchema.pick({
  id: true,
  name: true,
  appCode: true,
  locale: true,
  content: true,
  tags: true,
  enabled: true
});

export const skillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  appCode: appCodeSchema.nullable(),
  promptTemplateId: z.string().min(1).nullable(),
  content: z.string().min(1),
  tags: tagsSchema,
  enabled: z.boolean(),
  updatedAt: z.string().datetime()
});

export const skillUpsertSchema = skillSchema.pick({
  id: true,
  name: true,
  appCode: true,
  promptTemplateId: true,
  content: true,
  tags: true,
  enabled: true
});

export const promptTemplateVersionSchema = z.object({
  promptTemplateId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  item: promptTemplateSchema,
  createdAt: z.string().datetime()
});

export const skillVersionSchema = z.object({
  skillId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  item: skillSchema,
  createdAt: z.string().datetime()
});

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  appCode: appCodeSchema.nullable(),
  defaultProviderId: z.string().min(1).nullable(),
  defaultPromptTemplateId: z.string().min(1).nullable(),
  defaultSkillId: z.string().min(1).nullable(),
  tags: tagsSchema,
  enabled: z.boolean(),
  updatedAt: z.string().datetime()
});

export const workspaceUpsertSchema = workspaceSchema.pick({
  id: true,
  name: true,
  rootPath: true,
  appCode: true,
  defaultProviderId: true,
  defaultPromptTemplateId: true,
  defaultSkillId: true,
  tags: true,
  enabled: true
});

export const sessionRecordStatusSchema = z.enum(["active", "archived"]);

export const sessionRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  appCode: appCodeSchema,
  title: z.string().min(1),
  cwd: z.string().min(1),
  providerId: z.string().min(1).nullable(),
  promptTemplateId: z.string().min(1).nullable(),
  skillId: z.string().min(1).nullable(),
  status: sessionRecordStatusSchema,
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const sessionRecordUpsertSchema = sessionRecordSchema.pick({
  id: true,
  workspaceId: true,
  appCode: true,
  title: true,
  cwd: true,
  providerId: true,
  promptTemplateId: true,
  skillId: true,
  status: true,
  startedAt: true
});

export const sessionGovernanceStatusSchema = z.object({
  staleAfterMs: z.number().int().positive(),
  evaluatedAt: z.string().datetime(),
  totalSessions: z.number().int().min(0),
  activeSessions: z.number().int().min(0),
  archivedSessions: z.number().int().min(0),
  staleSessionIds: z.array(z.string().min(1)),
  activeSessionId: z.string().nullable()
});

export const sessionArchiveResultSchema = z.object({
  archivedSessionIds: z.array(z.string().min(1)),
  alreadyArchivedSessionIds: z.array(z.string().min(1)),
  missingSessionIds: z.array(z.string().min(1)),
  clearedActiveSessionId: z.boolean(),
  evaluatedAt: z.string().datetime()
});

export const workspaceDiscoveryStatusSchema = z.enum([
  "new",
  "existing-workspace",
  "existing-session-root",
  "ignored"
]);

export const workspaceDiscoverySourceSchema = z.enum([
  "scan-root",
  "session-cwd",
  "workspace-root"
]);

export const workspaceDiscoveryItemSchema = z.object({
  rootPath: z.string().min(1),
  name: z.string().min(1),
  status: workspaceDiscoveryStatusSchema,
  source: workspaceDiscoverySourceSchema,
  appCodeSuggestion: appCodeSchema.nullable(),
  existingWorkspaceId: z.string().nullable(),
  existingSessionIds: z.array(z.string().min(1)),
  markers: z.array(z.string().min(1)),
  hasGitRepository: z.boolean(),
  depth: z.number().int().min(0)
});

export const workspaceDiscoveryImportSchema = z.object({
  rootPath: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  appCode: appCodeSchema.nullable().optional(),
  defaultProviderId: z.string().min(1).nullable().optional(),
  defaultPromptTemplateId: z.string().min(1).nullable().optional(),
  defaultSkillId: z.string().min(1).nullable().optional(),
  tags: z.array(z.string().min(1)).optional().default([]),
  enabled: z.boolean().optional().default(true)
});

export const workspaceDiscoveryImportResultSchema = z.object({
  item: workspaceSchema,
  linkedSessionIds: z.array(z.string().min(1)),
  snapshotVersion: z.number().int().positive()
});

export const workspaceDiscoveryBatchImportSchema = z.object({
  roots: z.array(z.string().min(1)).optional(),
  depth: z.number().int().min(0).optional(),
  appCode: appCodeSchema.nullable().optional(),
  tags: z.array(z.string().min(1)).optional().default([]),
  enabled: z.boolean().optional().default(true)
});

export const workspaceDiscoveryBatchImportResultSchema = z.object({
  totalCandidates: z.number().int().min(0),
  importedCount: z.number().int().min(0),
  linkedSessionIds: z.array(z.string().min(1)),
  skippedRootPaths: z.array(z.string().min(1)),
  items: z.array(workspaceSchema)
});

export const sessionEnsureInputSchema = z.object({
  appCode: appCodeSchema,
  cwd: z.string().min(1),
  title: z.string().min(1).optional(),
  activate: z.boolean().optional().default(false)
});

export const sessionEnsureResultSchema = z.object({
  session: sessionRecordSchema,
  workspace: workspaceSchema,
  matchedBy: z.enum(["session", "workspace", "new-workspace"]),
  createdWorkspace: z.boolean(),
  createdSession: z.boolean(),
  activated: z.boolean(),
  snapshotVersion: z.number().int().positive()
});

export const contextReferenceSourceSchema = z.enum([
  "workspace-default",
  "session-override",
  "app-binding",
  "none"
]);

export const resolvedProviderReferenceSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  bindingMode: z.enum(["observe", "managed"]).nullable(),
  source: contextReferenceSourceSchema,
  missing: z.boolean()
});

export const resolvedPromptReferenceSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  locale: localeCodeSchema.nullable(),
  source: contextReferenceSourceSchema,
  missing: z.boolean()
});

export const resolvedSkillReferenceSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  source: contextReferenceSourceSchema,
  missing: z.boolean()
});

export const resolvedWorkspaceContextSchema = z.object({
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  rootPath: z.string().min(1),
  effectiveAppCode: appCodeSchema.nullable(),
  provider: resolvedProviderReferenceSchema,
  promptTemplate: resolvedPromptReferenceSchema,
  skill: resolvedSkillReferenceSchema,
  warnings: z.array(z.string())
});

export const resolvedSessionContextSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1),
  cwd: z.string().min(1),
  workspaceId: z.string().nullable(),
  effectiveAppCode: appCodeSchema,
  provider: resolvedProviderReferenceSchema,
  promptTemplate: resolvedPromptReferenceSchema,
  skill: resolvedSkillReferenceSchema,
  warnings: z.array(z.string())
});

export const activeContextStateSchema = z.object({
  activeWorkspaceId: z.string().nullable(),
  activeSessionId: z.string().nullable(),
  workspaceContext: resolvedWorkspaceContextSchema.nullable(),
  sessionContext: resolvedSessionContextSchema.nullable()
});

export const activeContextResolutionSourceSchema = z.enum([
  "request-session",
  "request-workspace",
  "request-auto-session",
  "request-auto-workspace",
  "active-session",
  "active-workspace",
  "none"
]);

export const effectivePromptReferenceSchema = resolvedPromptReferenceSchema.extend({
  content: z.string().nullable(),
  enabled: z.boolean().nullable()
});

export const effectiveSkillReferenceSchema = resolvedSkillReferenceSchema.extend({
  promptTemplateId: z.string().nullable(),
  content: z.string().nullable(),
  enabled: z.boolean().nullable()
});

export const effectiveAppContextSchema = z.object({
  appCode: appCodeSchema,
  source: activeContextResolutionSourceSchema,
  activeWorkspaceId: z.string().nullable(),
  activeSessionId: z.string().nullable(),
  provider: resolvedProviderReferenceSchema,
  promptTemplate: effectivePromptReferenceSchema,
  skill: effectiveSkillReferenceSchema,
  systemInstruction: z.string().nullable(),
  warnings: z.array(z.string())
});

export const contextRoutingExplanationStepSchema = z.object({
  kind: z.enum([
    "active-session-context",
    "active-workspace-context",
    "session-override",
    "workspace-default",
    "app-binding",
    "failover-chain"
  ]),
  selected: z.boolean(),
  available: z.boolean(),
  referenceId: z.string().nullable(),
  providerId: z.string().nullable(),
  message: z.string().min(1)
});

export const contextRoutingExplanationSchema = z.object({
  appCode: appCodeSchema,
  effectiveSource: activeContextResolutionSourceSchema,
  activeWorkspaceId: z.string().nullable(),
  activeSessionId: z.string().nullable(),
  effectiveProviderId: z.string().nullable(),
  effectiveProviderSource: contextReferenceSourceSchema,
  steps: z.array(contextRoutingExplanationStepSchema),
  routingPlan: routingExecutionPlanPreviewSchema.nullable(),
  warnings: z.array(z.string())
});

export const configSnapshotSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().min(1),
  createdAt: z.string().datetime(),
  payload: z.object({
    providers: z.array(providerSchema),
    bindings: z.array(appBindingSchema),
    appQuotas: z.array(appQuotaSchema).default([]),
    proxyPolicy: proxyPolicySchema,
    failoverChains: z.array(failoverChainSchema).default([]),
    mcpServers: z.array(mcpServerSchema).default([]),
    appMcpBindings: z.array(appMcpBindingSchema).default([]),
    promptTemplates: z.array(promptTemplateSchema).default([]),
    skills: z.array(skillSchema).default([]),
    workspaces: z.array(workspaceSchema).default([]),
    sessionRecords: z.array(sessionRecordSchema).default([])
  })
});

export const configSnapshotSummarySchema = configSnapshotSchema.pick({
  version: true,
  reason: true,
  createdAt: true
}).extend({
  counts: z.object({
    providers: z.number().int().min(0),
    promptTemplates: z.number().int().min(0),
    skills: z.number().int().min(0),
    workspaces: z.number().int().min(0),
    sessionRecords: z.number().int().min(0),
    bindings: z.number().int().min(0),
    appQuotas: z.number().int().min(0),
    failoverChains: z.number().int().min(0),
    mcpServers: z.number().int().min(0),
    appMcpBindings: z.number().int().min(0)
  })
});

export const configSnapshotDiffBucketSchema = z.object({
  added: z.array(z.string().min(1)),
  removed: z.array(z.string().min(1)),
  changed: z.array(z.string().min(1))
});

export const configSnapshotDiffSchema = z.object({
  fromVersion: z.number().int().positive().nullable(),
  toVersion: z.number().int().positive(),
  summary: z.object({
    totalAdded: z.number().int().min(0),
    totalRemoved: z.number().int().min(0),
    totalChanged: z.number().int().min(0)
  }),
  providers: configSnapshotDiffBucketSchema,
  promptTemplates: configSnapshotDiffBucketSchema,
  skills: configSnapshotDiffBucketSchema,
  workspaces: configSnapshotDiffBucketSchema,
  sessionRecords: configSnapshotDiffBucketSchema,
  bindings: configSnapshotDiffBucketSchema,
  appQuotas: configSnapshotDiffBucketSchema,
  failoverChains: configSnapshotDiffBucketSchema,
  mcpServers: configSnapshotDiffBucketSchema,
  appMcpBindings: configSnapshotDiffBucketSchema
});

export const configDeletePreviewSchema = z.object({
  targetType: z.enum([
    "provider",
    "binding",
    "app-quota",
    "failover-chain",
    "prompt-template",
    "skill",
    "workspace",
    "session",
    "mcp-server",
    "mcp-app-binding"
  ]),
  targetId: z.string().min(1),
  exists: z.boolean(),
  warnings: z.array(z.string()),
  blockers: z.array(z.string()),
  impact: configImpactPreviewSchema
});

export const configImportPreviewSchema = z.object({
  warnings: z.array(z.string()),
  counts: z.object({
    providers: z.number().int().min(0),
    promptTemplates: z.number().int().min(0),
    skills: z.number().int().min(0),
    workspaces: z.number().int().min(0),
    sessionRecords: z.number().int().min(0),
    bindings: z.number().int().min(0),
    appQuotas: z.number().int().min(0),
    failoverChains: z.number().int().min(0),
    mcpServers: z.number().int().min(0),
    appMcpBindings: z.number().int().min(0)
  }),
  impact: configImpactPreviewSchema
});

export const configRestorePreviewSchema = z.object({
  targetVersion: z.number().int().positive(),
  currentVersion: z.number().int().positive().nullable(),
  warnings: z.array(z.string()),
  diff: configSnapshotDiffSchema,
  impact: configImpactPreviewSchema
});

export const exportPackageSchema = z.object({
  version: z.literal("0.1.0"),
  exportedAt: z.string().datetime(),
  providers: z.array(exportProviderSchema),
  bindings: z.array(appBindingSchema),
  appQuotas: z.array(appQuotaSchema).default([]),
  proxyPolicy: proxyPolicySchema,
  failoverChains: z.array(failoverChainSchema).default([]),
  mcpServers: z.array(mcpServerSchema).default([]),
  appMcpBindings: z.array(appMcpBindingSchema).default([]),
  promptTemplates: z.array(promptTemplateSchema).default([]),
  skills: z.array(skillSchema).default([]),
  workspaces: z.array(workspaceSchema).default([]),
  sessionRecords: z.array(sessionRecordSchema).default([]),
  snapshot: configSnapshotSchema.nullable()
});

export const hostCliLifecycleModeSchema = z.enum(["persistent", "foreground-session"]);
export const hostCliTakeoverModeSchema = z.enum(["file-rewrite", "environment-override"]);

export const hostCliEnvironmentVariableSchema = z.object({
  variableName: z.string().min(1),
  value: z.string(),
  sensitive: z.boolean().default(false),
  description: z.string().min(1)
});

export const hostCliEnvironmentOverrideSchema = z.object({
  exportScriptPath: z.string().min(1),
  exportSnippet: z.string().min(1),
  unsetSnippet: z.string().min(1),
  activationCommands: z.array(z.string().min(1)).min(1),
  deactivationCommands: z.array(z.string().min(1)).min(1),
  variables: z.array(hostCliEnvironmentVariableSchema).min(1),
  activationScope: z.enum(["shell-session", "user-managed-script"]).default("user-managed-script")
});

export const hostCliDiscoverySchema = z.object({
  appCode: appCodeSchema,
  discovered: z.boolean(),
  executablePath: z.string().nullable(),
  configPath: z.string().nullable(),
  configLocationHint: z.string().nullable().default(null),
  status: z.enum(["discovered", "missing", "path-anomaly"]),
  configFormat: z.enum(["toml", "json", "unknown"]).nullable().default(null),
  takeoverSupported: z.boolean().default(false),
  supportLevel: z.enum(["managed", "inspect-only", "planned"]).default("planned"),
  takeoverMethod: z
    .enum(["file-rewrite", "environment-override", "config-inspect", "external-control-plane"])
    .default("config-inspect"),
  supportedTakeoverModes: z.array(hostCliTakeoverModeSchema).default([]),
  supportReasonCode: z.enum([
    "stable-provider-config",
    "stable-env-config",
    "auth-only-config",
    "unverified-user-config",
    "external-gateway-product"
  ]),
  docsUrl: z.string().url().nullable().default(null),
  integrationState: z.enum(["managed", "unmanaged", "unsupported", "missing"]).default("missing"),
  currentTarget: z.string().nullable().default(null),
  desiredTarget: z.string().nullable().default(null),
  managedTarget: z.string().nullable().default(null),
  lifecycleMode: hostCliLifecycleModeSchema.nullable().default(null),
  managedFeatures: z.array(z.enum(["claude-onboarding-bypassed"])).default([]),
  envConflicts: z.array(
    z.object({
      variableName: z.string().min(1),
      valuePreview: z.string(),
      sourceType: z.enum(["process-env", "shell-file", "environment-file"]),
      sourcePath: z.string().min(1),
      lineNumber: z.number().int().positive().nullable().default(null),
      reason: z.string().min(1)
    })
  ).default([]),
  backupAvailable: z.boolean().default(false),
  lastAppliedAt: z.string().datetime().nullable().default(null)
});

export const hostCliCapabilitySchema = hostCliDiscoverySchema.pick({
  appCode: true,
  configLocationHint: true,
  configFormat: true,
  takeoverSupported: true,
  supportLevel: true,
  takeoverMethod: true,
  supportedTakeoverModes: true,
  supportReasonCode: true,
  docsUrl: true
}).extend({
  binaryName: z.string().min(1)
});

export const hostCliMutationResultSchema = z.object({
  appCode: appCodeSchema,
  action: z.enum(["apply", "rollback"]),
  takeoverMode: hostCliTakeoverModeSchema.default("file-rewrite"),
  configPath: z.string(),
  backupPath: z.string().nullable(),
  integrationState: z.enum(["managed", "unmanaged"]),
  lifecycleMode: hostCliLifecycleModeSchema.nullable().default(null),
  environmentOverride: hostCliEnvironmentOverrideSchema.nullable().default(null),
  message: z.string().min(1)
});

export const hostCliApplyPreviewSchema = z.object({
  appCode: appCodeSchema,
  takeoverMode: hostCliTakeoverModeSchema.default("file-rewrite"),
  configPath: z.string().min(1),
  configExists: z.boolean(),
  backupRequired: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  lifecycleMode: hostCliLifecycleModeSchema,
  desiredTarget: z.string().nullable(),
  environmentOverride: hostCliEnvironmentOverrideSchema.nullable().default(null),
  summary: z.array(z.string().min(1)),
  managedFeaturesToEnable: z.array(z.enum(["claude-onboarding-bypassed"])),
  touchedFiles: z.array(
    z.object({
      path: z.string().min(1),
      exists: z.boolean(),
      backupRequired: z.boolean(),
      changeKind: z.enum(["create", "update"])
    })
  ),
  rollbackPlan: z.array(
    z.object({
      path: z.string().min(1),
      action: z.enum(["restore", "delete"])
    })
  ),
  validationChecklist: z.array(z.string().min(1)),
  runbook: z.array(z.string().min(1)),
  envConflicts: z.array(
    z.object({
      variableName: z.string().min(1),
      valuePreview: z.string(),
      sourceType: z.enum(["process-env", "shell-file", "environment-file"]),
      sourcePath: z.string().min(1),
      lineNumber: z.number().int().positive().nullable().default(null),
      reason: z.string().min(1)
    })
  ).default([]),
  warnings: z.array(z.string().min(1))
});

export const hostCliRollbackBatchResultSchema = z.object({
  totalApps: z.number().int().nonnegative(),
  rolledBackApps: z.array(appCodeSchema),
  failedApps: z.array(appCodeSchema),
  items: z.array(hostCliMutationResultSchema),
  failures: z.array(
    z.object({
      appCode: appCodeSchema,
      message: z.string().min(1)
    })
  ),
  message: z.string().min(1)
});

export const hostCliStartupRecoverySchema = hostCliRollbackBatchResultSchema.extend({
  trigger: z.literal("startup-auto-rollback"),
  executedAt: z.string().datetime()
});

export const onboardingAppCodeSchema = z.enum(["codex", "claude-code"]);

export const quickOnboardingProviderInputSchema = providerUpsertSchema.extend({
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(30_000)
});

export const quickOnboardingPreviewInputSchema = z.object({
  appCode: onboardingAppCodeSchema,
  providers: z.array(quickOnboardingProviderInputSchema).min(1),
  primaryProviderId: z.string().min(1),
  failoverProviderIds: z.array(z.string().min(1)).default([]),
  mode: z.enum(["observe", "managed"]).default("managed"),
  autoApplyHostTakeover: z.boolean().default(false),
  enableProxy: z.boolean().default(true),
  cooldownSeconds: z.number().int().min(5).max(3600).default(30),
  maxAttempts: z.number().int().min(1).max(10).optional()
});

export const quickOnboardingApplyInputSchema = quickOnboardingPreviewInputSchema;

export const quickOnboardingPreviewSchema = z.object({
  appCode: onboardingAppCodeSchema,
  providerPreviews: z.array(providerRoutingPreviewSchema),
  bindingPreview: appBindingRoutingPreviewSchema,
  failoverPreview: failoverChainRoutingPreviewSchema,
  hostTakeoverPreview: hostCliApplyPreviewSchema.nullable(),
  normalizedProviderIds: z.array(z.string().min(1)).min(1),
  normalizedPrimaryProviderId: z.string().min(1),
  normalizedFailoverProviderIds: z.array(z.string().min(1)),
  bindingId: z.string().min(1),
  failoverChainId: z.string().min(1),
  proxyPolicy: proxyPolicySchema,
  canApply: z.boolean(),
  blockingReasons: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  summary: z.array(z.string().min(1)),
  riskLevel: z.enum(["low", "medium", "high"])
});

export const quickOnboardingApplyResultSchema = z.object({
  appCode: onboardingAppCodeSchema,
  providerIds: z.array(z.string().min(1)).min(1),
  primaryProviderId: z.string().min(1),
  failoverProviderIds: z.array(z.string().min(1)),
  bindingId: z.string().min(1),
  failoverChainId: z.string().min(1),
  proxyPolicy: proxyPolicySchema,
  hostTakeoverApplied: z.boolean(),
  hostTakeoverResult: hostCliMutationResultSchema.nullable(),
  hostTakeoverError: z.string().nullable(),
  warnings: z.array(z.string().min(1)),
  summary: z.array(z.string().min(1)),
  snapshotVersion: z.number().int().positive()
});

export const quickContextAssetTargetModeSchema = z.enum([
  "auto",
  "app-binding",
  "active-workspace",
  "active-session",
  "asset-only"
]);

export const quickContextAssetResolvedTargetModeSchema = z.enum([
  "app-binding",
  "active-workspace",
  "active-session",
  "asset-only"
]);

export const quickContextAssetTargetTypeSchema = z.enum([
  "binding",
  "workspace",
  "session",
  "none"
]);

export const quickContextAssetInputSchema = z.object({
  appCode: appCodeSchema,
  promptName: z.string().min(1).optional(),
  promptLocale: localeCodeSchema.default("zh-CN"),
  promptContent: z.string().min(1),
  skillName: z.string().min(1).optional(),
  skillContent: z.string().optional().nullable(),
  targetMode: quickContextAssetTargetModeSchema.default("auto")
});

export const quickContextAssetTargetResolutionSchema = z.object({
  requestedMode: quickContextAssetTargetModeSchema,
  resolvedMode: quickContextAssetResolvedTargetModeSchema,
  targetType: quickContextAssetTargetTypeSchema,
  targetId: z.string().nullable(),
  targetLabel: z.string().nullable(),
  bindingId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  sessionId: z.string().nullable()
});

export const quickContextAssetPreviewSchema = z.object({
  appCode: appCodeSchema,
  promptTemplateId: z.string().min(1),
  skillId: z.string().nullable(),
  target: quickContextAssetTargetResolutionSchema,
  canApply: z.boolean(),
  blockingReasons: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  summary: z.array(z.string().min(1)),
  effectiveContext: effectiveAppContextSchema
});

export const quickContextAssetApplyResultSchema = z.object({
  appCode: appCodeSchema,
  promptTemplate: promptTemplateSchema,
  skill: skillSchema.nullable(),
  target: quickContextAssetTargetResolutionSchema,
  warnings: z.array(z.string().min(1)),
  summary: z.array(z.string().min(1)),
  effectiveContext: effectiveAppContextSchema,
  snapshotVersion: z.number().int().positive()
});

export const promptHostSyncSelectionSourceSchema = z.enum([
  "active-context",
  "single-app-prompt",
  "single-global-prompt",
  "missing",
  "ambiguous"
]);

export const promptHostSyncCapabilitySchema = z.object({
  appCode: appCodeSchema,
  supportLevel: z.enum(["managed", "planned"]),
  promptFilePathHint: z.string().nullable().default(null),
  promptFileName: z.string().nullable().default(null),
  docsUrl: z.string().url().nullable().default(null),
  reason: z.string().min(1)
});

export const promptHostSyncPreviewSchema = z.object({
  appCode: appCodeSchema,
  promptPath: z.string().min(1),
  promptFileExists: z.boolean(),
  backupRequired: z.boolean(),
  rollbackAction: z.enum(["restore", "delete"]),
  applyReady: z.boolean(),
  selectionSource: promptHostSyncSelectionSourceSchema,
  activeContextSource: activeContextResolutionSourceSchema.nullable(),
  promptTemplateId: z.string().nullable(),
  promptTemplateName: z.string().nullable(),
  promptLocale: localeCodeSchema.nullable(),
  ignoredSkillId: z.string().nullable(),
  hasDiff: z.boolean(),
  summary: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  rollbackPlan: z.array(
    z.object({
      path: z.string().min(1),
      action: z.enum(["restore", "delete"])
    })
  )
});

export const promptHostSyncStateSchema = z.object({
  appCode: appCodeSchema,
  promptPath: z.string().min(1),
  backupPath: z.string().nullable(),
  rollbackAction: z.enum(["restore", "delete"]),
  selectionSource: promptHostSyncSelectionSourceSchema,
  activeContextSource: activeContextResolutionSourceSchema.nullable(),
  promptTemplateId: z.string().nullable(),
  promptTemplateName: z.string().nullable(),
  promptLocale: localeCodeSchema.nullable(),
  lastAppliedAt: z.string().datetime(),
  promptFileExists: z.boolean()
});

export const promptHostSyncResultSchema = z.object({
  appCode: appCodeSchema,
  action: z.enum(["apply", "rollback"]),
  promptPath: z.string().min(1),
  backupPath: z.string().nullable(),
  selectionSource: promptHostSyncSelectionSourceSchema,
  promptTemplateId: z.string().nullable(),
  ignoredSkillId: z.string().nullable(),
  message: z.string().min(1)
});

export const promptHostSyncBatchPreviewSchema = z.object({
  totalApps: z.number().int().nonnegative(),
  syncableApps: z.number().int().nonnegative(),
  blockedApps: z.array(appCodeSchema),
  items: z.array(promptHostSyncPreviewSchema),
  warnings: z.array(z.string().min(1))
});

export const promptHostSyncBatchResultSchema = z.object({
  totalApps: z.number().int().nonnegative(),
  appliedApps: z.array(appCodeSchema),
  skippedApps: z.array(appCodeSchema),
  items: z.array(promptHostSyncResultSchema),
  message: z.string().min(1)
});

export const skillDeliverySupportLevelSchema = z.enum([
  "proxy-only",
  "planned"
]);

export const skillDeliveryRecommendedPathSchema = z.enum([
  "active-context-injection",
  "wait-for-stable-host-contract"
]);

export const skillDeliveryCapabilitySchema = z.object({
  appCode: appCodeSchema,
  supportLevel: skillDeliverySupportLevelSchema,
  recommendedPath: skillDeliveryRecommendedPathSchema,
  hostWriteSupported: z.boolean(),
  reason: z.string().min(1)
});

export const promptHostImportPreviewStatusSchema = z.enum([
  "ready-create",
  "ready-match",
  "missing-file",
  "empty-file"
]);

export const promptHostImportPreviewSchema = z.object({
  appCode: appCodeSchema,
  promptPath: z.string().min(1),
  promptFileExists: z.boolean(),
  hasContent: z.boolean(),
  status: promptHostImportPreviewStatusSchema,
  matchedPromptTemplateId: z.string().nullable(),
  matchedPromptTemplateName: z.string().nullable(),
  inferredLocale: localeCodeSchema.nullable(),
  contentBytes: z.number().int().min(0),
  lineCount: z.number().int().min(0),
  warnings: z.array(z.string().min(1))
});

export const promptHostImportResultStatusSchema = z.enum([
  "created",
  "matched-existing"
]);

export const promptHostImportResultSchema = z.object({
  appCode: appCodeSchema,
  promptPath: z.string().min(1),
  status: promptHostImportResultStatusSchema,
  promptTemplateId: z.string().min(1),
  promptTemplateName: z.string().min(1),
  inferredLocale: localeCodeSchema,
  enabled: z.boolean(),
  message: z.string().min(1)
});

export const hostIntegrationKindSchema = z.enum([
  "proxy-config",
  "prompt-file"
]);

export const hostIntegrationEventSchema = z.object({
  id: z.number().int().positive(),
  kind: hostIntegrationKindSchema.default("proxy-config"),
  appCode: appCodeSchema,
  action: z.enum(["apply", "rollback"]),
  configPath: z.string().min(1),
  backupPath: z.string().nullable(),
  integrationState: z.enum(["managed", "unmanaged"]),
  message: z.string().min(1),
  createdAt: z.string().datetime()
});

export const providerHealthEventSchema = z.object({
  id: z.number().int().positive(),
  providerId: z.string().min(1),
  trigger: z.enum(["manual", "recovery"]),
  status: z.enum(["healthy", "unhealthy"]),
  statusCode: z.number().int().nullable(),
  probeUrl: z.string().min(1),
  message: z.string().min(1),
  createdAt: z.string().datetime()
});

export const proxyRequestOutcomeSchema = z.enum([
  "success",
  "error",
  "rejected",
  "failover"
]);

export const proxyRequestDecisionReasonSchema = z.enum([
  "policy-disabled",
  "context-invalid",
  "no-binding",
  "quota-rejected",
  "provider-disabled",
  "unsupported-provider-type",
  "missing-credential",
  "auth",
  "invalid-request",
  "rate-limit",
  "upstream-unavailable",
  "timeout",
  "network",
  "unknown"
]);

export const proxyRequestLogSchema = z.object({
  id: z.number().int().positive(),
  appCode: appCodeSchema,
  providerId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  sessionId: z.string().nullable(),
  contextSource: activeContextResolutionSourceSchema.nullable(),
  promptTemplateId: z.string().nullable(),
  skillId: z.string().nullable(),
  targetUrl: z.string().nullable(),
  method: z.string().min(1),
  path: z.string().min(1),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().int().min(0),
  outcome: proxyRequestOutcomeSchema,
  decisionReason: proxyRequestDecisionReasonSchema.nullable(),
  nextProviderId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime()
});

export const proxyRequestLogQuerySchema = z.object({
  appCode: appCodeSchema.optional(),
  providerId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  outcome: proxyRequestOutcomeSchema.optional(),
  method: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const proxyRequestLogPageSchema = z.object({
  items: z.array(proxyRequestLogSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0)
});

export const usageRecordSchema = z.object({
  id: z.number().int().positive(),
  requestLogId: z.number().int().positive().nullable(),
  appCode: appCodeSchema,
  providerId: z.string().nullable(),
  model: z.string().min(1),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  createdAt: z.string().datetime()
});

export const usageRecordQuerySchema = z.object({
  appCode: appCodeSchema.optional(),
  providerId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const usageTimeBucketSchema = z.enum(["hour", "day"]);

export const usageTimeseriesQuerySchema = usageRecordQuerySchema.pick({
  appCode: true,
  providerId: true,
  model: true,
  startAt: true,
  endAt: true
}).extend({
  bucket: usageTimeBucketSchema.default("day")
});

export const usageRecordPageSchema = z.object({
  items: z.array(usageRecordSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0)
});

export const usageSummarySchema = z.object({
  totalRequests: z.number().int().min(0),
  totalInputTokens: z.number().int().min(0),
  totalOutputTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  byApp: z.array(
    z.object({
      appCode: appCodeSchema,
      requestCount: z.number().int().min(0),
      totalTokens: z.number().int().min(0)
    })
  ),
  byProvider: z.array(
    z.object({
      providerId: z.string().nullable(),
      requestCount: z.number().int().min(0),
      totalTokens: z.number().int().min(0)
    })
  ),
  byModel: z.array(
    z.object({
      model: z.string().min(1),
      requestCount: z.number().int().min(0),
      totalTokens: z.number().int().min(0)
    })
  )
});

export const workspaceRuntimeSummarySchema = z.object({
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  rootPath: z.string().min(1),
  appCode: appCodeSchema.nullable(),
  sessionCount: z.number().int().min(0),
  requestCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  lastRequestAt: z.string().datetime().nullable(),
  lastProviderId: z.string().nullable()
});

export const sessionRuntimeSummarySchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1),
  cwd: z.string().min(1),
  workspaceId: z.string().nullable(),
  appCode: appCodeSchema,
  status: z.enum(["active", "archived"]),
  requestCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  lastRequestAt: z.string().datetime().nullable(),
  lastProviderId: z.string().nullable()
});

export const runtimeContextOverviewSchema = z.object({
  workspaces: z.array(workspaceRuntimeSummarySchema),
  sessions: z.array(sessionRuntimeSummarySchema)
});

export const contextProviderBreakdownSchema = z.object({
  providerId: z.string().nullable(),
  requestCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  lastRequestAt: z.string().datetime().nullable()
});

export const contextFailureBreakdownSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().min(0),
  lastSeenAt: z.string().datetime().nullable()
});

export const contextModelBreakdownSchema = z.object({
  model: z.string().min(1),
  requestCount: z.number().int().min(0),
  totalTokens: z.number().int().min(0)
});

export const contextTimelineSourceSchema = z.enum([
  "proxy-request",
  "provider-health",
  "quota"
]);

export const contextTimelineEventSchema = z.object({
  id: z.string().min(1),
  source: contextTimelineSourceSchema,
  createdAt: z.string().datetime(),
  appCode: appCodeSchema.nullable(),
  providerId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  sessionId: z.string().nullable(),
  level: z.enum(["info", "warn", "error"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  metadata: z.record(z.string(), z.string().nullable())
});

export const workspaceRuntimeDetailSchema = z.object({
  summary: workspaceRuntimeSummarySchema,
  resolvedContext: resolvedWorkspaceContextSchema,
  isActive: z.boolean(),
  providerBreakdown: z.array(contextProviderBreakdownSchema),
  failureBreakdown: z.array(contextFailureBreakdownSchema),
  modelBreakdown: z.array(contextModelBreakdownSchema),
  recentRequestLogs: z.array(proxyRequestLogSchema),
  timeline: z.array(contextTimelineEventSchema)
});

export const sessionRuntimeDetailSchema = z.object({
  summary: sessionRuntimeSummarySchema,
  resolvedContext: resolvedSessionContextSchema,
  isActive: z.boolean(),
  isStale: z.boolean(),
  providerBreakdown: z.array(contextProviderBreakdownSchema),
  failureBreakdown: z.array(contextFailureBreakdownSchema),
  modelBreakdown: z.array(contextModelBreakdownSchema),
  recentRequestLogs: z.array(proxyRequestLogSchema),
  timeline: z.array(contextTimelineEventSchema)
});

export const usageTimeseriesPointSchema = z.object({
  bucketStart: z.string().datetime(),
  requestCount: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0)
});

export const usageTimeseriesSchema = z.object({
  bucket: usageTimeBucketSchema,
  points: z.array(usageTimeseriesPointSchema)
});

export const auditEventSourceSchema = z.enum([
  "host-integration",
  "provider-health",
  "proxy-request",
  "mcp",
  "quota",
  "config-snapshot",
  "system-service"
]);

export const auditEventSchema = z.object({
  id: z.string().min(1),
  source: auditEventSourceSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  level: z.enum(["info", "warn", "error"]),
  appCode: appCodeSchema.nullable(),
  providerId: z.string().nullable(),
  status: z.string().nullable(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.string().nullable())
});

export const auditEventQuerySchema = z.object({
  source: auditEventSourceSchema.optional(),
  appCode: appCodeSchema.optional(),
  providerId: z.string().min(1).optional(),
  level: z.enum(["info", "warn", "error"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const auditEventPageSchema = z.object({
  items: z.array(auditEventSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0)
});

export const providerDiagnosisStatusSchema = z.enum([
  "healthy",
  "degraded",
  "recovering",
  "down",
  "idle",
  "disabled"
]);

export const providerDiagnosticSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  providerType: providerTypeSchema,
  enabled: z.boolean(),
  bindingAppCodes: z.array(appCodeSchema),
  failoverAppCodes: z.array(appCodeSchema),
  requestCount: z.number().int().min(0),
  successCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  failoverCount: z.number().int().min(0),
  successRate: z.number().min(0).max(1).nullable(),
  averageLatencyMs: z.number().min(0).nullable(),
  lastRequestAt: z.string().datetime().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastFailureAt: z.string().datetime().nullable(),
  lastRecoveredAt: z.string().datetime().nullable(),
  lastProbeAt: z.string().datetime().nullable(),
  lastProbeResult: z.enum(["healthy", "unhealthy"]).nullable(),
  recoveryProbeInFlight: z.boolean(),
  recoveryAttemptCount: z.number().int().min(0),
  recoverySuccessCount: z.number().int().min(0),
  recoverySuccessThreshold: z.number().int().min(1),
  nextRecoveryProbeAt: z.string().datetime().nullable(),
  circuitState: z.enum(["closed", "open", "half-open"]),
  diagnosisStatus: providerDiagnosisStatusSchema,
  cooldownUntil: z.string().datetime().nullable(),
  recoveryProbeUrl: z.string().url().nullable(),
  lastRequestPath: z.string().nullable(),
  lastRequestMethod: z.string().nullable(),
  lastStatusCode: z.number().int().nullable(),
  lastErrorMessage: z.string().nullable(),
  recentErrorMessages: z.array(z.string().min(1))
});

export const providerDiagnosticListSchema = z.object({
  items: z.array(providerDiagnosticSchema)
});

export const providerFailureCategorySchema = z.enum([
  "none",
  "auth",
  "rate-limit",
  "upstream-unavailable",
  "timeout",
  "network",
  "manual-isolation",
  "unknown"
]);

export const providerDiagnosticRecommendationSchema = z.enum([
  "check-credentials",
  "check-upstream-availability",
  "check-rate-limit",
  "observe-recent-failures",
  "ready"
]);

export const providerDiagnosticDetailSchema = z.object({
  diagnostic: providerDiagnosticSchema,
  recentRequestLogs: z.array(proxyRequestLogSchema),
  recentHealthEvents: z.array(providerHealthEventSchema),
  failureCategory: providerFailureCategorySchema,
  recommendation: providerDiagnosticRecommendationSchema,
  recommendationMessage: z.string().min(1)
});

export const systemMetadataSchema = z.object({
  projectName: z.literal("CC Switch Web"),
  releaseStage: z.enum(["bootstrap", "phase-1", "phase-2"]),
  repositoryMode: z.enum(["private-bootstrap", "open-source-ready"]),
  deliveryTargets: z.array(z.enum(["host-native", "docker-secondary"])),
  supportedLocales: z.array(localeCodeSchema),
  defaultLocale: localeCodeSchema,
  daemon: z.object({
    defaultHost: z.string().min(1),
    defaultPort: z.number().int().positive(),
    allowedOriginsEnvKey: z.string().min(1),
    defaultAllowedOrigins: z.array(z.string().min(1))
  }),
  webConsole: z.object({
    enabledOnDemand: z.boolean(),
    recommendedCommand: z.string().min(1),
    defaultPort: z.number().int().positive(),
    integratedIntoDaemon: z.boolean(),
    mountPath: z.string().min(1),
    authMode: z.enum(["token-cookie", "none"])
  })
});

export const controlAuthRuntimeViewSchema = z.object({
  source: z.enum(["env", "database"]),
  canRotate: z.boolean(),
  maskedToken: z.string().min(1),
  updatedAt: z.string().datetime().nullable()
});

export const controlAuthRotateResultSchema = z.object({
  source: z.enum(["env", "database"]),
  token: z.string().min(1)
});

export const systemServiceEnvDiffItemSchema = z.object({
  key: z.string().min(1),
  desired: z.string().nullable(),
  actual: z.string().nullable()
});

export const systemServiceRuntimeDiffItemSchema = z.object({
  field: z.string().min(1),
  desired: z.union([z.string(), z.number(), z.null()]),
  actual: z.union([z.string(), z.number(), z.null()])
});

export const systemServiceDoctorSchema = z.object({
  service: z.literal("cc-switch-web.service"),
  fallback: z.string().min(1),
  checks: z.object({
    systemd: z.object({
      available: z.boolean(),
      detail: z.string().min(1)
    }),
    files: z.object({
      unitPath: z.string().min(1),
      unitExists: z.boolean(),
      envPath: z.string().min(1),
      envExists: z.boolean(),
      envInSync: z.boolean(),
      envDiff: z.array(systemServiceEnvDiffItemSchema)
    }),
    service: z.object({
      knownToSystemd: z.boolean(),
      active: z.boolean(),
      activeState: z.string().nullable(),
      subState: z.string().nullable(),
      loadState: z.string().nullable(),
      unitFileState: z.string().nullable(),
      execMainPid: z.number().int().nullable()
    }),
    runtime: z.object({
      daemonMatchesDesired: z.boolean(),
      differences: z.array(systemServiceRuntimeDiffItemSchema)
    }),
    recommendedActions: z.array(z.string().min(1))
  })
});

export const systemServiceMutationActionSchema = z.enum(["sync-env", "install"]);

export const systemServiceMutationResultSchema = z.object({
  action: systemServiceMutationActionSchema,
  message: z.string().min(1),
  doctor: systemServiceDoctorSchema
});

export const daemonHealthSchema = z.object({
  status: z.string().min(1),
  service: z.string().min(1),
  time: z.string().datetime()
});

export const dashboardRuntimeSchema = z.object({
  runMode: z.enum(["foreground", "systemd-user"]),
  daemonHost: z.string().min(1),
  daemonPort: z.number().int().positive(),
  allowedOrigins: z.array(z.string().min(1)),
  allowAnyOrigin: z.boolean(),
  healthProbeIntervalMs: z.number().int().positive(),
  dataDir: z.string().min(1),
  dbPath: z.string().min(1),
  latestSnapshotVersion: z.number().int().positive().nullable()
});

export const dashboardProxyRuntimeBindingSchema = z.object({
  appCode: appCodeSchema,
  mode: z.enum(["observe", "managed"]),
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  providerType: providerTypeSchema,
  enabled: z.boolean(),
  upstreamBaseUrl: z.string().url(),
  hasCredential: z.boolean(),
  timeoutMs: z.number().int().positive(),
  proxyBasePath: z.string().min(1)
});

export const dashboardProviderHealthStateSchema = z.object({
  providerId: z.string().min(1),
  circuitState: z.enum(["closed", "open", "half-open"]),
  consecutiveFailures: z.number().int().min(0),
  lastFailureAt: z.string().datetime().nullable(),
  lastSuccessAt: z.string().datetime().nullable(),
  lastRecoveredAt: z.string().datetime().nullable(),
  lastProbeAt: z.string().datetime().nullable(),
  lastProbeResult: z.enum(["healthy", "unhealthy"]).nullable(),
  recoveryProbeInFlight: z.boolean(),
  recoveryAttemptCount: z.number().int().min(0),
  recoverySuccessCount: z.number().int().min(0),
  recoverySuccessThreshold: z.number().int().min(1),
  nextRecoveryProbeAt: z.string().datetime().nullable(),
  cooldownUntil: z.string().datetime().nullable(),
  lastErrorMessage: z.string().nullable()
});

export const dashboardProxyRuntimeSchema = z.object({
  runtimeState: z.enum(["stopped", "starting", "running"]),
  policy: proxyPolicySchema,
  snapshotVersion: z.number().int().positive().nullable(),
  lastReloadedAt: z.string().datetime().nullable(),
  activeBindings: z.array(dashboardProxyRuntimeBindingSchema),
  failoverChains: z.array(failoverChainSchema),
  providerHealthStates: z.array(dashboardProviderHealthStateSchema),
  providerHealthEvents: z.array(providerHealthEventSchema),
  requestLogCount: z.number().int().min(0),
  usageRecordCount: z.number().int().min(0)
});

export const dashboardBootstrapSchema = z.object({
  health: daemonHealthSchema,
  providers: z.array(providerSchema),
  promptTemplates: z.array(promptTemplateSchema),
  skills: z.array(skillSchema),
  workspaces: z.array(workspaceSchema),
  workspaceDiscovery: z.array(workspaceDiscoveryItemSchema),
  resolvedWorkspaceContexts: z.array(resolvedWorkspaceContextSchema),
  sessionRecords: z.array(sessionRecordSchema),
  resolvedSessionContexts: z.array(resolvedSessionContextSchema),
  sessionGovernance: sessionGovernanceStatusSchema,
  effectiveContexts: z.array(effectiveAppContextSchema),
  contextRoutingExplanations: z.array(contextRoutingExplanationSchema),
  activeContext: activeContextStateSchema,
  bindings: z.array(appBindingSchema),
  appQuotas: z.array(appQuotaSchema),
  appQuotaStatuses: z.array(appQuotaStatusSchema),
  failoverChains: z.array(failoverChainSchema),
  mcpServers: z.array(mcpServerSchema),
  appMcpBindings: z.array(appMcpBindingSchema),
  mcpRuntimeViews: z.array(mcpAppRuntimeViewSchema),
  mcpHostSyncCapabilities: z.array(hostMcpSyncCapabilitySchema),
  mcpHostSyncStates: z.array(mcpHostSyncStateSchema),
  promptHostSyncCapabilities: z.array(promptHostSyncCapabilitySchema),
  promptHostSyncStates: z.array(promptHostSyncStateSchema),
  skillDeliveryCapabilities: z.array(skillDeliveryCapabilitySchema),
  discoveries: z.array(hostCliDiscoverySchema),
  hostStartupRecovery: hostCliStartupRecoverySchema.nullable(),
  hostIntegrationEvents: z.array(hostIntegrationEventSchema),
  metadata: systemMetadataSchema,
  controlAuth: controlAuthRuntimeViewSchema,
  serviceDoctor: systemServiceDoctorSchema,
  runtime: dashboardRuntimeSchema,
  proxyRuntime: dashboardProxyRuntimeSchema,
  runtimeContexts: runtimeContextOverviewSchema,
  providerDiagnostics: z.array(providerDiagnosticSchema),
  serviceAuditEvents: z.array(auditEventSchema),
  proxyRequestLogs: z.array(proxyRequestLogSchema),
  initialRequestLogPage: proxyRequestLogPageSchema,
  initialAuditEventPage: auditEventPageSchema,
  initialUsageRecordPage: usageRecordPageSchema,
  initialUsageSummary: usageSummarySchema,
  initialUsageTimeseries: usageTimeseriesSchema,
  latestSnapshot: configSnapshotSchema.nullable(),
  recentSnapshots: z.array(configSnapshotSummarySchema),
  latestSnapshotDiff: configSnapshotDiffSchema.nullable()
});

export type ProviderType = z.infer<typeof providerTypeSchema>;
export type AppCode = z.infer<typeof appCodeSchema>;
export type LocaleCode = z.infer<typeof localeCodeSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type ProviderUpsert = z.infer<typeof providerUpsertSchema>;
export type ExportProvider = z.infer<typeof exportProviderSchema>;
export type AppBinding = z.infer<typeof appBindingSchema>;
export type AppBindingUpsert = z.infer<typeof appBindingUpsertSchema>;
export type RoutingPreviewIssueCode = z.infer<typeof routingPreviewIssueCodeSchema>;
export type RoutingPlanCandidate = z.infer<typeof routingPlanCandidateSchema>;
export type ConfigImpactPreview = z.infer<typeof configImpactPreviewSchema>;
export type RoutingExecutionPlanPreview = z.infer<typeof routingExecutionPlanPreviewSchema>;
export type ProviderRoutingPreview = z.infer<typeof providerRoutingPreviewSchema>;
export type PromptTemplateSavePreview = z.infer<typeof promptTemplateSavePreviewSchema>;
export type SkillSavePreview = z.infer<typeof skillSavePreviewSchema>;
export type AssetGovernanceIssueCode = z.infer<typeof assetGovernanceIssueCodeSchema>;
export type AssetGovernanceRepairAction = z.infer<typeof assetGovernanceRepairActionSchema>;
export type AssetGovernanceTargetType = z.infer<typeof assetGovernanceTargetTypeSchema>;
export type AssetGovernancePreviewItem = z.infer<typeof assetGovernancePreviewItemSchema>;
export type AssetGovernancePreview = z.infer<typeof assetGovernancePreviewSchema>;
export type AssetGovernanceRepairResult = z.infer<typeof assetGovernanceRepairResultSchema>;
export type AppQuotaPeriod = z.infer<typeof appQuotaPeriodSchema>;
export type AppQuota = z.infer<typeof appQuotaSchema>;
export type AppQuotaUpsert = z.infer<typeof appQuotaUpsertSchema>;
export type AppQuotaUsageState = z.infer<typeof appQuotaUsageStateSchema>;
export type AppQuotaStatus = z.infer<typeof appQuotaStatusSchema>;
export type ProxyPolicy = z.infer<typeof proxyPolicySchema>;
export type FailoverChain = z.infer<typeof failoverChainSchema>;
export type FailoverChainUpsert = z.infer<typeof failoverChainUpsertSchema>;
export type AppBindingRoutingPreview = z.infer<typeof appBindingRoutingPreviewSchema>;
export type FailoverChainRoutingPreview = z.infer<typeof failoverChainRoutingPreviewSchema>;
export type OnboardingAppCode = z.infer<typeof onboardingAppCodeSchema>;
export type QuickOnboardingProviderInput = z.infer<typeof quickOnboardingProviderInputSchema>;
export type QuickOnboardingPreviewInput = z.infer<typeof quickOnboardingPreviewInputSchema>;
export type QuickOnboardingApplyInput = z.infer<typeof quickOnboardingApplyInputSchema>;
export type QuickOnboardingPreview = z.infer<typeof quickOnboardingPreviewSchema>;
export type QuickOnboardingApplyResult = z.infer<typeof quickOnboardingApplyResultSchema>;
export type QuickContextAssetTargetMode = z.infer<typeof quickContextAssetTargetModeSchema>;
export type QuickContextAssetResolvedTargetMode = z.infer<typeof quickContextAssetResolvedTargetModeSchema>;
export type QuickContextAssetTargetType = z.infer<typeof quickContextAssetTargetTypeSchema>;
export type QuickContextAssetInput = z.infer<typeof quickContextAssetInputSchema>;
export type QuickContextAssetTargetResolution = z.infer<typeof quickContextAssetTargetResolutionSchema>;
export type QuickContextAssetPreview = z.infer<typeof quickContextAssetPreviewSchema>;
export type QuickContextAssetApplyResult = z.infer<typeof quickContextAssetApplyResultSchema>;
export type WorkspaceSavePreview = z.infer<typeof workspaceSavePreviewSchema>;
export type SessionSavePreview = z.infer<typeof sessionSavePreviewSchema>;
export type AppQuotaSavePreview = z.infer<typeof appQuotaSavePreviewSchema>;
export type ProxyPolicySavePreview = z.infer<typeof proxyPolicySavePreviewSchema>;
export type McpServerTransport = z.infer<typeof mcpServerTransportSchema>;
export type McpServer = z.infer<typeof mcpServerSchema>;
export type McpServerUpsert = z.infer<typeof mcpServerUpsertSchema>;
export type AppMcpBinding = z.infer<typeof appMcpBindingSchema>;
export type AppMcpBindingUpsert = z.infer<typeof appMcpBindingUpsertSchema>;
export type HostMcpSyncCapability = z.infer<typeof hostMcpSyncCapabilitySchema>;
export type HostMcpSyncResult = z.infer<typeof hostMcpSyncResultSchema>;
export type McpExistingServerStrategy = z.infer<typeof mcpExistingServerStrategySchema>;
export type McpMissingBindingStrategy = z.infer<typeof mcpMissingBindingStrategySchema>;
export type McpImportOptions = z.infer<typeof mcpImportOptionsSchema>;
export type McpImportFieldDiff = z.infer<typeof mcpImportFieldDiffSchema>;
export type McpImportPreviewItem = z.infer<typeof mcpImportPreviewItemSchema>;
export type McpImportPreview = z.infer<typeof mcpImportPreviewSchema>;
export type McpRuntimeItem = z.infer<typeof mcpRuntimeItemSchema>;
export type McpHostSyncState = z.infer<typeof mcpHostSyncStateSchema>;
export type McpRuntimeHostState = z.infer<typeof mcpRuntimeHostStateSchema>;
export type McpAppRuntimeView = z.infer<typeof mcpAppRuntimeViewSchema>;
export type McpServerUsage = z.infer<typeof mcpServerUsageSchema>;
export type McpServerSavePreview = z.infer<typeof mcpServerSavePreviewSchema>;
export type McpBindingSavePreview = z.infer<typeof mcpBindingSavePreviewSchema>;
export type McpHostSyncPreview = z.infer<typeof mcpHostSyncPreviewSchema>;
export type McpHostSyncBatchPreview = z.infer<typeof mcpHostSyncBatchPreviewSchema>;
export type McpHostSyncBatchResult = z.infer<typeof mcpHostSyncBatchResultSchema>;
export type McpHostSyncBatchRollbackResult = z.infer<typeof mcpHostSyncBatchRollbackResultSchema>;
export type McpGovernanceRepairAction = z.infer<typeof mcpGovernanceRepairActionSchema>;
export type McpGovernanceRepairPlanItem = z.infer<typeof mcpGovernanceRepairPlanItemSchema>;
export type McpGovernanceRepairPreview = z.infer<typeof mcpGovernanceRepairPreviewSchema>;
export type McpGovernanceRepairResult = z.infer<typeof mcpGovernanceRepairResultSchema>;
export type McpGovernanceBatchPreview = z.infer<typeof mcpGovernanceBatchPreviewSchema>;
export type McpGovernanceBatchResult = z.infer<typeof mcpGovernanceBatchResultSchema>;
export type McpVerificationHistoryStatus = z.infer<typeof mcpVerificationHistoryStatusSchema>;
export type McpVerificationBaselineAction = z.infer<typeof mcpVerificationBaselineActionSchema>;
export type McpVerificationHistoryItem = z.infer<typeof mcpVerificationHistoryItemSchema>;
export type McpVerificationHistoryQuery = z.infer<typeof mcpVerificationHistoryQuerySchema>;
export type McpVerificationHistoryPage = z.infer<typeof mcpVerificationHistoryPageSchema>;
export type PromptTemplate = z.infer<typeof promptTemplateSchema>;
export type PromptTemplateUpsert = z.infer<typeof promptTemplateUpsertSchema>;
export type PromptTemplateVersion = z.infer<typeof promptTemplateVersionSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type SkillUpsert = z.infer<typeof skillUpsertSchema>;
export type SkillVersion = z.infer<typeof skillVersionSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceUpsert = z.infer<typeof workspaceUpsertSchema>;
export type SessionRecordStatus = z.infer<typeof sessionRecordStatusSchema>;
export type SessionRecord = z.infer<typeof sessionRecordSchema>;
export type SessionRecordUpsert = z.infer<typeof sessionRecordUpsertSchema>;
export type SessionGovernanceStatus = z.infer<typeof sessionGovernanceStatusSchema>;
export type SessionArchiveResult = z.infer<typeof sessionArchiveResultSchema>;
export type WorkspaceDiscoveryStatus = z.infer<typeof workspaceDiscoveryStatusSchema>;
export type WorkspaceDiscoverySource = z.infer<typeof workspaceDiscoverySourceSchema>;
export type WorkspaceDiscoveryItem = z.infer<typeof workspaceDiscoveryItemSchema>;
export type WorkspaceDiscoveryImport = z.infer<typeof workspaceDiscoveryImportSchema>;
export type WorkspaceDiscoveryImportResult = z.infer<typeof workspaceDiscoveryImportResultSchema>;
export type WorkspaceDiscoveryBatchImport = z.infer<typeof workspaceDiscoveryBatchImportSchema>;
export type WorkspaceDiscoveryBatchImportResult = z.infer<typeof workspaceDiscoveryBatchImportResultSchema>;
export type SessionEnsureInput = z.infer<typeof sessionEnsureInputSchema>;
export type SessionEnsureResult = z.infer<typeof sessionEnsureResultSchema>;
export type ContextReferenceSource = z.infer<typeof contextReferenceSourceSchema>;
export type ResolvedProviderReference = z.infer<typeof resolvedProviderReferenceSchema>;
export type ResolvedPromptReference = z.infer<typeof resolvedPromptReferenceSchema>;
export type ResolvedSkillReference = z.infer<typeof resolvedSkillReferenceSchema>;
export type ResolvedWorkspaceContext = z.infer<typeof resolvedWorkspaceContextSchema>;
export type ResolvedSessionContext = z.infer<typeof resolvedSessionContextSchema>;
export type ActiveContextState = z.infer<typeof activeContextStateSchema>;
export type EffectiveAppContext = z.infer<typeof effectiveAppContextSchema>;
export type ContextRoutingExplanationStep = z.infer<typeof contextRoutingExplanationStepSchema>;
export type ContextRoutingExplanation = z.infer<typeof contextRoutingExplanationSchema>;
export type ConfigSnapshotSummary = z.infer<typeof configSnapshotSummarySchema>;
export type ConfigSnapshotDiffBucket = z.infer<typeof configSnapshotDiffBucketSchema>;
export type ConfigSnapshotDiff = z.infer<typeof configSnapshotDiffSchema>;
export type ConfigDeletePreview = z.infer<typeof configDeletePreviewSchema>;
export type ConfigImportPreview = z.infer<typeof configImportPreviewSchema>;
export type ConfigRestorePreview = z.infer<typeof configRestorePreviewSchema>;
export type HostCliLifecycleMode = z.infer<typeof hostCliLifecycleModeSchema>;
export type HostCliTakeoverMode = z.infer<typeof hostCliTakeoverModeSchema>;
export type HostCliEnvironmentOverride = z.infer<typeof hostCliEnvironmentOverrideSchema>;
export type HostCliDiscovery = z.infer<typeof hostCliDiscoverySchema>;
export type HostCliCapability = z.infer<typeof hostCliCapabilitySchema>;
export type HostCliMutationResult = z.infer<typeof hostCliMutationResultSchema>;
export type HostCliApplyPreview = z.infer<typeof hostCliApplyPreviewSchema>;
export type HostCliRollbackBatchResult = z.infer<typeof hostCliRollbackBatchResultSchema>;
export type HostCliStartupRecovery = z.infer<typeof hostCliStartupRecoverySchema>;
export type PromptHostSyncSelectionSource = z.infer<typeof promptHostSyncSelectionSourceSchema>;
export type PromptHostSyncCapability = z.infer<typeof promptHostSyncCapabilitySchema>;
export type PromptHostSyncPreview = z.infer<typeof promptHostSyncPreviewSchema>;
export type PromptHostSyncState = z.infer<typeof promptHostSyncStateSchema>;
export type PromptHostSyncResult = z.infer<typeof promptHostSyncResultSchema>;
export type PromptHostSyncBatchPreview = z.infer<typeof promptHostSyncBatchPreviewSchema>;
export type PromptHostSyncBatchResult = z.infer<typeof promptHostSyncBatchResultSchema>;
export type SkillDeliverySupportLevel = z.infer<typeof skillDeliverySupportLevelSchema>;
export type SkillDeliveryRecommendedPath = z.infer<typeof skillDeliveryRecommendedPathSchema>;
export type SkillDeliveryCapability = z.infer<typeof skillDeliveryCapabilitySchema>;
export type PromptHostImportPreviewStatus = z.infer<typeof promptHostImportPreviewStatusSchema>;
export type PromptHostImportPreview = z.infer<typeof promptHostImportPreviewSchema>;
export type PromptHostImportResultStatus = z.infer<typeof promptHostImportResultStatusSchema>;
export type PromptHostImportResult = z.infer<typeof promptHostImportResultSchema>;
export type HostIntegrationKind = z.infer<typeof hostIntegrationKindSchema>;
export type HostIntegrationEvent = z.infer<typeof hostIntegrationEventSchema>;
export type ProviderHealthEvent = z.infer<typeof providerHealthEventSchema>;
export type ProxyRequestOutcome = z.infer<typeof proxyRequestOutcomeSchema>;
export type ProxyRequestDecisionReason = z.infer<typeof proxyRequestDecisionReasonSchema>;
export type ProxyRequestLog = z.infer<typeof proxyRequestLogSchema>;
export type ProxyRequestLogQuery = z.infer<typeof proxyRequestLogQuerySchema>;
export type ProxyRequestLogPage = z.infer<typeof proxyRequestLogPageSchema>;
export type UsageRecord = z.infer<typeof usageRecordSchema>;
export type UsageRecordQuery = z.infer<typeof usageRecordQuerySchema>;
export type UsageRecordPage = z.infer<typeof usageRecordPageSchema>;
export type UsageSummary = z.infer<typeof usageSummarySchema>;
export type WorkspaceRuntimeSummary = z.infer<typeof workspaceRuntimeSummarySchema>;
export type SessionRuntimeSummary = z.infer<typeof sessionRuntimeSummarySchema>;
export type RuntimeContextOverview = z.infer<typeof runtimeContextOverviewSchema>;
export type ContextProviderBreakdown = z.infer<typeof contextProviderBreakdownSchema>;
export type ContextFailureBreakdown = z.infer<typeof contextFailureBreakdownSchema>;
export type ContextModelBreakdown = z.infer<typeof contextModelBreakdownSchema>;
export type ContextTimelineSource = z.infer<typeof contextTimelineSourceSchema>;
export type ContextTimelineEvent = z.infer<typeof contextTimelineEventSchema>;
export type WorkspaceRuntimeDetail = z.infer<typeof workspaceRuntimeDetailSchema>;
export type SessionRuntimeDetail = z.infer<typeof sessionRuntimeDetailSchema>;
export type UsageTimeBucket = z.infer<typeof usageTimeBucketSchema>;
export type UsageTimeseriesQuery = z.infer<typeof usageTimeseriesQuerySchema>;
export type UsageTimeseriesPoint = z.infer<typeof usageTimeseriesPointSchema>;
export type UsageTimeseries = z.infer<typeof usageTimeseriesSchema>;
export type AuditEventSource = z.infer<typeof auditEventSourceSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;
export type AuditEventPage = z.infer<typeof auditEventPageSchema>;
export type ProviderDiagnosisStatus = z.infer<typeof providerDiagnosisStatusSchema>;
export type ProviderDiagnostic = z.infer<typeof providerDiagnosticSchema>;
export type ProviderFailureCategory = z.infer<typeof providerFailureCategorySchema>;
export type ProviderDiagnosticRecommendation = z.infer<typeof providerDiagnosticRecommendationSchema>;
export type ProviderDiagnosticDetail = z.infer<typeof providerDiagnosticDetailSchema>;
export type SystemMetadata = z.infer<typeof systemMetadataSchema>;
export type ControlAuthRuntimeView = z.infer<typeof controlAuthRuntimeViewSchema>;
export type ControlAuthRotateResult = z.infer<typeof controlAuthRotateResultSchema>;
export type SystemServiceEnvDiffItem = z.infer<typeof systemServiceEnvDiffItemSchema>;
export type SystemServiceRuntimeDiffItem = z.infer<typeof systemServiceRuntimeDiffItemSchema>;
export type SystemServiceDoctor = z.infer<typeof systemServiceDoctorSchema>;
export type SystemServiceMutationAction = z.infer<typeof systemServiceMutationActionSchema>;
export type SystemServiceMutationResult = z.infer<typeof systemServiceMutationResultSchema>;
export type DaemonHealth = z.infer<typeof daemonHealthSchema>;
export type DashboardRuntime = z.infer<typeof dashboardRuntimeSchema>;
export type DashboardProxyRuntimeBinding = z.infer<typeof dashboardProxyRuntimeBindingSchema>;
export type DashboardProviderHealthState = z.infer<typeof dashboardProviderHealthStateSchema>;
export type DashboardProxyRuntime = z.infer<typeof dashboardProxyRuntimeSchema>;
export type DashboardBootstrap = z.infer<typeof dashboardBootstrapSchema>;
export type ConfigSnapshot = z.infer<typeof configSnapshotSchema>;
export type ExportPackage = z.infer<typeof exportPackageSchema>;

export const nowIso = (): string => new Date().toISOString();

export const defaultProxyPolicy: ProxyPolicy = {
  listenHost: "127.0.0.1",
  listenPort: 8788,
  enabled: false,
  requestTimeoutMs: 60_000,
  failureThreshold: 3
};

export const systemMetadata: SystemMetadata = {
  projectName: "CC Switch Web",
  releaseStage: "phase-2",
  repositoryMode: "open-source-ready",
  deliveryTargets: ["host-native", "docker-secondary"],
  supportedLocales: ["zh-CN", "en-US"],
  defaultLocale: "zh-CN",
  daemon: {
    defaultHost: "127.0.0.1",
    defaultPort: 8787,
    allowedOriginsEnvKey: "CCSW_ALLOWED_ORIGINS",
    defaultAllowedOrigins: [
      "http://127.0.0.1:8788",
      "http://localhost:8788"
    ]
  },
  webConsole: {
    enabledOnDemand: true,
    recommendedCommand: "ccsw web",
    defaultPort: 8788,
    integratedIntoDaemon: true,
    mountPath: "/ui",
    authMode: "token-cookie"
  }
};
