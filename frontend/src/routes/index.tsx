import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChefHat,
  Flame,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import heroImg from "@/assets/hero-spread.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Welcome — Tales of Hyderabad" },
      {
        name: "description",
        content:
          "Choose your Tales of Hyderabad workspace: order food, manage a kitchen, or update the menu.",
      },
    ],
  }),
  component: WelcomePage,
});

const workspaces = [
  {
    to: "/login/customer" as const,
    label: "Order food",
    detail:
      "Find your nearest outlet, explore the menu, and follow your order from the handi to your door.",
    action: "Continue to ordering",
    icon: UtensilsCrossed,
    tag: "For diners",
  },
  {
    to: "/login/kitchen" as const,
    label: "Kitchen display",
    detail: "See incoming tickets, keep prep moving, and hand completed orders to the rider.",
    action: "Kitchen team sign in",
    icon: ChefHat,
    tag: "For outlet teams",
  },
  {
    to: "/login/admin" as const,
    label: "Menu admin",
    detail: "Update dishes, prices, and outlet availability from one central workspace.",
    action: "Admin sign in",
    icon: LayoutDashboard,
    tag: "For central team",
  },
];

function WelcomePage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Tales of Hyderabad home">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Flame className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-display text-base font-semibold leading-none sm:text-lg">
              Tales of Hyderabad
            </span>
            <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Dum biryani · Hyderabad
            </span>
          </span>
        </Link>
        <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground sm:inline-flex">
          <MapPin className="size-3.5 text-primary" aria-hidden />
          Serving Hyderabad
        </span>
      </header>
      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-12 pt-3 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-12 lg:pb-20 lg:pt-8">
        <div className="relative min-h-[22rem] overflow-hidden rounded-[2rem] bg-foreground text-background sm:min-h-[29rem]">
          <img
            src={heroImg}
            alt="A Hyderabadi biryani spread with traditional accompaniments"
            className="absolute inset-0 size-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/95 via-foreground/45 to-foreground/10" />
          <div className="relative flex min-h-[22rem] flex-col justify-end p-6 sm:min-h-[29rem] sm:p-9">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-background/25 bg-background/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-background/90 backdrop-blur">
              <Sparkles className="size-3.5 text-accent" aria-hidden />A little Hyderabad, wherever
              you are
            </span>
            <h1 className="mt-4 max-w-lg font-display text-4xl font-semibold leading-[1.03] sm:text-6xl">
              Good things take time. Dum biryani is worth it.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-background/75 sm:text-base">
              One table for guests, one clear screen for every kitchen, and one menu kept in step
              across the city.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-semibold text-background/80">
              <span className="rounded-full bg-background/10 px-3 py-2">Slow dum-cooked</span>
              <span className="rounded-full bg-background/10 px-3 py-2">Made for Hyderabad</span>
              <span className="rounded-full bg-background/10 px-3 py-2">Orders tracked live</span>
            </div>
          </div>
        </div>
        <div className="py-1 lg:py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.23em] text-primary">
            Welcome to Tales of Hyderabad
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Where would you like to go?
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Choose the right doorway and we’ll take you straight to your part of the experience.
          </p>
          <div className="mt-6 grid gap-3">
            {workspaces.map((workspace) => {
              const Icon = workspace.icon;
              return (
                <Link
                  key={workspace.label}
                  to={workspace.to}
                  className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md sm:p-5"
                >
                  <span className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-display text-lg font-semibold">
                          {workspace.label}
                        </span>
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-secondary-foreground">
                          {workspace.tag}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground sm:text-sm">
                        {workspace.detail}
                      </span>
                      <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-primary">
                        {workspace.action}
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-1"
                          aria-hidden
                        />
                      </span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-veg" aria-hidden />
              Secure staff sign-in
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 text-primary" aria-hidden />
              Three kitchens across Hyderabad
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
