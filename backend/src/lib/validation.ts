import type { ZodType } from "zod";
import { ApiError } from "./errors.js";

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, "Request validation failed", "VALIDATION_ERROR", result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })));
  }
  return result.data;
}

export function rupeesToPaise(amount: number): number {
  return Math.round(amount * 100);
}

export function paiseToRupees(amount: number): number {
  return amount / 100;
}
