import test from "node:test";
import assert from "node:assert/strict";

import { AnthropicSseBridgeTransform, convertOpenAiChunkToAnthropicEvents } from "./anthropic-sse-bridge.js";

const toDataLine = (payload: unknown): string => `data: ${JSON.stringify(payload)}`;

test("converts openai text deltas into anthropic SSE events", () => {
  const state = {
    started: false,
    contentOpened: false,
    contentType: null,
    currentIndex: 0,
    stopped: false,
    pendingStopReason: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    toolStates: new Map()
  };
  const context = {
    fallbackModel: "claude-3-7-sonnet",
    fallbackMessageId: "msg_test"
  };

  const first = convertOpenAiChunkToAnthropicEvents(
    'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
    context,
    state
  );
  const second = convertOpenAiChunkToAnthropicEvents(
    'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}',
    context,
    state
  );
  const done = convertOpenAiChunkToAnthropicEvents("data: [DONE]", context, state);

  assert.equal(first.length, 3);
  assert.match(first[0] ?? "", /event: message_start/);
  assert.match(first[1] ?? "", /event: content_block_start/);
  assert.match(first[1] ?? "", /"type":"content_block_start"/);
  assert.match(first[2] ?? "", /Hello/);

  assert.equal(second.length, 2);
  assert.match(second[0] ?? "", /world/);
  assert.match(second[1] ?? "", /content_block_stop/);
  assert.match(second[1] ?? "", /"type":"content_block_stop"/);

  assert.equal(done.length, 2);
  assert.match(done[0] ?? "", /message_delta/);
  assert.match(done[1] ?? "", /message_stop/);
  assert.match(done[0] ?? "", /"type":"message_delta"/);
  assert.match(done[1] ?? "", /"type":"message_stop"/);
});

test("converts openai tool call deltas into anthropic tool_use SSE events", () => {
  const state = {
    started: false,
    contentOpened: false,
    contentType: null,
    currentIndex: 0,
    stopped: false,
    pendingStopReason: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    toolStates: new Map()
  };
  const context = {
    fallbackModel: "claude-3-7-sonnet",
    fallbackMessageId: "msg_test"
  };

  const first = convertOpenAiChunkToAnthropicEvents(
    toDataLine({
      id: "chatcmpl-1",
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_123",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: "{\"city\":\"Sh"
                }
              }
            ]
          }
        }
      ]
    }),
    context,
    state
  );
  const second = convertOpenAiChunkToAnthropicEvents(
    toDataLine({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: "anghai\"}"
                }
              }
            ]
          },
          finish_reason: "tool_calls"
        }
      ]
    }),
    context,
    state
  );

  assert.match(first.join(""), /event: message_start/);
  assert.match(first.join(""), /"type":"tool_use"/);
  assert.match(first.join(""), /"type":"content_block_start"/);
  assert.match(first.join(""), /"partial_json":"\{\\\"city\\\":\\\"Sh"/);
  assert.match(second.join(""), /"partial_json":"anghai\\\"\}"/);
  assert.doesNotMatch(second.join(""), /"stop_reason":"tool_use"/);

  const done = convertOpenAiChunkToAnthropicEvents("data: [DONE]", context, state);
  assert.match(done.join(""), /"stop_reason":"tool_use"/);
  assert.match(done.join(""), /"type":"message_stop"/);
});

test("captures usage from upstream SSE chunks", async () => {
  const transform = new AnthropicSseBridgeTransform({
    fallbackModel: "claude-3-7-sonnet",
    fallbackMessageId: "msg_test"
  });

  transform.write(
    'data: {"id":"chatcmpl-1","model":"gpt-4.1-mini","choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n'
  );
  transform.write(
    'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\n'
  );
  transform.write(
    'data: {"choices":[],"usage":{"prompt_tokens":14,"completion_tokens":6,"total_tokens":20}}\n\n'
  );
  transform.end('data: [DONE]\n\n');

  await new Promise<void>((resolve) => transform.on("finish", () => resolve()));

  assert.deepEqual(transform.getUsageSnapshot(), {
    model: "gpt-4.1-mini",
    inputTokens: 14,
    outputTokens: 6
  });
});

test("converts multiple openai tool call indices into distinct anthropic tool_use blocks", () => {
  const state = {
    started: false,
    contentOpened: false,
    contentType: null,
    currentIndex: 0,
    stopped: false,
    pendingStopReason: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    toolStates: new Map()
  };
  const context = {
    fallbackModel: "claude-3-7-sonnet",
    fallbackMessageId: "msg_test"
  };

  const first = convertOpenAiChunkToAnthropicEvents(
    toDataLine({
      id: "chatcmpl-tools",
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_weather",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: "{\"city\":\"Sh"
                }
              },
              {
                index: 1,
                id: "call_time",
                type: "function",
                function: {
                  name: "get_time",
                  arguments: "{\"zone\":\"A"
                }
              }
            ]
          }
        }
      ]
    }),
    context,
    state
  );
  const second = convertOpenAiChunkToAnthropicEvents(
    toDataLine({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: {
                  arguments: "anghai\"}"
                }
              },
              {
                index: 1,
                function: {
                  arguments: "sia/Shanghai\"}"
                }
              }
            ]
          },
          finish_reason: "tool_calls"
        }
      ]
    }),
    context,
    state
  );
  const done = convertOpenAiChunkToAnthropicEvents("data: [DONE]", context, state);
  const combined = [...first, ...second, ...done].join("");

  assert.match(combined, /"index":0/);
  assert.match(combined, /"index":1/);
  assert.match(combined, /"name":"get_weather"/);
  assert.match(combined, /"name":"get_time"/);
  assert.match(combined, /"partial_json":"\{\\\"city\\\":\\\"Sh"/);
  assert.match(combined, /"partial_json":"\{\\\"zone\\\":\\\"A"/);
  assert.match(combined, /"stop_reason":"tool_use"/);
  assert.match(combined, /"type":"message_stop"/);
});

test("emits final anthropic stop events even when upstream stream has no usage chunk", async () => {
  const transform = new AnthropicSseBridgeTransform({
    fallbackModel: "claude-3-7-sonnet",
    fallbackMessageId: "msg_test"
  });
  const events: string[] = [];
  transform.on("data", (chunk) => {
    events.push(chunk.toString());
  });

  transform.write(
    'data: {"id":"chatcmpl-no-usage","model":"gpt-4.1-mini","choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\n'
  );
  transform.end('data: [DONE]\n\n');

  await new Promise<void>((resolve) => transform.on("finish", () => resolve()));

  const combined = events.join("");
  assert.match(combined, /"type":"message_delta"/);
  assert.match(combined, /"output_tokens":0/);
  assert.match(combined, /"type":"message_stop"/);
  assert.equal(transform.getUsageSnapshot(), null);
});
