import { buildApp } from "./app.js";
import { config } from "./config.js";
import { startOrderEventListener } from "./services/order-events.js";

const app = buildApp();

try {
  await startOrderEventListener();
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(`Tales of Hyderabad API listening on ${config.HOST}:${config.PORT}`);
} catch (error) {
  app.log.error(error, "Could not start Tales of Hyderabad API");
  process.exitCode = 1;
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down API");
  await app.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
