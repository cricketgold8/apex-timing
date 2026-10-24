"use client";

import Link from "next/link";
import { DRIVERS_2026 } from "@/lib/config/drivers-2026";
import { TEAM_LIST } from "@/lib/config/teams-2026";
import { useSeason } from "@/lib/client/season";
import { PageTitle } from "@/components/ui/DriverCell";
import { ProvenanceNote } from "@/components/ui/Provenance";

export function TeamsView() {
  const season = useSeason();
  const rows = TEAM_LIST.map((t) => ({ t, s: season.data?.constructors.find((c) => c.id === t.id) })).sort((a, b) => (a.s?.position ?? 99) - (b.s?.position ?? 99));
  return (
    <div className="flex flex-col gap-3">
      <PageTitle title="2026 Teams">
        <span className="text-[12px] text-fg-2">11 constructors, ordered by the constructors&apos; standings{season.data ? ` after round ${season.data.lastRound}` : ""}.</span>
      </PageTitle>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ t, s }) => (
          <Link key={t.id} href={`/teams/${t.id}`} className="panel focus-ring flex overflow-hidden hover:bg-panel-2" aria-label={t.name}>
            <span className="w-1.5 shrink-0" style={{ background: t.colour }} aria-hidden />
            <div className="flex flex-1 items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="display text-[20px] font-bold leading-tight tracking-[0.03em]">{t.name}</div>
                <div className="text-[11.5px] text-fg-2">
                  {t.powerUnit} power unit · {t.nationality}
                </div>
                <div className="mt-1 flex gap-3 text-[12px]">
                  {DRIVERS_2026.filter((d) => d.teamId === t.id).map((d) => (
                    <span key={d.id}>
                      <span className="display font-bold">{d.code}</span> <span className="tnum text-fg-3">#{d.number}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="display text-[22px] font-bold leading-none">{s ? `P${s.position}` : "—"}</div>
                <div className="tnum text-[12px] text-fg-2">{s ? `${s.points} pts` : ""}</div>
                <div className="tnum text-[10.5px] text-fg-3">{s ? `${s.wins}W · ${s.podiums}P` : ""}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <ProvenanceNote provenance={season.provenance} />
    </div>
  );
}
