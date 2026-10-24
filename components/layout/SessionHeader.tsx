"use client";

import { CloudRain, Flag, Sun, Thermometer, Wind } from "lucide-react";
import { SESSION_TYPE_LABEL, scheduleState } from "@/lib/config/season-2026";
import { useFeed } from "@/lib/client/feed";
import { useHydrated, useNow } from "@/lib/client/hooks";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { formatAge, formatClock, formatDateTime, zoneLabel } from "@/lib/timing/formatters";
import { PHASE_LABEL, TRACK_STATUS_LABEL } from "@/lib/timing/status";
import type { TrackStatus } from "@/lib/timing/types";

const TRACK_STYLE: Record<TrackStatus, string> = {
  GREEN: "bg-green/15 text-green border-green/40",
  YELLOW: "bg-yellow/15 text-yellow border-yellow/50",
  DOUBLE_YELLOW: "bg-yellow/25 text-yellow border-yellow/60",
  SAFETY_CAR: "bg-yellow/25 text-yellow border-yellow/60",
  SAFETY_CAR_ENDING: "bg-yellow/15 text-yellow border-yellow/50",
  VSC: "bg-yellow/20 text-yellow border-yellow/60",
  VSC_ENDING: "bg-yellow/15 text-yellow border-yellow/50",
  RED: "bg-red/20 text-red border-red/60",
  CHEQUERED: "bg-fg/10 text-fg border-fg/30",
  UNKNOWN: "bg-bg-2 text-fg-3 border-line",
};

function Item({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5 border-l border-line-soft px-3 first:border-l-0 first:pl-0" title={title}>
      <span className="label">{label}</span>
      <span className="tnum truncate text-[12.5px] text-fg">{children}</span>
    </div>
  );
}

export function SessionHeader() {
  const feed = useFeed();
  const { settings } = useSettings();
  const hydrated = useHydrated();
  const now = useNow(1000);
  const snap = feed.snapshot.data;
  const isDemo = feed.source.kind === "demo";
  const event = feed.event;
  const session = feed.session;
  const tz = resolveTimeZone(settings.timeZone, event?.circuit.timeZone);
  const fmt = { timeZone: tz, hour12: settings.hour12 };

  const eventName = isDemo ? "Demo Grand Prix" : event?.name ?? "—";
  const circuit = isDemo ? snap?.session.circuitName ?? "Fictional circuit" : event ? `${event.circuit.name} · ${event.circuit.locality}, ${event.circuit.country}` : "—";
  const sessionLabel = isDemo ? "Race (simulated)" : session?.name ?? "—";
  const typeLabel = isDemo ? "Grand Prix format" : session ? SESSION_TYPE_LABEL[session.type] : "";

  let statusText = "—";
  if (snap && snap.phase !== "UNKNOWN") statusText = PHASE_LABEL[snap.phase];
  if (snap && feed.source.kind === "historical" && feed.atLap) statusText = `Replay · after lap ${feed.atLap} (${PHASE_LABEL[snap.phase].toLowerCase()})`;
  else if (session && hydrated) {
    const st = scheduleState(session, new Date(now || Date.now()));
    statusText = st === "upcoming" ? "Scheduled" : st === "in-window" ? "In scheduled window" : st === "cancelled" ? "Cancelled" : "Completed";
  }

  const track = snap?.trackStatus;
  const lapText = snap?.leaderLap ? `Lap ${snap.leaderLap}${snap.session.totalLaps ? ` / ${snap.session.totalLaps}` : ""}` : null;
  const startsIn = feed.source.kind === "scheduled" && hydrated && now ? Math.max(0, (Date.parse(feed.source.start) - now) / 1000) : null;

  return (
    <section aria-label="Session information" className="border-b border-line bg-bg-2">
      <div className="flex flex-wrap items-stretch gap-y-2 px-3 py-2 md:px-4">
        <div className="mr-4 flex min-w-[220px] flex-col justify-center">
          <div className="flex items-center gap-2">
            <h1 className="display truncate text-[19px] font-bold leading-tight tracking-[0.02em] text-fg">{eventName}</h1>
            {isDemo && <span className="rounded-[2px] border border-demo/60 bg-demo-soft px-1.5 py-px text-[10px] font-bold tracking-wider text-demo">SIMULATED DATA</span>}
          </div>
          <div className="truncate text-[11.5px] text-fg-2">{circuit}</div>
        </div>

        <div className="flex flex-wrap items-stretch gap-y-2">
          <Item label={typeLabel || "Session"}>{sessionLabel}</Item>
          <Item label="Status" title="Session phase from race-control messages when available, otherwise the published schedule">
            {statusText}
          </Item>
          {!isDemo && session && (
            <Item label={`Start · ${hydrated ? zoneLabel(session.start, tz) : ""}`} title={`Event local time: ${hydrated ? formatDateTime(session.start, { timeZone: event?.circuit.timeZone ?? "UTC", hour12: settings.hour12 }) : ""} (${event?.circuit.timeZone})`}>
              {hydrated ? formatDateTime(session.start, fmt) : "—"}
              {hydrated && settings.timeZone !== "event" && event && <span className="ml-1.5 text-fg-3">({formatDateTime(session.start, { timeZone: event.circuit.timeZone, hour12: settings.hour12 }, false)} local)</span>}
            </Item>
          )}
          {startsIn !== null && <Item label="Starts in">{formatClock(startsIn)}</Item>}
          {snap?.clock.basis !== "none" && snap?.clock.elapsed != null && (
            <Item label={isDemo ? "Sim time" : "Elapsed"} title={isDemo ? "Simulated race time" : "Time since the source's SESSION STARTED message, at the instant shown"}>
              {formatClock(snap.clock.elapsed)}
              {lapText && <span className="ml-1.5 text-fg-2">{lapText}</span>}
            </Item>
          )}
          <Item label="Track" title={track?.basis ? `Source message: ${track.basis}` : "No race-control message has established a track status"}>
            <span className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 text-[11px] font-semibold ${TRACK_STYLE[track?.status ?? "UNKNOWN"]}`}>
              <Flag size={11} aria-hidden />
              {TRACK_STATUS_LABEL[track?.status ?? "UNKNOWN"]}
              {track && track.yellowSectors.length > 0 && track.status !== "CHEQUERED" ? ` · sector ${track.yellowSectors.join(", ")}` : ""}
            </span>
          </Item>
          <Item label={isDemo ? "Weather (simulated)" : "Weather"} title={snap?.weather ? `Observed ${snap.weather.observedAt}` : "No weather data from the source"}>
            {snap?.weather ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-0.5">
                  <Thermometer size={12} aria-hidden className="text-fg-3" />
                  Air {snap.weather.airTempC ?? "—"}° · Track {snap.weather.trackTempC ?? "—"}°
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <Wind size={12} aria-hidden className="text-fg-3" />
                  {snap.weather.windSpeedMs ?? "—"} m/s
                </span>
                <span className="inline-flex items-center gap-0.5">
                  {snap.weather.rainfall ? <CloudRain size={12} aria-hidden /> : <Sun size={12} aria-hidden className="text-fg-3" />}
                  {snap.weather.rainfall === null ? "—" : snap.weather.rainfall ? "Rain" : "Dry"}
                </span>
              </span>
            ) : (
              <span className="text-fg-3">Not sourced</span>
            )}
          </Item>
          <Item label="Last update" title="Source timestamp of the newest data shown, and when this browser last received it">
            {isDemo ? (
              <span className="text-fg-2">Simulation clock</span>
            ) : feed.snapshot.provenance && hydrated ? (
              <>
                {formatDateTime(feed.snapshot.provenance.sourceTimestamp, fmt, false)}
                <span className="ml-1.5 text-fg-3">· received {formatAge(feed.snapshot.lastSuccessAt ? new Date(feed.snapshot.lastSuccessAt).toISOString() : null, now || Date.now())}</span>
                {feed.freshness === "stale" && <span className="ml-1.5 font-semibold text-yellow">STALE</span>}
                {feed.freshness === "offline" && <span className="ml-1.5 font-semibold text-red">OFFLINE</span>}
              </>
            ) : (
              <span className="text-fg-3">—</span>
            )}
          </Item>
        </div>
      </div>
    </section>
  );
}
