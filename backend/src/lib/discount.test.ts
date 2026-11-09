import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discountFor } from "./discount.js";

describe("discountFor", () => {
  it("calculates percentage discounts in paise", () => {
    assert.equal(discountFor({ discount_type: "percentage", discount_value: 10, maximum_discount_paise: null }, 50_000), 5_000);
  });

  it("applies the configured maximum discount", () => {
    assert.equal(discountFor({ discount_type: "percentage", discount_value: 20, maximum_discount_paise: 10_000 }, 100_000), 10_000);
  });

  it("never discounts more than the subtotal", () => {
    assert.equal(discountFor({ discount_type: "fixed", discount_value: 8_000, maximum_discount_paise: null }, 2_500), 2_500);
  });
});
