import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SystemService } from "./system-service.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const createService = (runMode: "foreground" | "systemd-user" = "foreground") =>
  new SystemService(
    {
      runMode,
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
      dbPath: "/tmp/ccsw-data/cc-switch-web.sqlite"
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

test("syncServiceEnv writes the env file under cc-switch-web config and unit content pins workspace root", async () => {
  const tempHome = mkdtempSync(join(tmpdir(), "cc-switch-web-system-service-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  try {
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    const service = createService();
    const expectedEnvPath = join(tempHome, ".config/cc-switch-web/daemon.env");
    const unitContent = (
      service as unknown as {
        getSystemdUnitContent: () => string;
      }
    ).getSystemdUnitContent();

    const result = await service.syncServiceEnv();

    assert.equal(existsSync(expectedEnvPath), true);
    assert.equal(result.doctor.checks.files.envPath, expectedEnvPath);
    assert.equal(readFileSync(expectedEnvPath, "utf-8").includes("CCSW_DAEMON_PORT=8787"), true);
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

test("service doctor returns concrete restart and log commands when systemd unit is inactive", async () => {
  const tempHome = mkdtempSync(join(tmpdir(), "cc-switch-web-system-service-doctor-"));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;

  try {
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    const service = createService();
    const envPath = join(tempHome, ".config/cc-switch-web/daemon.env");
    const unitPath = join(tempHome, ".config/systemd/user/cc-switch-web.service");

    mkdirSync(dirname(envPath), { recursive: true });
    mkdirSync(dirname(unitPath), { recursive: true });
    writeFileSync(
      envPath,
      (
        service as unknown as {
          getSystemdEnvContent: () => string;
        }
      ).getSystemdEnvContent(),
      "utf-8"
    );
    writeFileSync(unitPath, "[Unit]\nDescription=CC Switch Web daemon\n", "utf-8");

    Object.assign(service as object, {
      runCaptured: async (_commandName: string, args: string[]) => {
        if (args[1] === "show-environment") {
          return { code: 0, stdout: "", stderr: "", error: null };
        }
        if (args[1] === "show") {
          return {
            code: 0,
            stdout:
              "LoadState=loaded\nActiveState=failed\nSubState=failed\nUnitFileState=enabled\nExecMainPID=0\n",
            stderr: "",
            error: null
          };
        }
        if (args[1] === "is-active") {
          return { code: 3, stdout: "failed\n", stderr: "", error: null };
        }
        return { code: 0, stdout: "", stderr: "", error: null };
      }
    });

    const result = await service.getServiceDoctor();

    assert.equal(result.checks.service.active, false);
    assert.equal(
      result.checks.recommendedActions.includes(
        "run `ccsw daemon service start` or `ccsw daemon service restart`, then inspect `ccsw daemon service logs --lines 200` if startup still fails"
      ),
      true
    );
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
