"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { DRIVERS_2026 } from "@/lib/config/drivers-2026";
import { ROUNDS_2026, scheduleState } from "@/lib/config/season-2026";
import { TEAMS_2026, type TeamId } from "@/lib/config/teams-2026";
import { useHydrated } from "@/lib/client/hooks";
import { useRemoteResource } from "@/lib/client/remote";
import { useSeason } from "@/lib/client/season";
import { summariseStints } from "@/lib/timing/calculations";
import type { PitStop, Stint } from "@/lib/timing/types";
import { headToHead } from "@/components/drivers/DriverProfile";
import { PageTitle } from "@/components/ui/DriverCell";
import { ProviderErrorMessage, StateMessage, compoundColour, compoundLabel } from "@/components/ui/primitives";
import { ProvenanceNote } from "@/components/ui/Provenance";

function LatestRaceStrategy({ teamId }: { teamId: TeamId }) {
  const hydrated = useHydrated();
  const latest = useMemo(() => {
    if (!hydrated) return null;
    for (const e of [...ROUNDS_2026].reverse()) {
      const race = e.sessions.find((s) => s.type === "RACE" && scheduleState(s) === "completed");
      if (race) return { event: e, session: race };
    }
    return null;
  }, [hydrated]);
  const res = useRemoteResource<{ stints: Stint[]; pits: PitStop[]; lapsCompleted: Record<number, number> }>(latest ? `/api/timing/stints?mode=historical&session=${latest.session.openf1SessionKey}` : null, {
    scope: `team-strategy-${latest?.session.openf1SessionKey}`,
  });
  const season = useSeason();
  const round = season.data?.rounds.find((r) => r.round === latest?.event.round);
  const cars = round?.race.filter((r) => r.teamId === teamId) ?? [];

  return (
    <section className="panel" aria-label="Latest race strategy">
      <div className="panel-head">
        <span className="panel-title">Latest race strategy</span>
        <span className="text-[11px] text-fg-3">{latest ? latest.event.name : ""}</span>
      </div>
      {res.status === "error" && res.error ? (
        <ProviderErrorMessage error={res.error} onRetry={res.reload} />
      ) : !res.data ? (
        <StateMessage kind="loading" title="Loading stints" />
      ) : cars.length === 0 ? (
        <StateMessage kind="empty" title="No classified cars for this team" />
      ) : (
        <div className="space-y-3 p-3">
          {cars.map((c) => {
            const total = Math.max(1, ...Object.values(res.data!.lapsCompleted));
            const stints = summariseStints(
              res.data!.stints.filter((s) => s.driverNumber === c.driverNumber),
              res.data!.lapsCompleted[c.driverNumber] ?? null,
            );
            const pits = res.data!.pits.filter((p) => p.driverNumber === c.driverNumber);
            return (
              <div key={c.driverNumber}>
                <div className="mb-1 flex items-center gap-2 text-[12px]">
                  <span className="display font-bold">{c.code}</span>
                  <span className="text-fg-3">
                    P{c.positionText} · {stints.length} stint{stints.length === 1 ? "" : "s"} · {pits.length} pit visit{pits.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="relative h-4 rounded-[2px] bg-bg-2">
                  {stints.map((s) => (
                    <span
                      key={s.stint}
                      className="absolute top-0 flex h-full items-center justify-center rounded-[2px] text-[9.5px] font-bold"
                      style={{ left: `calc(${((s.lapStart - 1) / total) * 100}% + 1px)`, width: `calc(${(((s.lapEnd ?? s.lapStart) - s.lapStart + 1) / total) * 100}% - 2px)`, backgroundColor: compoundColour(s.compound), color: "var(--bg)" }}
                      title={`${compoundLabel(s.compound)} · laps ${s.lapStart}–${s.lapEnd ?? "?"}`}
                    >
                      {s.compound?.[0]}
                      {s.laps}
                    </span>
                  ))}
                </div>
                {pits.length > 0 && (
                  <ul className="tnum mt-1 flex flex-wrap gap-x-4 text-[11px] text-fg-2">
                    {pits.map((p, i) => (
                      <li key={i}>
                        Lap {p.lap}: lane {p.laneDuration?.toFixed(1) ?? "—"} s{p.stopDuration !== null ? ` · stationary ${p.stopDuration.toFixed(1)} s` : " · stationary time not published"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="border-t border-line px-2.5 py-1.5">
        <ProvenanceNote provenance={res.provenance} />
      </div>
    </section>
  );
}

export function TeamProfile({ teamId }: { teamId: TeamId }) {
  const team = TEAMS_2026[teamId];
  const drivers = DRIVERS_2026.filter((d) => d.teamId === teamId);
  const season = useSeason();
  const s = season.data;
  const standing = s?.constructors.find((c) => c.id === teamId);
  const rounds = s?.rounds.filter((r) => r.race.length > 0) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Link href="/teams" className="inline-flex w-fit items-center gap-1 text-[12px] text-fg-2 hover:text-fg">
        <ArrowLeft size={13} aria-hidden /> Teams
      </Link>
      <div className="panel flex flex-wrap items-center gap-4 overflow-hidden p-0">
        <span className="w-1.5 self-stretch" style={{ background: team.colour }} aria-hidden />
        <div className="py-3">
          <PageTitle title={team.name} />
          <div className="-mt-2 text-[12.5px] text-fg-2">
            {team.powerUnit} power unit · {team.nationality} · team colour <span className="tnum">{team.colour}</span>
          </div>
        </div>
        <div className="ml-auto flex gap-6 px-4">
          {[
            ["Constructors'", standing ? `P${standing.position}` : "—"],
            ["Points", standing?.points ?? "—"],
            ["Wins", standing?.wins ?? "—"],
            ["Podiums", standing?.podiums ?? "—"],
          ].map(([l, v]) => (
            <div key={l as string} className="text-right">
              <div className="label">{l}</div>
              <div className="display tnum text-[24px] font-bold leading-none">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {drivers.map((d) => {
          const ds = s?.drivers.find((x) => x.id === d.id);
          const q = s ? headToHead(rounds, d.id, (r) => r.qualifying) : null;
          const r = s ? headToHead(rounds, d.id, (rr) => rr.race) : null;
          return (
            <Link key={d.id} href={`/drivers/${d.id}`} className="panel focus-ring flex items-center gap-3 p-3 hover:bg-panel-2">
              <span className="display tnum text-[34px] font-bold leading-none text-fg-3">{d.number}</span>
              <div className="flex-1">
                <div className="display text-[18px] font-bold leading-tight">{d.displayName}</div>
                <div className="tnum text-[12px] text-fg-2">
                  {ds ? `P${ds.position} · ${ds.points} pts` : "—"} · quali H2H {q ? `${q.ahead}–${q.behind}` : "—"} · race H2H {r ? `${r.ahead}–${r.behind}` : "—"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {season.status === "error" && season.error ? (
        <ProviderErrorMessage error={season.error} onRetry={season.reload} />
      ) : !s ? (
        <StateMessage kind="loading" title="Loading season results" />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="panel overflow-x-auto" aria-label="Results by round">
            <div className="panel-head">
              <span className="panel-title">Results by round</span>
            </div>
            <table className="data-table tnum">
              <thead>
                <tr>
                  <th className="text-right">Rd</th>
                  <th>Grand Prix</th>
                  <th>Cars (race finish)</th>
                  <th>Sprint</th>
                  <th className="text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => {
                  const cars = r.race.filter((x) => x.teamId === teamId);
                  const spr = r.sprint.filter((x) => x.teamId === teamId);
                  const pts = [...cars, ...spr].reduce((n, x) => n + (x.points ?? 0), 0);
                  return (
                    <tr key={r.round}>
                      <td className="text-right text-fg-2">{r.round}</td>
                      <td>{r.name}</td>
                      <td>
                        {cars.map((c) => (
                          <span key={c.driverNumber} className="mr-3">
                            <span className="display font-bold">{c.code}</span> <span className={c.classification === "CLASSIFIED" ? "" : "text-red"}>{c.positionText}</span>
                          </span>
                        ))}
                      </td>
                      <td className="text-fg-2">
                        {spr.map((c) => (
                          <span key={c.driverNumber} className="mr-3">
                            {c.code} {c.positionText}
                          </span>
                        ))}
                      </td>
                      <td className="text-right font-semibold">{pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <LatestRaceStrategy teamId={teamId} />
        </div>
      )}
      <ProvenanceNote provenance={season.provenance} />
    </div>
  );
}
