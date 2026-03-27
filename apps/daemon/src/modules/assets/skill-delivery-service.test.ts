import assert from "node:assert/strict";
import test from "node:test";

import { SkillDeliveryService } from "./skill-delivery-service.js";

test("lists stable skill delivery capabilities for proxy-ready and planned apps", () => {
  const service = new SkillDeliveryService();

  const capabilities = service.listCapabilities();
  const codex = capabilities.find((item) => item.appCode === "codex");
  const gemini = capabilities.find((item) => item.appCode === "gemini-cli");
  const opencode = capabilities.find((item) => item.appCode === "opencode");

  assert.equal(capabilities.length, 5);
  assert.deepEqual(
    capabilities.filter((item) => item.supportLevel === "proxy-only").map((item) => item.appCode),
    ["codex", "claude-code", "gemini-cli"]
  );
  assert.deepEqual(
    capabilities.filter((item) => item.supportLevel === "planned").map((item) => item.appCode),
    ["opencode", "openclaw"]
  );
  assert.equal(codex?.recommendedPath, "active-context-injection");
  assert.equal(gemini?.hostWriteSupported, false);
  assert.equal(opencode?.recommendedPath, "wait-for-stable-host-contract");
});
