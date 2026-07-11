import Fastify from "fastify";
import fastifySensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import { z } from "zod";

import { createHermesEngine } from "@life-os/ai";

const port = Number(process.env.HERMES_PORT ?? 4010);
const apiToken = process.env.HERMES_API_TOKEN;

const app = Fastify({
  logger: true
});

await app.register(fastifySensible);
await app.register(helmet);

const engine = createHermesEngine();

const parseBodySchema = z.object({
  input: z.string().min(1).max(1000)
});

app.get("/health", async () => ({
  status: "ok",
  service: "hermes"
}));

app.post("/v1/parse-quick-add", async (request, reply) => {
  if (apiToken) {
    const received = request.headers["x-hermes-api-token"];
    if (received !== apiToken) {
      return reply.code(401).send({
        error: "Unauthorized"
      });
    }
  }

  const parsedBody = parseBodySchema.safeParse(request.body);
  if (!parsedBody.success) {
    return reply.code(400).send({
      error: "Invalid request body",
      details: parsedBody.error.flatten()
    });
  }

  const parsed = await engine.parseQuickAdd(parsedBody.data.input);
  return {
    parsed
  };
});

const close = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

try {
  await app.listen({
    host: "0.0.0.0",
    port
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
