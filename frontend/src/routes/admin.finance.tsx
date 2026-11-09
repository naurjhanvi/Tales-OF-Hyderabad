import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CircleAlert,
  CreditCard,
  Landmark,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { Order } from "@/data/types";
import { getAdminOrders } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useAdminScope } from "@/components/AdminShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({ meta: [{ title: "Finance — Tales of Hyderabad" }] }),
  component: AdminFinancePage,
});

const panel = "rounded-2xl border border-white/10 bg-white/[0.055] shadow-xl backdrop-blur-xl";

function AdminFinancePage() {
  const store = useStore();
  const { outletId, days } = useAdminScope();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!store.staffToken) return;
    let active = true;
    setLoading(true);
    void getAdminOrders(days, store.staffToken)
      .then((data) => {
        if (active) {
          setOrders(data);
          setError(null);
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Finance records could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store.staffToken, days]);

  const scoped = useMemo(
    () => orders.filter((order) => outletId === "all" || order.outletId === outletId),
    [orders, outletId],
  );
  const paid = scoped.filter(
    (order) => order.status !== "cancelled" && order.paymentStatus === "succeeded",
  );
  const gross = paid.reduce(
    (sum, order) => sum + order.totals.itemsTotal + order.totals.deliveryFee,
    0,
  );
  const discounts = paid.reduce((sum, order) => sum + order.totals.discount, 0);
  const net = paid.reduce((sum, order) => sum + order.totals.total, 0);
  const byPayment = [
    { name: "UPI", icon: Landmark, orders: paid.filter((order) => order.paymentMethod === "upi") },
    {
      name: "Card",
      icon: CreditCard,
      orders: paid.filter((order) => order.paymentMethod === "card"),
    },
  ].map((item) => ({
    ...item,
    amount: item.orders.reduce((sum, order) => sum + order.totals.total, 0),
  }));
  const byOutlet = Array.from(new Set(paid.map((order) => order.outletId)))
    .map((id) => {
      const outletOrders = paid.filter((order) => order.outletId === id);
      return {
        id,
        name:
          store.outlets.find((outlet) => outlet.id === id)?.name ??
          outletOrders[0]?.outletName ??
          id,
        orders: outletOrders.length,
        gross: outletOrders.reduce(
          (sum, order) => sum + order.totals.itemsTotal + order.totals.deliveryFee,
          0,
        ),
        discounts: outletOrders.reduce((sum, order) => sum + order.totals.discount, 0),
        net: outletOrders.reduce((sum, order) => sum + order.totals.total, 0),
      };
    })
    .sort((a, b) => b.net - a.net);

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-100"
        >
          {error}
        </p>
      )}
      <section className="flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 sm:p-5">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-200" aria-hidden />
        <div>
          <h2 className="text-sm font-bold text-amber-100">Direct-order records</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            Figures reflect orders recorded here. Gateway settlements, refunds, delivery partner
            costs, operating expenses, and third-party app sales are not connected, so this page
            does not estimate profit.
          </p>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Gross order value",
            value: gross,
            detail: "Items plus delivery, before coupons",
            icon: TrendingUp,
            tone: "text-sky-200 bg-sky-300/10",
          },
          {
            label: "Discounts given",
            value: discounts,
            detail: "Recorded coupon savings",
            icon: ReceiptText,
            tone: "text-amber-200 bg-amber-300/10",
          },
          {
            label: "Net direct-order value",
            value: net,
            detail: `${paid.length} recorded orders`,
            icon: WalletCards,
            tone: "text-emerald-200 bg-emerald-300/10",
          },
          {
            label: "Unsettled costs",
            value: null,
            detail: "Not imported from payment or delivery partners",
            icon: CircleAlert,
            tone: "text-red-200 bg-red-300/10",
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className={cn(panel, "p-4")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
                    {metric.label}
                  </p>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-white">
                    {loading ? "—" : metric.value === null ? "—" : formatINR(metric.value)}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{metric.detail}</p>
                </div>
                <span
                  className={cn("flex size-9 items-center justify-center rounded-xl", metric.tone)}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <section className={cn(panel, "p-4 sm:p-5")}>
          <h2 className="font-display text-lg font-semibold text-white">Payment mix</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Recorded UPI and card orders · {days} days
          </p>
          <div className="mt-4 space-y-3">
            {byPayment.map((entry) => {
              const Icon = entry.icon;
              const share = net ? (entry.amount / net) * 100 : 0;
              return (
                <div
                  key={entry.name}
                  className="rounded-xl border border-white/[0.08] bg-black/10 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <Icon className="size-4 text-amber-200" aria-hidden />
                      {entry.name}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-white">
                      {formatINR(entry.amount)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-amber-300"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-500">
                    {entry.orders.length} orders · {Math.round(share)}% of net order value
                  </p>
                </div>
              );
            })}
          </div>
        </section>
        <section className={cn(panel, "overflow-hidden")}>
          <div className="border-b border-white/10 px-4 py-4 sm:px-5">
            <h2 className="font-display text-lg font-semibold text-white">Order value by outlet</h2>
            <p className="mt-1 text-[11px] text-slate-400">Direct orders after recorded coupons</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-xs">
              <thead className="bg-white/[0.035] text-[9px] uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Outlet</th>
                  <th className="px-3 py-3 text-right font-bold">Orders</th>
                  <th className="px-3 py-3 text-right font-bold">Gross</th>
                  <th className="px-3 py-3 text-right font-bold">Discounts</th>
                  <th className="px-4 py-3 text-right font-bold">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {byOutlet.map((outlet) => (
                  <tr key={outlet.id} className="hover:bg-white/[0.035]">
                    <td className="px-4 py-3.5 font-semibold text-slate-200">{outlet.name}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-slate-300">
                      {outlet.orders}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-slate-300">
                      {formatINR(outlet.gross)}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-amber-100">
                      {formatINR(outlet.discounts)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold tabular-nums text-white">
                      {formatINR(outlet.net)}
                    </td>
                  </tr>
                ))}
                {!loading && !byOutlet.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      No recorded orders in this date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className={cn(panel, "overflow-hidden")}>
        <div className="border-b border-white/10 px-4 py-4 sm:px-5">
          <h2 className="font-display text-lg font-semibold text-white">Latest order records</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            Order references, payment methods and recorded totals.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-white/[0.035] text-[9px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">Order</th>
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold">Outlet</th>
                <th className="px-3 py-3 font-bold">Method</th>
                <th className="px-4 py-3 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {paid.slice(0, 10).map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3.5 font-bold text-white">{order.id}</td>
                  <td className="px-3 py-3.5 text-slate-400">
                    {new Date(order.placedAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-3 py-3.5 text-slate-300">{order.outletName}</td>
                  <td className="px-3 py-3.5 uppercase text-slate-300">{order.paymentMethod}</td>
                  <td className="px-4 py-3.5 text-right font-bold tabular-nums text-white">
                    {formatINR(order.totals.total)}
                  </td>
                </tr>
              ))}
              {!loading && !paid.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No recorded order payments in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
