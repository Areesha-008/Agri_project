"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/ui/Reveal";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { useTranslation } from "@/lib/i18n/useTranslation";

const HeroMap = dynamic(() => import("@/components/map/HeroMap").then((m) => m.HeroMap), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] animate-pulse rounded-card-lg bg-[#1a2417]" />
  ),
});

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAP_TILES_KEY ?? "";
const FIELDS_TILE_IMAGE = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/73.135,31.45,14.2,0/640x480@2x?access_token=${MAPBOX_TOKEN}`;

function LangToggle() {
  const { lang, setLang } = useTranslation();
  return (
    <div className="flex overflow-hidden rounded-lg border border-input-border text-[11.5px] font-semibold">
      <button
        onClick={() => setLang("en")}
        className={`px-2.5 py-1.5 ${lang === "en" ? "bg-forest-900 text-white" : "text-ink-500"}`}
      >
        EN
      </button>
      <button
        onClick={() => setLang("ur")}
        className={`px-2.5 py-1.5 ${lang === "ur" ? "bg-forest-900 text-white" : "text-ink-500"}`}
      >
        اردو
      </button>
    </div>
  );
}

function StatCounter({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-xl font-extrabold text-forest-900">{value}</div>
      <div className="text-[11.5px] text-ink-400">{label}</div>
    </div>
  );
}

export default function LandingPage() {
  const { t, dir } = useTranslation();

  const STEPS = [
    { step: "STEP 1", title: "Draw your field", body: "Trace your boundary on the satellite map. No account needed for your first analysis. We validate the polygon and compute the exact area." },
    { step: "STEP 2", title: "The satellite reads your crop", body: "Cloud-free Sentinel-2 scenes are processed into NDVI and moisture maps within minutes, with per-field statistics saved to your history." },
    { step: "STEP 3", title: "Act with confidence", body: "Irrigate the stressed patch, treat the rust early, sell on the up-day and keep a ledger record of everything you did." },
  ];

  return (
    <div className="flex min-h-screen flex-col" dir={dir}>
      {/* Nav */}
      <div className="sticky top-0 z-50 border-b border-border bg-cream-bg/92 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <Logo size={34} />
            <div>
              <div className="text-sm font-extrabold tracking-tight text-forest-900">Jadeed Kashtkar</div>
              <div className="text-[10.5px] leading-[1.6] text-ink-500" lang="ur">
                جدید کاشتکار
              </div>
            </div>
          </a>
          <div className="flex-1" />
          <div className="hidden items-center gap-5.5 text-[13px] font-semibold text-ink-600 sm:flex">
            <a href="#features">{t("landingNavFeatures")}</a>
            <a href="#how">{t("landingNavHow")}</a>
            <a href="#mission">{t("landingNavMission")}</a>
          </div>
          <LangToggle />
          <Link href="/login" className="hidden text-[13px] font-semibold text-forest-900 sm:inline">
            {t("signIn")}
          </Link>
          <Link
            href="/signup"
            className="rounded-[10px] bg-forest-900 px-4.5 py-2.5 text-[13px] font-bold text-white shadow-[0_1px_2px_rgba(27,67,50,.25)] hover:bg-forest-700"
          >
            {t("createAccount")}
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div id="top" className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-11 px-6 pb-14 pt-16 md:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-5">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-mint-border bg-mint-100 px-3.5 py-1.5 text-xs font-semibold text-forest-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forest-500" />
            {t("landingBadge")}
          </div>
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.12] tracking-tight text-ink-900 md:text-[46px]">
            {t("landingHeadline1")} <span className="text-forest-700">{t("landingHeadline2")}</span> {t("landingHeadline3")}
          </h1>
          <p className="m-0 max-w-[480px] text-base leading-[1.65] text-[#5a6a5e]">{t("landingSubcopy")}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3.5">
            <Link
              href="/signup"
              className="rounded-xl bg-forest-900 px-6.5 py-3.5 text-[14.5px] font-bold text-white shadow-[0_2px_6px_rgba(27,67,50,.28)] hover:bg-forest-700"
            >
              {t("landingCtaPrimary")}
            </Link>
            <a href="#features" className="px-2.5 py-3.5 text-sm font-semibold text-forest-900">
              {t("landingCtaSecondary")}
            </a>
          </div>
          <div className="mt-3.5 flex gap-6.5 border-t border-border pt-5">
            <StatCounter value="10 m" label={t("landingStat1")} />
            <StatCounter value="5 days" label={t("landingStat2")} />
            <StatCounter value="0 PKR" label={t("landingStat3")} />
          </div>
        </div>
        <HeroMap />
      </div>

      {/* Trust strip */}
      <div className="border-y border-border bg-cream-card">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-8 px-6 py-4 text-xs font-semibold text-ink-400">
          <span>{t("landingPoweredBy")}</span>
          <span className="text-ink-600">Copernicus Sentinel-2</span>
          <span className="text-ink-600">CDSE / openEO</span>
          <span className="text-ink-600">PostGIS geospatial engine</span>
          <span className="text-ink-600">Genome-backed disease models</span>
        </div>
      </div>

      {/* Features bento */}
      <div id="features" className="mx-auto w-full max-w-[1180px] scroll-mt-[70px] px-6 pb-6 pt-16">
        <Reveal className="mx-auto mb-11 max-w-[620px] text-center">
          <div className="mb-2.5 text-xs font-bold tracking-[.12em] text-forest-500">{t("landingFeaturesEyebrow")}</div>
          <h2 className="m-0 mb-3 text-[26px] font-extrabold tracking-tight text-ink-900 md:text-[32px]">
            {t("landingFeaturesTitle")}
          </h2>
          <p className="m-0 text-[14.5px] leading-relaxed text-ink-500">{t("landingFeaturesSubcopy")}</p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:auto-rows-[172px]">
          {/* A · My Fields — live satellite thumbnail (2x2) */}
          <Reveal index={0} className="h-[300px] lg:col-start-1 lg:row-start-1 lg:col-span-2 lg:row-span-2 lg:h-auto">
            <div className="group relative h-full overflow-hidden rounded-card-lg border border-border bg-[#1a2417] shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.18)]">
              <img
                src={FIELDS_TILE_IMAGE}
                alt=""
                className="absolute inset-0 h-full w-full scale-105 object-cover opacity-80 transition-transform duration-700 group-hover:scale-[1.15]"
              />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <polygon
                  points="30 22, 62 14, 84 34, 74 66, 42 72, 24 48"
                  fill="rgba(149,213,178,.3)"
                  stroke="#95D5B2"
                  strokeWidth="2"
                  strokeDasharray="5 3"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-lg bg-white/94 px-2.5 py-1.5 text-[11px] font-bold text-forest-900 shadow-[0_2px_6px_rgba(0,0,0,.25)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-forest-500" />
                Drawing boundary · 6 points
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0c140e]/90 to-transparent px-4.5 pb-4 pt-10">
                <div className="text-base font-extrabold text-white">My Fields — satellite field mapping</div>
                <div className="mt-0.5 text-[12.5px] text-white/80">
                  Draw a boundary once. Fresh Sentinel-2 imagery of your exact land every 5 days.
                </div>
              </div>
            </div>
          </Reveal>

          {/* B · NDVI & NDMI (1x2) */}
          <Reveal index={1} className="lg:col-start-3 lg:row-start-1 lg:col-span-1 lg:row-span-2">
            <div className="flex h-full flex-col gap-3.5 rounded-card-lg border border-border bg-cream-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div className="flex gap-1.5 text-[10.5px] font-semibold">
                <span className="rounded-md bg-forest-900 px-2.5 py-1.5 text-white">NDVI</span>
                <span className="rounded-md bg-cream-inset px-2.5 py-1.5 text-ink-500">NDMI</span>
              </div>
              <div className="relative flex-1 overflow-hidden rounded-xl" style={{ background: "linear-gradient(135deg,#006400 0%,#228B22 28%,#9ACD32 55%,#F0E68C 78%,#D2B48C 100%)" }}>
                <div className="absolute bottom-2.5 left-2.5 rounded-md bg-[#141c16cc] px-2.5 py-1 text-[9.5px] text-white">
                  vegetation density
                </div>
              </div>
              <div className="relative h-14 flex-none overflow-hidden rounded-xl" style={{ background: "linear-gradient(135deg,#08519C,#4292C6 40%,#9ECAE1 65%,#FEE391 85%,#FEC44F)" }}>
                <div className="absolute bottom-2 left-2.5 rounded-md bg-[#141c16cc] px-2.5 py-1 text-[9.5px] text-white">
                  water stress
                </div>
              </div>
              <div>
                <div className="text-[14.5px] font-bold text-ink-900">NDVI & NDMI overlays</div>
                <div className="mt-0.5 text-xs text-ink-500">Irrigate only where the crop is thirsty.</div>
              </div>
            </div>
          </Reveal>

          {/* C · Crop health gauge (1x1) */}
          <Reveal index={2} className="lg:col-start-4 lg:row-start-1 lg:col-span-1 lg:row-span-1">
            <div className="flex h-full items-center gap-3.5 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div
                className="grid h-[74px] w-[74px] flex-none place-items-center rounded-full"
                style={{ background: "conic-gradient(#40916C 0 74%, #EDEAE0 74% 100%)" }}
              >
                <div className="grid h-[54px] w-[54px] place-items-center rounded-full bg-cream-card text-center">
                  <div>
                    <div className="text-base font-extrabold leading-none text-forest-900">74%</div>
                    <div className="mt-0.5 text-[8px] font-bold text-ink-400">HEALTHY</div>
                  </div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold leading-tight text-ink-900">Crop health &amp; yield</div>
                <div className="mt-0.5 text-[11px] text-ink-500">
                  Projected <b className="text-ink-900">57 maund/acre</b>
                </div>
              </div>
            </div>
          </Reveal>

          {/* D · Disease scanner (1x1) */}
          <Reveal index={3} className="lg:col-start-4 lg:row-start-2 lg:col-span-1 lg:row-span-1">
            <div className="flex h-full flex-col justify-center gap-2.5 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-border"
                  style={{ background: "repeating-linear-gradient(45deg,#EAF3EC 0 8px,#F6F4ED 8px 16px)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="#C1512F" strokeWidth="1.5">
                    <circle cx="7" cy="7" r="4.5" />
                    <path d="M10.5 10.5 L13.5 13.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold leading-tight text-ink-900">Leaf disease scanner</div>
                  <div className="text-[11px] text-ink-500">Photo → genome-backed diagnosis</div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="font-bold text-alert-red-text">Leaf rust</span>
                  <span className="font-extrabold text-alert-red-text">94.2%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-cream-inset">
                  <div className="h-full w-[94%] rounded-full bg-alert-red" />
                </div>
              </div>
            </div>
          </Reveal>

          {/* E · Weather & pest warnings (2x1) */}
          <Reveal index={4} className="lg:col-start-1 lg:row-start-3 lg:col-span-2 lg:row-span-1">
            <div className="flex h-full flex-col justify-center gap-3 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold text-ink-900">Weather &amp; pest warnings</div>
                  <div className="text-xs text-ink-500">7-day agromet forecast + outbreak risk, before symptoms appear.</div>
                </div>
                <div className="flex flex-none animate-pulse items-center gap-1.5 rounded-full border border-alert-red-border bg-alert-red-bg px-3 py-1.5 text-[11px] font-bold text-alert-red-text">
                  ⚠ RUST 78%
                </div>
              </div>
              <div className="flex gap-1.5 text-center text-[10.5px] text-ink-500">
                {[
                  ["Thu", "39°", false],
                  ["Fri", "37°", false],
                  ["Sat", "34°", true],
                  ["Sun", "33°", true],
                  ["Mon", "35°", false],
                  ["Tue", "36°", false],
                  ["Wed", "37°", false],
                ].map(([day, temp, warn]) => (
                  <div
                    key={day as string}
                    className={`flex-1 rounded-lg px-0.5 py-2 ${warn ? "border border-[#F0E3C2] bg-[#FBF3E1]" : "bg-cream-inset"}`}
                  >
                    {day}
                    <div className={`text-[13px] font-extrabold ${warn ? "text-[#B07D2B]" : "text-ink-900"}`}>{temp}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* F · Mandi prices (2x1) */}
          <Reveal index={5} className="lg:col-start-3 lg:row-start-3 lg:col-span-2 lg:row-span-1">
            <div className="flex h-full flex-col justify-center gap-2 rounded-card-lg border border-border bg-cream-card p-4.5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(27,67,50,.1)]">
              <div className="flex items-baseline justify-between">
                <div className="text-[14.5px] font-bold text-ink-900">Real-time mandi prices</div>
                <div className="text-[10.5px] font-semibold text-ink-400">PKR / 40 kg</div>
              </div>
              <div className="flex flex-col text-xs">
                {[
                  ["#E9B44C", "Wheat", "3,920", "▲1.2%", true],
                  ["#95D5B2", "Basmati paddy", "5,410", "▼0.8%", false],
                  ["#F0E68C", "Cotton (phutti)", "8,540", "▲2.4%", true],
                ].map(([dot, name, price, change, up], i, arr) => (
                  <div
                    key={name as string}
                    className={`flex items-center gap-2 py-1.5 ${i < arr.length - 1 ? "border-b border-cream-inset" : ""}`}
                  >
                    <span className="h-2 w-2 flex-none rounded-sm" style={{ background: dot as string }} />
                    <span className="flex-1 font-semibold text-ink-900">{name}</span>
                    <span className="font-extrabold">{price}</span>
                    <span className={`w-11 text-right text-[11px] font-bold ${up ? "text-forest-700" : "text-[#C1512F]"}`}>
                      {change}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal index={6} className="mt-4">
          <div className="flex flex-wrap items-center gap-7 rounded-card-lg bg-forest-900 p-7 text-white">
            <div className="grid h-11 w-11 flex-none place-items-center rounded-[13px] bg-white/[.18]">
              <LogoMark size={20} leafColor="#95D5B2" leafColorDark="#40916C" />
            </div>
            <div className="min-w-[280px] flex-1">
              <div className="text-base font-bold">{t("landingLedgerBannerTitle")}</div>
              <div className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-white/75">
                {t("landingLedgerBannerDesc")}
              </div>
            </div>
            <Link
              href="/signup"
              className="flex-none rounded-[10px] bg-mint-300 px-5 py-2.5 text-[13px] font-bold text-forest-900 hover:bg-[#B7E4C7]"
            >
              {t("landingLedgerBannerCta")}
            </Link>
          </div>
        </Reveal>
      </div>

      {/* How it works */}
      <div id="how" className="mx-auto max-w-[1180px] scroll-mt-[70px] px-6 py-16">
        <Reveal className="mb-9 text-center">
          <div className="mb-2.5 text-xs font-bold tracking-[.12em] text-forest-500">{t("landingHowEyebrow")}</div>
          <h2 className="m-0 text-[26px] font-extrabold tracking-tight text-ink-900">{t("landingHowTitle")}</h2>
        </Reveal>
        <div className="grid grid-cols-1 gap-4.5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.step} index={i}>
              <div className="h-full rounded-card-lg border border-border bg-cream-card p-6">
                <div className="mb-2.5 text-xs font-extrabold text-forest-500">{s.step}</div>
                <div className="mb-1.5 text-[15px] font-bold">{s.title}</div>
                <div className="text-[13px] leading-relaxed text-ink-500">{s.body}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Mission */}
      <div id="mission" className="scroll-mt-[70px] border-t border-border bg-cream-card">
        <Reveal className="mx-auto max-w-[900px] px-6 py-16 text-center">
          <div className="mb-3 text-xs font-bold tracking-[.12em] text-forest-500">{t("landingMissionEyebrow")}</div>
          <h2 className="m-0 mb-3.5 text-2xl font-extrabold leading-tight tracking-tight text-ink-900">
            {t("landingMissionTitle")}
          </h2>
          <p className="mx-auto m-0 max-w-[640px] text-[14.5px] leading-loose text-ink-500">{t("landingMissionBody")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-10">
            <StatCounter value="−30%" label={t("landingMissionStat1")} />
            <StatCounter value="+15%" label={t("landingMissionStat2")} />
            <StatCounter value="48 hrs" label={t("landingMissionStat3")} />
          </div>
        </Reveal>
      </div>

      {/* CTA + footer */}
      <div className="mx-auto w-full max-w-[1180px] px-6 pb-7 pt-16">
        <Reveal>
          <div className="flex flex-wrap items-center gap-7 rounded-card-lg bg-forest-900 p-9">
            <div className="min-w-[280px] flex-1">
              <div className="text-xl font-extrabold tracking-tight text-white">{t("landingCtaBannerTitle")}</div>
              <div className="mt-1.5 text-[13.5px] text-white/72">{t("landingCtaBannerDesc")}</div>
            </div>
            <Link
              href="/signup"
              className="rounded-xl bg-mint-300 px-6.5 py-3.5 text-[14.5px] font-bold text-forest-900 hover:bg-[#B7E4C7]"
            >
              {t("landingCtaBannerButton")}
            </Link>
          </div>
        </Reveal>
        <div className="flex flex-wrap items-center gap-3.5 px-1 pb-2 pt-7 text-xs text-ink-400">
          <div className="flex items-center gap-2 font-bold text-forest-900">
            <Logo size={22} />
            Jadeed Kashtkar <span className="font-normal text-ink-400" lang="ur">جدید کاشتکار</span>
          </div>
          <div className="flex-1" />
          <span>{t("landingFooterCopyright")}</span>
          <span>{t("landingFooterYear")}</span>
        </div>
      </div>
    </div>
  );
}
