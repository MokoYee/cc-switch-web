import type {
  AppBindingRoutingPreview,
  AppBindingUpsert,
  AppCode,
  ConfigImpactPreview,
  FailoverChainRoutingPreview,
  FailoverChainUpsert,
  ProviderRoutingPreview,
  ProviderUpsert,
  RoutingExecutionPlanPreview,
  RoutingPlanCandidate,
  RoutingPreviewIssueCode
} from "cc-switch-web-shared";

import type { BindingRepository } from "../bindings/binding-repository.js";
import type { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import type { ProviderRepository } from "../providers/provider-repository.js";
import type { ProxyRuntimeService } from "../proxy/proxy-runtime-service.js";

export class RoutingGovernanceService {
  constructor(
    private readonly providerRepository: ProviderRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly proxyRuntimeService: ProxyRuntimeService
  ) {}

  previewProviderUpsert(input: ProviderUpsert): ProviderRoutingPreview {
    const existingProvider = this.providerRepository.getRuntime(input.id);
    const bindings = this.bindingRepository.list().filter((item) => item.providerId === input.id);
    const chains = this.failoverChainRepository
      .list()
      .filter((item) => item.providerIds.includes(input.id));
    const issueCodes: RoutingPreviewIssueCode[] = [];
    const warnings: string[] = [];
    const hasCredential =
      input.apiKey.trim().length > 0 || (existingProvider?.apiKeyPlaintext.trim().length ?? 0) > 0;

    if (input.enabled && !hasCredential) {
      issueCodes.push("credential-missing");
      warnings.push(`Enabled provider ${input.id} has no stored credential and no new credential input.`);
    }

    if (!input.enabled && bindings.length > 0) {
      issueCodes.push("provider-disabled");
      warnings.push(`Disabling provider ${input.id} will impact bindings for: ${bindings.map((item) => item.appCode).join(", ")}`);
    }

    if (!input.enabled && chains.length > 0) {
      warnings.push(`Disabling provider ${input.id} will reduce failover coverage for: ${chains.map((item) => item.appCode).join(", ")}`);
    }

    return {
      providerId: input.id,
      exists: existingProvider !== null,
      boundAppCodes: Array.from(new Set(bindings.map((item) => item.appCode))).sort(),
      failoverAppCodes: Array.from(new Set(chains.map((item) => item.appCode))).sort(),
      issueCodes: Array.from(new Set(issueCodes)),
      warnings,
      impact: this.buildProviderImpact(input.id, bindings.map((item) => item.appCode), chains.map((item) => item.appCode), warnings)
    };
  }

  previewBindingUpsert(input: AppBindingUpsert): AppBindingRoutingPreview {
    const exists = this.bindingRepository.list().some((item) => item.id === input.id);
    const siblingBindings = this.bindingRepository
      .list()
      .filter((item) => item.id !== input.id && item.appCode === input.appCode);
    const currentChain =
      this.failoverChainRepository.list().find((item) => item.appCode === input.appCode) ?? null;
    const issueCodes: RoutingPreviewIssueCode[] = [];
    const warnings: string[] = [];

    if (!this.providerRepository.exists(input.providerId)) {
      issueCodes.push("provider-missing");
      warnings.push(`Binding target provider does not exist: ${input.providerId}`);
    }
    if (siblingBindings.length > 0) {
      issueCodes.push("duplicate-app-binding");
      warnings.push(`App ${input.appCode} already has another binding: ${siblingBindings.map((item) => item.id).join(", ")}`);
    }
    if (input.mode === "observe" && currentChain?.enabled) {
      issueCodes.push("observe-mode-with-failover");
      warnings.push(`Observe mode will keep routing passive while failover chain for ${input.appCode} remains enabled.`);
    }

    const executionPlan = this.buildExecutionPlan(input.appCode, input.providerId, currentChain ? {
      ...currentChain
    } : null, issueCodes, warnings);

    return {
      bindingId: input.id,
      appCode: input.appCode,
      exists,
      mode: input.mode,
      providerId: input.providerId,
      issueCodes: Array.from(new Set(issueCodes)),
      warnings,
      executionPlan,
      impact: this.buildBindingImpact(input.appCode, warnings)
    };
  }

  previewFailoverChainUpsert(input: FailoverChainUpsert): FailoverChainRoutingPreview {
    const normalizedProviderIds = Array.from(new Set(input.providerIds));
    const exists = this.failoverChainRepository.list().some((item) => item.id === input.id);
    const binding =
      this.bindingRepository.list().find((item) => item.appCode === input.appCode) ?? null;
    const issueCodes: RoutingPreviewIssueCode[] = [];
    const warnings: string[] = [];

    if (normalizedProviderIds.length !== input.providerIds.length) {
      issueCodes.push("failover-provider-duplicate");
      warnings.push(`Duplicate providers were normalized in failover chain ${input.id}.`);
    }

    for (const providerId of normalizedProviderIds) {
      if (!this.providerRepository.exists(providerId)) {
        issueCodes.push("failover-provider-missing");
        warnings.push(`Failover provider does not exist: ${providerId}`);
      }
    }

    if (binding === null) {
      issueCodes.push("failover-missing-primary");
      warnings.push(`App ${input.appCode} has no primary binding yet; failover chain has no primary entry point.`);
    } else if (!normalizedProviderIds.includes(binding.providerId)) {
      issueCodes.push("failover-missing-primary");
      warnings.push(`Failover chain does not include bound primary provider ${binding.providerId}.`);
    }

    const executionPlan = this.buildExecutionPlan(
      input.appCode,
      binding?.providerId ?? normalizedProviderIds[0] ?? "",
      {
        ...input,
        providerIds: normalizedProviderIds
      },
      issueCodes,
      warnings
    );

    if (input.enabled && input.maxAttempts > executionPlan.candidates.length) {
      issueCodes.push("failover-max-attempts-exceeds-candidates");
      warnings.push(`Max attempts ${input.maxAttempts} exceeds available routing candidates ${executionPlan.candidates.length}.`);
    }

    return {
      chainId: input.id,
      appCode: input.appCode,
      exists,
      enabled: input.enabled,
      normalizedProviderIds,
      issueCodes: Array.from(new Set(issueCodes)),
      warnings,
      executionPlan,
      impact: this.buildFailoverImpact(input.appCode, warnings)
    };
  }

  private buildProviderImpact(
    providerId: string,
    boundApps: AppCode[],
    failoverApps: AppCode[],
    warnings: string[]
  ): ConfigImpactPreview {
    const affectedAppCodes = Array.from(new Set([...boundApps, ...failoverApps])).sort();
    const summary: string[] = [];

    if (boundApps.length > 0) {
      summary.push(`Primary bindings affected: ${Array.from(new Set(boundApps)).join(", ")}`);
    }
    if (failoverApps.length > 0) {
      summary.push(`Failover coverage affected: ${Array.from(new Set(failoverApps)).join(", ")}`);
    }
    if (summary.length === 0) {
      summary.push(`Provider ${providerId} change is isolated from current routing objects.`);
    }

    return {
      summary,
      affectedAppCodes,
      requiresSnapshot: true,
      requiresProxyReload: affectedAppCodes.length > 0,
      touchesRouting: affectedAppCodes.length > 0,
      touchesHostManagedMcp: false,
      riskLevel: warnings.length > 0 || affectedAppCodes.length > 0 ? "medium" : "low"
    };
  }

  private buildBindingImpact(appCode: AppCode, warnings: string[]): ConfigImpactPreview {
    return {
      summary: [
        `App ${appCode} routing target will be updated immediately after save.`,
        "Proxy runtime will reload the active routing snapshot."
      ],
      affectedAppCodes: [appCode],
      requiresSnapshot: true,
      requiresProxyReload: true,
      touchesRouting: true,
      touchesHostManagedMcp: false,
      riskLevel: warnings.length > 0 ? "high" : "medium"
    };
  }

  private buildFailoverImpact(appCode: AppCode, warnings: string[]): ConfigImpactPreview {
    return {
      summary: [
        `Failover chain for ${appCode} will be recalculated on save.`,
        "Proxy runtime will reload routing candidates and retry order."
      ],
      affectedAppCodes: [appCode],
      requiresSnapshot: true,
      requiresProxyReload: true,
      touchesRouting: true,
      touchesHostManagedMcp: false,
      riskLevel: warnings.length > 0 ? "high" : "medium"
    };
  }

  private buildExecutionPlan(
    appCode: AppCode,
    primaryProviderId: string,
    failoverChain: Pick<FailoverChainUpsert, "enabled" | "providerIds" | "maxAttempts" | "cooldownSeconds"> | null,
    issueCodes: RoutingPreviewIssueCode[],
    warnings: string[]
  ): RoutingExecutionPlanPreview {
    const providers = new Map(this.providerRepository.listRuntime().map((item) => [item.id, item] as const));
    const providerOrder =
      failoverChain !== null && failoverChain.providerIds.length > 0
        ? [primaryProviderId, ...failoverChain.providerIds.filter((item) => item !== primaryProviderId)]
        : [primaryProviderId];
    const executionPlan = this.proxyRuntimeService.createPreviewExecutionPlan(appCode, providerOrder, {
      failoverEnabled: failoverChain?.enabled ?? false,
      maxAttempts: failoverChain?.maxAttempts ?? 1,
      cooldownSeconds: failoverChain?.cooldownSeconds ?? 30
    });

    const candidates: RoutingPlanCandidate[] = providerOrder.map((providerId) => {
      const provider = providers.get(providerId);
      const executionCandidate = executionPlan?.candidates.find((item) => item.providerId === providerId);
      const candidateDecision =
        executionPlan?.candidateDecisions.find((item) => item.providerId === providerId) ?? null;
      const circuitState = this.proxyRuntimeService.getProviderCircuitState(
        providerId,
        failoverChain?.cooldownSeconds ?? 30
      );

      if (provider === undefined) {
        issueCodes.push("provider-missing");
      } else {
        if (!provider.enabled) {
          issueCodes.push("provider-disabled");
        }
        if (provider.apiKeyPlaintext.trim().length === 0) {
          issueCodes.push("credential-missing");
        }
        if (circuitState === "open") {
          issueCodes.push("circuit-open");
        }
      }

      return {
      providerId,
      providerName: provider?.name ?? null,
        enabled: provider?.enabled ?? false,
        hasCredential: (provider?.apiKeyPlaintext.trim().length ?? 0) > 0,
        circuitState,
        source: providerId === primaryProviderId ? "binding-primary" : "failover",
        willReceiveTraffic: executionCandidate !== undefined,
        decision: candidateDecision?.decision ?? "excluded",
        decisionReason:
          candidateDecision?.reason ??
          (!provider?.enabled
            ? "unexecutable-disabled"
            : (provider?.apiKeyPlaintext.trim().length ?? 0) === 0
              ? "unexecutable-missing-credential"
              : circuitState === "open"
                ? "circuit-open"
                : circuitState === "half-open"
                  ? "half-open-fallback"
                  : "ready")
      };
    });

    if (executionPlan === null || executionPlan.candidates.length === 0) {
      issueCodes.push("no-routable-provider");
      warnings.push(`No routable provider is available for app ${appCode} under the current binding/failover plan.`);
    }

    return {
      appCode,
      proxyPath: `/proxy/${appCode}`,
      failoverEnabled: failoverChain?.enabled ?? false,
      maxAttempts: failoverChain?.enabled ? Math.max(failoverChain.maxAttempts, 1) : 1,
      candidates
    };
  }
}
