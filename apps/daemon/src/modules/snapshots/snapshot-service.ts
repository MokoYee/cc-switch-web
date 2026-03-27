import {
  type AppBinding,
  type PromptTemplate,
  type SessionRecord,
  type Skill,
  type AppMcpBinding,
  type ConfigSnapshotDiff,
  type ConfigSnapshotDiffBucket,
  type ConfigSnapshotSummary,
  type ConfigSnapshot,
  type FailoverChain,
  type McpServer,
  type Provider,
  type ProxyPolicy,
  type Workspace
} from "@cc-switch-web/shared";

import type { SqliteDatabase } from "../../db/database.js";
import { PromptTemplateRepository } from "../assets/prompt-template-repository.js";
import { SkillRepository } from "../assets/skill-repository.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { AppMcpBindingRepository } from "../mcp/app-mcp-binding-repository.js";
import { McpServerRepository } from "../mcp/mcp-server-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyService } from "../proxy/proxy-service.js";
import { AppQuotaRepository } from "../quotas/app-quota-repository.js";
import { SessionRecordRepository } from "../workspaces/session-record-repository.js";
import { WorkspaceRepository } from "../workspaces/workspace-repository.js";

export class SnapshotService {
  private afterCreateCallback: ((snapshot: ConfigSnapshot) => void) | null = null;

  constructor(
    private readonly database: SqliteDatabase,
    private readonly providerRepository: ProviderRepository,
    private readonly promptTemplateRepository: PromptTemplateRepository,
    private readonly skillRepository: SkillRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sessionRecordRepository: SessionRecordRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly appQuotaRepository: AppQuotaRepository,
    private readonly proxyService: ProxyService,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly mcpServerRepository: McpServerRepository,
    private readonly appMcpBindingRepository: AppMcpBindingRepository
  ) {}

  latest(): ConfigSnapshot | null {
    return this.readOne(`
      SELECT version, reason, payload_json, created_at
      FROM config_snapshots
      ORDER BY version DESC
      LIMIT 1
    `);
  }

  getByVersion(version: number): ConfigSnapshot | null {
    return this.readOne(
      `
        SELECT version, reason, payload_json, created_at
        FROM config_snapshots
        WHERE version = ?
      `,
      version
    );
  }

  create(reason: string): ConfigSnapshot {
    const createdAt = new Date().toISOString();
    const payload = {
      providers: this.providerRepository.list(),
      promptTemplates: this.promptTemplateRepository.list(),
      skills: this.skillRepository.list(),
      workspaces: this.workspaceRepository.list(),
      sessionRecords: this.sessionRecordRepository.list(),
      bindings: this.bindingRepository.list(),
      appQuotas: this.appQuotaRepository.list(),
      proxyPolicy: this.proxyService.getStatus().policy,
      failoverChains: this.failoverChainRepository.list(),
      mcpServers: this.mcpServerRepository.list(),
      appMcpBindings: this.appMcpBindingRepository.list()
    };

    const result = this.database
      .prepare(`
        INSERT INTO config_snapshots (reason, payload_json, created_at)
        VALUES (?, ?, ?)
      `)
      .run(reason, JSON.stringify(payload), createdAt);

    const snapshot = {
      version: Number(result.lastInsertRowid),
      reason,
      createdAt,
      payload
    };
    this.afterCreateCallback?.(snapshot);
    return snapshot;
  }

  ensureInitialSnapshot(): void {
    if (this.latest() !== null) {
      return;
    }

    this.create("bootstrap");
  }

  setAfterCreate(callback: ((snapshot: ConfigSnapshot) => void) | null): void {
    this.afterCreateCallback = callback;
  }

  listRecent(limit = 10): ConfigSnapshotSummary[] {
    const rows = this.database
      .prepare(`
        SELECT version, reason, payload_json, created_at
        FROM config_snapshots
        ORDER BY version DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        version: number;
        reason: string;
        payload_json: string;
        created_at: string;
      }>;

    return rows.map((row) => {
      const snapshot = this.readOne(
        `
          SELECT version, reason, payload_json, created_at
          FROM config_snapshots
          WHERE version = ?
        `,
        row.version
      );
      if (snapshot === null) {
        throw new Error(`Snapshot not found during summary build: ${row.version}`);
      }
      return {
        version: snapshot.version,
        reason: snapshot.reason,
        createdAt: snapshot.createdAt,
        counts: {
          providers: snapshot.payload.providers.length,
          promptTemplates: snapshot.payload.promptTemplates.length,
          skills: snapshot.payload.skills.length,
          workspaces: snapshot.payload.workspaces.length,
          sessionRecords: snapshot.payload.sessionRecords.length,
          bindings: snapshot.payload.bindings.length,
          appQuotas: snapshot.payload.appQuotas.length,
          failoverChains: snapshot.payload.failoverChains.length,
          mcpServers: snapshot.payload.mcpServers.length,
          appMcpBindings: snapshot.payload.appMcpBindings.length
        }
      };
    });
  }

  diffVersions(fromVersion: number | null, toVersion: number): ConfigSnapshotDiff {
    const toSnapshot = this.getByVersion(toVersion);
    if (toSnapshot === null) {
      throw new Error(`Snapshot not found: ${toVersion}`);
    }
    const fromSnapshot = fromVersion === null ? null : this.getByVersion(fromVersion);
    if (fromVersion !== null && fromSnapshot === null) {
      throw new Error(`Snapshot not found: ${fromVersion}`);
    }

    const providers = this.diffCollection(fromSnapshot?.payload.providers ?? [], toSnapshot.payload.providers);
    const promptTemplates = this.diffCollection(fromSnapshot?.payload.promptTemplates ?? [], toSnapshot.payload.promptTemplates);
    const skills = this.diffCollection(fromSnapshot?.payload.skills ?? [], toSnapshot.payload.skills);
    const workspaces = this.diffCollection(fromSnapshot?.payload.workspaces ?? [], toSnapshot.payload.workspaces);
    const sessionRecords = this.diffCollection(fromSnapshot?.payload.sessionRecords ?? [], toSnapshot.payload.sessionRecords);
    const bindings = this.diffCollection(fromSnapshot?.payload.bindings ?? [], toSnapshot.payload.bindings);
    const appQuotas = this.diffCollection(fromSnapshot?.payload.appQuotas ?? [], toSnapshot.payload.appQuotas);
    const failoverChains = this.diffCollection(fromSnapshot?.payload.failoverChains ?? [], toSnapshot.payload.failoverChains);
    const mcpServers = this.diffCollection(fromSnapshot?.payload.mcpServers ?? [], toSnapshot.payload.mcpServers);
    const appMcpBindings = this.diffCollection(fromSnapshot?.payload.appMcpBindings ?? [], toSnapshot.payload.appMcpBindings);

    const buckets = [
      providers,
      promptTemplates,
      skills,
      workspaces,
      sessionRecords,
      bindings,
      appQuotas,
      failoverChains,
      mcpServers,
      appMcpBindings
    ];

    return {
      fromVersion,
      toVersion,
      summary: {
        totalAdded: buckets.reduce((sum, item) => sum + item.added.length, 0),
        totalRemoved: buckets.reduce((sum, item) => sum + item.removed.length, 0),
        totalChanged: buckets.reduce((sum, item) => sum + item.changed.length, 0)
      },
      providers,
      promptTemplates,
      skills,
      workspaces,
      sessionRecords,
      bindings,
      appQuotas,
      failoverChains,
      mcpServers,
      appMcpBindings
    };
  }

  diffLatestAgainstPrevious(): ConfigSnapshotDiff | null {
    const recent = this.listRecent(2);
    if (recent.length === 0) {
      return null;
    }
    const current = recent[0];
    if (current === undefined) {
      return null;
    }
    const previous = recent[1] ?? null;
    return this.diffVersions(previous?.version ?? null, current.version);
  }

  getPreviousVersion(version: number): number | null {
    const row = this.database
      .prepare(`
        SELECT version
        FROM config_snapshots
        WHERE version < ?
        ORDER BY version DESC
        LIMIT 1
      `)
      .get(version) as { version: number } | undefined;

    return row?.version ?? null;
  }

  diffVersionAgainstPrevious(version: number): ConfigSnapshotDiff | null {
    const snapshot = this.getByVersion(version);
    if (snapshot === null) {
      return null;
    }

    const previousVersion = this.getPreviousVersion(version);
    return this.diffVersions(previousVersion, version);
  }

  private diffCollection(itemsBefore: Array<{ id: string }>, itemsAfter: Array<{ id: string }>): ConfigSnapshotDiffBucket {
    const before = new Map(itemsBefore.map((item) => [item.id, JSON.stringify(item)] as const));
    const after = new Map(itemsAfter.map((item) => [item.id, JSON.stringify(item)] as const));
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const [id, value] of after.entries()) {
      if (!before.has(id)) {
        added.push(id);
        continue;
      }
      if (before.get(id) !== value) {
        changed.push(id);
      }
    }

    for (const id of before.keys()) {
      if (!after.has(id)) {
        removed.push(id);
      }
    }

    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort()
    };
  }

  private readOne(sql: string, ...params: unknown[]): ConfigSnapshot | null {
    const row = this.database
      .prepare(sql)
      .get(...params) as
      | {
          version: number;
          reason: string;
          payload_json: string;
          created_at: string;
        }
      | undefined;

    if (row === undefined) {
      return null;
    }

    const payload = JSON.parse(row.payload_json) as {
      providers: Provider[];
      promptTemplates?: PromptTemplate[];
      skills?: Skill[];
      workspaces?: Workspace[];
      sessionRecords?: SessionRecord[];
      bindings: AppBinding[];
      appQuotas?: import("@cc-switch-web/shared").AppQuota[];
      proxyPolicy: ProxyPolicy;
      failoverChains?: FailoverChain[];
      mcpServers?: McpServer[];
      appMcpBindings?: AppMcpBinding[];
    };

    return {
      version: row.version,
      reason: row.reason,
      createdAt: row.created_at,
      payload: {
        ...payload,
        promptTemplates: payload.promptTemplates ?? [],
        skills: payload.skills ?? [],
        workspaces: payload.workspaces ?? [],
        sessionRecords: payload.sessionRecords ?? [],
        appQuotas: payload.appQuotas ?? [],
        failoverChains: payload.failoverChains ?? [],
        mcpServers: payload.mcpServers ?? [],
        appMcpBindings: payload.appMcpBindings ?? []
      }
    };
  }
}
