"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { seriesVar } from "@/lib/client/series";

export interface ChannelPoint {
  distance: number;
  a: number | null;
  b: number | null;
}

interface Props {
  title: string;
  unit: string;
  data: ChannelPoint[];
  labels: { a: string; b: string | null };
  height: number;
  domain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  step?: boolean;
  zeroLine?: boolean;
  /** Single-series channel computed from both laps (delta). */
  single?: boolean;
  format?: (v: number) => string;
  showXAxis?: boolean;
}

/** One telemetry channel against distance. All channels share `syncId`, so the crosshair moves across every chart. */
export function TelemetryChart({ title, unit, data, labels, height, domain = ["auto", "auto"], step, zeroLine, single, format = (v) => v.toFixed(0), showXAxis = false }: Props) {
  return (
    <div className="border-b border-line-soft last:border-b-0">
      <div className="flex items-center gap-2 px-3 pt-1.5 text-[11px]">
        <span className="label">{title}</span>
        <span className="text-fg-3">{unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} syncId="telemetry" syncMethod="value" margin={{ top: 4, right: 16, bottom: showXAxis ? 16 : 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="distance"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={showXAxis ? { fill: "var(--text-3)", fontSize: 11 } : false}
            height={showXAxis ? 30 : 4}
            stroke="var(--line)"
            tickFormatter={(v: number) => `${Math.round(v)}`}
            label={showXAxis ? { value: "Distance from start line (m)", position: "insideBottom", offset: -8, fill: "var(--text-3)", fontSize: 11 } : undefined}
          />
          <YAxis domain={domain} tick={{ fill: "var(--text-3)", fontSize: 10.5 }} stroke="var(--line)" width={48} tickFormatter={format} allowDecimals={!step} />
          {zeroLine && <ReferenceLine y={0} stroke="var(--text-3)" strokeDasharray="3 3" />}
          <Tooltip
            cursor={{ stroke: "var(--text-2)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload as ChannelPoint;
              return (
                <div className="panel tnum px-2 py-1.5 text-[11.5px]">
                  <div className="label">{Math.round(Number(label))} m</div>
                  {single ? (
                    <div>
                      {title}: {p.a === null ? "—" : `${format(p.a)} ${unit}`}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: seriesVar(0) }} aria-hidden />
                        {labels.a}: {p.a === null ? "—" : `${format(p.a)} ${unit}`}
                      </div>
                      {labels.b && (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: seriesVar(1) }} aria-hidden />
                          {labels.b}: {p.b === null ? "—" : `${format(p.b)} ${unit}`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            }}
          />
          <Line dataKey="a" stroke={single ? "var(--text-2)" : seriesVar(0)} strokeWidth={single ? 1.5 : 2} dot={false} type={step ? "stepAfter" : "linear"} isAnimationActive={false} connectNulls={false} />
          {!single && labels.b && <Line dataKey="b" stroke={seriesVar(1)} strokeWidth={2} dot={false} type={step ? "stepAfter" : "linear"} isAnimationActive={false} connectNulls={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
