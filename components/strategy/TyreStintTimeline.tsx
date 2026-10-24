"use client";

import { useMemo } from "react";
import { useTimingResource } from "@/lib/client/feed";
import { summariseStints } from "@/lib/timing/calculations";
import { demoStints } from "@/lib/timing/providers/demo/provider";
import type { PitStop, Stint, TimingSnapshot } from "@/lib/timing/types";
import { SourceInfo } from "@/components/ui/Popover";
import { ProviderErrorMessage, StateMessage, TyreBadge, compoundColour, compoundLabel } from "@/components/ui/primitives";

type StintData = { stints: Stint[]; pits: PitStop[]; lapsCompleted: Record<number, number> };

/** One bar per driver, one coloured segment per set of tyres, with pit visits marked. */
export function TyreStintTimeline({ snapshot, selected, onSelect }: { snapshot: TimingSnapshot; selected: number | null; onSelect: (n: number) => void }) {
  const res = useTimingResource<StintData>("stints", demoStints);
  const total = useMemo(() => {
    const done = Math.max(1, ...Object.values(res.data?.lapsCompleted ?? {}));
    return Math.max(done, snapshot.session.totalLaps ?? 0);
  }, [res.data, snapshot.session.totalLaps]);

  if (res.status === "error" && res.error) return <ProviderErrorMessage error={res.error} onRetry={res.reload} />;
  const ticks = Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => i * 10).filter((t) => t > 0 && t < total);
  const used = new Set((res.data?.stints ?? []).map((s) => s.compound).filter(Boolean));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2 text-[12px] text-fg-2">
        {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const)
          .filter((c) => used.has(c) || c === "SOFT" || c === "MEDIUM" || c === "HARD")
          .map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <TyreBadge compound={c} size={16} />
              {compoundLabel(c)}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-[2px] rounded bg-fg" aria-hidden />
          Pit stop
        </span>
        <span className="ml-auto" />
        <SourceInfo provenance={res.provenance}>
          <p className="mb-2">
            Each bar is one driver&apos;s race; each coloured block is one set of tyres, labelled with its laps. Striped = still running. A pit stop doesn&apos;t always mean new tyres, so only tyre changes reported by the
            source are drawn.
          </p>
        </SourceInfo>
      </div>
      {res.status === "loading" && !res.data ? (
        <StateMessage kind="loading" title="Loading tyre data" />
      ) : !res.data || res.data.stints.length === 0 ? (
        <StateMessage kind="empty" title="No tyre data for this session" />
      ) : (
        <div className="px-3 pb-3">
          <div className="relative ml-[92px] h-4 text-[10.5px] text-fg-3" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="tnum absolute -translate-x-1/2" style={{ left: `${(t / total) * 100}%` }}>
                {t}
              </span>
            ))}
          </div>
          <ul>
            {snapshot.rows.map((r) => {
              const stints = summariseStints(
                res.data!.stints.filter((s) => s.driverNumber === r.driverNumber),
                res.data!.lapsCompleted[r.driverNumber] ?? null,
              );
              const pits = res.data!.pits.filter((p) => p.driverNumber === r.driverNumber);
              const sel = selected === r.driverNumber;
              return (
                <li key={r.driverNumber}>
                  <button className={`focus-ring flex h-[26px] w-full items-center rounded-md text-left ${sel ? "bg-panel-3" : "hover:bg-panel-2"}`} onClick={() => onSelect(r.driverNumber)} aria-label={`${r.name}: ${stints.length} sets of tyres`}>
                    <span className="flex w-[92px] shrink-0 items-center gap-2 pl-1">
                      <span className="tnum w-5 text-right text-[11.5px] text-fg-3">{r.position ?? "—"}</span>
                      <span className="h-3.5 w-[3px] rounded-full" style={{ background: r.teamColour }} aria-hidden />
                      <span className="display text-[14px] font-bold">{r.code}</span>
                    </span>
                    <span className="relative mr-1 h-[16px] flex-1 rounded bg-bg-2">
                      {stints.map((s) => {
                        const end = s.lapEnd ?? s.lapStart;
                        const left = ((s.lapStart - 1) / total) * 100;
                        const width = ((end - s.lapStart + 1) / total) * 100;
                        const open = res.data!.stints.find((x) => x.driverNumber === r.driverNumber && x.stint === s.stint)?.lapEnd === null;
                        return (
                          <span
                            key={s.stint}
                            className="absolute top-0 flex h-full items-center justify-center overflow-hidden rounded text-[10px] font-bold"
                            style={{
                              left: `calc(${left}% + 1px)`,
                              width: `calc(${width}% - 2px)`,
                              backgroundColor: compoundColour(s.compound),
                              color: "#0a0b0e",
                              backgroundImage: open ? "repeating-linear-gradient(135deg, transparent 0 4px, rgba(0,0,0,0.16) 4px 6px)" : undefined,
                            }}
                            title={`${compoundLabel(s.compound)}: laps ${s.lapStart}–${s.lapEnd ?? "?"}${s.laps !== null ? ` (${s.laps} laps)` : ""}${s.tyreAgeAtStart ? `, used set (${s.tyreAgeAtStart} laps old)` : s.tyreAgeAtStart === 0 ? ", new set" : ""}${open ? " — still running" : ""}`}
                          >
                            {width > 7 ? s.laps ?? "" : ""}
                          </span>
                        );
                      })}
                      {pits.map((p, i) => (
                        <span
                          key={i}
                          className="absolute -top-[3px] h-[22px] w-[2px] rounded bg-fg"
                          style={{ left: `${(p.lap / total) * 100}%` }}
                          title={`Pit stop on lap ${p.lap}${p.laneDuration !== null ? ` · ${p.laneDuration.toFixed(1)} s in the pit lane` : ""}${p.stopDuration !== null ? ` · ${p.stopDuration.toFixed(1)} s stationary` : ""}`}
                        />
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
