import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChefHat, Flame, LayoutGrid, MapPin, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { getOutlet } from "@/data/outlets";
import { hydrateStore, signOut, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const MODE_LINKS = [
  { to: "/customer", label: "Order food", icon: UtensilsCrossed },
  { to: "/kitchen", label: "Kitchen", icon: ChefHat },
  { to: "/admin", label: "Menu admin", icon: LayoutGrid },
] as const;

function activeMode(pathname: string): "/kitchen" | "/admin" | "/customer" {
  if (pathname.startsWith("/kitchen")) return "/kitchen";
  if (pathname.startsWith("/admin")) return "/admin";
  return "/customer";
}

export function AppHeader() {
  const store = useStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    void hydrateStore();
  }, []);

  const outlet = getOutlet(store.outletId);
  const count = store.cart.reduce((total, line) => total + line.qty, 0);
  const active = activeMode(pathname);

  return (
    <div className="sticky top-0 z-40">
      <div className="border-b border-border/70 bg-secondary/75 backdrop-blur">
        <div className="mx-auto flex min-h-11 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <nav
            aria-label="App workspace"
            className="flex min-w-0 items-center gap-1 overflow-x-auto py-1"
          >
            {MODE_LINKS.map((mode) => {
              const Icon = mode.icon;
              return (
                <Link
                  key={mode.to}
                  to={mode.to}
                  aria-current={active === mode.to ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all sm:px-3.5 sm:text-xs",
                    active === mode.to
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {mode.label}
                </Link>
              );
            })}
          </nav>
          {store.staff ? (
            <div className="flex shrink-0 items-center gap-2 text-[11px]">
              <span className="hidden max-w-36 truncate font-semibold text-muted-foreground sm:inline">
                {store.staff.name}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-full border border-border/80 px-3 py-1.5 font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/"
              className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-card hover:text-primary"
            >
              Workspaces
            </Link>
          )}
        </div>
      </div>
      <header className="border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/customer" className="group flex min-w-0 items-center gap-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-3">
              <Flame className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 leading-none">
              <span className="block truncate font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
                Tales of Hyderabad
              </span>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.23em] text-muted-foreground">
                Dum biryani · Hyderabad
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <Link
              to="/customer"
              className="inline-flex max-w-40 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:border-accent sm:max-w-none sm:px-3.5"
            >
              <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="max-w-24 truncate sm:max-w-none">
                {outlet ? outlet.name : "Choose outlet"}
              </span>
            </Link>
            <span
              aria-live="polite"
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-2.5 py-2 text-[10px] font-bold sm:inline-flex",
                store.apiStatus === "online"
                  ? "bg-veg/10 text-veg"
                  : store.apiStatus === "offline"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  store.apiStatus === "online"
                    ? "bg-veg"
                    : store.apiStatus === "offline"
                      ? "bg-destructive"
                      : "bg-muted-foreground/40",
                )}
              />
              {store.apiStatus === "online"
                ? "Live"
                : store.apiStatus === "offline"
                  ? "Offline"
                  : "Connecting"}
            </span>
            <Link
              to="/cart"
              aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
              className="relative inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
            >
              <ShoppingBag className="size-[18px]" aria-hidden />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-black text-accent-foreground">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>
    </div>
  );
}
