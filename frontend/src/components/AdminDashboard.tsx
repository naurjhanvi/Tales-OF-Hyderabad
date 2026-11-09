import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CircleAlert,
  Clock3,
  Flame,
  ShoppingBag,
  Store,
  TicketPercent,
  TrendingUp,
  Utensils,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminCoupon } from "@/lib/api";
import { getAdminCoupons, getAdminOrders } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { hydrateStore, refreshAdminMenu, useStore } from "@/lib/store";
import type { Order } from "@/data/types";
import { useAdminScope } from "@/components/AdminShell";
import { cn } from "@/lib/utils";

const panel =
  "rounded-2xl border border-white/10 bg-white/[0.055] shadow-[0_16px_38px_-28px_rgba(0,0,0,0.9)] backdrop-blur-xl";
const activeStatuses = new Set(["placed", "accepted", "preparing", "ready", "out_for_delivery"]);

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `••••••${digits.slice(-4)}` : phone;
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
  });
}

function formatCompact(value: number) {
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 10_000) return `₹${(value / 1_000).toFixed(0)}k`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function Kpi({
  label,
  value,
  note,
  icon: Icon,
  tone = "amber",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Flame;
  tone?: "amber" | "green" | "red" | "blue";
}) {
  const tones = {
    amber: "border-amber-300/15 bg-amber-300/[0.08] text-amber-200",
    green: "border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-200",
    red: "border-red-300/15 bg-red-300/[0.08] text-red-200",
    blue: "border-sky-300/15 bg-sky-300/[0.08] text-sky-200",
  };
  return (
    <article className={cn(panel, "min-h-32 p-4 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
            {label}
          </p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-white sm:text-[1.75rem]">
            {value}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{note}</p>
        </div>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
            tones[tone],
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
    </article>
  );
}

function statusLabel(status: Order["status"]) {
  return status.replaceAll("_", " ");
}

export function AdminDashboard() {
  const store = useStore();
  const { outletId, days } = useAdminScope();
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    void hydrateStore();
  }, []);
  useEffect(() => {
    const token = store.staffToken;
    if (!token || store.staff?.role !== "admin") return;
    let active = true;
    setLoading(true);
    void Promise.all([getAdminOrders(days, token), getAdminCoupons(token), refreshAdminMenu()])
      .then(([nextOrders, nextCoupons]) => {
        if (active) {
          setOrders(nextOrders);
          setCoupons(nextCoupons);
          setError(null);
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Dashboard data could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store.staffToken, store.staff?.role, days, refreshToken]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleOrders = useMemo(
    () => orders.filter((order) => outletId === "all" || order.outletId === outletId),
    [orders, outletId],
  );
  const businessOrders = visibleOrders.filter((order) => order.status !== "cancelled");
  const revenue = businessOrders.reduce((sum, order) => sum + order.totals.total, 0);
  const discountTotal = businessOrders.reduce((sum, order) => sum + order.totals.discount, 0);
  const active = visibleOrders.filter((order) => activeStatuses.has(order.status));
  const lateOrders = active.filter(
    (order) =>
      order.expectedReadyAt < now && ["placed", "accepted", "preparing"].includes(order.status),
  );
  const customerCounts = new Map<string, number>();
  for (const order of businessOrders)
    customerCounts.set(
      order.customer.phone.replace(/\D/g, ""),
      (customerCounts.get(order.customer.phone.replace(/\D/g, "")) ?? 0) + 1,
    );
  const repeatRate = customerCounts.size
    ? Array.from(customerCounts.values()).filter((count) => count > 1).length / customerCounts.size
    : 0;
  const averageOrder = businessOrders.length ? revenue / businessOrders.length : 0;

  const revenueTrend = useMemo(() => {
    const map = new Map<string, number>();
    const count = Math.min(days, 30);
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const key = dateKey(date.getTime());
      map.set(key, 0);
    }
    for (const order of businessOrders) {
      const key = dateKey(order.placedAt);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + order.totals.total);
    }
    return Array.from(map.entries()).map(([key, amount]) => ({
      label: dayLabel(key),
      revenue: amount,
    }));
  }, [businessOrders, days]);

  const ordersByHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      label: `${String(hour).padStart(2, "0")}:00`,
      orders: 0,
    }));
    for (const order of visibleOrders) {
      const hour = new Date(order.placedAt).getHours();
      hours[hour]!.orders += 1;
    }
    return hours;
  }, [visibleOrders]);
  const peakHours = ordersByHour
    .filter((entry) => entry.orders > 0)
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 2)
    .map((entry) => entry.label);

  const topItems = new Map<string, { name: string; units: number; revenue: number }>();
  for (const order of businessOrders)
    for (const line of order.lines) {
      const current = topItems.get(line.itemId) ?? { name: line.name, units: 0, revenue: 0 };
      current.units += line.qty;
      current.revenue += line.unitPrice * line.qty;
      topItems.set(line.itemId, current);
    }
  const topItemsRows = Array.from(topItems.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const outlets = Array.from(new Set(businessOrders.map((order) => order.outletId)))
    .map((id) => {
      const outletOrders = businessOrders.filter((order) => order.outletId === id);
      const outlet = store.outlets.find((item) => item.id === id);
      return {
        id,
        name: outlet?.name ?? outletOrders[0]?.outletName ?? id,
        orders: outletOrders.length,
        revenue: outletOrders.reduce((sum, order) => sum + order.totals.total, 0),
        late: outletOrders.filter((order) => lateOrders.some((late) => late.id === order.id))
          .length,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const expiringCoupons = coupons.filter(
    (coupon) =>
      coupon.active &&
      new Date(coupon.endsAt).getTime() > now &&
      new Date(coupon.endsAt).getTime() < now + 7 * 86_400_000,
  );
  const soldOutItems = store.menuItems.filter(
    (item) =>
      item.active !== false &&
      (outletId === "all" ? item.availableAt.length === 0 : !item.availableAt.includes(outletId)),
  );
  const attentionCount = lateOrders.length + soldOutItems.length + expiringCoupons.length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
            Business pulse ·{" "}
            {outletId === "all"
              ? "All outlets"
              : store.outlets.find((outlet) => outlet.id === outletId)?.name}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            A practical view of the direct-order business.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshToken((value) => value + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-bold text-slate-200 transition-colors hover:bg-white/10"
        >
          <span className={cn("size-3.5", loading && "animate-spin")}>↻</span>
          {loading ? "Updating…" : "Refresh snapshot"}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300/25 bg-red-400/10 p-3 text-sm text-red-100"
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Kpi
          label="Direct revenue"
          value={loading ? "—" : formatINR(revenue)}
          note={`Recorded orders · ${days}-day window`}
          icon={TrendingUp}
        />
        <Kpi
          label="Direct orders"
          value={loading ? "—" : businessOrders.length.toLocaleString("en-IN")}
          note={`Average order ${formatINR(averageOrder)}`}
          icon={ShoppingBag}
          tone="blue"
        />
        <Kpi
          label="Discounts given"
          value={loading ? "—" : formatINR(discountTotal)}
          note="Coupon savings recorded at checkout"
          icon={TicketPercent}
          tone="green"
        />
        <Kpi
          label="Active orders"
          value={loading ? "—" : active.length.toLocaleString("en-IN")}
          note={`${active.filter((order) => order.status === "preparing").length} preparing · ${active.filter((order) => order.status === "ready").length} ready`}
          icon={Utensils}
          tone="blue"
        />
        <Kpi
          label="Late orders"
          value={loading ? "—" : String(lateOrders.length)}
          note={lateOrders.length ? "Kitchen attention needed" : "No kitchen delays right now"}
          icon={Clock3}
          tone={lateOrders.length ? "red" : "green"}
        />
        <Kpi
          label="Repeat customers"
          value={loading ? "—" : `${Math.round(repeatRate * 100)}%`}
          note={`${customerCounts.size} distinct phones in this window`}
          icon={Flame}
          tone="green"
        />
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-sky-300/15 bg-sky-300/[0.06] px-3.5 py-3 text-[11px] leading-relaxed text-sky-100/80">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-sky-200" aria-hidden />
        <span>
          <strong className="text-sky-100">Revenue scope:</strong> totals reflect direct orders
          recorded in this system. Payment gateway settlements and third-party app sales are not
          included.
        </span>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1.45fr_0.8fr]">
        <section className={cn(panel, "p-4 sm:p-5")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Revenue trend</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Recorded orders · GST-inclusive</p>
            </div>
            <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.08] px-2.5 py-1 text-[10px] font-bold text-amber-100">
              {days === 7 ? "7 days" : `${days} days`}
            </span>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={formatCompact}
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [formatINR(Number(value)), "Revenue"]}
                  contentStyle={{
                    background: "#121a26",
                    border: "1px solid rgba(255,255,255,.14)",
                    borderRadius: 12,
                    color: "#f8fafc",
                  }}
                  labelStyle={{ color: "#cbd5e1" }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#fde68a", stroke: "#0b0f17" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className={cn(panel, "p-4 sm:p-5")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Needs attention</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {attentionCount
                  ? `${attentionCount} items may need a quick look.`
                  : "The live workspace is clear."}
              </p>
            </div>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-xl",
                attentionCount
                  ? "bg-amber-300/10 text-amber-200"
                  : "bg-emerald-300/10 text-emerald-200",
              )}
            >
              <BellRing className="size-4" aria-hidden />
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {lateOrders.slice(0, 2).map((order) => (
              <Link
                key={order.id}
                to="/admin/orders"
                className="flex items-center justify-between gap-3 rounded-xl border border-red-300/15 bg-red-400/[0.07] p-3 transition-colors hover:bg-red-400/10"
              >
                <span>
                  <span className="block text-xs font-bold text-red-100">
                    {order.id} · {order.outletName}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-red-100/65">
                    Promised{" "}
                    {new Date(order.expectedReadyAt).toLocaleTimeString("en-IN", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-red-200" aria-hidden />
              </Link>
            ))}
            {soldOutItems.slice(0, 2).map((item) => (
              <Link
                key={item.id}
                to="/admin/menu"
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3 transition-colors hover:bg-amber-300/10"
              >
                <span>
                  <span className="block text-xs font-bold text-amber-100">
                    {item.name} · unavailable
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    Review outlet availability
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-amber-200" aria-hidden />
              </Link>
            ))}
            {expiringCoupons.slice(0, 2).map((coupon) => (
              <Link
                key={coupon.code}
                to="/admin/offers"
                className="flex items-center justify-between gap-3 rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-3 transition-colors hover:bg-sky-300/10"
              >
                <span>
                  <span className="block text-xs font-bold text-sky-100">
                    {coupon.code} expires soon
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {new Date(coupon.endsAt).toLocaleDateString("en-IN")}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-sky-200" aria-hidden />
              </Link>
            ))}
            {!attentionCount && (
              <div className="rounded-xl border border-white/8 bg-black/10 p-3 text-xs text-slate-400">
                Late orders, sale availability and coupon expiry alerts will appear here.
              </div>
            )}
            <Link
              to="/admin/offers"
              className="inline-flex items-center gap-1.5 pt-1 text-[11px] font-bold text-amber-200 hover:text-amber-100"
            >
              Manage offers and sales
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1.25fr_0.75fr]">
        <section className={cn(panel, "p-4 sm:p-5")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Orders by hour</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {peakHours.length
                  ? `Busiest observed: ${peakHours.join(" and ")}`
                  : "Order distribution in this period"}
              </p>
            </div>
            <Clock3 className="size-4 text-slate-400" aria-hidden />
          </div>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ordersByHour} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={3}
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#121a26",
                    border: "1px solid rgba(255,255,255,.14)",
                    borderRadius: 12,
                    color: "#f8fafc",
                  }}
                />
                <Bar dataKey="orders" name="Orders" radius={[5, 5, 0, 0]}>
                  {ordersByHour.map((entry, index) => (
                    <Cell
                      key={`${entry.label}-${index}`}
                      fill={peakHours.includes(entry.label) ? "#fbbf24" : "#64748b"}
                      fillOpacity={peakHours.includes(entry.label) ? 0.95 : 0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className={cn(panel, "p-4 sm:p-5")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Top dishes</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                By gross item sales in the selected range
              </p>
            </div>
            <Utensils className="size-4 text-amber-200" aria-hidden />
          </div>
          <div className="mt-4 space-y-3">
            {topItemsRows.map((item, index) => (
              <div key={item.name}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-semibold text-slate-200">
                    <span className="mr-2 text-[10px] text-slate-500">0{index + 1}</span>
                    {item.name}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-white">
                    {formatINR(item.revenue)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-amber-300"
                    style={{
                      width: `${Math.max(6, (item.revenue / Math.max(topItemsRows[0]?.revenue ?? 1, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[9px] text-slate-500">{item.units} sold</p>
              </div>
            ))}
            {!topItemsRows.length && (
              <p className="rounded-xl border border-white/8 p-4 text-xs text-slate-400">
                Item performance will appear after orders have been placed.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1fr_1fr]">
        <section className={cn(panel, "overflow-hidden")}>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Outlet performance</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Direct order results for selected range
              </p>
            </div>
            <Store className="size-4 text-slate-400" aria-hidden />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-white/[0.035] text-[9px] uppercase tracking-[0.13em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold sm:px-5">Outlet</th>
                  <th className="px-3 py-3 text-right font-bold">Orders</th>
                  <th className="px-3 py-3 text-right font-bold">Revenue</th>
                  <th className="px-4 py-3 text-right font-bold sm:px-5">Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {outlets.map((outlet) => (
                  <tr key={outlet.id} className="hover:bg-white/[0.035]">
                    <td className="px-4 py-3.5 font-semibold text-slate-200 sm:px-5">
                      {outlet.name}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-slate-300">
                      {outlet.orders}
                    </td>
                    <td className="px-3 py-3.5 text-right font-bold tabular-nums text-white">
                      {formatINR(outlet.revenue)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3.5 text-right font-bold tabular-nums sm:px-5",
                        outlet.late ? "text-red-200" : "text-emerald-200",
                      )}
                    >
                      {outlet.late}
                    </td>
                  </tr>
                ))}
                {!outlets.length && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No outlet orders in this date range yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/10 px-4 py-3 sm:px-5">
            <Link
              to="/admin/orders"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-200"
            >
              View orders
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </section>
        <section className={cn(panel, "overflow-hidden")}>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Latest orders</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Most recently placed direct orders
              </p>
            </div>
            <ShoppingBag className="size-4 text-slate-400" aria-hidden />
          </div>
          <div className="divide-y divide-white/[0.07]">
            {visibleOrders.slice(0, 4).map((order) => (
              <Link
                key={order.id}
                to="/admin/orders"
                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.035] sm:px-5"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs font-bold text-white">{order.id}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold capitalize text-slate-300">
                      {statusLabel(order.status)}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-slate-400">
                    {order.outletName} · {order.customer.name} · {maskPhone(order.customer.phone)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-bold tabular-nums text-white">
                    {formatINR(order.totals.total)}
                  </span>
                  <span className="mt-1 block text-[9px] text-slate-500">
                    {new Date(order.placedAt).toLocaleTimeString("en-IN", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </Link>
            ))}
            {!visibleOrders.length && (
              <div className="px-5 py-8 text-center text-xs text-slate-500">
                No orders in this range.
              </div>
            )}
          </div>
          <div className="border-t border-white/10 px-4 py-3 sm:px-5">
            <Link
              to="/admin/orders"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-200"
            >
              Open order list
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
      <p className="flex items-center gap-2 px-1 text-[10px] text-slate-500">
        <ArrowUpRight className="size-3.5 text-emerald-300" aria-hidden />
        Direct revenue and discounts are calculated from order records; operating costs and
        marketplace figures are not yet imported.
        <ArrowDownRight className="size-3.5 text-slate-600" aria-hidden />
      </p>
    </div>
  );
}
