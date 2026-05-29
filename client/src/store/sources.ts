import { create } from "zustand";
import type { SourceInfo } from "../../../shared/types";
import { api } from "../lib/api";
import { KEYS } from "../lib/storageKeys";

type SourcesState = {
  sources: SourceInfo[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  downSources: Set<string>;
  load: () => Promise<void>;
  select: (id: string) => void;
  markDown: (id: string) => void;
  syncDown: (ids: string[]) => void;
};

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch {}
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: [],
  selectedId: lsGet(KEYS.sourceId),
  loading: false,
  error: null,
  downSources: new Set<string>(),
  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const [list, health] = await Promise.all([api.sources(), api.health()]);
      const selected = get().selectedId && list.find((s) => s.id === get().selectedId)
        ? get().selectedId
        : list[0]?.id ?? null;
      set({
        sources: list,
        selectedId: selected,
        loading: false,
        downSources: new Set(health.circuitOpen),
      });
      if (selected) lsSet(KEYS.sourceId, selected);
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },
  select: (id) => {
    lsSet(KEYS.sourceId, id);
    set({ selectedId: id });
  },
  markDown: (id) => set(s => ({ downSources: new Set([...s.downSources, id]) })),
  syncDown: (ids) => set({ downSources: new Set(ids) }),
}));
