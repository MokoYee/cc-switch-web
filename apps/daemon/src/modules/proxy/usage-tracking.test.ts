import assert from "node:assert/strict";
import test from "node:test";

import { extractUsageFromResponse, UsageTrackingStreamTransform } from "./usage-tracking.js";

test("extracts usage from openai-compatible response", () => {
  const usage = extractUsageFromResponse(
    "openai",
    JSON.stringify({
      model: "gpt-4.1",
      usage: {
        prompt_tokens: 120,
        completion_tokens: 45
      }
    }),
    {
      model: "ignored"
    }
  );

  assert.deepEqual(usage, {
    model: "gpt-4.1",
    inputTokens: 120,
    outputTokens: 45
  });
});

test("extracts usage from bridged anthropic response using request model fallback", () => {
  const usage = extractUsageFromResponse(
    "anthropic",
    JSON.stringify({
      type: "message",
      usage: {
        input_tokens: 64,
        output_tokens: 18
      }
    }),
    {
      model: "claude-sonnet-4-5"
    }
  );

  assert.deepEqual(usage, {
    model: "claude-sonnet-4-5",
    inputTokens: 64,
    outputTokens: 18
  });
});

test("returns null when response body has no usable usage payload", () => {
  assert.equal(
    extractUsageFromResponse(
      "openai",
      JSON.stringify({
        id: "chatcmpl-1"
      }),
      {
        model: "gpt-4.1"
      }
    ),
    null
  );
});

test("tracks usage from openai SSE passthrough stream", async () => {
  const transform = new UsageTrackingStreamTransform({
    model: "gpt-4.1"
  });

  transform.write(
    'data: {"id":"chatcmpl-1","model":"gpt-4.1-mini","choices":[{"delta":{"content":"Hello"}}]}\n\n'
  );
  transform.end(
    'data: {"choices":[],"usage":{"prompt_tokens":30,"completion_tokens":12,"total_tokens":42}}\n\ndata: [DONE]\n\n'
  );

  await new Promise<void>((resolve) => transform.on("finish", () => resolve()));

  assert.deepEqual(transform.getUsageSnapshot(), {
    model: "gpt-4.1-mini",
    inputTokens: 30,
    outputTokens: 12
  });
});

test("tracks usage from anthropic SSE passthrough stream", async () => {
  const transform = new UsageTrackingStreamTransform({
    model: "claude-sonnet-4-5"
  });

  transform.write(
    'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-4-5","usage":{"input_tokens":90,"output_tokens":0}}}\n\n'
  );
  transform.end(
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":21}}\n\n'
  );

  await new Promise<void>((resolve) => transform.on("finish", () => resolve()));

  assert.deepEqual(transform.getUsageSnapshot(), {
    model: "claude-sonnet-4-5",
    inputTokens: 90,
    outputTokens: 21
  });
});
