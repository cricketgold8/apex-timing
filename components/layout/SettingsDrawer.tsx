"use client";

import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { DRIVERS_2026 } from "@/lib/config/drivers-2026";
import { TEAMS_2026 } from "@/lib/config/teams-2026";
import { COLUMNS, useColumnVisibility } from "@/lib/client/columns";
import { LIVE_MIN_REFRESH_MS, useSettings } from "@/lib/client/settings";

const ZONES = ["viewer", "event", "UTC", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Sao_Paulo", "Asia/Tokyo", "Asia/Singapore", "Australia/Melbourne"];
const REFRESH = [4000, 5000, 8000, 15000, 30000];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="label mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
      <input type="checkbox" className="mt-0.5 accent-[var(--t-blue)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-fg-3">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update, reset } = useSettings();
  const { visible, toggle, resetColumns } = useColumnVisibility();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const toggleHighlight = (n: number) => update({ highlighted: settings.highlighted.includes(n) ? settings.highlighted.filter((x) => x !== n) : [...settings.highlighted, n] });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Settings">
      <button className="absolute inset-0 bg-black/50" aria-label="Close settings" onClick={onClose} tabIndex={-1} />
      <div className="relative flex h-full w-full max-w-[380px] flex-col overflow-y-auto border-l border-line bg-panel">
        <div className="panel-head sticky top-0 z-10 bg-panel">
          <span className="panel-title">Settings</span>
          <button ref={closeRef} className="btn btn-icon ml-auto" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <Section title="Data">
          <Toggle label="Demo mode" checked={settings.demoMode} onChange={(v) => update({ demoMode: v })} hint="Shows a fictional, clearly labelled simulated race. Never mixed with real data." />
          <label className="flex items-center justify-between gap-3 text-[12.5px]">
            Live refresh
            <select className="control" value={settings.refreshMs} onChange={(e) => update({ refreshMs: Number(e.target.value) })}>
              {REFRESH.map((ms) => (
                <option key={ms} value={ms}>
                  every {ms / 1000}s
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-fg-3">
            How often this app polls its server in live mode (minimum {LIVE_MIN_REFRESH_MS / 1000}s). It is not the official feed&apos;s update rate; OpenF1 documents intervals at roughly 4 s and car data at about 3.7 Hz.
          </p>
        </Section>

        <Section title="Appearance">
          <label className="flex items-center justify-between gap-3 text-[12.5px]">
            Theme
            <select className="control" value={settings.theme} onChange={(e) => update({ theme: e.target.value as "dark" | "light" })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <Toggle label="Compact timing view" checked={settings.compact} onChange={(v) => update({ compact: v })} hint="Narrow tower only — for keeping timing beside a video window." />
          <Toggle label="Flash cells on change" checked={settings.flash} onChange={(v) => update({ flash: v })} />
        </Section>

        <Section title="Time & units">
          <label className="flex items-center justify-between gap-3 text-[12.5px]">
            Time zone
            <select className="control max-w-[200px]" value={settings.timeZone} onChange={(e) => update({ timeZone: e.target.value })}>
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z === "viewer" ? "My time zone" : z === "event" ? "Event local time" : z}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-[12.5px]">
            Clock
            <select className="control" value={settings.hour12 ? "12" : "24"} onChange={(e) => update({ hour12: e.target.value === "12" })}>
              <option value="24">24-hour</option>
              <option value="12">12-hour</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-[12.5px]">
            Speed
            <select className="control" value={settings.speedUnit} onChange={(e) => update({ speedUnit: e.target.value as "kmh" | "mph" })}>
              <option value="kmh">km/h</option>
              <option value="mph">mph</option>
            </select>
          </label>
        </Section>

        <Section title="Timing columns">
          <div className="grid grid-cols-2 gap-1.5">
            {COLUMNS.filter((c) => !c.required).map((c) => (
              <Toggle key={c.id} label={`${c.label}${c.sessions ? " *" : ""}`} checked={visible[c.id]} onChange={() => toggle(c.id)} />
            ))}
          </div>
          <p className="text-[11px] text-fg-3">* only shown for applicable session types. Saved for this browser session.</p>
          <button className="btn" onClick={resetColumns}>
            Reset columns
          </button>
        </Section>

        <Section title="Drivers">
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <label key={i} className="text-[12px]">
                <span className="label">Compare {i === 0 ? "A" : "B"}</span>
                <select
                  className="control mt-1 w-full"
                  value={settings.compare[i] ?? ""}
                  onChange={(e) => {
                    const next: [number | null, number | null] = [...settings.compare];
                    next[i] = e.target.value ? Number(e.target.value) : null;
                    update({ compare: next });
                  }}
                >
                  <option value="">Auto</option>
                  {DRIVERS_2026.map((d) => (
                    <option key={d.number} value={d.number}>
                      {d.code} · {d.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <span className="label block pt-1">Highlight</span>
          <div className="flex flex-wrap gap-1">
            {DRIVERS_2026.map((d) => {
              const on = settings.highlighted.includes(d.number);
              return (
                <button key={d.number} className="btn h-6 px-1.5 text-[11px]" aria-pressed={on} onClick={() => toggleHighlight(d.number)} title={d.displayName} style={on ? { borderColor: TEAMS_2026[d.teamId].colour } : undefined}>
                  <span className="h-2.5 w-[3px]" style={{ background: TEAMS_2026[d.teamId].colour }} aria-hidden />
                  {d.code}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Race control">
          <Toggle label="Auto-scroll to newest message" checked={settings.autoScroll} onChange={(v) => update({ autoScroll: v })} />
        </Section>

        <div className="px-4 py-4">
          <button
            className="btn"
            onClick={() => {
              reset();
              resetColumns();
            }}
          >
            <RotateCcw size={13} aria-hidden />
            Reset all preferences
          </button>
        </div>
      </div>
    </div>
  );
}
