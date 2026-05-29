import { create } from "zustand";

type UiState = {
  readerUiVisible: boolean;
  setReaderUiVisible: (v: boolean) => void;
};

export const useUiStore = create<UiState>(set => ({
  readerUiVisible: true,
  setReaderUiVisible: v => set({ readerUiVisible: v }),
}));
