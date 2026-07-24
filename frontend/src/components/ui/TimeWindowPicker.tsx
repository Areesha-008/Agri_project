"use client";

import { useId, useState } from "react";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Button } from "@/components/ui/Button";

export interface DateRange {
  start_date: string;
  end_date: string;
}

interface TimeWindowPickerProps {
  /** null = using the server's default window (no explicit selection yet). */
  value: DateRange | null;
  onChange: (range: DateRange) => void;
  disabled?: boolean;
  className?: string;
}

export function toLocalIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalIso(d);
}

export function todayIso(): string {
  return toLocalIso(new Date());
}

const PRESET_DAYS = [7, 30, 90] as const;

export function TimeWindowPicker({ value, onChange, disabled, className = "" }: TimeWindowPickerProps) {
  const { t } = useTranslation();
  const fromId = useId();
  const toId = useId();
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(value?.start_date ?? isoDaysAgo(30));
  const [customEnd, setCustomEnd] = useState(value?.end_date ?? todayIso());

  const activePreset = PRESET_DAYS.find(
    (days) => value?.start_date === isoDaysAgo(days) && value?.end_date === todayIso()
  );

  function pickPreset(days: number) {
    const start = isoDaysAgo(days);
    const end = todayIso();
    setCustomStart(start);
    setCustomEnd(end);
    setCustomOpen(false);
    onChange({ start_date: start, end_date: end });
  }

  function applyCustom() {
    setCustomOpen(false);
    onChange({ start_date: customStart, end_date: customEnd });
  }

  const presetLabel: Record<number, string> = {
    7: t("windowLast7d"),
    30: t("windowLast30d"),
    90: t("windowLast90d"),
  };

  return (
    <div className={`relative flex flex-wrap items-center gap-1.5 rounded-lg bg-cream-inset p-0.5 ${className}`}>
      {PRESET_DAYS.map((days) => (
        <button
          key={days}
          type="button"
          disabled={disabled}
          aria-pressed={activePreset === days}
          onClick={() => pickPreset(days)}
          className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            activePreset === days ? "bg-forest-900 text-white" : "text-ink-600 hover:text-ink-900"
          }`}
        >
          {presetLabel[days]}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!activePreset && Boolean(value)}
        onClick={() => setCustomOpen((open) => !open)}
        className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          !activePreset && value ? "bg-forest-900 text-white" : "text-ink-600 hover:text-ink-900"
        }`}
      >
        {t("windowCustom")}
      </button>

      {customOpen && (
        <div className="absolute right-0 top-9 z-20 w-64 rounded-xl border border-border bg-cream-card p-3 shadow-dropdown">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-1">
              <label htmlFor={fromId} className="text-xs font-semibold text-ink-600">
                {t("windowFrom")}
              </label>
              <input
                id={fromId}
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="jk-focus rounded-[10px] border border-input-border bg-cream-card px-3.5 py-2.5 text-[13.5px] text-ink-900 focus:border-forest-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={toId} className="text-xs font-semibold text-ink-600">
                {t("windowTo")}
              </label>
              <input
                id={toId}
                type="date"
                value={customEnd}
                min={customStart}
                max={todayIso()}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="jk-focus rounded-[10px] border border-input-border bg-cream-card px-3.5 py-2.5 text-[13.5px] text-ink-900 focus:border-forest-500"
              />
            </div>
            <Button
              variant="primary"
              className="px-3 py-2 text-xs"
              onClick={applyCustom}
              disabled={!customStart || !customEnd}
            >
              {t("windowApply")}
            </Button>
            <div className="text-[10.5px] leading-snug text-ink-400">{t("windowRevisitCaption")}</div>
          </div>
        </div>
      )}
    </div>
  );
}
