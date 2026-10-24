"use client";

import { Check, ChevronDown, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { scheduleState, SEASON_2026, type ScheduleEvent } from "@/lib/config/season-2026";
import { useFeed } from "@/lib/client/feed";
import { useHydrated } from "@/lib/client/hooks";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { formatDateTime } from "@/lib/timing/formatters";
import { Popover } from "@/components/ui/Popover";

const STATE_DOT: Record<string, string> = {
  completed: "bg-fg-3",
  "in-window": "bg-green animate-pulse",
  upcoming: "border border-fg-3 bg-transparent",
  cancelled: "bg-red/60",
};

const shortName = (e: ScheduleEvent) => e.name.replace(" Grand Prix", " GP");

/**
 * One control for "which session am I looking at": season and series sit at the top of the menu (only 2026 F1 is
 * configured), then events, then that event's sessions.
 */
export function SessionPicker({ block = false }: { block?: boolean }) {
  const feed = useFeed();
  const { settings, update } = useSettings();
  const hydrated = useHydrated();
  const [browse, setBrowse] = useState<string | null>(feed.event?.id ?? null);
  useEffect(() => setBrowse(feed.event?.id ?? null), [feed.event?.id]);
  const browsing = SEASON_2026.events.find((e) => e.id === browse) ?? feed.event;
  const tz = resolveTimeZone(settings.timeZone, browsing?.circuit.timeZone);

  const label = settings.demoMode ? "Demo Grand Prix · Race" : feed.event ? `${shortName(feed.event)} · ${feed.session?.name ?? "—"}` : "Choose a session";

  return (
    <Popover
      label="Choose session"
      width={600}
      align={block ? "left" : "right"}
      trigger={({ open, toggle, id }) => (
        <button className={`btn justify-between ${block ? "w-full" : "max-w-[min(360px,60vw)]"}`} onClick={toggle} aria-expanded={open} aria-controls={id} title="Choose Grand Prix and session">
          {settings.demoMode && <FlaskConical size={13} className="shrink-0 text-demo" aria-hidden />}
          <span className="truncate">{label}</span>
          <ChevronDown size={14} className="shrink-0 text-fg-3" aria-hidden />
        </button>
      )}
    >
      {(close) => (
      <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <label className="sr-only" htmlFor="season">
          Season
        </label>
        <select id="season" className="control h-7" defaultValue="2026">
          <option value="2026">2026 season</option>
          <option value="2025" disabled>
            2025 (not configured)
          </option>
        </select>
        <label className="sr-only" htmlFor="series">
          Championship
        </label>
        <select id="series" className="control h-7" defaultValue="f1">
          <option value="f1">Formula 1</option>
        </select>
        {settings.demoMode && (
          <button className="btn ml-auto h-7 text-[12px]" onClick={() => update({ demoMode: false })}>
            Leave demo to pick a real session
          </button>
        )}
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${settings.demoMode ? "pointer-events-none opacity-40" : ""}`}>
        <ul className="max-h-[220px] overflow-y-auto border-b border-line py-1 sm:max-h-[420px] sm:border-r sm:border-b-0" aria-label="Grand Prix">
          {SEASON_2026.events
            .filter((e) => e.format !== "testing")
            .map((e) => {
              const active = browse === e.id;
              const cancelled = e.status === "cancelled";
              return (
                <li key={e.id}>
                  <button
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] ${active ? "bg-panel-3 text-fg" : "text-fg-2 hover:bg-panel-2 hover:text-fg"} ${cancelled ? "line-through opacity-50" : ""}`}
                    onClick={() => setBrowse(e.id)}
                    disabled={cancelled}
                  >
                    <span className="tnum w-6 shrink-0 text-[11px] text-fg-3">{e.round ? `R${e.round}` : "—"}</span>
                    <span className="truncate">{shortName(e)}</span>
                    {e.format === "sprint" && <span className="ml-auto text-[9.5px] font-bold tracking-wide text-accent">SPRINT</span>}
                    {feed.event?.id === e.id && <Check size={12} className={`${e.format === "sprint" ? "" : "ml-auto"} text-fg-2`} aria-label="current" />}
                  </button>
                </li>
              );
            })}
        </ul>
        <div className="p-2">
          <div className="px-1 pb-1.5 text-[12px] font-semibold text-fg">{browsing?.name}</div>
          <ul aria-label="Sessions">
            {browsing?.sessions.map((s) => {
              const st = hydrated ? scheduleState(s) : "upcoming";
              const current = feed.session?.openf1SessionKey === s.openf1SessionKey;
              return (
                <li key={s.openf1SessionKey}>
                  <button
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left ${current ? "bg-panel-3" : "hover:bg-panel-2"} disabled:opacity-40`}
                    disabled={s.cancelled}
                    onClick={() => {
                      feed.setSession(s.openf1SessionKey);
                      close();
                    }}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[st]}`} aria-hidden />
                    <span className="flex-1">
                      <span className="block text-[13px] font-medium text-fg">{s.name}</span>
                      <span className="tnum block text-[11px] text-fg-3">
                        {hydrated ? formatDateTime(s.start, { timeZone: tz, hour12: settings.hour12 }) : ""}
                        {st === "in-window" ? " · on now" : st === "upcoming" ? " · upcoming" : st === "cancelled" ? " · cancelled" : ""}
                      </span>
                    </span>
                    {current && <Check size={14} className="text-fg-2" aria-label="current" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      </>
      )}
    </Popover>
  );
}
