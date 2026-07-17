"use client";

import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import { useEffect, useRef } from "react";
import type { FieldListItem, PolygonGeometry } from "@/lib/api/types";
import type { MapLayer } from "@/lib/store/useAppStore";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAP_TILES_KEY ?? "";
// Faisalabad, Punjab — sample farmland the design's mock data centers on.
const DEFAULT_CENTER: [number, number] = [73.135, 31.45];

export interface FieldOverlay {
  id: string;
  boundingBox: [number, number, number, number]; // [west, south, east, north]
  imageUrl: string;
}

interface FieldsMapProps {
  fields: FieldListItem[];
  fieldGeometries: Record<string, PolygonGeometry>;
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  layer: MapLayer;
  overlay: FieldOverlay | null;
  drawing: boolean;
  onDrawComplete: (geometry: PolygonGeometry, areaHectares: number) => void;
  clearSignal: number;
  /** Opt-in only — the landing hero wants a location search; /fields and /dashboard don't. */
  showGeocoder?: boolean;
  geocoderPlaceholder?: string;
  /** Opt-in only — auto-center on the visitor's geolocation on first load (landing hero). */
  autoLocate?: boolean;
  /** Increment to re-trigger geolocation from a consumer-rendered button (clearSignal pattern). */
  locateSignal?: number;
}

export function FieldsMap({
  fields,
  fieldGeometries,
  selectedFieldId,
  onSelectField,
  layer,
  overlay,
  drawing,
  onDrawComplete,
  clearSignal,
  showGeocoder,
  geocoderPlaceholder,
  autoLocate,
  locateSignal,
}: FieldsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const geocoderRef = useRef<MapboxGeocoder | null>(null);
  const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);
  const navControlRef = useRef<mapboxgl.NavigationControl | null>(null);
  const onDrawCompleteRef = useRef(onDrawComplete);
  useEffect(() => {
    onDrawCompleteRef.current = onDrawComplete;
  }, [onDrawComplete]);

  // Map init — once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: DEFAULT_CENTER,
      zoom: 13,
    });
    const navControl = new mapboxgl.NavigationControl({ showCompass: false });
    map.addControl(navControl, "top-left");
    navControlRef.current = navControl;

    // Google-Maps-style: on the landing hero, ask for the visitor's location and
    // fly there on first load. Denied/blocked → the map stays at DEFAULT_CENTER,
    // and the control's own button remains as a manual fallback.
    if (autoLocate) {
      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true, timeout: 8000 },
        trackUserLocation: false,
        showUserLocation: true,
        // The hero renders its own locate button (stacked under the expand
        // button, matching its styling) and re-triggers via locateSignal —
        // hide the control's default top-left button.
        showButton: false,
      });
      map.addControl(geolocate, "top-left");
      geolocateRef.current = geolocate;
      // Feed the located point into the geocoder so search biases to the
      // visitor; `false` keeps trackProximity active for later map moves.
      geolocate.on("geolocate", (pos: GeolocationPosition) => {
        geocoderRef.current?.setProximity(
          { longitude: pos.coords.longitude, latitude: pos.coords.latitude },
          false,
        );
      });
      map.on("load", () => geolocate.trigger());
    }

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
    });
    map.addControl(draw);
    drawRef.current = draw;

    map.on("draw.create", (e: { features: GeoJSON.Feature[] }) => {
      const feature = e.features[0];
      if (!feature || feature.geometry.type !== "Polygon") return;
      const coordinates = feature.geometry.coordinates as number[][][];
      const geometry: PolygonGeometry = { type: "Polygon", coordinates };
      const areaHectares = shoelaceAreaHectares(coordinates[0]);
      onDrawCompleteRef.current(geometry, areaHectares);
    });

    mapRef.current = map;

    // CSS-only container resizes (e.g. the landing hero's expand-to-overlay)
    // don't repaint the canvas on their own — mapbox-gl's docs call for an
    // explicit resize() whenever the container's box changes.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // autoLocate is a stable prop; the `if (mapRef.current) return` guard above
    // makes re-running init a no-op even if it ever changed.
  }, [autoLocate]);

  // Manual "find my location" re-trigger from the hero's custom button —
  // same external-signal-counter pattern as clearSignal.
  useEffect(() => {
    if (locateSignal) geolocateRef.current?.trigger();
  }, [locateSignal]);

  // Draw mode toggle.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    if (drawing) {
      draw.deleteAll();
      draw.changeMode("draw_polygon");
    } else {
      draw.deleteAll();
    }
  }, [drawing, clearSignal]);

  // Geocoder (location search) — opt-in per consumer, added/removed as showGeocoder
  // changes rather than only at map-init, since the landing hero hides it once a
  // field is being analyzed. marker: false — a dropped pin would conflict with draw mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showGeocoder) {
      const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        // @types/mapbox__mapbox-gl-geocoder still types this against an older
        // mapbox-gl surface than v3 ships — functionally compatible, type-only mismatch.
        mapboxgl: mapboxgl as unknown as MapboxGeocoder.GeocoderOptions["mapboxgl"],
        marker: false,
        placeholder: geocoderPlaceholder,
        // Bias search relevance toward the visitor so nearby places rank first:
        // "ip" needs no permission; trackProximity then follows the map as
        // GeolocateControl flies to the user or the user pans.
        proximity: "ip",
        trackProximity: true,
        // Field-testing showed near-identical Punjab place names from across
        // the border (Jaranwala → Jaipur, Samundri → Hoshiarpur) polluting the
        // list — the product's fields are in Pakistan, so filter hard. Delete
        // this one line to go global again.
        countries: "pk",
        // Mapbox's places dataset is thin on small Pakistani localities
        // (bastis, chaks, goths) — supplement suggestions with OSM data via
        // Photon, biased to the current map view. Failures degrade silently
        // to Mapbox-only results.
        externalGeocoder: (query) => photonSupplement(query, map.getCenter()),
      });
      // This corner stacks controls by DOM insertion order (mapbox-gl's
      // built-in CSS floats+clears them, it doesn't use flexbox `order`), so
      // the search box only renders above the zoom buttons if it's actually
      // inserted first. The nav control is added once at map-init and never
      // removed, so on every geocoder mount we bump it out and back in
      // after — cheap, and correct regardless of how many times this fires.
      const nav = navControlRef.current;
      if (nav) map.removeControl(nav);
      map.addControl(geocoder, "top-left");
      if (nav) map.addControl(nav, "top-left");
      geocoderRef.current = geocoder;
      return () => {
        // React StrictMode's dev-only mount→cleanup→remount can invoke this before the
        // geocoder's control container has actually been attached to the map's DOM chrome;
        // its onRemove() then dereferences a null parentNode. Nothing to clean up in that
        // case — the container was never inserted, so there's no leak to guard against.
        try {
          map.removeControl(geocoder);
        } catch {
          // no-op — see above
        }
        geocoderRef.current = null;
      };
    }
  }, [showGeocoder, geocoderPlaceholder]);

  // Existing field outlines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function render(map: mapboxgl.Map) {
      const sourceId = "fields-outline";
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: fields
          .filter((f) => fieldGeometries[f.id])
          .map((f) => ({
            type: "Feature",
            id: f.id,
            geometry: fieldGeometries[f.id] as unknown as GeoJSON.Geometry,
            properties: { id: f.id, selected: f.id === selectedFieldId },
          })),
      };

      const existing = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(geojson);
      } else {
        map.addSource(sourceId, { type: "geojson", data: geojson });
        map.addLayer({
          id: "fields-fill",
          type: "fill",
          source: sourceId,
          paint: { "fill-color": "#95D5B2", "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: "fields-line",
          type: "line",
          source: sourceId,
          paint: {
            "line-color": "#ffffff",
            "line-width": ["case", ["get", "selected"], 3, 1.5],
            "line-opacity": ["case", ["get", "selected"], 1, 0.7],
          },
        });
        map.on("click", "fields-fill", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) onSelectField(id);
        });
        map.on("mouseenter", "fields-fill", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "fields-fill", () => (map.getCanvas().style.cursor = ""));
      }
    }

    // "load" only fires once per map — for prop changes that arrive later
    // (while the style is busy re-rendering) wait for the next "idle" instead.
    if (map.isStyleLoaded()) {
      render(map);
      return;
    }
    const onIdle = () => render(map);
    map.once("idle", onIdle);
    return () => {
      map.off("idle", onIdle);
    };
  }, [fields, fieldGeometries, selectedFieldId, onSelectField]);

  // NDVI/NDMI raster overlay for the selected field.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function apply(map: mapboxgl.Map) {
      const sourceId = "ndvi-overlay";
      if (map.getLayer("ndvi-overlay-layer")) map.removeLayer("ndvi-overlay-layer");
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      if (!overlay || layer === "satellite") return;
      const [west, south, east, north] = overlay.boundingBox;
      map.addSource(sourceId, {
        type: "image",
        url: overlay.imageUrl,
        coordinates: [
          [west, north],
          [east, north],
          [east, south],
          [west, south],
        ],
      });
      map.addLayer({ id: "ndvi-overlay-layer", type: "raster", source: sourceId, paint: { "raster-opacity": 0.85 } });
    }

    // Same once-per-lifetime "load" pitfall as the outlines effect above.
    if (map.isStyleLoaded()) {
      apply(map);
      return;
    }
    const onIdle = () => apply(map);
    map.once("idle", onIdle);
    return () => {
      map.off("idle", onIdle);
    };
  }, [overlay, layer]);

  // Fly to selected field.
  useEffect(() => {
    const map = mapRef.current;
    const geometry = selectedFieldId ? fieldGeometries[selectedFieldId] : null;
    if (!map || !geometry) return;
    const ring = geometry.coordinates[0];
    const lons = ring.map((c) => c[0]);
    const lats = ring.map((c) => c[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
  }, [selectedFieldId, fieldGeometries]);

  return <div ref={containerRef} className="h-full w-full" />;
}

// Photon place types worth suggesting — settlements, not house numbers/streets.
const PHOTON_PLACE_TYPES = new Set(["city", "town", "village", "hamlet", "locality", "suburb", "district", "county"]);

/**
 * OSM supplement for the geocoder: Mapbox's places dataset lacks many small
 * Pakistani localities (bastis, chaks, goths) that DO exist in OpenStreetMap.
 * Returns Carmen-GeoJSON-shaped features (what mapbox-gl-geocoder renders),
 * biased to the current map center. Photon is komoot's free fair-use endpoint —
 * swap in a self-hosted instance if search volume ever grows.
 */
async function photonSupplement(
  query: string,
  center: { lng: number; lat: number },
): Promise<GeoJSON.FeatureCollection["features"]> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lon=${center.lng}&lat=${center.lat}&limit=4`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: { geometry: GeoJSON.Point; properties: Record<string, string | undefined> }[];
    };
    const carmen = (data.features ?? [])
      .filter(
        (f) =>
          f.geometry?.type === "Point" &&
          f.properties.countrycode === "PK" &&
          f.properties.name &&
          PHOTON_PLACE_TYPES.has(f.properties.type ?? ""),
      )
      .map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        center: f.geometry.coordinates,
        place_name: [f.properties.name, f.properties.district ?? f.properties.city, f.properties.state, "Pakistan"]
          .filter(Boolean)
          .join(", "),
        place_type: ["place"],
        text: f.properties.name,
        properties: {},
      }));
    // Carmen features carry fields (center/place_name/text) beyond the plain
    // GeoJSON type — same type-only mismatch as the `mapboxgl` cast above.
    return carmen as unknown as GeoJSON.FeatureCollection["features"];
  } catch {
    return []; // a supplement failure must never break typing in the box
  }
}

function shoelaceAreaHectares(ring: number[][]): number {
  const lat0 = ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const projected = ring.map(([lon, lat]) => [lon * metersPerDegLon, lat * metersPerDegLat]);

  let area = 0;
  for (let i = 0; i < projected.length - 1; i++) {
    const [x1, y1] = projected[i];
    const [x2, y2] = projected[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.round((Math.abs(area) / 2 / 10_000) * 10_000) / 10_000;
}
