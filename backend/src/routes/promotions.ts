import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db.js";
import { ApiError } from "../lib/errors.js";
import { discountFor } from "../lib/discount.js";
import { requireRoles } from "../lib/auth.js";
import { paiseToRupees, parse, rupeesToPaise } from "../lib/validation.js";

const couponInputSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/),
  name: z.string().trim().min(2).max(100),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().finite().positive().max(100_000),
  minimumOrder: z.number().finite().min(0).max(100_000).default(0),
  maximumDiscount: z.number().finite().positive().max(100_000).nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().max(100).default(1),
  outletIds: z.array(z.string().min(1).max(80)).max(20).default([]),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
}).superRefine((input, context) => {
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) context.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after the start time." });
  if (input.discountType === "percentage" && input.discountValue > 100) context.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage cannot exceed 100." });
});

const validateSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24),
  outletId: z.string().min(1).max(80),
  orderValue: z.number().finite().min(0).max(100_000),
  phone: z.string().trim().max(24).optional(),
});

const availableSchema = z.object({ outletId: z.string().min(1).max(80) });

const codeSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/) });

export async function registerPromotionRoutes(app: FastifyInstance) {
  app.get("/promotions/available", async (request) => {
    const { outletId } = parse(availableSchema, request.query);
    const outlet = await pool.query("SELECT 1 FROM outlets WHERE id=$1 AND active=TRUE", [outletId]);
    if (!outlet.rowCount) throw new ApiError(404, "Outlet was not found", "OUTLET_NOT_FOUND");

    const [sales, coupons] = await Promise.all([
      pool.query(
        `SELECT mi.id AS "itemId",mi.name,mi.image_key AS image,mi.base_price_paise AS "basePricePaise",
          sale.sale_price_paise AS "salePricePaise",sale.ends_at AS "endsAt"
         FROM menu_items mi
         JOIN menu_item_outlet_availability av ON av.item_id=mi.id AND av.outlet_id=$1 AND av.available=TRUE
         JOIN menu_item_sales sale ON sale.item_id=mi.id AND sale.outlet_id=$1
         WHERE mi.active=TRUE AND sale.active=TRUE AND sale.sale_price_paise IS NOT NULL
           AND (sale.starts_at IS NULL OR sale.starts_at<=NOW())
           AND (sale.ends_at IS NULL OR sale.ends_at>NOW())
         ORDER BY mi.name`, [outletId],
      ),
      pool.query(
        `SELECT c.code,c.name,c.discount_type AS "discountType",c.discount_value AS "discountValueRaw",
          c.minimum_order_paise AS "minimumOrderPaise",c.maximum_discount_paise AS "maximumDiscountPaise",
          c.ends_at AS "endsAt",c.max_redemptions AS "maxRedemptions",
          COUNT(r.id)::int AS redemptions
         FROM coupons c LEFT JOIN coupon_redemptions r ON r.coupon_code=c.code
         WHERE c.active=TRUE AND c.starts_at<=NOW() AND c.ends_at>NOW()
           AND (CARDINALITY(c.outlet_ids)=0 OR $1=ANY(c.outlet_ids))
         GROUP BY c.code
         HAVING c.max_redemptions IS NULL OR COUNT(r.id)<c.max_redemptions
         ORDER BY c.created_at DESC`, [outletId],
      ),
    ]);

    return {
      sales: sales.rows.map((row) => ({
        itemId: row.itemId,
        name: row.name,
        image: row.image,
        basePrice: paiseToRupees(Number(row.basePricePaise)),
        salePrice: paiseToRupees(Number(row.salePricePaise)),
        endsAt: row.endsAt,
      })),
      coupons: coupons.rows.map((row) => ({
        code: row.code,
        name: row.name,
        discountType: row.discountType,
        discountValue: row.discountType === "fixed" ? paiseToRupees(Number(row.discountValueRaw)) : Number(row.discountValueRaw),
        minimumOrder: paiseToRupees(Number(row.minimumOrderPaise)),
        maximumDiscount: row.maximumDiscountPaise === null ? null : paiseToRupees(Number(row.maximumDiscountPaise)),
        endsAt: row.endsAt,
        redemptions: Number(row.redemptions),
        maxRedemptions: row.maxRedemptions,
      })),
    };
  });

  app.get("/admin/coupons", { preHandler: requireRoles("admin") }, async () => {
    const result = await pool.query(
      `SELECT c.code,c.name,c.discount_type,c.discount_value,c.minimum_order_paise,c.maximum_discount_paise,
        c.max_redemptions,c.per_customer_limit,c.outlet_ids,c.starts_at,c.ends_at,c.active,c.created_at,
        COUNT(r.id)::int AS redemptions,COALESCE(SUM(r.discount_paise),0)::bigint AS discount_given_paise
       FROM coupons c LEFT JOIN coupon_redemptions r ON r.coupon_code=c.code
       GROUP BY c.code ORDER BY c.created_at DESC`,
    );
    return result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      discountType: row.discount_type,
      discountValue: row.discount_type === "fixed" ? paiseToRupees(Number(row.discount_value)) : Number(row.discount_value),
      minimumOrder: paiseToRupees(Number(row.minimum_order_paise)),
      maximumDiscount: row.maximum_discount_paise === null ? null : paiseToRupees(Number(row.maximum_discount_paise)),
      maxRedemptions: row.max_redemptions,
      perCustomerLimit: row.per_customer_limit,
      outletIds: row.outlet_ids,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      active: row.active,
      redemptions: Number(row.redemptions),
      discountGiven: paiseToRupees(Number(row.discount_given_paise)),
    }));
  });

  app.post("/admin/coupons", { preHandler: requireRoles("admin") }, async (request, reply) => {
    const coupon = parse(couponInputSchema, request.body);
    const outlets = await pool.query("SELECT id FROM outlets WHERE active=TRUE AND id=ANY($1::text[])", [coupon.outletIds]);
    if (outlets.rowCount !== coupon.outletIds.length) throw new ApiError(400, "One or more selected outlets are invalid", "INVALID_OUTLET");
    const value = coupon.discountType === "fixed" ? rupeesToPaise(coupon.discountValue) : Math.round(coupon.discountValue);
    const result = await pool.query(
      `INSERT INTO coupons (code,name,discount_type,discount_value,minimum_order_paise,maximum_discount_paise,
        max_redemptions,per_customer_limit,outlet_ids,starts_at,ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (code) DO NOTHING RETURNING code`,
      [coupon.code,coupon.name,coupon.discountType,value,rupeesToPaise(coupon.minimumOrder),coupon.maximumDiscount ? rupeesToPaise(coupon.maximumDiscount) : null,coupon.maxRedemptions ?? null,coupon.perCustomerLimit,coupon.outletIds,coupon.startsAt,coupon.endsAt],
    );
    if (!result.rowCount) throw new ApiError(409, "That coupon code already exists", "COUPON_EXISTS");
    return reply.code(201).send({ code: coupon.code, active: true });
  });

  app.patch("/admin/coupons/:code", { preHandler: requireRoles("admin") }, async (request) => {
    const { code } = parse(codeSchema, request.params);
    const body = parse(z.object({ active: z.boolean() }), request.body);
    const result = await pool.query("UPDATE coupons SET active=$2,updated_at=NOW() WHERE code=$1 RETURNING code,active", [code, body.active]);
    if (!result.rowCount) throw new ApiError(404, "Coupon was not found", "COUPON_NOT_FOUND");
    return result.rows[0];
  });

  app.post("/coupons/validate", async (request) => {
    const input = parse(validateSchema, request.body);
    const result = await pool.query(
      `SELECT code,discount_type,discount_value,minimum_order_paise,maximum_discount_paise,
        max_redemptions,per_customer_limit,outlet_ids,active,starts_at,ends_at
       FROM coupons WHERE code=$1`, [input.code],
    );
    const coupon = result.rows[0];
    if (!coupon || !coupon.active || new Date(coupon.starts_at).getTime() > Date.now() || new Date(coupon.ends_at).getTime() <= Date.now()) {
      return { valid: false, message: "This coupon is not active right now." };
    }
    if (coupon.outlet_ids.length && !coupon.outlet_ids.includes(input.outletId)) return { valid: false, message: "This coupon is not valid at the selected outlet." };
    const orderValuePaise = rupeesToPaise(input.orderValue);
    if (orderValuePaise < Number(coupon.minimum_order_paise)) return { valid: false, message: `Add ${paiseToRupees(Number(coupon.minimum_order_paise) - orderValuePaise).toLocaleString("en-IN", { style: "currency", currency: "INR" })} more to use this coupon.` };
    if (coupon.max_redemptions !== null) {
      const uses = await pool.query("SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE coupon_code=$1", [input.code]);
      if (Number(uses.rows[0].count) >= Number(coupon.max_redemptions)) return { valid: false, message: "This coupon has reached its redemption limit." };
    }
    if (input.phone) {
      const uses = await pool.query("SELECT COUNT(*)::int AS count FROM coupon_redemptions WHERE coupon_code=$1 AND regexp_replace(customer_phone,'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g')", [input.code, input.phone]);
      if (Number(uses.rows[0].count) >= Number(coupon.per_customer_limit)) return { valid: false, message: "This phone number has already used this coupon." };
    }
    const discountPaise = discountFor(coupon, orderValuePaise);
    return { valid: true, code: coupon.code, discount: paiseToRupees(discountPaise), message: `Coupon applied — you save ${paiseToRupees(discountPaise).toLocaleString("en-IN", { style: "currency", currency: "INR" })}.` };
  });
}

