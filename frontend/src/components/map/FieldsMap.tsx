"use client";

import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
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
}: FieldsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
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
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

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
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

    if (map.isStyleLoaded()) render(map);
    else map.once("load", () => render(map));
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

    if (map.isStyleLoaded()) apply(map);
    else map.once("load", () => apply(map));
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
