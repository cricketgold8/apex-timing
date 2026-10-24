"use client";

import { useMemo, useState } from "react";
import { useLapHistories } from "@/lib/client/useLaps";
import { useSettings } from "@/lib/client/settings";
import { filterLaps, type LapFilter } from "@/lib/timing/calculations";
import { formatLapTime, formatSectorTime, formatSpeed } from "@/lib/timing/formatters";
import type { TimingSnapshot } from "@/lib/timing/types";
import { ProviderErrorMessage, StateMessage, TyreBadge } from "@/components/ui/primitives";
import { ProvenanceNote } from "@/components/ui/Provenance";

const FILTERS: Array<{ id: LapFilter; label: string; title: string }> = [
  { id: "all", label: "All", title: "Every completed lap" },
  { id: "clean", label: "Clean", title: "Valid laps that are not pit in/out laps and were not run under SC/VSC/red flag (where known)" },
  { id: "pit", label: "Pit", title: "Pit-in and pit-out laps" },
  { id: "fastest", label: "Fastest", title: "Personal-best lap" },
];

export function LapHistory({ snapshot, driver }: { snapshot: TimingSnapshot; driver: number }) {
  const { settings } = useSettings();
  const laps = useLapHistories([driver]);
  const [filter, setFilter] = useState<LapFilter>("all");
  const row = snapshot.rows.find((r) => r.driverNumber === driver);
  const list = useMemo(() => filterLaps(laps.data?.[driver] ?? [], filter).slice().reverse(), [laps.data, driver, filter]);
  const sessionBest = snapshot.bests.lap?.time ?? null;

  return (
    <section className="panel flex min-h-0 flex-col" aria-label={`Lap history for ${row?.name ?? driver}`}>
      <div className="panel-head">
        <span className="panel-title">Lap history</span>
        <span className="display text-[14px] font-bold" style={{ color: "var(--text)" }}>
          {row?.code ?? driver}
        </span>
        <span className="truncate text-[11px] text-fg-3">{row?.name}</span>
        <div className="ml-auto flex gap-1" role="group" aria-label="Lap filter">
          {FILTERS.map((f) => (
            <button key={f.id} className="btn h-6 px-2 text-[11px]" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} title={f.title}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {laps.status === "error" && laps.error ? (
        <ProviderErrorMessage error={laps.error} onRetry={laps.reload} />
      ) : laps.status === "loading" && !laps.data ? (
        <StateMessage kind="loading" title="Loading laps" />
      ) : list.length === 0 ? (
        <StateMessage kind="empty" title="No laps match">
          {filter === "all" ? "No completed laps for this driver yet." : "Try another filter."}
        </StateMessage>
      ) : (
        <div className="max-h-[340px] overflow-auto">
          <table className="data-table tnum">
            <thead>
              <tr>
                <th className="text-right">Lap</th>
                <th className="text-right">Time</th>
                <th className="text-right">S1</th>
                <th className="text-right">S2</th>
                <th className="text-right">S3</th>
                <th className="text-right">ST</th>
                <th className="text-center">Tyre</th>
                <th className="text-right" title="* derived from the stint's starting age">Age</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => {
                const isSessionBest = l.time !== null && sessionBest !== null && Math.round(l.time * 1000) === Math.round(sessionBest * 1000) && l.valid !== false;
                return (
                  <tr key={l.lap}>
                    <td className="text-right text-fg-2">{l.lap}</td>
                    <td className={`text-right ${l.valid === false ? "m-invalid" : isSessionBest ? "m-session-best font-semibold" : l.personalBest ? "m-personal-best font-semibold" : "text-fg"}`}>{formatLapTime(l.time)}</td>
                    {l.sectors.map((s, i) => (
                      <td key={i} className={`text-right ${l.valid === false ? "m-invalid" : "text-fg-2"}`}>
                        {formatSectorTime(s)}
                      </td>
                    ))}
                    <td className="text-right text-fg-3">{formatSpeed(l.speedTrap, settings.speedUnit)}</td>
                    <td className="text-center">
                      <span className="inline-flex align-middle">
                        <TyreBadge compound={l.compound} size={16} />
                      </span>
                    </td>
                    <td className="text-right text-fg-2">
                      {l.tyreAge ?? "—"}
                      {l.tyreAgeBasis === "derived" && <span className="text-fg-3">*</span>}
                    </td>
                    <td className="max-w-[220px] truncate text-[11px]" title={l.deletedReason ?? undefined}>
                      {l.pitIn && <span className="mr-1 rounded-[2px] bg-yellow/15 px-1 text-yellow">PIT IN</span>}
                      {l.pitOut && <span className="mr-1 rounded-[2px] bg-blue/15 px-1 text-blue">PIT OUT</span>}
                      {l.neutralised && <span className="mr-1 rounded-[2px] bg-yellow/10 px-1 text-yellow">SC/VSC</span>}
                      {l.personalBest && <span className="mr-1 text-green">PB</span>}
                      {l.valid === false && <span className="text-fg-3">Deleted: {l.deletedReason}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-line px-2.5 py-1.5">
        <ProvenanceNote provenance={laps.provenance} />
      </div>
    </section>
  );
}
