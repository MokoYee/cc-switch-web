import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { DaemonEnv } from "../../config/env.js";
import { openDatabase } from "../../db/database.js";
import { SessionRecordRepository } from "./session-record-repository.js";
import { SessionLifecycleService } from "./session-lifecycle-service.js";
import { WorkspaceDiscoveryService } from "./workspace-discovery-service.js";
import { WorkspaceRepository } from "./workspace-repository.js";

const createEnv = (): DaemonEnv => ({
  runMode: "foreground",
  host: "127.0.0.1",
  port: 8787,
  allowedOrigins: [],
  allowAnyOrigin: false,
  envControlToken: null,
  controlUiMountPath: "/ui",
  healthProbeIntervalMs: 15_000,
  workspaceScanRoots: [],
  workspaceScanDepth: 3,
  sessionStaleMs: 7 * 24 * 60 * 60 * 1000
});

test("creates a new active session from request cwd when workspace is matched", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const discoveryService = new WorkspaceDiscoveryService(
    createEnv(),
    workspaceRepository,
    sessionRepository
  );
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  workspaceRepository.upsert({
    id: "workspace-api",
    name: "API",
    rootPath: "/srv/projects/api",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });

  const created = lifecycleService.ensureFromRequest({
    appCode: "codex",
    cwd: "/srv/projects/api/packages/gateway",
    effectiveContext: {
      appCode: "codex",
      source: "request-auto-workspace",
      activeWorkspaceId: "workspace-api",
      activeSessionId: null,
      provider: {
        id: "provider-a",
        name: "Provider A",
        bindingMode: "managed",
        source: "app-binding",
        missing: false
      },
      promptTemplate: {
        id: "prompt-a",
        name: "Prompt A",
        locale: "zh-CN",
        source: "workspace-default",
        missing: false,
        content: "prompt",
        enabled: true
      },
      skill: {
        id: "skill-a",
        name: "Skill A",
        source: "workspace-default",
        missing: false,
        promptTemplateId: "prompt-a",
        content: "skill",
        enabled: true
      },
      systemInstruction: "prompt\n\nskill",
      warnings: []
    }
  });

  assert.ok(created);
  assert.equal(created?.workspaceId, "workspace-api");
  assert.equal(created?.providerId, "provider-a");
  assert.equal(created?.promptTemplateId, "prompt-a");
  assert.equal(created?.skillId, "skill-a");
  assert.equal(sessionRepository.list().length, 1);

  database.close();
});

test("touches existing session instead of creating duplicates", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const discoveryService = new WorkspaceDiscoveryService(
    createEnv(),
    workspaceRepository,
    sessionRepository
  );
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  const existing = sessionRepository.upsert({
    id: "session-existing",
    workspaceId: null,
    appCode: "codex",
    title: "old",
    cwd: "/srv/projects/api",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T10:00:00.000Z"
  });

  const touched = lifecycleService.ensureFromRequest({
    appCode: "codex",
    cwd: "/srv/projects/api/new",
    effectiveContext: {
      appCode: "codex",
      source: "request-session",
      activeWorkspaceId: null,
      activeSessionId: existing.id,
      provider: {
        id: "provider-b",
        name: "Provider B",
        bindingMode: "managed",
        source: "session-override",
        missing: false
      },
      promptTemplate: {
        id: null,
        name: null,
        locale: null,
        source: "none",
        missing: false,
        content: null,
        enabled: null
      },
      skill: {
        id: null,
        name: null,
        source: "none",
        missing: false,
        promptTemplateId: null,
        content: null,
        enabled: null
      },
      systemInstruction: null,
      warnings: []
    }
  });

  assert.equal(touched?.id, "session-existing");
  assert.equal(touched?.cwd, "/srv/projects/api/new");
  assert.equal(touched?.providerId, "provider-b");
  assert.equal(sessionRepository.list().length, 1);

  database.close();
});

test("creates workspace and session together when cwd points to a new project root", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const discoveryService = new WorkspaceDiscoveryService(
    {
      ...createEnv(),
      workspaceScanRoots: ["/tmp"],
      workspaceScanDepth: 5
    },
    workspaceRepository,
    sessionRepository
  );
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-session-auto-"));
  const projectRoot = join(tempRoot, "repo");
  const cwd = join(projectRoot, "apps", "api");
  mkdirSync(join(projectRoot, ".git"), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(projectRoot, "package.json"), "{\n  \"name\": \"repo\"\n}\n", "utf-8");

  const created = lifecycleService.ensureFromRequest({
    appCode: "codex",
    cwd,
    effectiveContext: {
      appCode: "codex",
      source: "none",
      activeWorkspaceId: null,
      activeSessionId: null,
      provider: {
        id: null,
        name: null,
        bindingMode: null,
        source: "none",
        missing: false
      },
      promptTemplate: {
        id: null,
        name: null,
        locale: null,
        source: "none",
        missing: false,
        content: null,
        enabled: null
      },
      skill: {
        id: null,
        name: null,
        source: "none",
        missing: false,
        promptTemplateId: null,
        content: null,
        enabled: null
      },
      systemInstruction: null,
      warnings: []
    }
  });

  assert.ok(created);
  assert.equal(workspaceRepository.list().length, 1);
  assert.equal(workspaceRepository.list()[0]?.rootPath, projectRoot);
  assert.equal(created?.workspaceId, workspaceRepository.list()[0]?.id);
  assert.equal(sessionRepository.list().length, 1);

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("reuses matched active session by cwd instead of creating duplicate session", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const discoveryService = new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRepository);
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  sessionRepository.upsert({
    id: "session-cwd-match",
    workspaceId: null,
    appCode: "codex",
    title: "Gateway",
    cwd: "/srv/projects/api",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T10:00:00.000Z"
  });

  const touched = lifecycleService.ensureFromRequest({
    appCode: "codex",
    cwd: "/srv/projects/api/packages/gateway",
    effectiveContext: {
      appCode: "codex",
      source: "request-auto-session",
      activeWorkspaceId: null,
      activeSessionId: null,
      provider: {
        id: "provider-c",
        name: "Provider C",
        bindingMode: "managed",
        source: "app-binding",
        missing: false
      },
      promptTemplate: {
        id: "prompt-c",
        name: "Prompt C",
        locale: "zh-CN",
        source: "none",
        missing: false,
        content: "prompt",
        enabled: true
      },
      skill: {
        id: "skill-c",
        name: "Skill C",
        source: "none",
        missing: false,
        promptTemplateId: "prompt-c",
        content: "skill",
        enabled: true
      },
      systemInstruction: "prompt\n\nskill",
      warnings: []
    }
  });

  assert.equal(touched?.id, "session-cwd-match");
  assert.equal(touched?.cwd, "/srv/projects/api/packages/gateway");
  assert.equal(touched?.providerId, "provider-c");
  assert.equal(touched?.promptTemplateId, "prompt-c");
  assert.equal(touched?.skillId, "skill-c");
  assert.equal(sessionRepository.list().length, 1);

  database.close();
});

test("backfills workspace onto matched active session when cwd reveals project root", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-session-backfill-"));
  const projectRoot = join(tempRoot, "repo");
  const cwd = join(projectRoot, "apps", "worker");
  mkdirSync(join(projectRoot, ".git"), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(projectRoot, "package.json"), "{\n  \"name\": \"repo\"\n}\n", "utf-8");

  sessionRepository.upsert({
    id: "session-needs-workspace",
    workspaceId: null,
    appCode: "codex",
    title: "Worker",
    cwd: projectRoot,
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T10:00:00.000Z"
  });

  const discoveryService = new WorkspaceDiscoveryService(
    {
      ...createEnv(),
      workspaceScanRoots: [tempRoot],
      workspaceScanDepth: 5
    },
    workspaceRepository,
    sessionRepository
  );
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  const touched = lifecycleService.ensureFromRequest({
    appCode: "codex",
    cwd,
    effectiveContext: {
      appCode: "codex",
      source: "request-auto-session",
      activeWorkspaceId: null,
      activeSessionId: null,
      provider: {
        id: null,
        name: null,
        bindingMode: null,
        source: "none",
        missing: false
      },
      promptTemplate: {
        id: null,
        name: null,
        locale: null,
        source: "none",
        missing: false,
        content: null,
        enabled: null
      },
      skill: {
        id: null,
        name: null,
        source: "none",
        missing: false,
        promptTemplateId: null,
        content: null,
        enabled: null
      },
      systemInstruction: null,
      warnings: []
    }
  });

  assert.equal(touched?.id, "session-needs-workspace");
  assert.equal(workspaceRepository.list().length, 1);
  assert.equal(touched?.workspaceId, workspaceRepository.list()[0]?.id);
  assert.equal(workspaceRepository.list()[0]?.rootPath, projectRoot);
  assert.equal(sessionRepository.list().length, 1);

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("ensures session from cwd and reuses existing workspace when bootstrapping manually", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-session-manual-"));
  const projectRoot = join(tempRoot, "repo");
  const cwd = join(projectRoot, "packages", "console");
  mkdirSync(join(projectRoot, ".git"), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(projectRoot, "package.json"), "{\n  \"name\": \"repo\"\n}\n", "utf-8");

  workspaceRepository.upsert({
    id: "workspace-console",
    name: "Console",
    rootPath: projectRoot,
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });

  const discoveryService = new WorkspaceDiscoveryService(
    {
      ...createEnv(),
      workspaceScanRoots: [tempRoot],
      workspaceScanDepth: 5
    },
    workspaceRepository,
    sessionRepository
  );
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  const result = lifecycleService.ensureFromManual({
    appCode: "codex",
    cwd,
    title: "Console Session"
  });

  assert.equal(result.workspace.id, "workspace-console");
  assert.equal(result.matchedBy, "workspace");
  assert.equal(result.createdWorkspace, false);
  assert.equal(result.createdSession, true);
  assert.equal(result.session.workspaceId, "workspace-console");
  assert.equal(result.session.title, "Console Session");

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("reuses the only active session in a workspace instead of creating a duplicate", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const discoveryService = new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRepository);
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  workspaceRepository.upsert({
    id: "workspace-api",
    name: "API",
    rootPath: "/srv/projects/api",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });
  sessionRepository.upsert({
    id: "session-only-active",
    workspaceId: "workspace-api",
    appCode: "codex",
    title: "Gateway",
    cwd: "/srv/projects/api/apps/gateway",
    providerId: "provider-old",
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T10:00:00.000Z"
  });

  const touched = lifecycleService.ensureFromRequest({
    appCode: "codex",
    cwd: "/srv/projects/api/packages/console",
    effectiveContext: {
      appCode: "codex",
      source: "request-auto-workspace",
      activeWorkspaceId: "workspace-api",
      activeSessionId: null,
      provider: {
        id: "provider-next",
        name: "Provider Next",
        bindingMode: "managed",
        source: "workspace-default",
        missing: false
      },
      promptTemplate: {
        id: null,
        name: null,
        locale: null,
        source: "none",
        missing: false,
        content: null,
        enabled: null
      },
      skill: {
        id: null,
        name: null,
        source: "none",
        missing: false,
        promptTemplateId: null,
        content: null,
        enabled: null
      },
      systemInstruction: null,
      warnings: []
    }
  });

  assert.equal(touched?.id, "session-only-active");
  assert.equal(touched?.cwd, "/srv/projects/api/packages/console");
  assert.equal(touched?.providerId, "provider-next");
  assert.equal(sessionRepository.list().length, 1);

  database.close();
});

test("creates a new session when a workspace already has multiple active sessions", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const discoveryService = new WorkspaceDiscoveryService(createEnv(), workspaceRepository, sessionRepository);
  const lifecycleService = new SessionLifecycleService(sessionRepository, discoveryService);

  workspaceRepository.upsert({
    id: "workspace-api",
    name: "API",
    rootPath: "/srv/projects/api",
    appCode: "codex",
    defaultProviderId: null,
    defaultPromptTemplateId: null,
    defaultSkillId: null,
    tags: [],
    enabled: true
  });
  sessionRepository.upsert({
    id: "session-a",
    workspaceId: "workspace-api",
    appCode: "codex",
    title: "Gateway",
    cwd: "/srv/projects/api/apps/gateway",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T10:00:00.000Z"
  });
  sessionRepository.upsert({
    id: "session-b",
    workspaceId: "workspace-api",
    appCode: "codex",
    title: "Worker",
    cwd: "/srv/projects/api/apps/worker",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T10:05:00.000Z"
  });

  const created = lifecycleService.ensureFromRequest({
    appCode: "codex",
    cwd: "/srv/projects/api/packages/console",
    effectiveContext: {
      appCode: "codex",
      source: "request-auto-workspace",
      activeWorkspaceId: "workspace-api",
      activeSessionId: null,
      provider: {
        id: null,
        name: null,
        bindingMode: null,
        source: "none",
        missing: false
      },
      promptTemplate: {
        id: null,
        name: null,
        locale: null,
        source: "none",
        missing: false,
        content: null,
        enabled: null
      },
      skill: {
        id: null,
        name: null,
        source: "none",
        missing: false,
        promptTemplateId: null,
        content: null,
        enabled: null
      },
      systemInstruction: null,
      warnings: []
    }
  });

  assert.ok(created);
  assert.notEqual(created?.id, "session-a");
  assert.notEqual(created?.id, "session-b");
  assert.equal(created?.workspaceId, "workspace-api");
  assert.equal(sessionRepository.list().length, 3);

  database.close();
});
