import type {
  AppBindingUpsert,
  FailoverChainUpsert,
  HostCliApplyPreview,
  HostCliMutationResult,
  OnboardingAppCode,
  ProviderRoutingPreview,
  ProxyPolicy,
  QuickOnboardingApplyInput,
  QuickOnboardingApplyResult,
  QuickOnboardingPreview,
  QuickOnboardingPreviewInput,
  QuickOnboardingProviderInput
} from "cc-switch-web-shared";
import {
  quickOnboardingApplyInputSchema,
  quickOnboardingPreviewInputSchema
} from "cc-switch-web-shared";

import type { BindingRepository } from "../bindings/binding-repository.js";
import type { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import type { HostDiscoveryService } from "../host-discovery/host-discovery-service.js";
import type { ProviderRepository } from "../providers/provider-repository.js";
import type { ProxyRuntimeService } from "../proxy/proxy-runtime-service.js";
import type { ProxyService } from "../proxy/proxy-service.js";
import type { RoutingGovernanceService } from "../routing/routing-governance-service.js";
import type { SnapshotService } from "../snapshots/snapshot-service.js";

type QuickOnboardingPlan = {
  readonly input: QuickOnboardingPreviewInput;
  readonly providers: QuickOnboardingProviderInput[];
  readonly normalizedProviderIds: string[];
  readonly normalizedPrimaryProviderId: string;
  readonly normalizedFailoverProviderIds: string[];
  readonly bindingId: string;
  readonly failoverChainId: string;
  readonly bindingInput: AppBindingUpsert;
  readonly failoverInput: FailoverChainUpsert;
  readonly providerPreviews: ProviderRoutingPreview[];
  readonly bindingPreview: QuickOnboardingPreview["bindingPreview"];
  readonly failoverPreview: QuickOnboardingPreview["failoverPreview"];
  readonly hostTakeoverPreview: HostCliApplyPreview | null;
  readonly proxyPolicy: ProxyPolicy;
  readonly blockingReasons: string[];
  readonly warnings: string[];
  readonly summary: string[];
  readonly riskLevel: QuickOnboardingPreview["riskLevel"];
  readonly canApply: boolean;
};

const RISK_WEIGHT: Record<QuickOnboardingPreview["riskLevel"], number> = {
  low: 0,
  medium: 1,
  high: 2
};

const dedupe = (items: readonly string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const maxRiskLevel = (
  levels: readonly QuickOnboardingPreview["riskLevel"][]
): QuickOnboardingPreview["riskLevel"] =>
  levels.reduce<QuickOnboardingPreview["riskLevel"]>((current, item) =>
    RISK_WEIGHT[item] > RISK_WEIGHT[current] ? item : current, "low");

export class QuickOnboardingService {
  constructor(
    private readonly providerRepository: ProviderRepository,
    private readonly bindingRepository: BindingRepository,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly proxyService: ProxyService,
    private readonly proxyRuntimeService: ProxyRuntimeService,
    private readonly routingGovernanceService: RoutingGovernanceService,
    private readonly hostDiscoveryService: HostDiscoveryService,
    private readonly snapshotService: SnapshotService
  ) {}

  preview(rawInput: QuickOnboardingPreviewInput): QuickOnboardingPreview {
    const plan = this.buildPlan(quickOnboardingPreviewInputSchema.parse(rawInput));

    return {
      appCode: plan.input.appCode,
      providerPreviews: plan.providerPreviews,
      bindingPreview: plan.bindingPreview,
      failoverPreview: plan.failoverPreview,
      hostTakeoverPreview: plan.hostTakeoverPreview,
      normalizedProviderIds: plan.normalizedProviderIds,
      normalizedPrimaryProviderId: plan.normalizedPrimaryProviderId,
      normalizedFailoverProviderIds: plan.normalizedFailoverProviderIds,
      bindingId: plan.bindingId,
      failoverChainId: plan.failoverChainId,
      proxyPolicy: plan.proxyPolicy,
      canApply: plan.canApply,
      blockingReasons: plan.blockingReasons,
      warnings: plan.warnings,
      summary: plan.summary,
      riskLevel: plan.riskLevel
    };
  }

  apply(rawInput: QuickOnboardingApplyInput): QuickOnboardingApplyResult {
    const plan = this.buildPlan(quickOnboardingApplyInputSchema.parse(rawInput));

    if (!plan.canApply) {
      throw new Error(plan.blockingReasons.join(" "));
    }

    for (const provider of plan.providers) {
      this.providerRepository.upsert(provider);
    }

    this.bindingRepository.upsert(plan.bindingInput);
    this.failoverChainRepository.upsert(plan.failoverInput);
    this.proxyService.update(plan.proxyPolicy);

    const snapshot = this.snapshotService.create(`quick-onboarding:${plan.input.appCode}`);
    this.proxyRuntimeService.reload(snapshot.version);

    let hostTakeoverResult: HostCliMutationResult | null = null;
    let hostTakeoverError: string | null = null;

    if (plan.input.autoApplyHostTakeover) {
      try {
        hostTakeoverResult = this.hostDiscoveryService.applyManagedConfig(plan.input.appCode);
      } catch (error) {
        hostTakeoverError =
          error instanceof Error
            ? error.message
            : `Failed to apply host takeover for ${plan.input.appCode}`;
      }
    }

    return {
      appCode: plan.input.appCode,
      providerIds: plan.normalizedProviderIds,
      primaryProviderId: plan.normalizedPrimaryProviderId,
      failoverProviderIds: plan.normalizedFailoverProviderIds,
      bindingId: plan.bindingId,
      failoverChainId: plan.failoverChainId,
      proxyPolicy: plan.proxyPolicy,
      hostTakeoverApplied: hostTakeoverResult !== null,
      hostTakeoverResult,
      hostTakeoverError,
      warnings:
        hostTakeoverError === null
          ? plan.warnings
          : dedupe([...plan.warnings, `Host takeover was not completed: ${hostTakeoverError}`]),
      summary: dedupe([
        ...plan.summary,
        hostTakeoverResult !== null
          ? `Host takeover was applied for ${plan.input.appCode}.`
          : plan.input.autoApplyHostTakeover
            ? `Host takeover was skipped because apply failed for ${plan.input.appCode}.`
            : `Host takeover remains unchanged for ${plan.input.appCode}.`
      ]),
      snapshotVersion: snapshot.version
    };
  }

  private buildPlan(input: QuickOnboardingPreviewInput): QuickOnboardingPlan {
    const providers = input.providers.map((provider) => ({
      ...provider,
      id: provider.id.trim(),
      name: provider.name.trim(),
      baseUrl: provider.baseUrl.trim(),
      apiKey: provider.apiKey.trim(),
      apiKeyMasked: provider.apiKeyMasked?.trim()
    }));
    const normalizedProviderIds = providers.map((item) => item.id);
    const providerIdSet = new Set(normalizedProviderIds);
    const duplicateProviderIds = normalizedProviderIds.filter(
      (id, index) => normalizedProviderIds.indexOf(id) !== index
    );
    const normalizedPrimaryProviderId = input.primaryProviderId.trim();
    const requestedFailoverProviderIds =
      input.failoverProviderIds.length > 0
        ? input.failoverProviderIds
        : normalizedProviderIds.filter((item) => item !== normalizedPrimaryProviderId);
    const unknownFailoverProviderIds = requestedFailoverProviderIds.filter(
      (providerId) => !providerIdSet.has(providerId)
    );
    const normalizedFailoverProviderIds = dedupe(
      requestedFailoverProviderIds
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item !== normalizedPrimaryProviderId && providerIdSet.has(item))
    );
    const existingBinding = this.bindingRepository
      .list()
      .filter((item) => item.appCode === input.appCode)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0] ?? null;
    const existingFailover = this.failoverChainRepository
      .list()
      .filter((item) => item.appCode === input.appCode)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0] ?? null;
    const bindingId = existingBinding?.id ?? `binding-${input.appCode}`;
    const failoverChainId = existingFailover?.id ?? `failover-${input.appCode}`;
    const failoverProviderOrder = [normalizedPrimaryProviderId, ...normalizedFailoverProviderIds].filter(
      (item) => item.length > 0
    );
    const failoverEnabled = failoverProviderOrder.length > 1;
    const maxAttempts = Math.max(
      1,
      Math.min(input.maxAttempts ?? failoverProviderOrder.length, failoverProviderOrder.length)
    );
    const bindingInput: AppBindingUpsert = {
      id: bindingId,
      appCode: input.appCode,
      providerId: normalizedPrimaryProviderId,
      mode: input.mode
    };
    const failoverInput: FailoverChainUpsert = {
      id: failoverChainId,
      appCode: input.appCode,
      enabled: failoverEnabled,
      providerIds: failoverProviderOrder,
      cooldownSeconds: input.cooldownSeconds,
      maxAttempts
    };
    const currentProxyPolicy = this.proxyService.getStatus().policy;
    const proxyPolicy: ProxyPolicy = {
      ...currentProxyPolicy,
      enabled: input.enableProxy
    };
    const providerPreviews = providers.map((provider) =>
      this.routingGovernanceService.previewProviderUpsert(provider)
    );
    const bindingPreview = this.routingGovernanceService.previewBindingUpsert(bindingInput);
    const failoverPreview = this.routingGovernanceService.previewFailoverChainUpsert(failoverInput);
    const discovery = this.hostDiscoveryService.scan().find((item) => item.appCode === input.appCode) ?? null;
    const hostTakeoverPreview =
      input.autoApplyHostTakeover && discovery?.takeoverSupported
        ? this.hostDiscoveryService.previewApplyManagedConfig(input.appCode)
        : null;
    const runtimeProviders = new Map(
      this.providerRepository.listRuntime().map((provider) => [provider.id, provider] as const)
    );
    const primaryProviderInput =
      providers.find((provider) => provider.id === normalizedPrimaryProviderId) ?? null;
    const primaryProviderRuntime = runtimeProviders.get(normalizedPrimaryProviderId) ?? null;
    const primaryHasCredential =
      (primaryProviderInput?.apiKey.trim().length ?? 0) > 0 ||
      (primaryProviderRuntime?.apiKeyPlaintext.trim().length ?? 0) > 0;
    const blockingReasons: string[] = [];

    if (providers.some((provider) => provider.id.length === 0)) {
      blockingReasons.push("Provider ID cannot be empty.");
    }
    if (duplicateProviderIds.length > 0) {
      blockingReasons.push(`Provider IDs must be unique: ${dedupe(duplicateProviderIds).join(", ")}`);
    }
    if (!providerIdSet.has(normalizedPrimaryProviderId)) {
      blockingReasons.push(`Primary provider is missing from the onboarding payload: ${normalizedPrimaryProviderId}`);
    }
    if (primaryProviderInput !== null && !primaryProviderInput.enabled) {
      blockingReasons.push(`Primary provider must stay enabled during onboarding: ${normalizedPrimaryProviderId}`);
    }
    if (!primaryHasCredential) {
      blockingReasons.push(
        `Primary provider ${normalizedPrimaryProviderId} requires an API credential before onboarding can continue.`
      );
    }
    if (unknownFailoverProviderIds.length > 0) {
      blockingReasons.push(
        `Failover providers were referenced before being defined: ${dedupe(unknownFailoverProviderIds).join(", ")}`
      );
    }
    if (input.autoApplyHostTakeover && !input.enableProxy) {
      blockingReasons.push("Host takeover cannot be enabled while the local proxy stays disabled.");
    }
    if (input.autoApplyHostTakeover && discovery?.takeoverSupported === false) {
      blockingReasons.push(`Host takeover is not supported for ${input.appCode} on this host.`);
    }

    const warnings = dedupe([
      ...providerPreviews.flatMap((item) => item.warnings),
      ...bindingPreview.warnings,
      ...failoverPreview.warnings,
      ...(hostTakeoverPreview?.warnings ?? []),
      discovery !== null && !discovery.discovered
        ? `The ${input.appCode} binary was not found in PATH. Host config can still be written ahead of first run.`
        : "",
      discovery !== null && discovery.envConflicts.length > 0
        ? `Environment overrides were found for ${input.appCode} and may shadow the managed host config.`
        : ""
    ]);

    const summary = dedupe([
      `${providers.length} provider(s) will be saved for ${input.appCode}.`,
      `Primary traffic for ${input.appCode} will bind to ${normalizedPrimaryProviderId} in ${input.mode} mode.`,
      failoverEnabled
        ? `Failover priority will be ${failoverProviderOrder.join(" -> ")}.`
        : `Failover remains disabled for ${input.appCode}.`,
      input.enableProxy
        ? `The local proxy will listen on ${proxyPolicy.listenHost}:${proxyPolicy.listenPort}.`
        : `The local proxy configuration will be kept disabled.`,
      input.autoApplyHostTakeover
        ? `Host config for ${input.appCode} will be updated to point at the local proxy.`
        : `Host config for ${input.appCode} will not be touched during onboarding.`
    ]);

    const riskLevel = maxRiskLevel([
      ...providerPreviews.map((item) => item.impact.riskLevel),
      bindingPreview.impact.riskLevel,
      failoverPreview.impact.riskLevel,
      hostTakeoverPreview?.riskLevel ?? "low",
      blockingReasons.length > 0 ? "high" : "low"
    ]);

    return {
      input,
      providers,
      normalizedProviderIds,
      normalizedPrimaryProviderId,
      normalizedFailoverProviderIds,
      bindingId,
      failoverChainId,
      bindingInput,
      failoverInput,
      providerPreviews,
      bindingPreview,
      failoverPreview,
      hostTakeoverPreview,
      proxyPolicy,
      blockingReasons,
      warnings,
      summary,
      riskLevel,
      canApply: blockingReasons.length === 0
    };
  }
}
