import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  CircleCheck,
  ListFilter,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Soup,
  Store,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { AddOnOption, Diet, MenuItem, PortionOption, SpiceOption } from "@/data/types";
import { FOOD_IMAGES, MENU_CATEGORIES } from "@/data/menu";
import { formatINR } from "@/lib/format";
import {
  deleteMenuItem,
  hydrateStore,
  newMenuItemId,
  refreshAdminMenu,
  restoreMenuItem,
  setItemAvailability,
  upsertMenuItem,
  useStore,
} from "@/lib/store";
import { FoodImage } from "@/components/FoodImage";
import { VegMark } from "@/components/VegMark";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/menu")({
  head: () => ({
    meta: [
      { title: "Menu admin — Tales of Hyderabad" },
      {
        name: "description",
        content: "Manage the live Tales of Hyderabad menu and outlet availability.",
      },
    ],
  }),
  component: AdminPage,
});

interface MenuForm {
  id: string | null;
  name: string;
  description: string;
  category: string;
  price: string;
  diet: Diet;
  image: string;
  allergens: string;
  portions: string;
  spiceLevels: string;
  addOns: string;
}

const EMPTY_FORM: MenuForm = {
  id: null,
  name: "",
  description: "",
  category: "Biryani",
  price: "",
  diet: "veg",
  image: "",
  allergens: "",
  portions: "",
  spiceLevels: "",
  addOns: "",
};

type MenuErrorKey =
  | "name"
  | "description"
  | "category"
  | "price"
  | "allergens"
  | "portions"
  | "spiceLevels"
  | "addOns";
type MenuErrors = Partial<Record<MenuErrorKey, string>>;

const inputClass =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-accent";

function FieldError({ message }: { message: string | undefined }) {
  return message ? <p className="mt-1 text-xs font-semibold text-destructive">{message}</p> : null;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "option"
  ).slice(0, 60);
}

function optionsFromForm(form: MenuForm) {
  const portions: PortionOption[] = form.portions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", delta = "0", detail = ""] = line.split("|").map((part) => part.trim());
      return { id: slug(label), label, priceDelta: Number(delta), ...(detail ? { detail } : {}) };
    });
  const spiceLevels: SpiceOption[] = form.spiceLevels
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label) => ({ id: slug(label), label }));
  const addOns: AddOnOption[] = form.addOns
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", price = "0"] = line.split("|").map((part) => part.trim());
      return { id: slug(label), label, price: Number(price) };
    });
  return { portions, spiceLevels, addOns };
}

function formFor(item: MenuItem): MenuForm {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    price: String(item.basePrice),
    diet: item.diet,
    image: item.image,
    allergens: item.allergens.join(", "),
    portions: item.portions
      .map((item) => `${item.label}|${item.priceDelta}|${item.detail ?? ""}`)
      .join("\n"),
    spiceLevels: item.spiceLevels.map((item) => item.label).join("\n"),
    addOns: item.addOns.map((item) => `${item.label}|${item.price}`).join("\n"),
  };
}

function StaffGate() {
  const { staff, staffLoading } = useStore();
  if (staffLoading)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted-foreground">
        Checking staff access…
      </div>
    );
  if (!staff)
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Admin sign-in required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the seeded admin account to manage the live menu.
        </p>
        <Link
          to="/login/admin"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  if (staff.role !== "admin")
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account is assigned to a kitchen. Sign out and use the admin account.
        </p>
        <Link
          to="/login/admin"
          className="mt-6 inline-flex rounded-full border border-border px-5 py-3 text-sm font-bold"
        >
          Switch staff account
        </Link>
      </div>
    );
  return null;
}

function MenuStat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-4 py-3.5 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums">{value}</span>
        <span className="pb-1 text-right text-[10px] leading-tight text-muted-foreground">
          {detail}
        </span>
      </div>
    </div>
  );
}

function AdminPage() {
  const store = useStore();
  const [form, setForm] = useState<MenuForm | null>(null);
  const [errors, setErrors] = useState<MenuErrors>({});
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [statusFilter, setStatusFilter] = useState<"live" | "archived" | "all">("live");
  const [outletFilter, setOutletFilter] = useState("all");

  useEffect(() => {
    void hydrateStore();
  }, []);
  useEffect(() => {
    if (store.staff?.role !== "admin") return;
    void refreshAdminMenu().catch((error) =>
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : "Menu could not be loaded.",
      }),
    );
  }, [store.staff]);

  const outlets = store.outlets;
  const items = store.menuItems;
  const categories = Array.from(
    new Set([...MENU_CATEGORIES, ...items.map((item) => item.category)]),
  );
  const activeItems = items.filter((item) => item.active !== false);
  const archivedItems = items.filter((item) => item.active === false);
  const availableItems = activeItems.filter((item) =>
    outletFilter === "all" ? item.availableAt.length > 0 : item.availableAt.includes(outletFilter),
  );
  const filteredItems = items.filter((item) => {
    const matchesCategory = categoryFilter === "All categories" || item.category === categoryFilter;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "live" ? item.active !== false : item.active === false);
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      `${item.name} ${item.description} ${item.category} ${item.allergens.join(" ")}`
        .toLowerCase()
        .includes(term);
    return matchesCategory && matchesStatus && matchesSearch;
  });

  const startAdd = () => {
    setForm({ ...EMPTY_FORM, category: categories[0] ?? "Biryani" });
    setErrors({});
    setBanner(null);
  };
  const startEdit = (item: MenuItem) => {
    setForm(formFor(item));
    setErrors({});
    setBanner(null);
  };

  const saveItem = async () => {
    if (!form) return;
    const name = form.name.trim();
    const description = form.description.trim();
    const price = Number(form.price);
    const optionSets = optionsFromForm(form);
    const nextErrors: MenuErrors = {};
    if (name.length < 2 || name.length > 100)
      nextErrors.name = "Enter a name between 2 and 100 characters.";
    if (description.length < 5 || description.length > 500)
      nextErrors.description = "Enter a description between 5 and 500 characters.";
    if (form.category.trim().length < 2 || form.category.trim().length > 50)
      nextErrors.category = "Category must be between 2 and 50 characters.";
    if (!Number.isFinite(price) || price <= 0 || price > 100_000)
      nextErrors.price = "Enter a price from ₹1 to ₹100,000.";
    if (
      optionSets.portions.some(
        (item) => !item.label || !Number.isFinite(item.priceDelta) || item.priceDelta < 0,
      )
    )
      nextErrors.portions = "Use one portion per line: name | extra price | serving detail.";
    if (optionSets.spiceLevels.some((item) => !item.label))
      nextErrors.spiceLevels = "Enter one spice level per line.";
    if (
      optionSets.addOns.some(
        (item) => !item.label || !Number.isFinite(item.price) || item.price < 0,
      )
    )
      nextErrors.addOns = "Use one add-on per line: name | price.";
    if (
      optionSets.portions.length > 20 ||
      new Set(optionSets.portions.map((item) => item.id)).size !== optionSets.portions.length
    )
      nextErrors.portions = "Use up to 20 portions with unique names.";
    if (
      optionSets.spiceLevels.length > 20 ||
      new Set(optionSets.spiceLevels.map((item) => item.id)).size !== optionSets.spiceLevels.length
    )
      nextErrors.spiceLevels = "Use up to 20 spice levels with unique names.";
    if (
      optionSets.addOns.length > 30 ||
      new Set(optionSets.addOns.map((item) => item.id)).size !== optionSets.addOns.length
    )
      nextErrors.addOns = "Use up to 30 add-ons with unique names.";
    if (
      form.allergens
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean).length > 20
    )
      nextErrors.allergens = "Use up to 20 allergen labels.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setBanner({ kind: "error", text: "Please fix the highlighted fields." });
      return;
    }

    setBusy(true);
    setBanner(null);
    try {
      const existing = form.id ? items.find((item) => item.id === form.id) : undefined;
      await upsertMenuItem({
        id: existing?.id ?? newMenuItemId(name),
        name,
        description,
        category: form.category,
        basePrice: Math.round(price),
        diet: form.diet,
        image: form.image || FOOD_IMAGES[0]?.src || "",
        allergens: form.allergens
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        availableAt: existing?.availableAt ?? outlets.map((outlet) => outlet.id),
        portions: optionSets.portions,
        spiceLevels: optionSets.spiceLevels,
        addOns: optionSets.addOns,
        active: existing?.active ?? true,
      });
      setBanner({
        kind: "success",
        text: `${name} ${existing ? "updated" : "added to the live menu"}.`,
      });
      setForm(null);
      setErrors({});
    } catch (error) {
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : "The menu item could not be saved.",
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailability = async (item: MenuItem, outletId: string) => {
    setBusyItem(`${item.id}:${outletId}`);
    try {
      await setItemAvailability(item.id, outletId, !item.availableAt.includes(outletId));
      setBanner({ kind: "success", text: `Availability updated for ${item.name}.` });
    } catch (error) {
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : "Availability could not be updated.",
      });
    } finally {
      setBusyItem(null);
    }
  };

  const archive = async (item: MenuItem) => {
    setBusyItem(item.id);
    try {
      await deleteMenuItem(item.id);
      setBanner({ kind: "success", text: `${item.name} archived. You can restore it later.` });
    } catch (error) {
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : "The item could not be archived.",
      });
    } finally {
      setBusyItem(null);
      setConfirmArchiveId(null);
    }
  };

  const restore = async (item: MenuItem) => {
    setBusyItem(item.id);
    try {
      await restoreMenuItem(item.id);
      setBanner({ kind: "success", text: `${item.name} is back on the customer menu.` });
    } catch (error) {
      setBanner({
        kind: "error",
        text: error instanceof Error ? error.message : "The item could not be restored.",
      });
    } finally {
      setBusyItem(null);
    }
  };

  if (!store.hydrated || store.staffLoading)
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted-foreground">
        Loading menu admin…
      </div>
    );
  if (!store.staff || store.staff.role !== "admin") return <StaffGate />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
      <header className="relative overflow-hidden rounded-[1.75rem] bg-foreground p-5 text-background sm:p-7">
        <div className="pointer-events-none absolute -right-8 -top-24 size-72 rounded-full border border-background/10" />
        <div className="pointer-events-none absolute -right-1 -top-16 size-56 rounded-full border border-background/10" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent">
              Central menu · live workspace
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              One menu. Every outlet.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-background/65">
              Keep the dishes, prices, and kitchen availability your customers see in sync.
            </p>
          </div>
          {!form && (
            <button
              type="button"
              onClick={startAdd}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-black text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" aria-hidden />
              Add menu item
            </button>
          )}
        </div>
      </header>

      <section
        aria-label="Menu summary"
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
      >
        <MenuStat label="Live items" value={activeItems.length} detail="on the customer menu" />
        <MenuStat label="Categories" value={categories.length} detail="across the catalog" />
        <MenuStat
          label="Available"
          value={availableItems.length}
          detail={
            outletFilter === "all"
              ? "at one or more outlets"
              : `at ${outlets.find((outlet) => outlet.id === outletFilter)?.name ?? "selected outlet"}`
          }
        />
        <MenuStat label="Archived" value={archivedItems.length} detail="can be restored anytime" />
      </section>

      {banner && (
        <div
          aria-live="polite"
          className={cn(
            "mt-5 flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold",
            banner.kind === "success"
              ? "border-veg/40 bg-veg/10 text-foreground"
              : "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          {banner.kind === "success" ? (
            <CircleCheck className="size-4 shrink-0 text-veg" aria-hidden />
          ) : (
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
          )}
          {banner.text}
        </div>
      )}
      {store.catalogError && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {store.catalogError}
        </p>
      )}

      {!form && (
        <section
          aria-label="Menu filters"
          className="mt-5 rounded-2xl border border-border bg-card p-3.5 shadow-sm sm:p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search menu items</span>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by dish, category, or allergen…"
                className="w-full rounded-full border border-input bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </label>
            <label className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2">
              <Store className="size-3.5 text-primary" aria-hidden />
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Availability view
              </span>
              <select
                value={outletFilter}
                onChange={(event) => setOutletFilter(event.target.value)}
                className="max-w-36 bg-transparent text-xs font-bold outline-none"
              >
                <option value="all">All outlets</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1.5 overflow-x-auto" aria-label="Filter menu status">
              {(["live", "archived", "all"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors",
                    statusFilter === status
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {status === "live"
                    ? `Live · ${activeItems.length}`
                    : status === "archived"
                      ? `Archived · ${archivedItems.length}`
                      : "All items"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto sm:justify-end">
              <ListFilter className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {["All categories", ...categories].map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={categoryFilter === category}
                  onClick={() => setCategoryFilter(category)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                    categoryFilter === category
                      ? "border-accent bg-accent/35 text-foreground"
                      : "border-border text-muted-foreground hover:border-accent",
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {form && (
        <section
          aria-labelledby="item-form-title"
          className="mt-6 rounded-2xl border border-border bg-card p-5"
        >
          <h2 id="item-form-title" className="font-display text-lg font-semibold">
            {form.id ? `Edit “${form.name || "item"}”` : "Add a menu item"}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ad-name"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Name
              </label>
              <input
                id="ad-name"
                className={inputClass}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Chicken 65 Biryani"
              />
              <FieldError message={errors.name} />
            </div>
            <div>
              <label
                htmlFor="ad-category"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Category
              </label>
              <input
                id="ad-category"
                className={inputClass}
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                list="menu-categories"
              />
              <datalist id="menu-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <FieldError message={errors.category} />
            </div>
            <div>
              <label
                htmlFor="ad-price"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Price (₹, incl. 5% GST)
              </label>
              <input
                id="ad-price"
                className={inputClass}
                value={form.price}
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value.replace(/[^\d]/g, "") })
                }
                placeholder="329"
                inputMode="numeric"
              />
              <FieldError message={errors.price} />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Food label
              </p>
              <div className="flex gap-2">
                {(["veg", "nonveg"] as Diet[]).map((diet) => (
                  <button
                    key={diet}
                    type="button"
                    aria-pressed={form.diet === diet}
                    onClick={() => setForm({ ...form, diet })}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold",
                      form.diet === diet
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-accent",
                    )}
                  >
                    <VegMark diet={diet} />
                    {diet === "veg" ? "Veg" : "Non-veg"}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="ad-description"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Description
              </label>
              <textarea
                id="ad-description"
                rows={2}
                className={cn(inputClass, "resize-none")}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Slow-cooked with saffron, served with salan and raita."
              />
              <FieldError message={errors.description} />
            </div>
            <div>
              <label
                htmlFor="ad-allergens"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Allergens
              </label>
              <input
                id="ad-allergens"
                className={inputClass}
                value={form.allergens}
                onChange={(event) => setForm({ ...form, allergens: event.target.value })}
                placeholder="Dairy, Nuts"
              />
              <FieldError message={errors.allergens} />
            </div>
            <div>
              <label
                htmlFor="ad-portions"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Portions
              </label>
              <textarea
                id="ad-portions"
                rows={3}
                className={cn(inputClass, "resize-y")}
                value={form.portions}
                onChange={(event) => setForm({ ...form, portions: event.target.value })}
                placeholder={"Single | 0 | Serves 1\nDouble | 290 | Serves 2"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One per line: name | extra price | serving detail
              </p>
              <FieldError message={errors.portions} />
            </div>
            <div>
              <label
                htmlFor="ad-spices"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Spice levels
              </label>
              <textarea
                id="ad-spices"
                rows={3}
                className={cn(inputClass, "resize-y")}
                value={form.spiceLevels}
                onChange={(event) => setForm({ ...form, spiceLevels: event.target.value })}
                placeholder={"Mild\nMedium\nHyderabadi hot"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One option per line. Leave blank when not applicable.
              </p>
              <FieldError message={errors.spiceLevels} />
            </div>
            <div>
              <label
                htmlFor="ad-addons"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                Add-ons
              </label>
              <textarea
                id="ad-addons"
                rows={3}
                className={cn(inputClass, "resize-y")}
                value={form.addOns}
                onChange={(event) => setForm({ ...form, addOns: event.target.value })}
                placeholder={"Extra salan | 45\nBoiled egg | 35"}
              />
              <p className="mt-1 text-xs text-muted-foreground">One per line: name | price</p>
              <FieldError message={errors.addOns} />
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Photo <span className="font-normal normal-case">(choose a bundled food photo)</span>
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-9">
                <button
                  type="button"
                  aria-pressed={form.image === ""}
                  title="Default photo"
                  onClick={() => setForm({ ...form, image: "" })}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl border",
                    form.image === ""
                      ? "border-accent ring-1 ring-accent"
                      : "border-border hover:border-accent",
                  )}
                >
                  <Soup className="size-5 text-muted-foreground" aria-hidden />
                </button>
                {FOOD_IMAGES.map((photo, index) => (
                  <button
                    key={`${photo.label}-${index}`}
                    type="button"
                    aria-pressed={form.image === photo.src}
                    title={photo.label}
                    onClick={() => setForm({ ...form, image: photo.src })}
                    className={cn(
                      "aspect-square overflow-hidden rounded-xl border",
                      form.image === photo.src
                        ? "border-accent ring-1 ring-accent"
                        : "border-border hover:border-accent",
                    )}
                  >
                    <FoodImage src={photo.src} alt={photo.label} className="h-full w-full" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setErrors({});
              }}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveItem()}
              disabled={busy}
              className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Saving…" : form.id ? "Save changes" : "Add item"}
            </button>
          </div>
        </section>
      )}

      {categories
        .filter((category) => filteredItems.some((item) => item.category === category))
        .map((category) => {
          const group = filteredItems.filter((item) => item.category === category);
          if (group.length === 0) return null;
          return (
            <section key={category} className="mt-8">
              <h2 className="font-display text-xl font-semibold">{category}</h2>
              <ul className="mt-3 space-y-3">
                {group.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start",
                      item.active === false && "opacity-70",
                    )}
                  >
                    <FoodImage
                      src={item.image}
                      alt={item.name}
                      className="size-16 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <VegMark diet={item.diet} />
                        <h3 className="font-semibold">{item.name}</h3>
                        <span className="text-sm font-bold tabular-nums">
                          {formatINR(item.salePrice ?? item.basePrice)}
                        </span>
                        {item.salePrice !== undefined && (
                          <>
                            <span className="text-xs tabular-nums text-muted-foreground line-through">
                              {formatINR(item.basePrice)}
                            </span>
                            <span className="rounded-full bg-accent/45 px-2 py-0.5 text-[10px] font-black uppercase text-accent-foreground">
                              On sale
                            </span>
                          </>
                        )}
                        {item.active === false && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                      {item.active !== false && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            Available at
                          </span>
                          {outlets.map((outlet) => {
                            const available = item.availableAt.includes(outlet.id);
                            return (
                              <button
                                key={outlet.id}
                                type="button"
                                aria-pressed={available}
                                disabled={busyItem === `${item.id}:${outlet.id}`}
                                onClick={() => void toggleAvailability(item, outlet.id)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-50",
                                  available
                                    ? "border-veg bg-veg text-veg-foreground"
                                    : "border-border text-muted-foreground hover:border-accent",
                                )}
                              >
                                {available && <Check className="size-3" aria-hidden />}
                                {outlet.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {confirmArchiveId === item.id ? (
                        <>
                          <button
                            type="button"
                            disabled={busyItem === item.id}
                            onClick={() => void archive(item)}
                            className="rounded-full bg-destructive px-3.5 py-2 text-xs font-bold text-destructive-foreground disabled:opacity-50"
                          >
                            Confirm archive
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveId(null)}
                            className="rounded-full border border-border px-3.5 py-2 text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </>
                      ) : item.active === false ? (
                        <button
                          type="button"
                          disabled={busyItem === item.id}
                          onClick={() => void restore(item)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-veg/50 px-3.5 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                        >
                          <RotateCcw className="size-3.5" aria-hidden />
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-semibold hover:border-accent"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveId(item.id)}
                            aria-label={`Archive ${item.name}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3.5 py-2 text-xs font-semibold text-destructive"
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

      {!store.catalogLoading && filteredItems.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold">No items match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another search or reset the menu filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("All categories");
              setStatusFilter("all");
            }}
            className="mt-3 text-sm font-bold text-primary"
          >
            Reset filters
          </button>
        </div>
      )}

      {confirmArchiveId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <div>
                <h3 id="archive-title" className="font-display text-lg font-semibold">
                  Archive this menu item?
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  It will disappear from customer menus. You can restore it here later.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchiveId(null)}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const item = items.find((entry) => entry.id === confirmArchiveId);
                  if (item) void archive(item);
                }}
                className="rounded-full bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground"
              >
                Archive item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
