import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createLifeOsRepository } from "@life-os/database";

import { parseQuickAddWithHermes } from "../lib/hermes-client.js";
import { requireSession } from "../lib/require-session.js";

const bodySchema = z.object({
  input: z.string().min(1).max(1000)
});

export async function registerQuickAddRoutes(app: FastifyInstance): Promise<void> {
  const repository = createLifeOsRepository();

  app.post("/v1/quick-add", async (request, reply) => {
    const session = await requireSession(request);

    const parsedBody = bodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsedBody.error.flatten()
      });
    }

    const parsed = await parseQuickAddWithHermes(parsedBody.data.input);
    const result = await repository.recordQuickAdd({
      userId: session.userId,
      workspaceId: session.workspaceId
    }, {
      input: parsedBody.data.input,
      parsed
    });

    return reply.code(201).send(result);
  });

  app.get("/v1/timeline", async (request) => {
    const session = await requireSession(request);
    const items = await repository.listTimelineEntries({
      userId: session.userId,
      workspaceId: session.workspaceId
    });

    return {
      items
    };
  });
}
