import test from "node:test";
import assert from "node:assert/strict";

import { convertOpenAiChunkToAnthropicEvents } from "./anthropic-sse-bridge.js";

const toDataLine = (payload: unknown): string => `data: ${JSON.stringify(payload)}`;

test("converts openai text deltas into anthropic SSE events", () => {
  const state = {
    started: false,
    contentOpened: false,
    contentType: null,
    currentIndex: 0,
    stopped: false,
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
  assert.match(first[2] ?? "", /Hello/);

  assert.equal(second.length, 4);
  assert.match(second[0] ?? "", /world/);
  assert.match(second[1] ?? "", /content_block_stop/);
  assert.match(second[2] ?? "", /message_delta/);
  assert.match(second[3] ?? "", /message_stop/);

  assert.equal(done.length, 0);
});

test("converts openai tool call deltas into anthropic tool_use SSE events", () => {
  const state = {
    started: false,
    contentOpened: false,
    contentType: null,
    currentIndex: 0,
    stopped: false,
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
  assert.match(first.join(""), /"partial_json":"\{\\\"city\\\":\\\"Sh"/);
  assert.match(second.join(""), /"partial_json":"anghai\\\"\}"/);
  assert.match(second.join(""), /"stop_reason":"tool_use"/);
});
