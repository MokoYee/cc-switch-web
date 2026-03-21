import type { FastifyInstance, FastifyReply } from "fastify";

import {
  appBindingUpsertSchema,
  failoverChainUpsertSchema,
  providerUpsertSchema,
  proxyPolicySchema
} from "@ai-cli-switch/shared";

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
    bindingRepository,
    failoverChainRepository,
    proxyService,
    proxyRuntimeService,
    importExportService,
    hostDiscoveryService,
    systemService,
    snapshotService
  } = runtime;

  app.get("/health", async () => ({
    status: "ok",
    service: "AI CLI Switch-daemon",
    time: new Date().toISOString()
  }));

  app.get("/api/v1/providers", async () => ({
    items: providerRepository.list()
  }));

  app.post("/api/v1/providers", async (request) => {
    const input = providerUpsertSchema.parse(request.body);
    const item = providerRepository.upsert(input);
    const snapshot = snapshotService.create(`provider:${input.id}`);
    proxyRuntimeService.reload(snapshot.version);

    return { item, snapshotVersion: snapshot.version };
  });

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

  app.get("/api/v1/app-bindings", async () => ({
    items: bindingRepository.list()
  }));

  app.get("/api/v1/failover-chains", async () => ({
    items: failoverChainRepository.list()
  }));

  app.post("/api/v1/app-bindings", async (request, reply) => {
    const input = appBindingUpsertSchema.parse(request.body);

    if (!providerRepository.exists(input.providerId)) {
      return sendConflict(reply, `Provider not found for binding: ${input.providerId}`);
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

  app.get("/api/v1/proxy-policy", async () => proxyService.getStatus());

  app.put("/api/v1/proxy-policy", async (request) => {
    const policy = proxyPolicySchema.parse(request.body);
    const status = proxyService.update(policy);
    const snapshot = snapshotService.create("proxy-policy");
    proxyRuntimeService.reload(snapshot.version);

    return { ...status, snapshotVersion: snapshot.version };
  });

  app.get("/api/v1/import-export/export", async () =>
    importExportService.exportCurrentConfig()
  );

  app.post("/api/v1/import-export/import", async (request) => {
    const result = importExportService.importPackage(request.body, "import-package");
    proxyRuntimeService.reload(result.snapshot?.version ?? snapshotService.latest()?.version ?? null);
    return result;
  });

  app.get("/api/v1/host-discovery", async () => ({
    items: hostDiscoveryService.scan()
  }));

  app.get("/api/v1/system/metadata", async () => systemService.getMetadata());
  app.get("/api/v1/system/runtime", async () => systemService.getRuntime());
  app.get("/api/v1/proxy-runtime", async () => proxyRuntimeService.getRuntimeView());
  app.get("/api/v1/proxy-request-logs", async () => ({
    items: proxyRuntimeService.listRecentRequestLogs()
  }));
  app.get("/api/v1/snapshots/latest", async () => snapshotService.latest());
  app.post("/api/v1/snapshots/latest/restore", async (_request, reply) => {
    const latestSnapshot = snapshotService.latest();

    if (latestSnapshot === null) {
      return sendNotFound(reply, "No snapshot available to restore");
    }

    const restoredSnapshot = importExportService.importConfig(
      latestSnapshot.payload,
      `restore:${latestSnapshot.version}`
    );
    proxyRuntimeService.reload(restoredSnapshot.version);

    return {
      restoredFromVersion: latestSnapshot.version,
      snapshotVersion: restoredSnapshot.version
    };
  });
};
