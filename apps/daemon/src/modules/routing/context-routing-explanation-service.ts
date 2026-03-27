import type {
  AppCode,
  ContextRoutingExplanation,
  ContextRoutingExplanationStep,
  EffectiveAppContext,
  ResolvedSessionContext,
  ResolvedWorkspaceContext
} from "@cc-switch-web/shared";

import type { BindingRepository } from "../bindings/binding-repository.js";
import type { FailoverChainRepository } from "../failover/failover-chain-repository.js";
import type { ProxyRuntimeService } from "../proxy/proxy-runtime-service.js";
import type { ActiveContextPolicyService } from "../workspaces/active-context-policy-service.js";
import type { ActiveContextService } from "../workspaces/active-context-service.js";

const APP_CODES: AppCode[] = ["codex", "claude-code", "gemini-cli", "opencode", "openclaw"];

export class ContextRoutingExplanationService {
  constructor(
    private readonly activeContextService: ActiveContextService,
    private readonly activeContextPolicyService: ActiveContextPolicyService,
    private readonly bindingRepository: BindingRepository,
    private readonly failoverChainRepository: FailoverChainRepository,
    private readonly proxyRuntimeService: ProxyRuntimeService
  ) {}

  list(): ContextRoutingExplanation[] {
    return APP_CODES.map((appCode) => this.getByApp(appCode));
  }

  getByApp(appCode: AppCode): ContextRoutingExplanation {
    const activeState = this.activeContextService.getState();
    const effective = this.activeContextPolicyService.resolveForApp(appCode);
    const binding =
      this.bindingRepository.list().find((item) => item.appCode === appCode) ?? null;
    const failoverChain =
      this.failoverChainRepository.list().find((item) => item.appCode === appCode) ?? null;
    const matchedSession =
      activeState.sessionContext !== null && activeState.sessionContext.effectiveAppCode === appCode
        ? activeState.sessionContext
        : null;
    const matchedWorkspace =
      activeState.workspaceContext !== null && activeState.workspaceContext.effectiveAppCode === appCode
        ? activeState.workspaceContext
        : null;

    const steps: ContextRoutingExplanationStep[] = [
      {
        kind: "active-session-context",
        selected: effective.source === "active-session",
        available: matchedSession !== null,
        referenceId: matchedSession?.sessionId ?? null,
        providerId: matchedSession?.provider.id ?? null,
        message:
          matchedSession === null
            ? "No active session matches this app."
            : `Active session ${matchedSession.sessionId} is eligible for ${appCode}.`
      },
      {
        kind: "active-workspace-context",
        selected: effective.source === "active-workspace",
        available: matchedWorkspace !== null,
        referenceId: matchedWorkspace?.workspaceId ?? null,
        providerId: matchedWorkspace?.provider.id ?? null,
        message:
          matchedWorkspace === null
            ? "No active workspace matches this app."
            : `Active workspace ${matchedWorkspace.workspaceId} is eligible for ${appCode}.`
      },
      this.buildContextProviderStep("session-override", matchedSession, effective),
      this.buildContextProviderStep("workspace-default", matchedSession ?? matchedWorkspace, effective),
      {
        kind: "app-binding",
        selected: effective.provider.source === "app-binding",
        available: binding !== null,
        referenceId: binding?.id ?? null,
        providerId: binding?.providerId ?? null,
        message:
          binding === null
            ? "No app binding is configured."
            : `App binding routes ${appCode} to provider ${binding.providerId} in ${binding.mode} mode.`
      },
      {
        kind: "failover-chain",
        selected: failoverChain?.enabled ?? false,
        available: failoverChain !== null,
        referenceId: failoverChain?.id ?? null,
        providerId: failoverChain?.providerIds[0] ?? null,
        message:
          failoverChain === null
            ? "No failover chain is configured."
            : `Failover chain has ${failoverChain.providerIds.length} provider candidate(s).`
      }
    ];

    const plan = this.proxyRuntimeService.createExecutionPlan(appCode, effective.provider.id);

    return {
      appCode,
      effectiveSource: effective.source,
      activeWorkspaceId: effective.activeWorkspaceId,
      activeSessionId: effective.activeSessionId,
      effectiveProviderId: effective.provider.id,
      effectiveProviderSource: effective.provider.source,
      steps,
      routingPlan:
        plan === null
          ? null
          : {
              appCode,
              proxyPath: `/proxy/${appCode}`,
              failoverEnabled: plan.failoverEnabled,
              maxAttempts: plan.maxAttempts,
              candidates: plan.candidates.map((candidate) => {
                const candidateDecision =
                  plan.candidateDecisions.find((item) => item.providerId === candidate.providerId) ?? null;

                return {
                  providerId: candidate.providerId,
                  providerName: candidate.providerName,
                  enabled: candidate.enabled,
                  hasCredential: candidate.hasCredential,
                  circuitState: this.proxyRuntimeService.getProviderCircuitState(
                    candidate.providerId,
                    candidate.cooldownSeconds
                  ),
                  source:
                    candidate.providerId === effective.provider.id ? "binding-primary" : "failover",
                  willReceiveTraffic: true,
                  decision: candidateDecision?.decision ?? "selected",
                  decisionReason: candidateDecision?.reason ?? "ready"
                };
              })
            },
      warnings: effective.warnings
    };
  }

  private buildContextProviderStep(
    kind: "session-override" | "workspace-default",
    context: ResolvedSessionContext | ResolvedWorkspaceContext | null,
    effective: EffectiveAppContext
  ): ContextRoutingExplanationStep {
    const available =
      context !== null &&
      (kind === "session-override"
        ? context.provider.source === "session-override"
        : context.provider.source === "workspace-default");

    return {
      kind,
      selected: effective.provider.source === kind,
      available,
      referenceId:
        kind === "session-override"
          ? ("sessionId" in (context ?? {}) ? (context as ResolvedSessionContext).sessionId : null)
          : context !== null
            ? ("workspaceId" in context ? context.workspaceId : null)
            : null,
      providerId: available ? context?.provider.id ?? null : null,
      message:
        !available
          ? `${kind === "session-override" ? "Session override" : "Workspace default"} is not active.`
          : `${kind === "session-override" ? "Session override" : "Workspace default"} selects provider ${context?.provider.id}.`
    };
  }
}
