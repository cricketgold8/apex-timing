"use client";

import { FlaskConical, Moon, Settings as SettingsIcon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { scheduleState, SEASON_2026 } from "@/lib/config/season-2026";
import { useFeed } from "@/lib/client/feed";
import { useHydrated } from "@/lib/client/hooks";
import { useSettings } from "@/lib/client/settings";
import { DataModeBadge } from "@/components/ui/primitives";

const NAV = [
  { href: "/timing", label: "Live Timing" },
  { href: "/results", label: "Results" },
  { href: "/schedule", label: "Schedule" },
  { href: "/drivers", label: "Drivers" },
  { href: "/teams", label: "Teams" },
  { href: "/championship", label: "Championship" },
  { href: "/telemetry", label: "Telemetry" },
];

const STATE_SUFFIX: Record<string, string> = { upcoming: " · upcoming", "in-window": " · in progress", completed: "", cancelled: " · cancelled" };

export function AppHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  const pathname = usePathname();
  const { settings, update } = useSettings();
  const feed = useFeed();
  const hydrated = useHydrated();
  const mode = feed.snapshot.provenance?.mode ?? (feed.source.kind === "scheduled" ? "SCHEDULED" : feed.source.kind === "demo" ? "DEMO" : "UNAVAILABLE");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 md:px-4">
        <Link href="/timing" className="focus-ring mr-1 flex items-baseline gap-1 select-none" aria-label="Apex Timing home">
          <span className="display text-[20px] font-bold leading-none tracking-[0.04em] text-fg">APEX</span>
          <span className="display text-[20px] font-bold leading-none text-accent">/</span>
          <span className="display text-[20px] font-semibold leading-none tracking-[0.04em] text-fg-2">TIMING</span>
        </Link>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor="season">
            Season
          </label>
          <select id="season" className="control w-[78px]" defaultValue="2026" title="Season">
            <option value="2026">2026</option>
            <option value="2025" disabled>
              2025 (not configured)
            </option>
          </select>
          <label className="sr-only" htmlFor="series">
            Championship
          </label>
          <select id="series" className="control w-[118px]" defaultValue="f1" title="Championship">
            <option value="f1">Formula 1</option>
          </select>
          <label className="sr-only" htmlFor="event">
            Grand Prix
          </label>
          <select
            id="event"
            className="control w-[230px]"
            value={feed.event?.id ?? ""}
            onChange={(e) => feed.setEvent(e.target.value)}
            disabled={settings.demoMode}
            title={settings.demoMode ? "Demo mode is on: the demo session is fictional" : "Grand Prix"}
          >
            {SEASON_2026.events.map((e) => (
              <option key={e.id} value={e.id} disabled={e.status === "cancelled"}>
                {e.round ? `R${e.round} · ` : ""}
                {e.name}
                {e.format === "sprint" ? " (Sprint)" : ""}
                {e.status === "cancelled" ? " — cancelled" : ""}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="session">
            Session
          </label>
          <select
            id="session"
            className="control w-[190px]"
            value={feed.session?.openf1SessionKey ?? ""}
            onChange={(e) => feed.setSession(Number(e.target.value))}
            disabled={settings.demoMode || !feed.event}
            title="Session"
          >
            {feed.event?.sessions.map((s) => (
              <option key={s.openf1SessionKey} value={s.openf1SessionKey} disabled={s.cancelled}>
                {s.name}
                {hydrated ? STATE_SUFFIX[scheduleState(s)] : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <DataModeBadge mode={mode} freshness={feed.freshness} compact />
          <button
            className="btn"
            aria-pressed={settings.demoMode}
            onClick={() => update({ demoMode: !settings.demoMode })}
            title="Demo mode shows a fictional, clearly labelled simulated race"
            data-active={settings.demoMode}
            style={settings.demoMode ? { color: "var(--demo)", borderColor: "var(--demo)" } : undefined}
          >
            <FlaskConical size={14} aria-hidden />
            Demo
          </button>
          <button className="btn btn-icon" onClick={() => update({ theme: settings.theme === "dark" ? "light" : "dark" })} aria-label={`Switch to ${settings.theme === "dark" ? "light" : "dark"} theme`} title="Theme">
            {settings.theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="btn btn-icon" onClick={onOpenSettings} aria-label="Settings" title="Settings">
            <SettingsIcon size={14} />
          </button>
        </div>
      </div>
      <nav className="flex overflow-x-auto border-t border-line-soft px-1 md:px-2" aria-label="Sections">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`focus-ring relative whitespace-nowrap px-3 py-2 text-[12.5px] font-medium transition-colors ${active ? "text-fg" : "text-fg-2 hover:text-fg"}`}
            >
              {n.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-[2px] bg-accent" aria-hidden />}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
