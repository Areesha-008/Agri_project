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

export type IrrigationType = "irrigated" | "rainfed";

export interface FieldResponse {
  id: string;
  name: string;
  geometry: PolygonGeometry;
  area_hectares: number | null;
  district: string | null;
  crop: string | null;
  irrigation_type: IrrigationType | null;
  sowing_date: string | null;
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
  /** The weekly rows THIS job produced — only populated once status is "done". */
  history: NdviHistoryItem[];
}

export interface NdviHistoryItem {
  id: string;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  ndmi_mean: number | null;
  ndmi_min: number | null;
  ndmi_max: number | null;
  ndre_mean: number | null;
  ndre_min: number | null;
  ndre_max: number | null;
  nbr2_mean: number | null;
  nbr2_min: number | null;
  nbr2_max: number | null;
  ndwi_mean: number | null;
  ndwi_min: number | null;
  ndwi_max: number | null;
  cci_mean: number | null;
  cci_min: number | null;
  cci_max: number | null;
  evi_mean: number | null;
  evi_min: number | null;
  evi_max: number | null;
  savi_mean: number | null;
  savi_min: number | null;
  savi_max: number | null;
  date_range_start: string | null;
  satellite_image_date: string;
  cloud_cover_percent: number | null;
  source_collection: string;
  ndvi_png_url: string | null;
  ndmi_png_url: string | null;
  ndre_png_url: string | null;
  nbr2_png_url: string | null;
  ndwi_png_url: string | null;
  cci_png_url: string | null;
  evi_png_url: string | null;
  savi_png_url: string | null;
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
  alert_pest: boolean;
  alert_weather: boolean;
  alert_sms: boolean;
  updated_at: string;
}

export type UserSettingsUpdate = Partial<Omit<UserSettings, "updated_at">>;

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

// Free string now — the backend stores custom heads alongside the built-ins.
export type LedgerCategory = string;
export type LedgerEntryType = "expense" | "income";

export interface LedgerEntry {
  id: string;
  field_id: string;
  title: string;
  detail: string;
  category: LedgerCategory;
  amount: number | null;
  entry_type: LedgerEntryType;
  timestamp: string;
}

export interface LedgerEntryCreate {
  field_id: string;
  title: string;
  detail: string;
  category: LedgerCategory;
  amount?: number | null;
  entry_type: LedgerEntryType;
}

export interface Transaction {
  id: string;
  timestamp: string;
  category: LedgerCategory;
  title: string;
  detail: string;
  amount: number | null;
  entry_type: LedgerEntryType;
}

export interface Report {
  field_name: string;
  crop: string | null;
  area_hectares: number | null;
  ndvi_mean: number | null;
  health_score: number | null;
  transactions: Transaction[];
  total_spent: number;
  total_earned: number;
  net: number;
  generated_at: string;
}

export type EvidenceLabel =
  | "adequate"
  | "possible_n_stress"
  | "possible_water_stress"
  | "waterlogged"
  | "insufficient_observation";

export type TimingStatus = "due" | "upcoming" | "deferred_weather" | "past";

export interface FertilizerNutrientTargets {
  n_kg_acre: number;
  p2o5_kg_acre: number;
  k2o_kg_acre: number;
}

export interface FertilizerBags {
  urea_bags: number;
  dap_bags: number;
  sop_bags: number;
}

export interface FertilizerTimingEvent {
  stage: string;
  action: string;
  status: TimingStatus;
  note: string | null;
}

export interface FertilizerEvidenceClassification {
  label: EvidenceLabel;
  basis: string;
  ndre_mean: number | null;
  ndmi_mean: number | null;
  ndwi_mean: number | null;
  cci_mean: number | null;
}

export interface FertilizerRecommendation {
  field_id: string;
  crop: string;
  district: string | null;
  irrigation_type: string;
  irrigation_source: "field_setting" | "district_default" | "fallback_irrigated";
  soil_tier: string;
  soil_tier_source: "user_override" | "assumed_medium_default" | "not_applicable";
  nutrient_targets: FertilizerNutrientTargets;
  previous_crop_n_credit_kg_acre: number;
  bags: FertilizerBags;
  micronutrient_notes: string[];
  timing: FertilizerTimingEvent[];
  evidence: FertilizerEvidenceClassification;
  confidence: string;
  warnings: string[];
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
