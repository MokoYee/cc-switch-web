import { randomUUID } from "node:crypto";

import type { FastifyRequest } from "fastify";

import type { RuntimeTarget } from "./proxy-runtime-service.js";

export class UnsupportedBridgeFeatureError extends Error {}

interface AnthropicTextBlock {
  readonly type: "text";
  readonly text: string;
}

interface AnthropicToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

interface AnthropicToolResultBlock {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly content: string | Array<{ type: string; text?: string }>;
}

interface AnthropicImageBlock {
  readonly type: "image";
  readonly source?: {
    readonly type?: string;
    readonly media_type?: string;
    readonly data?: string;
  };
}

interface AnthropicThinkingBlock {
  readonly type: "thinking" | "redacted_thinking";
  readonly thinking?: string;
}

interface AnthropicMessageInput {
  readonly role: "user" | "assistant";
  readonly content:
    | string
    | Array<
        | AnthropicTextBlock
        | AnthropicToolUseBlock
        | AnthropicToolResultBlock
        | AnthropicImageBlock
        | AnthropicThinkingBlock
      >;
}

interface AnthropicRequestBody {
  readonly model: string;
  readonly system?: string | Array<{ type?: string; text?: string }>;
  readonly messages: AnthropicMessageInput[];
  readonly max_tokens?: number;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly stop_sequences?: string[];
  readonly stream?: boolean;
  readonly tools?: Array<{
    name: string;
    description?: string;
    input_schema?: unknown;
  }>;
  readonly tool_choice?: { type?: string; name?: string };
}

interface OpenAiChatRequestBody {
  readonly model: string;
  readonly messages: Array<Record<string, unknown>>;
  readonly max_tokens?: number;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly stop?: string[];
  readonly stream?: boolean;
  readonly tools?: Array<Record<string, unknown>>;
  readonly tool_choice?: string | Record<string, unknown>;
}

interface OpenAiChatResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: Array<{
    finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
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
  };
}

export interface BridgedRequest {
  readonly upstreamPath: string;
  readonly upstreamBody: string | null;
  readonly responseProtocol: "openai" | "anthropic";
  readonly streamMode: "none" | "anthropic-sse";
}

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return "";
};

const extractToolResultText = (block: AnthropicToolResultBlock): string => {
  if (typeof block.content === "string") {
    return block.content;
  }

  return block.content
    .map((item) => (item.type === "text" ? item.text ?? "" : ""))
    .filter((item) => item.length > 0)
    .join("\n");
};

const extractAnthropicTextContent = (content: AnthropicMessageInput["content"]): string => {
  if (typeof content === "string") {
    return content;
  }

  const chunks: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      chunks.push(block.text);
      continue;
    }

    if (block.type === "tool_result") {
      chunks.push(extractToolResultText(block));
    }
  }

  return chunks.join("\n").trim();
};

const toOpenAiMessages = (body: AnthropicRequestBody): OpenAiChatRequestBody["messages"] => {
  const messages: OpenAiChatRequestBody["messages"] = [];

  if (typeof body.system === "string" && body.system.trim().length > 0) {
    messages.push({
      role: "system",
      content: body.system
    });
  } else if (Array.isArray(body.system)) {
    const systemText = body.system
      .map((item) => (item.type === undefined || item.type === "text" ? normalizeText(item.text) : ""))
      .filter((item) => item.length > 0)
      .join("\n")
      .trim();
    if (systemText.length > 0) {
      messages.push({
        role: "system",
        content: systemText
      });
    }
  }

  for (const message of body.messages) {
    if (typeof message.content === "string") {
      messages.push({
        role: message.role,
        content: message.content
      });
      continue;
    }

    const textBlocks = message.content.filter(
      (block): block is AnthropicTextBlock => block.type === "text"
    );
    const toolUseBlocks = message.content.filter(
      (block): block is AnthropicToolUseBlock => block.type === "tool_use"
    );
    const toolResultBlocks = message.content.filter(
      (block): block is AnthropicToolResultBlock => block.type === "tool_result"
    );
    const imageBlocks = message.content.filter(
      (block): block is AnthropicImageBlock => block.type === "image"
    );

    const textContent = textBlocks.map((block) => block.text).join("\n").trim();
    const multimodalContent: Array<Record<string, unknown>> = [];
    if (textContent.length > 0) {
      multimodalContent.push({
        type: "text",
        text: textContent
      });
    }
    for (const block of imageBlocks) {
      const source = block.source;
      if (
        source?.type === "base64" &&
        typeof source.media_type === "string" &&
        typeof source.data === "string" &&
        source.data.length > 0
      ) {
        multimodalContent.push({
          type: "image_url",
          image_url: {
            url: `data:${source.media_type};base64,${source.data}`
          }
        });
      }
    }

    if (toolUseBlocks.length > 0) {
      const assistantRecord: Record<string, unknown> = {
        role: "assistant",
        content: textContent.length > 0 ? textContent : null,
        tool_calls: toolUseBlocks.map((block) => ({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {})
          }
        }))
      };
      messages.push(assistantRecord);
    } else if (multimodalContent.length > 0) {
      messages.push({
        role: message.role,
        content: multimodalContent.length === 1 && multimodalContent[0]?.type === "text"
          ? multimodalContent[0].text
          : multimodalContent
      });
    }

    for (const block of toolResultBlocks) {
      messages.push({
        role: "tool",
        tool_call_id: block.tool_use_id,
        content: extractToolResultText(block)
      });
    }
  }

  return messages;
};

const toOpenAiTools = (body: AnthropicRequestBody): OpenAiChatRequestBody["tools"] | undefined => {
  if (!Array.isArray(body.tools) || body.tools.length === 0) {
    return undefined;
  }

  return body.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.input_schema ?? {
        type: "object",
        properties: {}
      }
    }
  }));
};

const toOpenAiToolChoice = (
  body: AnthropicRequestBody
): OpenAiChatRequestBody["tool_choice"] | undefined => {
  const type = body.tool_choice?.type;
  if (type === undefined) {
    return undefined;
  }

  if (type === "auto") {
    return "auto";
  }

  if (type === "any") {
    return "required";
  }

  if (type === "tool" && body.tool_choice?.name) {
    return {
      type: "function",
      function: {
        name: body.tool_choice.name
      }
    };
  }

  return undefined;
};

const mapFinishReason = (reason: string | null | undefined): string => {
  if (reason === "length") {
    return "max_tokens";
  }

  if (reason === "tool_calls") {
    return "tool_use";
  }

  return "end_turn";
};

const extractAnthropicModel = (requestBody: AnthropicRequestBody): string =>
  typeof requestBody.model === "string" && requestBody.model.trim().length > 0
    ? requestBody.model
    : "claude-compat";

const toAnthropicResponse = (
  upstream: OpenAiChatResponse,
  requestBody: AnthropicRequestBody
): Record<string, unknown> => {
  const message = upstream.choices?.[0]?.message;
  const textContent = typeof message?.content === "string" ? message.content : "";
  const contentBlocks: Array<Record<string, unknown>> = [];

  if (textContent.length > 0) {
    contentBlocks.push({
      type: "text",
      text: textContent
    });
  }

  for (const toolCall of message?.tool_calls ?? []) {
    let parsedArguments: unknown = {};
    try {
      parsedArguments = JSON.parse(toolCall.function?.arguments ?? "{}");
    } catch {
      parsedArguments = {
        raw: toolCall.function?.arguments ?? ""
      };
    }

    contentBlocks.push({
      type: "tool_use",
      id: toolCall.id ?? `toolu_${randomUUID().replace(/-/g, "")}`,
      name: toolCall.function?.name ?? "tool",
      input: parsedArguments
    });
  }

  if (contentBlocks.length === 0 && textContent.length === 0) {
    contentBlocks.push({
      type: "text",
      text: ""
    });
  }

  return {
    id: upstream.id?.startsWith("msg_") ? upstream.id : `msg_${randomUUID().replace(/-/g, "")}`,
    type: "message",
    role: "assistant",
    model: extractAnthropicModel(requestBody),
    content: contentBlocks,
    stop_reason: mapFinishReason(upstream.choices?.[0]?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: upstream.usage?.prompt_tokens ?? 0,
      output_tokens: upstream.usage?.completion_tokens ?? 0
    }
  };
};

export const buildBridgedRequest = (
  request: FastifyRequest,
  target: RuntimeTarget,
  pathSuffix: string
): BridgedRequest => {
  const body = request.body;
  if (!isJsonRecord(body)) {
    return {
      upstreamPath: pathSuffix,
      upstreamBody: body === undefined || body === null ? null : JSON.stringify(body),
      responseProtocol: "openai",
      streamMode: "none"
    };
  }

  const shouldBridgeAnthropicToOpenAi =
    (target.providerType === "openai-compatible" || target.providerType === "custom") &&
    (pathSuffix === "/v1/messages" || pathSuffix === "/messages");

  if (!shouldBridgeAnthropicToOpenAi) {
    return {
      upstreamPath: pathSuffix,
      upstreamBody: JSON.stringify(body),
      responseProtocol: "openai",
      streamMode: "none"
    };
  }

  const anthropicBody = body as unknown as AnthropicRequestBody;

  const tools = toOpenAiTools(anthropicBody);
  const toolChoice = toOpenAiToolChoice(anthropicBody);
  const upstreamBodyBase = {
    model: anthropicBody.model,
    messages: toOpenAiMessages(anthropicBody),
    stream: anthropicBody.stream === true
  };
  const upstreamBody = {
    ...upstreamBodyBase,
    ...(anthropicBody.max_tokens !== undefined ? { max_tokens: anthropicBody.max_tokens } : {}),
    ...(anthropicBody.temperature !== undefined ? { temperature: anthropicBody.temperature } : {}),
    ...(anthropicBody.top_p !== undefined ? { top_p: anthropicBody.top_p } : {}),
    ...(anthropicBody.stop_sequences !== undefined ? { stop: anthropicBody.stop_sequences } : {}),
    ...(tools !== undefined ? { tools } : {}),
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {})
  } as OpenAiChatRequestBody;

  return {
    upstreamPath: "/v1/chat/completions",
    upstreamBody: JSON.stringify(upstreamBody),
    responseProtocol: "anthropic",
    streamMode: anthropicBody.stream === true ? "anthropic-sse" : "none"
  };
};

export const buildBridgedResponseBody = (
  responseProtocol: BridgedRequest["responseProtocol"],
  upstreamBodyText: string,
  originalRequestBody: unknown
): string => {
  if (responseProtocol === "openai") {
    return upstreamBodyText;
  }

  const upstream = JSON.parse(upstreamBodyText) as OpenAiChatResponse;
  const requestBody = (isJsonRecord(originalRequestBody) ? (originalRequestBody as unknown) : {}) as AnthropicRequestBody;
  return JSON.stringify(toAnthropicResponse(upstream, requestBody));
};
