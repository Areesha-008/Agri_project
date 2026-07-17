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

const VARIANT_STYLES = {
  farmers: {
    partition: "bg-[linear-gradient(180deg,#eef5f0,#f3f7f0)] border-[#d9e8dd]",
    tag: "bg-forest-700",
    icon: "bg-mint-100",
    fade: "from-transparent to-[#f3f7f0]",
  },
  breeders: {
    partition: "bg-[linear-gradient(180deg,#e7efe4,#eef3ea)] border-[#cfe0d1]",
    tag: "bg-forest-900",
    icon: "bg-[#dcebe1]",
    fade: "from-transparent to-[#eef3ea]",
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
      <div className="mb-4.5 flex items-baseline gap-2.5 pr-6">
        <span className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold tracking-[.08em] text-white uppercase ${styles.tag}`}>
          {tag}
        </span>
        <h3 className="font-display text-[17px] font-bold text-ink-900">{heading}</h3>
        <span className="ml-auto mr-6 text-xs font-semibold text-ink-400">{count}</span>
      </div>

      {/* dir="ltr" keeps scroll order/math deterministic across browsers — native RTL
          overflow-x containers disagree on which end scrollLeft=0 represents. Card text
          re-asserts the page's real direction so Urdu still reads correctly inside. */}
      <div ref={rowRef} dir="ltr" className="flex gap-3.5 overflow-x-auto scroll-smooth pr-6" role="region" aria-label={heading}>
        {cards.map((card) => (
          <div
            key={card.title}
            dir={dir}
            className="h-[168px] w-[208px] flex-none rounded-2xl border border-border bg-cream-card p-4 shadow-[0_2px_8px_rgba(27,67,50,.05)]"
          >
            <div className={`mb-3 grid h-[38px] w-[38px] place-items-center rounded-[10px] ${styles.icon}`}>{card.icon}</div>
            <div className="mb-1 text-[13px] font-bold leading-tight text-ink-900">{card.title}</div>
            <div className="line-clamp-2 text-[10.5px] leading-relaxed text-ink-400">{card.desc}</div>
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
