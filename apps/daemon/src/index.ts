import { buildDaemon } from "./app.js";
import { initializeRuntime } from "./bootstrap/runtime.js";
import { resolveDaemonEnv } from "./config/env.js";

const bootstrap = async (): Promise<void> => {
  const env = resolveDaemonEnv();
  const runtime = initializeRuntime(env);
  const app = await buildDaemon(runtime);

  try {
    await app.listen({
      host: env.host,
      port: env.port
    });
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
        "AICLI_SWITCH_CONTROL_TOKEN not set; using persisted local control token from SQLite state"
      );
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void bootstrap();
