import type { PolygonGeometry } from "@/lib/api/types";

/** Simple average-of-vertices centroid — good enough for a weather lookup point, not for area math. */
export function polygonCentroid(geometry: PolygonGeometry): { lat: number; lon: number } {
  const ring = geometry.coordinates[0];
  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of ring) {
    sumLon += lon;
    sumLat += lat;
  }
  return { lon: sumLon / ring.length, lat: sumLat / ring.length };
}

export function boundsFromGeometry(geometry: PolygonGeometry): [number, number, number, number] {
  const ring = geometry.coordinates[0];
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
