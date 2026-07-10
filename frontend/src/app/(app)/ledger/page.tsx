"use client";

import { useState } from "react";
import { useCreateLedgerEntry, useFields, useLedgerEntries, useReport } from "@/lib/api/hooks";
import { ledgerApi } from "@/lib/api/resources";
import { useAppStore } from "@/lib/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { LedgerCategory } from "@/lib/api/types";

const CATEGORIES: LedgerCategory[] = ["Fertilizer", "Irrigation", "Spray", "Operation", "Scan"];
const CATEGORY_DOT: Record<LedgerCategory, string> = {
  Fertilizer: "#40916C",
  Irrigation: "#4E8DBF",
  Spray: "#C1512F",
  Scan: "#B07D2B",
  Operation: "#8a927f",
};
const CATEGORY_TAG: Record<LedgerCategory, string> = {
  Fertilizer: "bg-mint-100 text-forest-700",
  Irrigation: "bg-info-blue-bg text-info-blue-text",
  Spray: "bg-alert-red-bg text-down-red",
  Scan: "bg-alert-amber-bg text-alert-amber-text",
  Operation: "bg-cream-inset text-ink-500",
};

export default function LedgerPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const { data: fields } = useFields();
  const { data: entries } = useLedgerEntries();
  const { data: report } = useReport();
  const createEntry = useCreateLedgerEntry();

  const [category, setCategory] = useState<LedgerCategory>("Fertilizer");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [fieldId, setFieldId] = useState(selectedFieldId ?? "");
  const [reportOpen, setReportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetFieldId = fieldId || fields?.[0]?.id;
    if (!targetFieldId) return;
    const fieldName = fields?.find((f) => f.id === targetFieldId)?.name ?? "";
    await createEntry.mutateAsync({
      field_id: targetFieldId,
      title: `${category} logged`,
      detail: [quantity, note, fieldName].filter(Boolean).join(" · "),
      category,
    });
    setQuantity("");
    setNote("");
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const blob = await ledgerApi.downloadReportPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "production-report.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <div className="text-lg font-bold text-ink-900">Digital Ledger</div>

      <div id="ledgerWrap" className="flex flex-col gap-3.5 lg:flex-row">
        <div className="flex flex-1 flex-col gap-3.5">
          <Card>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2.5">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as LedgerCategory)}
                className="rounded-[10px] border border-input-border bg-cream-card px-3 py-2.5 text-[13px]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={fieldId || fields?.[0]?.id || ""}
                onChange={(e) => setFieldId(e.target.value)}
                className="rounded-[10px] border border-input-border bg-cream-card px-3 py-2.5 text-[13px]"
              >
                {fields?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                placeholder="e.g. 2 bags urea/acre"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="min-w-[160px] flex-1 rounded-[10px] border border-input-border bg-cream-card px-3 py-2.5 text-[13px]"
              />
              <input
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-w-[160px] flex-1 rounded-[10px] border border-input-border bg-cream-card px-3 py-2.5 text-[13px]"
              />
              <Button type="submit" disabled={createEntry.isPending}>
                Log action
              </Button>
            </form>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="text-sm font-bold">Timeline</div>
            <div className="flex flex-col">
              {entries?.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 border-b border-cream-inset py-3 last:border-0">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: CATEGORY_DOT[entry.category] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink-900">{entry.title}</div>
                    <div className="text-xs text-ink-400">{entry.detail}</div>
                  </div>
                  <span className={`flex-none rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${CATEGORY_TAG[entry.category]}`}>
                    {entry.category}
                  </span>
                  <span className="flex-none text-[10.5px] text-ink-400">
                    {new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              ))}
              {entries?.length === 0 && <div className="text-xs text-ink-400">No ledger entries yet.</div>}
            </div>
          </Card>
        </div>

        <div id="ledgerSide" className="w-full lg:w-[280px]">
          <Card className="flex flex-col gap-3">
            <div className="text-sm font-bold">Production report builder</div>
            <div className="text-xs leading-relaxed text-ink-500">
              Compiles acreage, live health data and calculated fertilizer requirements across all fields into a
              printable report.
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <Row label="Total farm area" value={`${report?.total_hectares ?? "—"} ha`} />
              <Row label="Fields tracked" value={report?.field_count ?? "—"} />
              <Row label="Avg. health score" value={`${report?.avg_health_score ?? "—"}%`} valueColor="#2D6A4F" />
              <Row label="Urea requirement" value={`${report?.urea_bags ?? "—"} bags`} />
              <Row label="DAP requirement" value={`${report?.dap_bags ?? "—"} bags`} />
              <Row label="Ledger entries" value={report?.ledger_entry_count ?? "—"} />
            </div>
            <Button onClick={() => setReportOpen(true)}>Download production PDF report</Button>
          </Card>
        </div>
      </div>

      {reportOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-6"
          onClick={() => setReportOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-[520px] max-w-full flex-col gap-3.5 overflow-auto rounded-2xl bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,.3)]"
          >
            <div className="flex items-center gap-2.5 border-b-2 border-forest-900 pb-3.5">
              <div className="flex-1">
                <div className="text-[15px] font-extrabold text-forest-900">Production Report</div>
                <div className="text-[10.5px] text-ink-400">Jadeed Kashtkar</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Hectares" value={report?.total_hectares ?? "—"} color="#1B4332" />
              <Stat label="Avg Health" value={`${report?.avg_health_score ?? "—"}%`} color="#2D6A4F" />
              <Stat label="Fields" value={report?.field_count ?? "—"} color="#1e2b23" />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">FIELD SUMMARY</div>
              {report?.field_summaries.map((fs) => (
                <div key={fs.name} className="flex items-center gap-2 border-b border-dashed border-[#EAE7DA] py-1.5 text-xs">
                  <span className="flex-1 font-bold">{fs.name}</span>
                  <span className="text-ink-500">{fs.crop ?? "—"}</span>
                  <span className="w-14 text-right">{fs.area_hectares ?? "—"} ha</span>
                  <span className="w-16 text-right font-bold text-forest-700">
                    NDVI {fs.ndvi_mean?.toFixed(2) ?? "—"}
                  </span>
                  <span className="w-11 text-right font-bold">{fs.health_score ?? "—"}%</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">
                CALCULATED FERTILIZER REQUIREMENT
              </div>
              <div className="flex gap-2 text-xs">
                <div className="flex-1 rounded-[10px] bg-cream-inset p-2.5">
                  Urea (46-0-0)
                  <div className="text-[15px] font-extrabold text-forest-900">{report?.urea_bags ?? "—"} bags</div>
                </div>
                <div className="flex-1 rounded-[10px] bg-cream-inset p-2.5">
                  DAP (18-46-0)
                  <div className="text-[15px] font-extrabold text-forest-900">{report?.dap_bags ?? "—"} bags</div>
                </div>
                <div className="flex-1 rounded-[10px] bg-cream-inset p-2.5">
                  SOP (0-0-50)
                  <div className="text-[15px] font-extrabold text-forest-900">{report?.sop_bags ?? "—"} bags</div>
                </div>
              </div>
            </div>
            <div className="border-t border-[#EAE7DA] pt-2.5 text-[10px] text-ink-400">
              Data: Sentinel-2 L2A via CDSE/openEO · Fertilizer rates per PARC guidance, verify with local extension
              officer.
            </div>
            <div className="flex gap-2.5">
              <Button className="flex-1" onClick={handleDownloadPdf} disabled={downloading}>
                {downloading ? "Preparing…" : "Download PDF report"}
              </Button>
              <Button variant="secondary" onClick={() => setReportOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-500">{label}</span>
      <b style={valueColor ? { color: valueColor } : undefined}>{value}</b>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-[10px] bg-cream-inset p-2.5">
      <div className="text-lg font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-[9.5px] font-semibold text-ink-400">{label}</div>
    </div>
  );
}
