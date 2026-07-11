import { QueueEvents, Worker } from "bullmq";

const connection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  maxRetriesPerRequest: null
};

const queueName = "life-os-jobs";

const queueEvents = new QueueEvents(queueName, { connection });

const worker = new Worker(
  queueName,
  async (job) => {
    console.log(`[worker] processed job ${job.name}`, job.data);
  },
  { connection }
);

worker.on("ready", () => {
  console.log("[worker] ready");
});

worker.on("failed", (job, error) => {
  console.error("[worker] job failed", job?.id, error);
});

const shutdown = async () => {
  await queueEvents.close();
  await worker.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
