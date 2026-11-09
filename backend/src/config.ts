import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  TRACKING_TOKEN_SECRET: z.string().min(32),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  DEMO_ADMIN_EMAIL: z.string().email(),
  DEMO_ADMIN_PASSWORD: z.string().min(12),
  DEMO_KITCHEN_PASSWORD: z.string().min(12),
});

export const config = envSchema.parse(process.env);
