import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { parse } from "../lib/validation.js";

const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = parse(loginSchema, request.body);
    const result = await pool.query(
      `SELECT id, email, display_name, password_hash, role, outlet_id
       FROM demo_users WHERE email = $1 AND active = TRUE`,
      [body.email],
    );
    const user = result.rows[0] as {
      id: string; email: string; display_name: string; password_hash: string;
      role: "admin" | "kitchen"; outlet_id: string | null;
    } | undefined;
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      throw new ApiError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
    }
    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      role: user.role,
      outletId: user.outlet_id,
    }, { expiresIn: "8h" });
    return {
      token,
      user: { id: user.id, email: user.email, name: user.display_name, role: user.role, outletId: user.outlet_id },
    };
  });

  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    const result = await pool.query(
      "SELECT id, email, display_name, role, outlet_id FROM demo_users WHERE id = $1 AND active = TRUE",
      [request.user.sub],
    );
    const user = result.rows[0] as { id: string; email: string; display_name: string; role: string; outlet_id: string | null } | undefined;
    if (!user) throw new ApiError(401, "This staff account is no longer active", "UNAUTHENTICATED");
    return { id: user.id, email: user.email, name: user.display_name, role: user.role, outletId: user.outlet_id };
  });
}
