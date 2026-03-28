import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { clearAuthenticatedSession, isAuthenticatedRequest, writeAuthenticatedSession } from "./auth/control-auth.js";
import { renderControlLoginPage } from "./control-ui/login-page.js";
import { readUiAsset, readUiIndex } from "./control-ui/ui-assets.js";
import { registerRoutes } from "./api/routes.js";
import type { DaemonRuntime } from "./bootstrap/runtime.js";
import { registerProxyRoutes } from "./modules/proxy/proxy-http-handler.js";

export const buildDaemon = async (runtime: DaemonRuntime): Promise<FastifyInstance> => {
  const { env } = runtime;
  const readControlToken = (): string =>
    runtime.settingsRepository.getControlToken(env.envControlToken).value;
  const app = Fastify({
    logger: {
      level: "info"
    }
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined || env.allowAnyOrigin || env.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  });

  await registerRoutes(app, runtime);
  await registerProxyRoutes(app, runtime);

  app.post("/api/v1/auth/session", async (request, reply) => {
    const body = request.body as { token?: string } | undefined;

    if (body?.token !== readControlToken()) {
      reply.status(401).send({ message: "Unauthorized" });
      return;
    }

    writeAuthenticatedSession(reply, { controlToken: readControlToken() });
    reply.send({ ok: true });
  });

  app.post("/api/v1/auth/logout", async (_request, reply) => {
    clearAuthenticatedSession(reply);
    reply.send({ ok: true });
  });

  app.get("/api/v1/auth/state", async (request) => ({
    authenticated: isAuthenticatedRequest(request, { controlToken: readControlToken() }),
    controlUiMountPath: env.controlUiMountPath
  }));

  app.get("/metrics", async (_request, reply) => {
    reply
      .type("text/plain; version=0.0.4; charset=utf-8")
      .send(runtime.metricsService.renderPrometheusText());
  });

  app.addHook("onRequest", async (request, reply) => {
    const pathname = request.url.split("?")[0] ?? "/";
    const isPublicRoute =
      pathname === "/health" ||
      pathname === "/metrics" ||
      pathname === "/api/v1/auth/session" ||
      pathname === "/api/v1/auth/state" ||
      pathname === "/" ||
      pathname === env.controlUiMountPath ||
      pathname === `${env.controlUiMountPath}/login`;

    if (isPublicRoute) {
      return;
    }

    const needsProtectedSurface =
      pathname.startsWith("/api/") ||
      pathname.startsWith("/assets/") ||
      pathname === "/ai-cli-switch-runtime.js" ||
      pathname.startsWith(`${env.controlUiMountPath}/`) ||
      pathname === env.controlUiMountPath;

    if (!needsProtectedSurface) {
      return;
    }

    if (!isAuthenticatedRequest(request, { controlToken: readControlToken() })) {
      reply.status(401).send({ message: "Unauthorized" });
    }
  });

  app.get("/", async (request, reply) => {
    if (isAuthenticatedRequest(request, { controlToken: readControlToken() })) {
      reply.redirect(`${env.controlUiMountPath}/`);
      return;
    }

    reply.type("text/html; charset=utf-8").send(renderControlLoginPage(env.controlUiMountPath));
  });

  app.get("/ai-cli-switch-runtime.js", async (_request, reply) => {
    reply
      .type("text/javascript; charset=utf-8")
      .send(`window.AICLI_SWITCH_API_BASE_URL = ""; window.AICLI_SWITCH_CONTROL_UI_MOUNT_PATH = "${env.controlUiMountPath}";`);
  });

  app.get("/assets/:assetName", async (request, reply) => {
    const { assetName } = request.params as { assetName: string };
    const asset = await readUiAsset(`assets/${assetName}`);
    reply.type(asset.contentType).send(asset.body);
  });

  app.get(env.controlUiMountPath, async (_request, reply) => {
    reply.redirect(`${env.controlUiMountPath}/`);
  });

  app.get(`${env.controlUiMountPath}/`, async (request, reply) => {
    if (!isAuthenticatedRequest(request, { controlToken: readControlToken() })) {
      reply.redirect("/");
      return;
    }

    reply.type("text/html; charset=utf-8").send(await readUiIndex());
  });

  app.get(`${env.controlUiMountPath}/ai-cli-switch-runtime.js`, async (_request, reply) => {
    reply
      .type("text/javascript; charset=utf-8")
      .send(`window.AICLI_SWITCH_API_BASE_URL = ""; window.AICLI_SWITCH_CONTROL_UI_MOUNT_PATH = "${env.controlUiMountPath}";`);
  });

  app.get(`${env.controlUiMountPath}/assets/:assetName`, async (request, reply) => {
    const { assetName } = request.params as { assetName: string };
    const asset = await readUiAsset(`assets/${assetName}`);
    reply.type(asset.contentType).send(asset.body);
  });

  return app;
};
