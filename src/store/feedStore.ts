import { create } from "zustand";

type FeedItem = any;

interface FeedState {
  feed: FeedItem[];
  setFeed: (items: FeedItem[]) => void;
  lastFetchedAt?: number;
  setLastFetchedAt: (ts: number) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  feed: [],
  setFeed: (items) => set({ feed: items }),
  lastFetchedAt: undefined,
  setLastFetchedAt: (ts) => set({ lastFetchedAt: ts }),
}));
