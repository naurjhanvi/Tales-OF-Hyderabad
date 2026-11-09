import type { PoolClient } from "pg";
import { pool } from "../db.js";

export interface OrderEvent {
  orderCode: string;
  outletId: string;
  status: string;
  updatedAt: string;
}

type EventListener = (event: OrderEvent) => void;
const listeners = new Map<string, Set<EventListener>>();
let databaseListener: PoolClient | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let shuttingDown = false;

function deliver(event: OrderEvent) {
  for (const key of [`order:${event.orderCode}`, `outlet:${event.outletId}`]) {
    for (const listener of listeners.get(key) ?? []) listener(event);
  }
}

async function connectListener() {
  if (shuttingDown || databaseListener) return;
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    databaseListener = client;
    client.on("notification", (notification) => {
      if (notification.channel !== "toh_order_events" || !notification.payload) return;
      try {
        deliver(JSON.parse(notification.payload) as OrderEvent);
      } catch (error) {
        console.error("Ignored malformed order event notification", error);
      }
    });
    client.on("error", (error) => {
      console.error("PostgreSQL order event listener disconnected", error);
      if (databaseListener === client) {
        databaseListener = undefined;
        client?.release(true);
        scheduleReconnect();
      }
    });
    await client.query("LISTEN toh_order_events");
  } catch (error) {
    if (databaseListener === client) databaseListener = undefined;
    if (client) client.release(true);
    console.error("Could not start PostgreSQL order event listener", error);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connectListener();
  }, 2_000);
  reconnectTimer.unref();
}

export async function startOrderEventListener() {
  shuttingDown = false;
  await connectListener();
}

export async function stopOrderEventListener() {
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  const client = databaseListener;
  databaseListener = undefined;
  if (client) {
    try {
      await client.query("UNLISTEN toh_order_events");
    } finally {
      client.release();
    }
  }
  listeners.clear();
}

export function subscribeToOrder(orderCode: string, listener: EventListener) {
  return subscribe(`order:${orderCode}`, listener);
}

export function subscribeToOutlet(outletId: string, listener: EventListener) {
  return subscribe(`outlet:${outletId}`, listener);
}

function subscribe(key: string, listener: EventListener) {
  const set = listeners.get(key) ?? new Set<EventListener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export async function publishOrderEvent(client: PoolClient, event: OrderEvent) {
  await client.query("SELECT pg_notify('toh_order_events', $1)", [JSON.stringify(event)]);
}
