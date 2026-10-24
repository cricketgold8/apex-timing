"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Brush, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useFeed } from "@/lib/client/feed";
import { useRemoteResource } from "@/lib/client/remote";
import { seriesVar } from "@/lib/client/series";
import { useSettings } from "@/lib/client/settings";
import { useLapHistories } from "@/lib/client/useLaps";
import { convertSpeed, formatDelta, formatLapTime } from "@/lib/timing/formatters";
import { demoTelemetry } from "@/lib/timing/providers/demo/provider";
import { alignLaps } from "@/lib/timing/telemetry";
import type { LapRecord, Provenance, TelemetryLap } from "@/lib/timing/types";
import { PageTitle } from "@/components/ui/DriverCell";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { SourceInfo } from "@/components/ui/Popover";
import { TelemetryChart, type ChannelPoint } from "./TelemetryChart";

type Channel = "speed" | "throttle" | "brake" | "gear" | "rpm" | "delta";
const CHANNELS: Array<{ id: Channel; label: string }> = [
  { id: "speed", label: "Speed" },
  { id: "throttle", label: "Throttle" },
  { id: "brake", label: "Brake" },
  { id: "gear", label: "Gear" },
  { id: "rpm", label: "RPM" },
  { id: "delta", label: "Delta" },
];

function useTelemetry(driver: number | null, lap: number | null) {
  const feed = useFeed();
  const isDemo = feed.source.kind === "demo";
  const base = feed.source.kind === "historical" ? `mode=historical&session=${feed.source.sessionKey}` : feed.source.kind === "live" ? `mode=live&session=${feed.source.sessionKey}` : null;
  const remote = useRemoteResource<TelemetryLap>(!isDemo && base && driver && lap ? `/api/timing/telemetry?${base}&driver=${driver}&lap=${lap}` : null, { scope: `${feed.scope}|${driver}|${lap}` });
  const local = useMemo(() => {
    if (!isDemo || !driver || !lap) return null;
    const r = demoTelemetry(driver, lap);
    return r ? { data: r.data, provenance: r.provenance as Provenance | null, status: "ready" as const, error: null, offline: false, lastSuccessAt: null, reload: () => {} } : null;
  }, [isDemo, driver, lap]);
  return local ?? remote;
}

function bestLapNo(laps: LapRecord[] | undefined): number | null {
  const valid = (laps ?? []).filter((l) => l.time !== null && l.valid !== false && !l.pitIn && !l.pitOut);
  if (!valid.length) return null;
  return valid.reduce((b, l) => ((l.time as number) < (b.time as number) ? l : b)).lap;
}

function Picker({ id, label, slot, driver, lap, laps, rows, onDriver, onLap }: { id: string; label: string; slot: number; driver: number | null; lap: number | null; laps: LapRecord[]; rows: Array<{ driverNumber: number; code: string; position: number | null }>; onDriver: (n: number | null) => void; onLap: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesVar(slot) }} aria-hidden />
      <label className="label" htmlFor={`${id}-d`}>
        {label}
      </label>
      <select id={`${id}-d`} className="control h-7" value={driver ?? ""} onChange={(e) => onDriver(e.target.value ? Number(e.target.value) : null)}>
        {slot === 1 && <option value="">None</option>}
        {rows.map((r) => (
          <option key={r.driverNumber} value={r.driverNumber}>
            {r.position ? `P${r.position} ` : ""}
            {r.code}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${id}-l`}>
        Lap
      </label>
      <select id={`${id}-l`} className="control h-7 w-[170px]" value={lap ?? ""} onChange={(e) => onLap(Number(e.target.value))} disabled={!driver}>
        {laps
          .filter((l) => l.time !== null)
          .map((l) => (
            <option key={l.lap} value={l.lap}>
              Lap {l.lap} · {formatLapTime(l.time)}
              {l.personalBest ? " · PB" : ""}
              {l.valid === false ? " · deleted" : ""}
              {l.pitIn || l.pitOut ? " · pit" : ""}
            </option>
          ))}
      </select>
    </div>
  );
}

export function TelemetryView() {
  const feed = useFeed();
  const { settings } = useSettings();
  const snap = feed.snapshot.data;
  const rows = snap?.rows ?? [];
  const isDemo = feed.source.kind === "demo";

  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [lapA, setLapA] = useState<number | null>(null);
  const [lapB, setLapB] = useState<number | null>(null);
  const [channels, setChannels] = useState<Channel[]>(["speed", "throttle", "brake", "gear", "delta"]);
  const [range, setRange] = useState<[number, number] | null>(null);

  // Defaults: the two leading cars, each on their fastest clean lap.
  useEffect(() => {
    setA(rows[0]?.driverNumber ?? null);
    setB(rows[1]?.driverNumber ?? null);
    setLapA(null);
    setLapB(null);
    setRange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.scope, rows.length > 0]);

  const laps = useLapHistories([a, b].filter((x): x is number => x !== null));
  // In demo mode the history grows with the simulation clock; pick defaults once per selection.
  useEffect(() => {
    if (a && lapA === null) setLapA(bestLapNo(laps.data?.[a]));
  }, [a, lapA, laps.data]);
  useEffect(() => {
    if (b && lapB === null) setLapB(bestLapNo(laps.data?.[b]));
  }, [b, lapB, laps.data]);

  const telA = useTelemetry(a, lapA);
  const telB = useTelemetry(b, lapB);
  const codeOf = (n: number | null) => rows.find((r) => r.driverNumber === n)?.code ?? (n ? String(n) : "");
  const labels = { a: `${codeOf(a)} L${lapA ?? "?"}`, b: b && lapB ? `${codeOf(b)} L${lapB}` : null };

  const aligned = useMemo(() => (telA.data ? alignLaps(telA.data, b && telB.data ? telB.data : null, 10) : []), [telA.data, telB.data, b]);
  const view = range ? aligned.filter((p) => p.distance >= range[0] && p.distance <= range[1]) : aligned;
  const series = (key: "speed" | "throttle" | "brake" | "gear" | "rpm", conv: (v: number) => number = (v) => v): ChannelPoint[] =>
    view.map((p) => ({ distance: p.distance, a: p.a[key] != null ? conv(p.a[key] as number) : null, b: p.b[key] != null ? conv(p.b[key] as number) : null }));
  const speedConv = (v: number) => convertSpeed(v, settings.speedUnit);

  // Sector segments from lap A's sector times, mapped to distance through its own time channel.
  const segments = useMemo(() => {
    const lapRec = a && lapA ? laps.data?.[a]?.find((l) => l.lap === lapA) : undefined;
    if (!lapRec || !telA.data || lapRec.sectors.some((s) => s === null)) return null;
    const [s1, s2] = lapRec.sectors as number[];
    const at = (t: number) => telA.data!.samples.find((x) => x.t >= t)?.distance ?? null;
    const d1 = at(s1!);
    const d2 = at(s1! + s2!);
    const end = telA.data.samples[telA.data.samples.length - 1]?.distance ?? null;
    if (d1 === null || d2 === null || end === null) return null;
    return [
      { label: "S1", r: [0, d1] as [number, number] },
      { label: "S2", r: [d1, d2] as [number, number] },
      { label: "S3", r: [d2, end] as [number, number] },
    ];
  }, [a, lapA, laps.data, telA.data]);

  const finalDelta = aligned.length ? aligned[aligned.length - 1]?.delta ?? null : null;
  const anyError = (telA.status === "error" && telA.error) || (telB.status === "error" && telB.error);

  return (
    <div className="flex flex-col gap-3">
      <PageTitle
        title="Telemetry"
        subtitle={isDemo ? "Example laps from the simulated demo race — not recorded car data" : "Compare two laps: speed, throttle, braking and gears around the circuit"}
        provenance={telA.provenance}
        info={
          <>
            <p className="mb-2">
              Only the channels the source provides are shown: speed, throttle, brake (on/off), gear and engine RPM. There is no battery, energy or brake-temperature data, and DRS doesn&apos;t exist in 2026.
            </p>
            <p className="mb-2">
              Both laps are lined up by distance (10 m steps). Lap B&apos;s distance is scaled to lap A&apos;s length to cancel measuring drift; the delta compares each lap&apos;s own time at the same point.
            </p>
          </>
        }
      />

      {feed.source.kind !== "demo" && feed.source.kind !== "historical" && feed.source.kind !== "live" ? (
        <div className="panel">
          <StateMessage kind="info" title="No telemetry for this selection">
            Telemetry is available for completed sessions (historical), sessions in progress with live credentials, or the demo. <Link className="underline" href="/schedule">Choose a session</Link>.
          </StateMessage>
        </div>
      ) : !snap ? (
        <div className="panel">
          {feed.snapshot.error ? <ProviderErrorMessage error={feed.snapshot.error} onRetry={feed.reload} /> : <StateMessage kind="loading" title="Loading session" />}
        </div>
      ) : (
        <section className="panel" aria-label="Telemetry comparison">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-3 py-2">
            <Picker id="ta" label="A" slot={0} driver={a} lap={lapA} laps={(a && laps.data?.[a]) || []} rows={rows} onDriver={(n) => (setA(n), setLapA(null))} onLap={setLapA} />
            <Picker id="tb" label="B" slot={1} driver={b} lap={lapB} laps={(b && laps.data?.[b]) || []} rows={rows} onDriver={(n) => (setB(n), setLapB(null))} onLap={setLapB} />
            <div className="flex flex-wrap gap-1" role="group" aria-label="Channels">
              {CHANNELS.map((c) => (
                <button key={c.id} className="btn h-7" aria-pressed={channels.includes(c.id)} onClick={() => setChannels((cs) => (cs.includes(c.id) ? cs.filter((x) => x !== c.id) : [...cs, c.id]))} disabled={c.id === "delta" && !b}>
                  {c.label}
                </button>
              ))}
            </div>
            {finalDelta !== null && (
              <span className="tnum ml-auto text-[12px] text-fg-2">
                Lap delta (B − A): <span className={finalDelta > 0 ? "text-green" : "text-red"}>{formatDelta(finalDelta)} s</span>
              </span>
            )}
          </div>

          {anyError ? (
            <ProviderErrorMessage error={(telA.error ?? telB.error)!} onRetry={() => (telA.reload(), telB.reload())} />
          ) : !telA.data ? (
            <StateMessage kind={telA.status === "loading" || lapA === null ? "loading" : "empty"} title={lapA === null ? "Choose a lap" : "Loading car data"} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
                <span className="label">Segment</span>
                <button className="btn h-6" aria-pressed={range === null} onClick={() => setRange(null)}>
                  Full lap
                </button>
                {segments?.map((s) => (
                  <button key={s.label} className="btn h-6" aria-pressed={range?.[0] === s.r[0] && range?.[1] === s.r[1]} onClick={() => setRange(s.r)}>
                    {s.label}
                  </button>
                ))}
                <span className="text-[11px] text-fg-3">or drag the handles on the overview to zoom</span>
              </div>
              <div className="px-1">
                <ResponsiveContainer width="100%" height={64}>
                  <AreaChart data={aligned.map((p) => ({ distance: p.distance, v: p.a.speed }))} margin={{ top: 4, right: 16, bottom: 0, left: 48 }}>
                    <XAxis dataKey="distance" hide />
                    <YAxis hide domain={[0, "dataMax"]} />
                    <Area dataKey="v" stroke="var(--text-3)" fill="var(--panel-2)" isAnimationActive={false} />
                    <Brush
                      dataKey="distance"
                      height={20}
                      stroke="var(--text-3)"
                      fill="var(--bg-2)"
                      travellerWidth={8}
                      tickFormatter={(v: number) => `${Math.round(v)} m`}
                      onChange={(e: { startIndex?: number; endIndex?: number }) => {
                        if (e.startIndex == null || e.endIndex == null) return;
                        const s = aligned[e.startIndex]?.distance;
                        const en = aligned[e.endIndex]?.distance;
                        if (s !== undefined && en !== undefined) setRange(e.startIndex === 0 && e.endIndex === aligned.length - 1 ? null : [s, en]);
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="pb-2">
                {(() => {
                  const charts: Array<{ id: Channel; el: (showX: boolean) => React.ReactNode }> = [
                    { id: "speed", el: (x) => <TelemetryChart title="Speed" unit={settings.speedUnit === "kmh" ? "km/h" : "mph"} data={series("speed", speedConv)} labels={labels} height={200} showXAxis={x} /> },
                    { id: "throttle", el: (x) => <TelemetryChart title="Throttle" unit="%" data={series("throttle")} labels={labels} height={110} domain={[0, 100]} showXAxis={x} /> },
                    { id: "brake", el: (x) => <TelemetryChart title="Brake" unit="on/off (source reports 0 or 100)" data={series("brake")} labels={labels} height={80} domain={[0, 100]} step showXAxis={x} /> },
                    { id: "gear", el: (x) => <TelemetryChart title="Gear" unit="" data={series("gear")} labels={labels} height={110} domain={[0, 8]} step showXAxis={x} /> },
                    { id: "rpm", el: (x) => <TelemetryChart title="Engine speed" unit="rpm" data={series("rpm")} labels={labels} height={110} showXAxis={x} /> },
                    {
                      id: "delta",
                      el: (x) => (
                        <TelemetryChart
                          title={`Delta ${labels.b ?? "B"} vs ${labels.a}`}
                          unit="s (positive = B behind)"
                          data={view.map((p) => ({ distance: p.distance, a: p.delta, b: null }))}
                          labels={labels}
                          height={110}
                          zeroLine
                          single
                          format={(v) => v.toFixed(2)}
                          showXAxis={x}
                        />
                      ),
                    },
                  ];
                  const visible = charts.filter((c) => channels.includes(c.id) && (c.id !== "delta" || b !== null));
                  return visible.map((c, i) => <div key={c.id}>{c.el(i === visible.length - 1)}</div>);
                })()}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
