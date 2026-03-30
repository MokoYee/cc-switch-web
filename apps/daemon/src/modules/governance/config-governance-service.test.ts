import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { AppMcpBindingRepository } from "../mcp/app-mcp-binding-repository.js";
import { McpServerRepository } from "../mcp/mcp-server-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";
import { ConfigGovernanceService } from "./config-governance-service.js";

test("previews asset and policy governance impacts", () => {
  const database = openDatabase(":memory:");
  const promptTemplateRepository = new PromptTemplateRepository(database);
  const skillRepository = new SkillRepository(database);
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRecordRepository = new SessionRecordRepository(database);
  const appQuotaRepository = new AppQuotaRepository(database);
  const bindingRepository = new BindingRepository(database);
  const providerRepository = new ProviderRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);
  const mcpServerRepository = new McpServerRepository(database);
  const appMcpBindingRepository = new AppMcpBindingRepository(database);

  providerRepository.upsert({
    id: "provider-a",
    name: "Provider A",
    providerType: "openai-compatible",
    baseUrl: "https://provider-a.example.com/v1",
    apiKey: "provider-a-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-a",
    mode: "managed"
  });
  promptTemplateRepository.upsert({
    id: "prompt-a",
    name: "Prompt A",
    appCode: "codex",
    locale: "zh-CN",
    content: "prompt",
    tags: [],
    enabled: true
  });
  skillRepository.upsert({
    id: "skill-a",
    name: "Skill A",
    appCode: "codex",
    promptTemplateId: "prompt-a",
    content: "skill",
    tags: [],
    enabled: true
  });
  workspaceRepository.upsert({
    id: "workspace-a",
    name: "Workspace A",
    rootPath: "/tmp/workspace-a",
    appCode: "codex",
    defaultProviderId: "provider-a",
    defaultPromptTemplateId: "prompt-a",
    defaultSkillId: "skill-a",
    tags: [],
    enabled: true
  });
  sessionRecordRepository.upsert({
    id: "session-a",
    workspaceId: "workspace-a",
    appCode: "codex",
    title: "Session A",
    cwd: "/tmp/workspace-a",
    providerId: "provider-a",
    promptTemplateId: "prompt-a",
    skillId: "skill-a",
    status: "active",
    startedAt: "2026-03-21T00:00:00.000Z"
  });

  const service = new ConfigGovernanceService(
    promptTemplateRepository,
    skillRepository,
    workspaceRepository,
    sessionRecordRepository,
    appQuotaRepository,
    bindingRepository,
    providerRepository,
    failoverChainRepository,
    mcpServerRepository,
    appMcpBindingRepository
  );

  const promptPreview = service.previewPromptTemplateUpsert({
    id: "prompt-a",
    name: "Prompt A",
    appCode: "codex",
    locale: "zh-CN",
    content: "changed",
    tags: [],
    enabled: false
  });
  assert.deepEqual(promptPreview.referencedBySkillIds, ["skill-a"]);
  assert.deepEqual(promptPreview.usedByWorkspaceIds, ["workspace-a"]);
  assert.deepEqual(promptPreview.usedBySessionIds, ["session-a"]);
  assert.equal(promptPreview.impact.affectedAppCodes[0], "codex");
  assert.equal(promptPreview.impact.riskLevel, "high");

  const skillPreview = service.previewSkillUpsert({
    id: "skill-a",
    name: "Skill A",
    appCode: "codex",
    promptTemplateId: "missing-prompt",
    content: "changed",
    tags: [],
    enabled: true
  });
  assert.equal(skillPreview.promptTemplateExists, false);
  assert.equal(skillPreview.impact.riskLevel, "high");

  const workspacePreview = service.previewWorkspaceUpsert({
    id: "workspace-a",
    name: "Workspace A",
    rootPath: "/tmp/workspace-a",
    appCode: "codex",
    defaultProviderId: "provider-a",
    defaultPromptTemplateId: "prompt-a",
    defaultSkillId: "skill-a",
    tags: [],
    enabled: false
  });
  assert.equal(workspacePreview.sessionCount, 1);
  assert.equal(workspacePreview.impact.riskLevel, "high");

  const sessionPreview = service.previewSessionUpsert({
    id: "session-a",
    workspaceId: "workspace-a",
    appCode: "codex",
    title: "Session A",
    cwd: "/tmp/workspace-a",
    providerId: "provider-a",
    promptTemplateId: "prompt-a",
    skillId: "skill-a",
    status: "active",
    startedAt: "2026-03-21T00:00:00.000Z"
  });
  assert.equal(sessionPreview.workspaceExists, true);
  assert.equal(sessionPreview.impact.affectedAppCodes[0], "codex");

  const quotaPreview = service.previewAppQuotaUpsert({
    id: "quota-codex",
    appCode: "codex",
    enabled: true,
    period: "day",
    maxRequests: null,
    maxTokens: null
  });
  assert.equal(quotaPreview.impact.riskLevel, "medium");

  const proxyPreview = service.previewProxyPolicyUpdate({
    listenHost: "0.0.0.0",
    listenPort: 8788,
    enabled: true,
    requestTimeoutMs: 60_000,
    failureThreshold: 3
  });
  assert.equal(proxyPreview.impact.requiresProxyReload, true);
  assert.equal(proxyPreview.impact.touchesRouting, true);
  assert.equal(proxyPreview.impact.riskLevel, "high");

  const deletePreview = service.previewDelete("workspace", "workspace-a");
  assert.equal(deletePreview.blockers[0], "Referenced by 1 session(s)");
  assert.equal(deletePreview.impact.riskLevel, "high");

  const existingProvider = providerRepository.list()[0];
  if (existingProvider === undefined) {
    throw new Error("expected seeded provider");
  }
  const importPreview = service.previewImportPackage({
    version: "0.1.0",
    exportedAt: "2026-03-21T00:00:00.000Z",
    providers: [
      {
        ...existingProvider,
        apiKey: ""
      },
      {
        id: "provider-import-only",
        name: "Provider Import Only",
        providerType: "openai-compatible",
        baseUrl: "https://provider-import-only.example.com/v1",
        apiKeyMasked: "",
        enabled: true,
        timeoutMs: 30_000,
        createdAt: "2026-03-21T00:00:00.000Z",
        updatedAt: "2026-03-21T00:00:00.000Z",
        apiKey: ""
      }
    ],
    promptTemplates: [],
    skills: [],
    workspaces: [],
    sessionRecords: [],
    bindings: [],
    appQuotas: [],
    proxyPolicy: {
      listenHost: "0.0.0.0",
      listenPort: 8788,
      enabled: true,
      requestTimeoutMs: 60000,
      failureThreshold: 3
    },
    failoverChains: [],
    mcpServers: [],
    appMcpBindings: [],
    snapshot: null
  });
  assert.match(
    importPreview.warnings.join(" "),
    /omits plaintext credentials for enabled providers: provider-a, provider-import-only/
  );
  assert.match(
    importPreview.warnings.join(" "),
    /will require API key re-entry after import: provider-import-only/
  );
  assert.equal(importPreview.impact.riskLevel, "high");

  const restorePreview = service.previewRestore(1, 2, {
    fromVersion: 1,
    toVersion: 2,
    summary: {
      totalAdded: 0,
      totalRemoved: 0,
      totalChanged: 1
    },
    providers: { added: [], removed: [], changed: [] },
    promptTemplates: { added: [], removed: [], changed: [] },
    skills: { added: [], removed: [], changed: [] },
    workspaces: { added: [], removed: [], changed: [] },
    sessionRecords: { added: [], removed: [], changed: [] },
    bindings: { added: [], removed: [], changed: ["binding-codex"] },
    appQuotas: { added: [], removed: [], changed: [] },
    failoverChains: { added: [], removed: [], changed: [] },
    mcpServers: { added: [], removed: [], changed: [] },
    appMcpBindings: { added: [], removed: [], changed: [] }
  });
  assert.equal(restorePreview.impact.requiresProxyReload, true);

  database.close();
});
