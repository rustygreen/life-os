import type { FastifyRequest } from "fastify";

import type { SessionRecord } from "@life-os/shared";
import { createLifeOsRepository } from "@life-os/database";

import { hashSessionToken } from "./auth.js";

const repository = createLifeOsRepository();

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireSession(request: FastifyRequest): Promise<SessionRecord> {
  const token = getBearerToken(request);

  if (!token) {
    throw request.server.httpErrors.unauthorized("Authentication required");
  }

  const session = await repository.getSessionByTokenHash(hashSessionToken(token));
  if (!session) {
    throw request.server.httpErrors.unauthorized("Invalid or expired session");
  }

  return session;
}

export async function getOptionalSession(
  request: FastifyRequest
): Promise<SessionRecord | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  return repository.getSessionByTokenHash(hashSessionToken(token));
}
