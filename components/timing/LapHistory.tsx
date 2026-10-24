"use client";

import { useMemo, useState } from "react";
import { useLapHistories } from "@/lib/client/useLaps";
import { filterLaps, type LapFilter } from "@/lib/timing/calculations";
import { formatLapTime, formatSectorTime } from "@/lib/timing/formatters";
import type { TimingSnapshot } from "@/lib/timing/types";
import { SourceInfo, Segmented } from "@/components/ui/Popover";
import { ProviderErrorMessage, StateMessage, TyreBadge } from "@/components/ui/primitives";

const FILTERS: Array<{ value: LapFilter; label: string; title: string }> = [
  { value: "all", label: "All", title: "Every completed lap" },
  { value: "clean", label: "Clean", title: "Valid laps that weren't pit laps or run under Safety Car / VSC" },
  { value: "pit", label: "Pit", title: "Laps into and out of the pits" },
  { value: "fastest", label: "Best", title: "Personal-best lap" },
];

/** Every lap a driver has completed, newest first. */
export function LapHistory({ snapshot, driver }: { snapshot: TimingSnapshot; driver: number }) {
  const laps = useLapHistories([driver]);
  const [filter, setFilter] = useState<LapFilter>("all");
  const list = useMemo(() => filterLaps(laps.data?.[driver] ?? [], filter).slice().reverse(), [laps.data, driver, filter]);
  const sessionBest = snapshot.bests.lap?.time ?? null;

  return (
    <section aria-label="Lap history">
      <div className="mb-2 flex items-center gap-2">
        <span className="label">Laps</span>
        <span className="ml-auto" />
        <Segmented size="sm" label="Which laps" value={filter} options={FILTERS} onChange={setFilter} />
        <SourceInfo provenance={laps.provenance} />
      </div>
      {laps.status === "error" && laps.error ? (
        <ProviderErrorMessage error={laps.error} onRetry={laps.reload} />
      ) : laps.status === "loading" && !laps.data ? (
        <StateMessage kind="loading" title="Loading laps" />
      ) : list.length === 0 ? (
        <StateMessage kind="empty" title={filter === "all" ? "No completed laps yet" : "No laps match"} />
      ) : (
        <div className="max-h-[360px] overflow-auto rounded-lg border border-line-soft">
          <table className="data-table tnum text-[12.5px]">
            <thead>
              <tr>
                <th className="text-right">Lap</th>
                <th className="text-right">Time</th>
                <th className="text-right">S1</th>
                <th className="text-right">S2</th>
                <th className="text-right">S3</th>
                <th>Tyre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((l) => {
                const isSessionBest = l.time !== null && sessionBest !== null && Math.round(l.time * 1000) === Math.round(sessionBest * 1000) && l.valid !== false;
                return (
                  <tr key={l.lap}>
                    <td className="text-right text-fg-3">{l.lap}</td>
                    <td className={`text-right font-medium ${l.valid === false ? "m-invalid" : isSessionBest ? "m-session-best" : l.personalBest ? "m-personal-best" : "text-fg"}`} title={l.deletedReason ? `Deleted: ${l.deletedReason}` : undefined}>
                      {formatLapTime(l.time)}
                    </td>
                    {l.sectors.map((s, i) => (
                      <td key={i} className={`text-right ${l.valid === false ? "m-invalid" : "text-fg-2"}`}>
                        {formatSectorTime(s)}
                      </td>
                    ))}
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <TyreBadge compound={l.compound} size={16} />
                        <span className="text-[11.5px] text-fg-3">{l.tyreAge ?? ""}</span>
                      </span>
                    </td>
                    <td className="text-[11px]">
                      {l.pitIn && <span className="mr-1 rounded bg-yellow/15 px-1.5 py-0.5 text-yellow">Pit in</span>}
                      {l.pitOut && <span className="mr-1 rounded bg-blue/15 px-1.5 py-0.5 text-blue">Pit out</span>}
                      {l.neutralised && <span className="mr-1 rounded bg-yellow/10 px-1.5 py-0.5 text-yellow">SC/VSC</span>}
                      {l.valid === false && <span className="rounded bg-panel-3 px-1.5 py-0.5 text-fg-3">Deleted</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
