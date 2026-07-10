import { api, getToken } from "./client";
import type {
  Alert,
  CropHealthResponse,
  FieldCreateResponse,
  FieldListItem,
  FieldNdviLatestResponse,
  FieldResponse,
  LedgerEntry,
  LedgerEntryCreate,
  Mandi,
  MandiRate,
  MessageResponse,
  NdviJobStatusResponse,
  PolygonGeometry,
  Report,
  Scan,
  Token,
  User,
  UserSettings,
  UserSettingsUpdate,
  ForecastDay,
} from "./types";

// --- Auth ---
export const authApi = {
  signup: (email: string, password: string) => api.post<User>("/auth/signup", { email, password }),
  login: (email: string, password: string) => api.post<Token>("/auth/login", { email, password }),
  guest: () => api.post<Token>("/auth/guest"),
  me: () => api.get<User>("/auth/me"),
  forgotPassword: (email: string) => api.post<MessageResponse>("/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post<MessageResponse>("/auth/reset-password", { token, new_password: newPassword }),
};

// --- Fields ---
export interface CreateFieldInput {
  name: string;
  geometry: PolygonGeometry;
  district?: string;
  crop?: string;
}

export const fieldsApi = {
  list: () => api.get<FieldListItem[]>("/fields"),
  get: (id: string) => api.get<FieldResponse>(`/fields/${id}`),
  create: (input: CreateFieldInput) => api.post<FieldCreateResponse>("/fields", input),
  getJob: (fieldId: string, jobId: string) =>
    api.get<NdviJobStatusResponse>(`/fields/${fieldId}/jobs/${jobId}`),
  getNdvi: (fieldId: string) => api.get<FieldNdviLatestResponse>(`/fields/${fieldId}/ndvi`),
  getCropHealth: (fieldId: string) => api.get<CropHealthResponse>(`/fields/${fieldId}/crop-health`),
  delete: (fieldId: string) => api.delete<void>(`/fields/${fieldId}`),
};

// --- Settings ---
export const settingsApi = {
  get: () => api.get<UserSettings>("/settings"),
  update: (patch: UserSettingsUpdate) => api.patch<UserSettings>("/settings", patch),
};

// --- Mandi rates ---
export const mandiApi = {
  list: (mandi: Mandi) => api.get<MandiRate[]>(`/mandi-rates?mandi=${mandi}`),
};

// --- Weather ---
export const weatherApi = {
  forecast: (lat: number, lon: number) => api.get<ForecastDay[]>(`/weather?lat=${lat}&lon=${lon}`),
};

// --- Alerts ---
export const alertsApi = {
  list: (dismissed?: boolean) =>
    api.get<Alert[]>(`/alerts${dismissed !== undefined ? `?dismissed=${dismissed}` : ""}`),
  dismiss: (id: string) => api.post<Alert>(`/alerts/${id}/dismiss`),
};

// --- Ledger & report ---
export const ledgerApi = {
  list: () => api.get<LedgerEntry[]>("/ledger"),
  create: (entry: LedgerEntryCreate) => api.post<LedgerEntry>("/ledger", entry),
  report: () => api.get<Report>("/report"),
  // GET /report/pdf requires the JWT bearer header, so a plain <a href>
  // can't hit it directly — fetch as a blob and let the caller trigger
  // the download from an object URL instead.
  downloadReportPdf: async (): Promise<Blob> => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
    const token = getToken();
    const response = await fetch(`${base}/report/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error("Failed to download report");
    return response.blob();
  },
};

// --- Disease scanner ---
export const scansApi = {
  list: () => api.get<Scan[]>("/scans"),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    return api.postForm<Scan>("/scans", formData);
  },
  logToLedger: (scanId: string, fieldId: string) =>
    api.post<LedgerEntry>(`/scans/${scanId}/log-to-ledger`, { field_id: fieldId }),
};
