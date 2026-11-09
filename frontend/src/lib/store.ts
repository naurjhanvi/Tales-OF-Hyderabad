import { useSyncExternalStore } from "react";
import type {
  AddOnOption,
  CartAddOn,
  CartLine,
  MenuItem,
  Order,
  OrderCustomer,
  OrderStatus,
  Outlet,
  PaymentMethod,
} from "@/data/types";
import { computeUnitPrice, setCurrentMenu } from "@/data/menu";
import { setCurrentOutlets } from "@/data/outlets";
import { randomId } from "@/lib/format";
import {
  checkApiHealth,
  archiveMenuItem,
  createOrder,
  getAdminMenu,
  getCatalog,
  getKitchenOrders,
  getStaffUser,
  getTrackedOrder,
  loginStaff,
  saveMenuItem,
  setMenuAvailability,
  setKitchenMenuAvailability,
  setMenuItemActive,
  StaffUser,
  updateKitchenOrder,
} from "@/lib/api";

const CUSTOMER_STORAGE_KEY = "toh-customer-v2";
const STAFF_SESSION_KEY = "toh-staff-session-v1";

export interface AppState {
  outletId: string | null;
  kitchenOutletId: string;
  cart: CartLine[];
  appliedCouponCode: string | null;
  orders: Order[];
  trackedOrderCodes: string[];
  trackingTokens: Record<string, string>;
  menuItems: MenuItem[];
  outlets: Outlet[];
  hydrated: boolean;
  catalogLoading: boolean;
  catalogError: string | null;
  apiStatus: "checking" | "online" | "offline";
  staff: StaffUser | null;
  staffToken: string | null;
  staffLoading: boolean;
}

interface PersistedCustomerState {
  outletId?: string | null;
  kitchenOutletId?: string;
  cart?: CartLine[];
  appliedCouponCode?: string | null;
  trackedOrderCodes?: string[];
  trackingTokens?: Record<string, string>;
}

const serverSnapshot: AppState = {
  outletId: null,
  kitchenOutletId: "kondapur",
  cart: [],
  appliedCouponCode: null,
  orders: [],
  trackedOrderCodes: [],
  trackingTokens: {},
  menuItems: [],
  outlets: [],
  hydrated: false,
  catalogLoading: true,
  catalogError: null,
  apiStatus: "checking",
  staff: null,
  staffToken: null,
  staffLoading: false,
};

let state: AppState = serverSnapshot;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function writeCustomerState(next: AppState) {
  if (typeof window === "undefined") return;
  const persisted: PersistedCustomerState = {
    outletId: next.outletId,
    kitchenOutletId: next.kitchenOutletId,
    cart: next.cart,
    appliedCouponCode: next.appliedCouponCode,
    trackedOrderCodes: next.trackedOrderCodes.slice(0, 5),
    trackingTokens: next.trackingTokens,
  };
  try {
    window.localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    return;
  }
}

function setState(next: AppState, persistCustomer = false) {
  state = next;
  setCurrentMenu(next.menuItems);
  setCurrentOutlets(next.outlets);
  if (persistCustomer) writeCustomerState(next);
  emit();
}

function normalizeCustomer(
  raw: PersistedCustomerState | null,
): Pick<
  AppState,
  | "outletId"
  | "kitchenOutletId"
  | "cart"
  | "appliedCouponCode"
  | "trackedOrderCodes"
  | "trackingTokens"
> {
  return {
    outletId: raw?.outletId ?? null,
    kitchenOutletId: raw?.kitchenOutletId ?? "kondapur",
    cart: Array.isArray(raw?.cart) ? raw.cart : [],
    appliedCouponCode: typeof raw?.appliedCouponCode === "string" ? raw.appliedCouponCode : null,
    trackedOrderCodes: Array.isArray(raw?.trackedOrderCodes) ? raw.trackedOrderCodes : [],
    trackingTokens:
      raw?.trackingTokens && typeof raw.trackingTokens === "object" ? raw.trackingTokens : {},
  };
}

function reconcileCart(cart: CartLine[], menuItems: MenuItem[]): CartLine[] {
  return cart.map((line) => {
    const item = menuItems.find((entry) => entry.id === line.itemId);
    if (!item) return line;
    const missingPortion =
      Boolean(line.portionId) && !item.portions.some((option) => option.id === line.portionId);
    const missingSpice =
      Boolean(line.spiceId) && !item.spiceLevels.some((option) => option.id === line.spiceId);
    const validAddOns = line.addOns.map((saved) =>
      item.addOns.find((option) => option.id === saved.id),
    );
    const missingAddOn = validAddOns.some((option) => !option);
    const unavailableReason = missingPortion
      ? "The selected portion changed. Remove this item and add it again."
      : missingSpice
        ? "The selected spice level changed. Remove this item and add it again."
        : missingAddOn
          ? "An add-on changed. Remove this item and add it again."
          : undefined;
    const next: CartLine = {
      ...line,
      name: item.name,
      image: item.image,
      diet: item.diet,
    };
    if (unavailableReason) {
      next.unavailableReason = unavailableReason;
    } else {
      delete next.unavailableReason;
      next.portionLabel = item.portions.find((option) => option.id === line.portionId)?.label ?? "";
      next.spiceLabel =
        item.spiceLevels.find((option) => option.id === line.spiceId)?.label ?? null;
      next.addOns = validAddOns
        .filter((option): option is AddOnOption => option !== undefined)
        .map((option) => ({ id: option.id, label: option.label, price: option.price }));
      next.unitPrice = computeUnitPrice(
        item,
        line.portionId,
        next.addOns.map((addon) => addon.id),
      );
    }
    return next;
  });
}

async function loadCatalog() {
  try {
    const catalog = await getCatalog();
    const cart = reconcileCart(state.cart, catalog.menu);
    setState(
      {
        ...state,
        outlets: catalog.outlets,
        menuItems: catalog.menu,
        cart,
        catalogLoading: false,
        catalogError: null,
        apiStatus: "online",
      },
      true,
    );
  } catch (error) {
    setState({
      ...state,
      catalogLoading: false,
      catalogError: error instanceof Error ? error.message : "Menu could not be loaded.",
      apiStatus: "offline",
    });
  }
}

export function hydrateStore(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  if (typeof window === "undefined") return Promise.resolve();

  let persisted: PersistedCustomerState | null = null;
  let token: string | null = null;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (raw) persisted = JSON.parse(raw) as PersistedCustomerState;
  } catch {
    persisted = null;
  }
  try {
    token = window.sessionStorage.getItem(STAFF_SESSION_KEY);
  } catch {
    token = null;
  }

  state = {
    ...serverSnapshot,
    ...normalizeCustomer(persisted),
    hydrated: true,
    catalogLoading: true,
    staffToken: token,
    staffLoading: Boolean(token),
  };
  setCurrentMenu(state.menuItems);
  setCurrentOutlets(state.outlets);
  emit();

  window.addEventListener("storage", (event) => {
    if (event.key !== CUSTOMER_STORAGE_KEY) return;
    let customerState: PersistedCustomerState | null = null;
    try {
      customerState = event.newValue
        ? (JSON.parse(event.newValue) as PersistedCustomerState)
        : null;
    } catch {
      return;
    }
    setState({ ...state, ...normalizeCustomer(customerState) });
  });

  hydratePromise = Promise.all([
    loadCatalog(),
    checkApiHealth().then((online) => {
      setState({ ...state, apiStatus: online ? "online" : "offline" });
    }),
    token
      ? getStaffUser(token)
          .then((staff) => setState({ ...state, staff, staffLoading: false }))
          .catch(() => {
            window.sessionStorage.removeItem(STAFF_SESSION_KEY);
            setState({ ...state, staff: null, staffToken: null, staffLoading: false });
          })
      : Promise.resolve(),
  ]).then(() => undefined);
  return hydratePromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStore(): AppState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverSnapshot,
  );
}

export function getState(): AppState {
  return state;
}

export async function refreshCatalog() {
  setState({ ...state, catalogLoading: true, catalogError: null });
  await loadCatalog();
}

export async function refreshAdminMenu() {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in as an admin to manage the menu.");
  const menuItems = await getAdminMenu(token);
  setState(
    { ...state, menuItems, cart: reconcileCart(state.cart, menuItems), catalogError: null },
    true,
  );
}

export async function signIn(email: string, password: string): Promise<StaffUser> {
  const response = await loginStaff(email, password);
  try {
    window.sessionStorage.setItem(STAFF_SESSION_KEY, response.token);
  } catch {
    throw new Error(
      "This browser blocked the staff session. Enable session storage and try again.",
    );
  }
  setState({ ...state, staff: response.user, staffToken: response.token, staffLoading: false });
  return response.user;
}

export function signOut() {
  try {
    window.sessionStorage.removeItem(STAFF_SESSION_KEY);
  } catch {
    setState({ ...state, staff: null, staffToken: null, staffLoading: false });
    return;
  }
  setState({ ...state, staff: null, staffToken: null, staffLoading: false });
}

export function selectOutlet(outletId: string) {
  setState({ ...state, outletId }, true);
}

export function setKitchenOutlet(outletId: string) {
  setState({ ...state, kitchenOutletId: outletId }, true);
}

export type OutletSwitchDecision = "same" | "switch" | "confirm";

export function outletSwitchDecision(
  currentId: string | null,
  cartCount: number,
  nextId: string,
): OutletSwitchDecision {
  if (nextId === currentId) return "same";
  return cartCount > 0 ? "confirm" : "switch";
}

export function applyOutletSwitch(nextId: string) {
  const decision = outletSwitchDecision(state.outletId, state.cart.length, nextId);
  if (decision === "confirm") return;
  setState(
    {
      ...state,
      outletId: nextId,
      cart: decision === "switch" ? [] : state.cart,
      appliedCouponCode: decision === "switch" ? null : state.appliedCouponCode,
    },
    true,
  );
}

export function confirmOutletSwitch(nextId: string) {
  setState({ ...state, outletId: nextId, cart: [], appliedCouponCode: null }, true);
}

export function setAppliedCouponCode(code: string | null) {
  setState({ ...state, appliedCouponCode: code?.trim().toUpperCase() || null }, true);
}

export interface AddToCartInput {
  item: MenuItem;
  portionId: string;
  spiceId: string;
  addOnIds: string[];
  qty: number;
}

function composeAddOns(item: MenuItem, addOnIds: string[]): CartAddOn[] {
  return item.addOns
    .filter((addon) => addOnIds.includes(addon.id))
    .map((addon) => ({ id: addon.id, label: addon.label, price: addon.price }));
}

function sameComposition(line: CartLine, input: AddToCartInput) {
  return (
    line.itemId === input.item.id &&
    line.portionId === input.portionId &&
    line.spiceId === input.spiceId &&
    line.addOns
      .map((addon) => addon.id)
      .sort()
      .join(",") === input.addOnIds.slice().sort().join(",")
  );
}

export function addToCart(input: AddToCartInput) {
  if (!state.outletId) return;
  const quantity = Math.min(20, Math.max(1, Math.trunc(input.qty)));
  const existing = state.cart.find((line) => sameComposition(line, input));
  if (existing) {
    setState(
      {
        ...state,
        cart: state.cart.map((line) =>
          line.id === existing.id ? { ...line, qty: Math.min(20, line.qty + quantity) } : line,
        ),
      },
      true,
    );
    return;
  }
  const portion = input.item.portions.find((option) => option.id === input.portionId);
  const line: CartLine = {
    id: randomId(),
    itemId: input.item.id,
    name: input.item.name,
    image: input.item.image,
    diet: input.item.diet,
    outletId: state.outletId,
    portionId: input.portionId,
    portionLabel: portion?.label ?? "",
    spiceId: input.spiceId,
    spiceLabel: input.item.spiceLevels.find((option) => option.id === input.spiceId)?.label ?? null,
    addOns: composeAddOns(input.item, input.addOnIds),
    unitPrice: computeUnitPrice(input.item, input.portionId, input.addOnIds),
    qty: quantity,
  };
  setState({ ...state, cart: [...state.cart, line] }, true);
}

export function setLineQty(lineId: string, qty: number) {
  if (qty <= 0) return removeLine(lineId);
  setState(
    {
      ...state,
      cart: state.cart.map((line) =>
        line.id === lineId ? { ...line, qty: Math.min(20, Math.trunc(qty)) } : line,
      ),
    },
    true,
  );
}

export function removeLine(lineId: string) {
  setState({ ...state, cart: state.cart.filter((line) => line.id !== lineId) }, true);
}

export function clearCart() {
  setState({ ...state, cart: [], appliedCouponCode: null }, true);
}

export async function placeOrder(
  customer: OrderCustomer,
  paymentMethod: PaymentMethod,
  idempotencyKey: string,
  couponCode?: string,
) {
  const outletId = state.outletId;
  const cart = state.cart;
  if (!outletId || cart.length === 0)
    throw new Error("Choose an outlet and add an item before checkout.");
  const response = await createOrder(
    {
      outletId,
      ...(couponCode ? { couponCode } : {}),
      customer,
      paymentMethod,
      lines: cart.map((line) => ({
        itemId: line.itemId,
        quantity: line.qty,
        ...(line.portionId ? { portionId: line.portionId } : {}),
        ...(line.spiceId ? { spiceId: line.spiceId } : {}),
        addOnIds: line.addOns.map((addon) => addon.id),
      })),
    },
    idempotencyKey,
  );
  const trackingTokens = { ...state.trackingTokens, [response.order.id]: response.trackingToken };
  const trackedOrderCodes = [
    response.order.id,
    ...state.trackedOrderCodes.filter((code) => code !== response.order.id),
  ].slice(0, 5);
  setState(
    {
      ...state,
      cart: [],
      appliedCouponCode: null,
      orders: [response.order, ...state.orders.filter((order) => order.id !== response.order.id)],
      trackingTokens,
      trackedOrderCodes,
    },
    true,
  );
  return response.order;
}

export function getOrder(orderId: string): Order | null {
  return state.orders.find((order) => order.id === orderId) ?? null;
}

export function getTrackingToken(orderId: string): string | null {
  return state.trackingTokens[orderId] ?? null;
}

export async function refreshTrackedOrder(orderId: string) {
  const token = getTrackingToken(orderId);
  if (!token) throw new Error("This browser doesn't have the tracking link for that order.");
  const order = await getTrackedOrder(orderId, token);
  setState({ ...state, orders: [order, ...state.orders.filter((item) => item.id !== order.id)] });
  return order;
}

export async function refreshKitchenOrders(outletId: string) {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in to view kitchen orders.");
  const orders = await getKitchenOrders(outletId, token);
  setState({
    ...state,
    orders: [
      ...orders,
      ...state.orders.filter((order) => !orders.some((item) => item.id === order.id)),
    ],
  });
  return orders;
}

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in to update kitchen orders.");
  const order = await updateKitchenOrder(orderId, status, token);
  setState({ ...state, orders: [order, ...state.orders.filter((item) => item.id !== order.id)] });
  return order;
}

export async function upsertMenuItem(item: MenuItem) {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in as an admin to manage the menu.");
  const create = !state.menuItems.some((current) => current.id === item.id);
  const saved = await saveMenuItem(item, token, create);
  await refreshAdminMenu();
  return saved;
}

export async function deleteMenuItem(itemId: string) {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in as an admin to manage the menu.");
  await archiveMenuItem(itemId, token);
  await refreshAdminMenu();
}

export async function restoreMenuItem(itemId: string) {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in as an admin to manage the menu.");
  await setMenuItemActive(itemId, true, token);
  await refreshAdminMenu();
}

export async function setItemAvailability(itemId: string, outletId: string, available: boolean) {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in as an admin to manage the menu.");
  await setMenuAvailability(itemId, outletId, available, token);
  await refreshAdminMenu();
}

export async function setKitchenItemAvailability(
  itemId: string,
  outletId: string,
  available: boolean,
) {
  const token = state.staffToken;
  if (!token) throw new Error("Sign in to manage kitchen availability.");
  await setKitchenMenuAvailability(itemId, outletId, available, token);
  await refreshCatalog();
}

export function newMenuItemId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "item";
  return `${slug.slice(0, 60)}-${randomId()}`;
}
