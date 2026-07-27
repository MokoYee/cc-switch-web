import type { ProviderUpsert } from "cc-switch-web-shared";

export interface ProviderPreset {
  readonly key: string;
  readonly label: string;
  readonly providerType: ProviderUpsert["providerType"];
  readonly baseUrl: string;
  readonly defaultModel: string | null;
  readonly responsesApiMode: NonNullable<ProviderUpsert["responsesApiMode"]>;
  readonly credentialHintZh: string;
  readonly credentialHintEn: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    key: "openai-official",
    label: "OpenAI (official)",
    providerType: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: null,
    responsesApiMode: "passthrough",
    credentialHintZh: "使用 platform.openai.com 生成的 API Key（sk-...）。",
    credentialHintEn: "Use an API key generated on platform.openai.com (sk-...)."
  },
  {
    key: "anthropic-official",
    label: "Anthropic (official)",
    providerType: "anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: null,
    responsesApiMode: "auto",
    credentialHintZh: "使用 console.anthropic.com 生成的 API Key（sk-ant-...）。",
    credentialHintEn: "Use an API key generated on console.anthropic.com (sk-ant-...)."
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    providerType: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    responsesApiMode: "auto",
    credentialHintZh: "使用 platform.deepseek.com 的 API Key。",
    credentialHintEn: "Use an API key from platform.deepseek.com."
  },
  {
    key: "moonshot",
    label: "Moonshot Kimi",
    providerType: "openai-compatible",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2-turbo-preview",
    responsesApiMode: "auto",
    credentialHintZh: "使用 platform.moonshot.cn 的 API Key。",
    credentialHintEn: "Use an API key from platform.moonshot.cn."
  },
  {
    key: "zhipu-glm",
    label: "智谱 GLM",
    providerType: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4.6",
    responsesApiMode: "auto",
    credentialHintZh: "使用 open.bigmodel.cn 的 API Key。",
    credentialHintEn: "Use an API key from open.bigmodel.cn."
  },
  {
    key: "qwen-dashscope",
    label: "Qwen (DashScope)",
    providerType: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen3-coder-plus",
    responsesApiMode: "auto",
    credentialHintZh: "使用阿里云百炼 (DashScope) 的 API Key。",
    credentialHintEn: "Use an Alibaba Cloud DashScope API key."
  },
  {
    key: "siliconflow",
    label: "SiliconFlow",
    providerType: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: null,
    responsesApiMode: "auto",
    credentialHintZh: "使用 cloud.siliconflow.cn 的 API Key。",
    credentialHintEn: "Use an API key from cloud.siliconflow.cn."
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    providerType: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: null,
    responsesApiMode: "auto",
    credentialHintZh: "使用 openrouter.ai 的 API Key（sk-or-...）。",
    credentialHintEn: "Use an API key from openrouter.ai (sk-or-...)."
  }
];

export const findProviderPreset = (key: string): ProviderPreset | null =>
  PROVIDER_PRESETS.find((preset) => preset.key === key) ?? null;

export const applyProviderPreset = (
  form: ProviderUpsert,
  preset: ProviderPreset
): ProviderUpsert => ({
  ...form,
  providerType: preset.providerType,
  baseUrl: preset.baseUrl,
  defaultModel: preset.defaultModel,
  responsesApiMode: preset.responsesApiMode,
  name:
    form.name.trim().length === 0 || form.name === "Primary Provider"
      ? preset.label
      : form.name
});

export interface ModelMappingParseResult {
  readonly mapping: Record<string, string>;
  readonly invalidLines: readonly string[];
}

export const formatModelMappingText = (
  mapping: Record<string, string> | undefined
): string =>
  Object.entries(mapping ?? {})
    .map(([source, upstreamModel]) => `${source} = ${upstreamModel}`)
    .join("\n");

export const parseModelMappingText = (rawText: string): ModelMappingParseResult => {
  const mapping: Record<string, string> = {};
  const invalidLines: string[] = [];

  for (const rawLine of rawText.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      invalidLines.push(line);
      continue;
    }

    const source = line.slice(0, separatorIndex).trim();
    const upstreamModel = line.slice(separatorIndex + 1).trim();
    if (source.length === 0 || upstreamModel.length === 0) {
      invalidLines.push(line);
      continue;
    }

    mapping[source] = upstreamModel;
  }

  return { mapping, invalidLines };
};

export const serializeModelMapping = (mapping: Record<string, string> | undefined): string =>
  JSON.stringify(
    Object.entries(mapping ?? {}).sort(([left], [right]) => left.localeCompare(right))
  );
