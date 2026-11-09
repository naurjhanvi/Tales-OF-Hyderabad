import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { MenuItem } from "@/data/types";
import { computeUnitPrice } from "@/data/menu";
import { addToCart } from "@/lib/store";
import { defaultPortionId, defaultSpiceId, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodImage } from "./FoodImage";
import { VegMark } from "./VegMark";

interface ItemSheetProps {
  item: MenuItem | null;
  onClose: () => void;
}

export function ItemSheet({ item, onClose }: ItemSheetProps) {
  const [portionId, setPortionId] = useState("");
  const [spiceId, setSpiceId] = useState("");
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (item) {
      setPortionId(defaultPortionId(item));
      setSpiceId(defaultSpiceId(item));
      setAddOnIds([]);
      setQty(1);
      setAdded(false);
    }
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [item, onClose]);

  if (!item) return null;

  const effectivePortionId = portionId || defaultPortionId(item);
  const unitPrice = computeUnitPrice(item, effectivePortionId, addOnIds);

  const toggleAddOn = (id: string) => {
    setAddOnIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const handleAdd = () => {
    addToCart({ item, portionId: effectivePortionId, spiceId, addOnIds, qty });
    setAdded(true);
    window.setTimeout(onClose, 450);
  };

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`Customize ${item.name}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-foreground/45 backdrop-blur-[2px]"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <div className="relative shrink-0">
          <FoodImage src={item.image} alt={item.name} className="h-40 w-full sm:h-44" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <VegMark diet={item.diet} />
                <h2 className="font-display text-xl font-semibold">{item.name}</h2>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span className="block font-display text-lg font-semibold">
                {formatINR(item.basePrice)}
              </span>
              <span className="text-[11px] text-muted-foreground">incl. 5% GST</span>
            </p>
          </div>

          {item.portions.length > 0 && (
            <section className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Portion
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.portions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={portionId === p.id}
                    onClick={() => setPortionId(p.id)}
                    className={cn(
                      "rounded-xl border px-3.5 py-2 text-left text-sm transition-colors",
                      portionId === p.id
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-accent",
                    )}
                  >
                    <span className="block font-semibold text-foreground">{p.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.detail}
                      {p.priceDelta > 0 ? ` · +${formatINR(p.priceDelta)}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {item.spiceLevels.length > 0 && (
            <section className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Spice level
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.spiceLevels.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={spiceId === s.id}
                    onClick={() => setSpiceId(s.id)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      spiceId === s.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-accent",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {item.addOns.length > 0 && (
            <section className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Add-ons
              </h3>
              <div className="mt-2 space-y-2">
                {item.addOns.map((a) => (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition-colors",
                      addOnIds.includes(a.id)
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:border-accent",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={addOnIds.includes(a.id)}
                        onChange={() => toggleAddOn(a.id)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      <span className="font-medium">{a.label}</span>
                    </span>
                    <span className="text-muted-foreground">+{formatINR(a.price)}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="mt-5 border-t border-dashed border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Allergens:</span>{" "}
              {item.allergens.join(", ")}
            </p>
            <p className="mt-0.5">Prices are inclusive of 5% GST.</p>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-4">
          <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="flex size-8 items-center justify-center rounded-full text-lg font-semibold transition-colors hover:bg-muted"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQty((q) => Math.min(10, q + 1))}
              className="flex size-8 items-center justify-center rounded-full text-lg font-semibold transition-colors hover:bg-muted"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={added}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90",
              added && "bg-veg hover:bg-veg",
            )}
          >
            {added ? (
              <>
                <Check className="size-4" aria-hidden /> Added to cart
              </>
            ) : (
              <>
                Add {qty > 1 ? `${qty} ` : ""}to cart · {formatINR(unitPrice * qty)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
