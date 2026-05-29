import { LRUCache } from "lru-cache";

const MAX_ENTRIES = 2000;

const stores = new Map<string, LRUCache<string, NonNullable<unknown>>>();
const inflight = new Map<string, Promise<unknown>>();

function getStore(namespace: string, ttl: number): LRUCache<string, NonNullable<unknown>> {
  const key = `${namespace}:${ttl}`;
  let store = stores.get(key);
  if (!store) {
    store = new LRUCache<string, NonNullable<unknown>>({ max: MAX_ENTRIES, ttl });
    stores.set(key, store);
  }
  return store;
}

export const cache = {
  get<T>(namespace: string, ttl: number, key: string): T | undefined {
    return getStore(namespace, ttl).get(key) as T | undefined;
  },
  set<T>(namespace: string, ttl: number, key: string, value: T): void {
    getStore(namespace, ttl).set(key, value as NonNullable<unknown>);
  },
  async wrap<T>(namespace: string, ttl: number, key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(namespace, ttl, key);
    if (hit !== undefined) return hit;

    const inflightKey = `${namespace}:${key}`;
    const pending = inflight.get(inflightKey);
    if (pending) return pending as Promise<T>;

    const promise = fn().then(value => {
      this.set(namespace, ttl, key, value);
      inflight.delete(inflightKey);
      return value;
    }).catch(err => {
      inflight.delete(inflightKey);
      throw err;
    });
    inflight.set(inflightKey, promise);
    return promise;
  },
  invalidate(namespace: string): void {
    for (const [k, store] of stores) {
      if (k.startsWith(`${namespace}:`)) store.clear();
    }
  }
};
