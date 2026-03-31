import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { openDatabase } from "../../db/database.js";
import { BindingRepository } from "../bindings/binding-repository.js";
import { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import { ProviderRepository } from "../providers/provider-repository.js";
import { ProxyRuntimeService } from "./proxy-runtime-service.js";
import { registerProxyRoutes, shouldAttemptProxyFailover } from "./proxy-http-handler.js";

const textEncoder = new TextEncoder();

const createProxyTestContext = async (options?: {
  readonly appCode?: "codex" | "claude-code";
  readonly enableFailover?: boolean;
}): Promise<{
  readonly app: ReturnType<typeof Fastify>;
  readonly database: ReturnType<typeof openDatabase>;
  readonly proxyRuntimeService: ProxyRuntimeService;
}> => {
  const appCode = options?.appCode ?? "codex";
  const enableFailover = options?.enableFailover ?? appCode === "codex";
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
    id: `binding-${appCode}`,
    appCode,
    providerId: "provider-primary",
    mode: "managed"
  });
  if (enableFailover) {
    failoverChainRepository.upsert({
      id: `failover-${appCode}`,
      appCode,
      enabled: true,
      providerIds: ["provider-failover"],
      cooldownSeconds: 30,
      maxAttempts: 2
    });
  }

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

test("strips stale encoding headers after bridging claude responses", async () => {
  const context = await createProxyTestContext({
    appCode: "claude-code",
    enableFailover: false
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        model: "gpt-4o-mini",
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "OK"
            }
          }
        ],
        usage: {
          prompt_tokens: 22,
          completion_tokens: 11,
          total_tokens: 33
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          "transfer-encoding": "chunked",
          "x-request-id": "bridge-header-test"
        }
      }
    );

  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/proxy/claude-code/v1/messages?beta=true",
      payload: {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Reply with exactly OK."
              }
            ]
          }
        ]
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-encoding"], undefined);
    assert.equal(response.headers["transfer-encoding"], undefined);
    assert.equal(response.headers["x-request-id"], "bridge-header-test");

    const parsed = JSON.parse(response.body) as {
      content: Array<{ type: string; text: string }>;
    };
    assert.deepEqual(parsed.content, [{ type: "text", text: "OK" }]);
  } finally {
    globalThis.fetch = originalFetch;
    await context.app.close();
    context.database.close();
  }
});

test("bridges claude streaming responses with late usage into anthropic SSE events", async () => {
  const context = await createProxyTestContext({
    appCode: "claude-code",
    enableFailover: false
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            textEncoder.encode(
              'data: {"id":"chatcmpl-stream","model":"gpt-5.4","choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n'
            )
          );
          controller.enqueue(
            textEncoder.encode(
              'data: {"choices":[],"usage":{"prompt_tokens":22,"completion_tokens":11,"total_tokens":33}}\n\n'
            )
          );
          controller.enqueue(textEncoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/event-stream"
        }
      }
    );

  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/proxy/claude-code/v1/messages?beta=true",
      payload: {
        model: "gpt-5.4",
        stream: true,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Reply with exactly OK."
              }
            ]
          }
        ]
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "text/event-stream; charset=utf-8");
    assert.match(response.body, /event: message_start/);
    assert.match(response.body, /"type":"content_block_start"/);
    assert.match(response.body, /"type":"content_block_delta"/);
    assert.match(response.body, /"text":"OK"/);
    assert.match(response.body, /"type":"message_delta"/);
    assert.match(response.body, /"output_tokens":11/);
    assert.match(response.body, /"type":"message_stop"/);

    const usage = context.proxyRuntimeService.listUsageRecords({
      limit: 10,
      offset: 0
    });
    assert.equal(usage.items.length, 1);
    assert.equal(usage.items[0]?.providerId, "provider-primary");
    assert.equal(usage.items[0]?.model, "gpt-5.4");
    assert.equal(usage.items[0]?.inputTokens, 22);
    assert.equal(usage.items[0]?.outputTokens, 11);
    assert.equal(usage.items[0]?.totalTokens, 33);
  } finally {
    globalThis.fetch = originalFetch;
    await context.app.close();
    context.database.close();
  }
});

test("bridges claude tool-use streaming responses with late usage into anthropic SSE events", async () => {
  const context = await createProxyTestContext({
    appCode: "claude-code",
    enableFailover: false
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            textEncoder.encode(
              'data: {"id":"chatcmpl-tool","model":"gpt-5.4","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":\\"Sh"}}]},"finish_reason":null}]}\n\n'
            )
          );
          controller.enqueue(
            textEncoder.encode(
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"anghai\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
            )
          );
          controller.enqueue(
            textEncoder.encode(
              'data: {"choices":[],"usage":{"prompt_tokens":30,"completion_tokens":12,"total_tokens":42}}\n\n'
            )
          );
          controller.enqueue(textEncoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/event-stream"
        }
      }
    );

  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/proxy/claude-code/v1/messages?beta=true",
      payload: {
        model: "gpt-5.4",
        stream: true,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Use a tool."
              }
            ]
          }
        ]
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "text/event-stream; charset=utf-8");
    assert.match(response.body, /event: content_block_start/);
    assert.match(response.body, /"type":"tool_use"/);
    assert.match(response.body, /"name":"get_weather"/);
    assert.match(response.body, /"type":"content_block_delta"/);
    assert.match(response.body, /"partial_json":"\{\\\"city\\\":\\\"Sh"/);
    assert.match(response.body, /"partial_json":"anghai\\\"\}"/);
    assert.match(response.body, /"stop_reason":"tool_use"/);
    assert.match(response.body, /"output_tokens":12/);
    assert.match(response.body, /"type":"message_stop"/);

    const usage = context.proxyRuntimeService.listUsageRecords({
      limit: 10,
      offset: 0
    });
    assert.equal(usage.items.length, 1);
    assert.equal(usage.items[0]?.providerId, "provider-primary");
    assert.equal(usage.items[0]?.model, "gpt-5.4");
    assert.equal(usage.items[0]?.inputTokens, 30);
    assert.equal(usage.items[0]?.outputTokens, 12);
    assert.equal(usage.items[0]?.totalTokens, 42);
  } finally {
    globalThis.fetch = originalFetch;
    await context.app.close();
    context.database.close();
  }
});

test("bridges claude streaming responses without usage chunks and still closes anthropic SSE cleanly", async () => {
  const context = await createProxyTestContext({
    appCode: "claude-code",
    enableFailover: false
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            textEncoder.encode(
              'data: {"id":"chatcmpl-no-usage","model":"gpt-5.4","choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n'
            )
          );
          controller.enqueue(textEncoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "text/event-stream"
        }
      }
    );

  try {
    const response = await context.app.inject({
      method: "POST",
      url: "/proxy/claude-code/v1/messages?beta=true",
      payload: {
        model: "gpt-5.4",
        stream: true,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Reply with exactly OK."
              }
            ]
          }
        ]
      }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "text/event-stream; charset=utf-8");
    assert.match(response.body, /"type":"content_block_delta"/);
    assert.match(response.body, /"type":"message_delta"/);
    assert.match(response.body, /"output_tokens":0/);
    assert.match(response.body, /"type":"message_stop"/);

    const usage = context.proxyRuntimeService.listUsageRecords({
      limit: 10,
      offset: 0
    });
    assert.equal(usage.items.length, 0);
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
