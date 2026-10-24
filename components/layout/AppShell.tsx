"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ColumnsProvider } from "@/lib/client/columns";
import { FeedProvider } from "@/lib/client/feed";
import { usePathname } from "next/navigation";
import { SettingsProvider, useSettings } from "@/lib/client/settings";
import { AppHeader } from "./AppHeader";
import { SessionHeader } from "./SessionHeader";
import { SettingsDrawer } from "./SettingsDrawer";

/** In demo mode, pages that never use demo data say so, so the header's SIMULATED badge can't be misread. */
function DemoScopeNote() {
  const { settings } = useSettings();
  const pathname = usePathname();
  if (!settings.demoMode || pathname.startsWith("/timing") || pathname.startsWith("/telemetry")) return null;
  return (
    <div className="mb-3 rounded-[3px] border border-line bg-bg-2 px-3 py-1.5 text-[12px] text-fg-2" role="note">
      Demo mode is on for <span className="font-semibold text-demo">Live Timing and Telemetry only</span>. This page shows real published data from the provider named below.
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <SettingsProvider>
      <ColumnsProvider>
      <FeedProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col">
          <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
          <SessionHeader />
          <main id="main" className="flex-1 px-3 pb-6 pt-3 md:px-4">
            <DemoScopeNote />
            {children}
          </main>
          <footer className="border-t border-line px-4 py-3 text-[11px] text-fg-3">
            Apex Timing is an independent, unofficial project and is not associated with Formula 1, the FIA or any team. Timing data: OpenF1 (unofficial, community API) and Jolpica-F1. F1, FORMULA 1 and related marks
            are trade marks of Formula One Licensing B.V.
          </footer>
        </div>
        <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </FeedProvider>
      </ColumnsProvider>
    </SettingsProvider>
  );
}
