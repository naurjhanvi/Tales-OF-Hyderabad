import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QtyStepperProps {
  qty: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
  variant?: "default" | "primary";
  className?: string;
}

export function QtyStepper({
  qty,
  onChange,
  min = 1,
  max = 20,
  variant = "default",
  className,
}: QtyStepperProps) {
  const primary = variant === "primary";
  return (
    <div
      aria-label={`Quantity ${qty}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border p-1 transition-colors",
        primary
          ? "gap-2 border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(qty - 1)}
        disabled={qty <= min}
        className={cn(
          "flex items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          primary
            ? "size-9 text-primary-foreground hover:bg-primary-foreground/15"
            : "size-7 text-foreground hover:bg-muted",
        )}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span
        aria-live="polite"
        className={cn(
          "text-center font-bold tabular-nums",
          primary ? "w-7 text-base" : "w-6 text-sm",
        )}
      >
        {qty}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= max}
        className={cn(
          "flex items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          primary
            ? "size-9 text-primary-foreground hover:bg-primary-foreground/15"
            : "size-7 text-foreground hover:bg-muted",
        )}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
