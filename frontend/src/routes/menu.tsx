import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Clock3,
  MapPin,
  Repeat,
  Search,
  ShoppingBag,
  Sparkles,
  Timer,
} from "lucide-react";
import type { MenuItem } from "@/data/types";
import { isItemAvailable, MENU_CATEGORIES } from "@/data/menu";
import { getOutlet } from "@/data/outlets";
import { addToCart, hydrateStore, refreshCatalog, setLineQty, useStore } from "@/lib/store";
import { cartTotals, defaultPortionId, defaultSpiceId, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodImage } from "@/components/FoodImage";
import { VegMark } from "@/components/VegMark";
import { ItemSheet } from "@/components/ItemSheet";
import { QtyStepper } from "@/components/QtyStepper";
import { CustomerOfferSpotlight } from "@/components/CustomerOfferSpotlight";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Tales of Hyderabad" },
      {
        name: "description",
        content: "Explore Hyderabadi dum biryani, sides and desserts. Prices include 5% GST.",
      },
      { property: "og:title", content: "Menu — Tales of Hyderabad" },
      {
        property: "og:description",
        content: "Dum biryanis, mirchi ka salan, raita and double ka meetha.",
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const navigate = useNavigate();
  const store = useStore();
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All dishes");

  useEffect(() => {
    void hydrateStore();
  }, []);

  useEffect(() => {
    if (store.hydrated && !store.outletId) void navigate({ to: "/customer" });
  }, [store.hydrated, store.outletId, navigate]);

  useEffect(() => {
    if (!store.hydrated || !store.outletId) return;
    void refreshCatalog();
    const interval = window.setInterval(() => void refreshCatalog(), 30_000);
    return () => window.clearInterval(interval);
  }, [store.hydrated, store.outletId]);

  const outlet = getOutlet(store.outletId);
  const cartCount = store.cart.reduce((total, line) => total + line.qty, 0);
  const categories = Array.from(
    new Set([...MENU_CATEGORIES, ...store.menuItems.map((item) => item.category)]),
  );
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return store.menuItems.filter((item) => {
      const matchesCategory = categoryFilter === "All dishes" || item.category === categoryFilter;
      const matchesQuery =
        !query ||
        `${item.name} ${item.description} ${item.category} ${item.allergens.join(" ")}`
          .toLowerCase()
          .includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [store.menuItems, categoryFilter, search]);

  if (!store.hydrated || (store.catalogLoading && !outlet)) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center text-muted-foreground">
        Loading the live menu…
      </div>
    );
  }

  if (!outlet) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p role={store.catalogError ? "alert" : "status"} className="text-sm text-muted-foreground">
          {store.catalogError ?? "Choose an outlet before opening the menu."}
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

  const quickAdd = (item: MenuItem) => {
    addToCart({
      item,
      portionId: defaultPortionId(item),
      spiceId: defaultSpiceId(item),
      addOnIds: [],
      qty: 1,
    });
  };
  const basket = cartTotals(store.cart, outlet.deliveryFee);
  const featureItem =
    store.menuItems.find((item) => item.id === "chicken-dum-biryani") ?? store.menuItems[0];

  return (
    <div className={cn("pb-32", cartCount === 0 && "pb-14")}>
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm shadow-foreground/[0.02]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Your kitchen
              </p>
              <p className="truncate font-display text-base font-semibold">{outlet.name}</p>
            </div>
            <span className="hidden h-8 w-px bg-border sm:block" />
            <p className="hidden text-xs text-muted-foreground sm:block">{outlet.address}</p>
          </div>
          <Link
            to="/customer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-bold transition-colors hover:border-primary hover:text-primary"
          >
            <Repeat className="size-3.5" aria-hidden />
            Change outlet
          </Link>
        </div>

        <section className="relative mt-5 grid overflow-hidden rounded-[1.75rem] bg-secondary md:min-h-64 md:grid-cols-[1.1fr_0.9fr]">
          <div className="relative z-10 flex flex-col items-start justify-center px-6 py-8 sm:px-9 sm:py-10">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              <Sparkles className="size-3.5" aria-hidden />
              Made for the moment
            </p>
            <h1 className="mt-4 max-w-lg font-display text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl">
              The handi is on.
              <br />
              <span className="text-primary">What are you craving?</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Slow dum, warm spices, and the sides that make it a proper Hyderabad meal.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5">
                <Timer className="size-3.5 text-primary" aria-hidden />
                About {outlet.etaMins} min
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5">
                <Clock3 className="size-3.5 text-primary" aria-hidden />
                Prepared fresh
              </span>
            </div>
          </div>
          <div className="relative min-h-44 md:min-h-full">
            {featureItem && (
              <FoodImage
                src={featureItem.image}
                alt={featureItem.name}
                className="absolute inset-0 size-full"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/45 via-transparent to-transparent md:bg-gradient-to-r md:from-secondary md:via-secondary/10 md:to-transparent" />
            {featureItem && (
              <div className="absolute bottom-4 right-4 rounded-2xl border border-background/30 bg-background/90 px-4 py-2.5 shadow-lg backdrop-blur sm:bottom-5 sm:right-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  House favourite
                </p>
                <p className="mt-0.5 font-display font-semibold">{featureItem.name}</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <main id="menu-items" className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              The menu
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">
              Cooked slow. Ordered easy.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every dish is made fresh at {outlet.name}.
            </p>
          </div>
          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Search dishes or ingredients</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search biryani, sides, ingredients…"
              className="w-full rounded-full border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
        </div>

        <nav
          aria-label="Menu categories"
          className="sticky top-[112px] z-30 -mx-4 mt-5 border-y border-border/70 bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-3"
        >
          <div className="flex gap-2 overflow-x-auto">
            {["All dishes", ...categories].map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={categoryFilter === category}
                onClick={() => setCategoryFilter(category)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-all",
                  categoryFilter === category
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </nav>

        {store.catalogError && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {store.catalogError}
          </p>
        )}
        {store.catalogLoading && store.menuItems.length === 0 && (
          <p className="mt-8 text-sm text-muted-foreground">Loading live dishes…</p>
        )}
        {filteredItems.length === 0 && !store.catalogLoading && (
          <div className="mt-8 rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <Search className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
            <h3 className="mt-3 font-display text-xl font-semibold">No dishes found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different dish name or category.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategoryFilter("All dishes");
              }}
              className="mt-4 text-sm font-bold text-primary"
            >
              Clear filters
            </button>
          </div>
        )}

        {categories
          .filter((category) => filteredItems.some((item) => item.category === category))
          .map((category) => (
            <section
              key={category}
              id={`cat-${category.toLowerCase()}`}
              className="scroll-mt-36 pt-8 sm:pt-10"
            >
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-semibold sm:text-2xl">{category}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {filteredItems.filter((item) => item.category === category).length} kitchen
                    favourites
                  </p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  Prices include 5% GST
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredItems
                  .filter((item) => item.category === category)
                  .map((item) => {
                    const available = isItemAvailable(item, outlet.id);
                    const defaultPortion = defaultPortionId(item);
                    const defaultSpice = defaultSpiceId(item);
                    const quickLine = store.cart.find(
                      (line) =>
                        line.itemId === item.id &&
                        line.portionId === defaultPortion &&
                        line.spiceId === defaultSpice &&
                        line.addOns.length === 0,
                    );
                    return (
                      <article
                        key={item.id}
                        className={cn(
                          "group flex h-full flex-col overflow-hidden rounded-3xl border bg-card transition-all duration-200",
                          available
                            ? "border-border/80 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-foreground/[0.06]"
                            : "border-border/60 opacity-75",
                        )}
                      >
                        <div className="relative aspect-[1.72/1] overflow-hidden bg-secondary">
                          <FoodImage
                            src={item.image}
                            alt={item.name}
                            className={cn(
                              "size-full transition-transform duration-500 group-hover:scale-[1.035]",
                              !available && "grayscale",
                            )}
                          />
                          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-background/95 px-2.5 py-1.5 shadow-sm backdrop-blur">
                            <VegMark diet={item.diet} />
                            <span className="text-[10px] font-bold">
                              {item.diet === "veg" ? "Veg" : "Non-veg"}
                            </span>
                          </div>
                          {!available && (
                            <span className="absolute inset-x-3 bottom-3 rounded-full bg-foreground/90 px-3 py-2 text-center text-xs font-bold text-background">
                              Not available at this outlet
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-4 sm:p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="font-display text-lg font-semibold leading-tight">
                                {item.name}
                              </h4>
                              <p className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">
                                {item.description}
                              </p>
                            </div>
                            <p className="shrink-0 text-right">
                              {item.salePrice !== undefined && (
                                <span className="mb-0.5 block text-[9px] font-black uppercase tracking-wide text-primary">
                                  On sale
                                </span>
                              )}
                              <span className="block font-display text-lg font-bold">
                                {formatINR(item.salePrice ?? item.basePrice)}
                              </span>
                              {item.salePrice !== undefined && (
                                <span className="block text-[10px] text-muted-foreground line-through">
                                  {formatINR(item.basePrice)}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground">incl. GST</span>
                            </p>
                          </div>
                          <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
                            {item.portions.length > 0 && (
                              <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-secondary-foreground">
                                {item.portions.length} portion{item.portions.length > 1 ? "s" : ""}
                              </span>
                            )}
                            {item.spiceLevels.length > 0 && (
                              <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-secondary-foreground">
                                Choose spice
                              </span>
                            )}
                            {item.addOns.length > 0 && (
                              <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-secondary-foreground">
                                Add-ons available
                              </span>
                            )}
                          </div>
                          <p className="mt-2 min-h-4 text-[10px] leading-relaxed text-muted-foreground">
                            Allergens:{" "}
                            {item.allergens.length ? item.allergens.join(", ") : "None listed"}
                          </p>
                          <div className="mt-auto flex items-center gap-2 pt-4">
                            {available ? (
                              quickLine ? (
                                <QtyStepper
                                  qty={quickLine.qty}
                                  min={0}
                                  max={20}
                                  variant="primary"
                                  onChange={(qty) => setLineQty(quickLine.id, qty)}
                                  className="ml-auto"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => quickAdd(item)}
                                  className="ml-auto inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-black text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
                                >
                                  <span aria-hidden className="text-lg leading-none">
                                    +
                                  </span>
                                  Add
                                </button>
                              )
                            ) : (
                              <span className="ml-auto rounded-full bg-muted px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                                Sold out
                              </span>
                            )}
                            {available &&
                              (item.portions.length > 0 ||
                                item.spiceLevels.length > 0 ||
                                item.addOns.length > 0) && (
                                <button
                                  type="button"
                                  onClick={() => setSheetItem(item)}
                                  className="inline-flex h-11 items-center justify-center rounded-full border border-border px-4 text-xs font-bold transition-colors hover:border-primary hover:text-primary"
                                >
                                  Customise
                                </button>
                              )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
      </main>

      <CustomerOfferSpotlight outletId={outlet.id} menuItems={store.menuItems} />

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <Link
            to="/cart"
            className="mx-auto flex max-w-xl items-center justify-between gap-4 rounded-2xl bg-foreground px-4 py-3 text-background shadow-[0_12px_45px_-12px_rgba(36,24,18,0.55)] transition-transform hover:-translate-y-0.5 sm:px-5"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ShoppingBag className="size-4" aria-hidden />
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-black text-accent-foreground">
                  {cartCount}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-background/60">
                  Your basket
                </span>
                <span className="block truncate text-sm font-bold">
                  {cartCount} item{cartCount === 1 ? "" : "s"} · {formatINR(basket.total)}
                </span>
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground">
              View cart <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        </div>
      )}

      <ItemSheet item={sheetItem} onClose={() => setSheetItem(null)} />
    </div>
  );
}
