import type { FastifyBaseLogger } from "fastify";
import type { ProviderType } from "cc-switch-web-shared";

import type { ProxyRuntimeService } from "./proxy-runtime-service.js";

const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 15_000;

const buildProbeUrl = (providerType: ProviderType, baseUrl: string): string => {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  if (providerType === "gemini") {
    if (normalizedBaseUrl.endsWith("/v1beta/openai")) {
      return `${normalizedBaseUrl.slice(0, -"/openai".length)}/models`;
    }
    if (normalizedBaseUrl.endsWith("/v1beta")) {
      return `${normalizedBaseUrl}/models`;
    }
  }
  if (providerType === "anthropic" && normalizedBaseUrl.endsWith("/v1/messages")) {
    return `${normalizedBaseUrl.slice(0, -"/messages".length)}/models`;
  }
  if (normalizedBaseUrl.endsWith("/v1")) {
    return `${normalizedBaseUrl}/models`;
  }
  if (normalizedBaseUrl.endsWith("/messages")) {
    return `${normalizedBaseUrl.slice(0, -"/messages".length)}/models`;
  }

  return normalizedBaseUrl;
};

const buildProbeHeaders = (
  providerType: ProviderType,
  apiKeyPlaintext: string
): Record<string, string> => {
  if (providerType === "anthropic") {
    return {
      "x-api-key": apiKeyPlaintext,
      "anthropic-version": "2023-06-01"
    };
  }

  if (providerType === "gemini") {
    return {
      "x-goog-api-key": apiKeyPlaintext
    };
  }

  return {
    Authorization: `Bearer ${apiKeyPlaintext}`
  };
};

const isHealthyResponse = (statusCode: number): boolean =>
  statusCode < 500 && statusCode !== 429 && statusCode !== 408;

export class ProviderHealthProbeService {
  private timer: NodeJS.Timeout | null = null;
  private logger: Pick<FastifyBaseLogger, "info" | "warn"> = {
    info: () => undefined,
    warn: () => undefined
  };

  constructor(
    private readonly proxyRuntimeService: ProxyRuntimeService,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly intervalMs = DEFAULT_HEALTH_CHECK_INTERVAL_MS
  ) {}

  setLogger(logger: Pick<FastifyBaseLogger, "info" | "warn">): void {
    this.logger = logger;
  }

  start(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runRecoveryProbes();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runRecoveryProbes(): Promise<void> {
    const targets = this.proxyRuntimeService.listRecoveryProbeTargets();

    for (const target of targets) {
      await this.probeTarget(target, "recovery");
    }
  }

  async probeProvider(providerId: string): Promise<{
    readonly providerId: string;
    readonly healthy: boolean;
    readonly statusCode: number | null;
    readonly probeUrl: string;
    readonly message: string;
  }> {
    const target = this.proxyRuntimeService.getProbeTarget(providerId);
    if (target === null) {
      throw new Error(`Provider not available for probe: ${providerId}`);
    }

    return this.probeTarget(target, "manual");
  }

  private async probeTarget(
    target: {
      readonly providerId: string;
      readonly providerName: string;
      readonly providerType: ProviderType;
      readonly upstreamBaseUrl: string;
      readonly apiKeyPlaintext: string;
      readonly cooldownSeconds: number;
    },
    trigger: "recovery" | "manual"
  ): Promise<{
    readonly providerId: string;
    readonly healthy: boolean;
    readonly statusCode: number | null;
    readonly probeUrl: string;
    readonly message: string;
  }> {
    const probeUrl = buildProbeUrl(target.providerType, target.upstreamBaseUrl);
    const probeAccepted = this.proxyRuntimeService.beginRecoveryProbe(target.providerId);

    if (!probeAccepted) {
      return {
        providerId: target.providerId,
        healthy: false,
        statusCode: null,
        probeUrl,
        message: "Probe skipped because another recovery probe is already running"
      };
    }

    try {
      const response = await this.fetchImpl(probeUrl, {
        method: "GET",
        headers: buildProbeHeaders(target.providerType, target.apiKeyPlaintext),
        signal: AbortSignal.timeout(Math.min(target.cooldownSeconds * 1000, 10_000))
      });

      if (isHealthyResponse(response.status)) {
        this.proxyRuntimeService.markProbeRecoverySuccess(
          target.providerId,
          target.cooldownSeconds
        );
        this.proxyRuntimeService.appendProviderHealthEvent({
          providerId: target.providerId,
          trigger,
          status: "healthy",
          statusCode: response.status,
          probeUrl,
          message: `Probe succeeded with status ${response.status}`
        });
        this.logger.info(
          {
            providerId: target.providerId,
            providerName: target.providerName,
            probeUrl,
            statusCode: response.status,
            trigger
          },
          "provider health probe succeeded"
        );
        return {
          providerId: target.providerId,
          healthy: true,
          statusCode: response.status,
          probeUrl,
          message: `Probe succeeded with status ${response.status}`
        };
      }

      const errorMessage = `Recovery probe failed with status ${response.status}`;
      this.proxyRuntimeService.markProbeRecoveryFailure(
        target.providerId,
        target.cooldownSeconds,
        errorMessage
      );
      this.proxyRuntimeService.appendProviderHealthEvent({
        providerId: target.providerId,
        trigger,
        status: "unhealthy",
        statusCode: response.status,
        probeUrl,
        message: errorMessage
      });
      this.logger.warn(
        {
          providerId: target.providerId,
          providerName: target.providerName,
          probeUrl,
          statusCode: response.status,
          trigger
        },
        "provider health probe returned unhealthy status"
      );
      return {
        providerId: target.providerId,
        healthy: false,
        statusCode: response.status,
        probeUrl,
        message: errorMessage
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown recovery probe error";
      this.proxyRuntimeService.markProbeRecoveryFailure(
        target.providerId,
        target.cooldownSeconds,
        errorMessage
      );
      this.proxyRuntimeService.appendProviderHealthEvent({
        providerId: target.providerId,
        trigger,
        status: "unhealthy",
        statusCode: null,
        probeUrl,
        message: errorMessage
      });
      this.logger.warn(
        {
          providerId: target.providerId,
          providerName: target.providerName,
          probeUrl,
          errorMessage,
          trigger
        },
        "provider health probe failed"
      );
      return {
        providerId: target.providerId,
        healthy: false,
        statusCode: null,
        probeUrl,
        message: errorMessage
      };
    }
  }
}
