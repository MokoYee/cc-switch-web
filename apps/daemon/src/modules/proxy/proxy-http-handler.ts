import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream";
import { Readable } from "node:stream";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppCode } from "@ai-cli-switch/shared";

import type { DaemonRuntime } from "../../bootstrap/runtime.js";
import { AnthropicSseBridgeTransform } from "./anthropic-sse-bridge.js";
import {
  buildBridgedRequest,
  buildBridgedResponseBody
} from "./protocol-bridge.js";

const SUPPORTED_PROVIDER_TYPES = new Set(["openai-compatible", "custom", "anthropic"]);

const readRequestBody = (request: FastifyRequest): BodyInit | null => {
  if (request.body === undefined || request.body === null) {
    return null;
  }

  if (Buffer.isBuffer(request.body) || typeof request.body === "string") {
    return Buffer.isBuffer(request.body) ? new Uint8Array(request.body) : request.body;
  }

  return JSON.stringify(request.body);
};

const sanitizeForwardHeaders = (request: FastifyRequest): Headers => {
  const headers = new Headers();

  for (const [key, rawValue] of Object.entries(request.headers)) {
    if (rawValue === undefined) {
      continue;
    }

    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "host" ||
      lowerKey === "content-length" ||
      lowerKey === "authorization" ||
      lowerKey === "cookie"
    ) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      headers.set(key, rawValue.join(", "));
      continue;
    }

    headers.set(key, rawValue);
  }

  return headers;
};

const buildTargetUrl = (baseUrl: string, suffixPath: string, queryString: string): string => {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  let normalizedSuffix = suffixPath.startsWith("/") ? suffixPath : `/${suffixPath}`;
  if (normalizedBaseUrl.endsWith("/v1") && normalizedSuffix.startsWith("/v1/")) {
    normalizedSuffix = normalizedSuffix.slice(3);
  }
  return `${normalizedBaseUrl}${normalizedSuffix}${queryString}`;
};

const replyWithJsonError = (
  reply: FastifyReply,
  statusCode: number,
  message: string
): FastifyReply =>
  reply.code(statusCode).send({
    message
  });

const isRetryableStatusCode = (statusCode: number): boolean =>
  statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500;

const sendRawStream = (
  reply: FastifyReply,
  source: Readable,
  contentType: string
): void => {
  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader("content-type", contentType);
  reply.raw.setHeader("cache-control", "no-cache");
  reply.raw.setHeader("connection", "keep-alive");
  pipeline(source, reply.raw, () => {
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  });
};

export const registerProxyRoutes = async (
  app: FastifyInstance,
  runtime: DaemonRuntime
): Promise<void> => {
  app.all("/proxy/:appCode/*", async (request, reply) => {
    const { appCode } = request.params as { appCode: string };
    const wildcardPath = (request.params as { "*": string })["*"] ?? "";
    const queryIndex = request.url.indexOf("?");
    const queryString = queryIndex >= 0 ? request.url.slice(queryIndex) : "";
    const pathSuffix = wildcardPath.length > 0 ? `/${wildcardPath}` : "/";
    const startedAt = Date.now();

    const policy = runtime.proxyService.getStatus().policy;
    if (!policy.enabled) {
      runtime.proxyRuntimeService.appendRequestLog({
        appCode: appCode as AppCode,
        providerId: null,
        targetUrl: null,
        method: request.method,
        path: `${pathSuffix}${queryString}`,
        statusCode: 503,
        latencyMs: Date.now() - startedAt,
        outcome: "rejected",
        errorMessage: "Proxy policy is disabled"
      });
      return replyWithJsonError(reply, 503, "Proxy policy is disabled");
    }

    const executionPlan = runtime.proxyRuntimeService.createExecutionPlan(appCode);
    if (executionPlan === null || executionPlan.candidates.length === 0) {
      runtime.proxyRuntimeService.appendRequestLog({
        appCode: appCode as AppCode,
        providerId: null,
        targetUrl: null,
        method: request.method,
        path: `${pathSuffix}${queryString}`,
        statusCode: 404,
        latencyMs: Date.now() - startedAt,
        outcome: "rejected",
        errorMessage: `No binding configured for app: ${appCode}`
      });
      return replyWithJsonError(reply, 404, `No binding configured for app: ${appCode}`);
    }
    let lastErrorMessage = "No candidate provider available";
    let lastStatusCode = 503;

    for (let index = 0; index < executionPlan.candidates.length; index += 1) {
      const target = executionPlan.candidates[index];
      if (target === undefined) {
        continue;
      }

      if (!target.enabled) {
        lastErrorMessage = `Provider disabled: ${target.providerId}`;
        lastStatusCode = 409;
        runtime.proxyRuntimeService.appendRequestLog({
          appCode: target.appCode,
          providerId: target.providerId,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: 409,
          latencyMs: Date.now() - startedAt,
          outcome: "rejected",
          errorMessage: lastErrorMessage
        });
        continue;
      }

      if (!SUPPORTED_PROVIDER_TYPES.has(target.providerType)) {
        lastErrorMessage = `Provider type not supported yet: ${target.providerType}`;
        lastStatusCode = 501;
        runtime.proxyRuntimeService.appendRequestLog({
          appCode: target.appCode,
          providerId: target.providerId,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: 501,
          latencyMs: Date.now() - startedAt,
          outcome: "rejected",
          errorMessage: lastErrorMessage
        });
        continue;
      }

      if (!target.hasCredential) {
        lastErrorMessage = `Provider credential missing: ${target.providerId}`;
        lastStatusCode = 409;
        runtime.proxyRuntimeService.appendRequestLog({
          appCode: target.appCode,
          providerId: target.providerId,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: 409,
          latencyMs: Date.now() - startedAt,
          outcome: "rejected",
          errorMessage: lastErrorMessage
        });
        continue;
      }

      try {
        const bridgedRequest = buildBridgedRequest(request, target, pathSuffix);
        const targetUrl = buildTargetUrl(target.upstreamBaseUrl, bridgedRequest.upstreamPath, queryString);
        const headers = sanitizeForwardHeaders(request);
        headers.set("Authorization", `Bearer ${target.apiKeyPlaintext}`);
        headers.set("x-ai-cli-switch-app", target.appCode);
        headers.set("x-ai-cli-switch-provider", target.providerId);

        const upstreamResponse = await fetch(targetUrl, {
          method: request.method,
          headers,
          body:
            ["GET", "HEAD"].includes(request.method)
              ? null
              : bridgedRequest.upstreamBody ?? readRequestBody(request),
          signal: AbortSignal.timeout(target.timeoutMs)
        });

        if (upstreamResponse.ok || !isRetryableStatusCode(upstreamResponse.status) || !executionPlan.failoverEnabled) {
          if (upstreamResponse.ok) {
            runtime.proxyRuntimeService.recordSuccess(target.providerId);
          }
          runtime.proxyRuntimeService.appendRequestLog({
            appCode: target.appCode,
            providerId: target.providerId,
            targetUrl,
            method: request.method,
            path: `${pathSuffix}${queryString}`,
            statusCode: upstreamResponse.status,
            latencyMs: Date.now() - startedAt,
            outcome: upstreamResponse.ok ? "success" : "error",
            errorMessage: upstreamResponse.ok ? null : `Upstream returned ${upstreamResponse.status}`
          });

          reply.code(upstreamResponse.status);
          upstreamResponse.headers.forEach((value, key) => {
            if (key.toLowerCase() === "content-length") {
              return;
            }

            reply.header(key, value);
          });

          if (upstreamResponse.body === null) {
            reply.send();
            return;
          }

          const contentType = upstreamResponse.headers.get("content-type") ?? "";
          if (contentType.includes("text/event-stream")) {
            if (bridgedRequest.streamMode === "anthropic-sse") {
              sendRawStream(
                reply,
                Readable.fromWeb(upstreamResponse.body as never).pipe(
                  new AnthropicSseBridgeTransform({
                    fallbackModel:
                      typeof request.body === "object" &&
                      request.body !== null &&
                      "model" in request.body &&
                      typeof (request.body as { model?: unknown }).model === "string"
                        ? (request.body as { model: string }).model
                        : "claude-compat",
                    fallbackMessageId: `msg_${randomUUID().replace(/-/g, "")}`
                  })
                ),
                "text/event-stream; charset=utf-8"
              );
              return;
            }
            sendRawStream(
              reply,
              Readable.fromWeb(upstreamResponse.body as never),
              "text/event-stream; charset=utf-8"
            );
            return;
          }

          const upstreamBodyText = await upstreamResponse.text();
          const bodyBuffer = Buffer.from(
            buildBridgedResponseBody(
              bridgedRequest.responseProtocol,
              upstreamBodyText,
              request.body
            )
          );
          if (bridgedRequest.responseProtocol === "anthropic") {
            reply.header("content-type", "application/json; charset=utf-8");
          }
          reply.send(bodyBuffer);
          return;
        }

        lastErrorMessage = `Upstream returned ${upstreamResponse.status}`;
        lastStatusCode = upstreamResponse.status;
        runtime.proxyRuntimeService.recordFailure(
          target.providerId,
          target.cooldownSeconds,
          policy.failureThreshold,
          lastErrorMessage
        );
        runtime.proxyRuntimeService.appendRequestLog({
          appCode: target.appCode,
          providerId: target.providerId,
          targetUrl,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: upstreamResponse.status,
          latencyMs: Date.now() - startedAt,
          outcome: "failover",
          errorMessage: `${lastErrorMessage}; trying next provider`
        });
      } catch (error) {
        lastErrorMessage = error instanceof Error ? error.message : "Proxy request failed";
        lastStatusCode = 502;
        runtime.proxyRuntimeService.recordFailure(
          target.providerId,
          target.cooldownSeconds,
          policy.failureThreshold,
          lastErrorMessage
        );
        runtime.proxyRuntimeService.appendRequestLog({
          appCode: target.appCode,
          providerId: target.providerId,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: lastStatusCode,
          latencyMs: Date.now() - startedAt,
          outcome:
            executionPlan.failoverEnabled && index < executionPlan.candidates.length - 1
              ? "failover"
              : "error",
          errorMessage:
            executionPlan.failoverEnabled &&
            index < executionPlan.candidates.length - 1
              ? `${lastErrorMessage}; trying next provider`
              : lastErrorMessage
        });
      }
    }

    return replyWithJsonError(reply, lastStatusCode, lastErrorMessage);
  });
};
