import { z } from "zod";

export const providerTypeSchema = z.enum([
  "openai-compatible",
  "anthropic",
  "gemini",
  "opencode",
  "custom"
]);

export const appCodeSchema = z.enum([
  "codex",
  "claude-code",
  "gemini-cli",
  "opencode",
  "openclaw"
]);

export const localeCodeSchema = z.enum(["zh-CN", "en-US"]);

export const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerType: providerTypeSchema,
  baseUrl: z.string().url(),
  apiKeyMasked: z.string().min(1),
  enabled: z.boolean(),
  timeoutMs: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const providerUpsertSchema = providerSchema.pick({
  id: true,
  name: true,
  providerType: true,
  baseUrl: true,
  enabled: true,
  timeoutMs: true
}).extend({
  apiKey: z.string().trim().optional().default(""),
  apiKeyMasked: z.string().trim().optional()
});

export const appBindingSchema = z.object({
  id: z.string().min(1),
  appCode: appCodeSchema,
  providerId: z.string().min(1),
  mode: z.enum(["observe", "managed"]),
  updatedAt: z.string().datetime()
});

export const appBindingUpsertSchema = appBindingSchema.pick({
  id: true,
  appCode: true,
  providerId: true,
  mode: true
});

export const proxyPolicySchema = z.object({
  listenHost: z.string().min(1),
  listenPort: z.number().int().min(1).max(65535),
  enabled: z.boolean(),
  requestTimeoutMs: z.number().int().positive(),
  failureThreshold: z.number().int().positive()
});

export const failoverChainSchema = z.object({
  id: z.string().min(1),
  appCode: appCodeSchema,
  enabled: z.boolean(),
  providerIds: z.array(z.string().min(1)).min(1),
  cooldownSeconds: z.number().int().min(5).max(3600),
  maxAttempts: z.number().int().min(1).max(10),
  updatedAt: z.string().datetime()
});

export const failoverChainUpsertSchema = failoverChainSchema.pick({
  id: true,
  appCode: true,
  enabled: true,
  providerIds: true,
  cooldownSeconds: true,
  maxAttempts: true
});

export const configSnapshotSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().min(1),
  createdAt: z.string().datetime(),
  payload: z.object({
    providers: z.array(providerSchema),
    bindings: z.array(appBindingSchema),
    proxyPolicy: proxyPolicySchema,
    failoverChains: z.array(failoverChainSchema).default([])
  })
});

export const exportPackageSchema = z.object({
  version: z.literal("0.1.0"),
  exportedAt: z.string().datetime(),
  providers: z.array(providerSchema),
  bindings: z.array(appBindingSchema),
  proxyPolicy: proxyPolicySchema,
  failoverChains: z.array(failoverChainSchema).default([]),
  snapshot: configSnapshotSchema.nullable()
});

export const hostCliDiscoverySchema = z.object({
  appCode: appCodeSchema,
  discovered: z.boolean(),
  executablePath: z.string().nullable(),
  configPath: z.string().nullable(),
  status: z.enum(["discovered", "missing", "path-anomaly"])
});

export const systemMetadataSchema = z.object({
  projectName: z.literal("AI CLI Switch"),
  releaseStage: z.enum(["bootstrap", "phase-1"]),
  repositoryMode: z.enum(["private-bootstrap", "open-source-ready"]),
  deliveryTargets: z.array(z.enum(["host-native", "docker-secondary"])),
  supportedLocales: z.array(localeCodeSchema),
  defaultLocale: localeCodeSchema,
  daemon: z.object({
    defaultHost: z.string().min(1),
    defaultPort: z.number().int().positive(),
    allowedOriginsEnvKey: z.string().min(1),
    defaultAllowedOrigins: z.array(z.string().min(1))
  }),
  webConsole: z.object({
    enabledOnDemand: z.boolean(),
    recommendedCommand: z.string().min(1),
    defaultPort: z.number().int().positive(),
    integratedIntoDaemon: z.boolean(),
    mountPath: z.string().min(1),
    authMode: z.enum(["token-cookie", "none"])
  })
});

export type ProviderType = z.infer<typeof providerTypeSchema>;
export type AppCode = z.infer<typeof appCodeSchema>;
export type LocaleCode = z.infer<typeof localeCodeSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type ProviderUpsert = z.infer<typeof providerUpsertSchema>;
export type AppBinding = z.infer<typeof appBindingSchema>;
export type AppBindingUpsert = z.infer<typeof appBindingUpsertSchema>;
export type ProxyPolicy = z.infer<typeof proxyPolicySchema>;
export type FailoverChain = z.infer<typeof failoverChainSchema>;
export type FailoverChainUpsert = z.infer<typeof failoverChainUpsertSchema>;
export type HostCliDiscovery = z.infer<typeof hostCliDiscoverySchema>;
export type SystemMetadata = z.infer<typeof systemMetadataSchema>;
export type ConfigSnapshot = z.infer<typeof configSnapshotSchema>;
export type ExportPackage = z.infer<typeof exportPackageSchema>;

export const nowIso = (): string => new Date().toISOString();

export const demoProviders: Provider[] = [
  {
    id: "provider-openai-main",
    name: "Primary OpenAI Gateway",
    providerType: "openai-compatible",
    baseUrl: "https://api.openai.example.com/v1",
    apiKeyMasked: "sk-****main",
    enabled: true,
    timeoutMs: 30_000,
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:00:00.000Z"
  },
  {
    id: "provider-anthropic-fallback",
    name: "Anthropic Fallback",
    providerType: "anthropic",
    baseUrl: "https://api.anthropic.example.com",
    apiKeyMasked: "ak-****back",
    enabled: true,
    timeoutMs: 45_000,
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:00:00.000Z"
  }
];

export const demoBindings: AppBinding[] = [
  {
    id: "binding-codex",
    appCode: "codex",
    providerId: "provider-openai-main",
    mode: "managed",
    updatedAt: "2026-03-21T00:00:00.000Z"
  },
  {
    id: "binding-claude-code",
    appCode: "claude-code",
    providerId: "provider-anthropic-fallback",
    mode: "observe",
    updatedAt: "2026-03-21T00:00:00.000Z"
  }
];

export const demoProxyPolicy: ProxyPolicy = {
  listenHost: "127.0.0.1",
  listenPort: 8788,
  enabled: false,
  requestTimeoutMs: 60_000,
  failureThreshold: 3
};

export const demoFailoverChains: FailoverChain[] = [
  {
    id: "failover-codex",
    appCode: "codex",
    enabled: false,
    providerIds: ["provider-openai-main"],
    cooldownSeconds: 30,
    maxAttempts: 2,
    updatedAt: "2026-03-21T00:00:00.000Z"
  },
  {
    id: "failover-claude-code",
    appCode: "claude-code",
    enabled: false,
    providerIds: ["provider-anthropic-fallback"],
    cooldownSeconds: 30,
    maxAttempts: 2,
    updatedAt: "2026-03-21T00:00:00.000Z"
  }
];

export const demoSystemMetadata: SystemMetadata = {
  projectName: "AI CLI Switch",
  releaseStage: "bootstrap",
  repositoryMode: "open-source-ready",
  deliveryTargets: ["host-native", "docker-secondary"],
  supportedLocales: ["zh-CN", "en-US"],
  defaultLocale: "zh-CN",
  daemon: {
    defaultHost: "127.0.0.1",
    defaultPort: 8787,
    allowedOriginsEnvKey: "ALLOWED_ORIGINS",
    defaultAllowedOrigins: [
      "http://127.0.0.1:8788",
      "http://localhost:8788"
    ]
  },
  webConsole: {
    enabledOnDemand: true,
    recommendedCommand: "ai-cli-switch web",
    defaultPort: 8788,
    integratedIntoDaemon: true,
    mountPath: "/ui",
    authMode: "token-cookie"
  }
};
