import { create } from "zustand";
import type { SourceInfo } from "../../../shared/types.js";
import { API } from "../lib/api.js";
import { KEYS, lsGet, lsSet } from "../lib/storageKeys.js";

type SourcesState = {
  sources: SourceInfo[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
};

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: [],
  selectedId: lsGet(KEYS.sourceId),
  loading: false,
  error: null,
  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const list = await API.sources();
      const selected = get().selectedId && list.find((src) => src.id === get().selectedId && src.enabled)
        ? get().selectedId
        : list.find((src) => src.enabled)?.id ?? null;
      set({ sources: list, selectedId: selected, loading: false });
      if (selected) lsSet(KEYS.sourceId, selected);
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },
}));
