import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ChefHat,
  ClipboardList,
  Flame,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  ShieldCheck,
  Store,
  TicketPercent,
  Utensils,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { signOut, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type AdminScope = {
  outletId: string;
  setOutletId: (id: string) => void;
  days: number;
  setDays: (days: number) => void;
  search: string;
  setSearch: (value: string) => void;
};
const ScopeContext = createContext<AdminScope | null>(null);

export function useAdminScope() {
  const value = useContext(ScopeContext);
  if (!value) throw new Error("useAdminScope must be used inside AdminShell");
  return value;
}

const navItems = [
  {
    label: "Home",
    to: "/admin",
    icon: LayoutDashboard,
    active: (path: string) => path === "/admin",
  },
  {
    label: "Orders",
    to: "/admin/orders",
    icon: ClipboardList,
    active: (path: string) => path.startsWith("/admin/orders"),
  },
  {
    label: "Live Kitchen",
    to: "/kitchen",
    icon: ChefHat,
    active: (path: string) => path.startsWith("/kitchen"),
  },
  {
    label: "Menu",
    to: "/admin/menu",
    icon: Utensils,
    active: (path: string) => path.startsWith("/admin/menu"),
  },
  {
    label: "Offers & Coupons",
    to: "/admin/offers",
    icon: TicketPercent,
    active: (path: string) => path.startsWith("/admin/offers"),
  },
  {
    label: "Customers & Loyalty",
    to: "/admin/section/$section",
    section: "customers",
    icon: UsersRound,
    active: (path: string) => path.endsWith("/customers"),
  },
  {
    label: "Outlets",
    to: "/admin/section/$section",
    section: "outlets",
    icon: Store,
    active: (path: string) => path.endsWith("/outlets"),
  },
  {
    label: "Finance",
    to: "/admin/finance",
    icon: WalletCards,
    active: (path: string) => path.startsWith("/admin/finance"),
  },
  {
    label: "Reports",
    to: "/admin/section/$section",
    section: "reports",
    icon: BarChart3,
    active: (path: string) => path.endsWith("/reports"),
  },
  {
    label: "Marketing",
    to: "/admin/section/$section",
    section: "marketing",
    icon: Megaphone,
    active: (path: string) => path.endsWith("/marketing"),
  },
] as const;

type AdminNavItem = (typeof navItems)[number];

function AdminNavLink({
  item,
  pathname,
  mobile = false,
}: {
  item: AdminNavItem;
  pathname: string;
  mobile?: boolean;
}) {
  const Icon = item.icon;
  const active = item.active(pathname);
  const className = cn(
    mobile
      ? "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[10px] font-bold"
      : "group flex min-h-10 items-center gap-3 rounded-xl border-l-2 px-3 py-2 text-[12px] font-semibold transition-all",
    active
      ? mobile
        ? "bg-amber-400/15 text-amber-100"
        : "border-amber-400 bg-amber-400/10 text-amber-100"
      : mobile
        ? "text-slate-400 hover:bg-white/[0.05]"
        : "border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-white",
  );
  const content = (
    <>
      <Icon
        className={cn(
          mobile ? "size-3.5" : "size-4 shrink-0",
          active ? "text-amber-300" : "text-slate-500 group-hover:text-slate-200",
        )}
        aria-hidden
      />
      {!mobile && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {mobile && item.label}
    </>
  );
  const common = { "aria-current": active ? ("page" as const) : undefined, className };
  if ("section" in item)
    return (
      <Link
        key={item.label}
        {...common}
        to="/admin/section/$section"
        params={{ section: item.section }}
      >
        {content}
      </Link>
    );
  return (
    <Link key={item.label} {...common} to={item.to}>
      {content}
    </Link>
  );
}

const pageTitles: Record<string, { title: string; description: string }> = {
  "/admin": { title: "Overview", description: "Your direct-order business at a glance." },
  "/admin/orders": { title: "Orders", description: "Track paid orders across your outlets." },
  "/kitchen": { title: "Live kitchen", description: "Outlet production and handoff queues." },
  "/admin/menu": {
    title: "Menu management",
    description: "One menu, with prices and availability for every outlet.",
  },
  "/admin/offers": {
    title: "Offers & coupons",
    description: "Put dishes on sale and create checkout-ready coupon codes.",
  },
  "/admin/finance": {
    title: "Finance",
    description: "Revenue and payment methods recorded with direct orders.",
  },
};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const store = useStore();
  const [outletId, setOutletId] = useState("all");
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState("");
  const scope = useMemo(
    () => ({ outletId, setOutletId, days, setDays, search, setSearch }),
    [outletId, days, search],
  );
  const page =
    pageTitles[pathname] ??
    (pathname.startsWith("/admin/section/")
      ? {
          title: pathname.split("/").at(-1)?.replaceAll("-", " ") ?? "Workspace",
          description: "Company operations workspace.",
        }
      : { title: "Overview", description: "Your direct-order business at a glance." });

  return (
    <ScopeContext.Provider value={scope}>
      <div className="admin-glass-theme relative min-h-screen overflow-hidden text-slate-900">
        <div className="pointer-events-none fixed -left-40 top-24 size-[26rem] rounded-full bg-amber-500/10 blur-[110px]" />
        <div className="pointer-events-none fixed -right-40 top-[30rem] size-[32rem] rounded-full bg-red-700/10 blur-[120px]" />
        <div className="relative mx-auto flex min-h-screen max-w-[1720px] gap-4 p-3 sm:p-5">
          <aside className="hidden w-[246px] shrink-0 flex-col rounded-[22px] border border-white/10 bg-white/[0.055] p-3 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.65)] backdrop-blur-xl lg:flex">
            <Link to="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
                <Flame className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-display text-sm font-semibold text-white">
                  Tales of Hyderabad
                </span>
                <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Central operations
                </span>
              </span>
            </Link>
            <div className="mx-3 my-2 h-px bg-white/10" />
            <nav aria-label="Admin navigation" className="flex-1 space-y-1 overflow-y-auto py-2">
              {navItems.map((item) => (
                <AdminNavLink key={item.label} item={item} pathname={pathname} />
              ))}
            </nav>
            <div className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.07] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                Direct orders
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                Own the menu, the order flow, and the customer relationship.
              </p>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="rounded-[20px] border border-white/10 bg-white/[0.055] px-4 py-3 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300">
                    Tales of Hyderabad <span className="px-1 text-slate-600">/</span> Admin
                  </p>
                  <h1 className="mt-1 truncate font-display text-xl font-semibold text-white sm:text-2xl">
                    {page.title}
                  </h1>
                  <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">
                    {page.description}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative hidden xl:block">
                    <span className="sr-only">Search admin workspace</span>
                    <Search
                      className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-500"
                      aria-hidden
                    />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search orders, dishes…"
                      className="w-48 rounded-xl border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-[11px] text-white outline-none placeholder:text-slate-500 focus:border-amber-300/50"
                    />
                  </label>
                  <label className="sr-only" htmlFor="admin-outlet-scope">
                    Outlet
                  </label>
                  <select
                    id="admin-outlet-scope"
                    value={outletId}
                    onChange={(event) => setOutletId(event.target.value)}
                    className="max-w-32 rounded-xl border border-white/10 bg-[#131a25] px-2.5 py-2 text-[10px] font-bold text-slate-200 outline-none focus:border-amber-300/50 sm:max-w-40 sm:px-3 sm:text-xs"
                  >
                    <option value="all">All outlets</option>
                    {store.outlets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="admin-date-range">
                    Date range
                  </label>
                  <select
                    id="admin-date-range"
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value))}
                    className="rounded-xl border border-white/10 bg-[#131a25] px-2.5 py-2 text-[10px] font-bold text-slate-200 outline-none focus:border-amber-300/50 sm:px-3 sm:text-xs"
                  >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                  </select>
                  <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 sm:flex">
                    <span className="flex size-6 items-center justify-center rounded-lg bg-amber-300/15 text-[10px] font-black text-amber-200">
                      {store.staff?.name.slice(0, 1).toUpperCase() ?? "A"}
                    </span>
                    <span className="max-w-28 truncate text-[10px] font-bold text-slate-200">
                      {store.staff?.name ?? "Admin"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    aria-label="Sign out"
                    title="Sign out"
                    className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 transition-colors hover:border-red-400/30 hover:text-red-200"
                  >
                    <LogOut className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              <nav
                aria-label="Admin navigation"
                className="mt-3 flex gap-1 overflow-x-auto border-t border-white/10 pt-3 lg:hidden"
              >
                {navItems.map((item) => (
                  <AdminNavLink key={item.label} item={item} pathname={pathname} mobile />
                ))}
              </nav>
            </header>
            <main className="min-w-0 pb-12 pt-4 sm:pt-5">{children}</main>
            <footer className="border-t border-white/10 py-4 text-center text-[10px] text-slate-500">
              Direct order operations · 5% GST included in customer prices
            </footer>
          </div>
        </div>
      </div>
    </ScopeContext.Provider>
  );
}
