import type { FastifyInstance, FastifyReply } from "fastify";

import {
  appCodeSchema,
  auditEventQuerySchema,
  appBindingUpsertSchema,
  appQuotaUpsertSchema,
  appMcpBindingUpsertSchema,
  failoverChainUpsertSchema,
  mcpImportOptionsSchema,
  mcpVerificationHistoryQuerySchema,
  mcpServerUpsertSchema,
  promptTemplateUpsertSchema,
  providerUpsertSchema,
  proxyRequestLogQuerySchema,
  proxyPolicySchema,
  quickContextAssetInputSchema,
  quickOnboardingApplyInputSchema,
  quickOnboardingPreviewInputSchema,
  sessionEnsureInputSchema,
  sessionRecordUpsertSchema,
  skillUpsertSchema,
  usageRecordQuerySchema,
  usageTimeseriesQuerySchema,
  workspaceDiscoveryBatchImportSchema,
  workspaceDiscoveryImportSchema,
  workspaceUpsertSchema
} from "@cc-switch-web/shared";

import type { DaemonRuntime } from "../bootstrap/runtime.js";

const sendConflict = (reply: FastifyReply, message: string) =>
  reply.code(409).send({ message });

const sendNotFound = (reply: FastifyReply, message: string) =>
  reply.code(404).send({ message });

export const registerRoutes = async (
  app: FastifyInstance,
  runtime: DaemonRuntime
): Promise<void> => {
  const {
    providerRepository,
    promptTemplateRepository,
    assetVersionService,
    skillRepository,
    skillDeliveryService,
    workspaceRepository,
    sessionRecordRepository,
    sessionGovernanceService,
    workspaceContextService,
    activeContextService,
    activeContextPolicyService,
    workspaceDiscoveryService,
    sessionLifecycleService,
    runtimeContextObservabilityService,
    bindingRepository,
    appQuotaRepository,
    failoverChainRepository,
    auditEventService,
    proxyService,
    proxyRuntimeService,
    routingGovernanceService,
    contextRoutingExplanationService,
    importExportService,
    configGovernanceService,
    assetGovernanceService,
    mcpServerRepository,
    appMcpBindingRepository,
    mcpEventRepository,
    mcpHostSyncService,
    mcpService,
    mcpVerificationHistoryService,
    hostDiscoveryService,
    quickOnboardingService,
    quickContextAssetService,
    promptHostSyncService,
    systemService,
    snapshotService
  } = runtime;
  const invalidateDashboardBootstrap = (): void => {
    runtime.dashboardBootstrapService.invalidate();
  };

  app.get("/health", async () => ({
    status: "ok",
    service: "CC Switch Web-daemon",
    time: new Date().toISOString()
  }));

  app.get("/api/v1/dashboard/bootstrap", async (request) => {
    const query = request.query as { refresh?: string | number | boolean } | undefined;
    const refresh = query?.refresh;
    return runtime.dashboardBootstrapService.load({
      force: refresh === true || refresh === "true" || refresh === "1" || refresh === 1
    });
  });

  app.get("/api/v1/providers", async () => ({
    items: providerRepository.list()
  }));

  app.get("/api/v1/providers/diagnostics", async () => ({
    items: proxyRuntimeService.listProviderDiagnostics()
  }));

  app.get("/api/v1/providers/:id/diagnostics", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return {
        item: proxyRuntimeService.getProviderDiagnosticDetail(id)
      };
    } catch (error) {
      return sendNotFound(reply, error instanceof Error ? error.message : `Provider diagnostic not found: ${id}`);
    }
  });

  app.get("/api/v1/prompts", async () => ({
    items: promptTemplateRepository.list()
  }));

  app.post("/api/v1/prompts", async (request) => {
    const input = promptTemplateUpsertSchema.parse(request.body);
    const { item } = assetVersionService.upsertPromptTemplate(input);
    const snapshot = snapshotService.create(`prompt-template:${input.id}`);
    return { item, snapshotVersion: snapshot.version };
  });
  app.post("/api/v1/prompts/preview", async (request) => ({
    item: configGovernanceService.previewPromptTemplateUpsert(promptTemplateUpsertSchema.parse(request.body))
  }));

  app.get("/api/v1/prompts/:id/versions", async (request) => {
    const { id } = request.params as { id: string };
    return {
      items: assetVersionService.listPromptTemplateVersions(id)
    };
  });

  app.post("/api/v1/prompts/:id/restore/:versionNumber", async (request, reply) => {
    const { id, versionNumber } = request.params as { id: string; versionNumber: string };

    try {
      const { item } = assetVersionService.restorePromptTemplateVersion(
        id,
        Number.parseInt(versionNumber, 10)
      );
      const snapshot = snapshotService.create(`prompt-template-restore:${id}:${versionNumber}`);
      return { item, snapshotVersion: snapshot.version };
    } catch (error) {
      return sendNotFound(
        reply,
        error instanceof Error ? error.message : `Prompt template version not found: ${id}#${versionNumber}`
      );
    }
  });

  app.delete("/api/v1/prompts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const review = configGovernanceService.previewDelete("prompt-template", id);

    if (review.blockers.length > 0) {
      return sendConflict(reply, review.blockers.join("; "));
    }

    const deleted = promptTemplateRepository.delete(id);
    if (!deleted) {
      return sendNotFound(reply, `Prompt template not found: ${id}`);
    }

    const snapshot = snapshotService.create(`prompt-template-delete:${id}`);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/prompts/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("prompt-template", id) };
  });

  app.get("/api/v1/skills", async () => ({
    items: skillRepository.list()
  }));

  app.get("/api/v1/skill-delivery/capabilities", async () => ({
    items: skillDeliveryService.listCapabilities()
  }));

  app.post("/api/v1/skills", async (request, reply) => {
    const input = skillUpsertSchema.parse(request.body);

    if (input.promptTemplateId !== null && !promptTemplateRepository.exists(input.promptTemplateId)) {
      return sendConflict(reply, `Prompt template not found for skill: ${input.promptTemplateId}`);
    }

    const { item } = assetVersionService.upsertSkill(input);
    const snapshot = snapshotService.create(`skill:${input.id}`);
    return { item, snapshotVersion: snapshot.version };
  });
  app.post("/api/v1/skills/preview", async (request) => ({
    item: configGovernanceService.previewSkillUpsert(skillUpsertSchema.parse(request.body))
  }));

  app.get("/api/v1/skills/:id/versions", async (request) => {
    const { id } = request.params as { id: string };
    return {
      items: assetVersionService.listSkillVersions(id)
    };
  });

  app.post("/api/v1/skills/:id/restore/:versionNumber", async (request, reply) => {
    const { id, versionNumber } = request.params as { id: string; versionNumber: string };

    try {
      const { item } = assetVersionService.restoreSkillVersion(
        id,
        Number.parseInt(versionNumber, 10)
      );
      const snapshot = snapshotService.create(`skill-restore:${id}:${versionNumber}`);
      return { item, snapshotVersion: snapshot.version };
    } catch (error) {
      return sendNotFound(
        reply,
        error instanceof Error ? error.message : `Skill version not found: ${id}#${versionNumber}`
      );
    }
  });

  app.delete("/api/v1/skills/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const review = configGovernanceService.previewDelete("skill", id);

    if (review.blockers.length > 0) {
      return sendConflict(reply, review.blockers.join("; "));
    }

    const deleted = skillRepository.delete(id);
    if (!deleted) {
      return sendNotFound(reply, `Skill not found: ${id}`);
    }

    const snapshot = snapshotService.create(`skill-delete:${id}`);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/skills/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("skill", id) };
  });

  app.get("/api/v1/assets/governance/preview-all", async () => ({
    item: assetGovernanceService.preview()
  }));

  app.get("/api/v1/assets/governance/:appCode/preview", async (request) => {
    const { appCode } = request.params as { appCode: string };
    return {
      item: assetGovernanceService.preview(appCodeSchema.parse(appCode))
    };
  });

  app.post("/api/v1/assets/governance/repair-all", async () => {
    const item = assetGovernanceService.repair();
    const snapshotVersion =
      item.repairedItems > 0
        ? snapshotService.create("asset-governance-repair:all").version
        : (snapshotService.latest()?.version ?? snapshotService.create("asset-governance-repair:noop").version);
    return {
      item,
      snapshotVersion
    };
  });

  app.post("/api/v1/assets/governance/:appCode/repair", async (request) => {
    const { appCode } = request.params as { appCode: string };
    const normalizedAppCode = appCodeSchema.parse(appCode);
    const item = assetGovernanceService.repair(normalizedAppCode);
    const snapshotVersion =
      item.repairedItems > 0
        ? snapshotService.create(`asset-governance-repair:${normalizedAppCode}`).version
        : (snapshotService.latest()?.version ??
            snapshotService.create(`asset-governance-repair:${normalizedAppCode}:noop`).version);
    return {
      item,
      snapshotVersion
    };
  });

  app.get("/api/v1/workspaces", async () => ({
    items: workspaceRepository.list()
  }));

  app.get("/api/v1/workspace-discovery", async (request) => {
    const query = request.query as {
      roots?: string;
      depth?: string;
    };
    const roots =
      query.roots?.trim().length
        ? query.roots.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined;
    const depth = query.depth === undefined ? undefined : Number.parseInt(query.depth, 10);
    return {
      items: workspaceDiscoveryService.list({
        ...(roots !== undefined ? { roots } : {}),
        ...(depth !== undefined ? { depth } : {})
      })
    };
  });

  app.post("/api/v1/workspace-discovery/import", async (request, reply) => {
    const input = workspaceDiscoveryImportSchema.parse(request.body);

    if (input.defaultProviderId !== null && input.defaultProviderId !== undefined) {
      if (!providerRepository.list().some((item) => item.id === input.defaultProviderId)) {
        return sendConflict(reply, `Provider not found for workspace import: ${input.defaultProviderId}`);
      }
    }
    if (input.defaultPromptTemplateId !== null && input.defaultPromptTemplateId !== undefined) {
      if (!promptTemplateRepository.exists(input.defaultPromptTemplateId)) {
        return sendConflict(reply, `Prompt template not found for workspace import: ${input.defaultPromptTemplateId}`);
      }
    }
    if (input.defaultSkillId !== null && input.defaultSkillId !== undefined) {
      if (!skillRepository.list().some((item) => item.id === input.defaultSkillId)) {
        return sendConflict(reply, `Skill not found for workspace import: ${input.defaultSkillId}`);
      }
    }

    const result = workspaceDiscoveryService.importCandidateWithSessionLinks(input);
    const snapshot = snapshotService.create(`workspace-import:${result.item.id}`);
    return {
      item: result.item,
      linkedSessionIds: result.linkedSessionIds,
      snapshotVersion: snapshot.version
    };
  });

  app.post("/api/v1/workspace-discovery/import-batch", async (request) => {
    const input = workspaceDiscoveryBatchImportSchema.parse(request.body);
    const result = workspaceDiscoveryService.importCandidatesWithSessionLinks(input);
    const snapshot = snapshotService.create(`workspace-import-batch:${result.importedCount}`);
    return {
      ...result,
      snapshotVersion: snapshot.version
    };
  });

  app.get("/api/v1/workspaces/context", async () => ({
    items: workspaceContextService.listWorkspaceContexts()
  }));

  app.get("/api/v1/workspaces/:id/context", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { item: workspaceContextService.resolveWorkspaceContext(id) };
    } catch (error) {
      return sendNotFound(reply, error instanceof Error ? error.message : `Workspace not found: ${id}`);
    }
  });

  app.post("/api/v1/workspaces", async (request, reply) => {
    const input = workspaceUpsertSchema.parse(request.body);

    if (input.defaultProviderId !== null && !providerRepository.list().some((item) => item.id === input.defaultProviderId)) {
      return sendConflict(reply, `Provider not found for workspace: ${input.defaultProviderId}`);
    }
    if (
      input.defaultPromptTemplateId !== null &&
      !promptTemplateRepository.exists(input.defaultPromptTemplateId)
    ) {
      return sendConflict(reply, `Prompt template not found for workspace: ${input.defaultPromptTemplateId}`);
    }
    if (
      input.defaultSkillId !== null &&
      !skillRepository.list().some((item) => item.id === input.defaultSkillId)
    ) {
      return sendConflict(reply, `Skill not found for workspace: ${input.defaultSkillId}`);
    }

    const item = workspaceRepository.upsert(input);
    const snapshot = snapshotService.create(`workspace:${input.id}`);
    return { item, snapshotVersion: snapshot.version };
  });
  app.post("/api/v1/workspaces/preview", async (request) => ({
    item: configGovernanceService.previewWorkspaceUpsert(workspaceUpsertSchema.parse(request.body))
  }));

  app.delete("/api/v1/workspaces/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sessionCount = sessionRecordRepository.countByWorkspaceId(id);
    if (sessionCount > 0) {
      return sendConflict(reply, `Workspace is still referenced by ${sessionCount} session(s): ${id}`);
    }

    const deleted = workspaceRepository.delete(id);
    if (!deleted) {
      return sendNotFound(reply, `Workspace not found: ${id}`);
    }

    const snapshot = snapshotService.create(`workspace-delete:${id}`);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/workspaces/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("workspace", id) };
  });

  app.get("/api/v1/sessions", async () => ({
    items: sessionRecordRepository.list()
  }));

  app.get("/api/v1/sessions/governance", async () => sessionGovernanceService.getStatus());

  app.get("/api/v1/sessions/context", async () => ({
    items: workspaceContextService.listSessionContexts()
  }));

  app.get("/api/v1/runtime-contexts", async () => runtimeContextObservabilityService.getOverview());
  app.get("/api/v1/runtime-contexts/workspaces/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { item: runtimeContextObservabilityService.getWorkspaceDetail(id) };
    } catch (error) {
      return sendNotFound(reply, error instanceof Error ? error.message : `Workspace runtime detail not found: ${id}`);
    }
  });
  app.get("/api/v1/runtime-contexts/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { item: runtimeContextObservabilityService.getSessionDetail(id) };
    } catch (error) {
      return sendNotFound(reply, error instanceof Error ? error.message : `Session runtime detail not found: ${id}`);
    }
  });

  app.get("/api/v1/sessions/:id/context", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return { item: workspaceContextService.resolveSessionContext(id) };
    } catch (error) {
      return sendNotFound(reply, error instanceof Error ? error.message : `Session not found: ${id}`);
    }
  });

  app.get("/api/v1/active-context", async () => activeContextService.getState());

  app.get("/api/v1/active-context/effective/:appCode", async (request, reply) => {
    const { appCode } = request.params as { appCode: Parameters<typeof activeContextPolicyService.resolveForApp>[0] };
    const query = request.query as {
      workspaceId?: string;
      sessionId?: string;
      cwd?: string;
    };

    try {
      return activeContextPolicyService.resolveForRequest(appCode, {
        workspaceId: query.workspaceId ?? null,
        sessionId: query.sessionId ?? null,
        cwd: query.cwd ?? null
      });
    } catch (error) {
      return sendConflict(
        reply,
        error instanceof Error ? error.message : "Active context resolution failed"
      );
    }
  });

  app.get("/api/v1/routing/context-explanations", async () => ({
    items: contextRoutingExplanationService.list()
  }));

  app.post("/api/v1/active-context/workspace", async (request, reply) => {
    const body = request.body as { workspaceId?: string | null } | undefined;

    try {
      return activeContextService.activateWorkspace(body?.workspaceId ?? null);
    } catch (error) {
      return sendNotFound(
        reply,
        error instanceof Error ? error.message : "Workspace activation failed"
      );
    }
  });

  app.post("/api/v1/active-context/session", async (request, reply) => {
    const body = request.body as { sessionId?: string | null } | undefined;

    try {
      return activeContextService.activateSession(body?.sessionId ?? null);
    } catch (error) {
      return sendNotFound(
        reply,
        error instanceof Error ? error.message : "Session activation failed"
      );
    }
  });

  app.post("/api/v1/sessions", async (request, reply) => {
    const input = sessionRecordUpsertSchema.parse(request.body);

    if (
      input.workspaceId !== null &&
      !workspaceRepository.list().some((item) => item.id === input.workspaceId)
    ) {
      return sendConflict(reply, `Workspace not found for session: ${input.workspaceId}`);
    }
    if (input.providerId !== null && !providerRepository.list().some((item) => item.id === input.providerId)) {
      return sendConflict(reply, `Provider not found for session: ${input.providerId}`);
    }
    if (
      input.promptTemplateId !== null &&
      !promptTemplateRepository.exists(input.promptTemplateId)
    ) {
      return sendConflict(reply, `Prompt template not found for session: ${input.promptTemplateId}`);
    }
    if (input.skillId !== null && !skillRepository.list().some((item) => item.id === input.skillId)) {
      return sendConflict(reply, `Skill not found for session: ${input.skillId}`);
    }

    const item = sessionRecordRepository.upsert(input);
    const snapshot = snapshotService.create(`session:${input.id}`);
    return { item, snapshotVersion: snapshot.version };
  });
  app.post("/api/v1/sessions/ensure", async (request, reply) => {
    const input = sessionEnsureInputSchema.parse(request.body);
    const ensureInput =
      input.title === undefined
        ? {
            appCode: input.appCode,
            cwd: input.cwd
          }
        : {
            appCode: input.appCode,
            cwd: input.cwd,
            title: input.title
          };

    try {
      const result = sessionLifecycleService.ensureFromManual(ensureInput);
      const snapshot = snapshotService.create(`session-ensure:${result.session.id}`);
      if (input.activate) {
        activeContextService.activateSession(result.session.id);
      }
      return {
        ...result,
        activated: input.activate,
        snapshotVersion: snapshot.version
      };
    } catch (error) {
      return sendConflict(reply, error instanceof Error ? error.message : "Session ensure failed");
    }
  });
  app.post("/api/v1/sessions/preview", async (request) => ({
    item: configGovernanceService.previewSessionUpsert(sessionRecordUpsertSchema.parse(request.body))
  }));

  app.post("/api/v1/sessions/archive-stale", async (request) => {
    const body = request.body as { limit?: number } | undefined;
    const result = sessionGovernanceService.archiveStaleSessions(
      new Date(),
      typeof body?.limit === "number" ? body.limit : undefined
    );
    const snapshot = snapshotService.create(`session-archive-stale:${result.archivedSessionIds.length}`);
    return { ...result, snapshotVersion: snapshot.version };
  });

  app.post("/api/v1/sessions/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = sessionGovernanceService.archiveSession(id);
    if (result.archivedSessionIds.length === 0 && result.alreadyArchivedSessionIds.length === 0) {
      return sendNotFound(reply, `Session not found: ${id}`);
    }

    const snapshot = snapshotService.create(`session-archive:${id}`);
    return { ...result, snapshotVersion: snapshot.version };
  });

  app.delete("/api/v1/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = sessionRecordRepository.delete(id);
    if (!deleted) {
      return sendNotFound(reply, `Session not found: ${id}`);
    }

    const snapshot = snapshotService.create(`session-delete:${id}`);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/sessions/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("session", id) };
  });

  app.post("/api/v1/providers", async (request) => {
    const input = providerUpsertSchema.parse(request.body);
    const item = providerRepository.upsert(input);
    const snapshot = snapshotService.create(`provider:${input.id}`);
    proxyRuntimeService.reload(snapshot.version);

    return { item, snapshotVersion: snapshot.version };
  });

  app.post("/api/v1/providers/preview", async (request) => ({
    item: routingGovernanceService.previewProviderUpsert(providerUpsertSchema.parse(request.body))
  }));

  app.delete("/api/v1/providers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const bindingCount = bindingRepository.countByProviderId(id);
    const failoverReferenceCount = failoverChainRepository.countByProviderId(id);

    if (bindingCount > 0) {
      return sendConflict(reply, `Provider is still referenced by ${bindingCount} binding(s): ${id}`);
    }

    if (failoverReferenceCount > 0) {
      return sendConflict(reply, `Provider is still referenced by ${failoverReferenceCount} failover chain(s): ${id}`);
    }

    const deleted = providerRepository.delete(id);
    if (!deleted) {
      return sendNotFound(reply, `Provider not found: ${id}`);
    }

    const snapshot = snapshotService.create(`provider-delete:${id}`);
    proxyRuntimeService.reload(snapshot.version);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/providers/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("provider", id) };
  });

  app.get("/api/v1/app-bindings", async () => ({
    items: bindingRepository.list()
  }));

  app.post("/api/v1/app-bindings/preview", async (request) => ({
    item: routingGovernanceService.previewBindingUpsert(appBindingUpsertSchema.parse(request.body))
  }));

  app.get("/api/v1/app-quotas", async () => ({
    items: appQuotaRepository.list()
  }));

  app.get("/api/v1/app-quotas/statuses", async () => ({
    items: runtime.appQuotaService.listStatuses()
  }));

  app.post("/api/v1/app-quotas", async (request) => {
    const input = appQuotaUpsertSchema.parse(request.body);
    const item = appQuotaRepository.upsert(input);
    const snapshot = snapshotService.create(`app-quota:${input.id}`);
    return { item, snapshotVersion: snapshot.version };
  });
  app.post("/api/v1/app-quotas/preview", async (request) => ({
    item: configGovernanceService.previewAppQuotaUpsert(appQuotaUpsertSchema.parse(request.body))
  }));

  app.delete("/api/v1/app-quotas/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = appQuotaRepository.delete(id);

    if (!deleted) {
      return sendNotFound(reply, `App quota not found: ${id}`);
    }

    const snapshot = snapshotService.create(`app-quota-delete:${id}`);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/app-quotas/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("app-quota", id) };
  });

  app.get("/api/v1/failover-chains", async () => ({
    items: failoverChainRepository.list()
  }));

  app.get("/api/v1/mcp/servers", async () => ({
    items: mcpServerRepository.list()
  }));

  app.post("/api/v1/mcp/servers/preview", async (request) => ({
    item: mcpService.previewServerUpsert(mcpServerUpsertSchema.parse(request.body))
  }));

  app.get("/api/v1/mcp/servers/:id/usage", async (request) => {
    const { id } = request.params as { id: string };
    return {
      item: mcpService.getServerUsage(id)
    };
  });

  app.post("/api/v1/mcp/servers", async (request) => {
    const input = mcpServerUpsertSchema.parse(request.body);
    const item = mcpServerRepository.upsert(input);
    mcpEventRepository.append({
      appCode: null,
      action: "server-upsert",
      targetType: "server",
      targetId: item.id,
      message: `Saved MCP server ${item.id}`
    });
    const snapshot = snapshotService.create(`mcp-server:${input.id}`);
    return { item, snapshotVersion: snapshot.version };
  });

  app.delete("/api/v1/mcp/servers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const bindingCount = appMcpBindingRepository.countByServerId(id);

    if (bindingCount > 0) {
      return sendConflict(reply, `MCP server is still referenced by ${bindingCount} app binding(s): ${id}`);
    }

    const deleted = mcpServerRepository.delete(id);
    if (!deleted) {
      return sendNotFound(reply, `MCP server not found: ${id}`);
    }

    mcpEventRepository.append({
      appCode: null,
      action: "server-delete",
      targetType: "server",
      targetId: id,
      message: `Deleted MCP server ${id}`
    });
    const snapshot = snapshotService.create(`mcp-server-delete:${id}`);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/mcp/servers/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("mcp-server", id) };
  });

  app.get("/api/v1/mcp/app-bindings", async () => ({
    items: appMcpBindingRepository.list()
  }));

  app.post("/api/v1/mcp/app-bindings/preview", async (request) => ({
    item: mcpService.previewBindingUpsert(appMcpBindingUpsertSchema.parse(request.body))
  }));

  app.get("/api/v1/mcp/runtime", async () => ({
    items: mcpService.listRuntimeViews()
  }));

  app.get("/api/v1/mcp/runtime/:appCode", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof mcpService.getRuntimeView>[0] };
    return {
      item: mcpService.getRuntimeView(appCode)
    };
  });

  app.get("/api/v1/mcp/verification-history/:appCode", async (request) => {
    const { appCode } = request.params as {
      appCode: Parameters<typeof mcpVerificationHistoryService.list>[0];
    };
    return mcpVerificationHistoryService.list(
      appCode,
      mcpVerificationHistoryQuerySchema.parse(request.query ?? {})
    );
  });

  app.get("/api/v1/mcp/governance/:appCode/preview", async (request) => {
    const { appCode } = request.params as {
      appCode: Parameters<typeof mcpService.previewGovernanceRepair>[0];
    };
    return {
      item: mcpService.previewGovernanceRepair(appCode)
    };
  });

  app.post("/api/v1/mcp/governance/:appCode/repair", async (request) => {
    const { appCode } = request.params as {
      appCode: Parameters<typeof mcpService.applyGovernanceRepair>[0];
    };
    return {
      item: mcpService.applyGovernanceRepair(appCode)
    };
  });

  app.get("/api/v1/mcp/governance/preview-all", async () => ({
    item: mcpService.previewGovernanceRepairAll()
  }));

  app.post("/api/v1/mcp/governance/repair-all", async () => ({
    item: mcpService.applyGovernanceRepairAll()
  }));

  app.post("/api/v1/mcp/app-bindings", async (request, reply) => {
    const input = appMcpBindingUpsertSchema.parse(request.body);

    if (!mcpServerRepository.exists(input.serverId)) {
      return sendConflict(reply, `MCP server not found for app binding: ${input.serverId}`);
    }

    const item = appMcpBindingRepository.upsert(input);
    mcpEventRepository.append({
      appCode: item.appCode,
      action: "binding-upsert",
      targetType: "binding",
      targetId: item.id,
      message: `Saved MCP binding ${item.id} for ${item.appCode}`
    });
    const snapshot = snapshotService.create(`mcp-app-binding:${input.id}`);
    return { item, snapshotVersion: snapshot.version };
  });

  app.delete("/api/v1/mcp/app-bindings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = appMcpBindingRepository.list().find((item) => item.id === id) ?? null;
    const deleted = appMcpBindingRepository.delete(id);
    if (!deleted) {
      return sendNotFound(reply, `MCP app binding not found: ${id}`);
    }

    mcpEventRepository.append({
      appCode: existing?.appCode ?? null,
      action: "binding-delete",
      targetType: "binding",
      targetId: id,
      message: `Deleted MCP binding ${id}`
    });
    const snapshot = snapshotService.create(`mcp-app-binding-delete:${id}`);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/mcp/app-bindings/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("mcp-app-binding", id) };
  });

  app.get("/api/v1/mcp/host-sync/capabilities", async () => ({
    items: mcpHostSyncService.listCapabilities()
  }));

  app.get("/api/v1/mcp/host-sync/states", async () => ({
    items: mcpHostSyncService.listSyncStates()
  }));

  app.get("/api/v1/mcp/host-sync/preview-all", async () => ({
    item: mcpHostSyncService.previewApplyAll(
      appMcpBindingRepository.list(),
      mcpServerRepository.list()
    )
  }));

  app.post("/api/v1/mcp/host-sync/apply-all", async () => ({
    item: (() => {
      const item = mcpHostSyncService.applyAll(
        appMcpBindingRepository.list(),
        mcpServerRepository.list()
      );
      invalidateDashboardBootstrap();
      return item;
    })()
  }));

  app.post("/api/v1/mcp/host-sync/rollback-all", async () => ({
    item: (() => {
      const item = mcpHostSyncService.rollbackAll();
      invalidateDashboardBootstrap();
      return item;
    })()
  }));

  app.get("/api/v1/mcp/host-sync/:appCode/preview-apply", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof mcpHostSyncService.previewApply>[0] };
    return {
      item: mcpHostSyncService.previewApply(
        appCode,
        appMcpBindingRepository.list(),
        mcpServerRepository.list()
      )
    };
  });

  app.post("/api/v1/mcp/host-sync/:appCode/apply", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof mcpHostSyncService.apply>[0] };
    const item = mcpHostSyncService.apply(
      appCode,
      appMcpBindingRepository.list(),
      mcpServerRepository.list()
    );
    invalidateDashboardBootstrap();
    return { item };
  });

  app.post("/api/v1/mcp/host-sync/:appCode/rollback", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof mcpHostSyncService.rollback>[0] };
    const item = mcpHostSyncService.rollback(appCode);
    invalidateDashboardBootstrap();
    return { item };
  });

  app.get("/api/v1/prompt-host-sync/capabilities", async () => ({
    items: promptHostSyncService.listCapabilities()
  }));

  app.get("/api/v1/prompt-host-sync/states", async () => ({
    items: promptHostSyncService.listSyncStates()
  }));

  app.get("/api/v1/prompt-host-sync/preview-all", async () => ({
    item: promptHostSyncService.previewApplyAll()
  }));

  app.post("/api/v1/prompt-host-sync/apply-all", async () => ({
    item: promptHostSyncService.applyAll()
  }));

  app.get("/api/v1/prompt-host-sync/:appCode/preview-apply", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof promptHostSyncService.previewApply>[0] };
    return {
      item: promptHostSyncService.previewApply(appCode)
    };
  });

  app.get("/api/v1/prompt-host-sync/:appCode/preview-import", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof promptHostSyncService.previewImport>[0] };
    return {
      item: promptHostSyncService.previewImport(appCode)
    };
  });

  app.post("/api/v1/prompt-host-sync/:appCode/import", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof promptHostSyncService.importFromHost>[0] };
    const item = promptHostSyncService.importFromHost(appCode);
    const snapshotVersion =
      item.status === "created"
        ? snapshotService.create(`prompt-host-import:${item.promptTemplateId}`).version
        : null;
    return {
      item,
      snapshotVersion
    };
  });

  app.post("/api/v1/prompt-host-sync/:appCode/apply", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof promptHostSyncService.apply>[0] };
    return {
      item: promptHostSyncService.apply(appCode)
    };
  });

  app.post("/api/v1/prompt-host-sync/:appCode/rollback", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof promptHostSyncService.rollback>[0] };
    return {
      item: promptHostSyncService.rollback(appCode)
    };
  });

  app.post("/api/v1/mcp/import/:appCode", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof mcpService.importFromHost>[0] };
    const item = mcpService.importFromHost(appCode, mcpImportOptionsSchema.parse(request.body ?? {}));
    const snapshot = snapshotService.create(`mcp-import:${appCode}`);
    return { item, snapshotVersion: snapshot.version };
  });

  app.get("/api/v1/mcp/import/:appCode/preview", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof mcpService.previewImportFromHost>[0] };
    return {
      item: mcpService.previewImportFromHost(
        appCode,
        mcpImportOptionsSchema.parse(request.query ?? {})
      )
    };
  });

  app.post("/api/v1/app-bindings", async (request, reply) => {
    const input = appBindingUpsertSchema.parse(request.body);

    if (!providerRepository.exists(input.providerId)) {
      return sendConflict(reply, `Provider not found for binding: ${input.providerId}`);
    }
    if (
      (input.promptTemplateId ?? null) !== null &&
      !promptTemplateRepository.exists(input.promptTemplateId ?? "")
    ) {
      return sendConflict(reply, `Prompt template not found for binding: ${input.promptTemplateId}`);
    }
    if (
      (input.skillId ?? null) !== null &&
      !skillRepository.list().some((item) => item.id === input.skillId)
    ) {
      return sendConflict(reply, `Skill not found for binding: ${input.skillId}`);
    }

    const item = bindingRepository.upsert(input);
    const snapshot = snapshotService.create(`binding:${input.id}`);
    proxyRuntimeService.reload(snapshot.version);

    return { item, snapshotVersion: snapshot.version };
  });

  app.delete("/api/v1/app-bindings/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = bindingRepository.delete(id);

    if (!deleted) {
      return sendNotFound(reply, `Binding not found: ${id}`);
    }

    const snapshot = snapshotService.create(`binding-delete:${id}`);
    proxyRuntimeService.reload(snapshot.version);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/app-bindings/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("binding", id) };
  });

  app.post("/api/v1/failover-chains", async (request, reply) => {
    const input = failoverChainUpsertSchema.parse(request.body);
    const uniqueProviderIds = Array.from(new Set(input.providerIds));

    if (uniqueProviderIds.length === 0) {
      return sendConflict(reply, "Failover chain requires at least one provider");
    }

    for (const providerId of uniqueProviderIds) {
      if (!providerRepository.exists(providerId)) {
        return sendConflict(reply, `Provider not found for failover chain: ${providerId}`);
      }
    }

    const item = failoverChainRepository.upsert({
      ...input,
      providerIds: uniqueProviderIds
    });
    const snapshot = snapshotService.create(`failover-chain:${input.id}`);
    proxyRuntimeService.reload(snapshot.version);

    return { item, snapshotVersion: snapshot.version };
  });

  app.post("/api/v1/failover-chains/preview", async (request) => ({
    item: routingGovernanceService.previewFailoverChainUpsert(
      failoverChainUpsertSchema.parse(request.body)
    )
  }));

  app.delete("/api/v1/failover-chains/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = failoverChainRepository.delete(id);

    if (!deleted) {
      return sendNotFound(reply, `Failover chain not found: ${id}`);
    }

    const snapshot = snapshotService.create(`failover-chain-delete:${id}`);
    proxyRuntimeService.reload(snapshot.version);
    return { ok: true, snapshotVersion: snapshot.version };
  });
  app.get("/api/v1/failover-chains/:id/delete-preview", async (request) => {
    const { id } = request.params as { id: string };
    return { item: configGovernanceService.previewDelete("failover-chain", id) };
  });

  app.get("/api/v1/proxy-policy", async () => proxyService.getStatus());
  app.post("/api/v1/proxy-policy/preview", async (request) => ({
    item: configGovernanceService.previewProxyPolicyUpdate(proxyPolicySchema.parse(request.body))
  }));

  app.put("/api/v1/proxy-policy", async (request) => {
    const policy = proxyPolicySchema.parse(request.body);
    const status = proxyService.update(policy);
    const snapshot = snapshotService.create("proxy-policy");
    proxyRuntimeService.reload(snapshot.version);

    return { ...status, snapshotVersion: snapshot.version };
  });
  app.post("/api/v1/import-export/import/preview", async (request) => ({
    item: configGovernanceService.previewImportPackage(request.body)
  }));

  app.get("/api/v1/import-export/export", async (request) => {
    const query = request.query as { includeSecrets?: string | boolean | number } | undefined;
    const includeSecrets =
      query?.includeSecrets === true ||
      query?.includeSecrets === "true" ||
      query?.includeSecrets === "1" ||
      query?.includeSecrets === 1;

    return importExportService.exportCurrentConfig(includeSecrets);
  });

  app.post("/api/v1/import-export/import", async (request) => {
    const result = importExportService.importPackage(request.body, "import-package");
    proxyRuntimeService.reload(result.snapshot?.version ?? snapshotService.latest()?.version ?? null);
    return result;
  });

  app.get("/api/v1/host-discovery", async () => ({
    items: hostDiscoveryService.scan()
  }));
  app.post("/api/v1/onboarding/quick-start/preview", async (request) => ({
    item: quickOnboardingService.preview(quickOnboardingPreviewInputSchema.parse(request.body))
  }));

  app.post("/api/v1/onboarding/quick-start/apply", async (request, reply) => {
    try {
      const item = quickOnboardingService.apply(
        quickOnboardingApplyInputSchema.parse(request.body)
      );
      invalidateDashboardBootstrap();
      return { item };
    } catch (error) {
      return sendConflict(
        reply,
        error instanceof Error ? error.message : "Quick onboarding apply failed"
      );
    }
  });
  app.post("/api/v1/onboarding/quick-context/preview", async (request) => ({
    item: quickContextAssetService.preview(
      quickContextAssetInputSchema.parse(request.body)
    )
  }));

  app.post("/api/v1/onboarding/quick-context/apply", async (request, reply) => {
    try {
      const item = quickContextAssetService.apply(
        quickContextAssetInputSchema.parse(request.body)
      );
      invalidateDashboardBootstrap();
      return { item };
    } catch (error) {
      return sendConflict(
        reply,
        error instanceof Error ? error.message : "Quick context asset apply failed"
      );
    }
  });
  app.get("/api/v1/host-discovery/:appCode/preview-apply", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof hostDiscoveryService.previewApplyManagedConfig>[0] };
    return {
      item: hostDiscoveryService.previewApplyManagedConfig(appCode)
    };
  });

  app.get("/api/v1/host-discovery/capabilities", async () => ({
    items: hostDiscoveryService.listCapabilities()
  }));

  app.get("/api/v1/host-discovery/events", async (request) => {
    const query = request.query as { limit?: string | number };
    const parsedLimit = Number.parseInt(String(query.limit ?? "20"), 10);
    const limit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 200);

    return {
      items: hostDiscoveryService.listRecentEvents(limit)
    };
  });

  app.get("/api/v1/audit/events", async (request) =>
    auditEventService.list(auditEventQuerySchema.parse(request.query ?? {}))
  );
  app.get("/api/v1/usage/records", async (request) =>
    proxyRuntimeService.listUsageRecords(
      usageRecordQuerySchema.parse(request.query ?? {})
    )
  );
  app.get("/api/v1/usage/summary", async (request) => {
    const query = usageRecordQuerySchema.parse(request.query ?? {});
    return proxyRuntimeService.summarizeUsage({
      appCode: query.appCode,
      providerId: query.providerId,
      model: query.model,
      startAt: query.startAt,
      endAt: query.endAt
    });
  });
  app.get("/api/v1/usage/timeseries", async (request) =>
    proxyRuntimeService.summarizeUsageTimeseries(
      usageTimeseriesQuerySchema.parse(request.query ?? {})
    )
  );

  app.post("/api/v1/host-discovery/:appCode/apply", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof hostDiscoveryService.applyManagedConfig>[0] };
    const result = hostDiscoveryService.applyManagedConfig(appCode);
    invalidateDashboardBootstrap();
    return { item: result };
  });

  app.post("/api/v1/host-discovery/:appCode/rollback", async (request) => {
    const { appCode } = request.params as { appCode: Parameters<typeof hostDiscoveryService.rollbackManagedConfig>[0] };
    const result = hostDiscoveryService.rollbackManagedConfig(appCode);
    invalidateDashboardBootstrap();
    return { item: result };
  });

  app.post("/api/v1/host-discovery/rollback-foreground", async () => {
    const result = hostDiscoveryService.rollbackForegroundSessionConfigs();
    invalidateDashboardBootstrap();
    return { item: result };
  });

  app.get("/api/v1/system/metadata", async () => systemService.getMetadata());
  app.get("/api/v1/system/runtime", async () => systemService.getRuntime());
  app.get("/api/v1/system/service-doctor", async () => systemService.getServiceDoctor());
  app.post("/api/v1/system/service/sync-env", async () => {
    const result = await systemService.syncServiceEnv();
    invalidateDashboardBootstrap();
    return result;
  });
  app.post("/api/v1/system/service/install", async () => {
    const result = await systemService.installUserService();
    invalidateDashboardBootstrap();
    return result;
  });
  app.get("/api/v1/system/control-auth", async () => systemService.getControlAuthRuntime());
  app.post("/api/v1/system/control-auth/rotate", async (_request, reply) => {
    try {
      const result = systemService.rotateControlToken();
      return {
        source: result.source,
        token: result.value
      };
    } catch (error) {
      return sendConflict(reply, error instanceof Error ? error.message : "Control token rotation failed");
    }
  });
  app.get("/api/v1/proxy-runtime", async () => proxyRuntimeService.getRuntimeView());
  app.post("/api/v1/provider-health/:providerId/probe", async (request) => {
    const { providerId } = request.params as { providerId: string };
    const result = await runtime.providerHealthProbeService.probeProvider(providerId);
    return { item: result };
  });
  app.post("/api/v1/provider-health/:providerId/isolate", async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const body = request.body as { reason?: string; cooldownSeconds?: number } | undefined;

    try {
      const result = proxyRuntimeService.isolateProvider(
        providerId,
        body?.reason?.trim() || "Provider manually isolated by operator",
        typeof body?.cooldownSeconds === "number" ? body.cooldownSeconds : undefined
      );
      proxyRuntimeService.appendProviderHealthEvent({
        providerId,
        trigger: "manual",
        status: "unhealthy",
        statusCode: null,
        probeUrl: proxyRuntimeService.getProbeTarget(providerId)?.upstreamBaseUrl ?? "manual://isolate",
        message: result.message
      });
      return { item: result };
    } catch (error) {
      return sendNotFound(reply, error instanceof Error ? error.message : "Provider isolate failed");
    }
  });
  app.post("/api/v1/provider-health/:providerId/reset", async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const body = request.body as { reason?: string } | undefined;

    try {
      const result = proxyRuntimeService.resetProviderCircuit(
        providerId,
        body?.reason?.trim() || "Provider circuit manually reset by operator"
      );
      proxyRuntimeService.appendProviderHealthEvent({
        providerId,
        trigger: "manual",
        status: "healthy",
        statusCode: null,
        probeUrl: proxyRuntimeService.getProbeTarget(providerId)?.upstreamBaseUrl ?? "manual://reset",
        message: result.message
      });
      return { item: result };
    } catch (error) {
      return sendNotFound(reply, error instanceof Error ? error.message : "Provider reset failed");
    }
  });
  app.post("/api/v1/provider-health/:providerId/recover", async (request) => {
    const { providerId } = request.params as { providerId: string };
    const result = await runtime.providerHealthProbeService.probeProvider(providerId);
    return {
      item: {
        providerId,
        action: "probe",
        circuitState: result.healthy ? "closed" : "open",
        cooldownUntil: proxyRuntimeService
          .getRuntimeView()
          .providerHealthStates.find((item) => item.providerId === providerId)?.cooldownUntil ?? null,
        message: result.message
      }
    };
  });
  app.get("/api/v1/proxy-request-logs", async (request) =>
    proxyRuntimeService.listRequestLogs(
      proxyRequestLogQuerySchema.parse(request.query ?? {})
    )
  );
  app.get("/api/v1/snapshots/latest", async () => snapshotService.latest());
  app.get("/api/v1/snapshots/recent", async (request) => {
    const query = request.query as { limit?: string | number };
    const parsedLimit = Number.parseInt(String(query.limit ?? "10"), 10);
    return {
      items: snapshotService.listRecent(Number.isNaN(parsedLimit) ? 10 : parsedLimit)
    };
  });
  app.get("/api/v1/snapshots/latest/diff", async (_request, reply) => {
    const item = snapshotService.diffLatestAgainstPrevious();
    if (item === null) {
      return sendNotFound(reply, "No snapshot diff available");
    }
    return { item };
  });
  app.get("/api/v1/snapshots/:version/restore-preview", async (request, reply) => {
    const { version } = request.params as { version: string };
    const parsedVersion = Number.parseInt(version, 10);
    const latest = snapshotService.latest();
    const target = snapshotService.getByVersion(parsedVersion);
    if (target === null) {
      return sendNotFound(reply, `Snapshot not found: ${version}`);
    }
    const diff = latest === null || latest.version === target.version
      ? snapshotService.diffVersions(snapshotService.getPreviousVersion(target.version), target.version)
      : snapshotService.diffVersions(target.version, latest.version);
    return { item: configGovernanceService.previewRestore(target.version, latest?.version ?? null, diff) };
  });
  app.get("/api/v1/snapshots/:version", async (request, reply) => {
    const { version } = request.params as { version: string };
    const parsedVersion = Number.parseInt(version, 10);
    const item = snapshotService.getByVersion(parsedVersion);
    if (item === null) {
      return sendNotFound(reply, `Snapshot not found: ${version}`);
    }
    return { item };
  });
  app.get("/api/v1/snapshots/:version/diff", async (request, reply) => {
    const { version } = request.params as { version: string };
    const parsedVersion = Number.parseInt(version, 10);
    const item = snapshotService.diffVersionAgainstPrevious(parsedVersion);
    if (item === null) {
      return sendNotFound(reply, `Snapshot diff not found: ${version}`);
    }
    return { item };
  });
  app.post("/api/v1/snapshots/latest/restore", async (_request, reply) => {
    const request = _request as typeof _request & {
      body?: {
        version?: number;
      };
    };
    const requestedVersion = request.body?.version;
    const latestSnapshot = snapshotService.latest();

    if (latestSnapshot === null) {
      return sendNotFound(reply, "No snapshot available to restore");
    }

    const fallbackVersion = snapshotService.diffLatestAgainstPrevious()?.fromVersion ?? latestSnapshot.version;
    const targetVersion =
      typeof requestedVersion === "number" && Number.isInteger(requestedVersion) && requestedVersion > 0
        ? requestedVersion
        : fallbackVersion;
    const targetSnapshot = snapshotService.getByVersion(targetVersion);

    if (targetSnapshot === null) {
      return sendNotFound(reply, `Snapshot not found: ${targetVersion}`);
    }

    const restoredSnapshot = importExportService.importConfig(
      targetSnapshot.payload,
      `restore:${targetSnapshot.version}`
    );
    proxyRuntimeService.reload(restoredSnapshot.version);

    return {
      restoredFromVersion: targetSnapshot.version,
      snapshotVersion: restoredSnapshot.version
    };
  });
  app.post("/api/v1/snapshots/:version/restore", async (request, reply) => {
    const { version } = request.params as { version: string };
    const parsedVersion = Number.parseInt(version, 10);
    const targetSnapshot = snapshotService.getByVersion(parsedVersion);

    if (targetSnapshot === null) {
      return sendNotFound(reply, `Snapshot not found: ${version}`);
    }

    const restoredSnapshot = importExportService.importConfig(
      targetSnapshot.payload,
      `restore:${targetSnapshot.version}`
    );
    proxyRuntimeService.reload(restoredSnapshot.version);

    return {
      restoredFromVersion: targetSnapshot.version,
      snapshotVersion: restoredSnapshot.version
    };
  });
};
