import type { LocaleCode } from "@ai-cli-switch/shared";

import { enUSMessages } from "./locales/en-US.js";
import { zhCNMessages } from "./locales/zh-CN.js";

export interface MessageSchema {
  readonly common: {
    readonly loading: string;
    readonly notFound: string;
    readonly enabled: string;
    readonly disabled: string;
    readonly managed: string;
    readonly observe: string;
    readonly save: string;
    readonly refresh: string;
    readonly delete: string;
    readonly import: string;
    readonly export: string;
    readonly restore: string;
  };
  readonly app: {
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly languageLabel: string;
    readonly openSourceHint: string;
    readonly localeSummary: string;
  };
  readonly dashboard: {
    readonly backendErrorTitle: string;
    readonly loadingTitle: string;
    readonly loadingDescription: string;
    readonly runtimeTitle: string;
    readonly controlTokenTitle: string;
    readonly controlTokenDescription: string;
    readonly controlTokenPlaceholder: string;
    readonly controlTokenSave: string;
    readonly metrics: {
      readonly serviceStatus: string;
      readonly providerCount: string;
      readonly bindingCount: string;
      readonly discoveryCount: string;
      readonly proxyRequestCount: string;
      readonly providerHint: string;
      readonly bindingHint: string;
      readonly discoveryHint: string;
      readonly proxyRequestHint: string;
    };
    readonly panels: {
      readonly providers: string;
      readonly bindings: string;
      readonly failoverChains: string;
      readonly discoveries: string;
      readonly proxyRuntime: string;
      readonly requestLogs: string;
      readonly productMeta: string;
      readonly recovery: string;
      readonly actions: string;
    };
    readonly runtime: {
      readonly proxyReloadedAt: string;
      readonly credentialReady: string;
      readonly credentialMissing: string;
      readonly proxySnapshot: string;
      readonly noProxyTraffic: string;
      readonly noProxyTrafficHint: string;
    };
    readonly forms: {
      readonly providerTitle: string;
      readonly bindingTitle: string;
      readonly failoverTitle: string;
      readonly proxyTitle: string;
      readonly id: string;
      readonly name: string;
      readonly providerType: string;
      readonly baseUrl: string;
      readonly apiKey: string;
      readonly timeoutMs: string;
      readonly appCode: string;
      readonly providerId: string;
      readonly failoverProviderIds: string;
      readonly mode: string;
      readonly cooldownSeconds: string;
      readonly maxAttempts: string;
      readonly listenHost: string;
      readonly listenPort: string;
      readonly requestTimeoutMs: string;
      readonly failureThreshold: string;
      readonly saveSuccess: string;
      readonly deleteSuccess: string;
      readonly exportTitle: string;
      readonly exportSuccess: string;
      readonly importTitle: string;
      readonly importPlaceholder: string;
      readonly importSuccess: string;
      readonly restoreSuccess: string;
      readonly restoreHint: string;
    };
  };
}

export const messages = {
  "zh-CN": zhCNMessages,
  "en-US": enUSMessages
} as const satisfies Record<LocaleCode, MessageSchema>;

export type MessageTree = MessageSchema;
