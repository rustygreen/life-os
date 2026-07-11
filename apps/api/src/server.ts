import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifySensible from "@fastify/sensible";

import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerQuickAddRoutes } from "./routes/quick-add.js";

const port = Number(process.env.API_PORT ?? 4000);
const allowedOrigins = (process.env.API_CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 1024 * 1024
});

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, allowedOrigins.includes(origin));
  }
});
await app.register(helmet);
await app.register(fastifySensible);
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.API_RATE_LIMIT_MAX ?? 600),
  timeWindow: process.env.API_RATE_LIMIT_WINDOW ?? "1 minute"
});

await registerAuthRoutes(app);
await registerAdminRoutes(app);
await registerHealthRoutes(app);
await registerQuickAddRoutes(app);

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
