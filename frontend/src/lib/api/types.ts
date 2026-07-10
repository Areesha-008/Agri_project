/** Hand-typed to mirror backend/app/schemas/*.py exactly (see each file for the source of truth). */

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: number[][][];
}

export interface User {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface MessageResponse {
  message: string;
  dev_reset_url: string | null;
}

export interface FieldResponse {
  id: string;
  name: string;
  geometry: PolygonGeometry;
  area_hectares: number | null;
  district: string | null;
  crop: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldCreateResponse {
  field: FieldResponse;
  job_id: string;
}

export interface FieldListItem {
  id: string;
  name: string;
  area_hectares: number | null;
  created_at: string;
}

export type NdviJobStatus = "pending" | "running" | "done" | "failed";

export interface NdviJobStatusResponse {
  id: string;
  field_id: string;
  status: NdviJobStatus;
  error_message: string | null;
  ndvi_history_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NdviHistoryItem {
  id: string;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  ndmi_mean: number | null;
  ndmi_min: number | null;
  ndmi_max: number | null;
  satellite_image_date: string;
  cloud_cover_percent: number | null;
  source_collection: string;
  ndvi_png_url: string | null;
  ndmi_png_url: string | null;
  computed_at: string;
}

export interface FieldNdviLatestResponse {
  latest: NdviHistoryItem | null;
  history: NdviHistoryItem[];
}

export interface NdviTrendPoint {
  date: string;
  ndvi_mean: number;
}

export interface CropHealthResponse {
  field_id: string;
  health_score: number;
  status_label: string;
  yield_maund_per_acre: number;
  yield_t_per_ha: number;
  baseline_district: string;
  baseline_crop: string;
  ndvi_trend: NdviTrendPoint[];
}

export interface UserSettings {
  language: "en" | "ur";
  yield_unit: "maund_per_acre" | "t_per_ha";
  default_mandi: string;
  alert_pest: boolean;
  alert_weather: boolean;
  alert_price: boolean;
  alert_sms: boolean;
  updated_at: string;
}

export type UserSettingsUpdate = Partial<Omit<UserSettings, "updated_at">>;

export type Mandi = "faisalabad" | "lahore" | "multan";

export interface MandiRate {
  commodity: string;
  urdu_name: string;
  price_pkr_per_40kg: number;
  change_pct: number;
  history_7d: number[];
}

export interface ForecastDay {
  day: string;
  date: string;
  temp_hi: number;
  temp_lo: number;
  humidity_pct: number;
  wind_kmh: number;
  rain: boolean;
  desc: string;
}

export type AlertCategory = "pest" | "weather" | "price";

export interface Alert {
  id: string;
  field_id: string;
  category: AlertCategory;
  title: string;
  message: string;
  risk_pct: number | null;
  dismissed: boolean;
  created_at: string;
}

export type LedgerCategory = "Fertilizer" | "Irrigation" | "Spray" | "Operation" | "Scan";

export interface LedgerEntry {
  id: string;
  field_id: string;
  title: string;
  detail: string;
  category: LedgerCategory;
  timestamp: string;
}

export interface LedgerEntryCreate {
  field_id: string;
  title: string;
  detail: string;
  category: LedgerCategory;
}

export interface FieldReportSummary {
  name: string;
  crop: string | null;
  area_hectares: number | null;
  ndvi_mean: number | null;
  health_score: number | null;
}

export interface Report {
  total_hectares: number;
  field_count: number;
  avg_health_score: number;
  urea_bags: number;
  dap_bags: number;
  sop_bags: number;
  ledger_entry_count: number;
  field_summaries: FieldReportSummary[];
  generated_at: string;
}

export interface ScanBreakdownItem {
  label: string;
  pct: number;
}

export interface Scan {
  id: string;
  image_url: string;
  disease: string;
  latin_name: string | null;
  confidence_pct: number;
  breakdown: ScanBreakdownItem[];
  mitigations: string[];
  demo_mode: boolean;
  created_at: string;
}
