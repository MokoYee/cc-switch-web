import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResponsesBridgeChatBody,
  buildResponsesBridgeResponseBody,
  ResponsesSseBridgeTransform,
  shouldBridgeResponsesRequest
} from "./responses-bridge.js";
import { buildBridgedRequest } from "./protocol-bridge.js";
import type { RuntimeTarget } from "./proxy-runtime-service.js";

const createTarget = (overrides: Partial<RuntimeTarget> = {}): RuntimeTarget => ({
  appCode: "codex",
  mode: "managed",
  providerId: "provider-1",
  providerName: "Provider 1",
  providerType: "openai-compatible",
  enabled: true,
  upstreamBaseUrl: "https://api.deepseek.com/v1",
  hasCredential: true,
  timeoutMs: 30000,
  defaultModel: null,
  modelMapping: {},
  responsesApiMode: "auto",
  proxyBasePath: "/proxy/codex",
  failoverEnabled: false,
  failoverTargets: ["provider-1"],
  maxAttempts: 1,
  cooldownSeconds: 30,
  apiKeyPlaintext: "sk-test",
  ...overrides
});

test("bridges responses requests for third-party openai-compatible upstreams in auto mode", () => {
  assert.equal(shouldBridgeResponsesRequest(createTarget(), "/v1/responses"), true);
  assert.equal(
    shouldBridgeResponsesRequest(
      createTarget({ upstreamBaseUrl: "https://api.openai.com/v1" }),
      "/v1/responses"
    ),
    false
  );
  assert.equal(
    shouldBridgeResponsesRequest(createTarget({ responsesApiMode: "passthrough" }), "/v1/responses"),
    false
  );
  assert.equal(
    shouldBridgeResponsesRequest(
      createTarget({ upstreamBaseUrl: "https://api.openai.com/v1", responsesApiMode: "bridge" }),
      "/v1/responses"
    ),
    true
  );
  assert.equal(shouldBridgeResponsesRequest(createTarget(), "/v1/chat/completions"), false);
  assert.equal(
    shouldBridgeResponsesRequest(createTarget({ providerType: "anthropic" }), "/v1/responses"),
    false
  );
});

test("converts responses input items into chat completion messages", () => {
  const chatBody = buildResponsesBridgeChatBody(
    {
      model: "gpt-5",
      instructions: "You are Codex.",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "list files" }]
        },
        {
          type: "function_call",
          call_id: "call_1",
          name: "shell",
          arguments: "{\"command\":[\"ls\"]}"
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "README.md"
        },
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Done." }]
        }
      ],
      tools: [
        {
          type: "function",
          name: "shell",
          description: "Run a shell command",
          parameters: { type: "object", properties: { command: { type: "array" } } }
        }
      ],
      tool_choice: "auto",
      max_output_tokens: 400,
      stream: false
    },
    "deepseek-chat"
  );

  assert.equal(chatBody.model, "deepseek-chat");
  assert.equal(chatBody.max_tokens, 400);
  assert.equal(chatBody.stream, false);
  assert.deepEqual(chatBody.messages, [
    { role: "system", content: "You are Codex." },
    { role: "user", content: "list files" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "shell", arguments: "{\"command\":[\"ls\"]}" }
        }
      ]
    },
    { role: "tool", tool_call_id: "call_1", content: "README.md" },
    { role: "assistant", content: "Done." }
  ]);
  assert.deepEqual(chatBody.tools, [
    {
      type: "function",
      function: {
        name: "shell",
        description: "Run a shell command",
        parameters: { type: "object", properties: { command: { type: "array" } } }
      }
    }
  ]);
  assert.equal(chatBody.tool_choice, "auto");
});

test("accepts plain string input and image parts", () => {
  const chatBody = buildResponsesBridgeChatBody(
    {
      model: "gpt-5",
      input: "hello world",
      stream: true
    },
    "kimi-k2"
  );

  assert.deepEqual(chatBody.messages, [{ role: "user", content: "hello world" }]);
  assert.equal(chatBody.stream, true);
  assert.deepEqual(chatBody.stream_options, { include_usage: true });

  const multimodal = buildResponsesBridgeChatBody(
    {
      model: "gpt-5",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "what is in this image" },
            { type: "input_image", image_url: "data:image/png;base64,Zm9v" }
          ]
        }
      ]
    },
    "kimi-k2"
  );
  assert.deepEqual(multimodal.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "what is in this image" },
        { type: "image_url", image_url: { url: "data:image/png;base64,Zm9v" } }
      ]
    }
  ]);
});

test("converts chat completion responses back into responses payloads", () => {
  const body = buildResponsesBridgeResponseBody(
    JSON.stringify({
      id: "chatcmpl-1",
      model: "deepseek-chat",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "Running the command.",
            tool_calls: [
              {
                id: "call_9",
                function: { name: "shell", arguments: "{\"command\":[\"pwd\"]}" }
              }
            ]
          }
        }
      ],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
    }),
    { model: "gpt-5" }
  );

  const parsed = JSON.parse(body) as {
    object: string;
    status: string;
    output: Array<Record<string, unknown>>;
    usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  };

  assert.equal(parsed.object, "response");
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.output.length, 2);
  assert.equal(parsed.output[0]?.type, "message");
  const content = parsed.output[0]?.content as Array<{ type: string; text: string }>;
  assert.equal(content[0]?.text, "Running the command.");
  assert.equal(parsed.output[1]?.type, "function_call");
  assert.equal(parsed.output[1]?.call_id, "call_9");
  assert.equal(parsed.output[1]?.name, "shell");
  assert.deepEqual(parsed.usage, {
    input_tokens: 12,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 5,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 17
  } as never);
});

test("marks truncated chat responses as incomplete", () => {
  const body = buildResponsesBridgeResponseBody(
    JSON.stringify({
      id: "chatcmpl-2",
      model: "deepseek-chat",
      choices: [{ finish_reason: "length", message: { content: "partial" } }],
      usage: { prompt_tokens: 3, completion_tokens: 9 }
    }),
    { model: "gpt-5" }
  );

  const parsed = JSON.parse(body) as {
    status: string;
    incomplete_details: { reason: string } | null;
  };
  assert.equal(parsed.status, "incomplete");
  assert.equal(parsed.incomplete_details?.reason, "max_output_tokens");
});

test("buildBridgedRequest routes responses calls through the chat bridge", () => {
  const request = {
    body: {
      model: "gpt-5",
      input: "hi",
      stream: true
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const target = createTarget({ modelMapping: { "gpt-5": "deepseek-chat" } });
  const result = buildBridgedRequest(request, target, "/v1/responses");
  assert.equal(result.upstreamPath, "/v1/chat/completions");
  assert.equal(result.responseProtocol, "responses");
  assert.equal(result.streamMode, "responses-sse");
  const parsed = JSON.parse(result.upstreamBody ?? "{}") as { model: string };
  assert.equal(parsed.model, "deepseek-chat");
});

test("passes responses through untouched for official openai upstreams", () => {
  const request = {
    body: {
      model: "gpt-5",
      input: "hi"
    }
  } as Parameters<typeof buildBridgedRequest>[0];

  const target = createTarget({ upstreamBaseUrl: "https://api.openai.com/v1" });
  const result = buildBridgedRequest(request, target, "/v1/responses");
  assert.equal(result.upstreamPath, "/v1/responses");
  assert.equal(result.responseProtocol, "openai");
  assert.equal(result.streamMode, "none");
});

const collectSseEvents = async (
  transform: ResponsesSseBridgeTransform,
  chunks: string[]
): Promise<Array<{ event: string; data: Record<string, unknown> }>> => {
  const output: string[] = [];
  transform.on("data", (chunk: Buffer) => {
    output.push(chunk.toString());
  });

  for (const chunk of chunks) {
    transform.write(chunk);
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    transform.end((error?: Error | null) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise();
    });
  });

  return output
    .join("")
    .split("\n\n")
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const eventLine = block.split("\n").find((line) => line.startsWith("event:")) ?? "event:";
      const dataLine = block.split("\n").find((line) => line.startsWith("data:")) ?? "data: {}";
      return {
        event: eventLine.slice(6).trim(),
        data: JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>
      };
    });
};

test("bridges chat sse chunks into responses sse events for text output", async () => {
  const transform = new ResponsesSseBridgeTransform({ fallbackModel: "gpt-5" });
  const events = await collectSseEvents(transform, [
    `data: ${JSON.stringify({
      id: "chatcmpl-3",
      model: "deepseek-chat",
      choices: [{ delta: { content: "Hel" } }]
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ delta: { content: "lo" } }]
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 2 }
    })}\n\n`,
    "data: [DONE]\n\n"
  ]);

  const eventNames = events.map((item) => item.event);
  assert.deepEqual(eventNames.slice(0, 4), [
    "response.created",
    "response.in_progress",
    "response.output_item.added",
    "response.content_part.added"
  ]);
  assert.ok(eventNames.includes("response.output_text.delta"));
  assert.ok(eventNames.includes("response.output_text.done"));
  assert.ok(eventNames.includes("response.output_item.done"));
  assert.equal(eventNames[eventNames.length - 1], "response.completed");

  const textDone = events.find((item) => item.event === "response.output_text.done");
  assert.equal(textDone?.data.text, "Hello");

  const completed = events.find((item) => item.event === "response.completed");
  const response = completed?.data.response as {
    status: string;
    model: string;
    output: Array<Record<string, unknown>>;
    usage: { input_tokens: number; output_tokens: number };
  };
  assert.equal(response.status, "completed");
  assert.equal(response.model, "deepseek-chat");
  assert.equal(response.usage.input_tokens, 4);
  assert.equal(response.usage.output_tokens, 2);
  const messageContent = response.output[0]?.content as Array<{ text: string }>;
  assert.equal(messageContent[0]?.text, "Hello");

  const usage = transform.getUsageSnapshot();
  assert.equal(usage?.inputTokens, 4);
  assert.equal(usage?.outputTokens, 2);
});

test("bridges chat sse tool call chunks into responses function call events", async () => {
  const transform = new ResponsesSseBridgeTransform({ fallbackModel: "gpt-5" });
  const events = await collectSseEvents(transform, [
    `data: ${JSON.stringify({
      id: "chatcmpl-4",
      model: "deepseek-chat",
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: "call_7", function: { name: "shell", arguments: "{\"comm" } }
            ]
          }
        }
      ]
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: "and\":[\"ls\"]}" } }]
          }
        }
      ]
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 8, completion_tokens: 3 }
    })}\n\n`,
    "data: [DONE]\n\n"
  ]);

  const added = events.find((item) => item.event === "response.output_item.added");
  const addedItem = added?.data.item as { type: string; call_id: string; name: string };
  assert.equal(addedItem.type, "function_call");
  assert.equal(addedItem.call_id, "call_7");
  assert.equal(addedItem.name, "shell");

  const argumentsDone = events.find((item) => item.event === "response.function_call_arguments.done");
  assert.equal(argumentsDone?.data.arguments, "{\"command\":[\"ls\"]}");

  const itemDone = events.find((item) => item.event === "response.output_item.done");
  const doneItem = itemDone?.data.item as { arguments: string; status: string };
  assert.equal(doneItem.arguments, "{\"command\":[\"ls\"]}");
  assert.equal(doneItem.status, "completed");

  const completed = events.find((item) => item.event === "response.completed");
  const response = completed?.data.response as { output: Array<{ type: string }> };
  assert.equal(response.output[0]?.type, "function_call");
});
