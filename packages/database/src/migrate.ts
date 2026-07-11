import { runMigrations } from "./index.js";

try {
  await runMigrations();
  console.log("Database migrations completed.");
  process.exit(0);
} catch (error) {
  console.error("Database migrations failed.", error);
  process.exit(1);
}
