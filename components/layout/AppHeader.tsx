"use client";

import { FlaskConical, Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFeed } from "@/lib/client/feed";
import { useSettings } from "@/lib/client/settings";
import { DataModeBadge } from "@/components/ui/primitives";
import { SessionPicker } from "./SessionPicker";

const NAV = [
  { href: "/timing", label: "Live Timing" },
  { href: "/results", label: "Results" },
  { href: "/schedule", label: "Schedule" },
  { href: "/championship", label: "Standings" },
  { href: "/drivers", label: "Drivers" },
  { href: "/teams", label: "Teams" },
  { href: "/telemetry", label: "Telemetry" },
];

/** Routes whose content comes from the selected session's timing feed. */
export const FEED_ROUTES = ["/timing", "/telemetry"];

export function AppHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  const pathname = usePathname();
  const { settings, update } = useSettings();
  const feed = useFeed();
  const onFeedRoute = FEED_ROUTES.some((r) => pathname.startsWith(r));
  const mode = feed.snapshot.provenance?.mode ?? (feed.source.kind === "scheduled" ? "SCHEDULED" : feed.source.kind === "demo" ? "DEMO" : "UNAVAILABLE");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-4 gap-y-1 px-3 md:px-5">
        <Link href="/timing" className="focus-ring flex h-14 shrink-0 items-center gap-1 select-none" aria-label="Apex Timing home">
          <span className="display text-[21px] font-bold leading-none tracking-[0.05em] text-fg">APEX</span>
          <span className="display text-[21px] font-bold leading-none text-accent">/</span>
          <span className="display text-[21px] font-semibold leading-none tracking-[0.05em] text-fg-2">TIMING</span>
        </Link>

        <nav className="order-last -mx-1 flex w-full overflow-x-auto lg:order-none lg:mx-0 lg:w-auto" aria-label="Sections">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`focus-ring relative flex h-11 items-center whitespace-nowrap px-3 text-[13.5px] font-medium transition-colors lg:h-14 ${active ? "text-fg" : "text-fg-2 hover:text-fg"}`}
              >
                {n.label}
                {active && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent" aria-hidden />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 py-2">
          {onFeedRoute && (
            <div className="hidden sm:block">
              <SessionPicker />
            </div>
          )}
          {onFeedRoute && (
            <span className="hidden md:inline-flex">
              <DataModeBadge mode={mode} freshness={feed.freshness} compact />
            </span>
          )}
          <button
            className="btn"
            aria-pressed={settings.demoMode}
            onClick={() => update({ demoMode: !settings.demoMode })}
            title={settings.demoMode ? "Demo mode is on: Live Timing and Telemetry show a fictional, simulated race. Click to turn off." : "Show a fictional, clearly labelled simulated race"}
            style={settings.demoMode ? { color: "var(--demo)", borderColor: "color-mix(in srgb, var(--demo) 60%, transparent)", background: "var(--demo-soft)" } : undefined}
          >
            <FlaskConical size={14} aria-hidden />
            <span className="hidden sm:inline">{settings.demoMode ? "Demo on" : "Demo"}</span>
          </button>
          <button className="btn btn-icon btn-ghost" onClick={() => update({ theme: settings.theme === "dark" ? "light" : "dark" })} aria-label={`Switch to ${settings.theme === "dark" ? "light" : "dark"} theme`} title="Theme">
            {settings.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="btn btn-icon btn-ghost" onClick={onOpenSettings} aria-label="Settings" title="Settings">
            <SettingsIcon size={16} />
          </button>
        </div>
        {onFeedRoute && (
          <div className="order-last w-full pb-2 sm:hidden">
            <SessionPicker block />
          </div>
        )}
      </div>
    </header>
  );
}
