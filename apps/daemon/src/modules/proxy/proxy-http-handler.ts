import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream";
import { Readable } from "node:stream";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppCode, EffectiveAppContext } from "@cc-switch-web/shared";

import type { DaemonRuntime } from "../../bootstrap/runtime.js";
import { AnthropicSseBridgeTransform } from "./anthropic-sse-bridge.js";
import {
  buildBridgedRequest,
  buildBridgedResponseBody
} from "./protocol-bridge.js";
import { extractUsageFromResponse, UsageTrackingStreamTransform } from "./usage-tracking.js";

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
      lowerKey === "cookie" ||
      lowerKey.startsWith("x-ai-cli-switch-")
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

const extractUpstreamErrorMessage = (statusCode: number, responseBody: string): string => {
  const fallbackMessage = `Upstream returned ${statusCode}`;
  if (responseBody.trim().length === 0) {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(responseBody) as {
      readonly message?: unknown;
      readonly error?:
        | {
            readonly message?: unknown;
            readonly code?: unknown;
            readonly type?: unknown;
          }
        | string;
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
    return responseBody.trim();
  }

  return fallbackMessage;
};

const classifyProxyFailure = (
  statusCode: number | null,
  messages: string[]
): {
  readonly disposition: "failover" | "terminate";
  readonly reason:
    | "auth"
    | "invalid-request"
    | "rate-limit"
    | "timeout"
    | "network"
    | "upstream-unavailable"
    | "unknown";
} => {
  const normalized = messages.join(" ").toLowerCase();

  if (
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("authentication") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission denied") ||
    normalized.includes("access token") ||
    normalized.includes("credential")
  ) {
    return {
      disposition: "terminate",
      reason: "auth"
    };
  }

  if (
    normalized.includes("unsupported") ||
    normalized.includes("not supported") ||
    normalized.includes("model not found") ||
    normalized.includes("does not exist") ||
    normalized.includes("invalid request") ||
    normalized.includes("validation")
  ) {
    return {
      disposition: "terminate",
      reason: "invalid-request"
    };
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests")
  ) {
    return {
      disposition: "failover",
      reason: "rate-limit"
    };
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return {
      disposition: "failover",
      reason: "timeout"
    };
  }

  if (
    normalized.includes("network") ||
    normalized.includes("socket") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("fetch failed")
  ) {
    return {
      disposition: "failover",
      reason: "network"
    };
  }

  if (
    normalized.includes("connection refused") ||
    normalized.includes("bad gateway") ||
    normalized.includes("service unavailable")
  ) {
    return {
      disposition: "failover",
      reason: "upstream-unavailable"
    };
  }

  if (statusCode === null) {
    return {
      disposition: "failover",
      reason: "unknown"
    };
  }
  if (statusCode === 408) {
    return {
      disposition: "failover",
      reason: "timeout"
    };
  }
  if (statusCode === 429) {
    return {
      disposition: "failover",
      reason: "rate-limit"
    };
  }
  if (statusCode >= 500) {
    return {
      disposition: "failover",
      reason: "upstream-unavailable"
    };
  }
  if (
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 410 ||
    statusCode === 422
  ) {
    return {
      disposition: "terminate",
      reason: statusCode === 401 || statusCode === 403 ? "auth" : "invalid-request"
    };
  }

  return {
    disposition: statusCode >= 500 ? "failover" : "terminate",
    reason: "unknown"
  };
};

export const shouldAttemptProxyFailover = (input: {
  readonly statusCode: number | null;
  readonly errorMessage?: string | null;
  readonly responseBody?: string | null;
}): boolean =>
  classifyProxyFailure(input.statusCode, [
    input.errorMessage ?? "",
    input.responseBody ?? ""
  ]).disposition === "failover";

const sendRawStream = (
  reply: FastifyReply,
  source: Readable,
  contentType: string,
  onComplete?: () => void
): void => {
  reply.hijack();
  reply.raw.statusCode = 200;
  reply.raw.setHeader("content-type", contentType);
  reply.raw.setHeader("cache-control", "no-cache");
  reply.raw.setHeader("connection", "keep-alive");
  pipeline(source, reply.raw, () => {
    onComplete?.();
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  });
};

const readSingleHeader = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    const first = value.find((item) => item.trim().length > 0);
    return first?.trim() ?? null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

const readRequestContextOverride = (
  request: FastifyRequest
): {
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly cwd: string | null;
} => ({
  workspaceId: readSingleHeader(request.headers["x-ai-cli-switch-workspace"]),
  sessionId: readSingleHeader(request.headers["x-ai-cli-switch-session"]),
  cwd: readSingleHeader(request.headers["x-ai-cli-switch-cwd"])
});

const applyContextHeaders = (headers: Headers, context: EffectiveAppContext): void => {
  headers.set("x-ai-cli-switch-context-source", context.source);
  if (context.activeWorkspaceId !== null) {
    headers.set("x-ai-cli-switch-workspace", context.activeWorkspaceId);
  }
  if (context.activeSessionId !== null) {
    headers.set("x-ai-cli-switch-session", context.activeSessionId);
  }
  if (context.provider.id !== null) {
    headers.set("x-ai-cli-switch-context-provider", context.provider.id);
  }
  if (context.promptTemplate.id !== null) {
    headers.set("x-ai-cli-switch-context-prompt", context.promptTemplate.id);
  }
  if (context.skill.id !== null) {
    headers.set("x-ai-cli-switch-context-skill", context.skill.id);
  }
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
    const requestContextOverride = readRequestContextOverride(request);

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
        decisionReason: "policy-disabled",
        errorMessage: "Proxy policy is disabled"
      });
      return replyWithJsonError(reply, 503, "Proxy policy is disabled");
    }

    let effectiveContext: EffectiveAppContext;
    try {
      effectiveContext = runtime.activeContextPolicyService.resolveForRequest(
        appCode as AppCode,
        requestContextOverride
      );
    } catch (error) {
      runtime.proxyRuntimeService.appendRequestLog({
        appCode: appCode as AppCode,
        providerId: null,
        targetUrl: null,
        method: request.method,
        path: `${pathSuffix}${queryString}`,
        statusCode: 409,
        latencyMs: Date.now() - startedAt,
        outcome: "rejected",
        decisionReason: "context-invalid",
        errorMessage: error instanceof Error ? error.message : "Request context override is invalid"
      });
      return replyWithJsonError(
        reply,
        409,
        error instanceof Error ? error.message : "Request context override is invalid"
      );
    }

    const autoSession = runtime.sessionLifecycleService.ensureFromRequest({
      appCode: appCode as AppCode,
      cwd: requestContextOverride.cwd,
      effectiveContext
    });
    if (autoSession !== null && effectiveContext.activeSessionId === null) {
      effectiveContext = runtime.activeContextPolicyService.resolveForRequest(appCode as AppCode, {
        sessionId: autoSession.id
      });
    }
    runtime.sessionGovernanceService.refreshActivity(effectiveContext);
    const requestLogContextFields = {
      workspaceId: effectiveContext.activeWorkspaceId,
      sessionId: effectiveContext.activeSessionId,
      contextSource: effectiveContext.source,
      promptTemplateId: effectiveContext.promptTemplate.id,
      skillId: effectiveContext.skill.id
    } as const;

    const executionPlan = runtime.proxyRuntimeService.createExecutionPlan(
      appCode,
      effectiveContext.provider.id
    );
    if (executionPlan === null || executionPlan.candidates.length === 0) {
      runtime.proxyRuntimeService.appendRequestLog({
        appCode: appCode as AppCode,
        providerId: null,
        ...requestLogContextFields,
        targetUrl: null,
        method: request.method,
        path: `${pathSuffix}${queryString}`,
        statusCode: 404,
        latencyMs: Date.now() - startedAt,
        outcome: "rejected",
        decisionReason: "no-binding",
        errorMessage: `No binding configured for app: ${appCode}`
      });
      return replyWithJsonError(reply, 404, `No binding configured for app: ${appCode}`);
    }

    const quotaDecision = runtime.appQuotaService.evaluate(appCode as AppCode);
    if (!quotaDecision.allowed) {
      runtime.quotaEventRepository.append({
        appCode: appCode as AppCode,
        decision: "rejected",
        reason: quotaDecision.reason ?? "Quota exceeded",
        requestsUsed: quotaDecision.requestsUsed,
        tokensUsed: quotaDecision.tokensUsed,
        windowStartedAt: quotaDecision.windowStartedAt
      });
      runtime.proxyRuntimeService.appendRequestLog({
        appCode: appCode as AppCode,
        providerId: null,
        ...requestLogContextFields,
        targetUrl: null,
        method: request.method,
        path: `${pathSuffix}${queryString}`,
        statusCode: 429,
        latencyMs: Date.now() - startedAt,
        outcome: "rejected",
        decisionReason: "quota-rejected",
        errorMessage: quotaDecision.reason
      });
      return replyWithJsonError(reply, 429, quotaDecision.reason ?? "Quota exceeded");
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
          ...requestLogContextFields,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: 409,
          latencyMs: Date.now() - startedAt,
          outcome: "rejected",
          decisionReason: "provider-disabled",
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
          ...requestLogContextFields,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: 501,
          latencyMs: Date.now() - startedAt,
          outcome: "rejected",
          decisionReason: "unsupported-provider-type",
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
          ...requestLogContextFields,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: 409,
          latencyMs: Date.now() - startedAt,
          outcome: "rejected",
          decisionReason: "missing-credential",
          errorMessage: lastErrorMessage
        });
        continue;
      }

      try {
        const bridgedRequest = buildBridgedRequest(request, target, pathSuffix, effectiveContext);
        const targetUrl = buildTargetUrl(target.upstreamBaseUrl, bridgedRequest.upstreamPath, queryString);
        const headers = sanitizeForwardHeaders(request);
        headers.set("Authorization", `Bearer ${target.apiKeyPlaintext}`);
        headers.set("x-ai-cli-switch-app", target.appCode);
        headers.set("x-ai-cli-switch-provider", target.providerId);
        applyContextHeaders(headers, effectiveContext);

        const upstreamResponse = await fetch(targetUrl, {
          method: request.method,
          headers,
          body:
            ["GET", "HEAD"].includes(request.method)
              ? null
              : bridgedRequest.upstreamBody ?? readRequestBody(request),
          signal: AbortSignal.timeout(target.timeoutMs)
        });

        if (!upstreamResponse.ok) {
          const upstreamBodyText = await upstreamResponse.text();
          const upstreamErrorMessage = extractUpstreamErrorMessage(
            upstreamResponse.status,
            upstreamBodyText
          );
          const failure = classifyProxyFailure(upstreamResponse.status, [
            upstreamErrorMessage,
            upstreamBodyText
          ]);
          const shouldFailover =
            executionPlan.failoverEnabled &&
            index < executionPlan.candidates.length - 1 &&
            failure.disposition === "failover";

          if (shouldFailover) {
            lastErrorMessage = upstreamErrorMessage;
            lastStatusCode = upstreamResponse.status;
            runtime.proxyRuntimeService.recordFailure(
              target.providerId,
              target.cooldownSeconds,
              policy.failureThreshold,
              upstreamErrorMessage
            );
            runtime.proxyRuntimeService.appendRequestLog({
              appCode: target.appCode,
              providerId: target.providerId,
              ...requestLogContextFields,
              targetUrl,
              method: request.method,
              path: `${pathSuffix}${queryString}`,
              statusCode: upstreamResponse.status,
              latencyMs: Date.now() - startedAt,
              outcome: "failover",
              decisionReason: failure.reason,
              nextProviderId: executionPlan.candidates[index + 1]?.providerId ?? null,
              errorMessage: `${upstreamErrorMessage}; trying next provider`
            });
            continue;
          }

          const requestLog = runtime.proxyRuntimeService.appendRequestLog({
            appCode: target.appCode,
            providerId: target.providerId,
            ...requestLogContextFields,
            targetUrl,
            method: request.method,
            path: `${pathSuffix}${queryString}`,
            statusCode: upstreamResponse.status,
            latencyMs: Date.now() - startedAt,
            outcome: "error",
            decisionReason: failure.reason,
            errorMessage: upstreamErrorMessage
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

          const responseBodyText = buildBridgedResponseBody(
            bridgedRequest.responseProtocol,
            upstreamBodyText,
            request.body
          );
          const usage = extractUsageFromResponse(
            bridgedRequest.responseProtocol,
            responseBodyText,
            request.body
          );
          if (usage !== null) {
            runtime.proxyRuntimeService.appendUsageRecord({
              requestLogId: requestLog.id,
              appCode: target.appCode,
              providerId: target.providerId,
              model: usage.model,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens
            });
          }
          const bodyBuffer = Buffer.from(responseBodyText);
          if (bridgedRequest.responseProtocol === "anthropic") {
            reply.header("content-type", "application/json; charset=utf-8");
          }
          reply.send(bodyBuffer);
          return;
        }

        runtime.proxyRuntimeService.recordSuccess(target.providerId);
        const requestLog = runtime.proxyRuntimeService.appendRequestLog({
          appCode: target.appCode,
          providerId: target.providerId,
          ...requestLogContextFields,
          targetUrl,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: upstreamResponse.status,
          latencyMs: Date.now() - startedAt,
          outcome: "success",
          decisionReason: null,
          errorMessage: null
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
            const bridge = new AnthropicSseBridgeTransform({
              fallbackModel:
                typeof request.body === "object" &&
                request.body !== null &&
                "model" in request.body &&
                typeof (request.body as { model?: unknown }).model === "string"
                  ? (request.body as { model: string }).model
                  : "claude-compat",
              fallbackMessageId: `msg_${randomUUID().replace(/-/g, "")}`
            });
            sendRawStream(
              reply,
              Readable.fromWeb(upstreamResponse.body as never).pipe(bridge),
              "text/event-stream; charset=utf-8",
              () => {
                const usage = bridge.getUsageSnapshot();
                if (usage === null) {
                  return;
                }

                runtime.proxyRuntimeService.appendUsageRecord({
                  requestLogId: requestLog.id,
                  appCode: target.appCode,
                  providerId: target.providerId,
                  model:
                    usage.model ??
                    (typeof request.body === "object" &&
                    request.body !== null &&
                    "model" in request.body &&
                    typeof (request.body as { model?: unknown }).model === "string"
                      ? (request.body as { model: string }).model
                      : "unknown"),
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens
                });
              }
            );
            return;
          }
          const tracker = new UsageTrackingStreamTransform(request.body);
          sendRawStream(
            reply,
            Readable.fromWeb(upstreamResponse.body as never).pipe(tracker),
            "text/event-stream; charset=utf-8",
            () => {
              const usage = tracker.getUsageSnapshot();
              if (usage === null) {
                return;
              }

              runtime.proxyRuntimeService.appendUsageRecord({
                requestLogId: requestLog.id,
                appCode: target.appCode,
                providerId: target.providerId,
                model: usage.model ?? "unknown",
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens
              });
            }
          );
          return;
        }

        const upstreamBodyText = await upstreamResponse.text();
        const responseBodyText = buildBridgedResponseBody(
          bridgedRequest.responseProtocol,
          upstreamBodyText,
          request.body
        );
        const usage = extractUsageFromResponse(
          bridgedRequest.responseProtocol,
          responseBodyText,
          request.body
        );
        if (usage !== null) {
          runtime.proxyRuntimeService.appendUsageRecord({
            requestLogId: requestLog.id,
            appCode: target.appCode,
            providerId: target.providerId,
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens
          });
        }
        const bodyBuffer = Buffer.from(responseBodyText);
        if (bridgedRequest.responseProtocol === "anthropic") {
          reply.header("content-type", "application/json; charset=utf-8");
        }
        reply.send(bodyBuffer);
        return;
      } catch (error) {
        lastErrorMessage = error instanceof Error ? error.message : "Proxy request failed";
        lastStatusCode = 502;
        const failure = classifyProxyFailure(null, [lastErrorMessage]);
        const shouldFailover =
          executionPlan.failoverEnabled &&
          index < executionPlan.candidates.length - 1 &&
          failure.disposition === "failover";
        if (shouldFailover) {
          runtime.proxyRuntimeService.recordFailure(
            target.providerId,
            target.cooldownSeconds,
            policy.failureThreshold,
            lastErrorMessage
          );
        }
        runtime.proxyRuntimeService.appendRequestLog({
          appCode: target.appCode,
          providerId: target.providerId,
          ...requestLogContextFields,
          targetUrl: null,
          method: request.method,
          path: `${pathSuffix}${queryString}`,
          statusCode: lastStatusCode,
          latencyMs: Date.now() - startedAt,
          outcome: shouldFailover ? "failover" : "error",
          decisionReason: failure.reason,
          nextProviderId: shouldFailover ? executionPlan.candidates[index + 1]?.providerId ?? null : null,
          errorMessage:
            shouldFailover ? `${lastErrorMessage}; trying next provider` : lastErrorMessage
        });
        if (!shouldFailover) {
          return replyWithJsonError(reply, lastStatusCode, lastErrorMessage);
        }
      }
    }

    return replyWithJsonError(reply, lastStatusCode, lastErrorMessage);
  });
};
