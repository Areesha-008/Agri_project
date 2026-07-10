"use client";

import { useAppStore } from "@/lib/store/useAppStore";
import { dictionary, type DictionaryKey } from "./dictionary";

export function useTranslation() {
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);

  const t = (key: DictionaryKey): string => dictionary[lang][key];

  return { t, lang, setLang, dir: lang === "ur" ? "rtl" : "ltr" } as const;
}
