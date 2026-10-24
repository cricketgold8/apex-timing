"use client";

import Link from "next/link";
import { DRIVERS_2026, SUBSTITUTE_DRIVERS_2026, type DriverConfig } from "@/lib/config/drivers-2026";
import { TEAM_LIST, TEAMS_2026 } from "@/lib/config/teams-2026";
import { useSeason } from "@/lib/client/season";
import { PageTitle } from "@/components/ui/DriverCell";
import { ProvenanceNote } from "@/components/ui/Provenance";

function DriverCard({ d, standing }: { d: DriverConfig; standing?: { position: number; points: number; wins: number; podiums: number } }) {
  const team = TEAMS_2026[d.teamId];
  return (
    <Link href={`/drivers/${d.id}`} className="panel focus-ring group relative flex overflow-hidden hover:bg-panel-2" aria-label={`${d.displayName}, ${team.name}`}>
      <span className="w-1 shrink-0" style={{ background: team.colour }} aria-hidden />
      <div className="flex flex-1 items-center gap-3 p-3">
        <span className="display tnum w-14 text-right text-[38px] font-bold leading-none text-fg-3 group-hover:text-fg-2">{d.number}</span>
        <div className="min-w-0 flex-1">
          <div className="display text-[18px] font-bold leading-tight tracking-[0.03em]">{d.code}</div>
          <div className="truncate text-[13px] text-fg">{d.displayName}</div>
          <div className="truncate text-[11.5px] text-fg-2">
            {team.name} · {d.nationality}
          </div>
        </div>
        <div className="text-right">
          {standing ? (
            <>
              <div className="display text-[20px] font-bold leading-none">P{standing.position}</div>
              <div className="tnum text-[12px] text-fg-2">{standing.points} pts</div>
              <div className="tnum text-[10.5px] text-fg-3">
                {standing.wins}W · {standing.podiums}P
              </div>
            </>
          ) : (
            <span className="text-[11px] text-fg-3">—</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function DriversView() {
  const season = useSeason();
  const standing = (id: string) => season.data?.drivers.find((s) => s.id === id);
  return (
    <div className="flex flex-col gap-3">
      <PageTitle title="2026 Drivers">
        <span className="text-[12px] text-fg-2">22 race drivers, 11 teams. Standings from classified results{season.data ? ` after round ${season.data.lastRound}` : ""}.</span>
      </PageTitle>
      {TEAM_LIST.map((t) => (
        <section key={t.id} aria-label={t.name}>
          <h3 className="label mb-1.5 flex items-center gap-2">
            <span className="h-3 w-3 rounded-[2px]" style={{ background: t.colour }} aria-hidden />
            {t.name}
          </h3>
          <div className="grid gap-2 md:grid-cols-2">
            {DRIVERS_2026.filter((d) => d.teamId === t.id).map((d) => (
              <DriverCard key={d.id} d={d} standing={standing(d.id)} />
            ))}
          </div>
        </section>
      ))}
      <section aria-label="Substitute appearances">
        <h3 className="label mb-1.5">Substitute appearances in 2026</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {SUBSTITUTE_DRIVERS_2026.map((d) => (
            <DriverCard key={d.id} d={d} standing={standing(d.id)} />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-fg-3">Drivers who started championship sessions outside the regular line-up, as recorded in the classified results.</p>
      </section>
      <ProvenanceNote provenance={season.provenance} />
    </div>
  );
}
