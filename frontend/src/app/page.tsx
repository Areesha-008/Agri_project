"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { LandingFieldAnalyzer } from "@/components/map/LandingFieldAnalyzer";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAP_TILES_KEY ?? "";
const FIELDS_TILE_IMAGE = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/73.20,31.35,15,0/640x480@2x?access_token=${MAPBOX_TOKEN}`;

function LangToggle() {
  const { lang, setLang } = useTranslation();
  return (
    <div className="flex overflow-hidden rounded-lg border border-input-border text-[11.5px] font-semibold">
      <button
        onClick={() => setLang("en")}
        className={`jk-focus px-2.5 py-1.5 ${lang === "en" ? "bg-forest-900 text-white" : "text-ink-500"}`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("ur")}
        className={`jk-focus px-2.5 py-1.5 ${lang === "ur" ? "bg-forest-900 text-white" : "text-ink-500"}`}
      >
        اردو
      </button>
    </div>
  );
}

/** Counts the leading number in `value` up from 0 once the stat scrolls into view; keeps any unit/prefix text intact. */
function useCountUpText(value: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(value.replace(/-?\d+(\.\d+)?/, "0"));

  useEffect(() => {
    const match = value.match(/-?\d+(\.\d+)?/);
    const el = ref.current;
    if (!match || !el) {
      const raf = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(raf);
    }
    const target = parseFloat(match[0]);
    const [prefix, suffix] = [value.slice(0, match.index), value.slice((match.index ?? 0) + match[0].length)];
    const decimals = match[0].includes(".") ? match[0].split(".")[1].length : 0;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          const start = performance.now();
          const duration = 900;
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(`${prefix}${(target * eased).toFixed(decimals)}${suffix}`);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return { ref, display };
}

function StatCounter({ value, label }: { value: string; label: string }) {
  const { ref, display } = useCountUpText(value);
  return (
    <div ref={ref}>
      <div className="text-xl font-extrabold tabular-nums text-forest-900">{display}</div>
      <div className="text-[11.5px] text-ink-400">{label}</div>
    </div>
  );
}

/** Toggles `true` once the page has scrolled past `threshold`px, passive + rAF-throttled. */
function useScrolledPast(threshold: number) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > threshold);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/** Tracks scroll progress through the full document height as a 0-100 percentage. */
function useScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Cache document height instead of reading scrollHeight/clientHeight on every scroll
    // tick — those are layout reads and, interleaved with the same-frame style writes from
    // useParallax/useScrolledPast, force a synchronous reflow on every frame of a scroll.
    let max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const onResize = () => {
      max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    };
    window.addEventListener("resize", onResize);

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
        barRef.current?.style.setProperty("width", `${pct}%`);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return barRef;
}

/** Writes cursor position as `--mx`/`--my` percentages for a CSS-driven sheen; skipped on touch. */
function useCursorGlow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, []);
  return ref;
}

/** Bento card wrapper: adds a low-opacity radial-gradient sheen that follows the cursor on hover. */
function CardSheen({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useCursorGlow<HTMLDivElement>();
  return (
    <div ref={ref} className={`jk-card-sheen relative overflow-hidden ${className}`}>
      {children}
      <div className="jk-card-sheen-layer pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300" />
    </div>
  );
}

const NAV_LINK_CLASS =
  "jk-focus group relative py-1 after:absolute after:-bottom-0.5 after:left-1/2 after:h-[2px] after:w-full after:origin-center after:-translate-x-1/2 after:scale-x-0 after:rounded-full after:bg-forest-500 after:transition-transform after:duration-300 hover:after:scale-x-100";

/** Soft-crossfades same-page anchor jumps via the View Transitions API when available; plain jump otherwise. */
function handleAnchorNav(e: React.MouseEvent<HTMLAnchorElement>) {
  const href = e.currentTarget.getAttribute("href");
  if (!href?.startsWith("#")) return;
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();

  const jump = () => {
    target.scrollIntoView({ behavior: "auto", block: "start" });
    history.pushState(null, "", href);
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion && "startViewTransition" in document) {
    document.startViewTransition(jump);
  } else {
    jump();
  }
}

/**
 * Owns the scroll-driven nav height/progress-bar state. Kept as its own component so the
 * `navShrunk` state flip on scroll only re-renders this ~30-line subtree, not the whole
 * landing page (bento grid, hero map, etc.) on every threshold crossing.
 */
function Nav({ t }: { t: (key: DictionaryKey) => string }) {
  const navShrunk = useScrolledPast(40);
  const progressBarRef = useScrollProgress();

  return (
    <div
      className={`sticky top-0 z-50 border-b border-border bg-cream-bg/92 backdrop-blur-sm transition-shadow duration-300 ${
        navShrunk ? "shadow-[0_2px_14px_rgba(27,67,50,.1)]" : "shadow-none"
      }`}
    >
      {/*
        Height stays fixed (h-16) at all times. Shrinking the box itself via a `height`
        transition reflows every element below the sticky nav on each animation frame —
        a visible content "jump" on top of the user's own scroll, which reads as glitching.
        The shrink is simulated with a `transform: scale` on the logo group instead:
        compositor-only, so the row's layout box — and everything below it — never moves.
      */}
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-6">
        <a href="#top" className="jk-focus flex items-center gap-2.5">
          <div
            className={`flex origin-left items-center gap-2.5 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.3,1)] ${
              navShrunk ? "scale-[0.86]" : "scale-100"
            }`}
          >
            <Logo size={34} />
            <div>
              <div className="text-sm font-extrabold tracking-tight text-forest-900">Jadeed Kashtkar</div>
              <div className="text-[10.5px] leading-[1.6] text-ink-500" lang="ur">
                جدید کاشتکار
              </div>
            </div>
          </div>
        </a>
        <div className="flex-1" />
        <div className="hidden items-center gap-5.5 text-[13px] font-semibold text-ink-600 sm:flex">
          <a href="#how" onClick={handleAnchorNav} className={NAV_LINK_CLASS}>{t("landingNavHow")}</a>
          <a href="#features" onClick={handleAnchorNav} className={NAV_LINK_CLASS}>{t("landingNavFeatures")}</a>
          <a href="#mission" onClick={handleAnchorNav} className={NAV_LINK_CLASS}>{t("landingNavMission")}</a>
        </div>
        <LangToggle />
        <Link href="/login" className="jk-focus hidden text-[13px] font-semibold text-forest-900 sm:inline">
          {t("signIn")}
        </Link>
        <Link
          href="/signup"
          className="jk-focus rounded-[10px] bg-forest-900 px-4.5 py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(27,67,50,.25)] transition-transform hover:bg-forest-700 active:scale-[0.97]"
        >
          {t("createAccount")}
        </Link>
      </div>
      <div className="h-[2px] w-full bg-transparent">
        <div ref={progressBarRef} className="h-full w-0 bg-mint-300" />
      </div>
    </div>
  );
}

/** Bento card B: owns its own NDVI/NDMI toggle state so clicking it doesn't re-render the whole page. */
function NdviCard() {
  const [bentoLayer, setBentoLayer] = useState<"ndvi" | "ndmi">("ndvi");
  return (
    <CardSheen className="flex h-full flex-col gap-3.5 rounded-card-lg border border-border bg-cream-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
      <div className="flex gap-1.5 text-[10.5px] font-semibold">
        <button
          onClick={() => setBentoLayer("ndvi")}
          className={`jk-focus rounded-md px-2.5 py-1.5 transition-colors ${
            bentoLayer === "ndvi" ? "bg-forest-900 text-white" : "bg-cream-inset text-ink-500"
          }`}
        >
          NDVI
        </button>
        <button
          onClick={() => setBentoLayer("ndmi")}
          className={`jk-focus rounded-md px-2.5 py-1.5 transition-colors ${
            bentoLayer === "ndmi" ? "bg-forest-900 text-white" : "bg-cream-inset text-ink-500"
          }`}
        >
          NDMI
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-xl">
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: "linear-gradient(135deg,#006837 0%,#31a354 28%,#78c679 55%,#c2e699 78%,#ffffcc 100%)",
            opacity: bentoLayer === "ndvi" ? 1 : 0,
          }}
        >
          <div className="absolute bottom-2.5 left-2.5 rounded-md bg-[#141c16cc] px-2.5 py-1 text-[9.5px] text-white">
            vegetation density
          </div>
        </div>
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: "linear-gradient(135deg,#253494,#2c7fb8 40%,#41b6c4 65%,#a1dab4 85%,#ffffcc)",
            opacity: bentoLayer === "ndmi" ? 1 : 0,
          }}
        >
          <div className="absolute bottom-2 left-2.5 rounded-md bg-[#141c16cc] px-2.5 py-1 text-[9.5px] text-white">
            water stress
          </div>
        </div>
      </div>
      <div>
        <div className="text-[14.5px] font-bold text-ink-900">NDVI & NDMI overlays</div>
        <div className="mt-0.5 text-xs text-ink-500">Irrigate only where the crop is thirsty.</div>
      </div>
    </CardSheen>
  );
}

export default function LandingPage() {
  const { t, dir, lang } = useTranslation();

  const STEPS = [
    {
      title: "Draw your field",
      body: "Trace your boundary on the satellite map. No account needed for your first analysis. We validate the polygon and compute the exact area.",
      path: "M2.5 12.5l1-3.2 7-7 2.2 2.2-7 7-3.2 1z M9 3.5l2.2 2.2",
    },
    {
      title: "The satellite reads your crop",
      body: "Cloud-free Sentinel-2 scenes are processed into NDVI and moisture maps within minutes, with per-field statistics saved to your history.",
      path: "M7.5 7.5m-1.3 0a1.3 1.3 0 102.6 0 1.3 1.3 0 10-2.6 0 M4.6 4.6a4.1 4.1 0 000 5.8 M10.4 4.6a4.1 4.1 0 010 5.8 M2.3 2.3a7.3 7.3 0 000 10.4 M12.7 2.3a7.3 7.3 0 010 10.4",
    },
    {
      title: "Act with confidence",
      body: "Irrigate the stressed patch, treat the rust early, sell on the up-day and keep a ledger record of everything you did.",
      path: "M3 8l3 3 6-7",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col" dir={dir}>
      {/* Nav */}
      <Nav t={t} />

      {/* Hero */}
      <div id="top" className="jk-contours relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(149,213,178,.35), transparent 70%)" }}
        />
        <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-11 px-6 pb-14 pt-16 md:grid-cols-[1.05fr_1fr]">
          <div className="jk-hero-in flex flex-col gap-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-mint-border bg-mint-100 px-3.5 py-1.5 text-xs font-semibold text-forest-700">
              <span className="jk-ring-pulse jk-ring-pulse-mint h-1.5 w-1.5 rounded-full bg-forest-500" />
              {t("landingBadge")}
            </div>
            <h1
              className={`m-0 text-[36px] leading-[1.1] tracking-tight text-ink-900 md:text-[52px] ${
                lang === "en" ? "font-display font-semibold" : "font-extrabold"
              }`}
            >
              {t("landingHeadline1")}{" "}
              <span className="jk-headline-underline relative text-forest-700">{t("landingHeadline2")}</span>{" "}
              {t("landingHeadline3")}
            </h1>
            <p className="m-0 max-w-[480px] text-base leading-[1.65] text-[#5a6a5e]">{t("landingSubcopy")}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3.5">
              <Link
                href="/signup"
                className="jk-focus rounded-xl bg-forest-900 px-6.5 py-3.5 text-[14.5px] font-bold text-white shadow-[0_2px_6px_rgba(27,67,50,.28)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-forest-700 hover:shadow-[0_6px_18px_rgba(27,67,50,.32)] active:translate-y-0 active:scale-[0.97]"
              >
                {t("landingCtaPrimary")}
              </Link>
              <a href="#features" className="jk-focus px-2.5 py-3.5 text-sm font-semibold text-forest-900 transition-colors hover:text-forest-500">
                {t("landingCtaSecondary")}
              </a>
            </div>
            <div className="mt-3.5 flex gap-6.5 border-t border-border pt-5">
              <StatCounter value="10 m" label={t("landingStat1")} />
              <StatCounter value="5 days" label={t("landingStat2")} />
              <StatCounter value="0 PKR" label={t("landingStat3")} />
            </div>
          </div>
          <div className="jk-map-in">
            <LandingFieldAnalyzer />
          </div>
        </div>
      </div>

      {/* How it works */}
      <div id="how" className="mx-auto max-w-[1180px] scroll-mt-[70px] px-6 py-16">
        <Reveal className="mb-9 text-center">
          <div className="mb-2.5 text-xs font-bold tracking-[.12em] text-forest-500">{t("landingHowEyebrow")}</div>
          <h2
            className={`m-0 text-[26px] tracking-tight text-ink-900 ${
              lang === "en" ? "font-display font-semibold" : "font-extrabold"
            }`}
          >
            {t("landingHowTitle")}
          </h2>
        </Reveal>
        <div className="jk-how-grid relative grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-4.5">
          <div className="jk-how-connector absolute top-0 right-[16.6%] left-[16.6%] hidden border-t border-dashed border-mint-border-strong md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} index={i}>
              <div
                tabIndex={0}
                className="jk-how-step jk-focus group relative h-full rounded-card-lg border border-border bg-cream-card p-6 pt-14"
              >
                <div className="absolute left-6 top-0 flex -translate-y-1/2 items-center gap-2">
                  <div className="grid h-12 w-12 flex-none place-items-center rounded-full border-2 border-cream-bg bg-forest-900 text-white shadow-[0_4px_10px_rgba(27,67,50,.28)] transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110">
                    <svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="#95D5B2" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d={s.path} />
                    </svg>
                  </div>
                  <span className="text-[11px] font-extrabold tracking-[.08em] text-forest-500">STEP {i + 1}</span>
                </div>
                <div className="mb-1.5 text-[15px] font-bold">{s.title}</div>
                <div className="text-[13px] leading-relaxed text-ink-500">{s.body}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Features bento */}
      <div id="features" className="mx-auto w-full max-w-[1180px] scroll-mt-[70px] px-6 pb-6 pt-16">
        <Reveal className="mx-auto mb-11 max-w-[620px] text-center">
          <div className="mb-2.5 text-xs font-bold tracking-[.12em] text-forest-500">{t("landingFeaturesEyebrow")}</div>
          <h2
            className={`m-0 mb-3 text-[26px] tracking-tight text-ink-900 md:text-[32px] ${
              lang === "en" ? "font-display font-semibold" : "font-extrabold"
            }`}
          >
            {t("landingFeaturesTitle")}
          </h2>
          <p className="m-0 text-[14.5px] leading-relaxed text-ink-500">{t("landingFeaturesSubcopy")}</p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:auto-rows-[172px]">
          {/* B · NDVI & NDMI (1x2) */}
          <Reveal index={0} className="lg:col-start-1 lg:row-start-1 lg:col-span-1 lg:row-span-2">
            <NdviCard />
          </Reveal>

          {/* C · Crop health gauge (1x1) */}
          <Reveal index={1} className="lg:col-start-2 lg:row-start-1 lg:col-span-1 lg:row-span-1">
            <CardSheen className="flex h-full items-center gap-3.5 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div
                className="grid h-[74px] w-[74px] flex-none place-items-center rounded-full"
                style={{ background: "conic-gradient(#40916C 0 74%, #EDEAE0 74% 100%)" }}
              >
                <div className="grid h-[54px] w-[54px] place-items-center rounded-full bg-cream-card text-center">
                  <div>
                    <div className="text-base font-extrabold leading-none text-forest-900">74%</div>
                    <div className="mt-0.5 text-[8px] font-bold text-ink-400">HEALTHY</div>
                  </div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold leading-tight text-ink-900">Crop health &amp; yield</div>
                <div className="mt-0.5 text-[11px] text-ink-500">
                  Projected <b className="text-ink-900">57 maund/acre</b>
                </div>
              </div>
            </CardSheen>
          </Reveal>

          {/* D · Disease scanner (1x1) */}
          <Reveal index={2} className="lg:col-start-2 lg:row-start-2 lg:col-span-1 lg:row-span-1">
            <CardSheen className="flex h-full flex-col justify-center gap-2.5 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-border"
                  style={{ background: "repeating-linear-gradient(45deg,#EAF3EC 0 8px,#F6F4ED 8px 16px)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="#C1512F" strokeWidth="1.5">
                    <circle cx="7" cy="7" r="4.5" />
                    <path d="M10.5 10.5 L13.5 13.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold leading-tight text-ink-900">Leaf disease scanner</div>
                  <div className="text-[11px] text-ink-500">Photo → genome-backed diagnosis</div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-bold text-alert-red-text">Leaf rust</span>
                  <span className="font-extrabold text-alert-red-text">94.2%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-cream-inset">
                  <div className="h-full w-[94%] rounded-full bg-alert-red" />
                </div>
              </div>
            </CardSheen>
          </Reveal>

          {/* E · Weather & pest warnings (2x1) */}
          <Reveal index={3} className="lg:col-start-3 lg:row-start-1 lg:col-span-2 lg:row-span-1">
            <CardSheen className="flex h-full flex-col justify-center gap-3 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div className="flex items-center gap-2.5">
                <div className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-border bg-info-blue-bg">
                  <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="#3a719b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 10.5a2.5 2.5 0 01-.5-4.95A3 3 0 0110 4.6a2.75 2.75 0 011 5.35" />
                    <path d="M5 12.5v1M8 12.5v1.5M6.5 13.75v.75" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold text-ink-900">Weather &amp; pest warnings</div>
                  <div className="text-xs text-ink-500">7-day agromet forecast + outbreak risk, before symptoms appear.</div>
                </div>
                <div className="jk-ring-pulse flex flex-none items-center gap-1.5 rounded-full border border-alert-red-border bg-alert-red-bg px-3 py-1.5 text-[11px] font-bold text-alert-red-text">
                  ⚠ RUST 78%
                </div>
              </div>
              <div className="flex gap-1.5 text-center text-[10.5px] text-ink-500">
                {[
                  ["Thu", "39°", false],
                  ["Fri", "37°", false],
                  ["Sat", "34°", true],
                  ["Sun", "33°", true],
                  ["Mon", "35°", false],
                  ["Tue", "36°", false],
                  ["Wed", "37°", false],
                ].map(([day, temp, warn]) => (
                  <div
                    key={day as string}
                    className={`flex-1 rounded-lg px-0.5 py-2 ${warn ? "border border-[#F0E3C2] bg-[#FBF3E1]" : "bg-cream-inset"}`}
                  >
                    {day}
                    <div className={`text-[13px] font-extrabold ${warn ? "text-[#B07D2B]" : "text-ink-900"}`}>{temp}</div>
                  </div>
                ))}
              </div>
            </CardSheen>
          </Reveal>

          {/* F · Mandi prices (2x1) */}
          <Reveal index={4} className="lg:col-start-3 lg:row-start-2 lg:col-span-2 lg:row-span-1">
            <CardSheen className="flex h-full flex-col justify-center gap-2 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-border bg-mint-100">
                    <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="#2d6a4f" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12.5V2M2 12.5h11" />
                      <path d="M4.5 10l2-3 2 1.5 3-4.5" />
                    </svg>
                  </div>
                  <div className="text-[14.5px] font-bold text-ink-900">Real-time mandi prices</div>
                </div>
                <div className="text-[10.5px] font-semibold text-ink-400">PKR / 40 kg</div>
              </div>
              <div className="flex flex-col text-xs">
                {[
                  ["#E9B44C", "Wheat", "3,920", "▲1.2%", true],
                  ["#95D5B2", "Basmati paddy", "5,410", "▼0.8%", false],
                  ["#F0E68C", "Cotton (phutti)", "8,540", "▲2.4%", true],
                ].map(([dot, name, price, change, up], i, arr) => (
                  <div
                    key={name as string}
                    className={`flex items-center gap-2 py-1.5 ${i < arr.length - 1 ? "border-b border-cream-inset" : ""}`}
                  >
                    <span className="h-2 w-2 flex-none rounded-sm" style={{ background: dot as string }} />
                    <span className="flex-1 font-semibold text-ink-900">{name}</span>
                    <span className="font-extrabold">{price}</span>
                    <span className={`w-11 text-right text-[11px] font-bold ${up ? "text-forest-700" : "text-[#C1512F]"}`}>
                      {change}
                    </span>
                  </div>
                ))}
              </div>
            </CardSheen>
          </Reveal>
        </div>

        <Reveal index={5} className="mt-4">
          <div className="jk-contours-dark relative flex flex-wrap items-center gap-7 overflow-hidden rounded-card-lg bg-forest-900 p-7 text-white">
            <div className="grid h-11 w-11 flex-none place-items-center rounded-[13px] bg-white/[.18]">
              <LogoMark size={20} leafColor="#95D5B2" leafColorDark="#40916C" />
            </div>
            <div className="min-w-[280px] flex-1">
              <div className="text-base font-bold">{t("landingLedgerBannerTitle")}</div>
              <div className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-white/75">
                {t("landingLedgerBannerDesc")}
              </div>
            </div>
            <Link
              href="/signup"
              className="jk-focus flex-none rounded-[10px] bg-mint-300 px-5 py-2.5 text-[13px] font-bold text-forest-900 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#B7E4C7] active:scale-[0.97]"
            >
              {t("landingLedgerBannerCta")}
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Mission */}
      <div id="mission" className="relative overflow-hidden scroll-mt-[70px] border-t border-border bg-cream-card">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(149,213,178,.4), transparent 70%)" }}
        />
        <Reveal className="relative mx-auto max-w-[900px] px-6 py-16 text-center">
          <div className="mb-3 text-xs font-bold tracking-[.12em] text-forest-500">{t("landingMissionEyebrow")}</div>
          <h2
            className={`m-0 mb-3.5 text-2xl leading-tight tracking-tight text-ink-900 md:text-[28px] ${
              lang === "en" ? "font-display font-semibold" : "font-extrabold"
            }`}
          >
            {t("landingMissionTitle")}
          </h2>
          <p className="mx-auto m-0 max-w-[640px] text-[14.5px] leading-loose text-ink-500">{t("landingMissionBody")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-10">
            <StatCounter value="−30%" label={t("landingMissionStat1")} />
            <StatCounter value="+15%" label={t("landingMissionStat2")} />
            <StatCounter value="48 hrs" label={t("landingMissionStat3")} />
          </div>
        </Reveal>
      </div>

      {/* CTA + footer */}
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-7 pt-16">
        <Reveal>
          <div className="relative flex flex-wrap items-center gap-7 overflow-hidden rounded-card-lg bg-forest-900 p-9">
            <img
              src={FIELDS_TILE_IMAGE}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-forest-900 via-forest-900/92 to-forest-900/55" />
            <div className="relative z-10 min-w-[280px] flex-1">
              <div
                className={`text-xl tracking-tight text-white ${lang === "en" ? "font-display font-semibold" : "font-extrabold"}`}
              >
                {t("landingCtaBannerTitle")}
              </div>
              <div className="mt-1.5 text-[13.5px] text-white/72">{t("landingCtaBannerDesc")}</div>
            </div>
            <Link
              href="/signup"
              className="jk-focus relative z-10 rounded-xl bg-mint-300 px-6.5 py-3.5 text-[14.5px] font-bold text-forest-900 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#B7E4C7] active:scale-[0.97]"
            >
              {t("landingCtaBannerButton")}
            </Link>
          </div>
        </Reveal>
        <div className="flex flex-wrap items-center gap-3.5 px-1 pb-2 pt-7 text-xs text-ink-400">
          <div className="flex items-center gap-2 font-bold text-forest-900">
            <Logo size={22} />
            Jadeed Kashtkar <span className="font-normal text-ink-400" lang="ur">جدید کاشتکار</span>
          </div>
          <div className="flex-1" />
          <span>{t("landingFooterCopyright")}</span>
          <span>{t("landingFooterYear")}</span>
        </div>
      </div>
    </div>
  );
}
