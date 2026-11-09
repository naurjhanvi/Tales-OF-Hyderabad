import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { config } from "./config.js";
import { pool } from "./db.js";
import { ApiError } from "./lib/errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerPromotionRoutes } from "./routes/promotions.js";
import { stopOrderEventListener } from "./services/order-events.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "development" ? "debug" : "info",
      redact: ["req.headers.authorization", "req.headers.x-order-tracking-token", "req.body.password"],
    },
    trustProxy: config.NODE_ENV === "production",
    bodyLimit: 1_048_576,
    requestTimeout: 30_000,
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready", database: "connected" };
    } catch {
      return reply.code(503).send({ status: "not_ready", database: "unavailable" });
    }
  });

  app.register(async (api) => {
    await api.register(cors, {
      origin: [
        config.FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
      ],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Order-Tracking-Token"],
      exposedHeaders: ["X-Request-Id"],
    });
    await api.register(jwt, { secret: config.JWT_SECRET });
    api.setErrorHandler((error, request, reply) => {
      if (error instanceof ApiError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
          requestId: request.id,
        });
      }
      const statusCode = error instanceof Error && "statusCode" in error
        ? (error as Error & { statusCode?: unknown }).statusCode
        : undefined;
      if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
        return reply.code(statusCode).send({
          error: { code: "BAD_REQUEST", message: statusCode === 400 ? "The request is invalid" : error instanceof Error ? error.message : "The request is invalid" },
          requestId: request.id,
        });
      }
      request.log.error({ err: error }, "Request failed");
      return reply.code(500).send({
        error: { code: "INTERNAL_ERROR", message: "The request could not be completed" },
        requestId: request.id,
      });
    });
    api.setNotFoundHandler((request, reply) => reply.code(404).send({
      error: { code: "NOT_FOUND", message: "API route was not found" },
      requestId: request.id,
    }));

    await registerAuthRoutes(api);
    await registerCatalogRoutes(api);
    await registerPromotionRoutes(api);
    await registerOrderRoutes(api);
  }, { prefix: "/api/v1" });

  app.addHook("onClose", async () => {
    await stopOrderEventListener();
    await pool.end();
  });
  return app;
}
