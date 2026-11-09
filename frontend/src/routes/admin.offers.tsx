import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgePercent,
  CalendarClock,
  CircleCheck,
  CirclePause,
  CirclePlus,
  Flame,
  LoaderCircle,
  Sparkles,
  TicketPercent,
  TriangleAlert,
} from "lucide-react";
import type { AdminCoupon, AdminSale, CouponDraft } from "@/lib/api";
import {
  createAdminCoupon,
  getAdminCoupons,
  getAdminOrders,
  getAdminSales,
  removeItemSale,
  setAdminCouponActive,
  setItemSale,
} from "@/lib/api";
import { formatINR } from "@/lib/format";
import { hydrateStore, refreshAdminMenu, useStore } from "@/lib/store";
import { useAdminScope } from "@/components/AdminShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/offers")({
  head: () => ({ meta: [{ title: "Offers and coupons — Tales of Hyderabad" }] }),
  component: AdminOffersPage,
});

const panel = "rounded-2xl border border-white/10 bg-white/[0.055] shadow-xl backdrop-blur-xl";
const input =
  "w-full rounded-xl border border-white/10 bg-[#0c121c] px-3 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-300/45";

function localDateTimeInput(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}
function dateToIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}
function couponStatus(coupon: AdminCoupon, now: number) {
  if (!coupon.active) return "Paused";
  if (new Date(coupon.startsAt).getTime() > now) return "Scheduled";
  if (new Date(coupon.endsAt).getTime() <= now) return "Expired";
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions)
    return "Used up";
  return "Active";
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Flame;
}) {
  return (
    <article className={cn(panel, "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">
            {label}
          </p>
          <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-white">
            {value}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{detail}</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.08] text-amber-200">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
    </article>
  );
}

function AdminOffersPage() {
  const store = useStore();
  const { outletId } = useAdminScope();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [sales, setSales] = useState<AdminSale[]>([]);
  const [couponOrders, setCouponOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saleItemId, setSaleItemId] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [saleStartsAt, setSaleStartsAt] = useState(localDateTimeInput(new Date()));
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [coupon, setCoupon] = useState({
    code: "",
    name: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: "",
    minimumOrder: "",
    maximumDiscount: "",
    maxRedemptions: "",
    perCustomerLimit: "1",
    startsAt: localDateTimeInput(new Date()),
    endsAt: localDateTimeInput(new Date(Date.now() + 7 * 86_400_000)),
    outletIds: [] as string[],
  });

  const refresh = async () => {
    if (!store.staffToken) return;
    setLoading(true);
    setError(null);
    try {
      const [nextCoupons, nextSales, orders] = await Promise.all([
        getAdminCoupons(store.staffToken),
        getAdminSales(store.staffToken),
        getAdminOrders(30, store.staffToken),
      ]);
      setCoupons(nextCoupons);
      setSales(nextSales);
      setCouponOrders(orders.filter((order) => Boolean(order.couponCode)).length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Offers could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void hydrateStore();
  }, []);
  useEffect(() => {
    void refreshAdminMenu();
    void refresh();
  }, [store.staffToken]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeCoupons = coupons.filter((entry) => couponStatus(entry, now) === "Active");
  const expiringSoon = coupons.filter(
    (entry) =>
      entry.active &&
      new Date(entry.endsAt).getTime() > now &&
      new Date(entry.endsAt).getTime() < now + 7 * 86_400_000,
  );
  const redemptionCount = coupons.reduce((sum, entry) => sum + entry.redemptions, 0);
  const discountGiven = coupons.reduce((sum, entry) => sum + entry.discountGiven, 0);
  const menuItems = useMemo(
    () =>
      store.menuItems.filter(
        (item) =>
          item.active !== false &&
          item.availableAt.length > 0 &&
          (outletId === "all" || item.availableAt.includes(outletId)),
      ),
    [store.menuItems, outletId],
  );
  const visibleSales = sales.filter((sale) => outletId === "all" || sale.outletId === outletId);

  const submitSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const item = store.menuItems.find((entry) => entry.id === saleItemId);
    const price = Number(salePrice);
    if (!item || !Number.isFinite(price) || price <= 0 || price >= item.basePrice) {
      setNotice({
        kind: "error",
        text: "Choose an item and enter a sale price below its regular price.",
      });
      return;
    }
    if (saleEndsAt && new Date(saleEndsAt).getTime() <= new Date(saleStartsAt).getTime()) {
      setNotice({ kind: "error", text: "The sale end time must be after its start time." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const saleOutletIds = item.availableAt.filter((id) => outletId === "all" || id === outletId);
      if (!saleOutletIds.length) {
        setNotice({ kind: "error", text: "This item is not available at the selected outlet." });
        return;
      }
      await setItemSale(
        item.id,
        {
          salePrice: price,
          outletIds: saleOutletIds,
          startsAt: dateToIso(saleStartsAt)!,
          ...(saleEndsAt ? { endsAt: dateToIso(saleEndsAt)! } : {}),
        },
        store.staffToken!,
      );
      await refreshAdminMenu();
      await refresh();
      setSalePrice("");
      setNotice({
        kind: "success",
        text: `${item.name} sale saved for ${outletId === "all" ? "all available outlets" : (store.outlets.find((outlet) => outlet.id === outletId)?.name ?? "the selected outlet")}.`,
      });
    } catch (reason) {
      setNotice({
        kind: "error",
        text: reason instanceof Error ? reason.message : "The sale could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  };

  const endSale = async (sale: AdminSale) => {
    setSaving(true);
    setNotice(null);
    try {
      await removeItemSale(sale.itemId, sale.outletId, store.staffToken!);
      await refreshAdminMenu();
      await refresh();
      setNotice({ kind: "success", text: `Sale ended for ${sale.name} at ${sale.outletName}.` });
    } catch (reason) {
      setNotice({
        kind: "error",
        text: reason instanceof Error ? reason.message : "The sale could not be ended.",
      });
    } finally {
      setSaving(false);
    }
  };

  const submitCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(coupon.discountValue);
    if (!coupon.code.trim() || !coupon.name.trim() || !Number.isFinite(value) || value <= 0) {
      setNotice({ kind: "error", text: "Enter a coupon code, name, and valid discount." });
      return;
    }
    if (coupon.discountType === "percentage" && value > 100) {
      setNotice({ kind: "error", text: "Percentage discount cannot be over 100%." });
      return;
    }
    if (new Date(coupon.endsAt).getTime() <= new Date(coupon.startsAt).getTime()) {
      setNotice({ kind: "error", text: "Coupon expiry must be after its start time." });
      return;
    }
    const draft: CouponDraft = {
      code: coupon.code.trim().toUpperCase(),
      name: coupon.name.trim(),
      discountType: coupon.discountType,
      discountValue: value,
      minimumOrder: Number(coupon.minimumOrder) || 0,
      maximumDiscount: coupon.maximumDiscount ? Number(coupon.maximumDiscount) : null,
      maxRedemptions: coupon.maxRedemptions ? Number(coupon.maxRedemptions) : null,
      perCustomerLimit: Number(coupon.perCustomerLimit) || 1,
      outletIds: coupon.outletIds,
      startsAt: dateToIso(coupon.startsAt)!,
      endsAt: dateToIso(coupon.endsAt)!,
    };
    setSaving(true);
    setNotice(null);
    try {
      await createAdminCoupon(draft, store.staffToken!);
      await refresh();
      setCoupon((current) => ({
        ...current,
        code: "",
        name: "",
        discountValue: "",
        minimumOrder: "",
        maximumDiscount: "",
        maxRedemptions: "",
      }));
      setNotice({
        kind: "success",
        text: `${draft.code} is saved and ready to validate at customer checkout.`,
      });
    } catch (reason) {
      setNotice({
        kind: "error",
        text: reason instanceof Error ? reason.message : "The coupon could not be created.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (entry: AdminCoupon) => {
    setSaving(true);
    setNotice(null);
    try {
      await setAdminCouponActive(entry.code, !entry.active, store.staffToken!);
      await refresh();
      setNotice({
        kind: "success",
        text: `${entry.code} ${entry.active ? "paused" : "activated"}.`,
      });
    } catch (reason) {
      setNotice({
        kind: "error",
        text: reason instanceof Error ? reason.message : "Coupon status could not be changed.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleOutlet = (id: string) =>
    setCoupon((current) => ({
      ...current,
      outletIds: current.outletIds.includes(id)
        ? current.outletIds.filter((entry) => entry !== id)
        : [...current.outletIds, id],
    }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.17em] text-amber-300">
            Growth tools · direct ordering
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Discounts are recorded with each order and checked again by the API at checkout.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-bold text-slate-200"
        >
          Refresh offers
        </button>
      </div>
      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold",
            notice.kind === "success"
              ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
              : "border-red-300/20 bg-red-300/[0.08] text-red-100",
          )}
        >
          {notice.kind === "success" ? (
            <CircleCheck className="size-4 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
          )}
          {notice.text}
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-100"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Active coupons"
          value={String(activeCoupons.length)}
          detail="Ready for eligible carts"
          icon={TicketPercent}
        />
        <StatCard
          label="Expiring soon"
          value={String(expiringSoon.length)}
          detail="Within the next 7 days"
          icon={CalendarClock}
        />
        <StatCard
          label="Redemptions"
          value={String(redemptionCount)}
          detail={`${couponOrders} coupon orders in the last 30 days`}
          icon={Sparkles}
        />
        <StatCard
          label="Discount cost"
          value={formatINR(discountGiven)}
          detail="Actual coupon discounts recorded"
          icon={BadgePercent}
        />
      </div>

      <div className="grid gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
        <section className={cn(panel, "p-4 sm:p-5")}>
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/[0.08] text-amber-200">
              <Flame className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-white">Put a dish on sale</h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                Sale applies to the selected outlet scope. “All outlets” covers every outlet where
                the dish is available.
              </p>
            </div>
          </div>
          <form onSubmit={(event) => void submitSale(event)} className="mt-5 space-y-3">
            <div>
              <label
                htmlFor="sale-item"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Menu item
              </label>
              <select
                id="sale-item"
                required
                value={saleItemId}
                onChange={(event) => setSaleItemId(event.target.value)}
                className={input}
              >
                <option value="">Choose an item</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {formatINR(item.basePrice)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="sale-price"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Sale price · ₹
              </label>
              <input
                id="sale-price"
                required
                inputMode="decimal"
                type="number"
                min="1"
                step="1"
                value={salePrice}
                onChange={(event) => setSalePrice(event.target.value)}
                placeholder="299"
                className={input}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="sale-start"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
                >
                  Starts
                </label>
                <input
                  id="sale-start"
                  type="datetime-local"
                  value={saleStartsAt}
                  onChange={(event) => setSaleStartsAt(event.target.value)}
                  className={input}
                />
              </div>
              <div>
                <label
                  htmlFor="sale-end"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
                >
                  Ends · optional
                </label>
                <input
                  id="sale-end"
                  type="datetime-local"
                  value={saleEndsAt}
                  onChange={(event) => setSaleEndsAt(event.target.value)}
                  className={input}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !store.staffToken}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950 transition-colors hover:bg-amber-200 disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <CirclePlus className="size-4" aria-hidden />
              )}
              Save item sale
            </button>
          </form>
          <div className="mt-5 border-t border-white/10 pt-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
              Current and scheduled sales
            </h3>
            <div className="mt-3 space-y-2">
              {visibleSales.map((sale) => {
                const isActive =
                  sale.active &&
                  (!sale.startsAt || new Date(sale.startsAt).getTime() <= now) &&
                  (!sale.endsAt || new Date(sale.endsAt).getTime() > now);
                return (
                  <div
                    key={`${sale.itemId}:${sale.outletId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{sale.name}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {sale.outletName} ·{" "}
                        <span className="line-through">{formatINR(sale.basePrice)}</span>
                        <span className="mx-1.5 text-amber-200">
                          {formatINR(sale.salePrice)}
                        </span>·{" "}
                        {isActive ? "Live" : sale.active ? "Scheduled / expired" : "Paused"}
                      </p>
                      <p className="mt-1 text-[9px] text-slate-500">
                        {sale.endsAt
                          ? `Ends ${new Date(sale.endsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                          : "No end time set"}
                      </p>
                    </div>
                    {sale.active && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void endSale(sale)}
                        className="shrink-0 rounded-lg border border-red-300/20 px-2.5 py-1.5 text-[10px] font-bold text-red-100 hover:bg-red-300/10"
                      >
                        End sale
                      </button>
                    )}
                  </div>
                );
              })}
              {!visibleSales.length && (
                <p className="rounded-xl border border-dashed border-white/10 p-3 text-[11px] text-slate-500">
                  No item sales for this outlet scope.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className={cn(panel, "p-4 sm:p-5")}>
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-300/[0.08] text-sky-200">
              <TicketPercent className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Create a checkout coupon
              </h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                Set a code, value, minimum cart, usage caps and outlet eligibility.
              </p>
            </div>
          </div>
          <form
            onSubmit={(event) => void submitCoupon(event)}
            className="mt-5 grid gap-3 sm:grid-cols-2"
          >
            <div>
              <label
                htmlFor="coupon-code"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Coupon code
              </label>
              <input
                id="coupon-code"
                required
                maxLength={24}
                value={coupon.code}
                onChange={(event) =>
                  setCoupon({
                    ...coupon,
                    code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                  })
                }
                placeholder="WELCOME10"
                className={cn(input, "font-black tracking-widest")}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-name"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Internal offer name
              </label>
              <input
                id="coupon-name"
                required
                maxLength={100}
                value={coupon.name}
                onChange={(event) => setCoupon({ ...coupon, name: event.target.value })}
                placeholder="Weekday biryani offer"
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-type"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Discount type
              </label>
              <select
                id="coupon-type"
                value={coupon.discountType}
                onChange={(event) =>
                  setCoupon({
                    ...coupon,
                    discountType: event.target.value as "percentage" | "fixed",
                  })
                }
                className={input}
              >
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="coupon-value"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                {coupon.discountType === "percentage" ? "Discount · %" : "Discount · ₹"}
              </label>
              <input
                id="coupon-value"
                type="number"
                required
                min="1"
                max={coupon.discountType === "percentage" ? 100 : undefined}
                step="1"
                value={coupon.discountValue}
                onChange={(event) => setCoupon({ ...coupon, discountValue: event.target.value })}
                placeholder={coupon.discountType === "percentage" ? "15" : "100"}
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-minimum"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Minimum cart · ₹
              </label>
              <input
                id="coupon-minimum"
                type="number"
                min="0"
                step="1"
                value={coupon.minimumOrder}
                onChange={(event) => setCoupon({ ...coupon, minimumOrder: event.target.value })}
                placeholder="0"
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-cap"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Maximum discount · ₹
              </label>
              <input
                id="coupon-cap"
                type="number"
                min="1"
                step="1"
                value={coupon.maximumDiscount}
                onChange={(event) => setCoupon({ ...coupon, maximumDiscount: event.target.value })}
                placeholder="Optional cap"
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-uses"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Total use limit
              </label>
              <input
                id="coupon-uses"
                type="number"
                min="1"
                step="1"
                value={coupon.maxRedemptions}
                onChange={(event) => setCoupon({ ...coupon, maxRedemptions: event.target.value })}
                placeholder="Unlimited"
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-per-customer"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Uses per phone
              </label>
              <input
                id="coupon-per-customer"
                type="number"
                min="1"
                max="100"
                step="1"
                value={coupon.perCustomerLimit}
                onChange={(event) => setCoupon({ ...coupon, perCustomerLimit: event.target.value })}
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-start"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Starts
              </label>
              <input
                id="coupon-start"
                type="datetime-local"
                required
                value={coupon.startsAt}
                onChange={(event) => setCoupon({ ...coupon, startsAt: event.target.value })}
                className={input}
              />
            </div>
            <div>
              <label
                htmlFor="coupon-end"
                className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                Expires
              </label>
              <input
                id="coupon-end"
                type="datetime-local"
                required
                value={coupon.endsAt}
                onChange={(event) => setCoupon({ ...coupon, endsAt: event.target.value })}
                className={input}
              />
            </div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Eligible outlets{" "}
                <span className="font-medium normal-case text-slate-500">
                  (none selected = all outlets)
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {store.outlets.map((outlet) => (
                  <button
                    key={outlet.id}
                    type="button"
                    aria-pressed={coupon.outletIds.includes(outlet.id)}
                    onClick={() => toggleOutlet(outlet.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[10px] font-bold transition-colors",
                      coupon.outletIds.includes(outlet.id)
                        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                        : "border-white/10 text-slate-400 hover:bg-white/[0.05]",
                    )}
                  >
                    {outlet.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !store.staffToken}
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950 transition-colors hover:bg-amber-200 disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <CirclePlus className="size-4" aria-hidden />
              )}
              Create coupon
            </button>
          </form>
        </section>
      </div>

      <section className={cn(panel, "overflow-hidden")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Coupon performance</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Discounts and redemption counts come from successfully placed orders.
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {coupons.length} codes
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[970px] text-left text-xs">
            <thead className="bg-white/[0.035] text-[9px] uppercase tracking-[0.13em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">Coupon</th>
                <th className="px-3 py-3 font-bold">Discount</th>
                <th className="px-3 py-3 font-bold">Minimum</th>
                <th className="px-3 py-3 font-bold">Validity</th>
                <th className="px-3 py-3 text-right font-bold">Redemptions</th>
                <th className="px-3 py-3 text-right font-bold">Discount cost</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {coupons.map((entry) => {
                const label = couponStatus(entry, now);
                const discount =
                  entry.discountType === "percentage"
                    ? `${entry.discountValue}% off`
                    : `${formatINR(entry.discountValue)} off`;
                return (
                  <tr key={entry.code} className="hover:bg-white/[0.035]">
                    <td className="px-4 py-3.5">
                      <span className="block font-black tracking-wider text-white">
                        {entry.code}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-500">{entry.name}</span>
                    </td>
                    <td className="px-3 py-3.5 font-semibold text-amber-100">
                      {discount}
                      {entry.maximumDiscount !== null && entry.discountType === "percentage" && (
                        <span className="block text-[9px] text-slate-500">
                          up to {formatINR(entry.maximumDiscount)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 tabular-nums text-slate-300">
                      {formatINR(entry.minimumOrder)}
                    </td>
                    <td className="px-3 py-3.5 text-slate-400">
                      <span className="block">
                        {new Date(entry.startsAt).toLocaleDateString("en-IN")}
                      </span>
                      <span className="mt-1 block text-[10px]">
                        to {new Date(entry.endsAt).toLocaleDateString("en-IN")}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-slate-200">
                      {entry.redemptions}
                      {entry.maxRedemptions !== null ? ` / ${entry.maxRedemptions}` : ""}
                    </td>
                    <td className="px-3 py-3.5 text-right font-bold tabular-nums text-white">
                      {formatINR(entry.discountGiven)}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                          label === "Active"
                            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                            : "border-white/10 bg-white/[0.04] text-slate-400",
                        )}
                      >
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {label !== "Expired" && label !== "Used up" && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void toggleCoupon(entry)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold",
                            entry.active
                              ? "border-red-300/20 text-red-100 hover:bg-red-300/10"
                              : "border-emerald-300/20 text-emerald-100 hover:bg-emerald-300/10",
                          )}
                        >
                          {entry.active ? (
                            <CirclePause className="size-3.5" aria-hidden />
                          ) : (
                            <CircleCheck className="size-3.5" aria-hidden />
                          )}
                          {entry.active ? "Pause" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && !coupons.length && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    No coupon codes created yet.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Loading offers…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex items-start gap-2 rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-3 text-[10px] leading-relaxed text-sky-100/75">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-sky-200" aria-hidden />
        <p>
          Customer coupon eligibility and discount values are recalculated by the backend at
          checkout. A valid preview alone does not reserve a coupon redemption. Item sale prices are
          also rechecked against the live database price.
        </p>
      </div>
    </div>
  );
}
