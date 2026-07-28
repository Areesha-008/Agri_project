import { create } from "zustand";
import type { Lang } from "@/lib/i18n/dictionary";

export type MapLayer =
  | "ndvi"
  | "ndmi"
  | "ndre"
  | "nbr2"
  | "ndwi"
  | "cci"
  | "evi"
  | "savi"
  | "satellite";

interface AppState {
  lang: Lang;
  setLang: (lang: Lang) => void;

  selectedFieldId: string | null;
  setSelectedFieldId: (id: string | null) => void;

  mapLayer: MapLayer;
  setMapLayer: (layer: MapLayer) => void;

  // The in-flight NDVI analysis job (if any), tracked here instead of in a
  // page's local state so it survives navigating to another module — the
  // job itself is a backend BackgroundTask that keeps running either way;
  // this is just what lets the UI keep watching it. One slot, not a map:
  // every caller already assumed a single tracked job at a time.
  activeJob: { fieldId: string; jobId: string } | null;
  setActiveJob: (job: { fieldId: string; jobId: string } | null) => void;

  notifOpen: boolean;
  fieldMenuOpen: boolean;
  reportOpen: boolean;
  toggleNotif: () => void;
  toggleFieldMenu: () => void;
  setReportOpen: (open: boolean) => void;
  closeDropdowns: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  lang: "en",
  setLang: (lang) => set({ lang }),

  selectedFieldId: null,
  setSelectedFieldId: (id) => set({ selectedFieldId: id }),

  mapLayer: "ndvi",
  setMapLayer: (layer) => set({ mapLayer: layer }),

  activeJob: null,
  setActiveJob: (job) => set({ activeJob: job }),

  notifOpen: false,
  fieldMenuOpen: false,
  reportOpen: false,
  toggleNotif: () => set((s) => ({ notifOpen: !s.notifOpen, fieldMenuOpen: false })),
  toggleFieldMenu: () => set((s) => ({ fieldMenuOpen: !s.fieldMenuOpen, notifOpen: false })),
  setReportOpen: (open) => set({ reportOpen: open }),
  closeDropdowns: () => set({ notifOpen: false, fieldMenuOpen: false }),
}));
