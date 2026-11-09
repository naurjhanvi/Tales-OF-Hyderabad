import { useEffect } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminShell } from "@/components/AdminShell";
import { hydrateStore, useStore } from "@/lib/store";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin overview — Tales of Hyderabad" },
      {
        name: "description",
        content: "Monitor orders, revenue, offers, and outlet performance for Tales of Hyderabad.",
      },
    ],
  }),
  component: AdminLayoutPage,
});

function AdminLayoutPage() {
  const store = useStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    void hydrateStore();
  }, []);

  if (!store.hydrated || store.staffLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b0f17] text-sm text-slate-300">
        Checking admin access…
      </div>
    );
  if (!store.staff || store.staff.role !== "admin") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0b0f17] px-4 text-slate-100">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-7 text-center shadow-2xl backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
            Central workspace
          </p>
          <h1 className="mt-3 font-display text-2xl font-semibold">Admin sign-in required</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Use an admin account to view live menu, order and finance information.
          </p>
          <Link
            to="/login/admin"
            className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-slate-950"
          >
            Sign in to admin
          </Link>
        </section>
      </main>
    );
  }

  return <AdminShell>{pathname === "/admin" ? <AdminDashboard /> : <Outlet />}</AdminShell>;
}
