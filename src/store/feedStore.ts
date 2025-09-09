// src/store/feedStore.ts
import { useSyncExternalStore } from "react";

type FeedItem = any;
type FeedState = {
  feed: FeedItem[];
  lastFetchedAt?: number;
};

const state: FeedState = { feed: [], lastFetchedAt: undefined };
const listeners = new Set<() => void>();

function emit() {
  // copy avoids issues if a listener unsubscribes during notify
  for (const l of Array.from(listeners)) l();
}

function setFeed(items: FeedItem[]) {
  if (state.feed === items) return; // skip no-op updates
  state.feed = items;
  emit();
}

function setLastFetchedAt(ts: number) {
  if (state.lastFetchedAt === ts) return; // skip no-op updates
  state.lastFetchedAt = ts;
  emit();
}

export function useFeedStore() {
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };
  const getSnapshot = () => state;
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    feed: s.feed,
    lastFetchedAt: s.lastFetchedAt,
    setFeed,
    setLastFetchedAt,
  };
}
