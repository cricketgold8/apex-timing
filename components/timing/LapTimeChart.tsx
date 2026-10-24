"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MAX_SERIES, seriesVar, useSeriesSlots } from "@/lib/client/series";
import { useLapHistories } from "@/lib/client/useLaps";
import { formatLapTime } from "@/lib/timing/formatters";
import type { LapRecord, TimingSnapshot } from "@/lib/timing/types";
import { SourceInfo } from "@/components/ui/Popover";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";

/** Axis upper bound relative to the fastest lap plotted; slower laps are pinned to the edge and flagged. */
const CEILING = 1.07;

interface Point {
  lap: number;
  [k: string]: number | null | boolean | string | undefined;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: Point;
  dataKey?: unknown;
}

export function LapTimeChart({ snapshot, initial }: { snapshot: TimingSnapshot; initial: number[] }) {
  const [drivers, setDrivers] = useState<number[]>(() => [...new Set(initial)].slice(0, 3));
  useEffect(() => {
    // When the session changes, drop drivers that are not in it.
    setDrivers((prev) => {
      const valid = prev.filter((d) => snapshot.rows.some((r) => r.driverNumber === d));
      return valid.length ? valid : [...new Set(initial)].slice(0, 3);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.session.id]);
  const slots = useSeriesSlots(drivers);
  const laps = useLapHistories(drivers);
  const codes = new Map(snapshot.rows.map((r) => [r.driverNumber, r.code]));

  // In timed sessions most laps are out/cool-down laps; pinning them to the axis edge would bury the push laps.
  const isRace = snapshot.session.type === "RACE" || snapshot.session.type === "SPRINT";
  const { data, floor, ceiling } = useMemo(() => {
    const by = laps.data ?? {};
    const all: LapRecord[] = drivers.flatMap((d) => by[d] ?? []);
    const times = all.filter((l) => l.time !== null && l.valid !== false).map((l) => l.time as number);
    const fastest = times.length ? Math.min(...times) : null;
    const ceil = fastest !== null ? fastest * CEILING : null;
    const maxLap = Math.max(0, ...all.map((l) => l.lap));
    const rows: Point[] = [];
    for (let lap = 1; lap <= maxLap; lap++) {
      const p: Point = { lap };
      for (const d of drivers) {
        const l = (by[d] ?? []).find((x) => x.lap === lap);
        if (!l || l.time === null) {
          p[`d${d}`] = null;
          continue;
        }
        const clamped = ceil !== null && l.time > ceil;
        p[`d${d}`] = clamped ? (isRace ? ceil : null) : l.time;
        p[`raw${d}`] = l.time;
        p[`clamp${d}`] = clamped;
        p[`pit${d}`] = l.pitIn || l.pitOut;
        p[`inv${d}`] = l.valid === false;
        p[`neu${d}`] = l.neutralised === true;
      }
      rows.push(p);
    }
    return { data: rows, floor: fastest !== null ? Math.floor((fastest - 0.4) * 2) / 2 : 0, ceiling: ceil !== null ? Math.ceil(ceil * 2) / 2 : 1 };
  }, [laps.data, drivers, isRace]);

  const toggle = (d: number) =>
    setDrivers((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : prev.length >= MAX_SERIES ? prev : [...prev, d]));

  const renderDot = (d: number) =>
    function DotFor(props: DotProps) {
      const { cx, cy, payload } = props;
      if (cx == null || cy == null || !payload) return <g key={`${d}-${payload?.lap}`} />;
      const colour = seriesVar(slots.get(d) ?? 0);
      const key = `${d}-${payload.lap}`;
      if (payload[`clamp${d}`]) return <path key={key} d={`M${cx - 4},${cy - 3} L${cx},${cy + 4} L${cx + 4},${cy - 3} Z`} fill={colour} stroke="var(--panel)" strokeWidth={1.5} />;
      if (payload[`pit${d}`]) return <rect key={key} x={cx - 3.5} y={cy - 3.5} width={7} height={7} fill="var(--panel)" stroke={colour} strokeWidth={2} />;
      if (payload[`inv${d}`]) return <circle key={key} cx={cx} cy={cy} r={3.5} fill="var(--panel)" stroke={colour} strokeWidth={1.5} strokeDasharray="2 1.5" />;
      // Timed sessions have isolated push laps, so every plotted lap gets a marker.
      if (!isRace && payload[`d${d}`] != null) return <circle key={key} cx={cx} cy={cy} r={3} fill={colour} stroke="var(--panel)" strokeWidth={1} />;
      return <g key={key} />;
    };

  const available = snapshot.rows.filter((r) => !drivers.includes(r.driverNumber));

  return (
    <section aria-label="Lap time chart">
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-1" role="group" aria-label="Drivers shown">
        {drivers.map((d) => (
          <button key={d} className="chip h-7 hover:border-fg-3" onClick={() => toggle(d)} title={`Remove ${codes.get(d)}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesVar(slots.get(d) ?? 0) }} aria-hidden />
            <span className="display text-[13px] font-bold tracking-wide text-fg">{codes.get(d)}</span>
            <span aria-hidden className="text-fg-3">×</span>
          </button>
        ))}
        {drivers.length < MAX_SERIES && (
          <>
            <label className="sr-only" htmlFor="lap-chart-add">
              Add a driver
            </label>
            <select id="lap-chart-add" className="control h-7 text-[12px]" value="" onChange={(e) => e.target.value && toggle(Number(e.target.value))}>
              <option value="">+ Add driver</option>
              {available.map((r) => (
                <option key={r.driverNumber} value={r.driverNumber}>
                  {r.position ? `P${r.position} ` : ""}
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="ml-auto" />
        <SourceInfo provenance={laps.provenance}>
          <p className="mb-2">
            Faster laps are higher. The scale runs from the fastest lap shown to {Math.round((CEILING - 1) * 100)}% slower.{" "}
            {isRace ? "Slower laps (lap 1, pit stops, Safety Car) sit on the bottom edge — hover for the exact time." : "Slower laps (out-laps and cool-down laps) are left off; the Driver tab lists every lap."} Squares mark pit-stop laps; hollow dots
            mark laps deleted by race control.
          </p>
        </SourceInfo>
      </div>
      {laps.status === "error" && laps.error ? (
        <ProviderErrorMessage error={laps.error} onRetry={laps.reload} />
      ) : drivers.length === 0 ? (
        <StateMessage kind="empty" title="Select drivers to compare" />
      ) : laps.status === "loading" && !laps.data ? (
        <StateMessage kind="loading" title="Loading laps" />
      ) : data.length === 0 ? (
        <StateMessage kind="empty" title="No completed laps yet" />
      ) : (
        <div className="px-1 pt-2">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={data} margin={{ top: 8, right: 40, bottom: 18, left: 8 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="lap" type="number" domain={[1, "dataMax"]} allowDecimals={false} tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--line)" label={{ value: "Lap", position: "insideBottom", offset: -10, fill: "var(--text-3)", fontSize: 11 }} />
              <YAxis
                domain={[floor, ceiling]}
                reversed
                tickFormatter={(v: number) => formatLapTime(v)}
                tick={{ fill: "var(--text-3)", fontSize: 11 }}
                stroke="var(--line)"
                width={64}
                
              />
              <Tooltip
                cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as Point;
                  return (
                    <div className="pop px-3 py-2 text-[12px]">
                      <div className="label mb-1">Lap {label}</div>
                      {drivers.map((d) => {
                        const raw = p[`raw${d}`] as number | undefined;
                        if (raw === undefined) return null;
                        const tags = [p[`pit${d}`] && "pit", p[`inv${d}`] && "deleted", p[`neu${d}`] && "SC/VSC", p[`clamp${d}`] && "off scale"].filter(Boolean).join(", ");
                        return (
                          <div key={d} className="tnum flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: seriesVar(slots.get(d) ?? 0) }} aria-hidden />
                            <span className="display w-8 font-bold">{codes.get(d)}</span>
                            <span className="text-fg">{formatLapTime(raw)}</span>
                            {tags && <span className="text-fg-3">{tags}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              {drivers.map((d) => (
                <Line
                  key={d}
                  dataKey={`d${d}`}
                  name={codes.get(d) ?? String(d)}
                  stroke={seriesVar(slots.get(d) ?? 0)}
                  strokeWidth={2}
                  dot={renderDot(d)}
                  activeDot={{ r: 4, stroke: "var(--panel)", strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                  label={(props: { x?: number | string; y?: number | string; index?: number }) => {
                    const last = data.length - 1 - [...data].reverse().findIndex((pt) => pt[`d${d}`] != null);
                    const x = Number(props.x);
                    const y = Number(props.y);
                    if (props.index !== last || !Number.isFinite(x) || !Number.isFinite(y)) return <g key={`${d}-l-${props.index}`} />;
                    return (
                      <text key={`${d}-label`} x={x + 6} y={y} dominantBaseline="middle" fontSize={11} fontWeight={700} fill="var(--text-2)" style={{ fontFamily: "var(--font-display)" }}>
                        {codes.get(d)}
                      </text>
                    );
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
