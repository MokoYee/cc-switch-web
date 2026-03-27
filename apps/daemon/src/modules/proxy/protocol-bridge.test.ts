import test from "node:test";
import assert from "node:assert/strict";

import { buildBridgedRequest, buildBridgedResponseBody } from "./protocol-bridge.js";
import type { RuntimeTarget } from "./proxy-runtime-service.js";

const createTarget = (providerType: RuntimeTarget["providerType"] = "openai-compatible"): RuntimeTarget => ({
  appCode: "claude-code",
  mode: "managed",
  providerId: "provider-1",
  providerName: "Provider 1",
  providerType,
  enabled: true,
  upstreamBaseUrl: "http://127.0.0.1:18093/v1",
  hasCredential: true,
  timeoutMs: 30000,
  proxyBasePath: "/proxy/claude-code",
  failoverEnabled: false,
  failoverTargets: ["provider-1"],
  maxAttempts: 1,
  cooldownSeconds: 30,
  apiKeyPlaintext: "sk-test"
});

test("bridges anthropic messages request into openai chat completions payload", () => {
  const request = {
    body: {
      model: "claude-3-7-sonnet",
      system: "You are helpful.",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello bridge" }]
        }
      ]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(request, createTarget(), "/v1/messages");
  assert.equal(result.upstreamPath, "/v1/chat/completions");
  assert.equal(result.responseProtocol, "anthropic");

  const parsed = JSON.parse(result.upstreamBody ?? "{}") as {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
  };
  assert.equal(parsed.model, "claude-3-7-sonnet");
  assert.equal(parsed.max_tokens, 256);
  assert.deepEqual(parsed.messages, [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Hello bridge" }
  ]);
});

test("injects active context instruction into openai chat completions requests", () => {
  const request = {
    body: {
      model: "gpt-4.1",
      messages: [{ role: "user", content: "Review this patch" }]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(
    request,
    createTarget("openai-compatible"),
    "/v1/chat/completions",
    {
      appCode: "claude-code",
      source: "active-session",
      activeWorkspaceId: "workspace-api",
      activeSessionId: "session-review",
      provider: {
        id: "provider-1",
        name: "Provider 1",
        bindingMode: "managed",
        source: "session-override",
        missing: false
      },
      promptTemplate: {
        id: "prompt-review",
        name: "Review Prompt",
        locale: "zh-CN",
        source: "workspace-default",
        missing: false,
        content: "请按审查格式输出。",
        enabled: true
      },
      skill: {
        id: "skill-boundary",
        name: "Boundary Checklist",
        source: "workspace-default",
        missing: false,
        promptTemplateId: "prompt-review",
        content: "重点检查边界条件。",
        enabled: true
      },
      systemInstruction: "Prompt Template (zh-CN):\n请按审查格式输出。\n\nSkill:\n重点检查边界条件。",
      warnings: []
    }
  );

  const parsed = JSON.parse(result.upstreamBody ?? "{}") as {
    messages: Array<{ role: string; content: string }>;
  };
  assert.equal(parsed.messages[0]?.role, "system");
  assert.match(parsed.messages[0]?.content ?? "", /Prompt Template/);
  assert.equal(parsed.messages[1]?.role, "user");
});

test("requests upstream stream usage when bridging anthropic streaming", () => {
  const request = {
    body: {
      model: "claude-3-7-sonnet",
      stream: true,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello stream" }]
        }
      ]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(request, createTarget(), "/v1/messages");
  const parsed = JSON.parse(result.upstreamBody ?? "{}") as {
    stream: boolean;
    stream_options?: {
      include_usage?: boolean;
    };
  };

  assert.equal(parsed.stream, true);
  assert.equal(parsed.stream_options?.include_usage, true);
});

test("bridges anthropic tool_use and tool_result into openai tool call messages", () => {
  const request = {
    body: {
      model: "claude-3-7-sonnet",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Weather?" }]
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_123",
              name: "get_weather",
              input: { city: "Shanghai" }
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_123",
              content: "sunny"
            }
          ]
        }
      ]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(request, createTarget(), "/v1/messages");
  const parsed = JSON.parse(result.upstreamBody ?? "{}") as {
    messages: Array<Record<string, unknown>>;
  };

  assert.deepEqual(parsed.messages, [
    { role: "user", content: "Weather?" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "toolu_123",
          type: "function",
          function: {
            name: "get_weather",
            arguments: "{\"city\":\"Shanghai\"}"
          }
        }
      ]
    },
    {
      role: "tool",
      tool_call_id: "toolu_123",
      content: "sunny"
    }
  ]);
});

test("bridges anthropic multimodal image blocks into openai content parts", () => {
  const request = {
    body: {
      model: "claude-3-7-sonnet",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "ZmFrZS1pbWFnZQ=="
              }
            }
          ]
        }
      ]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(request, createTarget(), "/v1/messages");
  const parsed = JSON.parse(result.upstreamBody ?? "{}") as {
    messages: Array<Record<string, unknown>>;
  };

  assert.deepEqual(parsed.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "Describe this image" },
        {
          type: "image_url",
          image_url: {
            url: "data:image/png;base64,ZmFrZS1pbWFnZQ=="
          }
        }
      ]
    }
  ]);
});

test("ignores anthropic thinking blocks when bridging requests", () => {
  const request = {
    body: {
      model: "claude-3-7-sonnet",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "internal scratchpad"
            },
            {
              type: "redacted_thinking"
            },
            {
              type: "text",
              text: "Visible answer"
            }
          ]
        }
      ]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(request, createTarget(), "/v1/messages");
  const parsed = JSON.parse(result.upstreamBody ?? "{}") as {
    messages: Array<Record<string, unknown>>;
  };

  assert.deepEqual(parsed.messages, [
    {
      role: "assistant",
      content: "Visible answer"
    }
  ]);
});

test("bridges openai chat completion response into anthropic message response", () => {
  const upstreamBody = JSON.stringify({
    id: "chatcmpl-test",
    model: "gpt-4.1-mini",
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "bridge-ok"
        }
      }
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 4
    }
  });

  const result = buildBridgedResponseBody("anthropic", upstreamBody, {
    model: "claude-3-7-sonnet",
    messages: [{ role: "user", content: "Hello" }]
  });
  const parsed = JSON.parse(result) as {
    type: string;
    model: string;
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  assert.equal(parsed.type, "message");
  assert.equal(parsed.model, "claude-3-7-sonnet");
  assert.deepEqual(parsed.content, [{ type: "text", text: "bridge-ok" }]);
  assert.deepEqual(parsed.usage, { input_tokens: 12, output_tokens: 4 });
});

test("bridges openai tool calls into anthropic tool_use blocks", () => {
  const upstreamBody = JSON.stringify({
    id: "chatcmpl-test",
    model: "gpt-4.1-mini",
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{\"city\":\"Shanghai\"}"
              }
            }
          ]
        }
      }
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 8
    }
  });

  const result = buildBridgedResponseBody("anthropic", upstreamBody, {
    model: "claude-3-7-sonnet",
    messages: [{ role: "user", content: "Hello" }]
  });
  const parsed = JSON.parse(result) as {
    stop_reason: string;
    content: Array<Record<string, unknown>>;
  };

  assert.equal(parsed.stop_reason, "tool_use");
  assert.deepEqual(parsed.content, [
    {
      type: "tool_use",
      id: "call_123",
      name: "get_weather",
      input: {
        city: "Shanghai"
      }
    }
  ]);
});

test("marks anthropic streaming requests for SSE bridge mode", () => {
  const request = {
    body: {
      model: "claude-3-7-sonnet",
      stream: true,
      messages: [{ role: "user", content: "stream me" }]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(request, createTarget(), "/v1/messages");
  assert.equal(result.upstreamPath, "/v1/chat/completions");
  assert.equal(result.responseProtocol, "anthropic");
  assert.equal(result.streamMode, "anthropic-sse");
});

test("does not bridge anthropic requests for native anthropic providers", () => {
  const request = {
    body: {
      model: "claude-3-7-sonnet",
      messages: [{ role: "user", content: "hello native" }]
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const result = buildBridgedRequest(request, createTarget("anthropic"), "/v1/messages");
  assert.equal(result.upstreamPath, "/v1/messages");
  assert.equal(result.responseProtocol, "openai");
});
