import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgePercent,
  CircleCheck,
  LoaderCircle,
  ShoppingBag,
  TicketPercent,
  TriangleAlert,
} from "lucide-react";
import { getOutlet } from "@/data/outlets";
import { cartTotals, formatINR, lineDescription } from "@/lib/format";
import { getAvailablePromotions, validateCoupon, type AvailablePromotions } from "@/lib/api";
import {
  hydrateStore,
  refreshCatalog,
  removeLine,
  setAppliedCouponCode,
  setLineQty,
  useStore,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { FoodImage } from "@/components/FoodImage";
import { VegMark } from "@/components/VegMark";
import { QtyStepper } from "@/components/QtyStepper";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — Tales of Hyderabad" },
      {
        name: "description",
        content: "Review your Tales of Hyderabad order, update quantities and check out.",
      },
      { property: "og:title", content: "Your cart — Tales of Hyderabad" },
      {
        property: "og:description",
        content: "Review your biryani order, update quantities and check out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Your cart — Tales of Hyderabad" },
      { name: "twitter:description", content: "Review your biryani order and check out." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [promotions, setPromotions] = useState<AvailablePromotions>({ sales: [], coupons: [] });
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponPreview, setCouponPreview] = useState<{
    code: string;
    discount: number;
    message: string;
  } | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  useEffect(() => {
    void hydrateStore().then(() => refreshCatalog());
  }, []);

  useEffect(() => {
    if (!store.outletId) {
      setPromotions({ sales: [], coupons: [] });
      return;
    }
    let active = true;
    setPromotionsLoading(true);
    setPromotionsError(null);
    void getAvailablePromotions(store.outletId)
      .then((value) => {
        if (active) setPromotions(value);
      })
      .catch((reason) => {
        if (active)
          setPromotionsError(
            reason instanceof Error ? reason.message : "Offers could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setPromotionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [store.outletId]);

  useEffect(() => {
    if (!store.appliedCouponCode || !store.outletId || store.cart.length === 0) {
      setCouponPreview(null);
      setCouponMessage(null);
      setCouponBusy(false);
      return;
    }
    let active = true;
    setCouponBusy(true);
    setCouponMessage(null);
    void validateCoupon({
      code: store.appliedCouponCode,
      outletId: store.outletId,
      orderValue: cartTotals(store.cart).itemsTotal,
    })
      .then((result) => {
        if (!active) return;
        if (result.valid && result.discount !== undefined) {
          setCouponPreview({
            code: result.code ?? store.appliedCouponCode!,
            discount: result.discount,
            message: result.message,
          });
          setCouponMessage(result.message);
        } else {
          setCouponPreview(null);
          setCouponMessage(result.message);
        }
      })
      .catch((reason) => {
        if (active) {
          setCouponPreview(null);
          setCouponMessage(
            reason instanceof Error ? reason.message : "The coupon could not be checked.",
          );
        }
      })
      .finally(() => {
        if (active) setCouponBusy(false);
      });
    return () => {
      active = false;
    };
  }, [store.appliedCouponCode, store.outletId, store.cart]);

  useEffect(() => {
    setCouponInput(store.appliedCouponCode ?? "");
  }, [store.appliedCouponCode]);

  if (!store.hydrated) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted-foreground">
        Loading your cart…
      </div>
    );
  }

  if (store.cart.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <ShoppingBag className="size-7" aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The handi is waiting. Pick an outlet and add some biryani to get started.
        </p>
        <Link
          to="/menu"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Browse the menu
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const outlet = getOutlet(store.outletId);
  if (!outlet) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Choose an outlet first</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your cart items are tied to a kitchen. Pick one to continue.
        </p>
        <Link
          to="/customer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Choose outlet
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const unavailableLines = store.cart.filter((line) => {
    const item = store.menuItems.find((entry) => entry.id === line.itemId);
    return (
      Boolean(line.unavailableReason) ||
      !item ||
      item.active === false ||
      !item.availableAt.includes(outlet.id)
    );
  });
  const totals = cartTotals(store.cart, outlet.deliveryFee);
  const canCheckout = unavailableLines.length === 0;
  const validAppliedCoupon = couponPreview?.code === store.appliedCouponCode ? couponPreview : null;
  const totalDue = Math.max(0, totals.total - (validAppliedCoupon?.discount ?? 0));
  const applyCouponCode = (code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setCouponMessage("Enter a coupon code first.");
      return;
    }
    setCouponPreview(null);
    setCouponMessage(null);
    setAppliedCouponCode(normalized);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Your cart</h1>
      <p className="mt-1 text-sm text-muted-foreground">Delivery from {outlet.name}</p>
      {store.catalogError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {store.catalogError}{" "}
          <button
            type="button"
            onClick={() => void refreshCatalog()}
            className="font-bold underline"
          >
            Retry
          </button>
        </p>
      )}

      {unavailableLines.length > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="leading-relaxed">
            Some cart items changed or are no longer available at {outlet.name}. Update or remove
            them to continue.
          </p>
        </div>
      )}

      <ul className="mt-6 space-y-4">
        {store.cart.map((line) => {
          const item = store.menuItems.find((entry) => entry.id === line.itemId);
          const unavailable =
            Boolean(line.unavailableReason) ||
            !item ||
            item.active === false ||
            !item.availableAt.includes(outlet.id);
          return (
            <li
              key={line.id}
              className={cn(
                "flex gap-4 rounded-2xl border bg-card p-3 sm:p-4",
                unavailable ? "border-destructive/40" : "border-border",
              )}
            >
              <FoodImage
                src={line.image}
                alt={line.name}
                className="size-16 shrink-0 rounded-xl sm:size-20"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <VegMark diet={line.diet} />
                      <h3 className="truncate font-semibold">{line.name}</h3>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {lineDescription(line) || "Standard"}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">
                    {formatINR(line.unitPrice * line.qty)}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <QtyStepper qty={line.qty} onChange={(qty) => setLineQty(line.id, qty)} />
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {formatINR(line.unitPrice)} each
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-xs font-semibold text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {unavailable && (
                  <p className="mt-2 text-xs font-semibold text-destructive">
                    {line.unavailableReason ??
                      `Not available at ${outlet.name} — please remove this item.`}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section
        aria-labelledby="cart-coupons-heading"
        className="mt-7 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-card via-card to-secondary/60 shadow-[0_16px_45px_-35px_rgba(73,35,20,0.5)]"
      >
        <div className="flex items-start gap-3 border-b border-border/70 p-4 sm:p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TicketPercent className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="cart-coupons-heading" className="font-display text-lg font-semibold">
              Offers for {outlet.name}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Choose a live coupon for this outlet. Savings are checked again at checkout.
            </p>
          </div>
          {promotions.coupons.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black text-primary">
              {promotions.coupons.length} available
            </span>
          )}
        </div>
        <div className="p-4 sm:p-5">
          {store.appliedCouponCode && (
            <div
              className={cn(
                "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3",
                validAppliedCoupon ? "border-veg/25 bg-veg/5" : "border-accent/45 bg-accent/10",
              )}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className={cn("mt-0.5", validAppliedCoupon ? "text-veg" : "text-primary")}>
                  {couponBusy ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : validAppliedCoupon ? (
                    <CircleCheck className="size-4" aria-hidden />
                  ) : (
                    <BadgePercent className="size-4" aria-hidden />
                  )}
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">
                    {store.appliedCouponCode}
                    {validAppliedCoupon
                      ? ` · saves ${formatINR(validAppliedCoupon.discount)}`
                      : " · checking offer"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {couponMessage ?? "Checking eligibility for this cart…"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAppliedCouponCode(null);
                  setCouponPreview(null);
                  setCouponMessage(null);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-[10px] font-bold hover:bg-background"
              >
                Remove
              </button>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="cart-coupon-code">
              Enter coupon code
            </label>
            <input
              id="cart-coupon-code"
              value={couponInput}
              onChange={(event) =>
                setCouponInput(event.target.value.toUpperCase().replace(/\s/g, ""))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyCouponCode(couponInput);
                }
              }}
              placeholder="Have a coupon code?"
              className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-bold uppercase tracking-wider outline-none focus:border-primary"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => applyCouponCode(couponInput)}
              disabled={!couponInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-xs font-black text-background transition-colors hover:bg-foreground/90 disabled:opacity-45"
            >
              Apply code <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
          {couponMessage && !store.appliedCouponCode && (
            <p role="status" className="mt-2 text-xs font-semibold text-destructive">
              {couponMessage}
            </p>
          )}
          {promotionsError && (
            <p role="status" className="mt-3 text-xs text-muted-foreground">
              Live offers are temporarily unavailable. You can still try a coupon code.
            </p>
          )}
          <div className="mt-4 space-y-2">
            {promotionsLoading && (
              <p className="text-xs text-muted-foreground">Loading outlet offers…</p>
            )}
            {promotions.coupons.map((offer) => {
              const discountLabel =
                offer.discountType === "percentage"
                  ? `${offer.discountValue}% off${offer.maximumDiscount ? ` · up to ${formatINR(offer.maximumDiscount)}` : ""}`
                  : `${formatINR(offer.discountValue)} off`;
              const selected = store.appliedCouponCode === offer.code;
              return (
                <article
                  key={offer.code}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
                    selected
                      ? "border-primary/35 bg-primary/[0.045]"
                      : "border-border/80 bg-background/70",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/25 text-primary">
                      <BadgePercent className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-xs font-black">
                        <span className="rounded-md border border-dashed border-primary/35 px-2 py-0.5 tracking-widest text-primary">
                          {offer.code}
                        </span>
                        <span>{discountLabel}</span>
                      </p>
                      <p className="mt-1 truncate text-[11px] font-semibold text-foreground">
                        {offer.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {offer.minimumOrder > 0
                          ? `On orders over ${formatINR(offer.minimumOrder)}`
                          : "No minimum order"}{" "}
                        · Ends{" "}
                        {new Date(offer.endsAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCouponInput(offer.code);
                      applyCouponCode(offer.code);
                    }}
                    disabled={selected && validAppliedCoupon !== null}
                    className="rounded-full border border-primary/25 px-3.5 py-2 text-[10px] font-black text-primary transition-colors hover:bg-primary/5 disabled:border-veg/20 disabled:text-veg"
                  >
                    {selected && validAppliedCoupon ? "Applied" : "Apply"}
                  </button>
                </article>
              );
            })}
            {!promotionsLoading && promotions.coupons.length === 0 && !promotionsError && (
              <p className="rounded-xl border border-dashed border-border px-3.5 py-4 text-xs text-muted-foreground">
                No active coupon codes for this outlet at the moment.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Order summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Items total (incl. 5% GST)</dt>
            <dd className="font-semibold tabular-nums">{formatINR(totals.itemsTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery fee</dt>
            <dd className="font-semibold tabular-nums">{formatINR(totals.deliveryFee)}</dd>
          </div>
          {validAppliedCoupon && (
            <div className="flex justify-between text-veg">
              <dt>Coupon · {validAppliedCoupon.code}</dt>
              <dd className="font-semibold tabular-nums">
                −{formatINR(validAppliedCoupon.discount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-dashed border-border pt-2 text-base">
            <dt className="font-bold">To pay</dt>
            <dd className="font-bold tabular-nums">{formatINR(totalDue)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Includes 5% GST of {formatINR(totals.gstIncluded)}. Delivery to most Hyderabad pin codes.
        </p>
        <button
          type="button"
          disabled={!canCheckout || (Boolean(store.appliedCouponCode) && !validAppliedCoupon)}
          onClick={() => void navigate({ to: "/checkout" })}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {store.appliedCouponCode && !validAppliedCoupon
            ? "Review your coupon"
            : "Proceed to checkout"}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
