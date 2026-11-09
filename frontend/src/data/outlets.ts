import type { Outlet } from "./types";

let currentOutlets: Outlet[] = [];

export function setCurrentOutlets(outlets: Outlet[]) {
  currentOutlets = outlets;
}

export function listOutlets(): Outlet[] {
  return currentOutlets;
}

export function getOutlet(id: string | null): Outlet | null {
  if (!id) return null;
  return currentOutlets.find((outlet) => outlet.id === id) ?? null;
}
