import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { openDatabase } from "../../db/database.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyRuntimeService } from "./proxy-runtime-service.js";
import { registerProxyRoutes, shouldAttemptProxyFailover } from "./proxy-http-handler.js";

const createProxyTestContext = async (): Promise<{
  readonly app: ReturnType<typeof Fastify>;
  readonly database: ReturnType<typeof openDatabase>;
  readonly proxyRuntimeService: ProxyRuntimeService;
}> => {
  const database = openDatabase(":memory:");
  const providerRepository = new ProviderRepository(database);
  const bindingRepository = new BindingRepository(database);
  const failoverChainRepository = new FailoverChainRepository(database);

  providerRepository.upsert({
    id: "provider-primary",
    name: "Primary Provider",
    providerType: "openai-compatible",
    baseUrl: "https://primary.example.com/v1",
    apiKey: "primary-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  providerRepository.upsert({
    id: "provider-failover",
    name: "Failover Provider",
    providerType: "openai-compatible",
    baseUrl: "https://failover.example.com/v1",
    apiKey: "failover-secret",
    enabled: true,
    timeoutMs: 30_000
  });
  bindingRepository.upsert({
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-primary",
    mode: "managed"
  });
  failoverChainRepository.upsert({
    id: "failover-codex",
    appCode: "codex",
    enabled: true,
    providerIds: ["provider-failover"],
    cooldownSeconds: 30,
    maxAttempts: 2
  });

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
        failureThreshold: 1
      }
    })
  );
  proxyRuntimeService.reload(1);

  const app = Fastify();
  await registerProxyRoutes(
    app,
    {
      proxyService: {
        getStatus: () => ({
          runtimeState: "running",
          policy: {
            listenHost: "127.0.0.1",
            listenPort: 8788,
            enabled: true,
            requestTimeoutMs: 60_000,
            failureThreshold: 1
          }
        })
      },
      proxyRuntimeService,
      activeContextPolicyService: {
        resolveForRequest: (appCode: string) => ({
          appCode,
          source: "none",
          activeWorkspaceId: null,
          activeSessionId: null,
          provider: {
            id: null,
            source: "app-binding"
          },
          promptTemplate: {
            id: null,
            source: "none"
          },
          skill: {
            id: null,
            source: "none"
          },
          warnings: []
        })
      },
      sessionLifecycleService: {
        ensureFromRequest: () => null
      },
      sessionGovernanceService: {
        refreshActivity: () => {}
      },
      appQuotaService: {
        evaluate: () => ({
          allowed: true,
          reason: null,
          requestsUsed: 0,
          tokensUsed: 0,
          windowStartedAt: "2026-03-22T00:00:00.000Z"
        })
      },
      quotaEventRepository: {
        append: () => {}
      }
    } as never
  );

  return {
    app,
    database,
    proxyRuntimeService
  };
};

test("does not fail over auth and invalid-request upstream failures", () => {
  assert.equal(
    shouldAttemptProxyFailover({
      statusCode: 401,
      errorMessage: "Unauthorized",
      responseBody: "{\"error\":{\"message\":\"Invalid API key\"}}"
    }),
    false
  );
  assert.equal(
    shouldAttemptProxyFailover({
      statusCode: 422,
      errorMessage: "Validation failed",
      responseBody: "{\"message\":\"Model not found\"}"
    }),
    false
  );
  assert.equal(
    shouldAttemptProxyFailover({
      statusCode: 409,
      errorMessage: "invalid request payload"
    }),
    false
  );
});

test("fails over rate-limit, timeout, upstream-unavailable, and network failures", () => {
  assert.equal(
    shouldAttemptProxyFailover({
      statusCode: 429,
      errorMessage: "rate limit exceeded"
    }),
    true
  );
  assert.equal(
    shouldAttemptProxyFailover({
      statusCode: 503,
      errorMessage: "service unavailable"
    }),
    true
  );
  assert.equal(
    shouldAttemptProxyFailover({
      statusCode: null,
      errorMessage: "fetch failed"
    }),
    true
  );
  assert.equal(
    shouldAttemptProxyFailover({
      statusCode: null,
      errorMessage: "request timed out"
    }),
    true
  );
});

test("terminates on upstream 401 without failover and records terminal error", async () => {
  const context = await createProxyTestContext();
  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  globalThis.fetch = async () => {
    fetchCallCount += 1;
    return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
      status: 401,
      headers: {
        "content-type": "application/json"
      }
    });
  };

  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/proxy/codex/responses",
      payload: {
        model: "gpt-4.1"
      }
    });

    assert.equal(response.statusCode, 401);
    assert.equal(fetchCallCount, 1);
    assert.match(response.body, /Invalid API key/);

    const logs = context.proxyRuntimeService.listRequestLogs({
      limit: 10,
      offset: 0
    });
    assert.equal(logs.items.length, 1);
    assert.equal(logs.items[0]?.providerId, "provider-primary");
    assert.equal(logs.items[0]?.outcome, "error");
    assert.equal(logs.items[0]?.statusCode, 401);
  } finally {
    globalThis.fetch = originalFetch;
    await context.app.close();
    context.database.close();
  }
});

test("fails over on upstream 503 and succeeds on secondary provider", async () => {
  const context = await createProxyTestContext();
  const originalFetch = globalThis.fetch;
  const calledHosts: string[] = [];
  globalThis.fetch = async (input) => {
    const targetUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calledHosts.push(targetUrl);
    if (targetUrl.includes("primary.example.com")) {
      return new Response(JSON.stringify({ error: { message: "Service unavailable" } }), {
        status: 503,
        headers: {
          "content-type": "application/json"
        }
      });
    }

    return new Response(
      JSON.stringify({
        id: "resp_ok",
        object: "response",
        output: [],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18
        },
        model: "gpt-4.1"
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/proxy/codex/responses",
      payload: {
        model: "gpt-4.1"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(calledHosts.length, 2);
    assert.match(calledHosts[0] ?? "", /primary\.example\.com/);
    assert.match(calledHosts[1] ?? "", /failover\.example\.com/);

    const logs = context.proxyRuntimeService.listRequestLogs({
      limit: 10,
      offset: 0
    });
    assert.equal(logs.items.length, 2);
    assert.equal(logs.items[0]?.providerId, "provider-failover");
    assert.equal(logs.items[0]?.outcome, "success");
    assert.equal(logs.items[1]?.providerId, "provider-primary");
    assert.equal(logs.items[1]?.outcome, "failover");

    const usage = context.proxyRuntimeService.listUsageRecords({
      limit: 10,
      offset: 0
    });
    assert.equal(usage.items.length, 1);
    assert.equal(usage.items[0]?.providerId, "provider-failover");
    assert.equal(usage.items[0]?.totalTokens, 18);
  } finally {
    globalThis.fetch = originalFetch;
    await context.app.close();
    context.database.close();
  }
});

test("fails over on network error and succeeds on secondary provider", async () => {
  const context = await createProxyTestContext();
  const originalFetch = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = async () => {
    attempt += 1;
    if (attempt === 1) {
      throw new Error("fetch failed");
    }

    return new Response(
      JSON.stringify({
        id: "resp_ok",
        object: "response",
        output: [],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 3,
          total_tokens: 8
        },
        model: "gpt-4.1"
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/proxy/codex/responses",
      payload: {
        model: "gpt-4.1"
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(attempt, 2);

    const logs = context.proxyRuntimeService.listRequestLogs({
      limit: 10,
      offset: 0
    });
    assert.equal(logs.items.length, 2);
    assert.equal(logs.items[0]?.outcome, "success");
    assert.equal(logs.items[1]?.outcome, "failover");
    assert.match(logs.items[1]?.errorMessage ?? "", /trying next provider/);
  } finally {
    globalThis.fetch = originalFetch;
    await context.app.close();
    context.database.close();
  }
});
