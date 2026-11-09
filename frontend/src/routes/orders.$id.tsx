import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin, PartyPopper, Phone } from "lucide-react";
import { streamTrackedOrderEvents } from "@/lib/api";
import { getOutlet } from "@/data/outlets";
import { formatINR, lineDescription } from "@/lib/format";
import { getTrackingToken, hydrateStore, refreshTrackedOrder, useStore } from "@/lib/store";
import { OrderTracker } from "@/components/OrderTracker";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order confirmed — Tales of Hyderabad" },
      {
        name: "description",
        content:
          "Your Tales of Hyderabad order is confirmed. Follow its progress from the kitchen to your door.",
      },
      { property: "og:title", content: "Order confirmed — Tales of Hyderabad" },
      {
        property: "og:description",
        content: "Your biryani order is confirmed. Track it from placed to ready.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Order confirmed — Tales of Hyderabad" },
      { name: "twitter:description", content: "Your biryani order is confirmed. Track it live." },
    ],
  }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const store = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await refreshTrackedOrder(id);
        if (active) setError(null);
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : "Order details could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    const controller = new AbortController();
    void hydrateStore().then(async () => {
      await refresh();
      const trackingToken = getTrackingToken(id);
      if (trackingToken) {
        void streamTrackedOrderEvents(id, trackingToken, refresh, controller.signal).catch(() => {
          if (active && !controller.signal.aborted)
            setError("Live updates paused. Order details will refresh automatically.");
        });
      }
    });
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [id]);

  if (!store.hydrated || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted-foreground">
        Loading your order…
      </div>
    );
  }

  const order = store.orders.find((item) => item.id === id) ?? null;
  if (!order) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">We couldn't find that order</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {error ??
            "This browser does not have the private tracking link for that order. Open the link on the device used at checkout."}
        </p>
        <Link
          to="/customer"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start a new order
        </Link>
      </div>
    );
  }

  const outlet = getOutlet(order.outletId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="rounded-3xl border border-border bg-card p-6 text-center sm:p-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-veg text-veg-foreground">
          <BadgeCheck className="size-7" aria-hidden />
        </div>
        <h1 className="mt-4 flex flex-wrap items-center justify-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
          Order confirmed
          <PartyPopper className="size-5 text-accent-foreground" aria-hidden />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order <span className="font-bold text-foreground">{order.id}</span> · from{" "}
          {order.outletName}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-xs text-muted-foreground">
          We’ve received your order. Follow its progress below.
        </p>
      </div>
      {error && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Live updates paused: {error}
        </p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Order progress</h2>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">Live updates from the kitchen</p>
          <OrderTracker order={order} />
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold">Delivery</h2>
            <div className="mt-3 space-y-3 text-sm">
              <p className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-semibold">{outlet?.name ?? order.outletName}</span>
                  <span className="block text-muted-foreground">{outlet?.address}</span>
                </span>
              </p>
              <p className="flex items-start gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block font-semibold">{order.customer.name}</span>
                  <span className="block text-muted-foreground">
                    {order.customer.phone} · {order.customer.address}
                    {order.customer.landmark ? ` (${order.customer.landmark})` : ""}
                  </span>
                </span>
              </p>
              {order.customer.notes && (
                <p className="rounded-xl bg-secondary/60 p-3 text-xs leading-relaxed text-secondary-foreground">
                  “{order.customer.notes}”
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Payment method · {order.paymentMethod === "upi" ? "UPI" : "Card"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg font-semibold">Your items</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {order.lines.map((line) => (
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
                <dt className="text-muted-foreground">Items (incl. 5% GST)</dt>
                <dd className="font-semibold tabular-nums">{formatINR(order.totals.itemsTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery fee</dt>
                <dd className="font-semibold tabular-nums">
                  {formatINR(order.totals.deliveryFee)}
                </dd>
              </div>
              {order.totals.discount > 0 && (
                <div className="flex justify-between text-veg">
                  <dt>{order.couponCode ? `Coupon · ${order.couponCode}` : "Discount"}</dt>
                  <dd className="font-semibold tabular-nums">
                    −{formatINR(order.totals.discount)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between text-base">
                <dt className="font-bold">Order total</dt>
                <dd className="font-bold tabular-nums">{formatINR(order.totals.total)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <div className="mt-8 text-center">
        <Link
          to="/menu"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Order something else
        </Link>
      </div>
    </div>
  );
}
