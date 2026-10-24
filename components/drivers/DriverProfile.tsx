"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { driverById, teammateOf } from "@/lib/config/drivers-2026";
import { TEAMS_2026 } from "@/lib/config/teams-2026";
import { useSeason, type SeasonRound } from "@/lib/client/season";
import type { ResultRow } from "@/lib/results/types";
import { formatLapTime } from "@/lib/timing/formatters";
import { PageTitle } from "@/components/ui/DriverCell";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { SourceInfo } from "@/components/ui/Popover";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel px-3 py-2" title={hint}>
      <div className="label">{label}</div>
      <div className="display tnum text-[24px] font-bold leading-tight">{value}</div>
    </div>
  );
}

/** Head-to-head against whoever drove the other car of the same team in each round (handles substitutions). */
export function headToHead(rounds: SeasonRound[], driverId: string, pick: (r: SeasonRound) => ResultRow[]) {
  let ahead = 0;
  let behind = 0;
  for (const r of rounds) {
    const rows = pick(r);
    const me = rows.find((x) => x.driverId === driverId);
    if (!me) continue;
    const mate = rows.find((x) => x.teamId === me.teamId && x.driverId !== driverId);
    if (!mate || me.position === null || mate.position === null) continue;
    if (me.position < mate.position) ahead++;
    else behind++;
  }
  return { ahead, behind };
}

export function DriverProfile({ driverId }: { driverId: string }) {
  const d = driverById(driverId)!;
  const team = TEAMS_2026[d.teamId];
  const mate = teammateOf(d);
  const season = useSeason();
  const s = season.data;
  const standing = s?.drivers.find((x) => x.id === driverId);
  const rounds = s?.rounds.filter((r) => r.race.length > 0 || r.qualifying.length > 0) ?? [];
  const quali = s ? headToHead(rounds, driverId, (r) => r.qualifying) : null;
  const race = s ? headToHead(rounds, driverId, (r) => r.race) : null;
  const age = Math.floor((Date.now() - Date.parse(d.dateOfBirth)) / (365.2425 * 86_400_000));
  const progression = standing?.progression.map((p, i) => ({ round: i + 1, points: p })) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Link href="/drivers" className="inline-flex w-fit items-center gap-1 text-[12px] text-fg-2 hover:text-fg">
        <ArrowLeft size={13} aria-hidden /> Drivers
      </Link>
      <div className="panel flex flex-wrap items-center gap-5 overflow-hidden p-0">
        <span className="w-1.5 self-stretch" style={{ background: team.colour }} aria-hidden />
        <span className="display tnum text-[64px] font-bold leading-none text-fg-3">{d.number}</span>
        <div className="py-3">
          <div className="display text-[30px] font-bold leading-none tracking-[0.03em]">{d.displayName}</div>
          <div className="mt-1 text-[12.5px] text-fg-2">
            {d.code} · {team.name} · {d.nationality} · born {d.dateOfBirth} ({age})
            {d.fullName !== d.displayName && <span className="text-fg-3"> · full name {d.fullName}</span>}
          </div>
          {d.role === "substitute" && <div className="mt-1 text-[11.5px] text-yellow">Substitute appearances only in 2026</div>}
        </div>
      </div>

      {season.status === "error" && season.error ? (
        <ProviderErrorMessage error={season.error} onRetry={season.reload} />
      ) : !s ? (
        <StateMessage kind="loading" title="Loading season results" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <Stat label="Championship" value={standing ? `P${standing.position}` : "—"} />
            <Stat label="Points" value={standing?.points ?? 0} />
            <Stat label="Wins" value={standing?.wins ?? 0} />
            <Stat label="Podiums" value={standing?.podiums ?? 0} />
            <Stat label="Poles" value={s.poles[driverId] ?? 0} hint="Qualifying P1 (Grand Prix)" />
            <Stat label="Fastest laps" value={s.fastestLaps[driverId] ?? 0} hint="Recorded by the provider; no points in 2026" />
            <Stat label="Quali H2H" value={quali ? `${quali.ahead}–${quali.behind}` : "—"} hint="Rounds out-qualifying the other car of the same team" />
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section className="panel overflow-x-auto" aria-label="Season results">
              <div className="panel-head">
                <span className="panel-title">2026 results</span>
                <span className="text-[12px] text-fg-3">through round {s.lastRound}</span>
                <span className="ml-auto" />
                <SourceInfo provenance={season.provenance} />
              </div>
              <table className="data-table tnum">
                <thead>
                  <tr>
                    <th className="text-right">Rd</th>
                    <th>Grand Prix</th>
                    <th>Team</th>
                    <th className="text-right">Quali</th>
                    <th className="text-right">Sprint</th>
                    <th className="text-right">Grid</th>
                    <th className="text-right">Race</th>
                    <th className="text-right">Pts</th>
                    <th className="text-right">Fastest lap</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r) => {
                    const q = r.qualifying.find((x) => x.driverId === driverId);
                    const sp = r.sprint.find((x) => x.driverId === driverId);
                    const rr = r.race.find((x) => x.driverId === driverId);
                    if (!q && !sp && !rr)
                      return (
                        <tr key={r.round}>
                          <td className="text-right text-fg-3">{r.round}</td>
                          <td className="text-fg-3">{r.name}</td>
                          <td colSpan={8} className="text-fg-3">
                            Did not take part
                          </td>
                        </tr>
                      );
                    return (
                      <tr key={r.round}>
                        <td className="text-right text-fg-2">{r.round}</td>
                        <td>{r.name}</td>
                        <td className="text-fg-2">{(rr ?? q ?? sp)?.teamName}</td>
                        <td className="text-right">{q?.positionText ?? "—"}</td>
                        <td className="text-right text-fg-2">{sp ? `${sp.positionText}${sp.points ? ` (+${sp.points})` : ""}` : r.format === "sprint" ? "—" : ""}</td>
                        <td className="text-right text-fg-2">{rr ? (rr.grid === 0 ? "PL" : rr.grid ?? "—") : "—"}</td>
                        <td className="text-right font-semibold">{rr?.positionText ?? "—"}</td>
                        <td className="text-right">{(rr?.points ?? 0) + (sp?.points ?? 0) || "—"}</td>
                        <td className={`text-right ${rr?.fastestLap?.rank === 1 ? "m-session-best" : "text-fg-2"}`}>{formatLapTime(rr?.fastestLap?.time)}</td>
                        <td className="text-[11.5px] text-fg-2">{rr && rr.classification !== "CLASSIFIED" ? rr.status : rr?.status === "Lapped" ? "Lapped" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <div className="flex flex-col gap-3">
              <section className="panel" aria-label="Points progression">
                <div className="panel-head">
                  <span className="panel-title">Points progression</span>
                </div>
                {progression.length === 0 ? (
                  <StateMessage kind="empty" title="No points data" />
                ) : (
                  <div className="p-2">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={progression} margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
                        <CartesianGrid stroke="var(--grid)" vertical={false} />
                        <XAxis dataKey="round" tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--line)" label={{ value: "Round", position: "insideBottom", offset: -8, fill: "var(--text-3)", fontSize: 11 }} />
                        <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} stroke="var(--line)" width={40} />
                        <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", fontSize: 12 }} labelFormatter={(r) => `After round ${r}`} formatter={(v) => [`${v} pts`, d.code]} />
                        <Line dataKey="points" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
              <section className="panel p-3" aria-label="Team-mate comparison">
                <div className="panel-title mb-2">Team-mate comparison</div>
                <p className="mb-2 text-[11.5px] text-fg-3">Against whoever drove the other {team.name} car in each round{mate ? ` (usually ${mate.displayName})` : ""}. Counts only rounds where both were classified.</p>
                {[
                  { label: "Qualifying", v: quali },
                  { label: "Race finish", v: race },
                ].map(({ label, v }) =>
                  v ? (
                    <div key={label} className="mb-2">
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span>{label}</span>
                        <span className="tnum text-fg-2">
                          {v.ahead}–{v.behind}
                        </span>
                      </div>
                      <div className="flex h-2 gap-[2px] overflow-hidden rounded-[2px]">
                        <div style={{ flex: v.ahead || 0.0001, background: "var(--series-1)" }} />
                        <div style={{ flex: v.behind || 0.0001, background: "var(--line)" }} />
                      </div>
                    </div>
                  ) : null,
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
