import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyRuntimeService } from "../proxy/proxy-runtime-service.js";
import { ActiveContextPolicyService } from "../workspaces/active-context-policy-service.js";
import { ActiveContextService } from "../workspaces/active-context-service.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceContextService } from "../workspaces/workspace-context-service.js";
import { WorkspaceDiscoveryService } from "../workspaces/workspace-discovery-service.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";
import { SettingsRepository } from "../settings/settings-repository.js";
import { ContextRoutingExplanationService } from "./context-routing-explanation-service.js";

test("explains active context precedence and resulting routing plan", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const settingsRepository = new SettingsRepository(database);

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-b",
    name: "Provider B",
    providerType: "openai-compatible",
    baseUrl: "https://b.example.com/v1",
    apiKey: "provider-b-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });
  failoverChainRepository.upsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-a", "provider-b"],
    cooldownSeconds: 30,
    maxAttempts: 2
  });
  workspaceRepository.upsert({
    id: "workspace-a",
    name: "Workspace A",
    rootPath: "/tmp/workspace-a",
    appCode: "codex",
    defaultProviderId: "provider-b",
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });
  sessionRepository.upsert({
    id: "session-a",
    workspaceId: "workspace-a",
    appCode: "codex",
    title: "Session A",
    cwd: "/tmp/workspace-a",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T00:00:00.000Z"
  });

  const workspaceContextService = new WorkspaceContextService(
    workspaceRepository,
    sessionRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository,
    bindingRepository
  );
  const activeContextService = new ActiveContextService(
    settingsRepository,
    workspaceRepository,
    sessionRepository,
    workspaceContextService
  );
  activeContextService.activateSession("session-a");

  const activeContextPolicyService = new ActiveContextPolicyService(
    activeContextService,
    workspaceContextService,
    new WorkspaceDiscoveryService(
      {
        runMode: "foreground",
        host: "127.0.0.1",
        port: 8787,
        allowedOrigins: [],
        allowAnyOrigin: false,
        healthProbeIntervalMs: 60_000,
        envControlToken: null,
        controlUiMountPath: "/ui",
        workspaceScanRoots: [],
        workspaceScanDepth: 3,
        sessionStaleMs: 86_400_000
      },
      workspaceRepository,
      sessionRepository
    ),
    sessionRepository,
    bindingRepository,
    providerRepository,
    promptTemplateRepository,
    skillRepository
  );
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

  const service = new ContextRoutingExplanationService(
    activeContextService,
    activeContextPolicyService,
    bindingRepository,
    failoverChainRepository,
    proxyRuntimeService
  );

  const explanation = service.getByApp("codex");
  assert.equal(explanation.effectiveSource, "active-session");
  assert.equal(explanation.effectiveProviderId, "provider-b");
  assert.equal(explanation.steps.find((item) => item.kind === "active-session-context")?.selected, true);
  assert.equal(explanation.steps.find((item) => item.kind === "workspace-default")?.selected, true);
  assert.equal(explanation.routingPlan?.candidates[0]?.providerId, "provider-b");
  assert.equal(explanation.routingPlan?.candidates[1]?.providerId, "provider-a");

  database.close();
});
