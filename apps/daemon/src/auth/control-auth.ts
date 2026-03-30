import type { FastifyReply, FastifyRequest } from "fastify";

const CONTROL_AUTH_COOKIE = "cc-switch-web_control_token";

export interface ControlAuthContext {
  readonly controlToken: string;
}

const readBearerToken = (request: FastifyRequest): string | null => {
  const authorization = request.headers.authorization?.trim();

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
};

export const isAuthenticatedRequest = (
  request: FastifyRequest,
  context: ControlAuthContext
): boolean => {
  const cookieToken = request.cookies[CONTROL_AUTH_COOKIE];
  const bearerToken = readBearerToken(request);

  return cookieToken === context.controlToken || bearerToken === context.controlToken;
};

export const writeAuthenticatedSession = (
  reply: FastifyReply,
  context: ControlAuthContext
): void => {
  reply.setCookie(CONTROL_AUTH_COOKIE, context.controlToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false
  });
};

export const clearAuthenticatedSession = (reply: FastifyReply): void => {
  reply.clearCookie(CONTROL_AUTH_COOKIE, {
    path: "/"
  });
};
