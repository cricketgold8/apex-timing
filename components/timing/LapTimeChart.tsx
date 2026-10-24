"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MAX_SERIES, seriesVar, useSeriesSlots } from "@/lib/client/series";
import { useLapHistories } from "@/lib/client/useLaps";
import { formatLapTime } from "@/lib/timing/formatters";
import type { LapRecord, TimingSnapshot } from "@/lib/timing/types";
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
  const [drivers, setDrivers] = useState<number[]>(() => [...new Set(initial)].slice(0, 4));
  useEffect(() => {
    // When the session changes, drop drivers that are not in it.
    setDrivers((prev) => {
      const valid = prev.filter((d) => snapshot.rows.some((r) => r.driverNumber === d));
      return valid.length ? valid : [...new Set(initial)].slice(0, 4);
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

  return (
    <section className="panel" aria-label="Lap time chart">
      <div className="panel-head">
        <span className="panel-title">Lap times</span>
        <span className="text-[11px] text-fg-3">
          up to {MAX_SERIES} drivers · {drivers.length} selected
        </span>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-line-soft px-3 py-2" role="group" aria-label="Drivers shown">
        {snapshot.rows.map((r) => {
          const on = drivers.includes(r.driverNumber);
          return (
            <button
              key={r.driverNumber}
              className="btn h-6 px-1.5 text-[11px]"
              aria-pressed={on}
              onClick={() => toggle(r.driverNumber)}
              disabled={!on && drivers.length >= MAX_SERIES}
              title={`${r.name}${!on && drivers.length >= MAX_SERIES ? ` — limit of ${MAX_SERIES} reached` : ""}`}
            >
              {on && <span className="h-2 w-2 rounded-full" style={{ background: seriesVar(slots.get(r.driverNumber) ?? 0) }} aria-hidden />}
              <span className="display font-bold tracking-wide">{r.code}</span>
            </button>
          );
        })}
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
          <ResponsiveContainer width="100%" height={280}>
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
                label={{ value: "Lap time (faster ↑)", angle: -90, position: "insideLeft", offset: 4, fill: "var(--text-3)", fontSize: 11, dy: 50 }}
              />
              <Tooltip
                cursor={{ stroke: "var(--text-3)", strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as Point;
                  return (
                    <div className="panel px-2.5 py-2 text-[12px]">
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
          <p className="px-3 pb-2 text-[10.5px] text-fg-3">
            Y axis is reversed (faster laps higher) and spans the fastest plotted lap to +{Math.round((CEILING - 1) * 100)}%.{" "}
            {isRace
              ? "Slower laps — lap 1, pit laps, SC/VSC — are pinned to the bottom edge (▼) with the exact time on hover."
              : "Laps slower than that (out, cool-down and aborted laps) are omitted; the lap history table lists every lap."}{" "}
            ■ pit in/out lap, ◌ lap deleted by race control.
          </p>
        </div>
      )}
    </section>
  );
}
