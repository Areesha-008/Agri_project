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

  notifOpen: false,
  fieldMenuOpen: false,
  reportOpen: false,
  toggleNotif: () => set((s) => ({ notifOpen: !s.notifOpen, fieldMenuOpen: false })),
  toggleFieldMenu: () => set((s) => ({ fieldMenuOpen: !s.fieldMenuOpen, notifOpen: false })),
  setReportOpen: (open) => set({ reportOpen: open }),
  closeDropdowns: () => set({ notifOpen: false, fieldMenuOpen: false }),
}));
