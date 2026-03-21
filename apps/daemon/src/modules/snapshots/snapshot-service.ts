import { type AppBinding, type ConfigSnapshot, type FailoverChain, type Provider, type ProxyPolicy } from "@ai-cli-switch/shared";

import type { SqliteDatabase } from "../../db/database.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyService } from "../proxy/proxy-service.js";

export class SnapshotService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly providerRepository: ProviderRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly proxyService: ProxyService,
    private readonly failoverChainRepository: FailoverChainRepository
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
      bindings: this.bindingRepository.list(),
      proxyPolicy: this.proxyService.getStatus().policy,
      failoverChains: this.failoverChainRepository.list()
    };

    const result = this.database
      .prepare(`
        INSERT INTO config_snapshots (reason, payload_json, created_at)
        VALUES (?, ?, ?)
      `)
      .run(reason, JSON.stringify(payload), createdAt);

    return {
      version: Number(result.lastInsertRowid),
      reason,
      createdAt,
      payload
    };
  }

  ensureInitialSnapshot(): void {
    if (this.latest() !== null) {
      return;
    }

    this.create("bootstrap");
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
      bindings: AppBinding[];
      proxyPolicy: ProxyPolicy;
      failoverChains?: FailoverChain[];
    };

    return {
      version: row.version,
      reason: row.reason,
      createdAt: row.created_at,
      payload: {
        ...payload,
        failoverChains: payload.failoverChains ?? []
      }
    };
  }
}
