import type { FastifyRequest } from "fastify";
import { ApiError } from "./errors.js";

export type StaffRole = "admin" | "kitchen";

export async function authenticate(request: FastifyRequest) {
  try {
    await request.jwtVerify();
  } catch {
    throw new ApiError(401, "Sign in with a staff account to continue", "UNAUTHENTICATED");
  }
};

export function requireRoles(...roles: StaffRole[]) {
  return async (request: FastifyRequest) => {
    await authenticate(request);
    if (!roles.includes(request.user.role)) {
      throw new ApiError(403, "Your account cannot perform this action", "FORBIDDEN");
    }
  };
}

export function requireOutletAccess(request: FastifyRequest, outletId: string) {
  if (request.user.role === "kitchen" && request.user.outletId !== outletId) {
    throw new ApiError(403, "Kitchen accounts can only access their assigned outlet", "OUTLET_FORBIDDEN");
  }
}
