import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgePercent, TicketPercent } from "lucide-react";
import type { MenuItem } from "@/data/types";
import { getAvailablePromotions, type AvailablePromotions } from "@/lib/api";
import { getOutlet } from "@/data/outlets";
import { formatINR } from "@/lib/format";
import { FoodImage } from "@/components/FoodImage";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "toh-offers-dismissed-v1";

function endLabel(value: string | null) {
  if (!value) return "While stocks last";
  return `Ends ${new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

export function CustomerOfferSpotlight({
  outletId,
  menuItems,
}: {
  outletId: string;
  menuItems: MenuItem[];
}) {
  const [offers, setOffers] = useState<AvailablePromotions>({ sales: [], coupons: [] });
  const [open, setOpen] = useState(false);
  const outlet = getOutlet(outletId);

  useEffect(() => {
    let active = true;
    void getAvailablePromotions(outletId)
      .then((value) => {
        if (!active) return;
        setOffers(value);
        if (!value.sales.length && !value.coupons.length) return;
        let dismissed = false;
        try {
          const saved = window.sessionStorage.getItem(DISMISSED_KEY);
          const dismissedOutlets = saved ? (JSON.parse(saved) as string[]) : [];
          dismissed = dismissedOutlets.includes(outletId);
        } catch {
          dismissed = false;
        }
        if (!dismissed) setOpen(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [outletId]);

  const featuredSale = offers.sales[0];
  const featuredItem = menuItems.find((item) => item.id === featuredSale?.itemId);
  const bannerImage = featuredSale?.image ?? featuredItem?.image ?? menuItems[0]?.image ?? "";
  const highestSalePercent = Math.max(
    0,
    ...offers.sales.map((sale) => Math.round((1 - sale.salePrice / sale.basePrice) * 100)),
  );
  const highestCouponPercent = Math.max(
    0,
    ...offers.coupons
      .filter((coupon) => coupon.discountType === "percentage")
      .map((coupon) => coupon.discountValue),
  );
  const highestPercent = Math.max(highestSalePercent, highestCouponPercent);
  const highestFixedCoupon = offers.coupons
    .filter((coupon) => coupon.discountType === "fixed")
    .sort((a, b) => b.discountValue - a.discountValue)[0];
  const headline =
    highestPercent > 0
      ? `Up to ${highestPercent}% off`
      : highestFixedCoupon
        ? `Save ${formatINR(highestFixedCoupon.discountValue)}`
        : "A little extra joy, on us";

  const offerRows = useMemo(
    () =>
      [
        ...offers.sales.map((sale) => ({
          key: `sale-${sale.itemId}`,
          code: "OUTLET SALE",
          title: `${sale.name} at ${formatINR(sale.salePrice)}`,
          detail: `Was ${formatINR(sale.basePrice)} · save ${formatINR(sale.basePrice - sale.salePrice)} · ${endLabel(sale.endsAt)}`,
          icon: BadgePercent,
        })),
        ...offers.coupons.map((coupon) => ({
          key: `coupon-${coupon.code}`,
          code: coupon.code,
          title:
            coupon.discountType === "percentage"
              ? `${coupon.discountValue}% off${coupon.maximumDiscount ? ` up to ${formatINR(coupon.maximumDiscount)}` : ""}`
              : `${formatINR(coupon.discountValue)} off`,
          detail: `${coupon.name} · ${coupon.minimumOrder ? `Min. order ${formatINR(coupon.minimumOrder)} · ` : ""}${endLabel(coupon.endsAt)}`,
          icon: TicketPercent,
        })),
      ].slice(0, 5),
    [offers],
  );

  if (!outlet || offerRows.length === 0) return null;

  const dismiss = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      try {
        const saved = window.sessionStorage.getItem(DISMISSED_KEY);
        const dismissedOutlets = saved ? (JSON.parse(saved) as string[]) : [];
        if (!dismissedOutlets.includes(outletId))
          window.sessionStorage.setItem(
            DISMISSED_KEY,
            JSON.stringify([...dismissedOutlets, outletId]),
          );
      } catch {
        return;
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={dismiss}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto rounded-[26px] border border-white/30 bg-card p-3 shadow-[0_35px_100px_-28px_rgba(25,14,8,0.72)] sm:p-4">
        <DialogTitle className="sr-only">Limited-time offers at {outlet.name}</DialogTitle>
        <div className="relative isolate flex min-h-56 items-end overflow-hidden rounded-[20px] bg-foreground text-background sm:min-h-64">
          {bannerImage && (
            <FoodImage
              src={bannerImage}
              alt={featuredSale?.name ?? "Hyderabadi food offer"}
              className="absolute inset-0 -z-10 size-full"
            />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-foreground/95 via-foreground/75 to-foreground/20" />
          <div className="max-w-md p-5 pr-12 sm:p-7 sm:pr-16">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-accent">
              Limited offer · {outlet.name}
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">
              {headline}
            </h2>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-background/80">
              Fresh from this outlet. Browse the live sale dishes or use a code in your cart.
            </p>
          </div>
        </div>
        <div className="px-1 pb-1 pt-3 sm:px-2">
          <p className="px-1 text-[10px] font-black uppercase tracking-[0.17em] text-muted-foreground">
            Available at {outlet.name}
          </p>
          <div className="mt-2 space-y-2">
            {offerRows.map((offer) => {
              const Icon = offer.icon;
              return (
                <article
                  key={offer.key}
                  className="flex items-start gap-3 rounded-2xl border border-border/80 bg-background/70 p-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/30 text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-primary">
                      {offer.code}
                    </p>
                    <p className="mt-0.5 text-sm font-bold">{offer.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                      {offer.detail}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">
              Coupon codes can be added in your cart.
            </p>
            <DialogClose asChild>
              <Link
                to="/menu"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-black text-primary-foreground shadow-md shadow-primary/15 transition-transform hover:-translate-y-0.5 hover:bg-primary/90",
                )}
              >
                Order now <ArrowRight className="size-4" aria-hidden />
              </Link>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
