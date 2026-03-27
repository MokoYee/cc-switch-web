import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { AuditEventService } from "./audit-event-service.js";

test("aggregates host, health, proxy, mcp, quota, snapshot, and system service events into a unified audit page", () => {
  const database = openDatabase(":memory:");

  database
    .prepare(`
      INSERT INTO host_integration_events (
        app_code, action, config_path, backup_path, integration_state, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      "codex",
      "apply",
      "/tmp/codex.toml",
      "/tmp/codex.bak",
      "managed",
      "Managed config applied for codex",
      "2026-03-21T06:20:00.000Z"
    );

  database
    .prepare(`
      INSERT INTO provider_health_events (
        provider_id, trigger, status, status_code, probe_url, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      "provider-a",
      "manual",
      "unhealthy",
      503,
      "http://provider-a.test/v1/models",
      "Recovery probe failed with status 503",
      "2026-03-21T06:21:00.000Z"
    );

  database
    .prepare(`
      INSERT INTO proxy_request_logs (
        app_code, provider_id, workspace_id, session_id, prompt_template_id, skill_id,
        target_url, method, path, status_code, latency_ms, outcome, decision_reason, next_provider_id, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      "claude-code",
      "provider-b",
      "workspace-alpha",
      "session-beta",
      "prompt-core",
      "skill-review",
      "http://provider-b.test/v1/messages",
      "POST",
      "/v1/messages",
      401,
      180,
      "error",
      "auth",
      null,
      "Upstream returned 401",
      "2026-03-21T06:22:00.000Z"
    );

  database
    .prepare(`
      INSERT INTO mcp_events (
        app_code, action, target_type, target_id, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      "codex",
      "import",
      "host-sync",
      "codex",
      "Imported MCP config from codex host settings",
      "2026-03-21T06:23:00.000Z"
    );

  database
    .prepare(`
      INSERT INTO quota_events (
        app_code, decision, reason, requests_used, tokens_used, window_started_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      "codex",
      "rejected",
      "Token quota exceeded for codex: 1200/1000 in current day",
      8,
      1200,
      "2026-03-21T00:00:00.000Z",
      "2026-03-21T06:24:00.000Z"
    );

  database
    .prepare(`
      INSERT INTO config_snapshots (
        reason, payload_json, created_at
      ) VALUES (?, ?, ?)
    `)
    .run(
      "restore:41",
      JSON.stringify({
        providers: [],
        promptTemplates: [],
        skills: [],
        workspaces: [],
        sessionRecords: [],
        bindings: [],
        appQuotas: [],
        proxyPolicy: {
          listenHost: "127.0.0.1",
          listenPort: 8788,
          enabled: false,
          requestTimeoutMs: 60000,
          failureThreshold: 3
        },
        failoverChains: [],
        mcpServers: [],
        appMcpBindings: []
      }),
      "2026-03-21T06:25:00.000Z"
    );

  database
    .prepare(`
      INSERT INTO system_service_events (
        action, status, message, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `)
    .run(
      "sync-env",
      "success",
      "Service environment file synchronized",
      JSON.stringify({
        envPath: "/Users/demo/.config/ai-cli-switch/daemon.env",
        daemonPort: "8787"
      }),
      "2026-03-21T06:26:00.000Z"
    );

  const service = new AuditEventService(database);
  const page = service.list({
    limit: 10,
    offset: 0
  });
  assert.equal(page.total, 7);
  assert.equal(page.items[0]?.source, "system-service");
  assert.equal(page.items[1]?.source, "config-snapshot");
  assert.equal(page.items[2]?.source, "quota");
  assert.equal(page.items[3]?.source, "mcp");
  assert.equal(page.items[4]?.source, "proxy-request");
  assert.equal(page.items[5]?.source, "provider-health");
  assert.equal(page.items[6]?.source, "host-integration");

  const providerOnly = service.list({
    source: "provider-health",
    providerId: "provider-a",
    limit: 10,
    offset: 0
  });
  assert.equal(providerOnly.total, 1);
  assert.equal(providerOnly.items[0]?.level, "warn");

  const proxyOnly = service.list({
    source: "proxy-request",
    limit: 10,
    offset: 0
  });
  assert.equal(proxyOnly.total, 1);
  assert.equal(proxyOnly.items[0]?.metadata.workspaceId, "workspace-alpha");
  assert.equal(proxyOnly.items[0]?.metadata.sessionId, "session-beta");
  assert.equal(proxyOnly.items[0]?.metadata.promptTemplateId, "prompt-core");
  assert.equal(proxyOnly.items[0]?.metadata.skillId, "skill-review");
  assert.equal(proxyOnly.items[0]?.metadata.decisionReason, "auth");
  assert.equal(proxyOnly.items[0]?.metadata.nextProviderId, null);

  const appOnly = service.list({
    appCode: "codex",
    limit: 10,
    offset: 0
  });
  assert.equal(appOnly.total, 3);
  assert.equal(appOnly.items[0]?.source, "quota");

  const snapshotOnly = service.list({
    source: "config-snapshot",
    limit: 10,
    offset: 0
  });
  assert.equal(snapshotOnly.total, 1);
  assert.equal(snapshotOnly.items[0]?.level, "warn");

  const systemOnly = service.list({
    source: "system-service",
    limit: 10,
    offset: 0
  });
  assert.equal(systemOnly.total, 1);
  assert.equal(systemOnly.items[0]?.metadata.envPath, "/Users/demo/.config/ai-cli-switch/daemon.env");

  database.close();
});
