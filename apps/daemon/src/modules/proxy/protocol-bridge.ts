import { randomUUID } from "node:crypto";

import type { FastifyRequest } from "fastify";

import type { EffectiveAppContext } from "cc-switch-web-shared";

import type { RuntimeTarget } from "./proxy-runtime-service.js";
import {
  buildResponsesBridgeChatBody,
  buildResponsesBridgeResponseBody,
  shouldBridgeResponsesRequest
} from "./responses-bridge.js";

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
  readonly stream_options?: {
    readonly include_usage?: boolean;
  };
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
  readonly responseProtocol: "openai" | "anthropic" | "responses";
  readonly streamMode: "none" | "anthropic-sse" | "responses-sse";
  readonly localResponse?: {
    readonly statusCode: number;
    readonly contentType: string;
    readonly body: string;
  };
}

export const resolveUpstreamModel = (
  requestedModel: unknown,
  target: Pick<RuntimeTarget, "modelMapping" | "defaultModel">
): string | null => {
  const requested =
    typeof requestedModel === "string" && requestedModel.trim().length > 0
      ? requestedModel.trim()
      : null;

  if (requested !== null) {
    const mapped = target.modelMapping[requested];
    if (typeof mapped === "string" && mapped.trim().length > 0) {
      return mapped.trim();
    }
  }

  if (typeof target.defaultModel === "string" && target.defaultModel.trim().length > 0) {
    return target.defaultModel.trim();
  }

  return requested;
};

const applyModelRewrite = (
  body: Record<string, unknown>,
  target: Pick<RuntimeTarget, "modelMapping" | "defaultModel">
): Record<string, unknown> => {
  if (!("model" in body)) {
    return body;
  }

  const nextModel = resolveUpstreamModel(body.model, target);
  if (nextModel === null || nextModel === body.model) {
    return body;
  }

  return {
    ...body,
    model: nextModel
  };
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

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

    // OpenAI requires tool-result messages to directly follow the assistant
    // message that issued the tool calls, so they must precede any additional
    // user content carried in the same Anthropic turn.
    for (const block of toolResultBlocks) {
      messages.push({
        role: "tool",
        tool_call_id: block.tool_use_id,
        content: extractToolResultText(block)
      });
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

const appendInstruction = (existing: string | undefined, injected: string | null): string | undefined => {
  if (!isNonEmptyString(injected)) {
    return existing;
  }

  if (!isNonEmptyString(existing)) {
    return injected;
  }

  return `${injected}\n\n${existing}`;
};

const injectAnthropicInstruction = (
  body: AnthropicRequestBody,
  context: EffectiveAppContext | null
): AnthropicRequestBody => {
  if (!isNonEmptyString(context?.systemInstruction)) {
    return body;
  }

  if (Array.isArray(body.system)) {
    return {
      ...body,
      system: [
        { type: "text", text: context.systemInstruction },
        ...body.system
      ]
    };
  }

  const nextSystem = appendInstruction(body.system, context.systemInstruction);
  return {
    ...body,
    ...(nextSystem !== undefined ? { system: nextSystem } : {})
  };
};

const injectOpenAiChatInstruction = (
  body: Record<string, unknown>,
  context: EffectiveAppContext | null
): Record<string, unknown> => {
  if (!isNonEmptyString(context?.systemInstruction)) {
    return body;
  }

  const messages = Array.isArray(body.messages) ? [...body.messages] : [];
  const first = messages[0];
  if (
    isJsonRecord(first) &&
    (first.role === "system" || first.role === "developer") &&
    isNonEmptyString(first.content)
  ) {
    messages[0] = {
      ...first,
      content: appendInstruction(first.content, context.systemInstruction) ?? first.content
    };
  } else {
    messages.unshift({
      role: "system",
      content: context.systemInstruction
    });
  }

  return {
    ...body,
    messages
  };
};

const injectResponsesInstruction = (
  body: Record<string, unknown>,
  context: EffectiveAppContext | null
): Record<string, unknown> => {
  if (!isNonEmptyString(context?.systemInstruction)) {
    return body;
  }

  return {
    ...body,
    instructions: appendInstruction(
      isNonEmptyString(body.instructions) ? body.instructions : undefined,
      context.systemInstruction
    )
  };
};

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

const countTextChars = (value: unknown): number =>
  typeof value === "string" ? value.length : 0;

const estimateAnthropicInputTokens = (body: AnthropicRequestBody): number => {
  let chars = 0;

  if (typeof body.system === "string") {
    chars += body.system.length;
  } else if (Array.isArray(body.system)) {
    for (const item of body.system) {
      chars += countTextChars(item.text);
    }
  }

  for (const message of body.messages ?? []) {
    if (typeof message.content === "string") {
      chars += message.content.length;
      continue;
    }

    for (const block of message.content ?? []) {
      if (block.type === "text") {
        chars += block.text.length;
      } else if (block.type === "tool_result") {
        chars += extractToolResultText(block).length;
      } else if (block.type === "tool_use") {
        chars += JSON.stringify(block.input ?? {}).length + block.name.length;
      } else if (block.type === "image") {
        // Anthropic bills roughly (width*height)/750 tokens per image; without
        // decoding dimensions we fall back to a coarse fixed estimate.
        chars += 1_500 * 4;
      }
    }
  }

  for (const tool of body.tools ?? []) {
    chars += tool.name.length;
    chars += countTextChars(tool.description);
    chars += JSON.stringify(tool.input_schema ?? {}).length;
  }

  return Math.max(1, Math.ceil(chars / 4));
};

const isCountTokensPath = (pathSuffix: string): boolean =>
  pathSuffix === "/v1/messages/count_tokens" || pathSuffix === "/messages/count_tokens";

export const buildBridgedRequest = (
  request: FastifyRequest,
  target: RuntimeTarget,
  pathSuffix: string,
  context: EffectiveAppContext | null = null
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

  const isOpenAiFamilyTarget =
    target.providerType === "openai-compatible" || target.providerType === "custom";

  if (isCountTokensPath(pathSuffix) && isOpenAiFamilyTarget) {
    // OpenAI-compatible upstreams do not expose an Anthropic token counting
    // endpoint, so answer locally with an estimate instead of failing with 404.
    return {
      upstreamPath: pathSuffix,
      upstreamBody: null,
      responseProtocol: "anthropic",
      streamMode: "none",
      localResponse: {
        statusCode: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          input_tokens: estimateAnthropicInputTokens(body as unknown as AnthropicRequestBody)
        })
      }
    };
  }

  if (shouldBridgeResponsesRequest(target, pathSuffix)) {
    const responsesBody = body as {
      readonly model?: unknown;
      readonly stream?: unknown;
    };
    const upstreamModel =
      resolveUpstreamModel(responsesBody.model, target) ??
      (typeof responsesBody.model === "string" ? responsesBody.model : "unknown");

    return {
      upstreamPath: "/v1/chat/completions",
      upstreamBody: JSON.stringify(
        buildResponsesBridgeChatBody(body, upstreamModel, context)
      ),
      responseProtocol: "responses",
      streamMode: responsesBody.stream === true ? "responses-sse" : "none"
    };
  }

  const shouldBridgeAnthropicToOpenAi =
    isOpenAiFamilyTarget &&
    (pathSuffix === "/v1/messages" || pathSuffix === "/messages");

  if (!shouldBridgeAnthropicToOpenAi) {
    let nextBody = body;
    if (pathSuffix === "/v1/chat/completions" || pathSuffix === "/chat/completions") {
      nextBody = injectOpenAiChatInstruction(body, context);
    } else if (pathSuffix === "/v1/responses" || pathSuffix === "/responses") {
      nextBody = injectResponsesInstruction(body, context);
    } else if (
      target.providerType === "anthropic" &&
      (pathSuffix === "/v1/messages" ||
        pathSuffix === "/messages" ||
        isCountTokensPath(pathSuffix))
    ) {
      nextBody = isCountTokensPath(pathSuffix)
        ? body
        : (injectAnthropicInstruction(
            body as unknown as AnthropicRequestBody,
            context
          ) as unknown as Record<string, unknown>);
    }

    nextBody = applyModelRewrite(nextBody, target);

    return {
      upstreamPath: pathSuffix,
      upstreamBody: JSON.stringify(nextBody),
      responseProtocol: "openai",
      streamMode: "none"
    };
  }

  const anthropicBody = injectAnthropicInstruction(body as unknown as AnthropicRequestBody, context);

  const tools = toOpenAiTools(anthropicBody);
  const toolChoice = toOpenAiToolChoice(anthropicBody);
  const upstreamBodyBase = {
    model: resolveUpstreamModel(anthropicBody.model, target) ?? anthropicBody.model,
    messages: toOpenAiMessages(anthropicBody),
    stream: anthropicBody.stream === true
  };
  const upstreamBody = {
    ...upstreamBodyBase,
    ...(anthropicBody.stream === true ? { stream_options: { include_usage: true } } : {}),
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

  if (responseProtocol === "responses") {
    return buildResponsesBridgeResponseBody(upstreamBodyText, originalRequestBody);
  }

  const upstream = JSON.parse(upstreamBodyText) as OpenAiChatResponse;
  const requestBody = (isJsonRecord(originalRequestBody) ? (originalRequestBody as unknown) : {}) as AnthropicRequestBody;
  return JSON.stringify(toAnthropicResponse(upstream, requestBody));
};

const mapStatusToAnthropicErrorType = (statusCode: number): string => {
  if (statusCode === 400) {
    return "invalid_request_error";
  }
  if (statusCode === 401) {
    return "authentication_error";
  }
  if (statusCode === 403) {
    return "permission_error";
  }
  if (statusCode === 404) {
    return "not_found_error";
  }
  if (statusCode === 413) {
    return "request_too_large";
  }
  if (statusCode === 429) {
    return "rate_limit_error";
  }
  if (statusCode === 529) {
    return "overloaded_error";
  }
  return "api_error";
};

const extractErrorMessage = (upstreamBodyText: string, statusCode: number): string => {
  const fallback = `Upstream returned ${statusCode}`;
  if (upstreamBodyText.trim().length === 0) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(upstreamBodyText) as {
      readonly message?: unknown;
      readonly error?: { readonly message?: unknown } | string;
    };
    if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error.trim();
    }
    if (
      typeof parsed.error === "object" &&
      parsed.error !== null &&
      typeof parsed.error.message === "string" &&
      parsed.error.message.trim().length > 0
    ) {
      return parsed.error.message.trim();
    }
  } catch {
    return upstreamBodyText.trim();
  }

  return fallback;
};

export const buildBridgedErrorBody = (
  responseProtocol: BridgedRequest["responseProtocol"],
  statusCode: number,
  upstreamBodyText: string
): string => {
  if (responseProtocol !== "anthropic") {
    // OpenAI chat and Responses clients share the same error envelope, so the
    // upstream error can pass through untouched.
    return upstreamBodyText;
  }

  return JSON.stringify({
    type: "error",
    error: {
      type: mapStatusToAnthropicErrorType(statusCode),
      message: extractErrorMessage(upstreamBodyText, statusCode)
    }
  });
};
