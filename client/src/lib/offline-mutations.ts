export type OfflineMutationKind = "driver.createInspection" | "driver.createFuelLog" | "vehicleIssues.create" | "vehicles.updateOdometer";

export type OfflineMutation = {
  id: string;
  kind: OfflineMutationKind;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
};

const STORAGE_KEY = "fleetops:offline-mutations";
const QUEUE_EVENT = "fleetops-offline-queue-changed";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readQueue(): OfflineMutation[] {
  if (!canUseStorage()) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is OfflineMutation => Boolean(item && typeof item === "object" && "kind" in item && "payload" in item && "idempotencyKey" in item)) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineMutation[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function offlineMutationQueueSize() {
  return readQueue().length;
}

export function subscribeOfflineMutationQueue(listener: () => void) {
  window.addEventListener(QUEUE_EVENT, listener);
  return () => window.removeEventListener(QUEUE_EVENT, listener);
}

export function enqueueOfflineMutation(kind: OfflineMutationKind, payload: Record<string, unknown>) {
  const queue = readQueue();
  queue.push({ id: crypto.randomUUID(), kind, payload, idempotencyKey: crypto.randomUUID(), createdAt: new Date().toISOString() });
  writeQueue(queue);
  return queue.length;
}

export function isRetryableOfflineError(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /network|fetch|timeout|load failed|failed to fetch/i.test(error.message));
}

export async function flushOfflineMutations(handlers: Partial<Record<OfflineMutationKind, (payload: Record<string, unknown>) => Promise<unknown>>>) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { flushed: 0, pending: readQueue().length };
  const queue = readQueue();
  const remaining: OfflineMutation[] = [];
  let flushed = 0;
  for (const item of queue) {
    const handler = handlers[item.kind];
    if (!handler) {
      remaining.push(item);
      continue;
    }
    try {
      await handler(item.payload);
      flushed += 1;
    } catch (error) {
      const duplicate = error instanceof Error && /already used|duplicate|conflict/i.test(error.message);
      if (!duplicate) remaining.push(item);
    }
  }
  writeQueue(remaining);
  return { flushed, pending: remaining.length };
}
