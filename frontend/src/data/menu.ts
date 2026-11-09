import type { AddOnOption, MenuItem } from "./types";
import chickenImg from "@/assets/chicken-dum-biryani.jpg";
import familyImg from "@/assets/family-pack-biryani.jpg";
import vegImg from "@/assets/veg-dum-biryani.jpg";
import salanImg from "@/assets/mirchi-ka-salan.jpg";
import raitaImg from "@/assets/raita.jpg";
import meethaImg from "@/assets/double-ka-meetha.jpg";
import haleemImg from "@/assets/haleem.jpg";

export const MENU_CATEGORIES = ["Biryani", "Sides", "Desserts"] as const;

export const FOOD_IMAGES: { label: string; src: string }[] = [
  { label: "Chicken dum biryani", src: chickenImg },
  { label: "Mutton dum biryani", src: familyImg },
  { label: "Veg dum biryani", src: vegImg },
  { label: "Family pack biryani", src: familyImg },
  { label: "Haleem", src: haleemImg },
  { label: "Mirchi ka salan", src: salanImg },
  { label: "Boondi raita", src: raitaImg },
  { label: "Double ka meetha", src: meethaImg },
];

const IMAGE_BY_KEY: Record<string, string> = {
  "chicken-dum-biryani.jpg": chickenImg,
  "mutton-dum-biryani.jpg": familyImg,
  "family-pack-biryani.jpg": familyImg,
  "veg-dum-biryani.jpg": vegImg,
  "mirchi-ka-salan.jpg": salanImg,
  "raita.jpg": raitaImg,
  "double-ka-meetha.jpg": meethaImg,
  "haleem.jpg": haleemImg,
};

const IMAGE_KEY_BY_URL = new Map(Object.entries(IMAGE_BY_KEY).map(([key, url]) => [url, key]));
let currentMenu: MenuItem[] = [];

export function resolveMenuImage(imageKey: string | null | undefined): string {
  if (!imageKey) return chickenImg;
  return IMAGE_BY_KEY[imageKey] ?? IMAGE_BY_KEY[imageKey.split("/").pop() ?? ""] ?? chickenImg;
}

export function menuImageKey(image: string): string {
  return IMAGE_KEY_BY_URL.get(image) ?? "chicken-dum-biryani.jpg";
}

export function setCurrentMenu(items: MenuItem[]) {
  currentMenu = items;
}

export function getMenu(): MenuItem[] {
  return currentMenu;
}

export function getItem(id: string): MenuItem | null {
  return currentMenu.find((item) => item.id === id) ?? null;
}

export function isItemAvailable(item: MenuItem, outletId: string | null): boolean {
  return Boolean(outletId && item.active !== false && item.availableAt.includes(outletId));
}

export function computeUnitPrice(item: MenuItem, portionId: string, addOnIds: string[]): number {
  const portion = item.portions.find((option) => option.id === portionId);
  const addOnTotal = item.addOns
    .filter((addon: AddOnOption) => addOnIds.includes(addon.id))
    .reduce((sum, addon) => sum + addon.price, 0);
  return (item.salePrice ?? item.basePrice) + (portion?.priceDelta ?? 0) + addOnTotal;
}
