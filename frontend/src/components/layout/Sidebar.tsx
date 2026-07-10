"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Logo } from "@/components/ui/Logo";
import { NavIcons } from "./icons";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard" as const, icon: NavIcons.dashboard },
  { href: "/fields", key: "fields" as const, icon: NavIcons.fields },
  { href: "/health", key: "health" as const, icon: NavIcons.health },
  { href: "/scanner", key: "scanner" as const, icon: NavIcons.scanner },
  { href: "/market", key: "market" as const, icon: NavIcons.market },
  { href: "/ledger", key: "ledger" as const, icon: NavIcons.ledger },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useTranslation();

  function handleSignOut() {
    logout();
    router.push("/login");
  }

  return (
    <div
      id="jkSide"
      className="flex w-56 flex-none flex-col bg-forest-900 p-3.5 text-white max-[760px]:hidden"
    >
      <div className="flex items-center gap-2.5 border-b border-white/[.14] px-2 pb-4.5">
        <Logo size={34} />
        <div>
          <div className="text-sm font-bold tracking-tight">Jadeed Kashtkar</div>
          <div className="text-[11px] leading-[1.9] text-mint-300" lang="ur">
            جدید کاشتکار
          </div>
        </div>
      </div>
      <div className="mt-3.5 flex flex-col gap-0.5 text-[13px] font-medium">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 leading-[1.6] hover:bg-white/[.12]"
              style={active ? { background: "rgba(149,213,178,.18)" } : undefined}
            >
              {item.icon}
              {t(item.key)}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto flex flex-col gap-2.5">
        <div className="rounded-[10px] bg-black/[.22] px-3 py-2.5 text-[11px] leading-[1.5] text-white/75">
          <div className="mb-0.5 font-semibold text-mint-300">Sentinel-2 · CDSE</div>
          Live NDVI/NDMI pipeline
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-[9px] px-2.5 py-2 text-xs leading-[1.6] text-white/60 hover:bg-black/20"
        >
          {NavIcons.settings}
          {t("settings")}
        </Link>
        <button
          onClick={handleSignOut}
          className="flex cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-xs text-white/60 hover:bg-black/20"
        >
          {NavIcons.signout}
          {t("signout")}
        </button>
      </div>
    </div>
  );
}
