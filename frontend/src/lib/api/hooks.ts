"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  alertsApi,
  CreateFieldInput,
  fieldsApi,
  ledgerApi,
  mandiApi,
  scansApi,
  settingsApi,
  weatherApi,
} from "./resources";
import type { LedgerEntryCreate, Mandi, UserSettingsUpdate } from "./types";

export function useFields() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["fields"], queryFn: fieldsApi.list, enabled: isAuthenticated });
}

export function useField(fieldId: string | null) {
  return useQuery({
    queryKey: ["fields", fieldId],
    queryFn: () => fieldsApi.get(fieldId as string),
    enabled: Boolean(fieldId),
  });
}

export function useFieldNdvi(fieldId: string | null) {
  return useQuery({
    queryKey: ["fields", fieldId, "ndvi"],
    queryFn: () => fieldsApi.getNdvi(fieldId as string),
    enabled: Boolean(fieldId),
  });
}

export function useCropHealth(fieldId: string | null) {
  return useQuery({
    queryKey: ["fields", fieldId, "crop-health"],
    queryFn: () => fieldsApi.getCropHealth(fieldId as string),
    enabled: Boolean(fieldId),
  });
}

export function useNdviJob(fieldId: string | null, jobId: string | null) {
  return useQuery({
    queryKey: ["fields", fieldId, "jobs", jobId],
    queryFn: () => fieldsApi.getJob(fieldId as string, jobId as string),
    enabled: Boolean(fieldId && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 2000 : false;
    },
  });
}

/** Field list items don't include geometry — fetch full details for map rendering. */
export function useFieldGeometries(fieldIds: string[]) {
  return useQuery({
    queryKey: ["fields", "geometries", [...fieldIds].sort()],
    queryFn: async () => {
      const results = await Promise.all(fieldIds.map((id) => fieldsApi.get(id)));
      return Object.fromEntries(results.map((f) => [f.id, f.geometry]));
    },
    enabled: fieldIds.length > 0,
  });
}

export function useAllCropHealth(fieldIds: string[]) {
  return useQuery({
    queryKey: ["fields", "crop-health-all", [...fieldIds].sort()],
    queryFn: async () => {
      const results = await Promise.all(fieldIds.map((id) => fieldsApi.getCropHealth(id)));
      return Object.fromEntries(results.map((h) => [h.field_id, h]));
    },
    enabled: fieldIds.length > 0,
  });
}

export function useCreateField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFieldInput) => fieldsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fields"] }),
  });
}

export function useDeleteField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fieldId: string) => fieldsApi.delete(fieldId),
    // Only the list query, and only by its exact key: invalidateQueries
    // (and removeQueries) match by key *prefix* by default, and the caller
    // still has an active useField(selectedFieldId)/useFieldNdvi(...)
    // observer on ["fields", fieldId, ...] for a couple of renders after
    // this resolves (state updates are async) — touching that prefix here
    // makes the still-mounted observer refetch a field that no longer
    // exists. Clearing selectedFieldId is the caller's job.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fields"], exact: true }),
  });
}

export function useSettings() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["settings"], queryFn: settingsApi.get, enabled: isAuthenticated });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserSettingsUpdate) => settingsApi.update(patch),
    onSuccess: (data) => queryClient.setQueryData(["settings"], data),
  });
}

export function useMandiRates(mandi: Mandi) {
  return useQuery({ queryKey: ["mandi-rates", mandi], queryFn: () => mandiApi.list(mandi) });
}

export function useWeather(lat: number | null, lon: number | null) {
  return useQuery({
    queryKey: ["weather", lat, lon],
    queryFn: () => weatherApi.forecast(lat as number, lon as number),
    enabled: lat !== null && lon !== null,
  });
}

export function useAlerts(dismissed?: boolean) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["alerts", dismissed ?? "all"],
    queryFn: () => alertsApi.list(dismissed),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => alertsApi.dismiss(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useLedgerEntries() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["ledger"], queryFn: ledgerApi.list, enabled: isAuthenticated });
}

export function useCreateLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: LedgerEntryCreate) => ledgerApi.create(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
    },
  });
}

export function useReport() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["report"], queryFn: ledgerApi.report, enabled: isAuthenticated });
}

export function useScans() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: ["scans"], queryFn: scansApi.list, enabled: isAuthenticated });
}

export function useUploadScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => scansApi.upload(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scans"] }),
  });
}

export function useLogScanToLedger() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scanId, fieldId }: { scanId: string; fieldId: string }) =>
      scansApi.logToLedger(scanId, fieldId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ledger"] }),
  });
}
