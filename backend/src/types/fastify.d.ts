import "@fastify/jwt";

type StaffRole = "admin" | "kitchen";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: StaffRole; outletId: string | null };
    user: { sub: string; email: string; role: StaffRole; outletId: string | null };
  }
}

export {};
