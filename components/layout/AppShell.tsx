"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ColumnsProvider } from "@/lib/client/columns";
import { FeedProvider } from "@/lib/client/feed";
import { SettingsProvider, useSettings } from "@/lib/client/settings";
import { AppHeader, FEED_ROUTES } from "./AppHeader";
import { SessionHeader } from "./SessionHeader";
import { SettingsDrawer } from "./SettingsDrawer";

/** In demo mode, pages that never use demo data say so, so "Demo on" can't be misread there. */
function DemoScopeNote() {
  const { settings } = useSettings();
  const pathname = usePathname();
  if (!settings.demoMode || FEED_ROUTES.some((r) => pathname.startsWith(r))) return null;
  return (
    <p className="mb-4 text-[12.5px] text-fg-3" role="note">
      Demo mode only affects Live Timing and Telemetry — this page shows real published data.
    </p>
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
            <main id="main" className="mx-auto w-full max-w-[1920px] flex-1 px-3 pb-10 pt-4 md:px-5">
              <DemoScopeNote />
              {children}
            </main>
            <footer className="mx-auto w-full max-w-[1920px] px-3 py-4 text-[11.5px] text-fg-3 md:px-5">
              Unofficial project, not affiliated with Formula 1 or the FIA. Data: OpenF1 and Jolpica-F1. F1 marks belong to Formula One Licensing B.V.
            </footer>
          </div>
          <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </FeedProvider>
      </ColumnsProvider>
    </SettingsProvider>
  );
}
