import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { pool, withTransaction } from "../db.js";

type SeedItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  diet: "veg" | "nonveg";
  allergens: string[];
  imageKey: string;
  outlets: string[];
  portions?: { id: string; label: string; detail?: string; delta: number }[];
  spices?: { id: string; label: string }[];
  addOns?: { id: string; label: string; price: number }[];
};

const outlets = [
  {
    id: "kondapur", name: "Kondapur", address: "Plot 12, Botanical Garden Road, Kondapur, Hyderabad 500084",
    phone: "+91 90000 12345", hours: "11:00 am – 11:00 pm, all days", eta: 35, prep: 20,
    fssai: "12345678901234", validTill: "2027-03-31", pincodes: ["500084", "500081"],
  },
  {
    id: "gachibowli", name: "Gachibowli", address: "Survey 45, Cyber Towers Road, Gachibowli, Hyderabad 500032",
    phone: "+91 90000 23456", hours: "11:00 am – 11:30 pm, all days", eta: 40, prep: 22,
    fssai: "12345678901245", validTill: "2027-03-31", pincodes: ["500032", "500033"],
  },
  {
    id: "kukatpally", name: "Kukatpally", address: "Shop 8, KPHB Phase 1 Main Road, Kukatpally, Hyderabad 500072",
    phone: "+91 90000 34567", hours: "12:00 pm – 11:00 pm, all days", eta: 45, prep: 25,
    fssai: "12345678901256", validTill: "2027-03-31", pincodes: ["500072", "500085"],
  },
];

const biryaniPortions = [
  { id: "single", label: "Single", detail: "Serves 1", delta: 0 },
  { id: "double", label: "Double", detail: "Serves 2", delta: 290 },
];
const spiceLevels = [
  { id: "mild", label: "Mild" },
  { id: "medium", label: "Medium" },
  { id: "hot", label: "Spicy — Hyderabadi hot" },
];
const salan = { id: "extra-salan", label: "Extra mirchi ka salan", price: 45 };
const raita = { id: "extra-raita", label: "Extra boondi raita", price: 45 };
const egg = { id: "boiled-egg", label: "Boiled egg", price: 35 };

const items: SeedItem[] = [
  {
    id: "chicken-dum-biryani", name: "Chicken Dum Biryani",
    description: "Long-grain basmati sealed in the handi with marinated chicken, saffron and fried onions. Served with salan and raita.",
    category: "Biryani", price: 329, diet: "nonveg", allergens: ["Dairy", "Nuts"], imageKey: "chicken-dum-biryani.jpg",
    outlets: ["kondapur", "gachibowli", "kukatpally"], portions: biryaniPortions, spices: spiceLevels, addOns: [salan, raita, egg],
  },
  {
    id: "mutton-dum-biryani", name: "Mutton Dum Biryani",
    description: "Slow-cooked mutton on the bone layered with kacchi-style rice, mint and saffron. Weekend favourite, made in small batches.",
    category: "Biryani", price: 429, diet: "nonveg", allergens: ["Dairy", "Nuts"], imageKey: "mutton-dum-biryani.jpg",
    outlets: ["kondapur", "gachibowli"], portions: biryaniPortions, spices: spiceLevels, addOns: [salan, raita],
  },
  {
    id: "veg-dum-biryani", name: "Veg Dum Biryani",
    description: "Paneer, garden vegetables and toasted cashews dum-cooked with saffron rice. Every bit as layered as the meat versions.",
    category: "Biryani", price: 269, diet: "veg", allergens: ["Dairy", "Nuts"], imageKey: "veg-dum-biryani.jpg",
    outlets: ["kondapur", "gachibowli", "kukatpally"], portions: biryaniPortions, spices: spiceLevels, addOns: [salan, raita],
  },
  {
    id: "family-pack-chicken-biryani", name: "Family Pack Chicken Biryani",
    description: "A full handi for the table — serves 4, packed with salan, raita and onion salad. Our most-ordered weekend box.",
    category: "Biryani", price: 1199, diet: "nonveg", allergens: ["Dairy", "Nuts"], imageKey: "family-pack-biryani.jpg",
    outlets: ["kondapur", "gachibowli", "kukatpally"], portions: [{ id: "family", label: "Family pack", detail: "Serves 4", delta: 0 }], spices: spiceLevels, addOns: [salan, raita],
  },
  {
    id: "haleem", name: "Hyderabadi Haleem",
    description: "Slow-pounded wheat, lentils and mutton finished over coals for hours. Sold only from our Kukatpally kitchen.",
    category: "Biryani", price: 349, diet: "nonveg", allergens: ["Gluten", "Dairy"], imageKey: "haleem.jpg",
    outlets: ["kukatpally"], portions: [{ id: "regular", label: "Regular", detail: "Serves 1", delta: 0 }, { id: "large", label: "Large", detail: "Serves 2", delta: 250 }], spices: spiceLevels, addOns: [raita],
  },
  {
    id: "mirchi-ka-salan", name: "Mirchi ka Salan",
    description: "The classic biryani side — green chillies in a peanut-sesame gravy, tangy and fiery. Pairs with everything.",
    category: "Sides", price: 129, diet: "veg", allergens: ["Peanuts", "Sesame"], imageKey: "mirchi-ka-salan.jpg",
    outlets: ["kondapur", "gachibowli", "kukatpally"], addOns: [],
  },
  {
    id: "boondi-raita", name: "Boondi Raita",
    description: "Whisked curd with crisp boondi, roasted cumin and a pinch of red chilli. The cool answer to a hot handi.",
    category: "Sides", price: 79, diet: "veg", allergens: ["Dairy"], imageKey: "raita.jpg",
    outlets: ["kondapur", "gachibowli", "kukatpally"], addOns: [],
  },
  {
    id: "double-ka-meetha", name: "Double ka Meetha",
    description: "Old-city bread pudding fried in ghee, soaked in saffron milk and finished with fried nuts.",
    category: "Desserts", price: 119, diet: "veg", allergens: ["Gluten", "Dairy", "Nuts"], imageKey: "double-ka-meetha.jpg",
    outlets: ["kondapur", "gachibowli", "kukatpally"], addOns: [],
  },
];

async function seed() {
  const adminHash = await bcrypt.hash(config.DEMO_ADMIN_PASSWORD, 12);
  const kitchenHash = await bcrypt.hash(config.DEMO_KITCHEN_PASSWORD, 12);

  await withTransaction(async (client) => {
    for (const outlet of outlets) {
      await client.query(
        `INSERT INTO outlets (id, name, address, phone, opening_hours, eta_minutes, prep_minutes, fssai_licence, fssai_valid_till)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, address=EXCLUDED.address, phone=EXCLUDED.phone,
         opening_hours=EXCLUDED.opening_hours, eta_minutes=EXCLUDED.eta_minutes, prep_minutes=EXCLUDED.prep_minutes,
         fssai_licence=EXCLUDED.fssai_licence, fssai_valid_till=EXCLUDED.fssai_valid_till, updated_at=NOW()`,
        [outlet.id, outlet.name, outlet.address, outlet.phone, outlet.hours, outlet.eta, outlet.prep, outlet.fssai, outlet.validTill],
      );
      await client.query("DELETE FROM outlet_delivery_areas WHERE outlet_id = $1", [outlet.id]);
      for (const pincode of outlet.pincodes) {
        await client.query("INSERT INTO outlet_delivery_areas (outlet_id, pincode) VALUES ($1,$2) ON CONFLICT DO NOTHING", [outlet.id, pincode]);
      }
    }

    for (const item of items) {
      await client.query(
        `INSERT INTO menu_items (id, name, description, category, base_price_paise, diet, allergens, image_key, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, category=EXCLUDED.category,
         base_price_paise=EXCLUDED.base_price_paise, diet=EXCLUDED.diet, allergens=EXCLUDED.allergens,
         image_key=EXCLUDED.image_key, active=TRUE, updated_at=NOW()`,
        [item.id, item.name, item.description, item.category, item.price * 100, item.diet, item.allergens, item.imageKey],
      );
      await client.query("DELETE FROM menu_item_portions WHERE item_id = $1", [item.id]);
      await client.query("DELETE FROM menu_item_spice_levels WHERE item_id = $1", [item.id]);
      await client.query("DELETE FROM menu_item_add_ons WHERE item_id = $1", [item.id]);
      await client.query("DELETE FROM menu_item_outlet_availability WHERE item_id = $1", [item.id]);

      for (const [sortOrder, portion] of (item.portions ?? []).entries()) {
        await client.query(
          "INSERT INTO menu_item_portions (item_id,id,label,detail,price_delta_paise,sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
          [item.id, portion.id, portion.label, portion.detail ?? null, portion.delta * 100, sortOrder],
        );
      }
      for (const [sortOrder, spice] of (item.spices ?? []).entries()) {
        await client.query("INSERT INTO menu_item_spice_levels (item_id,id,label,sort_order) VALUES ($1,$2,$3,$4)", [item.id, spice.id, spice.label, sortOrder]);
      }
      for (const [sortOrder, addOn] of (item.addOns ?? []).entries()) {
        await client.query("INSERT INTO menu_item_add_ons (item_id,id,label,price_paise,sort_order) VALUES ($1,$2,$3,$4,$5)", [item.id, addOn.id, addOn.label, addOn.price * 100, sortOrder]);
      }
      for (const outlet of outlets) {
        await client.query(
          "INSERT INTO menu_item_outlet_availability (item_id,outlet_id,available) VALUES ($1,$2,$3)",
          [item.id, outlet.id, item.outlets.includes(outlet.id)],
        );
      }
    }

    await client.query(
      `INSERT INTO demo_users (email,display_name,password_hash,role,outlet_id,active)
       VALUES ($1,'Tales Admin',$2,'admin',NULL,TRUE)
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', outlet_id=NULL, active=TRUE`,
      [config.DEMO_ADMIN_EMAIL.toLowerCase(), adminHash],
    );
    for (const outlet of outlets) {
      const email = `${outlet.id}.kitchen@talesofhyderabad.test`;
      await client.query(
        `INSERT INTO demo_users (email,display_name,password_hash,role,outlet_id,active)
         VALUES ($1,$2,$3,'kitchen',$4,TRUE)
         ON CONFLICT (email) DO UPDATE SET display_name=EXCLUDED.display_name, password_hash=EXCLUDED.password_hash,
         role='kitchen', outlet_id=EXCLUDED.outlet_id, active=TRUE`,
        [email, `${outlet.name} Kitchen`, kitchenHash, outlet.id],
      );
    }

    const coupons = [
      { code: "WELCOME10", name: "A welcome from Tales", type: "percentage", value: 10, minimum: 20_000, cap: 10_000, outlets: [] as string[] },
      { code: "HYD75", name: "Hyderabad table offer", type: "fixed", value: 7_500, minimum: 49_900, cap: null, outlets: [] as string[] },
      { code: "KONDAPUR20", name: "Kondapur dinner offer", type: "percentage", value: 20, minimum: 20_000, cap: 10_000, outlets: ["kondapur"] },
    ];
    for (const coupon of coupons) {
      await client.query(
        `INSERT INTO coupons (code,name,discount_type,discount_value,minimum_order_paise,maximum_discount_paise,
          max_redemptions,per_customer_limit,outlet_ids,starts_at,ends_at,active)
         VALUES ($1,$2,$3,$4,$5,$6,5000,1,$7,NOW()-INTERVAL '1 day',NOW()+INTERVAL '90 days',TRUE)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,discount_type=EXCLUDED.discount_type,
          discount_value=EXCLUDED.discount_value,minimum_order_paise=EXCLUDED.minimum_order_paise,
          maximum_discount_paise=EXCLUDED.maximum_discount_paise,max_redemptions=EXCLUDED.max_redemptions,
          per_customer_limit=EXCLUDED.per_customer_limit,outlet_ids=EXCLUDED.outlet_ids,
          starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,active=TRUE,updated_at=NOW()`,
        [coupon.code, coupon.name, coupon.type, coupon.value, coupon.minimum, coupon.cap, coupon.outlets],
      );
    }

    const now = Date.now();
    const sampleOrders = [
      {
        code: "TOH-7M2K9Q4B", outletId: "kondapur", status: "preparing", name: "Aarav Sharma", phone: "+91 00000 00001",
        address: "12 Lakeview Road, Kondapur, Hyderabad", paymentMethod: "upi", placedMinutesAgo: 15, readyOffsetMinutes: 30,
        lines: [
          { itemId: "family-pack-chicken-biryani", quantity: 1, portionId: "family", portionLabel: "Family pack", spiceId: "medium", spiceLabel: "Medium" },
          { itemId: "double-ka-meetha", quantity: 2 },
        ],
      },
      {
        code: "TOH-5R8H3N6W", outletId: "gachibowli", status: "ready", name: "Kavya Reddy", phone: "+91 00000 00002",
        address: "24 Lakeview Road, Gachibowli, Hyderabad", paymentMethod: "card", placedMinutesAgo: 40, readyOffsetMinutes: -4,
        lines: [
          { itemId: "veg-dum-biryani", quantity: 2, portionId: "single", portionLabel: "Single", spiceId: "medium", spiceLabel: "Medium" },
          { itemId: "mirchi-ka-salan", quantity: 1 },
        ],
      },
      {
        code: "TOH-2P9D4T7C", outletId: "kukatpally", status: "preparing", name: "Rohan Kulkarni", phone: "+91 00000 00003",
        address: "8 Lakeview Road, Kukatpally, Hyderabad", paymentMethod: "upi", placedMinutesAgo: 29, readyOffsetMinutes: -4,
        lines: [
          { itemId: "haleem", quantity: 3, portionId: "regular", portionLabel: "Regular", spiceId: "medium", spiceLabel: "Medium" },
        ],
      },
    ];

    for (const sample of sampleOrders) {
      const outlet = outlets.find((entry) => entry.id === sample.outletId)!;
      const placedAt = new Date(now - sample.placedMinutesAgo * 60_000);
      const expectedReadyAt = new Date(now + sample.readyOffsetMinutes * 60_000);
      const expectedDeliveryAt = new Date(placedAt.getTime() + outlet.eta * 60_000);
      const orderLines = sample.lines.map((line) => {
        const menuItem = items.find((entry) => entry.id === line.itemId)!;
        return { ...line, name: menuItem.name, diet: menuItem.diet, unitPricePaise: menuItem.price * 100 };
      });
      const itemsTotalPaise = orderLines.reduce((total, line) => total + line.unitPricePaise * line.quantity, 0);
      const deliveryFeePaise = 3_900;
      const totalPaise = itemsTotalPaise + deliveryFeePaise;
      const trackingTokenHash = createHash("sha256").update(`seed-tracking:${sample.code}`).digest("hex");
      const requestHash = createHash("sha256").update(`seed-order:${sample.code}`).digest("hex");
      const orderResult = await client.query(
        `INSERT INTO orders (order_code,outlet_id,status,customer_name,customer_phone,delivery_address,
          payment_method,payment_status,items_total_paise,delivery_fee_paise,gst_included_paise,total_paise,
          expected_ready_at,expected_delivery_at,tracking_token_hash,idempotency_key,request_hash,placed_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'succeeded',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         ON CONFLICT (order_code) DO UPDATE SET outlet_id=EXCLUDED.outlet_id,status=EXCLUDED.status,
          customer_name=EXCLUDED.customer_name,customer_phone=EXCLUDED.customer_phone,delivery_address=EXCLUDED.delivery_address,
          payment_method=EXCLUDED.payment_method,payment_status=EXCLUDED.payment_status,items_total_paise=EXCLUDED.items_total_paise,
          delivery_fee_paise=EXCLUDED.delivery_fee_paise,gst_included_paise=EXCLUDED.gst_included_paise,total_paise=EXCLUDED.total_paise,
          expected_ready_at=EXCLUDED.expected_ready_at,expected_delivery_at=EXCLUDED.expected_delivery_at,
          tracking_token_hash=EXCLUDED.tracking_token_hash,request_hash=EXCLUDED.request_hash,placed_at=EXCLUDED.placed_at,updated_at=NOW()
         RETURNING id`,
        [sample.code, sample.outletId, sample.status, sample.name, sample.phone, sample.address, sample.paymentMethod,
          itemsTotalPaise, deliveryFeePaise, Math.round(itemsTotalPaise * 5 / 105), totalPaise, expectedReadyAt,
          expectedDeliveryAt, trackingTokenHash, `seed-sample-v1:${sample.code}`, requestHash, placedAt],
      );
      const orderId = orderResult.rows[0].id as string;
      await client.query("DELETE FROM coupon_redemptions WHERE order_id=$1", [orderId]);
      await client.query("DELETE FROM order_items WHERE order_id=$1", [orderId]);
      await client.query("DELETE FROM order_status_history WHERE order_id=$1", [orderId]);
      await client.query(
        `INSERT INTO payments (order_id,method,status,amount_paise,transaction_reference)
         VALUES ($1,$2,'succeeded',$3,$4)
         ON CONFLICT (order_id) DO UPDATE SET method=EXCLUDED.method,status=EXCLUDED.status,
          amount_paise=EXCLUDED.amount_paise,transaction_reference=EXCLUDED.transaction_reference`,
        [orderId, sample.paymentMethod, totalPaise, `SEED-${sample.code}`],
      );
      for (const line of orderLines) {
        await client.query(
          `INSERT INTO order_items (order_id,menu_item_id,name_snapshot,diet_snapshot,quantity,unit_price_paise,portion_id,portion_label,spice_id,spice_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [orderId, line.itemId, line.name, line.diet, line.quantity, line.unitPricePaise, line.portionId ?? null,
            line.portionLabel ?? null, line.spiceId ?? null, line.spiceLabel ?? null],
        );
      }
      const history = sample.status === "ready"
        ? [
            { status: "placed", at: placedAt, note: "Order placed" },
            { status: "accepted", at: new Date(placedAt.getTime() + 60_000), note: "Kitchen accepted the order" },
            { status: "preparing", at: new Date(placedAt.getTime() + 60_000), note: "Preparation started" },
            { status: "ready", at: expectedReadyAt, note: "Ready for pickup" },
          ]
        : [
            { status: "placed", at: placedAt, note: "Order placed" },
            { status: "accepted", at: new Date(placedAt.getTime() + 60_000), note: "Kitchen accepted the order" },
            { status: "preparing", at: new Date(placedAt.getTime() + 60_000), note: "Preparation started" },
          ];
      for (const event of history) {
        await client.query("INSERT INTO order_status_history (order_id,status,note,created_at) VALUES ($1,$2,$3,$4)",
          [orderId, event.status, event.note, event.at]);
      }
    }
  });

  console.info(`Seeded ${outlets.length} outlets, ${items.length} menu items, three coupons, sample orders, and staff accounts.`);
  console.info(`Admin: ${config.DEMO_ADMIN_EMAIL} / [DEMO_ADMIN_PASSWORD from .env]`);
  console.info(`Kitchen: <outlet>.kitchen@talesofhyderabad.test / [DEMO_KITCHEN_PASSWORD from .env]`);
}

try {
  await seed();
} catch (error) {
  console.error("Database seed failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
