import type { AppCode } from "cc-switch-web-shared";
import { Transform, type TransformCallback } from "node:stream";

export interface UsageExtractionResult {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface StreamUsageSnapshot {
  readonly model: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readInteger = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
};

const readRequestModel = (requestBody: unknown): string | null => {
  if (!isRecord(requestBody) || typeof requestBody.model !== "string" || requestBody.model.length === 0) {
    return null;
  }

  return requestBody.model;
};

const readChunkModel = (parsed: Record<string, unknown>): string | null => {
  if (typeof parsed.model === "string" && parsed.model.length > 0) {
    return parsed.model;
  }

  const message = isRecord(parsed.message) ? parsed.message : null;
  if (message !== null && typeof message.model === "string" && message.model.length > 0) {
    return message.model;
  }

  return null;
};

const extractUsageFromOpenAiChunk = (parsed: Record<string, unknown>): StreamUsageSnapshot | null => {
  const usage = isRecord(parsed.usage) ? parsed.usage : null;
  if (
    usage === null ||
    (!("prompt_tokens" in usage) && !("completion_tokens" in usage))
  ) {
    return null;
  }

  return {
    model: readChunkModel(parsed),
    inputTokens: readInteger(usage.prompt_tokens),
    outputTokens: readInteger(usage.completion_tokens)
  };
};

const extractUsageFromAnthropicChunk = (parsed: Record<string, unknown>): StreamUsageSnapshot | null => {
  const directUsage = isRecord(parsed.usage) ? parsed.usage : null;
  const message = isRecord(parsed.message) ? parsed.message : null;
  const messageUsage = message !== null && isRecord(message.usage) ? message.usage : null;
  const usage = directUsage ?? messageUsage;
  if (
    usage === null ||
    (!("input_tokens" in usage) && !("output_tokens" in usage))
  ) {
    return null;
  }

  return {
    model: readChunkModel(parsed),
    inputTokens: readInteger(usage.input_tokens),
    outputTokens: readInteger(usage.output_tokens)
  };
};

export const extractUsageFromResponse = (
  responseProtocol: "openai" | "anthropic",
  responseBodyText: string,
  requestBody: unknown
): UsageExtractionResult | null => {
  if (responseBodyText.trim().length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBodyText);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const model =
    typeof parsed.model === "string" && parsed.model.length > 0
      ? parsed.model
      : readRequestModel(requestBody);
  if (model === null) {
    return null;
  }

  const usage = isRecord(parsed.usage) ? parsed.usage : null;
  if (usage === null) {
    return null;
  }

  const inputTokens =
    responseProtocol === "anthropic"
      ? readInteger(usage.input_tokens)
      : readInteger(usage.prompt_tokens);
  const outputTokens =
    responseProtocol === "anthropic"
      ? readInteger(usage.output_tokens)
      : readInteger(usage.completion_tokens);

  if (inputTokens === 0 && outputTokens === 0) {
    return null;
  }

  return {
    model,
    inputTokens,
    outputTokens
  };
};

export interface UsageRecordInput {
  readonly requestLogId: number | null;
  readonly appCode: AppCode;
  readonly providerId: string | null;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export class UsageTrackingStreamTransform extends Transform {
  private buffer = "";
  private model: string | null = null;
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(private readonly requestBody: unknown) {
    super();
  }

  override _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    const text = chunk.toString();
    this.push(chunk);
    this.buffer += text;

    let separatorIndex = this.buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const eventBlock = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      this.captureUsageFromEventBlock(eventBlock);
      separatorIndex = this.buffer.indexOf("\n\n");
    }

    callback();
  }

  override _flush(callback: TransformCallback): void {
    if (this.buffer.trim().length > 0) {
      this.captureUsageFromEventBlock(this.buffer);
    }
    callback();
  }

  getUsageSnapshot(): StreamUsageSnapshot | null {
    if (this.inputTokens === 0 && this.outputTokens === 0) {
      return null;
    }

    return {
      model: this.model ?? readRequestModel(this.requestBody),
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens
    };
  }

  private captureUsageFromEventBlock(eventBlock: string): void {
    const dataLines = eventBlock
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith("data:"));

    for (const line of dataLines) {
      const payload = line.slice(5).trim();
      if (payload.length === 0 || payload === "[DONE]") {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (!isRecord(parsed)) {
        continue;
      }

      const chunkModel = readChunkModel(parsed);
      if (chunkModel !== null) {
        this.model = chunkModel;
      }

      const usage =
        extractUsageFromOpenAiChunk(parsed) ??
        extractUsageFromAnthropicChunk(parsed);
      if (usage === null) {
        continue;
      }

      if (usage.model !== null) {
        this.model = usage.model;
      }
      this.inputTokens = Math.max(this.inputTokens, usage.inputTokens);
      this.outputTokens = Math.max(this.outputTokens, usage.outputTokens);
    }
  }
}
