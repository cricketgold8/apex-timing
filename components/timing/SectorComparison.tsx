"use client";

import { useMemo } from "react";
import { useLapHistories } from "@/lib/client/useLaps";
import { seriesVar } from "@/lib/client/series";
import { formatDelta, formatLapTime, formatSectorTime } from "@/lib/timing/formatters";
import type { LapRecord, TimingSnapshot } from "@/lib/timing/types";
import { StateMessage } from "@/components/ui/primitives";

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

function DriverPicker({ id, value, onChange, snapshot, label }: { id: string; value: number; onChange: (n: number) => void; snapshot: TimingSnapshot; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px]" htmlFor={id}>
      <span className="label">{label}</span>
      <select id={id} className="control h-6 text-[12px]" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {snapshot.rows.map((r) => (
          <option key={r.driverNumber} value={r.driverNumber}>
            {r.position ? `P${r.position} ` : ""}
            {r.code}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Best valid sector times for two drivers against the session-best sectors. The ideal lap is the sum of a driver's
 * best sectors — a theoretical figure, labelled as such.
 */
export function SectorComparison({ snapshot, a, b, onChange }: { snapshot: TimingSnapshot; a: number; b: number; onChange: (a: number, b: number) => void }) {
  const laps = useLapHistories([a, b]);
  const rowA = snapshot.rows.find((r) => r.driverNumber === a);
  const rowB = snapshot.rows.find((r) => r.driverNumber === b);
  const bestA = useMemo(() => bestSectors(laps.data?.[a]), [laps.data, a]);
  const bestB = useMemo(() => bestSectors(laps.data?.[b]), [laps.data, b]);
  const session = snapshot.bests.sectors;
  const ideal = (s: (number | null)[]) => (s.every((x) => x !== null) ? (s as number[]).reduce((x, y) => x + y, 0) : null);

  return (
    <section className="panel" aria-label="Sector comparison">
      <div className="panel-head flex-wrap py-1">
        <span className="panel-title">Sector comparison</span>
        <div className="ml-auto flex items-center gap-2">
          <DriverPicker id="cmp-a" label="A" value={a} onChange={(n) => onChange(n, b)} snapshot={snapshot} />
          <DriverPicker id="cmp-b" label="B" value={b} onChange={(n) => onChange(a, n)} snapshot={snapshot} />
        </div>
      </div>
      {laps.status === "loading" && !laps.data ? (
        <StateMessage kind="loading" title="Loading laps" />
      ) : (
        <div className="p-3">
          <table className="data-table tnum">
            <thead>
              <tr>
                <th>Best sectors</th>
                <th className="text-right">S1</th>
                <th className="text-right">S2</th>
                <th className="text-right">S3</th>
                <th className="text-right" title="Sum of the driver's best sectors — theoretical">Ideal</th>
                <th className="text-right">Best lap</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: rowA?.code ?? String(a), sectors: bestA, best: rowA?.bestLap.value ?? null, slot: 0 },
                { label: rowB?.code ?? String(b), sectors: bestB, best: rowB?.bestLap.value ?? null, slot: 1 },
              ].map((r) => (
                <tr key={r.slot}>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: seriesVar(r.slot) }} aria-hidden />
                      <span className="display text-[14px] font-bold">{r.label}</span>
                    </span>
                  </td>
                  {r.sectors.map((s, i) => (
                    <td key={i} className={`text-right ${s !== null && session[i] !== null && Math.round(s * 1000) === Math.round((session[i] as number) * 1000) ? "m-session-best font-semibold" : "text-fg"}`}>
                      {formatSectorTime(s)}
                    </td>
                  ))}
                  <td className="text-right text-fg-2">{formatLapTime(ideal(r.sectors))}</td>
                  <td className="text-right">{formatLapTime(r.best)}</td>
                </tr>
              ))}
              <tr>
                <td className="text-fg-2">Session best</td>
                {session.map((s, i) => (
                  <td key={i} className="m-session-best text-right">
                    {formatSectorTime(s)}
                  </td>
                ))}
                <td className="text-right text-fg-2">{formatLapTime(ideal(session))}</td>
                <td className="m-session-best text-right">{formatLapTime(snapshot.bests.lap?.time)}</td>
              </tr>
              <tr>
                <td className="text-fg-2">A − B</td>
                {[0, 1, 2].map((i) => {
                  const d = bestA[i] !== null && bestB[i] !== null ? (bestA[i] as number) - (bestB[i] as number) : null;
                  return (
                    <td key={i} className={`text-right ${d === null ? "text-fg-3" : d < 0 ? "text-green" : d > 0 ? "text-red" : "text-fg-2"}`}>
                      {formatDelta(d)}
                    </td>
                  );
                })}
                <td className="text-right text-fg-2">{formatDelta(ideal(bestA) !== null && ideal(bestB) !== null ? (ideal(bestA) as number) - (ideal(bestB) as number) : null)}</td>
                <td className="text-right text-fg-2">{formatDelta(rowA?.bestLap.value != null && rowB?.bestLap.value != null ? rowA.bestLap.value - rowB.bestLap.value : null)}</td>
              </tr>
            </tbody>
          </table>

          {/* Gap to session best per sector, as bars: shorter = closer to the fastest sector. */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => {
              const ref = session[i];
              const deltas = [bestA[i], bestB[i]].map((s) => (s != null && ref != null ? s - ref : null));
              const max = Math.max(0.3, ...deltas.map((d) => d ?? 0));
              return (
                <div key={i}>
                  <div className="label mb-1">S{i + 1} · to session best</div>
                  {deltas.map((d, k) => (
                    <div key={k} className="mb-1 flex items-center gap-2" title={d === null ? "No valid sector" : `${formatDelta(d)} s`}>
                      <div className="h-2.5 flex-1 rounded-[2px] bg-bg-2">
                        <div className="h-full rounded-[2px]" style={{ width: d === null ? 0 : `${Math.max(2, (d / max) * 100)}%`, background: seriesVar(k) }} />
                      </div>
                      <span className="tnum w-[52px] text-right text-[11px] text-fg-2">{d === null ? "—" : d === 0 ? "best" : formatDelta(d)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10.5px] text-fg-3">Only laps not deleted by race control count. Purple = equals the session-best sector.</p>
        </div>
      )}
    </section>
  );
}
