import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient, QueryResultRow } from "pg";
import { z } from "zod";
import { config } from "../config.js";
import { pool, withTransaction } from "../db.js";
import { requireOutletAccess, requireRoles } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { estimatePrepMinutes } from "../lib/prep-estimate.js";
import { discountFor } from "../lib/discount.js";
import { paiseToRupees, parse, rupeesToPaise } from "../lib/validation.js";
import { publishOrderEvent, subscribeToOrder, subscribeToOutlet, type OrderEvent } from "../services/order-events.js";

const orderCodeSchema = z.object({ code: z.string().regex(/^TOH-[A-Z0-9]{8}$/) });
const checkoutSchema = z.object({
  outletId: z.string().min(1).max(80),
  couponCode: z.string().trim().toUpperCase().min(3).max(24).optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{10,18}$/),
    address: z.string().trim().min(8).max(300),
    landmark: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  }),
  paymentMethod: z.enum(["upi", "card"]),
  lines: z.array(z.object({
    itemId: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(20),
    portionId: z.string().max(80).optional(),
    spiceId: z.string().max(80).optional(),
    addOnIds: z.array(z.string().min(1).max(80)).max(20).default([]),
  }).superRefine((line, context) => {
    if (new Set(line.addOnIds).size !== line.addOnIds.length) {
      context.addIssue({ code: "custom", path: ["addOnIds"], message: "Duplicate add-ons are not allowed" });
    }
  })).min(1).max(40),
});

const kitchenQuerySchema = z.object({
  outletId: z.string().min(1).max(80).optional(),
  status: z.enum(["placed", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"]).optional(),
});
const statusBodySchema = z.object({
  status: z.enum(["accepted", "preparing", "ready", "out_for_delivery", "delivered"]),
  note: z.string().trim().max(300).optional(),
});

type CheckoutBody = z.infer<typeof checkoutSchema>;
type QuotedLine = {
  itemId: string;
  name: string;
  diet: "veg" | "nonveg";
  quantity: number;
  unitPricePaise: number;
  portionId: string | null;
  portionLabel: string | null;
  spiceId: string | null;
  spiceLabel: string | null;
  addOns: { id: string; label: string; pricePaise: number }[];
  image: string;
};
type BasicRow = QueryResultRow & Record<string, unknown>;

const ALLOWED_TRANSITIONS: Record<string, string> = {
  placed: "preparing",
  accepted: "preparing",
  preparing: "ready",
  ready: "out_for_delivery",
  out_for_delivery: "delivered",
};

function tokenForOrder(id: string) {
  return createHmac("sha256", config.TRACKING_TOKEN_SECRET).update(`order:${id}`).digest("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function makeOrderCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "TOH-";
  for (let index = 0; index < 8; index += 1) code += alphabet[randomInt(alphabet.length)];
  return code;
}

function requestHash(body: CheckoutBody) {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

async function estimateKitchenPrepMinutes(client: PoolClient, outletId: string, minimumPrepMinutes: number, itemCount: number) {
  const result = await client.query(
    `WITH recent_prep AS (
       SELECT EXTRACT(EPOCH FROM (ready.ready_at - o.placed_at)) / 60.0 AS minutes
       FROM orders o
       JOIN LATERAL (
         SELECT MIN(h.created_at) FILTER (WHERE h.status='ready') AS ready_at
         FROM order_status_history h WHERE h.order_id=o.id
       ) ready ON TRUE
       WHERE o.outlet_id=$1 AND o.status IN ('ready','out_for_delivery','delivered')
         AND ready.ready_at IS NOT NULL AND o.placed_at >= NOW() - INTERVAL '30 days'
     ), stats AS (
       SELECT COUNT(*)::int AS sample_size, percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS median_minutes
       FROM recent_prep
     )
     SELECT stats.sample_size,stats.median_minutes,
       (SELECT COUNT(*)::int FROM orders WHERE outlet_id=$1 AND status IN ('placed','accepted','preparing')) AS active_order_count
     FROM stats`,
    [outletId],
  );
  const row = result.rows[0] as { sample_size: number; median_minutes: number | null; active_order_count: number };
  return estimatePrepMinutes({
    minimumPrepMinutes,
    historicalMedianMinutes: row.median_minutes === null ? null : Number(row.median_minutes),
    historySampleCount: Number(row.sample_size),
    activeOrderCount: Number(row.active_order_count),
    itemCount,
  });
}

async function quoteLines(client: PoolClient, outletId: string, lines: CheckoutBody["lines"]) {
  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  const itemsResult = await client.query(
    `SELECT mi.id,mi.name,mi.diet,mi.base_price_paise,mi.image_key,
       CASE WHEN sale.active=TRUE AND sale.sale_price_paise IS NOT NULL
         AND (sale.starts_at IS NULL OR sale.starts_at<=NOW())
         AND (sale.ends_at IS NULL OR sale.ends_at>NOW()) THEN sale.sale_price_paise END AS sale_price_paise
     FROM menu_items mi JOIN menu_item_outlet_availability av ON av.item_id=mi.id AND av.outlet_id=$2 AND av.available=TRUE
     LEFT JOIN menu_item_sales sale ON sale.item_id=mi.id AND sale.outlet_id=$2
     WHERE mi.id=ANY($1::text[]) AND mi.active=TRUE`,
    [itemIds, outletId],
  );
  const items = new Map<string, BasicRow>(itemsResult.rows.map((row) => [row.id as string, row as BasicRow]));
  const portionsResult = await client.query("SELECT item_id,id,label,price_delta_paise FROM menu_item_portions WHERE item_id=ANY($1::text[])", [itemIds]);
  const spicesResult = await client.query("SELECT item_id,id,label FROM menu_item_spice_levels WHERE item_id=ANY($1::text[])", [itemIds]);
  const addOnsResult = await client.query("SELECT item_id,id,label,price_paise FROM menu_item_add_ons WHERE item_id=ANY($1::text[])", [itemIds]);
  const portionsByItem = groupRows(portionsResult.rows);
  const spicesByItem = groupRows(spicesResult.rows);
  const addOnsByItem = groupRows(addOnsResult.rows);

  const quote: QuotedLine[] = [];
  for (const line of lines) {
    const item = items.get(line.itemId);
    if (!item) throw new ApiError(409, `“${line.itemId}” is unavailable at this outlet`, "ITEM_UNAVAILABLE", { itemId: line.itemId });
    const portions = portionsByItem.get(line.itemId) ?? [];
    const spices = spicesByItem.get(line.itemId) ?? [];
    const availableAddOns = addOnsByItem.get(line.itemId) ?? [];

    let portion: BasicRow | undefined;
    if (portions.length > 0) {
      portion = portions.find((option) => option.id === line.portionId);
      if (!portion) throw new ApiError(400, `Choose a valid portion for ${item.name}`, "INVALID_PORTION", { itemId: line.itemId });
    } else if (line.portionId) {
      throw new ApiError(400, `${item.name} does not have portion options`, "INVALID_PORTION", { itemId: line.itemId });
    }

    let spice: BasicRow | undefined;
    if (spices.length > 0) {
      spice = spices.find((option) => option.id === line.spiceId);
      if (!spice) throw new ApiError(400, `Choose a valid spice level for ${item.name}`, "INVALID_SPICE_LEVEL", { itemId: line.itemId });
    } else if (line.spiceId) {
      throw new ApiError(400, `${item.name} does not have spice options`, "INVALID_SPICE_LEVEL", { itemId: line.itemId });
    }

    const selectedAddOns = line.addOnIds.map((id) => availableAddOns.find((option) => option.id === id));
    if (selectedAddOns.some((option) => !option)) {
      throw new ApiError(400, `An add-on is not available for ${item.name}`, "INVALID_ADD_ON", { itemId: line.itemId });
    }
    const addOns = selectedAddOns as BasicRow[];
    const addOnTotal = addOns.reduce((total, option) => total + Number(option.price_paise), 0);
    quote.push({
      itemId: line.itemId,
      name: item.name as string,
      diet: item.diet as "veg" | "nonveg",
      quantity: line.quantity,
      unitPricePaise: Number(item.sale_price_paise ?? item.base_price_paise) + Number(portion?.price_delta_paise ?? 0) + addOnTotal,
      portionId: (portion?.id as string | undefined) ?? null,
      portionLabel: (portion?.label as string | undefined) ?? null,
      spiceId: (spice?.id as string | undefined) ?? null,
      spiceLabel: (spice?.label as string | undefined) ?? null,
      addOns: addOns.map((option) => ({ id: option.id as string, label: option.label as string, pricePaise: Number(option.price_paise) })),
      image: item.image_key as string,
    });
  }
  return quote;
}

function groupRows(rows: QueryResultRow[]) {
  const map = new Map<string, BasicRow[]>();
  for (const row of rows as BasicRow[]) {
    const key = row.item_id as string;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

async function loadOrder(code: string) {
  const result = await pool.query(
    `SELECT o.*,outlet.name AS outlet_name,outlet.address AS outlet_address,outlet.eta_minutes
     FROM orders o JOIN outlets outlet ON outlet.id=o.outlet_id WHERE o.order_code=$1`,
    [code],
  );
  const row = result.rows[0] as BasicRow | undefined;
  if (!row) return null;

  const [lineResult, historyResult] = await Promise.all([
    pool.query(
      `SELECT li.id,li.menu_item_id,li.name_snapshot,li.diet_snapshot,li.quantity,li.unit_price_paise,li.portion_id,li.portion_label,li.spice_id,li.spice_label,
       mi.image_key AS image,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.add_on_id,'label',a.label_snapshot,'price',a.price_paise) ORDER BY a.id)
         FROM order_item_add_ons a WHERE a.order_item_id=li.id),'[]'::jsonb) AS add_ons
       FROM order_items li LEFT JOIN menu_items mi ON mi.id=li.menu_item_id
       WHERE li.order_id=$1 ORDER BY li.id`, [row.id]),
    pool.query("SELECT status,note,created_at FROM order_status_history WHERE order_id=$1 ORDER BY created_at,id", [row.id]),
  ]);
  const itemsTotalPaise = Number(row.items_total_paise);
  return {
    id: row.order_code,
    outletId: row.outlet_id,
    outletName: row.outlet_name,
    outletAddress: row.outlet_address,
    status: row.status,
    lines: lineResult.rows.map((line) => ({
      id: String(line.id), itemId: line.menu_item_id, name: line.name_snapshot, diet: line.diet_snapshot, image: line.image,
      qty: line.quantity, quantity: line.quantity, unitPrice: paiseToRupees(Number(line.unit_price_paise)),
      portionId: line.portion_id, portionLabel: line.portion_label, spiceId: line.spice_id, spiceLabel: line.spice_label,
      addOns: (line.add_ons as { id: string; label: string; price: number }[]).map((addOn) => ({ ...addOn, price: paiseToRupees(Number(addOn.price)) })),
    })),
    customer: {
      name: row.customer_name, phone: row.customer_phone, address: row.delivery_address,
      landmark: row.landmark, notes: row.customer_notes,
    },
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    totals: {
      itemsTotal: paiseToRupees(itemsTotalPaise),
      deliveryFee: paiseToRupees(Number(row.delivery_fee_paise)),
      discount: paiseToRupees(Number(row.discount_paise ?? 0)),
      total: paiseToRupees(Number(row.total_paise)),
      gstIncluded: paiseToRupees(Number(row.gst_included_paise)),
    },
    ...(row.coupon_code ? { couponCode: row.coupon_code } : {}),
    placedAt: new Date(row.placed_at as string | number | Date).getTime(),
    expectedReadyAt: new Date(row.expected_ready_at as string | number | Date).toISOString(),
    expectedDeliveryAt: new Date(row.expected_delivery_at as string | number | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | number | Date).toISOString(),
    statusHistory: historyResult.rows.map((history) => ({
      status: history.status, note: history.note, at: new Date(history.created_at as string | number | Date).toISOString(),
    })),
  };
}

async function authorizeTracking(code: string, token: string | undefined) {
  if (!token || token.length < 32 || token.length > 200) {
    throw new ApiError(401, "A valid order tracking token is required", "TRACKING_TOKEN_REQUIRED");
  }
  const result = await pool.query("SELECT id,tracking_token_hash FROM orders WHERE order_code=$1", [code]);
  const row = result.rows[0] as { id: string; tracking_token_hash: string } | undefined;
  if (!row) throw new ApiError(404, "Order was not found", "ORDER_NOT_FOUND");
  const expected = Buffer.from(row.tracking_token_hash, "hex");
  const received = Buffer.from(hashToken(token), "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new ApiError(403, "Tracking token does not match this order", "INVALID_TRACKING_TOKEN");
  }
  return row;
}

function sendEvent(reply: FastifyReply, eventName: string, payload: unknown) {
  reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function openSse(
  request: FastifyRequest,
  reply: FastifyReply,
  getInitial: () => Promise<unknown>,
  subscribe: (listener: (event: OrderEvent) => void) => () => void,
) {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.setTimeout(0);
  const queuedEvents: OrderEvent[] = [];
  let primed = false;
  let heartbeat: NodeJS.Timeout | undefined;
  const close = () => {
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
  };
  request.raw.once("close", close);
  reply.raw.once("close", close);
  const unsubscribe = subscribe((event) => {
    if (primed) sendEvent(reply, "status", event);
    else queuedEvents.push(event);
  });
  try {
    const initial = await getInitial();
    if (reply.raw.destroyed) {
      close();
      return;
    }
    sendEvent(reply, "snapshot", initial);
    primed = true;
    for (const event of queuedEvents) sendEvent(reply, "status", event);
    queuedEvents.length = 0;
    heartbeat = setInterval(() => reply.raw.write(": keep-alive\n\n"), 15_000);
    heartbeat.unref();
  } catch (error) {
    close();
    reply.raw.destroy(error instanceof Error ? error : undefined);
  }
}

async function createCheckout(body: CheckoutBody, key: string, bodyHash: string) {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const existing = await client.query("SELECT id,order_code,request_hash FROM orders WHERE idempotency_key=$1", [key]);
    if (existing.rowCount) {
      const row = existing.rows[0] as { id: string; order_code: string; request_hash: string };
      if (row.request_hash !== bodyHash) throw new ApiError(409, "This idempotency key was already used with different checkout details", "IDEMPOTENCY_KEY_REUSED");
      return { orderCode: row.order_code, trackingToken: tokenForOrder(row.id), replayed: true };
    }

    const outletResult = await client.query("SELECT id,name,eta_minutes,prep_minutes,delivery_fee_paise FROM outlets WHERE id=$1 AND active=TRUE", [body.outletId]);
    const outlet = outletResult.rows[0] as BasicRow | undefined;
    if (!outlet) throw new ApiError(404, "Outlet was not found or is closed", "OUTLET_NOT_FOUND");

    const quote = await quoteLines(client, body.outletId, body.lines);
    const itemsTotal = quote.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
    const deliveryFee = Number(outlet.delivery_fee_paise);
    let discount = 0;
    if (body.couponCode) {
      const couponResult = await client.query(
        `SELECT code,discount_type,discount_value,minimum_order_paise,maximum_discount_paise,
          max_redemptions,per_customer_limit,outlet_ids,active,starts_at,ends_at
         FROM coupons WHERE code=$1 FOR UPDATE`, [body.couponCode],
      );
      const coupon = couponResult.rows[0];
      if (!coupon || !coupon.active || new Date(coupon.starts_at).getTime() > Date.now() || new Date(coupon.ends_at).getTime() <= Date.now()) {
        throw new ApiError(400, "This coupon is not active right now", "COUPON_INVALID");
      }
      if (coupon.outlet_ids.length && !coupon.outlet_ids.includes(body.outletId)) throw new ApiError(400, "This coupon is not valid at the selected outlet", "COUPON_OUTLET_MISMATCH");
      if (itemsTotal < Number(coupon.minimum_order_paise)) throw new ApiError(400, "The order does not meet this coupon’s minimum value", "COUPON_MINIMUM_NOT_MET");
      const usage = await client.query("SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE coupon_code=$1", [body.couponCode]);
      if (coupon.max_redemptions !== null && Number(usage.rows[0].count) >= Number(coupon.max_redemptions)) throw new ApiError(409, "This coupon has reached its redemption limit", "COUPON_LIMIT_REACHED");
      const customerUsage = await client.query(
        "SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE coupon_code=$1 AND regexp_replace(customer_phone,'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g')",
        [body.couponCode, body.customer.phone],
      );
      if (Number(customerUsage.rows[0].count) >= Number(coupon.per_customer_limit)) throw new ApiError(409, "This phone number has already used this coupon", "COUPON_CUSTOMER_LIMIT_REACHED");
      discount = discountFor(coupon, itemsTotal);
    }
    const total = itemsTotal + deliveryFee - discount;
    const gstIncluded = Math.round(((itemsTotal - discount) * 5) / 105);
    const itemCount = body.lines.reduce((sum, line) => sum + line.quantity, 0);
    const prepEstimate = await estimateKitchenPrepMinutes(client, body.outletId, Number(outlet.prep_minutes), itemCount);
    const internalId = randomUUID();
    const trackingToken = tokenForOrder(internalId);
    const orderCode = makeOrderCode();
    const placedAt = new Date();
    const expectedReadyAt = new Date(placedAt.getTime() + prepEstimate.minutes * 60_000);
    const expectedDeliveryAt = new Date(placedAt.getTime() + Number(outlet.eta_minutes) * 60_000);

    const orderResult = await client.query(
      `INSERT INTO orders (id,order_code,outlet_id,status,customer_name,customer_phone,delivery_address,landmark,customer_notes,
         payment_method,payment_status,items_total_paise,delivery_fee_paise,discount_paise,coupon_code,gst_included_paise,total_paise,expected_ready_at,expected_delivery_at,
         tracking_token_hash,idempotency_key,request_hash,placed_at,updated_at)
       VALUES ($1,$2,$3,'placed',$4,$5,$6,$7,$8,$9,'succeeded',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)
       RETURNING id`,
      [internalId, orderCode, body.outletId, body.customer.name, body.customer.phone, body.customer.address,
        body.customer.landmark ?? null, body.customer.notes ?? null, body.paymentMethod, itemsTotal, deliveryFee, discount, body.couponCode ?? null,
        gstIncluded, total, expectedReadyAt, expectedDeliveryAt, hashToken(trackingToken), key, bodyHash, placedAt],
    );
    const orderId = (orderResult.rows[0] as { id: string }).id;

    if (body.couponCode) await client.query(
      "INSERT INTO coupon_redemptions (coupon_code,order_id,customer_phone,discount_paise) VALUES ($1,$2,$3,$4)",
      [body.couponCode, orderId, body.customer.phone, discount],
    );

    await client.query(
      "INSERT INTO payments (order_id,method,status,amount_paise,transaction_reference) VALUES ($1,$2,'succeeded',$3,$4)",
      [orderId, body.paymentMethod, total, `MOCK-${randomBytes(12).toString("hex").toUpperCase()}`],
    );
    for (const line of quote) {
      const insertedLine = await client.query(
        `INSERT INTO order_items (order_id,menu_item_id,name_snapshot,diet_snapshot,quantity,unit_price_paise,portion_id,portion_label,spice_id,spice_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [orderId, line.itemId, line.name, line.diet, line.quantity, line.unitPricePaise, line.portionId, line.portionLabel, line.spiceId, line.spiceLabel],
      );
      const orderItemId = (insertedLine.rows[0] as { id: string }).id;
      for (const addOn of line.addOns) {
        await client.query("INSERT INTO order_item_add_ons (order_item_id,add_on_id,label_snapshot,price_paise) VALUES ($1,$2,$3,$4)",
          [orderItemId, addOn.id, addOn.label, addOn.pricePaise]);
      }
    }
    await client.query("INSERT INTO order_status_history (order_id,status,note) VALUES ($1,'placed','Checkout accepted; order placed')", [orderId]);
    await publishOrderEvent(client, { orderCode, outletId: body.outletId, status: "placed", updatedAt: placedAt.toISOString() });
    return { orderCode, trackingToken, replayed: false };
  });
}

export async function registerOrderRoutes(app: FastifyInstance) {
  app.post("/orders", async (request, reply) => {
    const body = parse(checkoutSchema, request.body);
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new ApiError(400, "Send a unique Idempotency-Key header for checkout", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const result = await createCheckout(body, idempotencyKey, requestHash(body));
    const order = await loadOrder(result.orderCode);
    return reply.code(result.replayed ? 200 : 201).send({ order, trackingToken: result.trackingToken, payment: { mode: "simulated", status: "succeeded" } });
  });

  app.get("/orders/:code", async (request) => {
    const { code } = parse(orderCodeSchema, request.params);
    const token = request.headers["x-order-tracking-token"];
    await authorizeTracking(code, typeof token === "string" ? token : undefined);
    const order = await loadOrder(code);
    if (!order) throw new ApiError(404, "Order was not found", "ORDER_NOT_FOUND");
    return order;
  });

  app.get("/orders/:code/events", async (request, reply) => {
    const { code } = parse(orderCodeSchema, request.params);
    const token = request.headers["x-order-tracking-token"];
    await authorizeTracking(code, typeof token === "string" ? token : undefined);
    await openSse(request, reply, () => loadOrder(code), (listener) => subscribeToOrder(code, listener));
  });

  app.get("/admin/orders", { preHandler: requireRoles("admin") }, async (request) => {
    const query = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }), request.query);
    const result = await pool.query(
      `SELECT order_code FROM orders WHERE placed_at>=NOW()-($1::int * INTERVAL '1 day')
       ORDER BY placed_at DESC LIMIT 500`, [query.days],
    );
    const orders = await Promise.all(result.rows.map(async (row) => loadOrder(row.order_code as string)));
    return { days: query.days, orders: orders.filter((order) => order !== null) };
  });

  app.get("/kitchen/orders", { preHandler: requireRoles("admin", "kitchen") }, async (request) => {
    const query = parse(kitchenQuerySchema, request.query);
    const outletId = query.outletId ?? request.user.outletId ?? undefined;
    if (!outletId) throw new ApiError(400, "Choose an outlet to view its kitchen orders", "OUTLET_REQUIRED");
    requireOutletAccess(request, outletId);
    const outlet = await pool.query("SELECT 1 FROM outlets WHERE id=$1", [outletId]);
    if (!outlet.rowCount) throw new ApiError(404, "Outlet was not found", "OUTLET_NOT_FOUND");
    const result = await pool.query(
      `SELECT order_code,status,expected_ready_at,placed_at FROM orders
       WHERE outlet_id=$1 AND placed_at >= NOW()-INTERVAL '24 hours' AND ($2::text IS NULL OR status=$2)
       ORDER BY placed_at ASC LIMIT 100`, [outletId, query.status ?? null],
    );
    const orders = await Promise.all(result.rows.map(async (row) => {
      const order = await loadOrder(row.order_code as string);
      return { ...order, isLate: new Date(row.expected_ready_at as string).getTime() < Date.now() && !["ready", "out_for_delivery", "delivered", "cancelled"].includes(row.status as string) };
    }));
    return { outletId, orders };
  });

  app.get("/kitchen/orders/events", { preHandler: requireRoles("admin", "kitchen") }, async (request, reply) => {
    const query = parse(z.object({ outletId: z.string().min(1).max(80) }), request.query);
    requireOutletAccess(request, query.outletId);
    await openSse(request, reply, async () => {
      const result = await pool.query(
        `SELECT order_code AS "orderCode",outlet_id AS "outletId",status,updated_at AS "updatedAt"
         FROM orders WHERE outlet_id=$1 AND placed_at >= NOW()-INTERVAL '24 hours' ORDER BY placed_at`, [query.outletId],
      );
      return result.rows;
    }, (listener) => subscribeToOutlet(query.outletId, listener));
  });

  app.patch("/kitchen/orders/:code/status", { preHandler: requireRoles("admin", "kitchen") }, async (request) => {
    const { code } = parse(orderCodeSchema, request.params);
    const body = parse(statusBodySchema, request.body);
    const result = await withTransaction(async (client) => {
      const selected = await client.query(
        `SELECT o.id,o.order_code,o.outlet_id,o.status FROM orders o WHERE o.order_code=$1 FOR UPDATE`, [code],
      );
      const order = selected.rows[0] as { id: string; order_code: string; outlet_id: string; status: string } | undefined;
      if (!order) throw new ApiError(404, "Order was not found", "ORDER_NOT_FOUND");
      requireOutletAccess(request, order.outlet_id);
      const expected = ALLOWED_TRANSITIONS[order.status];
      if (expected !== body.status) {
        throw new ApiError(409, `Order is ${order.status}; its next status must be ${expected ?? "unchanged"}`, "INVALID_STATUS_TRANSITION", { current: order.status, nextAllowed: expected ?? null });
      }
      if (order.status === "placed" && body.status === "preparing") {
        const accepted = await client.query(
          "UPDATE orders SET status='accepted',updated_at=NOW() WHERE id=$1 RETURNING updated_at",
          [order.id],
        );
        const acceptedAt = new Date(accepted.rows[0].updated_at as string).toISOString();
        await client.query(
          "INSERT INTO order_status_history (order_id,status,actor_user_id,note) VALUES ($1,'accepted',$2,$3)",
          [order.id, request.user.sub, "Accepted; preparation begins immediately"],
        );
        await publishOrderEvent(client, { orderCode: code, outletId: order.outlet_id, status: "accepted", updatedAt: acceptedAt });
      }
      const updated = await client.query(
        "UPDATE orders SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING updated_at",
        [order.id, body.status],
      );
      await client.query(
        "INSERT INTO order_status_history (order_id,status,actor_user_id,note) VALUES ($1,$2,$3,$4)",
        [order.id, body.status, request.user.sub, order.status === "placed" ? "Preparation started after acceptance" : body.note ?? null],
      );
      const updatedAt = new Date(updated.rows[0].updated_at as string).toISOString();
      await publishOrderEvent(client, { orderCode: code, outletId: order.outlet_id, status: body.status, updatedAt });
      return { orderCode: code, outletId: order.outlet_id, status: body.status, updatedAt };
    });
    return { ...result, order: await loadOrder(code) };
  });
}
