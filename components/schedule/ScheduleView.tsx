"use client";

import { CalendarDays, List } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { nextSession, scheduleState, SEASON_2026, SESSION_TYPE_LABEL, type ScheduleEvent, type ScheduleState } from "@/lib/config/season-2026";
import { useHydrated, useNow } from "@/lib/client/hooks";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { formatClock, formatDate, formatDateTime, zoneLabel } from "@/lib/timing/formatters";
import { PageTitle } from "@/components/ui/DriverCell";
import { Segmented } from "@/components/ui/Popover";

const STATE_BADGE: Record<ScheduleState, string> = {
  upcoming: "text-fg-2 border-line",
  "in-window": "text-green border-green/50 bg-green/10",
  completed: "text-fg-3 border-line-soft",
  cancelled: "text-red border-red/40 bg-red/10 line-through",
};
const STATE_TEXT: Record<ScheduleState, string> = { upcoming: "Upcoming", "in-window": "In scheduled window", completed: "Completed", cancelled: "Cancelled" };

function eventState(e: ScheduleEvent, now: Date): ScheduleState {
  if (e.status === "cancelled") return "cancelled";
  const states = e.sessions.map((s) => scheduleState(s, now));
  if (states.includes("in-window")) return "in-window";
  if (states.every((s) => s === "completed" || s === "cancelled")) return "completed";
  if (states.some((s) => s === "completed")) return "in-window";
  return "upcoming";
}

function NextSessionCard() {
  const { settings } = useSettings();
  const now = useNow(1000);
  const hydrated = useHydrated();
  if (!hydrated || !now) return <div className="panel h-[96px]" />;
  const next = nextSession(new Date(now));
  if (!next) return <div className="panel p-4 text-fg-2">The 2026 season has no remaining sessions.</div>;
  const tz = resolveTimeZone(settings.timeZone, next.event.circuit.timeZone);
  const inWindow = scheduleState(next.session, new Date(now)) === "in-window";
  const secs = Math.max(0, (Date.parse(next.session.start) - now) / 1000);
  return (
    <section className="panel flex flex-wrap items-center gap-6 p-4" aria-label="Next session">
      <div>
        <div className="label">{inWindow ? "In its scheduled window now" : "Next session"}</div>
        <div className="display text-[22px] font-bold leading-tight">
          {next.event.name} — {next.session.name}
        </div>
        <div className="text-[12px] text-fg-2">
          {next.event.circuit.name}, {next.event.circuit.country}
        </div>
      </div>
      <div>
        <div className="label">Your time ({zoneLabel(next.session.start, tz)})</div>
        <div className="tnum text-[15px]">{formatDateTime(next.session.start, { timeZone: tz, hour12: settings.hour12 })}</div>
        <div className="text-[11.5px] text-fg-3">
          Event local: {formatDateTime(next.session.start, { timeZone: next.event.circuit.timeZone, hour12: settings.hour12 })} ({zoneLabel(next.session.start, next.event.circuit.timeZone)})
        </div>
      </div>
      {!inWindow && (
        <div>
          <div className="label">Starts in</div>
          <div className="display tnum text-[26px] font-bold leading-none">{secs > 86400 ? `${Math.floor(secs / 86400)}d ${formatClock(secs % 86400)}` : formatClock(secs)}</div>
        </div>
      )}
      <Link href={`/schedule/${next.event.id}`} className="btn ml-auto">
        Event details
      </Link>
    </section>
  );
}

function CalendarView({ now }: { now: Date }) {
  const months = Array.from({ length: 10 }, (_, i) => i + 2); // March–December (0-based months 2..11)
  const events = SEASON_2026.events.filter((e) => e.round !== null || e.status === "cancelled");
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {months.map((m) => {
        const first = new Date(Date.UTC(2026, m, 1));
        const days = new Date(Date.UTC(2026, m + 1, 0)).getUTCDate();
        const offset = (first.getUTCDay() + 6) % 7; // Monday first
        const cells = Array.from({ length: offset + days }, (_, i) => (i < offset ? null : i - offset + 1));
        return (
          <section key={m} className="panel p-2" aria-label={first.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}>
            <div className="panel-title mb-1 px-1">{first.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}</div>
            <div className="grid grid-cols-7 gap-px text-center text-[10px] text-fg-3">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <div key={i}>{d}</div>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />;
                const date = `2026-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const ev = events.find((e) => date >= e.startDate && date <= e.endDate);
                const isRaceDay = ev && ev.endDate === date;
                const st = ev ? eventState(ev, now) : null;
                return (
                  <div
                    key={i}
                    className={`relative flex h-7 items-center justify-center rounded-[2px] text-[11px] ${ev ? (st === "cancelled" ? "bg-red/10 text-red line-through" : st === "completed" ? "bg-panel-2 text-fg-2" : "bg-accent-soft text-fg") : "text-fg-3"} ${isRaceDay ? "font-bold" : ""}`}
                    title={ev ? `${ev.name}${ev.status === "cancelled" ? " (cancelled)" : ""}` : undefined}
                  >
                    {ev && isRaceDay ? (
                      <Link href={`/schedule/${ev.id}`} className="focus-ring absolute inset-0 flex items-center justify-center">
                        {d}
                      </Link>
                    ) : (
                      d
                    )}
                  </div>
                );
              })}
            </div>
            <ul className="mt-1.5 space-y-0.5 px-1 text-[11px]">
              {events
                .filter((e) => Number(e.endDate.slice(5, 7)) - 1 === m)
                .map((e) => (
                  <li key={e.id} className="flex items-center gap-1.5">
                    <span className="tnum w-6 text-fg-3">{e.round ? `R${e.round}` : "—"}</span>
                    <Link href={`/schedule/${e.id}`} className={`truncate hover:underline ${e.status === "cancelled" ? "text-red line-through" : ""}`}>
                      {e.name}
                    </Link>
                    {e.format === "sprint" && <span className="text-[9.5px] font-bold text-accent">SPRINT</span>}
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function ScheduleView() {
  const { settings } = useSettings();
  const hydrated = useHydrated();
  const now = useNow(60_000);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [showTesting, setShowTesting] = useState(false);
  const nowDate = useMemo(() => new Date(now || Date.parse(SEASON_2026.generatedAt)), [now]);
  const events = SEASON_2026.events.filter((e) => showTesting || e.format !== "testing");

  return (
    <div className="flex flex-col gap-3">
      <PageTitle
        title="Schedule"
        subtitle={`2026 season · times shown in ${settings.timeZone === "event" ? "each event's local time" : settings.timeZone === "viewer" ? "your time zone" : settings.timeZone} (change in Settings)`}
        info={<p>Calendar built from OpenF1 and Jolpica-F1 on {SEASON_2026.generatedAt.slice(0, 10)}. Bahrain and Saudi Arabia were cancelled; the Bahrain Grand Prix moved to Sepang, Malaysia.</p>}
      >
        <label className="flex items-center gap-1.5 text-[12.5px] text-fg-2">
          <input type="checkbox" checked={showTesting} onChange={(e) => setShowTesting(e.target.checked)} /> Testing
        </label>
        <Segmented
          label="View"
          value={view}
          options={[
            {
              value: "list",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <List size={13} aria-hidden /> List
                </span>
              ),
            },
            {
              value: "calendar",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={13} aria-hidden /> Calendar
                </span>
              ),
            },
          ]}
          onChange={setView}
        />
      </PageTitle>

      <NextSessionCard />

      {view === "calendar" ? (
        <CalendarView now={nowDate} />
      ) : (
        <section className="panel overflow-x-auto">
          <table className="data-table tnum">
            <thead>
              <tr>
                <th className="text-right">Rd</th>
                <th>Grand Prix</th>
                <th>Circuit</th>
                <th>Dates</th>
                <th>Sessions</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const tz = resolveTimeZone(settings.timeZone, e.circuit.timeZone);
                const st = hydrated ? eventState(e, nowDate) : "upcoming";
                return (
                  <tr key={e.id} className={st === "completed" ? "opacity-80" : ""}>
                    <td className="text-right text-fg-2">{e.round ?? "—"}</td>
                    <td>
                      <Link href={`/schedule/${e.id}`} className={`focus-ring font-semibold hover:underline ${e.status === "cancelled" ? "text-red line-through" : ""}`}>
                        {e.name}
                      </Link>
                      {e.format === "sprint" && <span className="ml-2 rounded-[2px] bg-accent-soft px-1 text-[10px] font-bold text-accent">SPRINT</span>}
                    </td>
                    <td className="text-fg-2">
                      {e.circuit.name}
                      <span className="text-fg-3"> · {e.circuit.country}</span>
                    </td>
                    <td className="text-fg-2">
                      {formatDate(e.sessions[0]?.start ?? null, e.circuit.timeZone)} – {formatDate(e.sessions[e.sessions.length - 1]?.start ?? null, e.circuit.timeZone)}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1 py-1">
                        {e.sessions.map((s) => {
                          const ss = hydrated ? scheduleState(s, nowDate) : "upcoming";
                          return (
                            <span key={s.openf1SessionKey} className={`rounded-[2px] border px-1.5 py-px text-[10.5px] ${STATE_BADGE[ss]}`} title={`${SESSION_TYPE_LABEL[s.type]} · ${STATE_TEXT[ss]}`}>
                              <span className="font-semibold">{s.name.replace("Practice ", "FP").replace("Sprint Qualifying", "SQ").replace("Qualifying", "Q")}</span> {hydrated ? formatDateTime(s.start, { timeZone: tz, hour12: settings.hour12 }) : ""}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <span className={`rounded-[2px] border px-1.5 py-px text-[10.5px] font-semibold ${STATE_BADGE[st]}`}>{st === "in-window" ? "Weekend in progress" : STATE_TEXT[st]}</span>
                      {st === "completed" && e.round && (
                        <Link href="/results" className="ml-2 text-[11px] text-blue hover:underline">
                          results
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
