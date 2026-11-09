import type { CartLine, MenuItem, OrderTotals } from "@/data/types";

export const GST_RATE = 5;
export const DELIVERY_FEE = 39;

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function gstComponent(totalInclGst: number): number {
  return Math.round((totalInclGst * GST_RATE) / (100 + GST_RATE));
}

export function cartTotals(lines: CartLine[], configuredDeliveryFee = DELIVERY_FEE): OrderTotals {
  const itemsTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const deliveryFee = lines.length > 0 ? configuredDeliveryFee : 0;
  const gstIncluded = lines.reduce((sum, l) => sum + gstComponent(l.unitPrice) * l.qty, 0);
  return {
    itemsTotal,
    deliveryFee,
    discount: 0,
    total: itemsTotal + deliveryFee,
    gstIncluded,
  };
}

export function lineDescription(line: CartLine): string {
  const parts: string[] = [];
  if (line.portionLabel) parts.push(line.portionLabel);
  if (line.spiceLabel) parts.push(line.spiceLabel);
  if (line.addOns.length > 0) {
    parts.push(`+ ${line.addOns.map((a) => a.label).join(", ")}`);
  }
  return parts.join(" · ");
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function orderCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `TOH-${code}`;
}

export function defaultPortionId(item: MenuItem): string {
  return item.portions[0]?.id ?? "";
}

export function defaultSpiceId(item: MenuItem): string {
  const medium = item.spiceLevels.find((s) => s.id === "medium");
  return medium?.id ?? item.spiceLevels[0]?.id ?? "";
}
