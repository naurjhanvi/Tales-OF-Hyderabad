import type { CartLine, MenuItem, Order, OrderStatus, Outlet, PaymentMethod } from "@/data/types";
import { menuImageKey, resolveMenuImage } from "@/data/menu";

const API_BASE = (import.meta.env["VITE_API_BASE_URL"] || "/api/v1").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = RequestInit & { token?: string };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers: inputHeaders, ...init } = options;
  const headers = new Headers(inputHeaders);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "Can't reach the Tales of Hyderabad API. Check that the backend is running.",
      0,
      "API_UNREACHABLE",
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || `The request failed (${response.status}).`,
      response.status,
      payload?.error?.code,
    );
  }
  return payload as unknown as T;
}

async function followServerEvents(
  path: string,
  headers: HeadersInit,
  onUpdate: () => Promise<unknown>,
  signal: AbortSignal,
) {
  const eventHeaders = new Headers(headers);
  eventHeaders.set("Accept", "text/event-stream");
  const response = await fetch(`${API_BASE}${path}`, { headers: eventHeaders, signal });
  if (!response.ok || !response.body) {
    throw new ApiError(`Live order updates are unavailable (${response.status}).`, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary).replaceAll("\r", "");
      buffer = buffer.slice(boundary + 2);
      const eventName = block
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      if (eventName === "snapshot" || eventName === "status") await onUpdate();
      boundary = buffer.indexOf("\n\n");
    }
    if (done) return;
  }
}

export function streamKitchenOrderEvents(
  outletId: string,
  token: string,
  onUpdate: () => Promise<unknown>,
  signal: AbortSignal,
) {
  return followServerEvents(
    `/kitchen/orders/events?outletId=${encodeURIComponent(outletId)}`,
    { Authorization: `Bearer ${token}` },
    onUpdate,
    signal,
  );
}

export function streamTrackedOrderEvents(
  orderCode: string,
  trackingToken: string,
  onUpdate: () => Promise<unknown>,
  signal: AbortSignal,
) {
  return followServerEvents(
    `/orders/${encodeURIComponent(orderCode)}/events`,
    { "X-Order-Tracking-Token": trackingToken },
    onUpdate,
    signal,
  );
}

interface ApiMenuItem extends Omit<MenuItem, "image"> {
  image: string;
  active?: boolean;
}

function mapMenuItem(item: ApiMenuItem): MenuItem {
  return { ...item, image: resolveMenuImage(item.image) };
}

interface ApiOutlet extends Omit<Outlet, "deliveryFee" | "pincodes"> {
  deliveryFee: number;
  pincodes: string[];
}

interface ApiOrderLine {
  id: string;
  itemId: string;
  name: string;
  diet: CartLine["diet"];
  qty?: number;
  quantity?: number;
  unitPrice: number;
  image?: string;
  portionId?: string | null;
  portionLabel?: string | null;
  spiceId?: string | null;
  spiceLabel?: string | null;
  addOns: CartLine["addOns"];
}

interface ApiOrder {
  id: string;
  outletId: string;
  outletName: string;
  status: OrderStatus;
  lines: ApiOrderLine[];
  customer: {
    name: string;
    phone: string;
    address: string;
    landmark?: string | null;
    notes?: string | null;
  };
  paymentMethod: PaymentMethod;
  paymentStatus?: Order["paymentStatus"];
  couponCode?: string;
  totals: Order["totals"];
  placedAt: number | string;
  expectedReadyAt: number | string;
  expectedDeliveryAt?: number | string;
  statusHistory: { status: OrderStatus; at: number | string; note?: string | null }[];
}

function toMillis(value: number | string): number {
  return typeof value === "number" ? value : new Date(value).getTime();
}

export function mapOrder(order: ApiOrder): Order {
  return {
    id: order.id,
    outletId: order.outletId,
    outletName: order.outletName,
    status: order.status,
    customer: {
      name: order.customer.name,
      phone: order.customer.phone,
      address: order.customer.address,
      ...(order.customer.landmark ? { landmark: order.customer.landmark } : {}),
      ...(order.customer.notes ? { notes: order.customer.notes } : {}),
    },
    paymentMethod: order.paymentMethod,
    ...(order.paymentStatus ? { paymentStatus: order.paymentStatus } : {}),
    totals: order.totals,
    placedAt: toMillis(order.placedAt),
    expectedReadyAt: toMillis(order.expectedReadyAt),
    ...(order.expectedDeliveryAt ? { expectedDeliveryAt: toMillis(order.expectedDeliveryAt) } : {}),
    statusHistory: order.statusHistory.map((event) => ({ ...event, at: toMillis(event.at) })),
    lines: order.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      name: line.name,
      image: resolveMenuImage(line.image || `${line.itemId}.jpg`),
      diet: line.diet,
      outletId: order.outletId,
      portionId: line.portionId ?? "",
      portionLabel: line.portionLabel ?? "",
      spiceId: line.spiceId ?? "",
      spiceLabel: line.spiceLabel ?? null,
      addOns: line.addOns ?? [],
      unitPrice: line.unitPrice,
      qty: line.qty ?? line.quantity ?? 1,
    })),
  };
}

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "kitchen";
  outletId: string | null;
}

export interface AdminCoupon {
  code: string;
  name: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minimumOrder: number;
  maximumDiscount: number | null;
  maxRedemptions: number | null;
  perCustomerLimit: number;
  outletIds: string[];
  startsAt: string;
  endsAt: string;
  active: boolean;
  redemptions: number;
  discountGiven: number;
}

export type CouponDraft = Omit<AdminCoupon, "redemptions" | "discountGiven" | "active">;

export interface AdminSale {
  itemId: string;
  outletId: string;
  outletName: string;
  name: string;
  basePrice: number;
  salePrice: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}

export interface PublicCouponOffer {
  code: string;
  name: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minimumOrder: number;
  maximumDiscount: number | null;
  endsAt: string;
  redemptions: number;
  maxRedemptions: number | null;
}

export interface PublicSaleOffer {
  itemId: string;
  name: string;
  image: string;
  basePrice: number;
  salePrice: number;
  endsAt: string | null;
}

export interface AvailablePromotions {
  sales: PublicSaleOffer[];
  coupons: PublicCouponOffer[];
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/outlets`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function getCatalog() {
  const [outlets, menu] = await Promise.all([
    request<ApiOutlet[]>("/outlets"),
    request<ApiMenuItem[]>("/menu"),
  ]);
  return { outlets, menu: menu.map(mapMenuItem) };
}

export async function getAdminMenu(token: string): Promise<MenuItem[]> {
  const menu = await request<ApiMenuItem[]>("/admin/menu", { token });
  return menu.map(mapMenuItem);
}

export async function saveMenuItem(
  item: MenuItem,
  token: string,
  create: boolean,
): Promise<MenuItem> {
  const body = {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    basePrice: item.basePrice,
    diet: item.diet,
    allergens: item.allergens,
    imageKey: menuImageKey(item.image),
    availableAt: item.availableAt,
    portions: item.portions,
    spiceLevels: item.spiceLevels,
    addOns: item.addOns,
  };
  const saved = create
    ? await request<ApiMenuItem>("/admin/menu", {
        method: "POST",
        token,
        body: JSON.stringify(body),
      })
    : await request<ApiMenuItem>(`/admin/menu/${encodeURIComponent(item.id)}`, {
        method: "PUT",
        token,
        body: JSON.stringify(body),
      });
  return mapMenuItem(saved);
}

export async function setMenuAvailability(
  itemId: string,
  outletId: string,
  available: boolean,
  token: string,
) {
  await request(`/admin/menu/${encodeURIComponent(itemId)}/availability`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ outletId, available }),
  });
}

export async function setKitchenMenuAvailability(
  itemId: string,
  outletId: string,
  available: boolean,
  token: string,
) {
  await request(`/kitchen/menu/${encodeURIComponent(itemId)}/availability`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ outletId, available }),
  });
}

export async function setMenuItemActive(itemId: string, active: boolean, token: string) {
  await request(`/admin/menu/${encodeURIComponent(itemId)}/active`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ active }),
  });
}

export async function archiveMenuItem(itemId: string, token: string) {
  await request(`/admin/menu/${encodeURIComponent(itemId)}`, { method: "DELETE", token });
}

export async function loginStaff(email: string, password: string) {
  return request<{ token: string; user: StaffUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getStaffUser(token: string): Promise<StaffUser> {
  return request<StaffUser>("/auth/me", { token });
}

export async function createOrder(
  body: {
    outletId: string;
    couponCode?: string;
    customer: Order["customer"];
    paymentMethod: PaymentMethod;
    lines: {
      itemId: string;
      quantity: number;
      portionId?: string;
      spiceId?: string;
      addOnIds: string[];
    }[];
  },
  idempotencyKey: string,
) {
  const response = await request<{
    order: ApiOrder;
    trackingToken: string;
    payment: { mode: "simulated"; status: "succeeded" };
  }>("/orders", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
  return { ...response, order: mapOrder(response.order) };
}

export async function getTrackedOrder(code: string, trackingToken: string): Promise<Order> {
  const order = await request<ApiOrder>(`/orders/${encodeURIComponent(code)}`, {
    headers: { "X-Order-Tracking-Token": trackingToken },
  });
  return mapOrder(order);
}

export async function getKitchenOrders(outletId: string, token: string): Promise<Order[]> {
  const response = await request<{ outletId: string; orders: (ApiOrder & { isLate: boolean })[] }>(
    `/kitchen/orders?outletId=${encodeURIComponent(outletId)}`,
    { token },
  );
  return response.orders.map(mapOrder);
}

export async function getAdminOrders(days: number, token: string): Promise<Order[]> {
  const response = await request<{ days: number; orders: ApiOrder[] }>(
    `/admin/orders?days=${days}`,
    { token },
  );
  return response.orders.map(mapOrder);
}

export async function getAdminCoupons(token: string): Promise<AdminCoupon[]> {
  return request<AdminCoupon[]>("/admin/coupons", { token });
}

export async function getAdminSales(token: string): Promise<AdminSale[]> {
  return request<AdminSale[]>("/admin/sales", { token });
}

export async function createAdminCoupon(coupon: CouponDraft, token: string): Promise<void> {
  await request("/admin/coupons", { method: "POST", token, body: JSON.stringify(coupon) });
}

export async function setAdminCouponActive(
  code: string,
  active: boolean,
  token: string,
): Promise<void> {
  await request(`/admin/coupons/${encodeURIComponent(code)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ active }),
  });
}

export async function setItemSale(
  itemId: string,
  sale: { salePrice: number; outletIds: string[]; startsAt?: string; endsAt?: string },
  token: string,
) {
  return request(`/admin/menu/${encodeURIComponent(itemId)}/sale`, {
    method: "PUT",
    token,
    body: JSON.stringify(sale),
  });
}

export async function removeItemSale(
  itemId: string,
  outletId: string,
  token: string,
): Promise<void> {
  await request(
    `/admin/menu/${encodeURIComponent(itemId)}/sale?outletId=${encodeURIComponent(outletId)}`,
    { method: "DELETE", token },
  );
}

export async function validateCoupon(input: {
  code: string;
  outletId: string;
  orderValue: number;
  phone?: string;
}) {
  return request<{ valid: boolean; code?: string; discount?: number; message: string }>(
    "/coupons/validate",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getAvailablePromotions(outletId: string): Promise<AvailablePromotions> {
  const result = await request<AvailablePromotions>(
    `/promotions/available?outletId=${encodeURIComponent(outletId)}`,
  );
  return {
    sales: result.sales.map((sale) => ({ ...sale, image: resolveMenuImage(sale.image) })),
    coupons: result.coupons,
  };
}

export async function updateKitchenOrder(
  code: string,
  status: OrderStatus,
  token: string,
): Promise<Order> {
  const response = await request<{ order: ApiOrder }>(
    `/kitchen/orders/${encodeURIComponent(code)}/status`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    },
  );
  return mapOrder(response.order);
}
