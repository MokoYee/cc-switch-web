import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SystemService } from "./system-service.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const createService = () =>
  new SystemService(
    {
      runMode: "foreground",
      host: "127.0.0.1",
      port: 8787,
      allowedOrigins: ["http://127.0.0.1:8788"],
      allowAnyOrigin: false,
      envControlToken: null,
      controlUiMountPath: "/ui",
      healthProbeIntervalMs: 15_000,
      workspaceScanRoots: [],
      workspaceScanDepth: 2,
      sessionStaleMs: 7 * 24 * 60 * 60 * 1000
    },
    {
      dataDir: "/tmp/ccsw-data",
      dbPath: "/tmp/ccsw-data/ai-cli-switch.sqlite"
    },
    {
      latest: () => null
    } as never,
    {
      getControlToken: () => ({
        value: "test-control-token",
        source: "database"
      })
    } as never,
    {
      append: () => undefined
    } as never
  );

test("syncServiceEnv writes the env file under ai-cli-switch config and unit content pins workspace root", async () => {
  const tempHome = mkdtempSync(join(tmpdir(), "cc-switch-web-system-service-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  try {
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    const service = createService();
    const expectedEnvPath = join(tempHome, ".config/ai-cli-switch/daemon.env");
    const unitContent = (
      service as unknown as {
        getSystemdUnitContent: () => string;
      }
    ).getSystemdUnitContent();

    const result = await service.syncServiceEnv();

    assert.equal(existsSync(expectedEnvPath), true);
    assert.equal(result.doctor.checks.files.envPath, expectedEnvPath);
    assert.equal(readFileSync(expectedEnvPath, "utf-8").includes("AICLI_SWITCH_DAEMON_PORT=8787"), true);
    assert.equal(unitContent.includes(`WorkingDirectory=${workspaceRoot}`), true);
    assert.equal(unitContent.includes(`EnvironmentFile=-${expectedEnvPath}`), true);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }

    rmSync(tempHome, { recursive: true, force: true });
  }
});
