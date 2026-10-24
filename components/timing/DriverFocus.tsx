"use client";

import { useMemo, useState } from "react";
import { TEAMS_2026, isTeamId } from "@/lib/config/teams-2026";
import { useLapHistories } from "@/lib/client/useLaps";
import { formatDelta, formatGap, formatInterval, formatLapTime, formatSectorTime } from "@/lib/timing/formatters";
import type { LapRecord, TimingSnapshot } from "@/lib/timing/types";
import { TyreBadge, compoundLabel } from "@/components/ui/primitives";
import { LapHistory } from "./LapHistory";

function bestSectors(laps: LapRecord[] | undefined): [number | null, number | null, number | null] {
  const out: [number | null, number | null, number | null] = [null, null, null];
  for (const l of laps ?? []) {
    if (l.valid === false) continue;
    l.sectors.forEach((s, i) => {
      if (s !== null && (out[i] === null || s < (out[i] as number))) out[i] = s;
    });
  }
  return out;
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg bg-bg-2 px-3 py-2">
      <div className="label">{label}</div>
      <div className={`tnum mt-0.5 text-[15px] font-semibold ${tone ?? "text-fg"}`}>{value}</div>
    </div>
  );
}

/** Everything about one driver: where they are, their best sectors against the field and a rival, and every lap. */
export function DriverFocus({ snapshot, driver }: { snapshot: TimingSnapshot; driver: number }) {
  const row = snapshot.rows.find((r) => r.driverNumber === driver);
  const idx = snapshot.rows.findIndex((r) => r.driverNumber === driver);
  const defaultRival = snapshot.rows[idx > 0 ? idx - 1 : 1]?.driverNumber ?? null;
  const [rivalChoice, setRival] = useState<number | null>(null);
  const rival = rivalChoice !== null && rivalChoice !== driver && snapshot.rows.some((r) => r.driverNumber === rivalChoice) ? rivalChoice : defaultRival;
  const laps = useLapHistories([driver, ...(rival !== null ? [rival] : [])]);
  const mine = useMemo(() => bestSectors(laps.data?.[driver]), [laps.data, driver]);
  const theirs = useMemo(() => (rival !== null ? bestSectors(laps.data?.[rival]) : [null, null, null]), [laps.data, rival]);
  if (!row) return null;
  const isRace = snapshot.session.type === "RACE" || snapshot.session.type === "SPRINT";
  const teamName = row.teamId && isTeamId(row.teamId) ? TEAMS_2026[row.teamId].name : "";
  const rivalRow = snapshot.rows.find((r) => r.driverNumber === rival);
  const fastest = snapshot.bests.sectors;

  return (
    <div className="space-y-4 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="h-12 w-1.5 rounded-full" style={{ background: row.teamColour }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="display text-[30px] font-bold leading-none tracking-[0.04em]">{row.code}</span>
            <span className="truncate text-[15px] font-medium text-fg">{row.name}</span>
          </div>
          <div className="mt-1 text-[12.5px] text-fg-3">
            {teamName} · #{row.driverNumber}
          </div>
        </div>
        <div className="text-right">
          <div className="label">Position</div>
          <div className="display text-[30px] font-bold leading-none">{row.position ? `P${row.position}` : "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={isRace ? "To leader" : "To fastest"} value={formatGap(row.gap, isRace ? "Leader" : "Fastest")} />
        <Stat label="To car ahead" value={formatInterval(row.interval)} />
        <Stat
          label="Tyre"
          value={
            <span className="inline-flex items-center gap-1.5">
              <TyreBadge compound={row.tyre.compound} size={18} />
              <span className="text-[13px]">{row.tyre.compound ? `${compoundLabel(row.tyre.compound)}${row.tyre.age !== null ? ` · ${row.tyre.age}` : ""}` : "—"}</span>
            </span>
          }
        />
        <Stat label="Last lap" value={formatLapTime(row.lastLap.value)} tone={row.lastLap.mark ? `m-${row.lastLap.mark}` : undefined} />
        <Stat label="Best lap" value={formatLapTime(row.bestLap.value)} tone={row.bestLap.mark === "session-best" ? "m-session-best" : undefined} />
        <Stat label={isRace ? "Pit stops" : "Laps"} value={isRace ? row.pitStops ?? "—" : row.lapsCompleted ?? "—"} />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="label">Best sectors</span>
          <span className="ml-auto text-[12px] text-fg-3">compare with</span>
          <label className="sr-only" htmlFor="rival">
            Compare with
          </label>
          <select id="rival" className="control h-7 text-[12px]" value={rival ?? ""} onChange={(e) => setRival(Number(e.target.value))}>
            {snapshot.rows
              .filter((r) => r.driverNumber !== driver)
              .map((r) => (
                <option key={r.driverNumber} value={r.driverNumber}>
                  {r.position ? `P${r.position} ` : ""}
                  {r.code}
                </option>
              ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const m = mine[i] ?? null;
            const t = theirs[i] ?? null;
            const f = fastest[i] ?? null;
            const isFastest = m !== null && f !== null && Math.round(m * 1000) === Math.round(f * 1000);
            const vsRival = m !== null && t !== null ? m - t : null;
            return (
              <div key={i} className="rounded-lg bg-bg-2 px-3 py-2">
                <div className="label">Sector {i + 1}</div>
                <div className={`tnum mt-0.5 text-[15px] font-semibold ${isFastest ? "m-session-best" : "text-fg"}`}>{formatSectorTime(m)}</div>
                <div className="tnum mt-1 text-[11.5px] text-fg-3">{isFastest ? "Fastest of anyone" : m !== null && f !== null ? `${formatDelta(m - f)} to fastest` : "—"}</div>
                <div className={`tnum text-[11.5px] ${vsRival === null ? "text-fg-3" : vsRival < 0 ? "text-green" : vsRival > 0 ? "text-red" : "text-fg-3"}`}>
                  {vsRival === null ? "" : `${formatDelta(vsRival)} vs ${rivalRow?.code ?? ""}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LapHistory snapshot={snapshot} driver={driver} />
    </div>
  );
}
