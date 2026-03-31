import { Transform, type TransformCallback } from "node:stream";

interface OpenAiStreamChunk {
  readonly id?: string;
  readonly model?: string;
  readonly usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  readonly choices?: Array<{
    index?: number;
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

export interface BridgedStreamUsageSnapshot {
  readonly model: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

const toSseEvent = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const mapStopReason = (finishReason: string | null | undefined): string => {
  if (finishReason === "length") {
    return "max_tokens";
  }

  if (finishReason === "tool_calls") {
    return "tool_use";
  }

  return "end_turn";
};

export const convertOpenAiChunkToAnthropicEvents = (
  rawLine: string,
  context: {
    readonly fallbackModel: string;
    readonly fallbackMessageId: string;
  },
  state: {
    started: boolean;
    contentOpened: boolean;
    contentType: "text" | "tool_use" | null;
    currentIndex: number;
    stopped: boolean;
    pendingStopReason: string | null;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    toolStates: Map<number, { id: string; name: string }>;
  }
): string[] => {
  const trimmed = rawLine.trim();
  if (!trimmed.startsWith("data:")) {
    return [];
  }

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") {
    const events: string[] = [];
    if (state.contentOpened) {
      events.push(
        toSseEvent("content_block_stop", {
          type: "content_block_stop",
          index: state.currentIndex
        })
      );
      state.contentOpened = false;
      state.contentType = null;
    }
    if (!state.stopped) {
      events.push(
        toSseEvent("message_delta", {
          type: "message_delta",
          delta: {
            stop_reason: state.pendingStopReason ?? "end_turn",
            stop_sequence: null
          },
          usage: {
            output_tokens: state.outputTokens
          }
        })
      );
      events.push(
        toSseEvent("message_stop", {
          type: "message_stop"
        })
      );
      state.stopped = true;
    }
    return events;
  }

  const chunk = JSON.parse(payload) as OpenAiStreamChunk;
  if (typeof chunk.model === "string" && chunk.model.length > 0) {
    state.model = chunk.model;
  }
  if (chunk.usage !== undefined) {
    state.inputTokens = Math.max(0, Math.trunc(chunk.usage.prompt_tokens ?? state.inputTokens));
    state.outputTokens = Math.max(0, Math.trunc(chunk.usage.completion_tokens ?? state.outputTokens));
  }
  const choice = chunk.choices?.[0];
  const events: string[] = [];

  if (!state.started) {
    events.push(
      toSseEvent("message_start", {
        type: "message_start",
        message: {
          id: chunk.id?.startsWith("msg_") ? chunk.id : context.fallbackMessageId,
          type: "message",
          role: "assistant",
          model: context.fallbackModel,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0
          }
        }
      })
    );
    state.started = true;
  }

  const deltaText = choice?.delta?.content ?? "";
  if (deltaText.length > 0) {
    if (!state.contentOpened || state.contentType !== "text") {
      if (state.contentOpened) {
        events.push(
          toSseEvent("content_block_stop", {
            index: state.currentIndex
          })
        );
      }
      state.currentIndex = 0;
      events.push(
      toSseEvent("content_block_start", {
        type: "content_block_start",
        index: state.currentIndex,
        content_block: {
          type: "text",
            text: ""
          }
        })
      );
      state.contentOpened = true;
      state.contentType = "text";
    }

    events.push(
      toSseEvent("content_block_delta", {
        type: "content_block_delta",
        index: state.currentIndex,
        delta: {
          type: "text_delta",
          text: deltaText
        }
      })
    );
  }

  for (const toolCall of choice?.delta?.tool_calls ?? []) {
    const toolIndex = toolCall.index ?? 0;
    const toolState =
      state.toolStates.get(toolIndex) ?? {
        id: toolCall.id ?? "",
        name: toolCall.function?.name ?? "tool"
      };
    if (toolCall.id) {
      toolState.id = toolCall.id;
    }
    if (toolCall.function?.name) {
      toolState.name = toolCall.function.name;
    }
    state.toolStates.set(toolIndex, toolState);

    if (!state.contentOpened || state.contentType !== "tool_use" || state.currentIndex !== toolIndex) {
      if (state.contentOpened) {
        events.push(
          toSseEvent("content_block_stop", {
            type: "content_block_stop",
            index: state.currentIndex
          })
        );
      }
      state.currentIndex = toolIndex;
      events.push(
        toSseEvent("content_block_start", {
          type: "content_block_start",
          index: toolIndex,
          content_block: {
            type: "tool_use",
            id: toolState.id || `toolu_${toolIndex}`,
            name: toolState.name,
            input: {}
          }
        })
      );
      state.contentOpened = true;
      state.contentType = "tool_use";
    }

    const partialArguments = toolCall.function?.arguments ?? "";
    if (partialArguments.length > 0) {
      events.push(
        toSseEvent("content_block_delta", {
          type: "content_block_delta",
          index: toolIndex,
          delta: {
            type: "input_json_delta",
            partial_json: partialArguments
          }
        })
      );
    }
  }

  if (choice?.finish_reason !== undefined && choice.finish_reason !== null) {
    if (state.contentOpened) {
      events.push(
        toSseEvent("content_block_stop", {
          type: "content_block_stop",
          index: state.currentIndex
        })
      );
      state.contentOpened = false;
      state.contentType = null;
    }
    state.pendingStopReason = mapStopReason(choice.finish_reason);
  }

  return events;
};

export class AnthropicSseBridgeTransform extends Transform {
  private buffer = "";
  private readonly state = {
    started: false,
    contentOpened: false,
    contentType: null as "text" | "tool_use" | null,
    currentIndex: 0,
    stopped: false,
    pendingStopReason: null as string | null,
    model: null as string | null,
    inputTokens: 0,
    outputTokens: 0,
    toolStates: new Map<number, { id: string; name: string }>()
  };

  constructor(
    private readonly context: {
      readonly fallbackModel: string;
      readonly fallbackMessageId: string;
    }
  ) {
    super();
  }

  override _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.buffer += chunk.toString();

    let separatorIndex = this.buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const eventBlock = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);

      const lines = eventBlock
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        const events = convertOpenAiChunkToAnthropicEvents(line, this.context, this.state);
        for (const event of events) {
          this.push(event);
        }
      }

      separatorIndex = this.buffer.indexOf("\n\n");
    }

    callback();
  }

  override _flush(callback: TransformCallback): void {
    if (this.buffer.trim().length > 0) {
      const lines = this.buffer
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
      for (const line of lines) {
        const events = convertOpenAiChunkToAnthropicEvents(line, this.context, this.state);
        for (const event of events) {
          this.push(event);
        }
      }
    }

    callback();
  }

  getUsageSnapshot(): BridgedStreamUsageSnapshot | null {
    if (this.state.inputTokens === 0 && this.state.outputTokens === 0) {
      return null;
    }

    return {
      model: this.state.model,
      inputTokens: this.state.inputTokens,
      outputTokens: this.state.outputTokens
    };
  }
}
