import { toLocalIso, type DateRange } from "@/components/ui/TimeWindowPicker";
import type { NdviHistoryItem } from "@/lib/api/types";

export interface WeekTile {
  start: string;
  end: string;
}

// window_days on the backend is (end_date - start_date).days — an *exclusive*
// delta, not a calendar-inclusive day count. A 7-calendar-day tile (e.g.
// Jul 1 - Jul 7) has window_days === 6; that's what these constants track.
const TILE_WINDOW_DAYS = 6;
const MIN_WINDOW_DAYS = 3; // mirrors MIN_SEARCH_WINDOW_DAYS in ndvi_processor.py

// new Date(isoString) parses date-only strings as UTC midnight — the exact
// bug TimeWindowPicker's own toLocalIso/isoDaysAgo were fixed to avoid.
// Build the Date from y/m/d components instead so this stays local-safe.
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalIso(dt);
}

// Mirrors the backend's (end_date - start_date).days exactly.
function daysBetweenIso(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

/**
 * Non-overlapping ~7-day tiles stepping backward from period.end_date to
 * period.start_date — tiles[0] is the most recent week. The oldest tile may
 * be narrower than 7 days; if its window_days would fall below
 * MIN_WINDOW_DAYS (the backend's actual reject threshold), it's folded into
 * the previous tile instead of producing a tile "Analyze this week" could
 * never submit successfully. E.g. an 11-calendar-day period splits into a
 * 7-day tile + a 4-day remainder (window_days 6 and 3 — exactly the floor);
 * a 10-calendar-day period folds into a single 10-day tile instead of
 * producing an unsubmittable 3-calendar-day (window_days=2) remainder.
 */
export function computeWeeklyTiles(period: DateRange): WeekTile[] {
  if (daysBetweenIso(period.start_date, period.end_date) <= 0) return [];

  const tiles: WeekTile[] = [];
  let cursorEnd = period.end_date;

  // Terminates because tileStart strictly decreases (or is clamped to
  // period.start_date, which always breaks the loop) each iteration.
  while (true) {
    const candidateStart = addDaysIso(cursorEnd, -TILE_WINDOW_DAYS);
    const tileStart = daysBetweenIso(period.start_date, candidateStart) < 0 ? period.start_date : candidateStart;
    const windowDays = daysBetweenIso(tileStart, cursorEnd);

    if (windowDays < MIN_WINDOW_DAYS && tiles.length > 0) {
      tiles[tiles.length - 1].start = tileStart;
      break;
    }

    tiles.push({ start: tileStart, end: cursorEnd });
    if (tileStart === period.start_date) break;
    cursorEnd = addDaysIso(tileStart, -1);
  }

  return tiles;
}

/**
 * Turns the weekly rows a single job actually produced (NdviJobStatusResponse.history
 * — see get_job_history_items on the backend) into scrubber tiles, oldest
 * first. Unlike computeWeeklyTiles, these aren't speculative rolling windows
 * computed ahead of the fetch — every tile here is backed by a real row, so
 * there's no "empty" state to render.
 */
export function tilesFromJobHistory(history: NdviHistoryItem[]): WeekTile[] {
  // date_range_start is nullable at the type level (old rows predating the
  // column), but every row a job produces sets it — fall back to the end
  // date rather than widen WeekTile.start to allow null everywhere.
  return history.map((h) => ({ start: h.date_range_start ?? h.satellite_image_date, end: h.satellite_image_date }));
}

export function matchEntry(tile: WeekTile, history: NdviHistoryItem[]): NdviHistoryItem | null {
  // satellite_image_date is a plain `date` on the backend (YYYY-MM-DD over
  // the wire), so this is a safe plain string comparison — no Date parsing.
  // history is newest-first, so .find naturally returns the most recent match.
  return history.find((h) => h.satellite_image_date >= tile.start && h.satellite_image_date <= tile.end) ?? null;
}

export function formatTileLabel(tile: WeekTile): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(tile.start)} – ${fmt(tile.end)}`;
}
