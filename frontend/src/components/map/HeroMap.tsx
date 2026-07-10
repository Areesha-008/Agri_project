"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAP_TILES_KEY ?? "";
// Faisalabad, Punjab — same sample farmland the rest of the app centers on.
const CENTER: [number, number] = [73.135, 31.45];

const FIELD_POLYGON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [73.1275, 31.4535],
        [73.1375, 31.4565],
        [73.1425, 31.451],
        [73.1385, 31.4435],
        [73.13, 31.445],
        [73.1255, 31.4485],
        [73.1275, 31.4535],
      ],
    ],
  },
};

type Layer = "ndvi" | "ndmi" | "satellite";

const LAYER_FILL: Record<Layer, string> = {
  ndvi: "#3fae49",
  ndmi: "#2f7fc1",
  satellite: "#95d5b2",
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
      zoom: 14.4,
      pitch: 30,
      scrollZoom: false,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("hero-field", { type: "geojson", data: FIELD_POLYGON });
      map.addLayer({
        id: "hero-field-fill",
        type: "fill",
        source: "hero-field",
        paint: { "fill-color": LAYER_FILL.ndvi, "fill-opacity": 0.55 },
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
    if (!map || !map.getLayer("hero-field-fill")) return;
    map.setPaintProperty("hero-field-fill", "fill-color", LAYER_FILL[layer]);
    map.setPaintProperty("hero-field-fill", "fill-opacity", layer === "satellite" ? 0.12 : 0.55);
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
