export type PrepEstimateInput = {
  minimumPrepMinutes: number;
  historicalMedianMinutes: number | null;
  historySampleCount: number;
  activeOrderCount: number;
  itemCount: number;
};

export type PrepEstimate = {
  minutes: number;
  basis: "recent_history" | "outlet_minimum";
};

export function estimatePrepMinutes(input: PrepEstimateInput): PrepEstimate {
  const minimum = Number.isFinite(input.minimumPrepMinutes) && input.minimumPrepMinutes > 0
    ? Math.ceil(input.minimumPrepMinutes)
    : 20;
  const sampleCount = Number.isFinite(input.historySampleCount) ? Math.max(0, Math.floor(input.historySampleCount)) : 0;
  const hasReliableHistory = sampleCount >= 5
    && input.historicalMedianMinutes !== null
    && Number.isFinite(input.historicalMedianMinutes)
    && input.historicalMedianMinutes > 0;
  const historical = hasReliableHistory ? Math.ceil(input.historicalMedianMinutes!) : minimum;
  const activeOrders = Number.isFinite(input.activeOrderCount) ? Math.max(0, Math.floor(input.activeOrderCount)) : 0;
  const items = Number.isFinite(input.itemCount) ? Math.max(1, Math.floor(input.itemCount)) : 1;
  const queueBuffer = Math.min(activeOrders * 3, 15);
  const orderSizeBuffer = Math.min(Math.max(0, items - 1) * 2, 10);

  return {
    minutes: Math.ceil(Math.max(minimum, historical) + queueBuffer + orderSizeBuffer),
    basis: hasReliableHistory ? "recent_history" : "outlet_minimum",
  };
}
