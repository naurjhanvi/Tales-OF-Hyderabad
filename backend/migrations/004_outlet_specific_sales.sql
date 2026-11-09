CREATE TABLE menu_item_sales (
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  outlet_id TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  sale_price_paise INTEGER NOT NULL CHECK (sale_price_paise > 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, outlet_id),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

INSERT INTO menu_item_sales (item_id, outlet_id, sale_price_paise, starts_at, ends_at, active)
SELECT mi.id, av.outlet_id, mi.sale_price_paise, mi.sale_starts_at, mi.sale_ends_at, mi.sale_active
FROM menu_items mi
JOIN menu_item_outlet_availability av ON av.item_id = mi.id AND av.available = TRUE
WHERE mi.sale_price_paise IS NOT NULL
ON CONFLICT (item_id, outlet_id) DO NOTHING;

CREATE INDEX menu_item_sales_outlet_active_window_idx
  ON menu_item_sales (outlet_id, active, starts_at, ends_at);
