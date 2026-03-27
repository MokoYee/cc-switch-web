import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import type { DaemonEnv } from "../../config/env.js";
import { SessionRecordRepository } from "./session-record-repository.js";
import { WorkspaceDiscoveryService } from "./workspace-discovery-service.js";
import { WorkspaceRepository } from "./workspace-repository.js";

const createEnv = (roots: string[]): DaemonEnv => ({
  runMode: "foreground",
  host: "127.0.0.1",
  port: 8787,
  allowedOrigins: [],
  allowAnyOrigin: false,
  envControlToken: null,
  controlUiMountPath: "/ui",
  healthProbeIntervalMs: 15_000,
  workspaceScanRoots: roots,
  workspaceScanDepth: 3,
  sessionStaleMs: 7 * 24 * 60 * 60 * 1000
});

test("discovers project roots, infers app code, and imports workspace candidates", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-workspace-discovery-"));
  const repoRoot = join(tempRoot, "projects", "demo-repo");
  mkdirSync(join(repoRoot, ".git"), { recursive: true });
  mkdirSync(join(repoRoot, ".codex"), { recursive: true });
  writeFileSync(join(repoRoot, "package.json"), "{\n  \"name\": \"demo-repo\"\n}\n", "utf-8");

  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const service = new WorkspaceDiscoveryService(
    createEnv([join(tempRoot, "projects")]),
    workspaceRepository,
    sessionRepository
  );

  const discoveries = service.list();
  const repoDiscovery = discoveries.find((item) => item.rootPath === repoRoot);

  assert.ok(repoDiscovery);
  assert.equal(repoDiscovery?.status, "new");
  assert.equal(repoDiscovery?.appCodeSuggestion, "codex");
  assert.equal(repoDiscovery?.hasGitRepository, true);
  assert.deepEqual(
    repoDiscovery?.markers.sort(),
    [".codex", ".git", "package.json"].sort()
  );

  const imported = service.importCandidate({
    rootPath: repoRoot,
    tags: ["autodiscovered"],
    enabled: true
  });
  assert.equal(imported.rootPath, repoRoot);
  assert.equal(imported.appCode, "codex");
  assert.deepEqual(imported.tags, ["autodiscovered"]);

  const afterImport = service.list().find((item) => item.rootPath === repoRoot);
  assert.equal(afterImport?.status, "existing-workspace");
  assert.equal(afterImport?.existingWorkspaceId, imported.id);

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("surfaces existing session cwd as workspace candidate", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-workspace-session-"));
  const sessionRoot = join(tempRoot, "service-a");
  mkdirSync(sessionRoot, { recursive: true });
  writeFileSync(join(sessionRoot, "pyproject.toml"), "[project]\nname = 'service-a'\n", "utf-8");

  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  sessionRepository.upsert({
    id: "session-1",
    workspaceId: null,
    appCode: "claude-code",
    title: "Service Session",
    cwd: sessionRoot,
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });
  const service = new WorkspaceDiscoveryService(
    createEnv([tempRoot]),
    workspaceRepository,
    sessionRepository
  );

  const discoveries = service.list();
  const item = discoveries.find((candidate) => candidate.rootPath === sessionRoot);

  assert.ok(item);
  assert.equal(item?.status, "existing-session-root");
  assert.equal(item?.source, "session-cwd");
  assert.deepEqual(item?.existingSessionIds, ["session-1"]);
  assert.equal(item?.appCodeSuggestion, "claude-code");

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("links matching sessions when importing a workspace candidate", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-workspace-link-"));
  const repoRoot = join(tempRoot, "repo");
  const nestedSessionRoot = join(repoRoot, "apps", "gateway");
  mkdirSync(join(repoRoot, ".git"), { recursive: true });
  mkdirSync(nestedSessionRoot, { recursive: true });
  writeFileSync(join(repoRoot, "package.json"), "{\n  \"name\": \"repo\"\n}\n", "utf-8");

  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  sessionRepository.upsert({
    id: "session-link-target",
    workspaceId: null,
    appCode: "codex",
    title: "Gateway",
    cwd: nestedSessionRoot,
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });
  const service = new WorkspaceDiscoveryService(createEnv([tempRoot]), workspaceRepository, sessionRepository);

  const result = service.importCandidateWithSessionLinks({
    rootPath: repoRoot,
    appCode: "codex",
    tags: ["auto-imported"],
    enabled: true
  });

  assert.deepEqual(result.linkedSessionIds, ["session-link-target"]);
  assert.equal(sessionRepository.findById("session-link-target")?.workspaceId, result.item.id);

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("auto imports nearest project root for cwd when workspace does not exist yet", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-workspace-auto-import-"));
  const repoRoot = join(tempRoot, "repo");
  const nestedPath = join(repoRoot, "packages", "gateway", "src");
  mkdirSync(nestedPath, { recursive: true });
  mkdirSync(join(repoRoot, ".git"), { recursive: true });
  mkdirSync(join(repoRoot, ".claude"), { recursive: true });
  writeFileSync(join(repoRoot, "package.json"), "{\n  \"name\": \"repo\"\n}\n", "utf-8");

  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const service = new WorkspaceDiscoveryService(
    createEnv([tempRoot]),
    workspaceRepository,
    sessionRepository
  );

  const workspace = service.ensureWorkspaceForCwd({
    appCode: "claude-code",
    cwd: nestedPath
  });

  assert.ok(workspace);
  assert.equal(workspace?.rootPath, repoRoot);
  assert.equal(workspace?.appCode, "claude-code");
  assert.equal(workspaceRepository.list().length, 1);

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("deduplicates nested session cwd onto nearest project root candidate", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-workspace-session-project-root-"));
  const repoRoot = join(tempRoot, "repo");
  const nestedSessionRoot = join(repoRoot, "apps", "gateway");
  mkdirSync(join(repoRoot, ".git"), { recursive: true });
  mkdirSync(nestedSessionRoot, { recursive: true });
  writeFileSync(join(repoRoot, "package.json"), "{\n  \"name\": \"repo\"\n}\n", "utf-8");

  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  sessionRepository.upsert({
    id: "session-project-root",
    workspaceId: null,
    appCode: "codex",
    title: "Gateway",
    cwd: nestedSessionRoot,
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });
  const service = new WorkspaceDiscoveryService(createEnv([tempRoot]), workspaceRepository, sessionRepository);

  const discoveries = service.list();
  const repoItem = discoveries.find((candidate) => candidate.rootPath === repoRoot);
  const nestedItem = discoveries.find((candidate) => candidate.rootPath === nestedSessionRoot);

  assert.ok(repoItem);
  assert.equal(repoItem?.status, "existing-session-root");
  assert.deepEqual(repoItem?.existingSessionIds, ["session-project-root"]);
  assert.equal(repoItem?.hasGitRepository, true);
  assert.equal(nestedItem, undefined);

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("batch imports discovery candidates and links matching sessions", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "ai-cli-switch-workspace-batch-import-"));
  const repoRoot = join(tempRoot, "repo");
  const nestedSessionRoot = join(repoRoot, "apps", "gateway");
  mkdirSync(join(repoRoot, ".git"), { recursive: true });
  mkdirSync(join(repoRoot, ".codex"), { recursive: true });
  mkdirSync(nestedSessionRoot, { recursive: true });
  writeFileSync(join(repoRoot, "package.json"), "{\n  \"name\": \"repo\"\n}\n", "utf-8");

  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  sessionRepository.upsert({
    id: "session-batch-link",
    workspaceId: null,
    appCode: "codex",
    title: "Gateway",
    cwd: nestedSessionRoot,
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "active",
    startedAt: "2026-03-21T12:00:00.000Z"
  });
  const service = new WorkspaceDiscoveryService(createEnv([tempRoot]), workspaceRepository, sessionRepository);

  const result = service.importCandidatesWithSessionLinks({
    tags: ["auto-imported"],
    enabled: true
  });

  assert.equal(result.totalCandidates, 1);
  assert.equal(result.importedCount, 1);
  assert.deepEqual(result.linkedSessionIds, ["session-batch-link"]);
  assert.equal(result.items[0]?.rootPath, repoRoot);
  assert.deepEqual(result.items[0]?.tags, ["auto-imported"]);
  assert.equal(sessionRepository.findById("session-batch-link")?.workspaceId, result.items[0]?.id ?? null);

  rmSync(tempRoot, { recursive: true, force: true });
  database.close();
});

test("ignores archived sessions when matching cwd back to runtime context", () => {
  const database = openDatabase(":memory:");
  const workspaceRepository = new WorkspaceRepository(database);
  const sessionRepository = new SessionRecordRepository(database);
  const service = new WorkspaceDiscoveryService(createEnv([]), workspaceRepository, sessionRepository);

  sessionRepository.upsert({
    id: "session-archived",
    workspaceId: null,
    appCode: "codex",
    title: "Old Session",
    cwd: "/srv/demo",
    providerId: null,
    promptTemplateId: null,
    skillId: null,
    status: "archived",
    startedAt: "2026-03-20T12:00:00.000Z"
  });

  const association = service.resolveAssociationByCwd({
    appCode: "codex",
    cwd: "/srv/demo/src"
  });

  assert.equal(association.matchedBy, "none");
  assert.equal(association.sessionId, null);

  database.close();
});
