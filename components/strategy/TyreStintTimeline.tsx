"use client";

import { useMemo } from "react";
import { useTimingResource } from "@/lib/client/feed";
import { summariseStints } from "@/lib/timing/calculations";
import { demoStints } from "@/lib/timing/providers/demo/provider";
import type { PitStop, Stint, TimingSnapshot } from "@/lib/timing/types";
import { ProviderErrorMessage, StateMessage, TyreBadge, compoundColour, compoundLabel } from "@/components/ui/primitives";
import { ProvenanceNote } from "@/components/ui/Provenance";

type StintData = { stints: Stint[]; pits: PitStop[]; lapsCompleted: Record<number, number> };

export function TyreStintTimeline({ snapshot, selected, onSelect }: { snapshot: TimingSnapshot; selected: number | null; onSelect: (n: number) => void }) {
  const res = useTimingResource<StintData>("stints", demoStints);
  const isDemo = res.provenance?.mode === "DEMO";

  const total = useMemo(() => {
    const done = Math.max(1, ...Object.values(res.data?.lapsCompleted ?? {}));
    return Math.max(done, snapshot.session.totalLaps ?? 0);
  }, [res.data, snapshot.session.totalLaps]);

  if (res.status === "error" && res.error) return <ProviderErrorMessage error={res.error} onRetry={res.reload} />;

  const ticks = Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => i * 10).filter((t) => t > 0 && t < total);

  return (
    <section className="panel" aria-label="Tyre strategy">
      <div className="panel-head">
        <span className="panel-title">Tyre strategy</span>
        <span className="text-[11px] text-fg-3">{isDemo ? "Simulated stints" : "Stints as reported by the source"} · laps 1–{total}</span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-fg-3">
          {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1">
              <TyreBadge compound={c} size={14} />
              {compoundLabel(c)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-[2px] bg-fg" aria-hidden />
            pit visit
          </span>
        </div>
      </div>
      {res.status === "loading" && !res.data ? (
        <StateMessage kind="loading" title="Loading stints" />
      ) : !res.data || res.data.stints.length === 0 ? (
        <StateMessage kind="empty" title="No stint data">
          The source has not reported tyre stints for this session. Nothing is inferred from pit stops alone.
        </StateMessage>
      ) : (
        <div className="overflow-x-auto px-3 py-2">
          <div className="min-w-[620px]">
            <div className="relative ml-[148px] h-4 text-[10px] text-fg-3" aria-hidden>
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
                    <button className={`focus-ring flex h-[22px] w-full items-center text-left ${sel ? "bg-[var(--row-selected)]" : "hover:bg-[var(--row-hover)]"}`} onClick={() => onSelect(r.driverNumber)} aria-label={`${r.name}: ${stints.length} stints`}>
                      <span className="flex w-[148px] shrink-0 items-center gap-1.5 pr-2">
                        <span className="tnum w-5 text-right text-[11px] text-fg-3">{r.position ?? "—"}</span>
                        <span className="h-3.5 w-[3px]" style={{ background: r.teamColour }} aria-hidden />
                        <span className="display w-9 text-[13px] font-bold">{r.code}</span>
                        <TyreBadge compound={r.tyre.compound} size={15} />
                        <span className="tnum text-[11px] text-fg-2" title={r.tyre.ageBasis === "derived" ? "Derived tyre age" : undefined}>
                          {r.tyre.age ?? "—"}
                          {r.tyre.ageBasis === "derived" ? "*" : ""}
                        </span>
                      </span>
                      <span className="relative h-[14px] flex-1 rounded-[2px] bg-bg-2">
                        {ticks.map((t) => (
                          <span key={t} className="absolute top-0 h-full w-px bg-line-soft" style={{ left: `${(t / total) * 100}%` }} aria-hidden />
                        ))}
                        {stints.map((s) => {
                          const end = s.lapEnd ?? s.lapStart;
                          const left = ((s.lapStart - 1) / total) * 100;
                          const width = ((end - s.lapStart + 1) / total) * 100;
                          const open = res.data!.stints.find((x) => x.driverNumber === r.driverNumber && x.stint === s.stint)?.lapEnd === null;
                          return (
                            <span
                              key={s.stint}
                              className="absolute top-0 flex h-full items-center justify-center overflow-hidden rounded-[2px] text-[9px] font-bold"
                              style={{
                                left: `calc(${left}% + 1px)`,
                                width: `calc(${width}% - 2px)`,
                                backgroundColor: compoundColour(s.compound),
                                color: "var(--bg)",
                                opacity: open ? 0.85 : 1,
                                backgroundImage: open ? "repeating-linear-gradient(135deg, transparent 0 4px, rgba(0,0,0,0.18) 4px 6px)" : undefined,
                              }}
                              title={`Stint ${s.stint}: ${compoundLabel(s.compound)}, laps ${s.lapStart}–${s.lapEnd ?? "?"}${s.laps !== null ? ` (${s.laps} laps)` : ""}${s.tyreAgeAtStart ? `, ${s.tyreAgeAtStart} laps old at start` : s.tyreAgeAtStart === 0 ? ", new set" : ""}${open ? " — in progress" : ""}`}
                            >
                              {width > 6 ? `${s.compound?.[0] ?? "?"}${s.laps ?? ""}` : ""}
                            </span>
                          );
                        })}
                        {pits.map((p, i) => (
                          <span
                            key={i}
                            className="absolute -top-0.5 h-[18px] w-[2px] bg-fg"
                            style={{ left: `${(p.lap / total) * 100}%` }}
                            title={`Pit lane, lap ${p.lap}${p.laneDuration !== null ? ` · lane ${p.laneDuration.toFixed(1)} s` : ""}${p.stopDuration !== null ? ` · stationary ${p.stopDuration.toFixed(1)} s` : ""}`}
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[10.5px] text-fg-3">
              Segment label = compound initial and stint length. Hatched = stint still running. A pit visit does not imply a tyre change; only stints reported by the source are drawn. * Tyre age derived from the stint&apos;s
              starting age plus laps completed.
            </p>
          </div>
        </div>
      )}
      <div className="border-t border-line px-2.5 py-1.5">
        <ProvenanceNote provenance={res.provenance} />
      </div>
    </section>
  );
}
