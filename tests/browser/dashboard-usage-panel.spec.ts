import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const controlToken = process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token";
type AppCode = "codex" | "claude-code" | "gemini-cli" | "opencode" | "openclaw";

const loginToDashboard = async (page: Page): Promise<void> => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CC Switch Web" })).toBeVisible();
  await page.locator("#tokenInput").fill(controlToken);
  await page.getByRole("button", { name: /进入控制台 \/ Open Console/ }).click();
  await expect(
    page.getByRole("button", { name: /展开高级面板|Show Advanced Panels/ }).first()
  ).toBeVisible();
};

const ensureUsagePanelVisible = async (page: Page): Promise<void> => {
  const usagePanel = page.getByTestId("usage-panel");
  if (!(await usagePanel.isVisible())) {
    await page.getByRole("button", { name: /展开高级面板|Show Advanced Panels/ }).first().click();
  }

  await usagePanel.scrollIntoViewIfNeeded();
  await expect(usagePanel).toBeVisible();
};

const upsertProvider = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly name: string;
    readonly baseUrl: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/providers", {
    data: {
      ...payload,
      providerType: "openai-compatible",
      apiKey: `sk-${payload.id}`,
      enabled: true,
      timeoutMs: 30_000
    }
  });
  expect(response.ok()).toBeTruthy();
};

const loadExistingBindingId = async (
  request: APIRequestContext,
  appCode: AppCode
): Promise<string | null> => {
  const response = await request.get("/api/v1/app-bindings");
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    readonly items: Array<{
      readonly id: string;
      readonly appCode: AppCode;
    }>;
  };

  return payload.items.find((item) => item.appCode === appCode)?.id ?? null;
};

const upsertBinding = async (
  request: APIRequestContext,
  payload: {
    readonly id: string;
    readonly appCode: AppCode;
    readonly providerId: string;
  }
): Promise<void> => {
  const response = await request.post("/api/v1/app-bindings", {
    data: {
      ...payload,
      mode: "managed",
      promptTemplateId: null,
      skillId: null
    }
  });
  expect(response.ok()).toBeTruthy();
};

const loadProxyPolicy = async (
  request: APIRequestContext
): Promise<{
  readonly policy: {
    readonly listenHost: string;
    readonly listenPort: number;
    readonly enabled: boolean;
    readonly requestTimeoutMs: number;
    readonly failureThreshold: number;
  };
}> => {
  const response = await request.get("/api/v1/proxy-policy");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    readonly policy: {
      readonly listenHost: string;
      readonly listenPort: number;
      readonly enabled: boolean;
      readonly requestTimeoutMs: number;
      readonly failureThreshold: number;
    };
  };
};

const saveProxyPolicy = async (
  request: APIRequestContext,
  policy: {
    readonly listenHost: string;
    readonly listenPort: number;
    readonly enabled: boolean;
    readonly requestTimeoutMs: number;
    readonly failureThreshold: number;
  }
): Promise<void> => {
  const response = await request.put("/api/v1/proxy-policy", {
    data: policy
  });
  expect(response.ok()).toBeTruthy();
};

const postProxyCompletion = async (
  request: APIRequestContext,
  payload: {
    readonly appCode: AppCode;
    readonly model: string;
  }
): Promise<void> => {
  const response = await request.post(`/proxy/${encodeURIComponent(payload.appCode)}/v1/chat/completions`, {
    data: {
      model: payload.model,
      messages: [
        {
          role: "user",
          content: `usage smoke ${payload.model}`
        }
      ]
    }
  });
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBeTruthy();
};

const loadUsageRecords = async (
  request: APIRequestContext
): Promise<
  Array<{
    readonly id: number;
    readonly appCode: AppCode;
    readonly providerId: string | null;
    readonly model: string;
  }>
> => {
  const response = await request.get("/api/v1/usage/records?limit=50&offset=0");
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    readonly items: Array<{
      readonly id: number;
      readonly appCode: AppCode;
      readonly providerId: string | null;
      readonly model: string;
    }>;
  };

  return payload.items;
};

const readRequestBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const createUsageUpstream = async (): Promise<{
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}> => {
  const usageByModel = new Map<
    string,
    {
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  >([
    ["pw-usage-model-opencode-a", { inputTokens: 10, outputTokens: 5 }],
    ["pw-usage-model-opencode-b", { inputTokens: 20, outputTokens: 10 }],
    ["pw-usage-model-openclaw", { inputTokens: 40, outputTokens: 20 }]
  ]);

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "Not Found" }));
      return;
    }

    const body = (await readRequestBody(request)) as { readonly model?: string } | null;
    const model = typeof body?.model === "string" ? body.model : "unknown-model";
    const usage = usageByModel.get(model) ?? { inputTokens: 1, outputTokens: 1 };
    const responseBody = JSON.stringify({
      id: `chatcmpl-${model}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: `reply for ${model}`
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: usage.inputTokens,
        completion_tokens: usage.outputTokens,
        total_tokens: usage.inputTokens + usage.outputTokens
      }
    });

    response.writeHead(200, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(responseBody))
    });
    response.end(responseBody);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
};

test("usage panel keeps summary, filters, and record focus aligned with live proxy traffic", async ({
  page
}) => {
  const upstream = await createUsageUpstream();
  let originalProxyPolicy:
    | {
        readonly listenHost: string;
        readonly listenPort: number;
        readonly enabled: boolean;
        readonly requestTimeoutMs: number;
        readonly failureThreshold: number;
      }
    | null = null;

  try {
    const request = page.context().request;
    const opencodeProviderId = "pw-usage-provider-opencode";
    const openclawProviderId = "pw-usage-provider-openclaw";
    const opencodeBindingId = "binding-opencode";
    const openclawBindingId = "binding-openclaw";

    await loginToDashboard(page);
    originalProxyPolicy = (await loadProxyPolicy(request)).policy;
    await saveProxyPolicy(request, {
      ...originalProxyPolicy,
      enabled: true
    });

    await upsertProvider(request, {
      id: opencodeProviderId,
      name: "Playwright Usage Provider Opencode",
      baseUrl: upstream.baseUrl
    });
    await upsertProvider(request, {
      id: openclawProviderId,
      name: "Playwright Usage Provider OpenClaw",
      baseUrl: upstream.baseUrl
    });

    await upsertBinding(request, {
      id: (await loadExistingBindingId(request, "opencode")) ?? opencodeBindingId,
      appCode: "opencode",
      providerId: opencodeProviderId
    });
    await upsertBinding(request, {
      id: (await loadExistingBindingId(request, "openclaw")) ?? openclawBindingId,
      appCode: "openclaw",
      providerId: openclawProviderId
    });

    await postProxyCompletion(request, {
      appCode: "opencode",
      model: "pw-usage-model-opencode-a"
    });
    await postProxyCompletion(request, {
      appCode: "opencode",
      model: "pw-usage-model-opencode-b"
    });
    await postProxyCompletion(request, {
      appCode: "openclaw",
      model: "pw-usage-model-openclaw"
    });

    let openclawRecordId: number | null = null;
    await expect
      .poll(async () => {
        const records = await loadUsageRecords(request);
        openclawRecordId = records.find((item) => item.model === "pw-usage-model-openclaw")?.id ?? null;
        return openclawRecordId !== null;
      })
      .toBe(true);
    expect(openclawRecordId).not.toBeNull();

    await page.reload();
    await ensureUsagePanelVisible(page);

    await expect(page.getByTestId(`usage-breakdown-provider-${opencodeProviderId}`)).toContainText("45");
    await expect(page.getByTestId(`usage-breakdown-provider-${openclawProviderId}`)).toContainText("60");

    await page.getByTestId(`usage-breakdown-provider-filter-${opencodeProviderId}`).click();

    await expect(page.getByTestId("usage-filter-summary")).toContainText(opencodeProviderId);
    await expect(page.getByTestId("usage-filter-provider")).toHaveValue(opencodeProviderId);
    await expect(page.getByTestId("usage-summary-total-requests")).toContainText("2");
    await expect(page.getByTestId("usage-summary-total-tokens")).toContainText("45");
    await expect(page.getByTestId("usage-records-list")).toContainText("pw-usage-model-opencode-a");
    await expect(page.getByTestId("usage-records-list")).toContainText("pw-usage-model-opencode-b");
    await expect(page.getByTestId("usage-records-list")).not.toContainText("pw-usage-model-openclaw");

    await page.getByTestId("usage-clear-button").click();
    await expect(page.getByTestId("usage-filter-summary")).not.toBeVisible();

    const records = await loadUsageRecords(request);
    const openclawRecord = records.find((item) => item.model === "pw-usage-model-openclaw");
    expect(openclawRecord?.id).toBe(openclawRecordId);

    await page.getByTestId(`usage-record-focus-${openclawRecordId}`).click();

    await expect(page.getByTestId("usage-filter-app")).toHaveValue("openclaw");
    await expect(page.getByTestId("usage-filter-provider")).toHaveValue(openclawProviderId);
    await expect(page.getByTestId("usage-filter-model")).toHaveValue("pw-usage-model-openclaw");
    await expect(page.getByTestId("usage-summary-total-requests")).toContainText("1");
    await expect(page.getByTestId("usage-summary-total-tokens")).toContainText("60");
    await expect(page.getByTestId("usage-records-list")).toContainText("pw-usage-model-openclaw");
    await expect(page.getByTestId("usage-records-list")).not.toContainText("pw-usage-model-opencode-a");
  } finally {
    if (originalProxyPolicy !== null) {
      const request = page.context().request;
      await saveProxyPolicy(request, originalProxyPolicy).catch(() => undefined);
    }
    await upstream.close();
  }
});
