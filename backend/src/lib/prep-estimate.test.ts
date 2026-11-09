import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimatePrepMinutes } from "./prep-estimate.js";

describe("estimatePrepMinutes", () => {
  it("uses the outlet minimum when there is not enough completed-order history", () => {
    assert.deepEqual(estimatePrepMinutes({
      minimumPrepMinutes: 20,
      historicalMedianMinutes: 44,
      historySampleCount: 4,
      activeOrderCount: 0,
      itemCount: 1,
    }), { minutes: 20, basis: "outlet_minimum" });
  });

  it("uses recent prep history and increases the estimate for kitchen load and basket size", () => {
    assert.deepEqual(estimatePrepMinutes({
      minimumPrepMinutes: 20,
      historicalMedianMinutes: 31,
      historySampleCount: 7,
      activeOrderCount: 2,
      itemCount: 3,
    }), { minutes: 41, basis: "recent_history" });
  });

  it("never promises less than the outlet minimum and caps load buffers", () => {
    assert.deepEqual(estimatePrepMinutes({
      minimumPrepMinutes: 25,
      historicalMedianMinutes: 12,
      historySampleCount: 20,
      activeOrderCount: 100,
      itemCount: 100,
    }), { minutes: 50, basis: "recent_history" });
  });
});
