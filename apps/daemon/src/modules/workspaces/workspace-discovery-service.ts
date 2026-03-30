import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

import {
  type AppCode,
  type Workspace,
  type WorkspaceDiscoveryBatchImport,
  type WorkspaceDiscoveryBatchImportResult,
  type WorkspaceDiscoveryImport,
  type WorkspaceDiscoveryItem
} from "cc-switch-web-shared";

import type { DaemonEnv } from "../../config/env.js";
import type { SessionRecordRepository } from "./session-record-repository.js";
import type { WorkspaceRepository } from "./workspace-repository.js";

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "AGENTS.md",
  "CLAUDE.md",
  ".codex",
  ".claude",
  ".gemini",
  ".opencode"
] as const;

const DEFAULT_SCAN_ROOT_SUFFIXES = [
  "workspace",
  "workspaces",
  "projects",
  "code",
  "src",
  "IdeaProjects"
];

const normalizePath = (input: string): string => resolve(input);

const detectAppSuggestion = (markers: string[]): AppCode | null => {
  if (markers.includes(".codex") || markers.includes("AGENTS.md")) {
    return "codex";
  }
  if (markers.includes(".claude") || markers.includes("CLAUDE.md")) {
    return "claude-code";
  }
  if (markers.includes(".gemini")) {
    return "gemini-cli";
  }
  if (markers.includes(".opencode")) {
    return "opencode";
  }
  return null;
};

const safeListDir = (rootPath: string): string[] => {
  try {
    return readdirSync(rootPath);
  } catch {
    return [];
  }
};

const safeIsDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const hasProjectMarkers = (rootPath: string): string[] =>
  PROJECT_MARKERS.filter((marker) => existsSync(join(rootPath, marker)));

export class WorkspaceDiscoveryService {
  constructor(
    private readonly env: DaemonEnv,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository
  ) {}

  list(options?: {
    readonly roots?: string[];
    readonly depth?: number;
  }): WorkspaceDiscoveryItem[] {
    const workspaces = this.workspaceRepository.list();
    const sessions = this.sessionRecordRepository.list();
    const roots = this.resolveScanRoots(options?.roots);
    const maxDepth = Math.max(0, options?.depth ?? this.env.workspaceScanDepth);
    const byPath = new Map<string, WorkspaceDiscoveryItem>();

    for (const workspace of workspaces) {
      const rootPath = normalizePath(workspace.rootPath);
      this.upsertDiscoveryCandidate(byPath, {
        rootPath,
        name: workspace.name,
        status: "existing-workspace",
        source: "workspace-root",
        appCodeSuggestion: workspace.appCode,
        existingWorkspaceId: workspace.id,
        existingSessionIds: sessions
          .filter(
            (item) =>
              item.workspaceId === workspace.id ||
              ((workspace.appCode === null || item.appCode === workspace.appCode) &&
                this.isPathWithin(normalizePath(item.cwd), rootPath))
          )
          .map((item) => item.id),
        markers: hasProjectMarkers(rootPath),
        hasGitRepository: existsSync(join(rootPath, ".git")),
        depth: 0
      });
    }

    for (const session of sessions) {
      const candidateRoot = this.findNearestProjectRoot(session.cwd) ?? normalizePath(session.cwd);
      this.upsertDiscoveryCandidate(byPath, {
        rootPath: candidateRoot,
        name: basename(candidateRoot),
        status: "existing-session-root",
        source: "session-cwd",
        appCodeSuggestion: session.appCode,
        existingWorkspaceId: null,
        existingSessionIds: [session.id],
        markers: hasProjectMarkers(candidateRoot),
        hasGitRepository: existsSync(join(candidateRoot, ".git")),
        depth: 0
      });
    }

    for (const root of roots) {
      this.walkRoot(root, 0, maxDepth, workspaces, sessions, byPath);
    }

    return Array.from(byPath.values()).sort((left, right) =>
      left.rootPath.localeCompare(right.rootPath)
    );
  }

  importCandidate(input: WorkspaceDiscoveryImport): Workspace {
    return this.importCandidateWithSessionLinks(input).item;
  }

  importCandidatesWithSessionLinks(
    input: Partial<WorkspaceDiscoveryBatchImport> = {}
  ): WorkspaceDiscoveryBatchImportResult {
    const discoveries = this.list({
      ...(input.roots !== undefined ? { roots: input.roots } : {}),
      ...(input.depth !== undefined ? { depth: input.depth } : {})
    });
    const importableCandidates = discoveries.filter((item) => item.status !== "existing-workspace" && item.status !== "ignored");
    const items: Workspace[] = [];
    const linkedSessionIds = new Set<string>();

    for (const candidate of importableCandidates) {
      const result = this.importCandidateWithSessionLinks({
        rootPath: candidate.rootPath,
        name: candidate.name,
        appCode: candidate.appCodeSuggestion ?? input.appCode ?? null,
        tags: input.tags ?? [],
        enabled: input.enabled ?? true
      });
      items.push(result.item);
      for (const sessionId of result.linkedSessionIds) {
        linkedSessionIds.add(sessionId);
      }
    }

    return {
      totalCandidates: discoveries.length,
      importedCount: items.length,
      linkedSessionIds: [...linkedSessionIds].sort(),
      skippedRootPaths: discoveries
        .filter((item) => item.status === "existing-workspace" || item.status === "ignored")
        .map((item) => item.rootPath)
        .sort(),
      items
    };
  }

  importCandidateWithSessionLinks(input: WorkspaceDiscoveryImport): {
    readonly item: Workspace;
    readonly linkedSessionIds: string[];
  } {
    const rootPath = normalizePath(input.rootPath);
    const existing = this.workspaceRepository.list().find(
      (item) => normalizePath(item.rootPath) === rootPath || item.id === input.id
    );
    const discovery = this.list({ roots: [rootPath], depth: 0 }).find((item) => item.rootPath === rootPath);
    const suggestedName = input.name ?? discovery?.name ?? basename(rootPath);
    const suggestedAppCode = input.appCode ?? discovery?.appCodeSuggestion ?? null;

    const item = this.workspaceRepository.upsert({
      id:
        input.id ??
        existing?.id ??
        `workspace-${basename(rootPath).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: suggestedName,
      rootPath,
      appCode: suggestedAppCode,
      defaultProviderId: input.defaultProviderId ?? existing?.defaultProviderId ?? null,
      defaultPromptTemplateId: input.defaultPromptTemplateId ?? existing?.defaultPromptTemplateId ?? null,
      defaultSkillId: input.defaultSkillId ?? existing?.defaultSkillId ?? null,
      tags: input.tags ?? existing?.tags ?? [],
      enabled: input.enabled ?? existing?.enabled ?? true
    });

    return {
      item,
      linkedSessionIds: this.linkSessionsToWorkspace(item)
    };
  }

  ensureWorkspaceForCwd(input: {
    readonly appCode: AppCode;
    readonly cwd: string;
  }): Workspace | null {
    const association = this.resolveAssociationByCwd(input);
    if (association.workspaceId !== null) {
      return this.workspaceRepository.list().find((item) => item.id === association.workspaceId) ?? null;
    }

    const projectRoot = this.findNearestProjectRoot(input.cwd);
    if (projectRoot === null) {
      return null;
    }

    const existing = this.workspaceRepository
      .list()
      .find((item) => normalizePath(item.rootPath) === projectRoot);
    if (existing !== undefined) {
      return existing;
    }

    const markers = hasProjectMarkers(projectRoot);
    return this.importCandidate({
      rootPath: projectRoot,
      name: basename(projectRoot),
      appCode: detectAppSuggestion(markers) ?? input.appCode,
      tags: ["auto-discovered"],
      enabled: true
    });
  }

  resolveAssociationByCwd(input: {
    readonly appCode: AppCode;
    readonly cwd: string;
  }): {
    readonly workspaceId: string | null;
    readonly sessionId: string | null;
    readonly matchedBy: "session" | "workspace" | "none";
  } {
    const cwd = normalizePath(input.cwd);
    const sessions = this.sessionRecordRepository
      .list()
      .filter((item) => item.appCode === input.appCode && item.status === "active")
      .map((item) => ({
        sessionId: item.id,
        workspaceId: item.workspaceId,
        path: normalizePath(item.cwd)
      }))
      .filter((item) => this.isPathWithin(cwd, item.path))
      .sort((left, right) => right.path.length - left.path.length);

    const matchedSession = sessions[0];
    if (matchedSession !== undefined) {
      return {
        workspaceId: matchedSession.workspaceId,
        sessionId: matchedSession.sessionId,
        matchedBy: "session"
      };
    }

    const workspaces = this.workspaceRepository
      .list()
      .filter((item) => item.appCode === null || item.appCode === input.appCode)
      .map((item) => ({
        workspaceId: item.id,
        path: normalizePath(item.rootPath)
      }))
      .filter((item) => this.isPathWithin(cwd, item.path))
      .sort((left, right) => right.path.length - left.path.length);

    const matchedWorkspace = workspaces[0];
    if (matchedWorkspace !== undefined) {
      return {
        workspaceId: matchedWorkspace.workspaceId,
        sessionId: null,
        matchedBy: "workspace"
      };
    }

    return {
      workspaceId: null,
      sessionId: null,
      matchedBy: "none"
    };
  }

  private resolveScanRoots(explicitRoots?: string[]): string[] {
    const configured = explicitRoots?.length ? explicitRoots : this.env.workspaceScanRoots;
    const roots = configured.length > 0 ? configured : DEFAULT_SCAN_ROOT_SUFFIXES.map((item) => join(homedir(), item));

    return roots
      .map(normalizePath)
      .filter((item, index, array) => existsSync(item) && array.indexOf(item) === index);
  }

  private isPathWithin(targetPath: string, candidateRoot: string): boolean {
    if (targetPath === candidateRoot) {
      return true;
    }

    return targetPath.startsWith(`${candidateRoot}/`);
  }

  private findNearestProjectRoot(startPath: string): string | null {
    let current = normalizePath(startPath);

    while (true) {
      if (safeIsDirectory(current) && hasProjectMarkers(current).length > 0) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  private walkRoot(
    rootPath: string,
    depth: number,
    maxDepth: number,
    workspaces: Workspace[],
    sessions: ReturnType<SessionRecordRepository["list"]>,
    byPath: Map<string, WorkspaceDiscoveryItem>
  ): void {
    if (depth > maxDepth || !safeIsDirectory(rootPath)) {
      return;
    }

    const markers = hasProjectMarkers(rootPath);
    if (markers.length > 0) {
      const normalizedRoot = normalizePath(rootPath);
      if (!byPath.has(normalizedRoot)) {
        const matchedWorkspace =
          workspaces.find((item) => normalizePath(item.rootPath) === normalizedRoot) ?? null;
        const matchedSessions = sessions.filter(
          (item) =>
            (matchedWorkspace === null || matchedWorkspace.appCode === null || item.appCode === matchedWorkspace.appCode) &&
            this.isPathWithin(normalizePath(item.cwd), normalizedRoot)
        );
        this.upsertDiscoveryCandidate(byPath, {
          rootPath: normalizedRoot,
          name: basename(normalizedRoot),
          status:
            matchedWorkspace !== null
              ? "existing-workspace"
              : matchedSessions.length > 0
                ? "existing-session-root"
                : "new",
          source: "scan-root",
          appCodeSuggestion:
            matchedWorkspace?.appCode ??
            matchedSessions[0]?.appCode ??
            detectAppSuggestion(markers),
          existingWorkspaceId: matchedWorkspace?.id ?? null,
          existingSessionIds: matchedSessions.map((item) => item.id),
          markers,
          hasGitRepository: markers.includes(".git"),
          depth
        });
      }
    }

    if (depth === maxDepth) {
      return;
    }

    for (const entry of safeListDir(rootPath)) {
      if (entry.startsWith(".") && entry !== ".git" && entry !== ".codex" && entry !== ".claude") {
        continue;
      }
      const nextPath = join(rootPath, entry);
      if (!safeIsDirectory(nextPath) || entry === "node_modules") {
        continue;
      }
      this.walkRoot(nextPath, depth + 1, maxDepth, workspaces, sessions, byPath);
    }
  }

  private upsertDiscoveryCandidate(
    byPath: Map<string, WorkspaceDiscoveryItem>,
    incoming: WorkspaceDiscoveryItem
  ): void {
    const existing = byPath.get(incoming.rootPath);
    if (existing === undefined) {
      byPath.set(incoming.rootPath, {
        ...incoming,
        existingSessionIds: [...incoming.existingSessionIds],
        markers: [...incoming.markers]
      });
      return;
    }

    const existingWorkspaceId = existing.existingWorkspaceId ?? incoming.existingWorkspaceId;
    const existingSessionIds = Array.from(
      new Set([...existing.existingSessionIds, ...incoming.existingSessionIds])
    ).sort();
    const markers = Array.from(new Set([...existing.markers, ...incoming.markers])).sort();
    const status =
      existingWorkspaceId !== null
        ? "existing-workspace"
        : existingSessionIds.length > 0
          ? "existing-session-root"
          : existing.status === "ignored" || incoming.status === "ignored"
            ? "ignored"
            : "new";

    byPath.set(incoming.rootPath, {
      rootPath: incoming.rootPath,
      name:
        existing.source === "workspace-root" || status === "existing-workspace"
          ? existing.name
          : incoming.name,
      status,
      source:
        status === "existing-workspace"
          ? existing.source === "workspace-root" || incoming.source === "workspace-root"
            ? "workspace-root"
            : existing.source
          : existingSessionIds.length > 0
            ? "session-cwd"
            : existing.source === "scan-root" || incoming.source === "scan-root"
              ? "scan-root"
              : existing.source,
      appCodeSuggestion: existing.appCodeSuggestion ?? incoming.appCodeSuggestion,
      existingWorkspaceId,
      existingSessionIds,
      markers,
      hasGitRepository: existing.hasGitRepository || incoming.hasGitRepository,
      depth: Math.min(existing.depth, incoming.depth)
    });
  }

  private linkSessionsToWorkspace(workspace: Workspace): string[] {
    const rootPath = normalizePath(workspace.rootPath);
    const linkedSessionIds: string[] = [];

    for (const session of this.sessionRecordRepository.list()) {
      if (session.workspaceId !== null) {
        continue;
      }
      if (workspace.appCode !== null && session.appCode !== workspace.appCode) {
        continue;
      }
      if (!this.isPathWithin(normalizePath(session.cwd), rootPath)) {
        continue;
      }

      this.sessionRecordRepository.touch(session.id, {
        workspaceId: workspace.id
      });
      linkedSessionIds.push(session.id);
    }

    return linkedSessionIds;
  }
}
