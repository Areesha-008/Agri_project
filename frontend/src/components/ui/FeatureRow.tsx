"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";

export interface FeatureRowCard {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

interface FeatureRowProps {
  variant: "farmers" | "breeders";
  tag: string;
  heading: string;
  count: string;
  cards: FeatureRowCard[];
  nextAriaLabel: string;
}

/* partition/fade reuse cream-inset (the existing "sunken surface" token) instead of
   one-off near-white hex — it already inverts correctly in dark mode, where the old
   hardcoded gradients stayed light and swallowed the ink-900/ink-600 text on top. */
const VARIANT_STYLES = {
  farmers: {
    partition: "bg-cream-inset border-border",
    tag: "bg-forest-700",
    icon: "bg-mint-100",
    fade: "from-transparent to-cream-inset",
  },
  breeders: {
    partition: "bg-cream-inset border-border",
    tag: "bg-forest-900",
    icon: "bg-mint-100",
    fade: "from-transparent to-cream-inset",
  },
} as const;

/** Horizontally-scrolling row of compact feature cards inside a tinted "partition" — used for the landing page's Farmers/Breeders split. Native overflow-x scroll, no carousel library. */
export function FeatureRow({ variant, tag, heading, count, cards, nextAriaLabel }: FeatureRowProps) {
  const { dir } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);
  const styles = VARIANT_STYLES[variant];

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const update = () => setCanScrollMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [cards.length]);

  function scrollNext() {
    rowRef.current?.scrollBy({ left: 320, behavior: "smooth" });
  }

  return (
    <div className={`relative overflow-hidden rounded-[26px] border py-6 pl-6 ${styles.partition}`}>
      {/* flex-col below sm: — at narrow widths the heading was being squeezed into a
          ~100px column by the tag pill + count fighting it for space on one line,
          wrapping to one word per line. Stacking gives the heading its own full row. */}
      <div className="mb-4.5 flex flex-col gap-1.5 pr-6 sm:flex-row sm:items-baseline sm:gap-2.5">
        <span className={`w-fit rounded-full px-3 py-1.5 text-[11px] font-extrabold tracking-[.08em] text-white uppercase ${styles.tag}`}>
          {tag}
        </span>
        <h3 className="font-display text-[17px] font-bold text-ink-900">{heading}</h3>
        <span className="text-xs font-semibold text-ink-600 sm:ml-auto sm:mr-6">{count}</span>
      </div>

      {/* dir="ltr" keeps scroll order/math deterministic across browsers — native RTL
          overflow-x containers disagree on which end scrollLeft=0 represents. Card text
          re-asserts the page's real direction so Urdu still reads correctly inside. */}
      {/* tabIndex + role="region" follows the WAI-ARIA scrollable-region pattern: the cards
          inside aren't natively focusable, so without this the row has no keyboard path at
          all. Once focused, arrow-key scrolling is native browser behavior on a focusable
          overflow container — no keydown handler needed. */}
      <div
        ref={rowRef}
        dir="ltr"
        tabIndex={0}
        className="jk-focus mr-1.5 flex gap-3.5 overflow-x-auto scroll-smooth rounded-xl pr-6"
        role="region"
        aria-label={heading}
      >
        {cards.map((card) => (
          <div
            key={card.title}
            dir={dir}
            className="h-[168px] w-[208px] flex-none rounded-2xl border border-border bg-cream-card p-4 shadow-[0_2px_8px_rgba(27,67,50,.05)]"
          >
            <div className={`mb-3 grid h-[38px] w-[38px] place-items-center rounded-[10px] ${styles.icon}`}>{card.icon}</div>
            <div className="mb-1 text-[13px] font-bold leading-tight text-ink-900">{card.title}</div>
            <div className="line-clamp-2 text-[11.5px] leading-relaxed text-ink-600">{card.desc}</div>
          </div>
        ))}
      </div>

      {canScrollMore && (
        <>
          <div className={`pointer-events-none absolute inset-y-0 right-0 w-[90px] bg-gradient-to-r ${styles.fade}`} />
          <button
            onClick={scrollNext}
            aria-label={nextAriaLabel}
            className="jk-focus absolute right-6 top-1/2 z-10 grid h-11.5 w-11.5 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-forest-900 shadow-[0_6px_16px_rgba(27,67,50,.3)] transition-transform hover:scale-105"
          >
            <svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.5 2.5l5 5-5 5" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
