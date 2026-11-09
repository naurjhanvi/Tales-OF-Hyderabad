export function discountFor(
  value: { discount_type: string; discount_value: number; maximum_discount_paise: number | null },
  subtotalPaise: number,
) {
  const amount = value.discount_type === "percentage"
    ? Math.round(subtotalPaise * Number(value.discount_value) / 100)
    : Number(value.discount_value);
  return Math.min(subtotalPaise, value.maximum_discount_paise ? Math.min(amount, Number(value.maximum_discount_paise)) : amount);
}
