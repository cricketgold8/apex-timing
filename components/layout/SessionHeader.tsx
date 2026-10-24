"use client";

import { CloudRain, Flag, Sun, Thermometer } from "lucide-react";
import { usePathname } from "next/navigation";
import { scheduleState } from "@/lib/config/season-2026";
import { useFeed } from "@/lib/client/feed";
import { useHydrated, useNow } from "@/lib/client/hooks";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { formatAge, formatClock, formatDateTime } from "@/lib/timing/formatters";
import { PHASE_LABEL, TRACK_STATUS_LABEL } from "@/lib/timing/status";
import type { TrackStatus } from "@/lib/timing/types";
import { FEED_ROUTES } from "./AppHeader";

const TRACK_STYLE: Record<TrackStatus, string> = {
  GREEN: "text-green border-green/40 bg-green/10",
  YELLOW: "text-yellow border-yellow/50 bg-yellow/10",
  DOUBLE_YELLOW: "text-yellow border-yellow/60 bg-yellow/15",
  SAFETY_CAR: "text-yellow border-yellow/60 bg-yellow/15",
  SAFETY_CAR_ENDING: "text-yellow border-yellow/50 bg-yellow/10",
  VSC: "text-yellow border-yellow/60 bg-yellow/15",
  VSC_ENDING: "text-yellow border-yellow/50 bg-yellow/10",
  RED: "text-red border-red/60 bg-red/15",
  CHEQUERED: "text-fg border-fg/25 bg-fg/5",
  UNKNOWN: "text-fg-3 border-line bg-bg-2",
};

function Stat({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={title}>
      <span className="label">{label}</span>
      <span className="tnum truncate text-[13.5px] font-medium text-fg">{children}</span>
    </div>
  );
}

/** What session is on screen and its state, in one line. Only shown on views driven by the timing feed. */
export function SessionHeader() {
  const pathname = usePathname();
  const feed = useFeed();
  const { settings } = useSettings();
  const hydrated = useHydrated();
  const now = useNow(1000);
  if (!FEED_ROUTES.some((r) => pathname.startsWith(r))) return null;

  const snap = feed.snapshot.data;
  const isDemo = feed.source.kind === "demo";
  const event = feed.event;
  const session = feed.session;
  const tz = resolveTimeZone(settings.timeZone, event?.circuit.timeZone);

  const title = isDemo ? "Demo Grand Prix" : event?.name ?? "No session selected";
  const subtitle = isDemo ? "Race · fictional circuit — simulated data, not real F1 timing" : event ? `${session?.name ?? ""} · ${event.circuit.name}, ${event.circuit.country}` : "";

  let status = "—";
  if (snap && snap.phase !== "UNKNOWN") status = PHASE_LABEL[snap.phase];
  else if (session && hydrated) {
    const st = scheduleState(session, new Date(now || Date.now()));
    status = st === "upcoming" ? "Not started" : st === "in-window" ? "Scheduled now" : st === "cancelled" ? "Cancelled" : "Finished";
  }
  if (snap && feed.source.kind === "historical" && feed.atLap) status = `Replay · after lap ${feed.atLap}`;

  const track = snap?.trackStatus;
  const progress = snap?.leaderLap ? `Lap ${snap.leaderLap}${snap.session.totalLaps ? ` / ${snap.session.totalLaps}` : ""}` : snap?.clock.elapsed != null && snap.clock.basis !== "none" ? formatClock(snap.clock.elapsed) : null;
  const startsIn = feed.source.kind === "scheduled" && hydrated && now ? Math.max(0, (Date.parse(feed.source.start) - now) / 1000) : null;
  const w = snap?.weather;

  return (
    <section aria-label="Session" className="border-b border-line bg-bg-2/60">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-x-8 gap-y-3 px-3 py-3 md:px-5">
        <div className="min-w-0 flex-1 basis-[280px]">
          <div className="flex items-center gap-2.5">
            <h1 className="display truncate text-[24px] font-bold leading-none tracking-[0.02em]">{title}</h1>
            {isDemo && <span className="chip h-6 border-demo/60 bg-demo-soft text-[11px] tracking-wide text-demo">SIMULATED DATA</span>}
          </div>
          <div className="mt-1 truncate text-[12.5px] text-fg-2">{subtitle}</div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Stat label="Status">{status}</Stat>
          {startsIn !== null && session && (
            <Stat label="Starts" title={`Event local time ${formatDateTime(session.start, { timeZone: event?.circuit.timeZone ?? "UTC", hour12: settings.hour12 })}`}>
              {formatDateTime(session.start, { timeZone: tz, hour12: settings.hour12 })} · in {formatClock(startsIn)}
            </Stat>
          )}
          {progress && <Stat label={snap?.leaderLap ? "Progress" : "Elapsed"}>{progress}</Stat>}
          {track && (
            <div className="flex flex-col gap-0.5" title={track.basis ? `From race control: "${track.basis}"` : "No race-control message has set a track status yet"}>
              <span className="label">Track</span>
              <span className={`chip h-6 text-[11.5px] ${TRACK_STYLE[track.status]}`}>
                <Flag size={11} aria-hidden />
                {TRACK_STATUS_LABEL[track.status]}
                {track.yellowSectors.length > 0 && track.status !== "CHEQUERED" && track.status !== "GREEN" ? ` · S${track.yellowSectors.join(", ")}` : ""}
              </span>
            </div>
          )}
          {w && (
            <Stat label={isDemo ? "Weather (sim)" : "Weather"} title={`Humidity ${w.humidityPct ?? "—"}% · wind ${w.windSpeedMs ?? "—"} m/s · observed ${w.observedAt}`}>
              <span className="inline-flex items-center gap-1.5">
                <Thermometer size={13} className="text-fg-3" aria-hidden />
                {w.airTempC ?? "—"}° air · {w.trackTempC ?? "—"}° track
                {w.rainfall ? <CloudRain size={13} aria-label="Rain" /> : <Sun size={13} className="text-fg-3" aria-label="Dry" />}
              </span>
            </Stat>
          )}
          {!isDemo && feed.snapshot.provenance && hydrated && (
            <Stat label="Updated" title="Timestamp of the newest data shown, and when this browser received it">
              <span className={feed.freshness === "stale" ? "text-yellow" : feed.freshness === "offline" ? "text-red" : ""}>
                {formatDateTime(feed.snapshot.provenance.sourceTimestamp, { timeZone: tz, hour12: settings.hour12 }, false)}
                <span className="ml-1.5 text-[12px] font-normal text-fg-3">{formatAge(feed.snapshot.lastSuccessAt ? new Date(feed.snapshot.lastSuccessAt).toISOString() : null, now || Date.now())}</span>
                {feed.freshness === "stale" && " · STALE"}
                {feed.freshness === "offline" && " · OFFLINE"}
              </span>
            </Stat>
          )}
        </div>
      </div>
    </section>
  );
}
