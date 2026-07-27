import { randomUUID } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";

import type { EffectiveAppContext } from "cc-switch-web-shared";

import type { RuntimeTarget } from "./proxy-runtime-service.js";

interface ResponsesContentPart {
  readonly type?: string;
  readonly text?: string;
  readonly image_url?: string | { url?: string };
  readonly detail?: string;
}

interface ResponsesInputItem {
  readonly type?: string;
  readonly role?: string;
  readonly content?: string | ResponsesContentPart[];
  readonly call_id?: string;
  readonly name?: string;
  readonly arguments?: string;
  readonly output?: unknown;
}

interface ResponsesRequestBody {
  readonly model?: string;
  readonly instructions?: string;
  readonly input?: string | ResponsesInputItem[];
  readonly tools?: Array<Record<string, unknown>>;
  readonly tool_choice?: string | Record<string, unknown>;
  readonly parallel_tool_calls?: boolean;
  readonly max_output_tokens?: number;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly stream?: boolean;
}

interface OpenAiChatResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  readonly usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const generateId = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, "")}`;

const PASSTHROUGH_HOSTS = new Set(["api.openai.com", "chatgpt.com"]);

export const shouldBridgeResponsesRequest = (
  target: Pick<RuntimeTarget, "providerType" | "responsesApiMode" | "upstreamBaseUrl">,
  pathSuffix: string
): boolean => {
  if (target.providerType !== "openai-compatible" && target.providerType !== "custom") {
    return false;
  }

  if (pathSuffix !== "/v1/responses" && pathSuffix !== "/responses") {
    return false;
  }

  if (target.responsesApiMode === "passthrough") {
    return false;
  }

  if (target.responsesApiMode === "bridge") {
    return true;
  }

  // auto: only the official OpenAI endpoint is known to speak the Responses
  // API natively; every other OpenAI-compatible upstream gets the chat bridge.
  try {
    const host = new URL(target.upstreamBaseUrl).hostname.toLowerCase();
    return !PASSTHROUGH_HOSTS.has(host);
  } catch {
    return true;
  }
};

const extractPartText = (part: ResponsesContentPart): string =>
  typeof part.text === "string" ? part.text : "";

const toChatContent = (
  content: string | ResponsesContentPart[] | undefined
): string | Array<Record<string, unknown>> => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
      const text = extractPartText(part);
      if (text.length > 0) {
        parts.push({ type: "text", text });
      }
      continue;
    }

    if (part.type === "input_image") {
      const url =
        typeof part.image_url === "string"
          ? part.image_url
          : isRecord(part.image_url) && typeof part.image_url.url === "string"
            ? part.image_url.url
            : null;
      if (url !== null && url.length > 0) {
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
  }

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1 && parts[0]?.type === "text") {
    return parts[0].text as string;
  }

  return parts;
};

const stringifyFunctionOutput = (output: unknown): string => {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    const texts = output
      .map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : ""))
      .filter((item) => item.length > 0);
    if (texts.length > 0) {
      return texts.join("\n");
    }
  }

  return JSON.stringify(output ?? "");
};

const toChatMessages = (body: ResponsesRequestBody): Array<Record<string, unknown>> => {
  const messages: Array<Record<string, unknown>> = [];

  if (isNonEmptyString(body.instructions)) {
    messages.push({ role: "system", content: body.instructions });
  }

  if (typeof body.input === "string") {
    if (body.input.length > 0) {
      messages.push({ role: "user", content: body.input });
    }
    return messages;
  }

  for (const item of body.input ?? []) {
    const itemType = item.type ?? (typeof item.role === "string" ? "message" : undefined);

    if (itemType === "message") {
      const role =
        item.role === "assistant"
          ? "assistant"
          : item.role === "system" || item.role === "developer"
            ? "system"
            : "user";
      const content = toChatContent(item.content);
      const hasContent = typeof content === "string" ? content.length > 0 : content.length > 0;
      if (hasContent) {
        messages.push({ role, content });
      }
      continue;
    }

    if (itemType === "function_call") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: item.call_id ?? generateId("call"),
            type: "function",
            function: {
              name: item.name ?? "tool",
              arguments: typeof item.arguments === "string" ? item.arguments : "{}"
            }
          }
        ]
      });
      continue;
    }

    if (itemType === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id ?? "",
        content: stringifyFunctionOutput(item.output)
      });
    }

    // reasoning items and other passthrough-only item types carry no
    // information a chat-completions upstream can consume; drop them.
  }

  return messages;
};

const toChatTools = (
  tools: Array<Record<string, unknown>> | undefined
): Array<Record<string, unknown>> | undefined => {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  const converted: Array<Record<string, unknown>> = [];
  for (const tool of tools) {
    if (tool.type !== "function" || !isNonEmptyString(tool.name)) {
      continue;
    }

    converted.push({
      type: "function",
      function: {
        name: tool.name,
        description: typeof tool.description === "string" ? tool.description : "",
        parameters: tool.parameters ?? { type: "object", properties: {} }
      }
    });
  }

  return converted.length > 0 ? converted : undefined;
};

const toChatToolChoice = (
  toolChoice: string | Record<string, unknown> | undefined
): string | Record<string, unknown> | undefined => {
  if (toolChoice === undefined) {
    return undefined;
  }

  if (typeof toolChoice === "string") {
    return toolChoice === "auto" || toolChoice === "none" || toolChoice === "required"
      ? toolChoice
      : undefined;
  }

  if (toolChoice.type === "function" && isNonEmptyString(toolChoice.name)) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }

  return undefined;
};

export const buildResponsesBridgeChatBody = (
  body: ResponsesRequestBody,
  upstreamModel: string,
  context: EffectiveAppContext | null = null
): Record<string, unknown> => {
  const messages = toChatMessages(body);

  if (isNonEmptyString(context?.systemInstruction)) {
    const first = messages[0];
    if (isRecord(first) && first.role === "system" && isNonEmptyString(first.content)) {
      messages[0] = {
        ...first,
        content: `${context.systemInstruction}\n\n${first.content}`
      };
    } else {
      messages.unshift({ role: "system", content: context.systemInstruction });
    }
  }

  const tools = toChatTools(body.tools);
  const toolChoice = toChatToolChoice(body.tool_choice);

  return {
    model: upstreamModel,
    messages,
    stream: body.stream === true,
    ...(body.stream === true ? { stream_options: { include_usage: true } } : {}),
    ...(typeof body.max_output_tokens === "number" ? { max_tokens: body.max_output_tokens } : {}),
    ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
    ...(typeof body.top_p === "number" ? { top_p: body.top_p } : {}),
    ...(typeof body.parallel_tool_calls === "boolean"
      ? { parallel_tool_calls: body.parallel_tool_calls }
      : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {})
  };
};

const buildOutputItems = (
  message: NonNullable<NonNullable<OpenAiChatResponse["choices"]>[number]["message"]> | undefined
): Array<Record<string, unknown>> => {
  const output: Array<Record<string, unknown>> = [];
  const textContent = typeof message?.content === "string" ? message.content : "";

  if (textContent.length > 0) {
    output.push({
      type: "message",
      id: generateId("msg"),
      status: "completed",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: textContent,
          annotations: []
        }
      ]
    });
  }

  for (const toolCall of message?.tool_calls ?? []) {
    output.push({
      type: "function_call",
      id: generateId("fc"),
      status: "completed",
      call_id: toolCall.id ?? generateId("call"),
      name: toolCall.function?.name ?? "tool",
      arguments: toolCall.function?.arguments ?? "{}"
    });
  }

  if (output.length === 0) {
    output.push({
      type: "message",
      id: generateId("msg"),
      status: "completed",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "",
          annotations: []
        }
      ]
    });
  }

  return output;
};

const buildResponseUsage = (usage: OpenAiChatResponse["usage"]): Record<string, unknown> => ({
  input_tokens: Math.max(0, Math.trunc(usage?.prompt_tokens ?? 0)),
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: Math.max(0, Math.trunc(usage?.completion_tokens ?? 0)),
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: Math.max(
    0,
    Math.trunc(usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0))
  )
});

export const buildResponsesBridgeResponseBody = (
  upstreamBodyText: string,
  originalRequestBody: unknown
): string => {
  const upstream = JSON.parse(upstreamBodyText) as OpenAiChatResponse;
  const requestBody = isRecord(originalRequestBody)
    ? (originalRequestBody as ResponsesRequestBody)
    : {};
  const choice = upstream.choices?.[0];
  const truncated = choice?.finish_reason === "length";

  return JSON.stringify({
    id: upstream.id?.startsWith("resp_") ? upstream.id : generateId("resp"),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: truncated ? "incomplete" : "completed",
    incomplete_details: truncated ? { reason: "max_output_tokens" } : null,
    error: null,
    model: upstream.model ?? requestBody.model ?? "unknown",
    output: buildOutputItems(choice?.message),
    parallel_tool_calls: requestBody.parallel_tool_calls ?? true,
    usage: buildResponseUsage(upstream.usage)
  });
};

interface ChatStreamChunk {
  readonly id?: string;
  readonly model?: string;
  readonly usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  readonly choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

export interface ResponsesBridgeUsageSnapshot {
  readonly model: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

interface ToolCallStreamState {
  readonly itemId: string;
  callId: string;
  name: string;
  arguments: string;
  outputIndex: number;
  opened: boolean;
  closed: boolean;
}

const toSseEvent = (event: string, data: Record<string, unknown>): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Converts an OpenAI chat-completions SSE stream into an OpenAI Responses API
 * SSE stream so Codex (wire_api = "responses") can consume chat-only upstreams.
 */
export class ResponsesSseBridgeTransform extends Transform {
  private buffer = "";
  private sequence = 0;
  private started = false;
  private finished = false;
  private nextOutputIndex = 0;
  private messageItemId: string | null = null;
  private messageOutputIndex = 0;
  private messageOpened = false;
  private messageClosed = false;
  private accumulatedText = "";
  private readonly toolStates = new Map<number, ToolCallStreamState>();
  private finishReason: string | null = null;
  private model: string | null = null;
  private inputTokens = 0;
  private outputTokens = 0;
  private readonly responseId: string;

  constructor(private readonly context: { readonly fallbackModel: string }) {
    super();
    this.responseId = generateId("resp");
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
      this.consumeEventBlock(eventBlock);
      separatorIndex = this.buffer.indexOf("\n\n");
    }

    callback();
  }

  override _flush(callback: TransformCallback): void {
    if (this.buffer.trim().length > 0) {
      this.consumeEventBlock(this.buffer);
      this.buffer = "";
    }
    this.emitCompletion();
    callback();
  }

  getUsageSnapshot(): ResponsesBridgeUsageSnapshot | null {
    if (this.inputTokens === 0 && this.outputTokens === 0) {
      return null;
    }

    return {
      model: this.model,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens
    };
  }

  private consumeEventBlock(eventBlock: string): void {
    const lines = eventBlock
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.startsWith("data:"));

    for (const line of lines) {
      const payload = line.slice(5).trim();
      if (payload.length === 0) {
        continue;
      }

      if (payload === "[DONE]") {
        this.emitCompletion();
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

      this.consumeChunk(parsed as ChatStreamChunk);
    }
  }

  private consumeChunk(chunk: ChatStreamChunk): void {
    if (typeof chunk.model === "string" && chunk.model.length > 0) {
      this.model = chunk.model;
    }
    if (chunk.usage !== undefined) {
      this.inputTokens = Math.max(0, Math.trunc(chunk.usage.prompt_tokens ?? this.inputTokens));
      this.outputTokens = Math.max(0, Math.trunc(chunk.usage.completion_tokens ?? this.outputTokens));
    }

    this.ensureStarted();

    const choice = chunk.choices?.[0];
    const deltaText = choice?.delta?.content ?? "";
    if (deltaText.length > 0) {
      this.openMessageItem();
      this.accumulatedText += deltaText;
      this.pushEvent("response.output_text.delta", {
        type: "response.output_text.delta",
        item_id: this.messageItemId ?? "",
        output_index: this.messageOutputIndex,
        content_index: 0,
        delta: deltaText
      });
    }

    for (const toolCall of choice?.delta?.tool_calls ?? []) {
      const toolIndex = toolCall.index ?? 0;
      let state = this.toolStates.get(toolIndex);
      if (state === undefined) {
        this.closeMessageItem();
        state = {
          itemId: generateId("fc"),
          callId: toolCall.id ?? generateId("call"),
          name: toolCall.function?.name ?? "",
          arguments: "",
          outputIndex: this.nextOutputIndex,
          opened: false,
          closed: false
        };
        this.nextOutputIndex += 1;
        this.toolStates.set(toolIndex, state);
      }
      if (typeof toolCall.id === "string" && toolCall.id.length > 0) {
        state.callId = toolCall.id;
      }
      if (isNonEmptyString(toolCall.function?.name) && state.name.length === 0) {
        state.name = toolCall.function.name;
      }

      if (!state.opened) {
        this.pushEvent("response.output_item.added", {
          type: "response.output_item.added",
          output_index: state.outputIndex,
          item: {
            type: "function_call",
            id: state.itemId,
            status: "in_progress",
            call_id: state.callId,
            name: state.name || "tool",
            arguments: ""
          }
        });
        state.opened = true;
      }

      const partialArguments = toolCall.function?.arguments ?? "";
      if (partialArguments.length > 0) {
        state.arguments += partialArguments;
        this.pushEvent("response.function_call_arguments.delta", {
          type: "response.function_call_arguments.delta",
          item_id: state.itemId,
          output_index: state.outputIndex,
          delta: partialArguments
        });
      }
    }

    if (choice?.finish_reason !== undefined && choice.finish_reason !== null) {
      this.finishReason = choice.finish_reason;
    }
  }

  private ensureStarted(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.pushEvent("response.created", {
      type: "response.created",
      response: this.buildResponseSkeleton("in_progress", [])
    });
    this.pushEvent("response.in_progress", {
      type: "response.in_progress",
      response: this.buildResponseSkeleton("in_progress", [])
    });
  }

  private openMessageItem(): void {
    if (this.messageOpened) {
      return;
    }
    this.messageOpened = true;
    this.messageItemId = generateId("msg");
    this.messageOutputIndex = this.nextOutputIndex;
    this.nextOutputIndex += 1;
    this.pushEvent("response.output_item.added", {
      type: "response.output_item.added",
      output_index: this.messageOutputIndex,
      item: {
        type: "message",
        id: this.messageItemId,
        status: "in_progress",
        role: "assistant",
        content: []
      }
    });
    this.pushEvent("response.content_part.added", {
      type: "response.content_part.added",
      item_id: this.messageItemId,
      output_index: this.messageOutputIndex,
      content_index: 0,
      part: {
        type: "output_text",
        text: "",
        annotations: []
      }
    });
  }

  private closeMessageItem(): void {
    if (!this.messageOpened || this.messageClosed) {
      return;
    }
    this.messageClosed = true;
    this.pushEvent("response.output_text.done", {
      type: "response.output_text.done",
      item_id: this.messageItemId ?? "",
      output_index: this.messageOutputIndex,
      content_index: 0,
      text: this.accumulatedText
    });
    this.pushEvent("response.content_part.done", {
      type: "response.content_part.done",
      item_id: this.messageItemId ?? "",
      output_index: this.messageOutputIndex,
      content_index: 0,
      part: {
        type: "output_text",
        text: this.accumulatedText,
        annotations: []
      }
    });
    this.pushEvent("response.output_item.done", {
      type: "response.output_item.done",
      output_index: this.messageOutputIndex,
      item: this.buildMessageItem("completed")
    });
  }

  private closeToolItems(): void {
    const states = Array.from(this.toolStates.values()).sort(
      (left, right) => left.outputIndex - right.outputIndex
    );
    for (const state of states) {
      if (state.closed) {
        continue;
      }
      state.closed = true;
      this.pushEvent("response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: state.itemId,
        output_index: state.outputIndex,
        arguments: state.arguments.length > 0 ? state.arguments : "{}"
      });
      this.pushEvent("response.output_item.done", {
        type: "response.output_item.done",
        output_index: state.outputIndex,
        item: this.buildToolItem(state, "completed")
      });
    }
  }

  private emitCompletion(): void {
    if (this.finished) {
      return;
    }
    this.ensureStarted();
    this.finished = true;
    this.closeMessageItem();
    this.closeToolItems();

    const truncated = this.finishReason === "length";
    this.pushEvent(truncated ? "response.incomplete" : "response.completed", {
      type: truncated ? "response.incomplete" : "response.completed",
      response: {
        ...this.buildResponseSkeleton(truncated ? "incomplete" : "completed", this.buildOutput()),
        ...(truncated ? { incomplete_details: { reason: "max_output_tokens" } } : {}),
        usage: {
          input_tokens: this.inputTokens,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: this.outputTokens,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: this.inputTokens + this.outputTokens
        }
      }
    });
  }

  private buildOutput(): Array<Record<string, unknown>> {
    const output: Array<Record<string, unknown>> = [];
    if (this.messageOpened) {
      output.push(this.buildMessageItem("completed"));
    }
    const states = Array.from(this.toolStates.values()).sort(
      (left, right) => left.outputIndex - right.outputIndex
    );
    for (const state of states) {
      output.push(this.buildToolItem(state, "completed"));
    }
    return output;
  }

  private buildMessageItem(status: string): Record<string, unknown> {
    return {
      type: "message",
      id: this.messageItemId ?? generateId("msg"),
      status,
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: this.accumulatedText,
          annotations: []
        }
      ]
    };
  }

  private buildToolItem(state: ToolCallStreamState, status: string): Record<string, unknown> {
    return {
      type: "function_call",
      id: state.itemId,
      status,
      call_id: state.callId,
      name: state.name || "tool",
      arguments: state.arguments.length > 0 ? state.arguments : "{}"
    };
  }

  private buildResponseSkeleton(
    status: string,
    output: Array<Record<string, unknown>>
  ): Record<string, unknown> {
    return {
      id: this.responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status,
      error: null,
      incomplete_details: null,
      model: this.model ?? this.context.fallbackModel,
      output,
      parallel_tool_calls: true
    };
  }

  private pushEvent(event: string, data: Record<string, unknown>): void {
    this.sequence += 1;
    this.push(toSseEvent(event, { ...data, sequence_number: this.sequence }));
  }
}
