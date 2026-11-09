import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlarmClock,
  ArrowRight,
  ChefHat,
  Clock3,
  PackageCheck,
  PackageX,
  RefreshCw,
  Search,
  ShoppingBag,
} from "lucide-react";
import type { Order, OrderStatus } from "@/data/types";
import { streamKitchenOrderEvents } from "@/lib/api";
import { formatINR, lineDescription } from "@/lib/format";
import { isOrderLate, nextStatus, statusActionLabel } from "@/lib/order";
import {
  hydrateStore,
  refreshCatalog,
  refreshKitchenOrders,
  setKitchenItemAvailability,
  setKitchenOutlet,
  setOrderStatus,
  useStore,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kitchen")({
  head: () => ({
    meta: [
      { title: "Kitchen board — Tales of Hyderabad" },
      {
        name: "description",
        content: "View and update live kitchen orders for Tales of Hyderabad.",
      },
    ],
  }),
  component: KitchenPage,
});

type KitchenFilter = "all" | "new" | "preparing" | "ready" | "handoff";
const KITCHEN_COLUMNS: { status: OrderStatus; label: string; short: string }[] = [
  { status: "placed", label: "New orders", short: "New" },
  { status: "preparing", label: "On the handi", short: "Preparing" },
  { status: "ready", label: "Ready for pickup", short: "Ready" },
  { status: "out_for_delivery", label: "Rider handoff", short: "Handoff" },
];
const FILTERS: { id: KitchenFilter; label: string; status?: OrderStatus }[] = [
  { id: "all", label: "All orders" },
  { id: "new", label: "New", status: "placed" },
  { id: "preparing", label: "Preparing", status: "preparing" },
  { id: "ready", label: "Ready", status: "ready" },
  { id: "handoff", label: "Handoff", status: "out_for_delivery" },
];

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function elapsedLabel(placedAt: number, now: number) {
  const mins = Math.max(0, Math.floor((now - placedAt) / 60_000));
  return mins === 0 ? "just placed" : `${mins} min ago`;
}

function lateMinutes(order: Order, now: number) {
  return Math.max(1, Math.round((now - order.expectedReadyAt) / 60_000));
}

function KitchenPage() {
  const store = useStore();
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [filter, setFilter] = useState<KitchenFilter>("all");
  const [search, setSearch] = useState("");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);

  useEffect(() => {
    void hydrateStore();
  }, []);

  const assignedOutletId = store.staff?.role === "kitchen" ? store.staff.outletId : null;
  const outletId = assignedOutletId ?? store.kitchenOutletId;
  const outlet = store.outlets.find((item) => item.id === outletId) ?? null;

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!store.staff || !outletId) return;
    let active = true;
    const refresh = async () => {
      try {
        await refreshKitchenOrders(outletId);
        if (active) setError(null);
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Kitchen orders could not be loaded.",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const controller = new AbortController();
    if (store.staffToken) {
      void streamKitchenOrderEvents(outletId, store.staffToken, refresh, controller.signal).catch(
        () => {
          if (active && !controller.signal.aborted)
            setError("Live updates paused. The order board will refresh automatically.");
        },
      );
    }
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [store.staff, store.staffToken, outletId]);

  const boardOrders = store.orders
    .filter(
      (order) => order.outletId === outletId && !["delivered", "cancelled"].includes(order.status),
    )
    .sort((a, b) => a.placedAt - b.placedAt);
  const searchTerm = search.trim().toLowerCase();
  const matchingOrders = boardOrders.filter(
    (order) =>
      !searchTerm ||
      `${order.id} ${order.customer.name} ${order.lines.map((line) => line.name).join(" ")}`
        .toLowerCase()
        .includes(searchTerm),
  );
  const lateCount = boardOrders.filter((order) => isOrderLate(order, now)).length;
  const completedPrepTimes = store.orders
    .filter((order) => order.outletId === outletId)
    .map((order) => {
      const started = order.statusHistory.find((event) => event.status === "preparing");
      const ready = order.statusHistory.find((event) => event.status === "ready");
      return started && ready && ready.at >= started.at ? (ready.at - started.at) / 60_000 : null;
    })
    .filter((minutes): minutes is number => minutes !== null);
  const averagePrep = completedPrepTimes.length
    ? `${Math.round(completedPrepTimes.reduce((sum, value) => sum + value, 0) / completedPrepTimes.length)} min`
    : "—";

  const advanceOrder = async (orderId: string, status: OrderStatus) => {
    setBusyOrder(orderId);
    setError(null);
    try {
      await setOrderStatus(orderId, status);
      await refreshKitchenOrders(outletId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The order status could not be updated.");
    } finally {
      setBusyOrder(null);
    }
  };

  const toggleItemAvailability = async (itemId: string, available: boolean) => {
    setBusyItem(itemId);
    setAvailabilityMessage(null);
    try {
      await setKitchenItemAvailability(itemId, outletId, available);
      setAvailabilityMessage(
        available
          ? "Item is available to customers again."
          : "Item paused at this outlet; it remains available at other kitchens.",
      );
    } catch (reason) {
      setAvailabilityMessage(
        reason instanceof Error ? reason.message : "Availability could not be updated.",
      );
    } finally {
      setBusyItem(null);
    }
  };

  if (!store.hydrated || store.staffLoading)
    return (
      <div className="bg-foreground px-4 py-16 text-center text-background">
        Checking staff access…
      </div>
    );
  if (!store.staff)
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Kitchen sign-in required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with a kitchen account to view its outlet’s live orders.
        </p>
        <Link
          to="/login/kitchen"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
        >
          Kitchen team sign in
        </Link>
      </div>
    );
  if (store.staff.role !== "admin" && store.staff.role !== "kitchen")
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        This staff account cannot access the kitchen.
      </div>
    );
  if (!outlet)
    return (
      <div className="bg-foreground px-4 py-16 text-center text-background">
        Loading kitchen details…
      </div>
    );

  return (
    <main className="-my-px min-h-[calc(100vh-7.5rem)] bg-foreground pb-10 text-background">
      <div className="mx-auto max-w-[100rem] px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-background/15 pb-5">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-accent">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-veg opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-veg" />
              </span>
              Kitchen service board · live
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {outlet.name} kitchen
            </h1>
            <p className="mt-1 text-sm text-background/60">
              Keep every handi moving. Board refreshes automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/5 px-3 py-2 text-xs font-semibold tabular-nums text-background/75">
              <Clock3 className="size-3.5 text-accent" aria-hidden />
              {formatTime(now)}
            </span>
            <Link
              to="/customer"
              className="inline-flex items-center gap-2 rounded-full bg-background px-4 py-2.5 text-xs font-black text-foreground transition-colors hover:bg-accent"
            >
              <ShoppingBag className="size-4" aria-hidden />
              Customer view
            </Link>
          </div>
        </header>

        {store.staff.role === "admin" ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-black uppercase tracking-[0.18em] text-background/45">
              Outlet
            </span>
            {store.outlets.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === outletId}
                onClick={() => setKitchenOutlet(item.id)}
                className={cn(
                  "rounded-full border px-4 py-2 text-xs font-bold transition-colors",
                  item.id === outletId
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-background/20 text-background/75 hover:border-accent",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/5 px-3 py-2 text-xs font-semibold text-background/75">
            <ChefHat className="size-3.5 text-accent" aria-hidden />
            Assigned station · {outlet.name}
          </p>
        )}

        <section
          aria-label="Kitchen shift summary"
          className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
        >
          <SummaryCard label="Open orders" value={boardOrders.length} note="in this kitchen" />
          <SummaryCard
            label="New"
            value={boardOrders.filter((order) => order.status === "placed").length}
            note="awaiting acceptance"
          />
          <SummaryCard
            label="Preparing"
            value={boardOrders.filter((order) => order.status === "preparing").length}
            note="on the handi"
          />
          <SummaryCard
            label="Ready"
            value={boardOrders.filter((order) => order.status === "ready").length}
            note="awaiting pickup"
          />
          <SummaryCard
            label="Rider wait"
            value={boardOrders.filter((order) => order.status === "out_for_delivery").length}
            note="handoff queue"
          />
          <SummaryCard label="Avg prep" value={averagePrep} note="recent orders" />
          <SummaryCard
            label="Late"
            value={lateCount}
            note={lateCount ? "needs attention" : "on schedule"}
            warning={lateCount > 0}
          />
        </section>

        {error && (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/60 bg-destructive/20 p-3 text-sm"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void refreshKitchenOrders(outletId)
                  .then(() => setError(null))
                  .catch((reason) =>
                    setError(reason instanceof Error ? reason.message : "Refresh failed."),
                  )
                  .finally(() => setLoading(false));
              }}
              className="rounded-full border border-background/30 px-3 py-1.5 text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 border-b border-background/15 pb-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-sm">
            <span className="sr-only">Search kitchen orders</span>
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-background/45"
              aria-hidden
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find order, customer, or dish"
              className="w-full rounded-xl border border-background/15 bg-background/[0.07] py-2.5 pl-9 pr-3 text-xs text-background outline-none placeholder:text-background/40 focus:border-accent"
            />
          </label>
          <nav aria-label="Filter kitchen orders" className="flex gap-2 overflow-x-auto">
            {FILTERS.map((option) => {
              const amount =
                option.id === "all"
                  ? boardOrders.length
                  : boardOrders.filter((order) => order.status === option.status).length;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors sm:px-4",
                    filter === option.id
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-background/20 text-background/70 hover:border-background/50 hover:text-background",
                  )}
                >
                  {option.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black",
                      filter === option.id ? "bg-foreground/10" : "bg-background/10",
                    )}
                  >
                    {amount}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center justify-between gap-3 lg:justify-end">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-background/45">
              <RefreshCw className="size-3" aria-hidden />
              Live · 5 sec
            </span>
            <button
              type="button"
              onClick={() => {
                void refreshKitchenOrders(outletId)
                  .then(() => setError(null))
                  .catch((reason) =>
                    setError(reason instanceof Error ? reason.message : "Refresh failed."),
                  );
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-background/20 px-3 py-2 text-[10px] font-bold hover:border-accent"
            >
              <RefreshCw className="size-3" aria-hidden />
              Refresh now
            </button>
          </div>
        </div>

        {loading && boardOrders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-background/15 bg-background/5 px-5 py-16 text-center text-sm text-background/60">
            Loading live orders…
          </div>
        ) : matchingOrders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-background/20 bg-background/[0.03] px-6 py-16 text-center">
            <ChefHat className="mx-auto size-10 text-background/35" aria-hidden />
            <h2 className="mt-4 font-display text-xl font-semibold">
              {searchTerm ? "No orders match that search" : `No open orders at ${outlet.name}`}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-background/60">
              {searchTerm
                ? "Try an order number, customer name, or dish."
                : "Place an order from the customer menu and it will appear here as soon as checkout completes."}
            </p>
            {!searchTerm && (
              <Link
                to="/menu"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-black text-accent-foreground"
              >
                Open menu <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-4 xl:gap-4">
            {KITCHEN_COLUMNS.map((column) => {
              const laneOrders = matchingOrders.filter((order) => order.status === column.status);
              const visibleOrders =
                filter === "all" ||
                FILTERS.find((option) => option.id === filter)?.status === column.status;
              if (!visibleOrders) return null;
              return (
                <StatusColumn
                  key={column.status}
                  label={column.label}
                  short={column.short}
                  orders={laneOrders}
                  now={now}
                  busyOrder={busyOrder}
                  onAdvance={advanceOrder}
                />
              );
            })}
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-background/15 bg-background/[0.04]">
          <button
            type="button"
            aria-expanded={availabilityOpen}
            onClick={() => setAvailabilityOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <PackageCheck className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-black">Menu availability</span>
                <span className="mt-0.5 block text-[10px] text-background/50">
                  Pause an item at {outlet.name} when it sells out; other outlets are unaffected.
                </span>
              </span>
            </span>
            <span className="rounded-full border border-background/20 px-3 py-1.5 text-[10px] font-bold">
              {availabilityOpen
                ? "Close"
                : `${store.menuItems.filter((item) => item.active !== false && item.availableAt.includes(outlet.id)).length} available`}
            </span>
          </button>
          {availabilityMessage && (
            <p
              role="status"
              className="border-t border-background/10 px-4 py-2.5 text-xs text-accent sm:px-5"
            >
              {availabilityMessage}
            </p>
          )}
          {availabilityOpen && (
            <div className="grid gap-2 border-t border-background/10 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
              {store.menuItems
                .filter((item) => item.active !== false)
                .map((item) => {
                  const available = item.availableAt.includes(outlet.id);
                  const busy = busyItem === item.id;
                  return (
                    <article
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-background/10 bg-background/[0.055] p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">{item.name}</p>
                        <p
                          className={cn(
                            "mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold",
                            available ? "text-emerald-300" : "text-red-300",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              available ? "bg-emerald-300" : "bg-red-300",
                            )}
                          />
                          {available ? "Available at this outlet" : "Paused here"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleItemAvailability(item.id, !available)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-black transition-colors disabled:opacity-50",
                          available
                            ? "border-red-300/25 text-red-200 hover:bg-red-300/10"
                            : "border-emerald-300/25 text-emerald-200 hover:bg-emerald-300/10",
                        )}
                      >
                        {busy ? (
                          <RefreshCw className="size-3 animate-spin" aria-hidden />
                        ) : available ? (
                          <PackageX className="size-3" aria-hidden />
                        ) : (
                          <PackageCheck className="size-3" aria-hidden />
                        )}
                        {available ? "Pause item" : "Restore"}
                      </button>
                    </article>
                  );
                })}
              {store.menuItems.filter((item) => item.active !== false).length === 0 && (
                <p className="col-span-full px-2 py-4 text-center text-xs text-background/50">
                  No active menu items to manage.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  note,
  warning = false,
}: {
  label: string;
  value: number | string;
  note: string;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        warning
          ? "border-destructive/50 bg-destructive/10"
          : "border-background/10 bg-background/[0.06]",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-background/55">
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span
          className={cn(
            "font-display text-3xl font-semibold tabular-nums",
            warning && "text-destructive-foreground",
          )}
        >
          {value}
        </span>
        <span className="pb-1 text-[10px] text-background/45">{note}</span>
      </div>
    </div>
  );
}

function StatusColumn({
  label,
  short,
  orders,
  now,
  busyOrder,
  onAdvance,
}: {
  label: string;
  short: string;
  orders: Order[];
  now: number;
  busyOrder: string | null;
  onAdvance: (id: string, status: OrderStatus) => void;
}) {
  return (
    <section
      aria-label={`${label} orders`}
      className="flex min-h-64 flex-col overflow-hidden rounded-2xl border border-background/15 bg-background/[0.04]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-background/10 px-3.5 py-3">
        <div>
          <p className="text-sm font-black tracking-tight">{label}</p>
          <p className="mt-0.5 text-[10px] text-background/45">
            {short === "New"
              ? "Take the next order"
              : short === "Preparing"
                ? "Cooking in progress"
                : short === "Ready"
                  ? "Packed and waiting"
                  : "Partner pickup"}
          </p>
        </div>
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-black text-accent-foreground">
          {orders.length}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-2.5 sm:p-3">
        {orders.length === 0 && (
          <p className="flex min-h-24 flex-1 items-center justify-center rounded-xl border border-dashed border-background/15 text-xs text-background/35">
            No {short.toLowerCase()} orders
          </p>
        )}
        {orders.map((order) => (
          <KitchenCard
            key={order.id}
            order={order}
            now={now}
            busy={busyOrder === order.id}
            onAdvance={onAdvance}
          />
        ))}
      </div>
    </section>
  );
}

function KitchenCard({
  order,
  now,
  busy,
  onAdvance,
}: {
  order: Order;
  now: number;
  busy: boolean;
  onAdvance: (id: string, status: OrderStatus) => void;
}) {
  const late = isOrderLate(order, now);
  const next = nextStatus(order.status);
  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-background text-foreground shadow-sm",
        late ? "border-destructive ring-1 ring-destructive/30" : "border-border",
      )}
    >
      <header
        className={cn(
          "flex items-start justify-between gap-3 border-b px-3.5 py-3",
          late ? "border-destructive/20 bg-destructive/5" : "border-border/70 bg-card",
        )}
      >
        <div>
          <p className="font-display text-xl font-bold tracking-tight">{order.id}</p>
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            {order.customer.name || "Guest"} · {elapsedLabel(order.placedAt, now)}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "font-display text-2xl font-bold tabular-nums",
              late ? "text-destructive" : "text-foreground",
            )}
          >
            {late ? `+${lateMinutes(order, now)}` : formatTime(order.expectedReadyAt)}
          </p>
          <p
            className={cn(
              "text-[9px] font-black uppercase tracking-[0.12em]",
              late ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {late ? "minutes late" : "ready by"}
          </p>
        </div>
      </header>
      <div className="p-3.5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <AlarmClock className="size-3.5 text-primary" aria-hidden />
          Placed {formatTime(order.placedAt)} · {elapsedLabel(order.placedAt, now)}
        </p>
        <ul className="mt-3 divide-y divide-border/70">
          {order.lines.map((line) => (
            <li
              key={line.id}
              className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary font-black text-secondary-foreground">
                  {line.qty}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight">{line.name}</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                    {lineDescription(line) || "Standard"}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums">
                {formatINR(line.unitPrice * line.qty)}
              </span>
            </li>
          ))}
        </ul>
        {order.customer.notes && (
          <p className="mt-3 rounded-lg border border-accent/40 bg-accent/15 px-3 py-2 text-xs leading-relaxed">
            <span className="font-black uppercase tracking-wide">Note </span>
            {order.customer.notes}
          </p>
        )}
        {order.customer.phone && (
          <p className="mt-3 text-xs text-muted-foreground">{order.customer.phone}</p>
        )}
        {next ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdvance(order.id, next)}
            className="mt-3 min-h-11 w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Updating order…" : statusActionLabel(next)}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdvance(order.id, "delivered")}
            className="mt-3 min-h-11 w-full rounded-xl bg-foreground px-3 py-2.5 text-sm font-black text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
          >
            {busy ? "Updating order…" : "Confirm delivered"}
          </button>
        )}
      </div>
    </article>
  );
}
