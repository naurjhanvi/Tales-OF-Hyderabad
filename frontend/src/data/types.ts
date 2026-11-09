export type Diet = "veg" | "nonveg";

export interface PortionOption {
  id: string;
  label: string;
  detail?: string;
  priceDelta: number;
}

export interface SpiceOption {
  id: string;
  label: string;
}

export interface AddOnOption {
  id: string;
  label: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: string;

  basePrice: number;

  salePrice?: number;
  diet: Diet;
  allergens: string[];

  image: string;

  availableAt: string[];
  portions: PortionOption[];
  spiceLevels: SpiceOption[];
  addOns: AddOnOption[];
  active?: boolean;
}

export interface OutletFssai {
  licence: string;
  validTill: string;
}

export interface Outlet {
  id: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  etaMins: number;
  deliveryFee: number;
  pincodes: string[];
  fssai: OutletFssai;
}

export interface CartAddOn {
  id: string;
  label: string;
  price: number;
}

export interface CartLine {
  id: string;
  itemId: string;
  name: string;
  image: string;
  diet: Diet;
  outletId: string;
  portionId: string;
  portionLabel: string;
  spiceId: string;
  spiceLabel: string | null;
  addOns: CartAddOn[];

  unitPrice: number;
  qty: number;
  unavailableReason?: string;
}

export type PaymentMethod = "upi" | "card";

export type OrderStatus =
  "placed" | "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";

export interface OrderStatusEvent {
  status: OrderStatus;

  at: number;
  note?: string | null;
}

export interface OrderCustomer {
  name: string;
  phone: string;
  address: string;
  landmark?: string;
  notes?: string;
}

export interface OrderTotals {
  itemsTotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  gstIncluded: number;
}

export interface Order {
  id: string;
  outletId: string;
  outletName: string;
  lines: CartLine[];
  totals: OrderTotals;
  customer: OrderCustomer;
  paymentMethod: PaymentMethod;
  paymentStatus?: "succeeded" | "failed" | "pending";
  couponCode?: string;

  placedAt: number;

  status: OrderStatus;

  statusHistory: OrderStatusEvent[];

  expectedReadyAt: number;
  expectedDeliveryAt?: number;
}
