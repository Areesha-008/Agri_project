"use client";

import { useRouter } from "next/navigation";
import { useSettings, useUpdateSettings } from "@/lib/api/hooks";
import { ledgerApi } from "@/lib/api/resources";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import type { Mandi } from "@/lib/api/types";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const { lang, setLang } = useTranslation();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  function handleSignOut() {
    logout();
    router.push("/login");
  }

  async function handleDownloadData() {
    const blob = await ledgerApi.downloadReportPdf();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-data-report.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <div className="text-lg font-bold text-ink-900">Settings</div>

      <div id="setGrid" className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Profile */}
        <Card className="flex flex-col">
          <div className="pb-1.5 text-[13px] font-bold">Profile</div>
          <SettingsRow label="Email" value={user?.email ?? "—"} />
          <SettingsRow label="Member since" value={user ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—"} first={false} last />
        </Card>

        {/* Preferences */}
        <Card className="flex flex-col">
          <div className="pb-1.5 text-[13px] font-bold">Preferences</div>
          <div className="flex items-center gap-2.5 border-t border-cream-inset py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">Language</div>
              <div className="text-[11px] text-ink-400">App text and alerts</div>
            </div>
            <div className="flex overflow-hidden rounded-lg border border-input-border text-[11.5px] font-semibold">
              <button
                onClick={() => setLang("en")}
                className={`cursor-pointer px-3 py-1.5 ${lang === "en" ? "bg-forest-900 text-white" : "text-ink-500"}`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("ur")}
                className={`cursor-pointer px-3 py-1.5 leading-[1.7] ${lang === "ur" ? "bg-forest-900 text-white" : "text-ink-500"}`}
              >
                اردو
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-t border-cream-inset py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">Yield units</div>
              <div className="text-[11px] text-ink-400">How projections are shown</div>
            </div>
            <div className="flex rounded-lg bg-cream-inset p-0.5 text-[11.5px] font-semibold">
              {(["maund_per_acre", "t_per_ha"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => updateSettings.mutate({ yield_unit: u })}
                  className="cursor-pointer rounded-md px-2.5 py-1.5"
                  style={settings?.yield_unit === u ? { background: "#1B4332", color: "#fff" } : undefined}
                >
                  {u === "maund_per_acre" ? "maund/acre" : "t/ha"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-t border-cream-inset py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">Default mandi</div>
              <div className="text-[11px] text-ink-400">Market rates shown first</div>
            </div>
            <div className="flex rounded-lg bg-cream-inset p-0.5 text-[11.5px] font-semibold">
              {(["faisalabad", "lahore", "multan"] as Mandi[]).map((m) => (
                <button
                  key={m}
                  onClick={() => updateSettings.mutate({ default_mandi: m })}
                  className="cursor-pointer rounded-md px-2.5 py-1.5 capitalize"
                  style={settings?.default_mandi === m ? { background: "#1B4332", color: "#fff" } : undefined}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Alerts */}
        <Card className="flex flex-col">
          <div className="pb-1.5 text-[13px] font-bold">Alerts &amp; notifications</div>
          <ToggleRow
            label="Pest & disease alerts"
            desc="Rust, blight and insect outbreak warnings"
            checked={settings?.alert_pest ?? false}
            onChange={(v) => updateSettings.mutate({ alert_pest: v })}
          />
          <ToggleRow
            label="Weather warnings"
            desc="Monsoon, heatwave and frost advisories"
            checked={settings?.alert_weather ?? false}
            onChange={(v) => updateSettings.mutate({ alert_weather: v })}
          />
          <ToggleRow
            label="Mandi price alerts"
            desc="Notify when your crop moves more than 2%"
            checked={settings?.alert_price ?? false}
            onChange={(v) => updateSettings.mutate({ alert_price: v })}
          />
          <ToggleRow
            label="SMS fallback"
            desc="Send critical alerts by SMS when offline (coming soon)"
            checked={settings?.alert_sms ?? false}
            onChange={(v) => updateSettings.mutate({ alert_sms: v })}
            last
          />
        </Card>

        {/* Data & account */}
        <Card className="flex flex-col">
          <div className="pb-1.5 text-[13px] font-bold">Data &amp; account</div>
          <div className="flex items-center gap-2.5 border-t border-cream-inset py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">Satellite sync</div>
              <div className="text-[11px] text-ink-400">Sentinel-2 · CDSE</div>
            </div>
            <div className="flex-none rounded-md bg-mint-100 px-2.5 py-1 text-[11px] font-bold text-forest-700">ACTIVE</div>
          </div>
          <button
            onClick={handleDownloadData}
            className="flex cursor-pointer items-center gap-2.5 border-t border-cream-inset py-2.5 text-left hover:bg-[#FBFAF4]"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">Download my data</div>
              <div className="text-[11px] text-ink-400">Fields, readings and ledger as a PDF report</div>
            </div>
          </button>
          <button
            onClick={handleSignOut}
            className="mt-1 cursor-pointer rounded-lg bg-alert-red-bg px-3 py-2.5 text-left text-[12.5px] font-semibold text-alert-red-text"
          >
            Sign out
          </button>
        </Card>
      </div>
    </div>
  );
}

function SettingsRow({ label, value, first = true, last = false }: { label: string; value: string; first?: boolean; last?: boolean }) {
  return (
    <div className={`flex justify-between py-2.5 text-[12.5px] ${!first ? "border-t border-cream-inset" : ""} ${last ? "pb-0" : ""}`}>
      <span className="text-ink-500">{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  last = false,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 border-t border-cream-inset py-2.5 ${last ? "pb-0" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold">{label}</div>
        <div className="text-[11px] text-ink-400">{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
