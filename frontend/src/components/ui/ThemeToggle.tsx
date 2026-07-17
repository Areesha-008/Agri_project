"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, getServerTheme, getTheme, subscribeTheme } from "@/lib/theme";
import { useTranslation } from "@/lib/i18n/useTranslation";

/** Manual light/dark switch. Light is the site default; useSyncExternalStore
 * reads the data-theme the <head> init script already applied (see
 * lib/theme.ts) — no effect-driven setState, no hydration mismatch. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  function toggle() {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? t("themeToggleToLight") : t("themeToggleToDark")}
      className={`jk-focus grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-[9px] border border-input-border bg-cream-card text-ink-600 transition-colors hover:bg-cream-inset ${className}`}
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="7.5" cy="7.5" r="3.2" />
          <path d="M7.5 1.2v1.6M7.5 12.2v1.6M1.2 7.5h1.6M12.2 7.5h1.6M3.3 3.3l1.1 1.1M10.6 10.6l1.1 1.1M3.3 11.7l1.1-1.1M10.6 4.4l1.1-1.1" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 8.7A5.8 5.8 0 116.3 2a4.6 4.6 0 006.7 6.7z" />
        </svg>
      )}
    </button>
  );
}
