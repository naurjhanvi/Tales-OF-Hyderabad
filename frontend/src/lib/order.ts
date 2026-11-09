import type { Order, OrderStatus } from "@/data/types";

export interface OrderStep {
  id: OrderStatus;
  label: string;
  hint: string;
}

export const ORDER_STEPS: OrderStep[] = [
  { id: "placed", label: "Placed", hint: "We have your order" },
  { id: "accepted", label: "Accepted", hint: "Kitchen confirmed the order" },
  { id: "preparing", label: "Preparing", hint: "Dum in progress" },
  { id: "ready", label: "Ready", hint: "Packed and waiting for delivery" },
  { id: "out_for_delivery", label: "Out for delivery", hint: "On the way to you" },
];

export function statusIndex(status: OrderStatus): number {
  if (status === "delivered") return ORDER_STEPS.length;
  const idx = ORDER_STEPS.findIndex((s) => s.id === status);
  return idx === -1 ? 0 : idx;
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  if (status === "delivered") return null;
  if (status === "placed" || status === "accepted") return "preparing";
  const idx = ORDER_STEPS.findIndex((s) => s.id === status);
  if (idx === -1 || idx === ORDER_STEPS.length - 1) return null;
  return ORDER_STEPS[idx + 1]?.id ?? null;
}

export function statusActionLabel(next: OrderStatus): string {
  switch (next) {
    case "preparing":
      return "Accept & begin prep";
    case "ready":
      return "Mark ready";
    case "out_for_delivery":
      return "Out for delivery";
    default:
      return "Advance";
  }
}

export function isOrderLate(order: Order, now: number): boolean {
  if (
    order.status === "ready" ||
    order.status === "out_for_delivery" ||
    order.status === "delivered"
  ) {
    return false;
  }
  return now > order.expectedReadyAt;
}
