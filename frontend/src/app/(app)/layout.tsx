"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useNdviJob } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileTabs } from "@/components/layout/MobileTabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const activeJob = useAppStore((s) => s.activeJob);
  const setActiveJob = useAppStore((s) => s.setActiveJob);
  // Lives here, not in a page, so polling an in-flight analysis job survives
  // switching modules — this layout stays mounted across every /fields,
  // /health, etc. route; only {children} swaps underneath it.
  const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);

  useEffect(() => {
    if (jobStatus.data?.status === "done" || jobStatus.data?.status === "failed") {
      queryClient.invalidateQueries({ queryKey: ["fields"] });
      setActiveJob(null);
    }
  }, [jobStatus.data?.status, queryClient, setActiveJob]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream-bg text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-cream-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        <MobileTabs />
      </div>
    </div>
  );
}
