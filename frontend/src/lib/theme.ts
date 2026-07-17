export type Theme = "light" | "dark";

const STORAGE_KEY = "jk-theme";
type Listener = () => void;
const listeners = new Set<Listener>();

// The <head> init script (THEME_INIT_SCRIPT, wired in layout.tsx) runs before
// this module loads and already set data-theme on <html> — read it once here
// so the client's first render matches what's actually on screen.
let currentTheme: Theme =
  typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";

export function getTheme(): Theme {
  return currentTheme;
}

// Always "light" — the true SSR/pre-hydration default. Paired with getTheme
// via useSyncExternalStore, which is specifically designed to reconcile an
// external-store snapshot that can legitimately differ from what the server
// rendered, without a hydration warning or an extra effect-driven render.
export function getServerTheme(): Theme {
  return "light";
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTheme(theme: Theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
  listeners.forEach((listener) => listener());
}

// Inlined into <head> via layout.tsx and run before hydration, so a returning
// visitor's chosen theme applies before first paint — no flash from the light
// default to their stored dark preference.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
