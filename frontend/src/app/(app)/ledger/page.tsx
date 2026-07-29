"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  useCreateLedgerCategory,
  useCreateLedgerEntry,
  useFields,
  useLedgerCategories,
  useLedgerEntries,
  useReport,
} from "@/lib/api/hooks";
import { ledgerApi } from "@/lib/api/resources";
import { useAppStore } from "@/lib/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { NavIcons } from "@/components/layout/icons";
import type { LedgerEntryType } from "@/lib/api/types";

// select-only addition to INPUT_CLASS: resets native OS chrome (the
// double-arrow stepper Safari renders on an unstyled <select>) in favor of
// the app's own chevron icon, matching every other dropdown in the app.
const SELECT_CLASS = "appearance-none pr-7";

const BUILTIN_CATEGORIES = ["Fertilizer", "Irrigation", "Spray", "Operation", "Scan", "Sale"];
// Custom heads fall back to a neutral dot/tag — only the built-ins are themed.
const CATEGORY_DOT: Record<string, string> = {
  Fertilizer: "#40916C",
  Irrigation: "#4E8DBF",
  Spray: "#C1512F",
  Scan: "#B07D2B",
  Operation: "#8a927f",
  Sale: "#2D6A4F",
};
const CATEGORY_TAG: Record<string, string> = {
  Fertilizer: "bg-mint-100 text-forest-700",
  Irrigation: "bg-info-blue-bg text-info-blue-text",
  Spray: "bg-alert-red-bg text-down-red",
  Scan: "bg-alert-amber-bg text-alert-amber-text",
  Operation: "bg-cream-inset text-ink-500",
  Sale: "bg-mint-100 text-forest-700",
};
const DEFAULT_DOT = "var(--color-ink-400)";
const DEFAULT_TAG = "bg-cream-inset text-ink-500";

// h-10 is explicit (not left to py-* parity) because native <select>/<input
// type=number> add their own intrinsic height on top of padding — relying on
// matching padding alone left this row's controls a few px off from each other.
const INPUT_CLASS =
  "jk-focus h-10 rounded-[10px] border border-input-border bg-cream-card px-3.5 py-2.5 text-[13.5px] text-ink-900 placeholder:text-ink-600 placeholder:opacity-100 focus:border-forest-500";

function pkr(value: number | null | undefined): string {
  return value == null ? "—" : `PKR ${value.toLocaleString()}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "field";
}

export default function LedgerPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const { data: fields } = useFields();
  const { data: entries } = useLedgerEntries();
  const [reportFieldId, setReportFieldId] = useState(selectedFieldId ?? "");
  const activeReportFieldId = reportFieldId || fields?.[0]?.id;
  const { data: report } = useReport(activeReportFieldId);
  const { data: categories } = useLedgerCategories();
  const createEntry = useCreateLedgerEntry();
  const createCategory = useCreateLedgerCategory();

  const categoryList = categories ?? BUILTIN_CATEGORIES;

  const [category, setCategory] = useState<string>("Fertilizer");
  const [entryType, setEntryType] = useState<LedgerEntryType>("expense");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [fieldId, setFieldId] = useState(selectedFieldId ?? "");
  const [newHead, setNewHead] = useState("");
  const [addingHead, setAddingHead] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const idPrefix = useId();
  const categoryFieldId = `${idPrefix}category`;
  const newHeadFieldId = `${idPrefix}new-head`;
  const targetFieldFieldId = `${idPrefix}target-field`;
  const reportFieldSelectId = `${idPrefix}report-field`;
  const amountFieldId = `${idPrefix}amount`;
  const quantityFieldId = `${idPrefix}quantity`;
  const noteFieldId = `${idPrefix}note`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetFieldId = fieldId || fields?.[0]?.id;
    if (!targetFieldId) return;
    const fieldName = fields?.find((f) => f.id === targetFieldId)?.name ?? "";
    const parsed = amount.trim() === "" ? null : Number(amount);
    await createEntry.mutateAsync({
      field_id: targetFieldId,
      title: entryType === "income" ? `${category} — sold` : `${category} logged`,
      detail: [quantity, note, fieldName].filter(Boolean).join(" · "),
      category,
      amount: parsed != null && Number.isFinite(parsed) ? parsed : null,
      entry_type: entryType,
    });
    setAmount("");
    setQuantity("");
    setNote("");
  }

  async function handleAddHead() {
    const name = newHead.trim();
    if (!name) return;
    await createCategory.mutateAsync(name);
    setCategory(name);
    setNewHead("");
    setAddingHead(false);
  }

  async function handleDownloadPdf() {
    if (!activeReportFieldId) return;
    setDownloading(true);
    try {
      const blob = await ledgerApi.downloadReportPdf(activeReportFieldId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `production-report-${slugify(report?.field_name ?? "field")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <h1 className="text-lg font-bold text-ink-900">Digital Ledger</h1>

      <div id="ledgerWrap" className="flex flex-col gap-3.5 lg:flex-row">
        <div className="flex flex-1 flex-col gap-3.5">
          <Card>
            {fields && fields.length === 0 ? (
              <div className="flex flex-col items-start gap-2">
                <div className="text-sm font-bold text-ink-900">No fields yet</div>
                <div className="text-xs text-ink-500">
                  Draw a field first — every ledger entry and report is tied to one.
                </div>
                <Link
                  href="/fields"
                  className="mt-1 cursor-pointer rounded-btn bg-forest-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-forest-700"
                >
                  Draw your first field
                </Link>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2.5">
              {/* Expense (money out) vs. Sold (income). */}
              <div
                role="group"
                aria-label="Entry type"
                className="flex rounded-lg bg-cream-inset p-0.5 text-[12.5px] font-semibold"
              >
                {(["expense", "income"] as LedgerEntryType[]).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setEntryType(tp)}
                    aria-pressed={entryType === tp}
                    className="h-10 cursor-pointer rounded-md px-3"
                    style={entryType === tp ? { background: "var(--color-forest-900)", color: "#fff" } : undefined}
                  >
                    {tp === "expense" ? "Expense" : "Sold"}
                  </button>
                ))}
              </div>

              {/* Category head — with an inline "create a new head" affordance. */}
              {addingHead ? (
                <div className="flex items-end gap-1.5">
                  <label htmlFor={newHeadFieldId} className="sr-only">
                    New head name
                  </label>
                  <input
                    id={newHeadFieldId}
                    autoFocus
                    placeholder="New head name"
                    value={newHead}
                    onChange={(e) => setNewHead(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddHead())}
                    className={`${INPUT_CLASS} w-[150px]`}
                  />
                  <Button
                    type="button"
                    onClick={handleAddHead}
                    disabled={createCategory.isPending || !newHead.trim()}
                    className="h-10 px-3 text-xs"
                  >
                    Add
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingHead(false);
                      setNewHead("");
                    }}
                    className="h-10 cursor-pointer px-1 text-xs font-semibold text-ink-400 hover:text-ink-900"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <label htmlFor={categoryFieldId} className="sr-only">
                    Category
                  </label>
                  <div className="relative">
                    <select
                      id={categoryFieldId}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={`${INPUT_CLASS} ${SELECT_CLASS}`}
                    >
                      {categoryList.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                      {NavIcons.chevron}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddingHead(true)}
                    title="Create a new head"
                    className="h-10 cursor-pointer rounded-lg border border-input-border px-2.5 text-xs font-bold text-forest-700 hover:bg-mint-100"
                  >
                    + Head
                  </button>
                </div>
              )}

              <label htmlFor={targetFieldFieldId} className="sr-only">
                Field
              </label>
              <div className="relative">
                <select
                  id={targetFieldFieldId}
                  value={fieldId || fields?.[0]?.id || ""}
                  onChange={(e) => setFieldId(e.target.value)}
                  className={`${INPUT_CLASS} ${SELECT_CLASS}`}
                >
                  {fields?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                  {NavIcons.chevron}
                </span>
              </div>
              <label htmlFor={amountFieldId} className="sr-only">
                Amount in PKR
              </label>
              <input
                id={amountFieldId}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Amount (PKR)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${INPUT_CLASS} w-[140px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
              />
              <label htmlFor={quantityFieldId} className="sr-only">
                Quantity
              </label>
              <input
                id={quantityFieldId}
                placeholder={entryType === "income" ? "e.g. 40 maund wheat" : "e.g. 2 bags urea/acre"}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={`${INPUT_CLASS} min-w-[160px] flex-1`}
              />
              <label htmlFor={noteFieldId} className="sr-only">
                Note
              </label>
              <input
                id={noteFieldId}
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={`${INPUT_CLASS} min-w-[160px] flex-1`}
              />
              <Button type="submit" disabled={createEntry.isPending} className="h-10">
                Log action
              </Button>
            </form>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="text-sm font-bold">Timeline</div>
            <div className="flex flex-col">
              {entries?.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 border-b border-cream-inset py-3 last:border-0">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: CATEGORY_DOT[entry.category] ?? DEFAULT_DOT }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink-900">{entry.title}</div>
                    <div className="text-xs text-ink-400">{entry.detail}</div>
                  </div>
                  {entry.amount != null && (
                    <span
                      className="flex-none whitespace-nowrap text-[12px] font-bold"
                      style={{ color: entry.entry_type === "income" ? "var(--color-forest-ink-700)" : "var(--color-down-red)" }}
                    >
                      {entry.entry_type === "income" ? "+" : "−"}
                      {pkr(entry.amount)}
                    </span>
                  )}
                  <span className={`flex-none rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${CATEGORY_TAG[entry.category] ?? DEFAULT_TAG}`}>
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
              Compiles one field&apos;s acreage, live health data, and transaction log into a printable report.
            </div>
            <div>
              <label htmlFor={reportFieldSelectId} className="sr-only">
                Report field
              </label>
              <div className="relative">
                <select
                  id={reportFieldSelectId}
                  value={activeReportFieldId ?? ""}
                  onChange={(e) => setReportFieldId(e.target.value)}
                  className={`${INPUT_CLASS} ${SELECT_CLASS} w-full`}
                >
                  {fields?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                  {NavIcons.chevron}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-xs">
              <Row label="Field area" value={report?.area_hectares != null ? `${report.area_hectares.toFixed(1)} ha` : "—"} />
              <Row label="Crop" value={report?.crop ?? "—"} />
              <Row label="NDVI" value={report?.ndvi_mean != null ? report.ndvi_mean.toFixed(2) : "—"} valueColor="#2D6A4F" />
              <Row label="Health score" value={report?.health_score != null ? `${report.health_score}%` : "—"} valueColor="#2D6A4F" />
              <Row label="Total spent" value={pkr(report?.total_spent)} valueColor="#B4362A" />
              <Row label="Total earned" value={pkr(report?.total_earned)} valueColor="#2D6A4F" />
              <Row
                label="Net"
                value={pkr(report?.net)}
                valueColor={report && report.net >= 0 ? "#2D6A4F" : "#B4362A"}
              />
            </div>
            <Button onClick={() => setReportOpen(true)} disabled={!activeReportFieldId}>
              Download production PDF report
            </Button>
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
            className="flex max-h-[90vh] w-[520px] max-w-full flex-col gap-3.5 overflow-auto rounded-2xl bg-cream-card p-7 shadow-[0_24px_60px_rgba(0,0,0,.3)]"
          >
            <div className="flex items-center gap-2.5 border-b-2 border-forest-ink-900 pb-3.5">
              <div className="flex-1">
                <div className="text-[15px] font-extrabold text-forest-ink-900">Production Report</div>
                <div className="text-[10.5px] text-ink-400">Jadeed Kashtkar</div>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-extrabold text-forest-ink-900">{report?.field_name ?? "—"}</span>
              <span className="text-[11px] text-ink-400">{report?.crop ?? "—"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Hectares" value={report?.area_hectares != null ? report.area_hectares.toFixed(1) : "—"} color="var(--color-forest-ink-900)" />
              <Stat label="NDVI" value={report?.ndvi_mean != null ? report.ndvi_mean.toFixed(2) : "—"} color="var(--color-forest-ink-700)" />
              <Stat label="Health" value={report?.health_score != null ? `${report.health_score}%` : "—"} color="var(--color-ink-900)" />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">TRANSACTIONS</div>
              {report?.transactions.length === 0 && (
                <div className="text-xs text-ink-400">No transactions yet.</div>
              )}
              {report?.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-2 border-b border-dashed border-[#EAE7DA] py-1.5 text-xs">
                  <span className="w-14 flex-none text-[10.5px] text-ink-400">
                    {new Date(tx.timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink-900">{tx.title}</span>
                    <span className="block truncate text-[11px] text-ink-400">{tx.detail}</span>
                  </span>
                  <span
                    className="flex-none whitespace-nowrap text-[12px] font-bold"
                    style={{
                      color:
                        tx.amount == null
                          ? "var(--color-ink-400)"
                          : tx.entry_type === "income"
                            ? "var(--color-forest-ink-700)"
                            : "var(--color-down-red)",
                    }}
                  >
                    {tx.amount == null ? "—" : `${tx.entry_type === "income" ? "+" : "−"}${pkr(tx.amount)}`}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.06em] text-ink-400">FINANCIAL SUMMARY</div>
              <div className="flex gap-2 text-xs">
                <div className="flex-1 rounded-[10px] bg-cream-inset p-2.5">
                  Total spent
                  <div className="text-[15px] font-extrabold" style={{ color: "#B4362A" }}>{pkr(report?.total_spent)}</div>
                </div>
                <div className="flex-1 rounded-[10px] bg-cream-inset p-2.5">
                  Total earned
                  <div className="text-[15px] font-extrabold text-forest-ink-900">{pkr(report?.total_earned)}</div>
                </div>
                <div className="flex-1 rounded-[10px] bg-cream-inset p-2.5">
                  Net
                  <div
                    className="text-[15px] font-extrabold"
                    style={{ color: report && report.net >= 0 ? "var(--color-forest-ink-900)" : "#B4362A" }}
                  >
                    {pkr(report?.net)}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-[#EAE7DA] pt-2.5 text-[10px] text-ink-400">
              Data: Sentinel-2 L2A via CDSE/openEO
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
