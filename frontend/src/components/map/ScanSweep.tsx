"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The satellite pass over the drawn field, shown while a Sentinel-2 analysis
 * job is in flight.
 *
 * That wait is real acquisition time — 20-70s depending on how many weeks the
 * window covers — and a spinner spends it saying nothing. A swath of light
 * crossing the map says the specific true thing instead: the sensor is
 * travelling over this field and reading it. It's the same event the result
 * comes from, so the payoff (data resolving in beneath it) reads as the
 * completion of this motion rather than an unrelated pop.
 *
 * Deliberately full-width rather than clipped to the field polygon: the map has
 * already flown to the boundary, so the sweep crosses it regardless, and
 * projecting the polygon to screen space would need a map ref out of FieldsMap
 * and a re-sync on every pan/zoom for no visible gain.
 */
export function ScanSweep({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  // A loop that keeps running after the visitor has scrolled past it is just
  // burning frames, so pause it when the hero leaves the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  if (!active) return null;

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      <div className="jk-scan-band" style={{ animationPlayState: inView ? "running" : "paused" }} />
    </div>
  );
}
