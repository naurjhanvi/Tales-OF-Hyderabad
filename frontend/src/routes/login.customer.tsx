import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Flame,
  MapPin,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import heroImg from "@/assets/hero-spread.jpg";

export const Route = createFileRoute("/login/customer")({
  head: () => ({
    meta: [
      { title: "Order as a guest — Tales of Hyderabad" },
      { name: "description", content: "Start a guest order from Tales of Hyderabad." },
    ],
  }),
  component: CustomerEntryPage,
});

function CustomerEntryPage() {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <section className="relative flex min-h-[18rem] flex-col justify-between overflow-hidden bg-foreground p-5 text-background sm:min-h-[23rem] sm:p-8 lg:min-h-screen lg:p-10">
        <img
          src={heroImg}
          alt="Hyderabadi biryani with raita and salan"
          className="absolute inset-0 size-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 via-foreground/50 to-primary/45" />
        <Link
          to="/"
          className="relative z-10 inline-flex w-fit items-center gap-2 text-xs font-bold text-background/85 transition-colors hover:text-accent"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All workspaces
        </Link>
        <div className="relative z-10 mt-10 max-w-xl lg:mb-8 lg:mt-auto">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-accent">
            <Sparkles className="size-3.5" aria-hidden />A direct line to the handi
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.04] sm:text-5xl">
            Your table is ready.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-background/75 sm:text-base">
            Pick an outlet, make it yours with a few taps, and follow every step of the order.
          </p>
          <div className="mt-6 grid max-w-md grid-cols-2 gap-2 text-xs font-semibold text-background/85">
            <span className="flex items-center gap-2 rounded-xl border border-background/15 bg-background/10 p-3">
              <MapPin className="size-4 text-accent" aria-hidden />
              Nearby outlets
            </span>
            <span className="flex items-center gap-2 rounded-xl border border-background/15 bg-background/10 p-3">
              <BadgeCheck className="size-4 text-accent" aria-hidden />
              Live order updates
            </span>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <Link to="/" className="flex w-fit items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Flame className="size-5" aria-hidden />
            </span>
            <span className="font-display text-lg font-semibold">Tales of Hyderabad</span>
          </Link>
          <p className="mt-9 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            Order as a guest
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome to the table.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Order as a guest in seconds. We’ll ask for your delivery details when you’re ready to
            check out.
          </p>
          <Link
            to="/customer"
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-black text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99]"
          >
            Continue as guest
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            No account or password needed to place an order.
          </p>
          <Link
            to="/customer"
            className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline"
          >
            <ShoppingBag className="size-3.5" aria-hidden />
            Browse outlets and menu
          </Link>
        </div>
      </section>
    </main>
  );
}
