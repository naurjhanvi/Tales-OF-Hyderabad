import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Clock, MapPin, ReceiptText, Timer, TriangleAlert } from "lucide-react";
import heroImg from "@/assets/hero-spread.jpg";
import { getOutlet } from "@/data/outlets";
import { lookupPincode, type PincodeLookup } from "@/lib/pincodes";
import {
  applyOutletSwitch,
  confirmOutletSwitch,
  hydrateStore,
  refreshCatalog,
  outletSwitchDecision,
  useStore,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { CustomerOfferSpotlight } from "@/components/CustomerOfferSpotlight";

export const Route = createFileRoute("/customer")({
  head: () => ({
    meta: [
      { title: "Choose your outlet — Tales of Hyderabad" },
      {
        name: "description",
        content:
          "Pick the Tales of Hyderabad outlet you want your biryani from — Kondapur, Gachibowli or Kukatpally — then browse the menu and order.",
      },
      { property: "og:title", content: "Tales of Hyderabad — Choose your outlet" },
      {
        property: "og:description",
        content:
          "Pick the Tales of Hyderabad outlet you want your biryani from, then browse the menu and order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Tales of Hyderabad — Choose your outlet" },
      {
        name: "twitter:description",
        content:
          "Pick the Tales of Hyderabad outlet you want your biryani from, then browse the menu and order.",
      },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const store = useStore();
  const navigate = useNavigate();
  const [pincode, setPincode] = useState("");
  const [lookup, setLookup] = useState<PincodeLookup | null>(null);
  const [confirmOutletId, setConfirmOutletId] = useState<string | null>(null);

  useEffect(() => {
    hydrateStore();
  }, []);

  const cartCount = store.cart.reduce((n, line) => n + line.qty, 0);
  const currentOutlet = getOutlet(store.outletId);
  const confirmTarget = confirmOutletId ? getOutlet(confirmOutletId) : null;

  const chooseOutlet = (outletId: string) => {
    if (outletSwitchDecision(store.outletId, store.cart.length, outletId) === "confirm") {
      setConfirmOutletId(outletId);
      return;
    }
    applyOutletSwitch(outletId);
    void navigate({ to: "/menu" });
  };

  const confirmSwitch = () => {
    if (!confirmOutletId) return;
    confirmOutletSwitch(confirmOutletId);
    setConfirmOutletId(null);
    void navigate({ to: "/menu" });
  };

  const findOutlet = () => {
    setLookup(lookupPincode(pincode, store.outlets));
  };

  const lastOrder = store.trackedOrderCodes[0];

  return (
    <div>
      <section className="relative overflow-hidden">
        <img
          src={heroImg}
          alt="A spread of Hyderabadi biryani with salan and raita"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-foreground/10" />
        <div className="relative mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">
            Hyderabad · Dum-cooked since 1998
          </p>
          <h1 className="mt-3 max-w-xl font-display text-3xl font-semibold leading-tight text-background sm:text-5xl">
            Biryani, straight from the handi.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-background/85 sm:text-base">
            Choose the kitchen you want your order from. Every biryani is sealed and cooked slow,
            then delivered hot.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">Choose your outlet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Menu availability and delivery times vary by kitchen.
            </p>
          </div>
        </div>

        {store.catalogError && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {store.catalogError}
          </p>
        )}
        {store.catalogLoading && store.outlets.length === 0 && (
          <p className="mt-5 text-sm text-muted-foreground">Loading live outlets and menu…</p>
        )}
        {!store.catalogLoading && store.outlets.length === 0 && (
          <button
            type="button"
            onClick={() => void refreshCatalog()}
            className="mt-5 rounded-full border border-border px-4 py-2 text-sm font-semibold"
          >
            Retry connection
          </button>
        )}

        {}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <label
            htmlFor="pincode"
            className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            Delivery pincode
          </label>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your Hyderabad pin code and we’ll match you to the nearest Tales kitchen.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              id="pincode"
              className={cn(
                "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent sm:max-w-56",
                lookup?.status === "invalid" && "border-destructive focus:border-destructive",
              )}
              value={pincode}
              onChange={(e) => {
                setPincode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setLookup(null);
              }}
              placeholder="500084"
              inputMode="numeric"
              autoComplete="postal-code"
            />
            <button
              type="button"
              onClick={findOutlet}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Find my outlet
            </button>
          </div>
          {lookup?.status === "invalid" && (
            <p className="mt-2 text-xs font-semibold text-destructive">
              Enter a valid 6-digit Indian pin code.
            </p>
          )}
          {lookup?.status === "ok" &&
            lookup.outletId &&
            (() => {
              const matched = getOutlet(lookup.outletId);
              if (!matched) return null;
              return (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-veg/10 p-3">
                  <p className="text-sm font-semibold text-foreground">
                    <Check className="mr-1 inline size-4 text-veg" aria-hidden />
                    We deliver to {pincode} from {matched.name}.
                  </p>
                  <button
                    type="button"
                    onClick={() => chooseOutlet(matched.id)}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Order from {matched.name}
                  </button>
                </div>
              );
            })()}
          {lookup?.status === "unsupported" && (
            <p className="mt-3 rounded-xl bg-secondary/70 p-3 text-sm leading-relaxed text-secondary-foreground">
              We don’t deliver to {pincode} yet. Current Hyderabad coverage includes 500084, 500032
              and 500072. You can still pick an outlet below.
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {store.outlets.map((outlet) => {
            const active = store.outletId === outlet.id;
            return (
              <button
                key={outlet.id}
                type="button"
                onClick={() => chooseOutlet(outlet.id)}
                className={cn(
                  "group flex flex-col rounded-2xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md",
                  active ? "border-accent ring-1 ring-accent" : "border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-display text-lg font-semibold">
                    <MapPin className="size-4 text-primary" aria-hidden />
                    {outlet.name}
                  </h3>
                  {active && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {outlet.address}
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {outlet.hours}
                </p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Timer className="size-4" aria-hidden />
                  Avg. delivery {outlet.etaMins} min
                </p>
                <div className="mt-4 rounded-xl bg-secondary/70 p-3 text-xs leading-relaxed text-secondary-foreground">
                  <span className="font-bold">FSSAI Lic. {outlet.fssai.licence}</span>
                  <span className="block">Valid till {outlet.fssai.validTill}</span>
                  <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
                    Outlet information
                  </span>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary group-hover:underline">
                  {active ? "Order from here" : "Order from this outlet"}
                  <ArrowRight className="size-4" aria-hidden />
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <ReceiptText className="size-3.5" aria-hidden />
          All menu prices are inclusive of 5% GST.
        </p>

        {store.hydrated && lastOrder && (
          <Link
            to="/orders/$id"
            params={{ id: lastOrder }}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent"
          >
            Track your latest order · {lastOrder}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </section>

      {}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="switch-outlet-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <div>
                <h3 id="switch-outlet-title" className="font-display text-lg font-semibold">
                  Switch to {confirmTarget.name}?
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Your cart has {cartCount} item{cartCount === 1 ? "" : "s"} from{" "}
                  {currentOutlet?.name ?? "your current outlet"}. Switching kitchens clears the
                  cart.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOutletId(null)}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:border-accent"
              >
                Keep my cart
              </button>
              <button
                type="button"
                onClick={confirmSwitch}
                className="rounded-full bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                Clear cart & switch
              </button>
            </div>
          </div>
        </div>
      )}
      {store.outletId && (
        <CustomerOfferSpotlight outletId={store.outletId} menuItems={store.menuItems} />
      )}
    </div>
  );
}
