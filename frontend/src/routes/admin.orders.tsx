import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Clock3, RefreshCw, Search, ShoppingBag, X } from "lucide-react";
import type { Order, OrderStatus } from "@/data/types";
import { getAdminOrders } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useAdminScope } from "@/components/AdminShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({ meta: [{ title: "Orders — Tales of Hyderabad" }] }),
  component: AdminOrdersPage,
});

const statuses: ("all" | OrderStatus)[] = [
  "all",
  "placed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

function pillStyle(status: OrderStatus) {
  if (status === "cancelled") return "border-red-300/20 bg-red-300/10 text-red-100";
  if (status === "delivered") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  if (status === "ready" || status === "out_for_delivery")
    return "border-sky-300/20 bg-sky-300/10 text-sky-100";
  if (status === "preparing") return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  return "border-white/15 bg-white/[0.05] text-slate-200";
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `••••••${digits.slice(-4)}` : phone;
}
function itemSummary(order: Order) {
  const first = order.lines[0];
  return first
    ? `${first.name}${order.lines.length > 1 ? ` +${order.lines.length - 1} more` : ""}`
    : "No item details";
}

function AdminOrdersPage() {
  const store = useStore();
  const { outletId, days, search } = useAdminScope();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [payment, setPayment] = useState<"all" | "upi" | "card">("all");
  const [tableSearch, setTableSearch] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = async () => {
    if (!store.staffToken) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await getAdminOrders(days, store.staffToken));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [store.staffToken, days]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = useMemo(
    () =>
      orders.filter((order) => {
        if (outletId !== "all" && order.outletId !== outletId) return false;
        if (status !== "all" && order.status !== status) return false;
        if (payment !== "all" && order.paymentMethod !== payment) return false;
        if (
          lateOnly &&
          !(
            order.expectedReadyAt < now &&
            ["placed", "accepted", "preparing"].includes(order.status)
          )
        )
          return false;
        const term = `${search} ${tableSearch}`.trim().toLowerCase();
        if (
          term &&
          !`${order.id} ${order.customer.name} ${order.customer.phone} ${order.outletName} ${itemSummary(order)}`
            .toLowerCase()
            .includes(term)
        )
          return false;
        return true;
      }),
    [orders, outletId, status, payment, lateOnly, now, search, tableSearch],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-amber-300">
            Operations · {days} days
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {visible.length} orders match your filters. Customer phone numbers are masked in the
            list.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-100"
        >
          {error}
        </p>
      )}
      <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-3 shadow-xl backdrop-blur-xl sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search orders</span>
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Search order, customer, outlet, or dish"
              className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="orders-status-filter">
              Status
            </label>
            <select
              id="orders-status-filter"
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | OrderStatus)}
              className="rounded-xl border border-white/10 bg-[#131a25] px-3 py-2.5 text-xs font-semibold text-slate-200 outline-none"
            >
              <option value="all">All statuses</option>
              {statuses.slice(1).map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="orders-payment-filter">
              Payment method
            </label>
            <select
              id="orders-payment-filter"
              value={payment}
              onChange={(event) => setPayment(event.target.value as typeof payment)}
              className="rounded-xl border border-white/10 bg-[#131a25] px-3 py-2.5 text-xs font-semibold text-slate-200 outline-none"
            >
              <option value="all">All payments</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </select>
            <button
              type="button"
              aria-pressed={lateOnly}
              onClick={() => setLateOnly((value) => !value)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors",
                lateOnly
                  ? "border-red-300/30 bg-red-300/10 text-red-100"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]",
              )}
            >
              Late only
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full min-w-[930px] text-left text-xs">
            <thead className="sticky top-0 bg-[#131a25] text-[9px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-3 py-3 font-bold sm:px-4">Order ID · placed</th>
                <th className="px-3 py-3 font-bold">Outlet</th>
                <th className="px-3 py-3 font-bold">Customer · items</th>
                <th className="px-3 py-3 text-right font-bold">Total</th>
                <th className="px-3 py-3 font-bold">Payment</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">Promised</th>
                <th className="px-3 py-3 text-right font-bold">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {visible.map((order) => {
                const late =
                  order.expectedReadyAt < now &&
                  ["placed", "accepted", "preparing"].includes(order.status);
                return (
                  <tr
                    key={order.id}
                    className={cn(
                      "transition-colors hover:bg-white/[0.035]",
                      late && "bg-red-400/[0.035]",
                    )}
                  >
                    <td
                      className={cn(
                        "border-l-2 px-3 py-3.5 sm:px-4",
                        late ? "border-red-400" : "border-transparent",
                      )}
                    >
                      <span className="block font-bold text-white">{order.id}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">
                        {new Date(order.placedAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-slate-300">{order.outletName}</td>
                    <td className="max-w-64 px-3 py-3.5">
                      <span className="block truncate font-semibold text-slate-200">
                        {order.customer.name} · {maskPhone(order.customer.phone)}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-slate-500">
                        {itemSummary(order)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-bold tabular-nums text-white">
                      {formatINR(order.totals.total)}
                    </td>
                    <td className="px-3 py-3.5 uppercase text-slate-300">
                      {order.paymentMethod}
                      <span className="mt-1 block text-[9px] text-emerald-300">Recorded</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize",
                          pillStyle(order.status),
                        )}
                      >
                        {order.status.replaceAll("_", " ")}
                      </span>
                      {late && (
                        <span className="mt-1 block text-[9px] font-bold text-red-200">
                          Late · needs attention
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 tabular-nums text-slate-300">
                      {new Date(order.expectedReadyAt).toLocaleTimeString("en-IN", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(order)}
                        aria-label={`View order ${order.id}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:border-amber-300/30 hover:text-amber-100"
                      >
                        <ArrowRight className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && !visible.length && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    No orders match these filters.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    Loading order records…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-drawer-title"
            className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#101722] p-5 text-slate-100 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                  Order detail · {selected.outletName}
                </p>
                <h2 id="order-drawer-title" className="mt-1 font-display text-2xl font-semibold">
                  {selected.id}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Placed{" "}
                  {new Date(selected.placedAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close order details"
                className="flex size-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.06]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Current status
                </p>
                <span
                  className={cn(
                    "mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold capitalize",
                    pillStyle(selected.status),
                  )}
                >
                  {selected.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Promised ready
                </p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold tabular-nums">
                  <Clock3 className="size-3.5 text-amber-200" aria-hidden />
                  {new Date(selected.expectedReadyAt).toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-sm font-bold">Customer</h3>
              <p className="mt-3 text-sm font-semibold">{selected.customer.name}</p>
              <p className="mt-1 text-xs text-slate-400">{selected.customer.phone}</p>
              <p className="mt-3 text-xs leading-relaxed text-slate-300">
                {selected.customer.address}
                {selected.customer.landmark ? ` · ${selected.customer.landmark}` : ""}
              </p>
              {selected.customer.notes && (
                <p className="mt-3 rounded-xl bg-black/20 p-3 text-xs leading-relaxed text-slate-300">
                  Note: {selected.customer.notes}
                </p>
              )}
            </section>
            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-sm font-bold">Items</h3>
              <ul className="mt-3 space-y-3">
                {selected.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex justify-between gap-3 border-b border-white/[0.07] pb-3 last:border-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">
                        {line.qty} × {line.name}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-500">
                        {[
                          line.portionLabel,
                          line.spiceLabel,
                          ...line.addOns.map((addon) => addon.label),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold tabular-nums">
                      {formatINR(line.qty * line.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-sm font-bold">Payment summary</h3>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <dt>Items · GST included</dt>
                  <dd className="tabular-nums">{formatINR(selected.totals.itemsTotal)}</dd>
                </div>
                <div className="flex justify-between text-slate-400">
                  <dt>Delivery fee</dt>
                  <dd className="tabular-nums">{formatINR(selected.totals.deliveryFee)}</dd>
                </div>
                {selected.totals.discount > 0 && (
                  <div className="flex justify-between text-emerald-200">
                    <dt>Coupon {selected.couponCode}</dt>
                    <dd className="tabular-nums">−{formatINR(selected.totals.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-3 text-sm font-black text-white">
                  <dt>Total · {selected.paymentMethod.toUpperCase()}</dt>
                  <dd className="tabular-nums">{formatINR(selected.totals.total)}</dd>
                </div>
              </dl>
            </section>
            <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-sm font-bold">Order timeline</h3>
              <ol className="mt-3 space-y-3">
                {selected.statusHistory.map((event, index) => (
                  <li key={`${event.status}-${event.at}-${index}`} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1 size-2 shrink-0 rounded-full",
                        index === selected.statusHistory.length - 1
                          ? "bg-amber-300"
                          : "bg-slate-600",
                      )}
                    />
                    <span>
                      <span className="block text-xs font-semibold capitalize">
                        {event.status.replaceAll("_", " ")}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {new Date(event.at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {event.note ? ` · ${event.note}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
