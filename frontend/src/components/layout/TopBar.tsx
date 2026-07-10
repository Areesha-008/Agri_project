"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAlerts, useDismissAlert, useFields } from "@/lib/api/hooks";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useAppStore } from "@/lib/store/useAppStore";
import { NavIcons } from "./icons";

function FieldSwitcher() {
  const { data: fields } = useFields();
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const setSelectedFieldId = useAppStore((s) => s.setSelectedFieldId);
  const fieldMenuOpen = useAppStore((s) => s.fieldMenuOpen);
  const toggleFieldMenu = useAppStore((s) => s.toggleFieldMenu);

  useEffect(() => {
    if (!selectedFieldId && fields && fields.length > 0) {
      setSelectedFieldId(fields[0].id);
    }
  }, [fields, selectedFieldId, setSelectedFieldId]);

  const selected = fields?.find((f) => f.id === selectedFieldId);

  return (
    <div className="relative">
      <button
        onClick={toggleFieldMenu}
        className="flex cursor-pointer items-center gap-2 rounded-[9px] border border-input-border bg-cream-inset px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 hover:bg-[#ECE8D9]"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-forest-500" />
        {selected ? `${selected.name} · ${selected.area_hectares ?? "—"} ha` : "No fields yet"}
        {NavIcons.chevron}
      </button>
      {fieldMenuOpen && fields && fields.length > 0 && (
        <div className="absolute left-0 top-11 z-[60] w-64 rounded-xl border border-border bg-white p-1.5 shadow-dropdown">
          {fields.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setSelectedFieldId(f.id);
                toggleFieldMenu();
              }}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-cream-inset ${
                f.id === selectedFieldId ? "bg-cream-inset" : ""
              }`}
            >
              <span className="h-2 w-2 flex-none rounded-full bg-forest-500" />
              <span className="flex-1 text-[12.5px] font-semibold text-ink-900">{f.name}</span>
              <span className="text-[11px] text-ink-400">{f.area_hectares ?? "—"} ha</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsBell() {
  const { data: alerts } = useAlerts(false);
  const dismissAlert = useDismissAlert();
  const notifOpen = useAppStore((s) => s.notifOpen);
  const toggleNotif = useAppStore((s) => s.toggleNotif);
  const activeCount = alerts?.length ?? 0;

  return (
    <div className="relative">
      <button
        onClick={toggleNotif}
        className="relative grid h-8.5 w-8.5 cursor-pointer place-items-center rounded-[9px] border border-input-border bg-white text-ink-600 hover:bg-cream-bg"
      >
        {NavIcons.bell}
        {activeCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 rounded-lg bg-alert-red px-1.5 py-px text-[9px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
      {notifOpen && (
        <div className="absolute right-0 top-11 z-[60] flex w-80 flex-col gap-2 rounded-2xl border border-border bg-white p-2.5 shadow-dropdown">
          <div className="px-1 py-0.5 text-xs font-bold text-ink-900">Alerts</div>
          {activeCount === 0 && <div className="px-1 py-2 text-xs text-ink-400">No active alerts.</div>}
          {alerts?.map((alert) => (
            <div key={alert.id} className="rounded-xl border border-alert-red-border bg-alert-red-bg p-2.5">
              <div className="text-xs font-bold text-alert-red-text">{alert.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-alert-red-body">{alert.message}</div>
              <button
                onClick={() => dismissAlert.mutate(alert.id)}
                className="mt-1.5 cursor-pointer text-[11px] font-semibold text-forest-700"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const { lang, setLang } = useTranslation();

  return (
    <div
      id="jkTop"
      className="relative z-30 flex h-15 flex-none items-center gap-3 border-b border-border bg-cream-card px-5.5"
    >
      <FieldSwitcher />
      <div className="flex-1" />
      <div className="hidden overflow-hidden rounded-lg border border-input-border text-[11.5px] font-semibold sm:flex">
        <button
          onClick={() => setLang("en")}
          className={`cursor-pointer px-2.5 py-1.5 ${lang === "en" ? "bg-forest-900 text-white" : "text-ink-500"}`}
        >
          EN
        </button>
        <button
          onClick={() => setLang("ur")}
          className={`cursor-pointer px-2.5 py-1.5 leading-[1.7] ${lang === "ur" ? "bg-forest-900 text-white" : "text-ink-500"}`}
        >
          اردو
        </button>
      </div>
      <Link
        href="/settings"
        className="grid h-8.5 w-8.5 place-items-center rounded-[9px] border border-input-border bg-white text-ink-600 hover:bg-cream-bg"
      >
        {NavIcons.settings}
      </Link>
      <NotificationsBell />
    </div>
  );
}
