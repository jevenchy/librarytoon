import { create } from "zustand";
import { KEYS, lsGet, lsSet } from "../lib/storageKeys.js";

export type ContentRating = "sfw" | "nsfw";

type UiState = {
  readerUiVisible: boolean;
  setReaderUiVisible: (visible: boolean) => void;
  language: "id" | "en";
  setLanguage: (lang: "id" | "en") => void;
  contentRating: ContentRating;
  setContentRating: (rating: ContentRating) => void;
};

export const useUiStore = create<UiState>(set => ({
  readerUiVisible: true,
  setReaderUiVisible: visible => set({ readerUiVisible: visible }),
  language: (lsGet(KEYS.language) as "id" | "en") ?? "id",
  setLanguage: lang => {
    lsSet(KEYS.language, lang);
    set({ language: lang });
  },
  contentRating: (lsGet(KEYS.contentRating) as ContentRating) ?? "sfw",
  setContentRating: rating => {
    lsSet(KEYS.contentRating, rating);
    set({ contentRating: rating });
  },
}));
