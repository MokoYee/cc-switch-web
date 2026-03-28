import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

import { nowIso } from "@cc-switch-web/shared";

import { openDatabase } from "../../db/database.js";
import { AppMcpBindingRepository } from "./app-mcp-binding-repository.js";
import { McpEventRepository } from "./mcp-event-repository.js";
import { McpHostSyncService } from "./mcp-host-sync-service.js";
import { McpServerRepository } from "./mcp-server-repository.js";
import { McpService } from "./mcp-service.js";
import { McpVerificationHistoryService } from "./mcp-verification-history-service.js";

const createServices = (rootDir: string) => {
  const dataDir = join(rootDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const database = openDatabase(join(dataDir, "test.sqlite"));
  const serverRepository = new McpServerRepository(database);
  const bindingRepository = new AppMcpBindingRepository(database);
  const eventRepository = new McpEventRepository(database);
  const hostSyncService = new McpHostSyncService({
    dataDir,
    mcpEventRepository: eventRepository
  });
  const mcpService = new McpService(serverRepository, bindingRepository, eventRepository, {
    listHostSyncStates: () => hostSyncService.listSyncStates()
  });

  return {
    database,
    serverRepository,
    bindingRepository,
    historyService: new McpVerificationHistoryService(
      database,
      bindingRepository,
      serverRepository,
      hostSyncService,
      mcpService
    )
  };
};

const insertMcpEvent = (
  database: ReturnType<typeof openDatabase>,
  input: {
    readonly appCode: string | null;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly message: string;
    readonly createdAt: string;
  }
): void => {
  database
    .prepare(
      `
        INSERT INTO mcp_events (app_code, action, target_type, target_id, message, created_at)
        VALUES (@appCode, @action, @targetType, @targetId, @message, @createdAt)
      `
    )
    .run(input);
};

const insertProxyRequestLog = (
  database: ReturnType<typeof openDatabase>,
  input: {
    readonly appCode: string;
    readonly outcome: "success" | "error" | "rejected" | "failover";
    readonly createdAt: string;
  }
): void => {
  database
    .prepare(
      `
        INSERT INTO proxy_request_logs (
          app_code,
          provider_id,
          workspace_id,
          session_id,
          context_source,
          prompt_template_id,
          skill_id,
          target_url,
          method,
          path,
          status_code,
          latency_ms,
          outcome,
          decision_reason,
          next_provider_id,
          error_message,
          created_at
        )
        VALUES (
          @appCode,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          'POST',
          '/v1/responses',
          NULL,
          120,
          @outcome,
          NULL,
          NULL,
          NULL,
          @createdAt
        )
      `
    )
    .run(input);
};

test("builds MCP verification history from database-backed baselines", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-mcp-history-"));
  const { database, serverRepository, bindingRepository, historyService } = createServices(rootDir);

  serverRepository.replaceAll([
    {
      id: "filesystem",
      name: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: [],
      url: null,
      env: {},
      headers: {},
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  ]);
  bindingRepository.replaceAll([
    {
      id: "codex-filesystem",
      appCode: "codex",
      serverId: "filesystem",
      enabled: true,
      updatedAt: nowIso()
    }
  ]);

  insertMcpEvent(database, {
    appCode: "codex",
    action: "import",
    targetType: "host-sync",
    targetId: "codex",
    message: "Imported MCP servers for codex",
    createdAt: "2026-03-27T08:00:00.000Z"
  });
  insertMcpEvent(database, {
    appCode: "codex",
    action: "governance-repair",
    targetType: "host-sync",
    targetId: "codex",
    message: "Applied MCP governance repair for codex",
    createdAt: "2026-03-27T09:00:00.000Z"
  });
  insertProxyRequestLog(database, {
    appCode: "codex",
    outcome: "success",
    createdAt: "2026-03-27T08:20:00.000Z"
  });

  const page = historyService.list("codex", {
    limit: 5,
    offset: 0
  });

  assert.equal(page.total, 2);
  assert.equal(page.items.length, 2);
  assert.equal(page.items[0]?.currentCycle, true);
  assert.equal(page.items[0]?.verificationStatus, "pending-host-sync");
  assert.equal(page.items[1]?.currentCycle, false);
  assert.equal(page.items[1]?.verificationStatus, "verified");
  assert.equal(page.items[1]?.latestSuccessAt, "2026-03-27T08:20:00.000Z");

  rmSync(rootDir, { recursive: true, force: true });
});

test("keeps legacy binding-delete events discoverable for app history", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "cc-switch-web-mcp-history-legacy-"));
  const { database, historyService } = createServices(rootDir);

  insertMcpEvent(database, {
    appCode: null,
    action: "binding-delete",
    targetType: "binding",
    targetId: "codex-filesystem",
    message: "Deleted MCP binding codex-filesystem",
    createdAt: "2026-03-27T07:00:00.000Z"
  });

  const page = historyService.list("codex", {
    limit: 5,
    offset: 0
  });

  assert.equal(page.total, 1);
  assert.equal(page.items[0]?.baselineAction, "binding-delete");
  assert.equal(page.items[0]?.appCode, "codex");

  rmSync(rootDir, { recursive: true, force: true });
});
