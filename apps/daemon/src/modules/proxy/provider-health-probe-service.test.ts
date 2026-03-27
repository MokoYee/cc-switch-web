import assert from "node:assert/strict";
import test from "node:test";

import { ProviderHealthProbeService } from "./provider-health-probe-service.js";

test("marks provider recovered when active probe succeeds", async () => {
  const calls: string[] = [];
  const runtime = {
    listRecoveryProbeTargets: () => [
      {
        providerId: "provider-1",
        providerName: "Provider 1",
        providerType: "openai-compatible" as const,
        upstreamBaseUrl: "http://127.0.0.1:18090/v1",
        apiKeyPlaintext: "sk-test",
        cooldownSeconds: 30
      }
    ],
    markProbeRecoverySuccess: (providerId: string) => {
      calls.push(`success:${providerId}`);
    },
    markProbeRecoveryFailure: (providerId: string) => {
      calls.push(`failure:${providerId}`);
    },
    beginRecoveryProbe: () => true,
    appendProviderHealthEvent: () => undefined
  };

  const service = new ProviderHealthProbeService(
    runtime as never,
    (async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as typeof fetch,
    60_000
  );

  await service.runRecoveryProbes();
  assert.deepEqual(calls, ["success:provider-1"]);
});

test("keeps provider open when active probe fails", async () => {
  const calls: string[] = [];
  const runtime = {
    listRecoveryProbeTargets: () => [
      {
        providerId: "provider-2",
        providerName: "Provider 2",
        providerType: "openai-compatible" as const,
        upstreamBaseUrl: "http://127.0.0.1:18091/v1",
        apiKeyPlaintext: "sk-test",
        cooldownSeconds: 45
      }
    ],
    markProbeRecoverySuccess: (providerId: string) => {
      calls.push(`success:${providerId}`);
    },
    markProbeRecoveryFailure: (providerId: string) => {
      calls.push(`failure:${providerId}`);
    },
    beginRecoveryProbe: () => true,
    appendProviderHealthEvent: () => undefined
  };

  const service = new ProviderHealthProbeService(
    runtime as never,
    (async () =>
      new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json" }
      })) as typeof fetch,
    60_000
  );

  await service.runRecoveryProbes();
  assert.deepEqual(calls, ["failure:provider-2"]);
});

test("supports probing a single provider on demand", async () => {
  const calls: string[] = [];
  const runtime = {
    getProbeTarget: (providerId: string) => ({
      providerId,
      providerName: "Provider 3",
      providerType: "openai-compatible" as const,
      upstreamBaseUrl: "http://127.0.0.1:18092/v1",
      apiKeyPlaintext: "sk-test",
      cooldownSeconds: 30
    }),
    markProbeRecoverySuccess: (providerId: string) => {
      calls.push(`success:${providerId}`);
    },
    markProbeRecoveryFailure: (providerId: string) => {
      calls.push(`failure:${providerId}`);
    },
    beginRecoveryProbe: () => true,
    listRecoveryProbeTargets: () => [],
    appendProviderHealthEvent: () => undefined
  };

  const service = new ProviderHealthProbeService(
    runtime as never,
    (async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as typeof fetch,
    60_000
  );

  const result = await service.probeProvider("provider-3");
  assert.equal(result.providerId, "provider-3");
  assert.equal(result.healthy, true);
  assert.deepEqual(calls, ["success:provider-3"]);
});

test("skips duplicate probe when another recovery probe is already in flight", async () => {
  const runtime = {
    getProbeTarget: (providerId: string) => ({
      providerId,
      providerName: "Provider 4",
      providerType: "openai-compatible" as const,
      upstreamBaseUrl: "http://127.0.0.1:18093/v1",
      apiKeyPlaintext: "sk-test",
      cooldownSeconds: 30
    }),
    beginRecoveryProbe: () => false,
    markProbeRecoverySuccess: () => undefined,
    markProbeRecoveryFailure: () => undefined,
    listRecoveryProbeTargets: () => [],
    appendProviderHealthEvent: () => undefined
  };

  const service = new ProviderHealthProbeService(
    runtime as never,
    (async () => {
      throw new Error("fetch should not run");
    }) as typeof fetch,
    60_000
  );

  const result = await service.probeProvider("provider-4");
  assert.equal(result.healthy, false);
  assert.match(result.message, /already running/);
});
