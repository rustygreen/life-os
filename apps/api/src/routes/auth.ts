import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createLifeOsRepository } from "@life-os/database";

import {
  createSessionExpiry,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from "../lib/auth.js";
import { requireSession } from "../lib/require-session.js";

const repository = createLifeOsRepository();

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
  workspaceName: z.string().trim().min(1).max(120)
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200)
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/auth/registration", async () => {
    const userCount = await repository.countUsers();
    const selfRegistrationEnabled = await repository.isSelfRegistrationEnabled();
    const bootstrapRequired = userCount === 0;

    return {
      selfRegistrationEnabled,
      bootstrapRequired,
      canSelfRegister: bootstrapRequired || selfRegistrationEnabled
    };
  });

  app.post("/v1/auth/register", async (request, reply) => {
    const parsedBody = registerSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsedBody.error.flatten()
      });
    }

    const userCount = await repository.countUsers();
    const selfRegistrationEnabled = await repository.isSelfRegistrationEnabled();
    if (userCount > 0 && !selfRegistrationEnabled) {
      return reply.code(403).send({
        error: "Self registration is currently disabled. Contact an administrator."
      });
    }

    try {
      const account = await repository.bootstrapAccount({
        email: parsedBody.data.email,
        displayName: parsedBody.data.displayName,
        passwordHash: hashPassword(parsedBody.data.password),
        workspaceName: parsedBody.data.workspaceName
      });

      const sessionToken = createSessionToken();
      const expiresAt = createSessionExpiry();
      const session = await repository.createSession({
        userId: account.userId,
        workspaceId: account.workspaceId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt
      });

      return reply.code(201).send({
        token: sessionToken,
        expiresAt: session.expiresAt,
        account
      });
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
        return reply.code(409).send({
          error: "An account with that email already exists."
        });
      }

      throw error;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsedBody = loginSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsedBody.error.flatten()
      });
    }

    const user = await repository.findUserForLogin(parsedBody.data.email);
    if (!user || !verifyPassword(parsedBody.data.password, user.password_hash)) {
      return reply.code(401).send({
        error: "Invalid email or password."
      });
    }

    const account = await repository.getPrimaryAccountForUser(user.id);
    const sessionToken = createSessionToken();
    const expiresAt = createSessionExpiry();
    const session = await repository.createSession({
      userId: account.userId,
      workspaceId: account.workspaceId,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt
    });

    return {
      token: sessionToken,
      expiresAt: session.expiresAt,
      account
    };
  });

  app.get("/v1/auth/me", async (request) => {
    const session = await requireSession(request);

    return {
      account: {
        userId: session.userId,
        email: session.email,
        displayName: session.displayName,
        workspaceId: session.workspaceId,
        workspaceSlug: session.workspaceSlug,
        workspaceName: session.workspaceName,
        role: session.role
      },
      expiresAt: session.expiresAt
    };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const session = await requireSession(request);
    await repository.revokeSession(session.sessionId);
    return reply.code(204).send();
  });
}
