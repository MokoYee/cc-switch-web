import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyRuntimeService } from "../proxy/proxy-runtime-service.js";
import { RoutingGovernanceService } from "./routing-governance-service.js";

test("previews binding and failover routing impacts with execution plan", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-primary",
    name: "Primary",
    providerType: "openai-compatible",
    baseUrl: "https://primary.example.com/v1",
    apiKey: "primary-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-fallback",
    name: "Fallback",
    providerType: "openai-compatible",
    baseUrl: "https://fallback.example.com/v1",
    apiKey: "",
    enabled: false,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-primary",
    mode: "managed"
  });

  const proxyRuntimeService = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );
  proxyRuntimeService.reload(null);

  const service = new RoutingGovernanceService(
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyRuntimeService
  );

  const bindingPreview = service.previewBindingUpsert({
    id: "binding-codex-copy",
    appCode: "codex",
    providerId: "provider-primary",
    mode: "observe"
  });
  assert.equal(bindingPreview.executionPlan.candidates[0]?.providerId, "provider-primary");
  assert.equal(bindingPreview.executionPlan.candidates[0]?.decision, "selected");
  assert.equal(bindingPreview.executionPlan.candidates[0]?.decisionReason, "ready");
  assert.equal(bindingPreview.issueCodes.includes("duplicate-app-binding"), true);
  assert.equal(bindingPreview.impact.requiresProxyReload, true);
  assert.equal(bindingPreview.impact.touchesRouting, true);
  assert.equal(bindingPreview.impact.affectedAppCodes[0], "codex");

  const failoverPreview = service.previewFailoverChainUpsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-primary", "provider-primary", "provider-fallback"],
    cooldownSeconds: 30,
    maxAttempts: 3
  });
  assert.deepEqual(failoverPreview.normalizedProviderIds, ["provider-primary", "provider-fallback"]);
  assert.equal(failoverPreview.issueCodes.includes("failover-provider-duplicate"), true);
  assert.equal(failoverPreview.issueCodes.includes("provider-disabled"), true);
  assert.equal(failoverPreview.issueCodes.includes("credential-missing"), true);
  assert.equal(failoverPreview.executionPlan.candidates.length, 2);
  assert.deepEqual(
    failoverPreview.executionPlan.candidates.map((item) => ({
      providerId: item.providerId,
      decision: item.decision,
      decisionReason: item.decisionReason,
      willReceiveTraffic: item.willReceiveTraffic
    })),
    [
      {
        providerId: "provider-primary",
        decision: "selected",
        decisionReason: "ready",
        willReceiveTraffic: true
      },
      {
        providerId: "provider-fallback",
        decision: "excluded",
        decisionReason: "unexecutable-disabled",
        willReceiveTraffic: false
      }
    ]
  );
  assert.equal(failoverPreview.impact.requiresProxyReload, true);
  assert.equal(failoverPreview.impact.riskLevel, "high");

  database.close();
});

test("previewing an existing provider without re-entering api key reuses the stored credential, while a new provider still requires one", () => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-existing",
    name: "Existing Provider",
    providerType: "openai-compatible",
    baseUrl: "https://existing.example.com/v1",
    apiKey: "existing-secret",
    enabled: true,
    timeoutMs: 30_000
  });

  const proxyRuntimeService = new ProxyRuntimeService(
    database,
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    () => ({
      runtimeState: "running",
      policy: {
        listenHost: "127.0.0.1",
        listenPort: 8788,
        enabled: true,
        requestTimeoutMs: 60_000,
        failureThreshold: 3
      }
    })
  );
  proxyRuntimeService.reload(null);

  const service = new RoutingGovernanceService(
    providerRepository,
    bindingRepository,
    failoverChainRepository,
    proxyRuntimeService
  );

  const existingPreview = service.previewProviderUpsert({
    id: "provider-existing",
    name: "Existing Provider Updated",
    providerType: "openai-compatible",
    baseUrl: "https://existing-updated.example.com/v1",
    apiKey: "",
    enabled: true,
    timeoutMs: 45_000
  });
  assert.equal(existingPreview.exists, true);
  assert.equal(existingPreview.issueCodes.includes("credential-missing"), false);

  const newPreview = service.previewProviderUpsert({
    id: "provider-new",
    name: "New Provider",
    providerType: "openai-compatible",
    baseUrl: "https://new.example.com/v1",
    apiKey: "",
    enabled: true,
    timeoutMs: 30_000
  });
  assert.equal(newPreview.exists, false);
  assert.equal(newPreview.issueCodes.includes("credential-missing"), true);

  database.close();
});
