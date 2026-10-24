"use client";

import Link from "next/link";
import { DRIVERS_2026, SUBSTITUTE_DRIVERS_2026, type DriverConfig } from "@/lib/config/drivers-2026";
import { TEAM_LIST, TEAMS_2026 } from "@/lib/config/teams-2026";
import { useSeason } from "@/lib/client/season";
import { PageTitle } from "@/components/ui/DriverCell";

function DriverCard({ d, standing }: { d: DriverConfig; standing?: { position: number; points: number; wins: number; podiums: number } }) {
  const team = TEAMS_2026[d.teamId];
  return (
    <Link href={`/drivers/${d.id}`} className="panel focus-ring group relative flex overflow-hidden transition-colors hover:bg-panel-2" aria-label={`${d.displayName}, ${team.name}`}>
      <span className="w-1.5 shrink-0" style={{ background: team.colour }} aria-hidden />
      <div className="flex flex-1 items-center gap-4 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="display text-[22px] font-bold leading-none tracking-[0.04em]">{d.code}</span>
            <span className="display tnum text-[15px] font-semibold text-fg-3">#{d.number}</span>
          </div>
          <div className="mt-1 truncate text-[14px] font-medium text-fg">{d.displayName}</div>
          <div className="truncate text-[12px] text-fg-3">
            {team.name} · {d.nationality}
          </div>
        </div>
        {standing && (
          <div className="text-right">
            <div className="display text-[24px] font-bold leading-none">P{standing.position}</div>
            <div className="tnum mt-1 text-[12.5px] text-fg-2">{standing.points} pts</div>
            {standing.wins + standing.podiums > 0 && (
              <div className="tnum text-[11.5px] text-fg-3">
                {standing.wins > 0 ? `${standing.wins} win${standing.wins > 1 ? "s" : ""} · ` : ""}
                {standing.podiums} podium{standing.podiums === 1 ? "" : "s"}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function DriversView() {
  const season = useSeason();
  const standing = (id: string) => season.data?.drivers.find((s) => s.id === id);
  const teamOrder = (d: DriverConfig) => TEAM_LIST.findIndex((t) => t.id === d.teamId);
  // Championship order once standings load; team order until then.
  const grid = [...DRIVERS_2026].sort((a, b) => (standing(a.id)?.position ?? 100 + teamOrder(a)) - (standing(b.id)?.position ?? 100 + teamOrder(b)));
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Drivers" subtitle={`The 22 drivers of the 2026 season${season.data ? `, in championship order after round ${season.data.lastRound}` : ""}`} provenance={season.provenance} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {grid.map((d) => (
          <DriverCard key={d.id} d={d} standing={standing(d.id)} />
        ))}
      </div>
      <section aria-label="Substitute appearances">
        <h3 className="label mb-2">Also raced in 2026 (as a substitute)</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {SUBSTITUTE_DRIVERS_2026.map((d) => (
            <DriverCard key={d.id} d={d} standing={standing(d.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}
