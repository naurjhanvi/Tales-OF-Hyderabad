import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, CreditCard, Landmark, LoaderCircle } from "lucide-react";
import type { PaymentMethod } from "@/data/types";
import { getOutlet } from "@/data/outlets";
import { cartTotals, formatINR, lineDescription } from "@/lib/format";
import { validateCoupon } from "@/lib/api";
import { hydrateStore, placeOrder, refreshCatalog, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Tales of Hyderabad" },
      {
        name: "description",
        content: "Enter delivery details and choose your payment method.",
      },
      { property: "og:title", content: "Checkout — Tales of Hyderabad" },
      {
        property: "og:description",
        content: "Enter delivery details and choose your payment method.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Checkout — Tales of Hyderabad" },
      {
        name: "twitter:description",
        content: "Enter delivery details and choose your payment method.",
      },
    ],
  }),
  component: CheckoutPage,
});

const inputClass =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent";

type CheckoutErrorKey = "name" | "phone" | "address";
type CheckoutErrors = Partial<Record<CheckoutErrorKey, string>>;

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-semibold text-destructive">{message}</p>;
}

function CheckoutPage() {
  const store = useStore();
  const navigate = useNavigate();
  const placedRef = useRef(false);
  const checkoutAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const [form, setForm] = useState({ name: "", phone: "", address: "", landmark: "", notes: "" });
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<{ code: string; discount: number; message: string } | null>(
    null,
  );
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  useEffect(() => {
    void hydrateStore().then(() => refreshCatalog());
  }, []);

  useEffect(() => {
    if (store.hydrated && store.cart.length === 0 && !placedRef.current) {
      void navigate({ to: "/cart" });
    }
  }, [store.hydrated, store.cart.length, navigate]);

  const outlet = getOutlet(store.outletId);
  const totals = cartTotals(store.cart, outlet?.deliveryFee ?? 0);
  const phoneDigits = form.phone.replace(/\D/g, "");

  useEffect(() => {
    const code = store.appliedCouponCode;
    if (!code || !outlet) {
      setCoupon(null);
      setCouponMessage(null);
      setCouponBusy(false);
      return;
    }
    let active = true;
    setCouponBusy(true);
    setCouponMessage(null);
    const phone = /^[6-9]\d{9}$/.test(phoneDigits) ? phoneDigits : undefined;
    void validateCoupon({
      code,
      outletId: outlet.id,
      orderValue: totals.itemsTotal,
      ...(phone ? { phone } : {}),
    })
      .then((result) => {
        if (!active) return;
        if (result.valid && result.discount !== undefined) {
          setCoupon({
            code: result.code ?? code,
            discount: result.discount,
            message: result.message,
          });
          setCouponMessage(result.message);
        } else {
          setCoupon(null);
          setCouponMessage(result.message);
        }
      })
      .catch((error) => {
        if (active) {
          setCoupon(null);
          setCouponMessage(
            error instanceof Error ? error.message : "The selected coupon could not be checked.",
          );
        }
      })
      .finally(() => {
        if (active) setCouponBusy(false);
      });
    return () => {
      active = false;
    };
  }, [store.appliedCouponCode, outlet?.id, totals.itemsTotal, phoneDigits]);

  if (!store.hydrated || (store.catalogLoading && !outlet)) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted-foreground">Loading…</div>
    );
  }

  if (!outlet) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p role={store.catalogError ? "alert" : "status"} className="text-sm text-muted-foreground">
          {store.catalogError ?? "Choose an outlet before checkout."}
        </p>
        <button
          type="button"
          onClick={() => void refreshCatalog()}
          className="mt-5 rounded-full border border-border px-4 py-2 text-sm font-semibold"
        >
          Retry
        </button>
        <Link
          to="/customer"
          className="ml-2 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Choose outlet
        </Link>
      </div>
    );
  }

  const totalDue = Math.max(0, totals.total - (coupon?.discount ?? 0));
  const unavailableCount = store.cart.filter((line) => {
    const item = store.menuItems.find((entry) => entry.id === line.itemId);
    return (
      Boolean(line.unavailableReason) ||
      !item ||
      item.active === false ||
      !item.availableAt.includes(outlet.id)
    );
  }).length;

  const setField = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validate = (): boolean => {
    const e: CheckoutErrors = {};
    if (form.name.trim().length < 2) e.name = "Please enter your full name.";
    const phone = form.phone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(phone)) e.phone = "Enter a 10-digit Indian mobile number.";
    if (form.address.trim().length < 8)
      e.address = "Enter your flat or house number, street and area.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (submitting || unavailableCount > 0 || store.cart.length === 0) return;
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    const landmark = form.landmark.trim();
    const notes = form.notes.trim();
    const customer = {
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, ""),
      address: form.address.trim(),
      ...(landmark ? { landmark } : {}),
      ...(notes ? { notes } : {}),
    };
    const fingerprint = JSON.stringify({
      outletId: outlet.id,
      customer,
      paymentMethod: method,
      cart: store.cart,
      couponCode: store.appliedCouponCode,
    });
    if (!checkoutAttempt.current || checkoutAttempt.current.fingerprint !== fingerprint) {
      checkoutAttempt.current = { fingerprint, key: window.crypto.randomUUID() };
    }
    const attempt = checkoutAttempt.current;
    try {
      const order = await placeOrder(
        customer,
        method,
        attempt.key,
        store.appliedCouponCode ?? undefined,
      );
      placedRef.current = true;
      void navigate({ to: "/orders/$id", params: { id: order.id } });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "The order could not be placed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Checkout</h1>
      <p className="mt-1 text-sm text-muted-foreground">Delivery from {outlet.name}</p>
      {store.catalogError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {store.catalogError} Checkout requires a live API connection.
        </p>
      )}
      {submitError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {submitError}
        </p>
      )}

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="font-display text-lg font-semibold">Delivery details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="co-name"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Full name
              </label>
              <input
                id="co-name"
                className={inputClass}
                value={form.name}
                onChange={(e) => setField("name")(e.target.value)}
                placeholder="Asha Rao"
                autoComplete="name"
              />
              <FieldError message={errors.name} />
            </div>
            <div>
              <label
                htmlFor="co-phone"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Mobile number
              </label>
              <input
                id="co-phone"
                className={inputClass}
                value={form.phone}
                onChange={(e) => setField("phone")(e.target.value)}
                placeholder="98765 43210"
                inputMode="tel"
                autoComplete="tel"
              />
              <FieldError message={errors.phone} />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="co-address"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Flat / house no., street and area
              </label>
              <input
                id="co-address"
                className={inputClass}
                value={form.address}
                onChange={(e) => setField("address")(e.target.value)}
                placeholder="Flat 402, Lakeview Residency, Kondapur"
                autoComplete="street-address"
              />
              <FieldError message={errors.address} />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="co-landmark"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Landmark <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="co-landmark"
                className={inputClass}
                value={form.landmark}
                onChange={(e) => setField("landmark")(e.target.value)}
                placeholder="Opposite the botanical garden gate"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="co-notes"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Delivery notes <span className="font-normal normal-case">(optional)</span>
              </label>
              <textarea
                id="co-notes"
                rows={2}
                className={cn(inputClass, "resize-none")}
                value={form.notes}
                onChange={(e) => setField("notes")(e.target.value)}
                placeholder="Leave at the door, ring the bell twice"
              />
            </div>
          </div>
        </section>

        <section
          aria-label="Coupon selected for this order"
          className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-4"
        >
          {store.appliedCouponCode ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-primary">
                  {couponBusy ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <BadgeCheck className="size-4" aria-hidden />
                  )}
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">
                    {store.appliedCouponCode}
                    {coupon ? ` · saves ${formatINR(coupon.discount)}` : ""}
                  </p>
                  <p
                    role="status"
                    className={cn("mt-1 text-xs", coupon ? "text-veg" : "text-muted-foreground")}
                  >
                    {couponMessage ?? "Checking this code against your outlet and cart…"}
                  </p>
                </div>
              </div>
              <Link
                to="/cart"
                className="rounded-full border border-border px-3.5 py-2 text-[10px] font-bold hover:bg-background"
              >
                Change in cart
              </Link>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No coupon selected.{" "}
              <Link to="/cart" className="font-bold text-primary underline underline-offset-2">
                Choose an offer in your cart
              </Link>
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold">Payment</h2>
          <p className="mt-1 text-xs text-muted-foreground">Choose a payment method.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={method === "upi"}
              onClick={() => setMethod("upi")}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                method === "upi"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-accent",
              )}
            >
              <Landmark className="size-5 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-bold">UPI</span>
                <span className="block text-xs text-muted-foreground">UPI</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={method === "card"}
              onClick={() => setMethod("card")}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                method === "card"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-accent",
              )}
            >
              <CreditCard className="size-5 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-bold">Card</span>
                <span className="block text-xs text-muted-foreground">Credit or debit card</span>
              </span>
            </button>
          </div>

          <p className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Payment details are not requested. Your selected method is recorded with the order.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Order summary</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {store.cart.map((line) => (
              <li key={line.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-muted-foreground">
                  {line.qty} × {line.name}
                  <span className="block truncate text-xs">{lineDescription(line)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatINR(line.unitPrice * line.qty)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-dashed border-border pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Items total (incl. 5% GST)</dt>
              <dd className="font-semibold tabular-nums">{formatINR(totals.itemsTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery fee</dt>
              <dd className="font-semibold tabular-nums">{formatINR(totals.deliveryFee)}</dd>
            </div>
            {coupon && (
              <div className="flex justify-between text-veg">
                <dt>Coupon · {coupon.code}</dt>
                <dd className="font-semibold tabular-nums">−{formatINR(coupon.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base">
              <dt className="font-bold">To pay</dt>
              <dd className="font-bold tabular-nums">{formatINR(totalDue)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={submit}
            disabled={
              submitting ||
              couponBusy ||
              (Boolean(store.appliedCouponCode) && !coupon) ||
              unavailableCount > 0 ||
              store.cart.length === 0
            }
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Placing order…
              </>
            ) : (
              <>
                <BadgeCheck className="size-4" aria-hidden />
                Place order · {formatINR(totalDue)}
              </>
            )}
          </button>
          {unavailableCount > 0 && (
            <p className="mt-2 text-center text-xs font-semibold text-destructive">
              Some items in your cart aren't available at {outlet.name}.{" "}
              <Link to="/cart" className="underline">
                Go to cart
              </Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
