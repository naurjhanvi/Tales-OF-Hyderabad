import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ChefHat,
  Eye,
  EyeOff,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import heroImg from "@/assets/hero-spread.jpg";
import { hydrateStore, signIn, signOut, useStore } from "@/lib/store";

type StaffRole = "admin" | "kitchen";

const inputClass =
  "w-full rounded-xl border border-input bg-background py-3 pl-10 pr-3.5 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15";

const roleCopy = {
  kitchen: {
    label: "Kitchen team",
    title: "Keep every handi moving.",
    description:
      "Your outlet’s orders, prep timers, and handoff queue are waiting in one clear live board.",
    icon: ChefHat,
    button: "Open kitchen display",
    destination: "/kitchen" as const,
    emailLabel: "Kitchen work email",
  },
  admin: {
    label: "Central menu admin",
    title: "One menu, across the city.",
    description:
      "Manage dishes, prices, and outlet availability for every Tales of Hyderabad kitchen.",
    icon: LayoutDashboard,
    button: "Open menu admin",
    destination: "/admin" as const,
    emailLabel: "Admin work email",
  },
};

export function StaffRoleLogin({ role }: { role: StaffRole }) {
  const store = useStore();
  const navigate = useNavigate();
  const copy = roleCopy[role];
  const Icon = copy.icon;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void hydrateStore();
  }, []);
  useEffect(() => {
    if (store.staff?.role === role) void navigate({ to: copy.destination, replace: true });
  }, [store.staff, role, copy.destination, navigate]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const staff = await signIn(email.trim(), password);
      if (staff.role !== role) {
        signOut();
        setError(
          `That account is for the ${staff.role === "admin" ? "menu admin" : "kitchen"} workspace. Use the matching sign-in page.`,
        );
        return;
      }
      void navigate({ to: copy.destination, replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Sign-in failed. Check your account details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative flex min-h-[18rem] flex-col justify-between overflow-hidden bg-foreground p-5 text-background sm:min-h-[23rem] sm:p-8 lg:min-h-screen lg:p-10">
        <img
          src={heroImg}
          alt="Hyderabadi biryani and traditional accompaniments"
          className="absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/90 via-foreground/65 to-primary/35" />
        <Link
          to="/"
          className="relative z-10 inline-flex w-fit items-center gap-2 text-xs font-bold text-background/85 transition-colors hover:text-accent"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All workspaces
        </Link>
        <div className="relative z-10 mt-10 max-w-xl lg:mb-10 lg:mt-auto">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-accent">
            <Sparkles className="size-3.5" aria-hidden />
            Tales of Hyderabad · {copy.label}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-background/75 sm:text-base">
            {copy.description}
          </p>
          <div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-background/20 bg-background/10 p-4 backdrop-blur-sm">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-bold">
                {role === "kitchen" ? "Live outlet operations" : "Central menu control"}
              </span>
              <span className="mt-0.5 block text-xs text-background/70">
                Secure access for your team
              </span>
            </span>
          </div>
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            {copy.label} sign in
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Sign in with your assigned account to continue to the{" "}
            {role === "kitchen" ? "kitchen display" : "menu admin"}.
          </p>

          {store.staff && store.staff.role !== role ? (
            <div className="mt-7 rounded-2xl border border-accent/70 bg-secondary/55 p-4">
              <p className="text-sm font-bold">You’re signed in to a different workspace.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Sign out of the current {store.staff.role === "admin" ? "menu admin" : "kitchen"}{" "}
                account before switching.
              </p>
              <button
                type="button"
                onClick={signOut}
                className="mt-3 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold"
              >
                Sign out and switch
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
              <div>
                <label
                  htmlFor={`${role}-email`}
                  className="mb-1.5 block text-xs font-bold text-foreground"
                >
                  {copy.emailLabel}
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    id={`${role}-email`}
                    type="email"
                    autoComplete="username"
                    required
                    className={inputClass}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your work email"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor={`${role}-password`}
                  className="mb-1.5 block text-xs font-bold text-foreground"
                >
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    id={`${role}-password`}
                    type={passwordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className={`${inputClass} pr-12`}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    aria-label={passwordVisible ? "Hide password" : "Show password"}
                    aria-pressed={passwordVisible}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {passwordVisible ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || Boolean(store.staff)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-black text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? "Checking your access…" : copy.button}
                {!submitting && <ArrowRight className="size-4" aria-hidden />}
              </button>
            </form>
          )}

          <div className="mt-5 rounded-2xl bg-secondary/65 p-4">
            <p className="text-xs font-bold text-foreground">Role-based access</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Use your assigned team credentials. Access is limited to your role and outlet.
            </p>
          </div>
          {store.apiStatus === "offline" && (
            <p
              role="status"
              className="mt-3 rounded-xl bg-destructive/5 p-3 text-xs text-destructive"
            >
              The API is offline. Start the backend before signing in.
            </p>
          )}
          <div className="mt-6 border-t border-border pt-4 text-center">
            <Link to="/" className="text-xs font-bold text-primary hover:underline">
              Choose a different workspace
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
