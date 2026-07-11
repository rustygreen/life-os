import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLifeOsRepository } from "@life-os/database";

import { hashPassword } from "../lib/auth.js";
import { requireSession } from "../lib/require-session.js";

const repository = createLifeOsRepository();

const selfRegistrationSchema = z.object({
  enabled: z.boolean()
});

const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(["member", "owner"]).default("member")
});

async function requireOwner(app: FastifyInstance, request: FastifyRequest) {
  const session = await requireSession(request);
  if (session.role !== "owner") {
    throw app.httpErrors.forbidden("Owner role required");
  }

  return session;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/admin/settings", async (request) => {
    await requireOwner(app, request);
    const selfRegistrationEnabled = await repository.isSelfRegistrationEnabled();

    return {
      selfRegistrationEnabled
    };
  });

  app.put("/v1/admin/settings/self-registration", async (request, reply) => {
    await requireOwner(app, request);
    const parsedBody = selfRegistrationSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsedBody.error.flatten()
      });
    }

    const enabled = await repository.setSelfRegistrationEnabled(parsedBody.data.enabled);
    return {
      selfRegistrationEnabled: enabled
    };
  });

  app.get("/v1/admin/users", async (request) => {
    const session = await requireOwner(app, request);
    const users = await repository.listWorkspaceUsers(session.workspaceId);
    return { users };
  });

  app.post("/v1/admin/users", async (request, reply) => {
    const session = await requireOwner(app, request);
    const parsedBody = createUserSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsedBody.error.flatten()
      });
    }

    try {
      const user = await repository.createUserInWorkspace({
        workspaceId: session.workspaceId,
        email: parsedBody.data.email,
        displayName: parsedBody.data.displayName,
        passwordHash: hashPassword(parsedBody.data.password),
        role: parsedBody.data.role
      });

      return reply.code(201).send({ user });
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
        return reply.code(409).send({
          error: "An account with that email already exists."
        });
      }

      throw error;
    }
  });
}