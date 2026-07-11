"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAP_TILES_KEY ?? "";
// Rural farmland outside Faisalabad, Punjab — clear rectangular field patterns in satellite
// imagery, away from the city street grid the previous coordinates sat on top of.
const CENTER: [number, number] = [73.32, 31.58];

const FIELD_HALF_LON = 0.0026;
const FIELD_HALF_LAT = 0.002;

// A real field reads as a rectangle, not a hand-drawn irregular shape.
function fieldRectangle(): GeoJSON.Feature<GeoJSON.Polygon> {
  const [lon, lat] = CENTER;
  const w = FIELD_HALF_LON;
  const h = FIELD_HALF_LAT;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon - w, lat + h],
          [lon + w, lat + h],
          [lon + w, lat - h],
          [lon - w, lat - h],
          [lon - w, lat + h],
        ],
      ],
    },
  };
}

const FIELD_POLYGON = fieldRectangle();

// Cheap deterministic value noise (a couple of summed sine waves) — smooth, spatially-correlated
// health values without a noise library. Different seeds decorrelate the NDVI/NDMI patterns.
function fieldNoise(lon: number, lat: number, seed: number): number {
  const v =
    Math.sin(lon * 900 + seed) * Math.cos(lat * 760 + seed * 1.4) +
    Math.sin(lon * 360 - lat * 300 + seed * 2.3) * 0.6;
  return Math.min(1, Math.max(0, (v + 1.6) / 3.2));
}

// A dense jittered grid of sample points across the field, each weighted by its NDVI/NDMI value.
// Feeding this into Mapbox's native heatmap layer (weighted by value, not point count) renders a
// smooth continuous surface instead of a hard-edged tiled grid.
function buildHeatPoints(): GeoJSON.FeatureCollection<GeoJSON.Point, { ndvi: number; ndmi: number }> {
  const [lon, lat] = CENTER;
  const cols = 30;
  const rows = 22;
  const cellW = (FIELD_HALF_LON * 2) / cols;
  const cellH = (FIELD_HALF_LAT * 2) / rows;
  const features: GeoJSON.Feature<GeoJSON.Point, { ndvi: number; ndmi: number }>[] = [];

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const jitterX = (Math.random() - 0.5) * cellW * 0.6;
      const jitterY = (Math.random() - 0.5) * cellH * 0.6;
      const plon = lon - FIELD_HALF_LON + cellW * (i + 0.5) + jitterX;
      const plat = lat - FIELD_HALF_LAT + cellH * (j + 0.5) + jitterY;
      features.push({
        type: "Feature",
        properties: { ndvi: fieldNoise(plon, plat, 11), ndmi: fieldNoise(plon, plat, 47) },
        geometry: { type: "Point", coordinates: [plon, plat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

type Layer = "ndvi" | "ndmi" | "satellite";

// ColorBrewer sequential ramps (YlGn / YlGnBu) — colorblind-tested, evenly spaced. Density 0 is
// transparent so the heatmap fades out at the field edges instead of showing a hard box.
const HEAT_COLOR: Record<"ndvi" | "ndmi", mapboxgl.Expression> = {
  ndvi: [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(0,0,0,0)",
    0.08, "#ffffcc",
    0.3, "#c2e699",
    0.52, "#78c679",
    0.74, "#31a354",
    1, "#006837",
  ],
  ndmi: [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(0,0,0,0)",
    0.08, "#ffffcc",
    0.3, "#a1dab4",
    0.52, "#41b6c4",
    0.74, "#2c7fb8",
    1, "#253494",
  ],
};

// heatmap-radius is defined in fixed screen pixels, not ground distance, so it doesn't grow on its
// own as you zoom in. Left constant, points that blend smoothly at the default zoom drift apart in
// screen space as you zoom in and fragment into isolated dots. Scaling radius (and intensity, to
// keep density from washing out) with zoom keeps the surface looking continuous at any zoom level —
// the pattern Mapbox's own heatmap examples use.
const HEAT_RADIUS: mapboxgl.Expression = [
  "interpolate", ["linear"], ["zoom"],
  13, 15,
  16, 28,
  18, 60,
  20, 130,
  22, 260,
];
const HEAT_INTENSITY: mapboxgl.Expression = [
  "interpolate", ["linear"], ["zoom"],
  13, 0.6,
  16, 1.1,
  18, 1.6,
  20, 2.2,
  22, 3,
];

// Same stops as HEAT_COLOR, expressed as a CSS gradient for the on-map legend swatch.
const LEGEND: Record<"ndvi" | "ndmi", { gradient: string; low: string; high: string }> = {
  ndvi: { gradient: "linear-gradient(90deg,#ffffcc,#c2e699,#78c679,#31a354,#006837)", low: "Stressed", high: "Healthy" },
  ndmi: { gradient: "linear-gradient(90deg,#ffffcc,#a1dab4,#41b6c4,#2c7fb8,#253494)", low: "Dry", high: "Moist" },
};

export function HeroMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [layer, setLayer] = useState<Layer>("ndvi");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: CENTER,
      zoom: 15.1,
      pitch: 0,
      bearing: 0,
      scrollZoom: false,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const opacityTransition = { duration: reduceMotion ? 0 : 550 };

      map.addSource("hero-field", { type: "geojson", data: FIELD_POLYGON });
      map.addSource("hero-heat-points", { type: "geojson", data: buildHeatPoints() });

      map.addLayer({
        id: "hero-heat-ndvi",
        type: "heatmap",
        source: "hero-heat-points",
        paint: {
          "heatmap-weight": ["get", "ndvi"],
          "heatmap-intensity": HEAT_INTENSITY,
          "heatmap-radius": HEAT_RADIUS,
          "heatmap-color": HEAT_COLOR.ndvi,
          "heatmap-opacity": 0.85,
          "heatmap-opacity-transition": opacityTransition,
        },
      });
      map.addLayer({
        id: "hero-heat-ndmi",
        type: "heatmap",
        source: "hero-heat-points",
        paint: {
          "heatmap-weight": ["get", "ndmi"],
          "heatmap-intensity": HEAT_INTENSITY,
          "heatmap-radius": HEAT_RADIUS,
          "heatmap-color": HEAT_COLOR.ndmi,
          "heatmap-opacity": 0,
          "heatmap-opacity-transition": opacityTransition,
        },
      });
      map.addLayer({
        id: "hero-field-line",
        type: "line",
        source: "hero-field",
        paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 1.4] },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("hero-heat-ndvi") || !map.getLayer("hero-heat-ndmi")) return;
    map.setPaintProperty("hero-heat-ndvi", "heatmap-opacity", layer === "ndvi" ? 0.85 : 0);
    map.setPaintProperty("hero-heat-ndmi", "heatmap-opacity", layer === "ndmi" ? 0.85 : 0);
  }, [layer]);

  return (
    <div className="relative">
      <div className="relative h-[400px] overflow-hidden rounded-card-lg bg-[#1a2417] shadow-[0_18px_48px_rgba(27,67,50,.22)]">
        <div ref={containerRef} className="h-full w-full" />

        <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
          {(["ndvi", "ndmi", "satellite"] as Layer[]).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={`pointer-events-auto rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                layer === l ? "bg-forest-900 text-white" : "bg-white/85 text-ink-600 hover:bg-white"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {layer !== "satellite" && (
          <div className="pointer-events-none absolute left-3 top-11 flex flex-col gap-1 rounded-md bg-white/85 px-2.5 py-1.5">
            <div className="h-1.5 w-20 rounded-full" style={{ background: LEGEND[layer].gradient }} />
            <div className="flex justify-between gap-3 text-[9px] font-semibold text-ink-600">
              <span>{LEGEND[layer].low}</span>
              <span>{LEGEND[layer].high}</span>
            </div>
          </div>
        )}
      </div>

      <div className="jk-slide-r absolute -bottom-5 -right-3.5 z-10 flex gap-4 rounded-2xl border border-border bg-white p-3.5 shadow-[0_8px_26px_rgba(27,67,50,.16)]">
        <div>
          <div className="text-[15px] font-extrabold text-forest-900">0.62</div>
          <div className="text-[9.5px] text-ink-400">NDVI mean</div>
        </div>
        <div>
          <div className="text-[15px] font-extrabold text-forest-900">12.4 ha</div>
          <div className="text-[9.5px] text-ink-400">area</div>
        </div>
        <div>
          <div className="text-[15px] font-extrabold text-forest-700">74%</div>
          <div className="text-[9.5px] text-ink-400">health</div>
        </div>
      </div>
    </div>
  );
}
