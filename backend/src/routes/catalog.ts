import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool, withTransaction } from "../db.js";
import { requireOutletAccess, requireRoles } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";
import { paiseToRupees, parse, rupeesToPaise } from "../lib/validation.js";

const outletQuerySchema = z.object({ postalCode: z.string().regex(/^\d{6}$/).optional() });
const menuQuerySchema = z.object({ outletId: z.string().min(1).optional(), category: z.string().min(1).optional() });
const idSchema = z.object({ id: z.string().min(1).max(80) });

const menuInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(500),
  category: z.string().trim().min(2).max(50),
  basePrice: z.number().finite().min(0).max(100_000),
  diet: z.enum(["veg", "nonveg"]),
  allergens: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  imageKey: z.string().max(200).default(""),
  availableAt: z.array(z.string().min(1).max(80)).max(20),
  portions: z.array(z.object({
    id: z.string().min(1).max(80), label: z.string().trim().min(1).max(60),
    detail: z.string().trim().max(100).optional(), priceDelta: z.number().finite().min(0).max(100_000),
  })).max(20).default([]),
  spiceLevels: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(60) })).max(20).default([]),
  addOns: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(100), price: z.number().finite().min(0).max(100_000) })).max(30).default([]),
});
const saleInputSchema = z.object({
  salePrice: z.number().finite().min(1).max(100_000),
  outletIds: z.array(z.string().min(1).max(80)).min(1).max(20).refine((ids) => new Set(ids).size === ids.length),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
}).superRefine((sale, context) => {
  if (sale.startsAt && sale.endsAt && new Date(sale.endsAt).getTime() <= new Date(sale.startsAt).getTime()) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "The sale end time must be after its start time." });
  }
});
const saleOutletQuerySchema = z.object({ outletId: z.string().min(1).max(80) });

type MenuInput = z.infer<typeof menuInputSchema>;

async function readMenu({ includeInactive, outletId, category }: { includeInactive: boolean; outletId?: string; category?: string }) {
  const result = await pool.query(
    `SELECT mi.id, mi.name, mi.description, mi.category, mi.base_price_paise, mi.diet,
       mi.allergens, mi.image_key, mi.active,
       CASE WHEN outlet_sale.active=TRUE AND outlet_sale.sale_price_paise IS NOT NULL
         AND (outlet_sale.starts_at IS NULL OR outlet_sale.starts_at<=NOW())
         AND (outlet_sale.ends_at IS NULL OR outlet_sale.ends_at>NOW()) THEN outlet_sale.sale_price_paise END AS active_sale_price_paise,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'detail',p.detail,'priceDeltaPaise',p.price_delta_paise) ORDER BY p.sort_order)
         FROM menu_item_portions p WHERE p.item_id=mi.id), '[]'::jsonb) AS portions,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.label) ORDER BY s.sort_order)
         FROM menu_item_spice_levels s WHERE s.item_id=mi.id), '[]'::jsonb) AS "spiceLevels",
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'label',a.label,'pricePaise',a.price_paise) ORDER BY a.sort_order)
         FROM menu_item_add_ons a WHERE a.item_id=mi.id), '[]'::jsonb) AS "addOns",
       COALESCE((SELECT jsonb_agg(av.outlet_id ORDER BY av.outlet_id)
         FROM menu_item_outlet_availability av WHERE av.item_id=mi.id AND av.available=TRUE), '[]'::jsonb) AS "availableAt"
     FROM menu_items mi
     LEFT JOIN menu_item_sales outlet_sale ON outlet_sale.item_id=mi.id AND outlet_sale.outlet_id=$3
     WHERE ($1::boolean OR mi.active=TRUE) AND ($2::text IS NULL OR mi.category=$2)
     ORDER BY mi.category, mi.name`,
    [includeInactive, category ?? null, outletId ?? null],
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as string,
    basePrice: paiseToRupees(Number(row.base_price_paise)),
    ...(row.active_sale_price_paise ? { salePrice: paiseToRupees(Number(row.active_sale_price_paise)) } : {}),
    diet: row.diet as string,
    allergens: row.allergens as string[],
    
    image: row.image_key as string,
    active: row.active as boolean,
    availableAt: row.availableAt as string[],
    portions: (row.portions as { id: string; label: string; detail?: string; priceDeltaPaise: number }[]).map((item) => ({ ...item, priceDelta: paiseToRupees(item.priceDeltaPaise), priceDeltaPaise: undefined })),
    spiceLevels: row.spiceLevels,
    addOns: (row.addOns as { id: string; label: string; pricePaise: number }[]).map((item) => ({ ...item, price: paiseToRupees(item.pricePaise), pricePaise: undefined })),
    ...(outletId ? { available: (row.availableAt as string[]).includes(outletId) } : {}),
  }));
}

async function persistMenuItem(item: MenuInput, existingId?: string) {
  return withTransaction(async (client) => {
    const outletResult = await client.query("SELECT id FROM outlets WHERE active=TRUE");
    const outletIds = new Set(outletResult.rows.map((row) => row.id as string));
    const unknownOutlet = item.availableAt.find((id) => !outletIds.has(id));
    if (unknownOutlet) throw new ApiError(400, `Unknown outlet: ${unknownOutlet}`, "INVALID_OUTLET");

    if (existingId) {
      const update = await client.query(
        `UPDATE menu_items SET name=$2,description=$3,category=$4,base_price_paise=$5,diet=$6,allergens=$7,image_key=$8,
           active=TRUE,updated_at=NOW()
         WHERE id=$1 RETURNING id`,
        [existingId, item.name, item.description, item.category, rupeesToPaise(item.basePrice), item.diet, item.allergens, item.imageKey],
      );
      if (!update.rowCount) throw new ApiError(404, "Menu item was not found", "MENU_ITEM_NOT_FOUND");
      await client.query(
        "UPDATE menu_item_sales SET active=FALSE,updated_at=NOW() WHERE item_id=$1 AND sale_price_paise >= $2",
        [existingId, rupeesToPaise(item.basePrice)],
      );
    } else {
      await client.query(
        `INSERT INTO menu_items (id,name,description,category,base_price_paise,diet,allergens,image_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [item.id, item.name, item.description, item.category, rupeesToPaise(item.basePrice), item.diet, item.allergens, item.imageKey],
      );
    }

    const id = existingId ?? item.id;
    await client.query("DELETE FROM menu_item_portions WHERE item_id=$1", [id]);
    await client.query("DELETE FROM menu_item_spice_levels WHERE item_id=$1", [id]);
    await client.query("DELETE FROM menu_item_add_ons WHERE item_id=$1", [id]);
    await client.query("DELETE FROM menu_item_outlet_availability WHERE item_id=$1", [id]);
    for (const [sortOrder, portion] of item.portions.entries()) {
      await client.query("INSERT INTO menu_item_portions (item_id,id,label,detail,price_delta_paise,sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, portion.id, portion.label, portion.detail ?? null, rupeesToPaise(portion.priceDelta), sortOrder]);
    }
    for (const [sortOrder, spice] of item.spiceLevels.entries()) {
      await client.query("INSERT INTO menu_item_spice_levels (item_id,id,label,sort_order) VALUES ($1,$2,$3,$4)", [id, spice.id, spice.label, sortOrder]);
    }
    for (const [sortOrder, addOn] of item.addOns.entries()) {
      await client.query("INSERT INTO menu_item_add_ons (item_id,id,label,price_paise,sort_order) VALUES ($1,$2,$3,$4,$5)",
        [id, addOn.id, addOn.label, rupeesToPaise(addOn.price), sortOrder]);
    }
    for (const outletId of outletIds) {
      await client.query("INSERT INTO menu_item_outlet_availability (item_id,outlet_id,available) VALUES ($1,$2,$3)", [id, outletId, item.availableAt.includes(outletId)]);
    }
    return id;
  });
}

export async function registerCatalogRoutes(app: FastifyInstance) {
  app.get("/outlets", async (request) => {
    const query = parse(outletQuerySchema, request.query);
    const result = await pool.query(
      `SELECT o.id,o.name,o.address,o.phone,o.opening_hours,o.eta_minutes,o.delivery_fee_paise,o.fssai_licence,
        TO_CHAR(o.fssai_valid_till,'DD Mon YYYY') AS fssai_valid_till,
        COALESCE((SELECT jsonb_agg(a.pincode ORDER BY a.pincode) FROM outlet_delivery_areas a WHERE a.outlet_id=o.id),'[]'::jsonb) AS pincodes
       FROM outlets o WHERE o.active=TRUE AND ($1::text IS NULL OR EXISTS (
         SELECT 1 FROM outlet_delivery_areas a WHERE a.outlet_id=o.id AND a.pincode=$1
       )) ORDER BY o.name`,
      [query.postalCode ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id, name: row.name, address: row.address, phone: row.phone, hours: row.opening_hours,
      etaMins: row.eta_minutes, deliveryFee: paiseToRupees(Number(row.delivery_fee_paise)),
      fssai: { licence: row.fssai_licence, validTill: row.fssai_valid_till }, pincodes: row.pincodes,
    }));
  });

  app.get("/menu", async (request) => {
    const query = parse(menuQuerySchema, request.query);
    if (query.outletId) {
      const outlet = await pool.query("SELECT 1 FROM outlets WHERE id=$1 AND active=TRUE", [query.outletId]);
      if (!outlet.rowCount) throw new ApiError(404, "Outlet was not found", "OUTLET_NOT_FOUND");
    }
    return readMenu({ includeInactive: false, outletId: query.outletId, category: query.category });
  });

  app.get("/admin/menu", { preHandler: requireRoles("admin") }, async () => readMenu({ includeInactive: true }));

  app.get("/admin/sales", { preHandler: requireRoles("admin") }, async () => {
    const result = await pool.query(
      `SELECT sale.item_id AS "itemId",sale.outlet_id AS "outletId",outlet.name AS "outletName",
        mi.name,mi.base_price_paise AS "basePricePaise",sale.sale_price_paise AS "salePricePaise",
        sale.starts_at AS "startsAt",sale.ends_at AS "endsAt",sale.active
       FROM menu_item_sales sale
       JOIN menu_items mi ON mi.id=sale.item_id
       JOIN outlets outlet ON outlet.id=sale.outlet_id
       ORDER BY outlet.name,mi.name`,
    );
    return result.rows.map((row) => ({ ...row,
      basePrice: paiseToRupees(Number(row.basePricePaise)),
      salePrice: paiseToRupees(Number(row.salePricePaise)),
    }));
  });

  app.put("/admin/menu/:id/sale", { preHandler: requireRoles("admin") }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const body = parse(saleInputSchema, request.body);
    const menuItem = await pool.query("SELECT base_price_paise FROM menu_items WHERE id=$1 AND active=TRUE", [id]);
    if (!menuItem.rowCount) throw new ApiError(404, "Menu item was not found", "MENU_ITEM_NOT_FOUND");
    if (rupeesToPaise(body.salePrice) >= Number(menuItem.rows[0].base_price_paise)) {
      throw new ApiError(400, "The sale price must be lower than the regular price", "SALE_PRICE_NOT_LOWER");
    }
    const validOutlets = await pool.query(
      `SELECT outlet_id FROM menu_item_outlet_availability
       WHERE item_id=$1 AND outlet_id=ANY($2::text[]) AND available=TRUE`,
      [id, body.outletIds],
    );
    if (validOutlets.rowCount !== body.outletIds.length) {
      throw new ApiError(400, "Choose outlets where this item is available", "ITEM_UNAVAILABLE_AT_OUTLET");
    }
    await pool.query(
      `INSERT INTO menu_item_sales (item_id,outlet_id,sale_price_paise,starts_at,ends_at,active)
       SELECT $1,outlet_id,$3,$4,$5,TRUE FROM menu_item_outlet_availability
       WHERE item_id=$1 AND outlet_id=ANY($2::text[]) AND available=TRUE
       ON CONFLICT (item_id,outlet_id) DO UPDATE SET sale_price_paise=EXCLUDED.sale_price_paise,
         starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,active=TRUE,updated_at=NOW()`,
      [id, body.outletIds, rupeesToPaise(body.salePrice), body.startsAt ?? null, body.endsAt ?? null],
    );
    return { itemId: id, outletIds: body.outletIds, salePrice: body.salePrice, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null, active: true };
  });

  app.delete("/admin/menu/:id/sale", { preHandler: requireRoles("admin") }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const { outletId } = parse(saleOutletQuerySchema, request.query);
    const result = await pool.query("UPDATE menu_item_sales SET active=FALSE,updated_at=NOW() WHERE item_id=$1 AND outlet_id=$2 RETURNING item_id", [id, outletId]);
    if (!result.rowCount) throw new ApiError(404, "Sale was not found for this menu item", "SALE_NOT_FOUND");
    return { itemId: id, outletId, active: false };
  });

  app.post("/admin/menu", { preHandler: requireRoles("admin") }, async (request, reply) => {
    const item = parse(menuInputSchema, request.body);
    const duplicate = await pool.query("SELECT 1 FROM menu_items WHERE id=$1", [item.id]);
    if (duplicate.rowCount) throw new ApiError(409, "A menu item with this ID already exists", "MENU_ITEM_EXISTS");
    await persistMenuItem(item);
    const savedItem = (await readMenu({ includeInactive: true })).find((row) => row.id === item.id);
    return reply.code(201).send(savedItem);
  });

  app.put("/admin/menu/:id", { preHandler: requireRoles("admin") }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const item = parse(menuInputSchema.omit({ id: true }), request.body);
    await persistMenuItem({ ...item, id }, id);
    return (await readMenu({ includeInactive: true })).find((row) => row.id === id);
  });

  app.patch("/admin/menu/:id/availability", { preHandler: requireRoles("admin") }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const body = parse(z.object({ outletId: z.string().min(1), available: z.boolean() }), request.body);
    const result = await pool.query(
      `INSERT INTO menu_item_outlet_availability (item_id,outlet_id,available)
       SELECT $1,$2,$3 WHERE EXISTS (SELECT 1 FROM menu_items WHERE id=$1) AND EXISTS (SELECT 1 FROM outlets WHERE id=$2)
       ON CONFLICT (item_id,outlet_id) DO UPDATE SET available=EXCLUDED.available RETURNING item_id`,
      [id, body.outletId, body.available],
    );
    if (!result.rowCount) throw new ApiError(404, "Menu item or outlet was not found", "MENU_ITEM_OR_OUTLET_NOT_FOUND");
    return { itemId: id, outletId: body.outletId, available: body.available };
  });

  app.patch("/kitchen/menu/:id/availability", { preHandler: requireRoles("admin", "kitchen") }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const body = parse(z.object({ outletId: z.string().min(1), available: z.boolean() }), request.body);
    requireOutletAccess(request, body.outletId);
    const result = await pool.query(
      `INSERT INTO menu_item_outlet_availability (item_id,outlet_id,available)
       SELECT $1,$2,$3 WHERE EXISTS (SELECT 1 FROM menu_items WHERE id=$1 AND active=TRUE)
         AND EXISTS (SELECT 1 FROM outlets WHERE id=$2 AND active=TRUE)
       ON CONFLICT (item_id,outlet_id) DO UPDATE SET available=EXCLUDED.available RETURNING item_id`,
      [id, body.outletId, body.available],
    );
    if (!result.rowCount) throw new ApiError(404, "Active menu item or outlet was not found", "MENU_ITEM_OR_OUTLET_NOT_FOUND");
    return { itemId: id, outletId: body.outletId, available: body.available };
  });

  app.patch("/admin/menu/:id/active", { preHandler: requireRoles("admin") }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const body = parse(z.object({ active: z.boolean() }), request.body);
    const result = await pool.query(
      "UPDATE menu_items SET active=$2,updated_at=NOW() WHERE id=$1 RETURNING id,active",
      [id, body.active],
    );
    if (!result.rowCount) throw new ApiError(404, "Menu item was not found", "MENU_ITEM_NOT_FOUND");
    return { id, active: result.rows[0].active as boolean };
  });

  app.delete("/admin/menu/:id", { preHandler: requireRoles("admin") }, async (request) => {
    const { id } = parse(idSchema, request.params);
    const result = await pool.query("UPDATE menu_items SET active=FALSE,updated_at=NOW() WHERE id=$1 AND active=TRUE RETURNING id", [id]);
    if (!result.rowCount) throw new ApiError(404, "Menu item was not found", "MENU_ITEM_NOT_FOUND");
    return { id, active: false };
  });
}
