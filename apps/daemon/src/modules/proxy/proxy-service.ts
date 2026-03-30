import { nowIso, type ProxyPolicy } from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";

export interface ProxyStatus {
  readonly policy: ProxyPolicy;
  readonly runtimeState: "stopped" | "starting" | "running";
}

export class ProxyService {
  constructor(private readonly database: SqliteDatabase) {}

  getStatus(): ProxyStatus {
    const row = this.database
      .prepare(`
        SELECT listen_host, listen_port, enabled, request_timeout_ms, failure_threshold
        FROM proxy_policies
        WHERE singleton_id = 1
      `)
      .get() as
      | {
          listen_host: string;
          listen_port: number;
          enabled: number;
          request_timeout_ms: number;
          failure_threshold: number;
        }
      | undefined;

    if (row === undefined) {
      throw new Error("Proxy policy not initialized");
    }

    const policy: ProxyPolicy = {
      listenHost: row.listen_host,
      listenPort: row.listen_port,
      enabled: row.enabled === 1,
      requestTimeoutMs: row.request_timeout_ms,
      failureThreshold: row.failure_threshold
    };

    return {
      policy,
      runtimeState: policy.enabled ? "running" : "stopped"
    };
  }

  update(policy: ProxyPolicy): ProxyStatus {
    this.database
      .prepare(`
        UPDATE proxy_policies
        SET listen_host = @listenHost,
            listen_port = @listenPort,
            enabled = @enabled,
            request_timeout_ms = @requestTimeoutMs,
            failure_threshold = @failureThreshold,
            updated_at = @updatedAt
        WHERE singleton_id = 1
      `)
      .run({
        ...policy,
        enabled: policy.enabled ? 1 : 0,
        updatedAt: nowIso()
      });

    return this.getStatus();
  }

  replace(policy: ProxyPolicy): ProxyStatus {
    return this.update(policy);
  }
}
