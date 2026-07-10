"use client";

import { useEffect, useRef, useState } from "react";

/** Fades + slides children in once, when >=15% visible. Matches the landing page's scroll-reveal. */
export function Reveal({
  children,
  index = 0,
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-[650ms] ease-[cubic-bezier(.2,.8,.3,1)] ${
        revealed ? "translate-y-0 opacity-100" : "translate-y-[26px] opacity-0"
      } ${className}`}
      style={{ transitionDelay: `${(index % 4) * 90}ms` }}
    >
      {children}
    </div>
  );
}
