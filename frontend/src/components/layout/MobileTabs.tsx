"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcons } from "./icons";

const TABS = [
  { href: "/dashboard", label: "Home", icon: NavIcons.dashboard },
  { href: "/fields", label: "Fields", icon: NavIcons.fields },
  { href: "/scanner", label: "Scan", icon: NavIcons.scanner },
  { href: "/market", label: "Market", icon: NavIcons.market },
  { href: "/ledger", label: "Ledger", icon: NavIcons.ledger },
];

export function MobileTabs() {
  const pathname = usePathname();
  return (
    <div
      id="jkTabs"
      className="hidden h-16 flex-none items-stretch border-t border-border bg-cream-card max-[760px]:flex"
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[9.5px] font-bold"
            style={{ color: active ? "var(--color-forest-ink-900)" : "var(--color-ink-400)" }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
