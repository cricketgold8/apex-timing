"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TEAMS_2026, isTeamId } from "@/lib/config/teams-2026";
import { MAX_SERIES, seriesVar, useSeriesSlots } from "@/lib/client/series";
import { useSeason } from "@/lib/client/season";
import type { StandingRow } from "@/lib/standings/standings";
import { PageTitle } from "@/components/ui/DriverCell";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Popover";

type Tab = "drivers" | "constructors";

function teamColour(id: string | undefined) {
  return id && isTeamId(id) ? TEAMS_2026[id].colour : "var(--text-3)";
}

function Recent({ row }: { row: StandingRow }) {
  const races = row.recent.filter((r) => r.session === "RACE").slice(0, 5);
  return (
    <span className="tnum inline-flex gap-1">
      {races.map((r) => (
        <span
          key={r.round}
          title={`Round ${r.round}: ${r.position ?? "not classified"}`}
          className={`inline-flex h-5 w-6 items-center justify-center rounded-[2px] text-[10.5px] font-semibold ${r.position === null ? "bg-red/10 text-red" : r.position <= 3 ? "bg-panel-2 text-fg" : r.position <= 10 ? "bg-bg-2 text-fg-2" : "bg-bg-2 text-fg-3"}`}
        >
          {r.position ?? "NC"}
        </span>
      ))}
    </span>
  );
}

export function ChampionshipView() {
  const season = useSeason();
  const [tab, setTab] = useState<Tab>("drivers");
  const s = season.data;
  const rows = useMemo(() => (s ? (tab === "drivers" ? s.drivers : s.constructors) : []), [s, tab]);
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => setChosen(rows.slice(0, 5).map((r) => r.id)), [rows]);
  const idIndex = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const slots = useSeriesSlots(chosen.map((id) => idIndex.get(id) ?? -1));
  const slotOf = (id: string) => slots.get(idIndex.get(id) ?? -1) ?? 0;
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_SERIES ? c : [...c, id]));

  const chart = useMemo(() => {
    if (!s) return [];
    return Array.from({ length: s.lastRound }, (_, i) => {
      const p: Record<string, number> = { round: i + 1 };
      for (const r of rows) if (chosen.includes(r.id)) p[r.id] = r.progression[i] ?? 0;
      return p;
    });
  }, [s, rows, chosen]);

  if (season.status === "error" && season.error) return <ProviderErrorMessage error={season.error} onRetry={season.reload} />;
  if (!s) return <StateMessage kind="loading" title="Loading season results" />;

  const v = s.verification;
  const mismatches = tab === "drivers" ? v.driverMismatches : v.constructorMismatches;
  const verified = v.publishedRound === s.lastRound && mismatches.length === 0;
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.[tab === "drivers" ? "code" : "name"] ?? id;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        title="Standings"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              After round {s.lastRound}
              {s.lastRoundName ? ` — ${s.lastRoundName}` : ""}
            </span>
            {verified ? (
              <span className="inline-flex items-center gap-1 text-green" title={`Totals worked out from every race and sprint result match the officially published ${tab} standings.`}>
                <CheckCircle2 size={14} aria-hidden /> Checked against published standings
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-yellow">
                <TriangleAlert size={14} aria-hidden /> Differs from published standings: {mismatches.map((m) => `${nameOf(m.id)} ${m.computed} vs ${m.published}`).join("; ")}
              </span>
            )}
          </span>
        }
        provenance={season.provenance}
        info={
          <p className="mb-2">
            Points come from each classified race and sprint result (2026: 25-18-15-12-10-8-6-4-2-1 for a Grand Prix, 8 to 1 for a Sprint, no fastest-lap point). Ties are split by who has more wins, then more second places, and so on.
            {v.pointsDiscrepancies.length > 0 ? ` ${v.pointsDiscrepancies.length} result(s) carry official points that differ from that table (e.g. penalties); the official figures are used.` : ""}
          </p>
        }
      >
        <Segmented
          label="Standings"
          value={tab}
          options={[
            { value: "drivers", label: "Drivers" },
            { value: "constructors", label: "Teams" },
          ]}
          onChange={setTab}
        />
      </PageTitle>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="panel overflow-x-auto" aria-label={`${tab} standings`}>
          <table className="data-table tnum">
            <thead>
              <tr>
                <th className="text-right">Pos</th>
                <th>{tab === "drivers" ? "Driver" : "Team"}</th>
                {tab === "drivers" && <th>Team</th>}
                <th className="text-right">Pts</th>
                <th className="text-right">Gap</th>
                <th className="text-right">Wins</th>
                <th className="text-right">Podiums</th>
                {tab === "drivers" && (
                  <>
                    <th className="text-right" title="Grand Prix qualifying P1">
                      Poles
                    </th>
                    <th className="text-right" title="Fastest laps as recorded by the provider; no championship points in 2026">
                      FL
                    </th>
                    <th>Last 5 races</th>
                  </>
                )}
                <th className="text-center" title="Show in the points chart">
                  Chart
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = chosen.includes(r.id);
                const colour = tab === "drivers" ? teamColour(r.teamId) : teamColour(r.id);
                return (
                  <tr key={r.id}>
                    <td className="text-right">
                      <span className="display text-[15px] font-bold">{r.position}</span>
                    </td>
                    <td>
                      <Link href={tab === "drivers" ? `/drivers/${r.id}` : `/teams/${r.id}`} className="inline-flex items-center gap-2 hover:underline">
                        <span className="h-4 w-[3px]" style={{ background: colour }} aria-hidden />
                        {tab === "drivers" && <span className="display w-9 text-[14px] font-bold">{r.code}</span>}
                        <span className={tab === "drivers" ? "text-fg-2" : "font-semibold"}>{r.name}</span>
                      </Link>
                    </td>
                    {tab === "drivers" && <td className="text-fg-2">{r.teamName}</td>}
                    <td className="text-right font-semibold">{r.points}</td>
                    <td className="text-right text-fg-3">{r.position === 1 ? "—" : `−${(rows[0]?.points ?? 0) - r.points}`}</td>
                    <td className="text-right">{r.wins}</td>
                    <td className="text-right">{r.podiums}</td>
                    {tab === "drivers" && (
                      <>
                        <td className="text-right">{s.poles[r.id] ?? 0}</td>
                        <td className="text-right text-fg-2">{s.fastestLaps[r.id] ?? 0}</td>
                        <td>
                          <Recent row={r} />
                        </td>
                      </>
                    )}
                    <td className="text-center">
                      <input type="checkbox" checked={on} onChange={() => toggle(r.id)} disabled={!on && chosen.length >= MAX_SERIES} aria-label={`Show ${r.name} in chart`} style={{ accentColor: on ? seriesVar(slotOf(r.id)) : undefined }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="panel" aria-label="Points progression">
          <div className="panel-head">
            <span className="panel-title">Points over the season</span>
            <span className="ml-auto text-[12px] text-fg-3">Tick rows to add (up to {MAX_SERIES})</span>
          </div>
          <div className="flex flex-wrap gap-3 px-3 pt-2 text-[12px]">
            {chosen.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-[1px]" style={{ background: seriesVar(slotOf(id)) }} aria-hidden />
                {nameOf(id)}
              </span>
            ))}
          </div>
          {chosen.length === 0 ? (
            <StateMessage kind="empty" title="Tick rows to chart them" />
          ) : (
            <div className="p-2">
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={chart} margin={{ top: 8, right: 20, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="round" tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--line)" label={{ value: "Round", position: "insideBottom", offset: -10, fill: "var(--text-3)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--line)" width={44} label={{ value: "Points", angle: -90, position: "insideLeft", fill: "var(--text-3)", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }}
                    labelFormatter={(r) => `After round ${r}`}
                    formatter={(val, key) => [`${val} pts`, nameOf(String(key))]}
                    itemSorter={(item) => -Number(item.value)}
                  />
                  {chosen.map((id) => (
                    <Line
                      key={id}
                      dataKey={id}
                      stroke={seriesVar(slotOf(id))}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
