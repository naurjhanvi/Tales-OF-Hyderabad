CREATE TABLE outlets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  opening_hours TEXT NOT NULL,
  eta_minutes INTEGER NOT NULL CHECK (eta_minutes > 0),
  prep_minutes INTEGER NOT NULL DEFAULT 20 CHECK (prep_minutes > 0),
  delivery_fee_paise INTEGER NOT NULL DEFAULT 3900 CHECK (delivery_fee_paise >= 0),
  fssai_licence TEXT NOT NULL,
  fssai_valid_till DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE outlet_delivery_areas (
  outlet_id TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  pincode CHAR(6) NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  PRIMARY KEY (outlet_id, pincode)
);
CREATE INDEX outlet_delivery_areas_pincode_idx ON outlet_delivery_areas(pincode);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  base_price_paise INTEGER NOT NULL CHECK (base_price_paise >= 0),
  diet TEXT NOT NULL CHECK (diet IN ('veg', 'nonveg')),
  allergens TEXT[] NOT NULL DEFAULT '{}',
  image_key TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX menu_items_active_category_idx ON menu_items(active, category);

CREATE TABLE menu_item_portions (
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  price_delta_paise INTEGER NOT NULL DEFAULT 0 CHECK (price_delta_paise >= 0),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, id)
);

CREATE TABLE menu_item_spice_levels (
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, id)
);

CREATE TABLE menu_item_add_ons (
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, id)
);

CREATE TABLE menu_item_outlet_availability (
  item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  outlet_id TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (item_id, outlet_id)
);

CREATE TABLE demo_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'kitchen')),
  outlet_id TEXT REFERENCES outlets(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((role = 'admin' AND outlet_id IS NULL) OR (role = 'kitchen' AND outlet_id IS NOT NULL))
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE,
  outlet_id TEXT NOT NULL REFERENCES outlets(id),
  status TEXT NOT NULL CHECK (status IN ('placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  landmark TEXT,
  customer_notes TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'card')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('succeeded', 'failed')),
  items_total_paise INTEGER NOT NULL CHECK (items_total_paise >= 0),
  delivery_fee_paise INTEGER NOT NULL CHECK (delivery_fee_paise >= 0),
  gst_included_paise INTEGER NOT NULL CHECK (gst_included_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  expected_ready_at TIMESTAMPTZ NOT NULL,
  expected_delivery_at TIMESTAMPTZ NOT NULL,
  tracking_token_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX orders_outlet_status_placed_idx ON orders(outlet_id, status, placed_at DESC);
CREATE INDEX orders_expected_ready_idx ON orders(expected_ready_at) WHERE status IN ('placed', 'accepted', 'preparing');

CREATE TABLE order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT REFERENCES menu_items(id) ON DELETE SET NULL,
  name_snapshot TEXT NOT NULL,
  diet_snapshot TEXT NOT NULL CHECK (diet_snapshot IN ('veg', 'nonveg')),
  quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  portion_id TEXT,
  portion_label TEXT,
  spice_id TEXT,
  spice_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX order_items_order_id_idx ON order_items(order_id);

CREATE TABLE order_item_add_ons (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  add_on_id TEXT NOT NULL,
  label_snapshot TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0)
);

CREATE TABLE order_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_user_id UUID REFERENCES demo_users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX order_status_history_order_id_idx ON order_status_history(order_id, created_at);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mock' CHECK (provider = 'mock'),
  method TEXT NOT NULL CHECK (method IN ('upi', 'card')),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  transaction_reference TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
