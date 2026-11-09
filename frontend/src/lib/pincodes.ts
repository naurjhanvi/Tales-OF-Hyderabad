import type { Outlet } from "@/data/types";

export interface PincodeLookup {
  status: "invalid" | "unsupported" | "ok";
  outletId?: string;
}

export function lookupPincode(input: string, outlets: Outlet[]): PincodeLookup {
  const pin = input.trim();
  if (!/^[1-9]\d{5}$/.test(pin)) return { status: "invalid" };
  const outlet = outlets.find((item) => item.pincodes.includes(pin));
  return outlet ? { status: "ok", outletId: outlet.id } : { status: "unsupported" };
}
