import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Download, MapPin, ShieldCheck } from "lucide-react";
import type { Order } from "@/data/types";
import { getAdminOrders } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useAdminScope } from "@/components/AdminShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/section/$section")({
  head: () => ({ meta: [{ title: "Admin workspace — Tales of Hyderabad" }] }),
  component: AdminSectionPage,
});

const panel =
  "rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-xl backdrop-blur-xl sm:p-5";

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `••••••${digits.slice(-4)}` : "Hidden";
}

function downloadCsv(orders: Order[]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    [
      "Order ID",
      "Placed at",
      "Outlet",
      "Customer",
      "Status",
      "Payment method",
      "Gross items",
      "Delivery fee",
      "Discount",
      "Net total",
    ],
    ...orders.map((order) => [
      order.id,
      new Date(order.placedAt).toISOString(),
      order.outletName,
      order.customer.name,
      order.status,
      order.paymentMethod,
      order.totals.itemsTotal,
      order.totals.deliveryFee,
      order.totals.discount,
      order.totals.total,
    ]),
  ];
  const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tales-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AdminSectionPage() {
  const { section } = Route.useParams();
  const store = useStore();
  const { outletId, days } = useAdminScope();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!store.staffToken || !["customers", "reports"].includes(section)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void getAdminOrders(days, store.staffToken)
      .then((result) => {
        if (active) {
          setOrders(result);
          setError(null);
        }
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store.staffToken, section, days]);
  const scopedOrders = useMemo(
    () => orders.filter((order) => outletId === "all" || order.outletId === outletId),
    [orders, outletId],
  );

  if (section === "outlets")
    return (
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {store.outlets.map((outlet) => (
          <article key={outlet.id} className={cn(panel, "space-y-3")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-300">
                  Outlet · {outlet.id}
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold text-white">
                  {outlet.name}
                </h2>
              </div>
              <MapPin className="size-4 text-amber-200" aria-hidden />
            </div>
            <p className="text-xs leading-relaxed text-slate-300">{outlet.address}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Hours</p>
                <p className="mt-1 text-[11px] text-slate-200">{outlet.hours}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Avg delivery
                </p>
                <p className="mt-1 text-[11px] text-slate-200">
                  {outlet.etaMins} min · {formatINR(outlet.deliveryFee)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-emerald-300/10 bg-emerald-300/[0.05] p-3">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-200" aria-hidden />
              <p className="text-[10px] leading-relaxed text-slate-300">
                FSSAI {outlet.fssai.licence} · valid till {outlet.fssai.validTill}
              </p>
            </div>
          </article>
        ))}
        {!store.outlets.length && (
          <p className="text-sm text-slate-400">Outlet information is loading.</p>
        )}
      </div>
    );

  if (section === "customers") {
    const customers = new Map<
      string,
      { name: string; phone: string; orders: number; spend: number; last: number }
    >();
    for (const order of scopedOrders) {
      if (order.status === "cancelled") continue;
      const key = order.customer.phone.replace(/\D/g, "");
      const current = customers.get(key) ?? {
        name: order.customer.name,
        phone: order.customer.phone,
        orders: 0,
        spend: 0,
        last: 0,
      };
      current.orders += 1;
      current.spend += order.totals.total;
      current.last = Math.max(current.last, order.placedAt);
      customers.set(key, current);
    }
    const rows = Array.from(customers.values()).sort((a, b) => b.spend - a.spend);
    const repeat = rows.filter((customer) => customer.orders > 1).length;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-sky-300/15 bg-sky-300/[0.06] p-4 text-xs leading-relaxed text-sky-100/80">
          This view is derived from direct order history for the selected period. Customer accounts,
          loyalty points, and marketing opt-in are not connected yet; no marketing contact details
          are exposed here.
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className={panel}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Distinct direct customers
            </p>
            <p className="mt-2 font-display text-3xl text-white">{loading ? "—" : rows.length}</p>
          </article>
          <article className={panel}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Repeat in this period
            </p>
            <p className="mt-2 font-display text-3xl text-white">
              {loading ? "—" : rows.length ? `${Math.round((repeat / rows.length) * 100)}%` : "0%"}
            </p>
          </article>
          <article className={panel}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Combined direct spend
            </p>
            <p className="mt-2 font-display text-3xl text-white">
              {formatINR(rows.reduce((sum, customer) => sum + customer.spend, 0))}
            </p>
          </article>
        </div>
        <section className={cn(panel, "overflow-x-auto p-0")}>
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-white/[0.035] text-[9px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3 text-right">Orders</th>
                <th className="px-3 py-3 text-right">Direct spend</th>
                <th className="px-4 py-3 text-right">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {rows.map((customer) => (
                <tr key={customer.phone}>
                  <td className="px-4 py-3.5 font-semibold text-slate-200">{customer.name}</td>
                  <td className="px-3 py-3.5 text-slate-400">{maskPhone(customer.phone)}</td>
                  <td className="px-3 py-3.5 text-right tabular-nums text-slate-300">
                    {customer.orders}
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold tabular-nums text-white">
                    {formatINR(customer.spend)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-400">
                    {new Date(customer.last).toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <p className="p-5 text-center text-xs text-slate-400">Loading customer rollup…</p>
          )}
          {error && (
            <p role="alert" className="p-5 text-center text-xs text-red-200">
              {error}
            </p>
          )}
        </section>
      </div>
    );
  }

  if (section === "reports")
    return (
      <div className="space-y-4">
        <section className={cn(panel, "flex flex-wrap items-center justify-between gap-4")}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">
              Sales report · {days} days
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-white">
              Export direct order activity
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              One row per paid or cancelled order with outlet, totals, discounts, and payment
              method.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(scopedOrders)}
            disabled={!scopedOrders.length}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden />
            Download CSV
          </button>
        </section>
        <section className={cn(panel, "grid gap-3 sm:grid-cols-3")}>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Order rows
            </p>
            <p className="mt-1 font-display text-2xl text-white">{scopedOrders.length}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Gross order value
            </p>
            <p className="mt-1 font-display text-2xl text-white">
              {formatINR(
                scopedOrders
                  .filter((order) => order.status !== "cancelled")
                  .reduce(
                    (sum, order) => sum + order.totals.itemsTotal + order.totals.deliveryFee,
                    0,
                  ),
              )}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Coupon discounts
            </p>
            <p className="mt-1 font-display text-2xl text-white">
              {formatINR(scopedOrders.reduce((sum, order) => sum + order.totals.discount, 0))}
            </p>
          </div>
        </section>
        {error && (
          <p role="alert" className="text-xs text-red-200">
            {error}
          </p>
        )}
        {loading && <p className="text-xs text-slate-400">Loading report rows…</p>}
      </div>
    );

  if (section === "marketing")
    return (
      <div className="space-y-4">
        <section className={cn(panel, "max-w-3xl")}>
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-300">
            Direct-order growth
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">
            Promotions are ready to manage
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Create a dish sale or checkout coupon in Offers & Coupons. Customer messaging campaigns
            and consent tracking are not connected, so this workspace will not send messages.
          </p>
          <Link
            to="/admin/offers"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950"
          >
            Manage offers
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      </div>
    );

  return (
    <section className={cn(panel, "mx-auto max-w-2xl py-10 text-center")}>
      <h2 className="font-display text-2xl font-semibold text-white">Workspace not found</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
        Choose an available section from the menu.
      </p>
      <Link
        to="/admin"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-slate-950"
      >
        Return to overview
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
