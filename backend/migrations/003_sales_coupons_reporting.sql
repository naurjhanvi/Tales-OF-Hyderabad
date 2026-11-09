ALTER TABLE menu_items
  ADD COLUMN sale_price_paise INTEGER,
  ADD COLUMN sale_starts_at TIMESTAMPTZ,
  ADD COLUMN sale_ends_at TIMESTAMPTZ,
  ADD COLUMN sale_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT menu_items_sale_price_check
    CHECK (sale_price_paise IS NULL OR sale_price_paise > 0),
  ADD CONSTRAINT menu_items_sale_window_check
    CHECK (sale_ends_at IS NULL OR sale_starts_at IS NULL OR sale_ends_at > sale_starts_at);

ALTER TABLE orders
  ADD COLUMN coupon_code TEXT,
  ADD COLUMN discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0);

CREATE TABLE coupons (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{3,24}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  minimum_order_paise INTEGER NOT NULL DEFAULT 0 CHECK (minimum_order_paise >= 0),
  maximum_discount_paise INTEGER CHECK (maximum_discount_paise IS NULL OR maximum_discount_paise > 0),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_customer_limit INTEGER NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
  outlet_ids TEXT[] NOT NULL DEFAULT '{}',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  CHECK (discount_type <> 'percentage' OR discount_value <= 100)
);

CREATE TABLE coupon_redemptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coupon_code TEXT NOT NULL REFERENCES coupons(code),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  discount_paise INTEGER NOT NULL CHECK (discount_paise >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX coupon_redemptions_code_phone_idx ON coupon_redemptions(coupon_code, customer_phone);
CREATE INDEX orders_placed_at_idx ON orders(placed_at DESC);
