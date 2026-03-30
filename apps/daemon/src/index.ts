import { buildDaemon } from "./app.js";
import { initializeRuntime } from "./bootstrap/runtime.js";
import { resolveDaemonEnv } from "./config/env.js";

const bootstrap = async (): Promise<void> => {
  const env = resolveDaemonEnv();
  const runtime = initializeRuntime(env);
  const app = await buildDaemon(runtime);
  runtime.providerHealthProbeService.setLogger(app.log);
  const startupRecovery = runtime.hostDiscoveryService.getStartupRecovery();
  let shuttingDown = false;

  const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    app.log.info({ reason }, "daemon shutdown requested");
    runtime.providerHealthProbeService.stop();

    if (env.runMode === "foreground") {
      const cleanup = runtime.hostDiscoveryService.rollbackForegroundSessionConfigs();
      if (cleanup.items.length > 0) {
        app.log.info(
          {
            appCodes: cleanup.items.map((item) => item.appCode)
          },
          "rolled back foreground host takeover configs during shutdown"
        );
      }
      for (const failure of cleanup.failures) {
        app.log.error(failure, "failed to roll back foreground host takeover config during shutdown");
      }
    }

    try {
      await app.close();
    } catch (error) {
      app.log.error(error, "failed to close daemon app cleanly");
    }

    runtime.database.close();
    process.exit(exitCode);
  };

  try {
    if (startupRecovery !== null) {
      const logMethod = startupRecovery.failedApps.length > 0 ? app.log.warn.bind(app.log) : app.log.info.bind(app.log);
      logMethod(
        {
          rolledBackApps: startupRecovery.rolledBackApps,
          failedApps: startupRecovery.failedApps
        },
        startupRecovery.message
      );
    }

    await app.listen({
      host: env.host,
      port: env.port
    });
    runtime.providerHealthProbeService.start();
    app.log.info(
      {
        controlUiMountPath: env.controlUiMountPath,
        controlTokenSource: runtime.controlToken.source,
        allowedOrigins: env.allowedOrigins,
        dbPath: runtime.storagePaths.dbPath
      },
      "daemon runtime ready"
    );
    if (runtime.controlToken.source === "database" && env.envControlToken === null) {
      app.log.warn(
        { controlToken: runtime.controlToken.value },
        "CCSW_CONTROL_TOKEN not set; using persisted local control token from SQLite state"
      );
    }
    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    process.on("uncaughtException", (error) => {
      app.log.error(error, "uncaught exception");
      void shutdown("uncaughtException", 1);
    });
    process.on("unhandledRejection", (error) => {
      app.log.error(error, "unhandled rejection");
      void shutdown("unhandledRejection", 1);
    });
  } catch (error) {
    runtime.providerHealthProbeService.stop();
    app.log.error(error);
    runtime.database.close();
    process.exit(1);
  }
};

void bootstrap();
