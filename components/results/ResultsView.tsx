"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ROUNDS_2026, SESSION_TYPE_LABEL, scheduleState } from "@/lib/config/season-2026";
import { useFeed } from "@/lib/client/feed";
import { useHydrated } from "@/lib/client/hooks";
import { useSessionResults } from "@/lib/client/season";
import type { ResultRow } from "@/lib/results/types";
import { formatDelta, formatLapTime } from "@/lib/timing/formatters";
import { DriverCell, PageTitle } from "@/components/ui/DriverCell";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { ProvenanceNote } from "@/components/ui/Provenance";

const STATUS_CLASS: Record<ResultRow["classification"], string> = {
  CLASSIFIED: "text-fg-2",
  NOT_CLASSIFIED: "text-yellow",
  RETIRED: "text-red",
  DNS: "text-red",
  DSQ: "text-red",
  EXCLUDED: "text-red",
};

function GridChange({ grid, pos }: { grid: number | null; pos: number | null }) {
  if (grid === null || grid === 0 || pos === null) return <span className="text-fg-3">—</span>;
  const d = grid - pos;
  if (d === 0) return <span className="text-fg-3">–</span>;
  return d > 0 ? (
    <span className="inline-flex items-center text-green">
      <ArrowUp size={10} aria-hidden />
      {d}
    </span>
  ) : (
    <span className="inline-flex items-center text-red">
      <ArrowDown size={10} aria-hidden />
      {-d}
    </span>
  );
}

function RaceTable({ rows, sprint }: { rows: ResultRow[]; sprint: boolean }) {
  const fastest = rows.find((r) => r.fastestLap?.rank === 1);
  return (
    <table className="data-table tnum">
      <thead>
        <tr>
          <th className="text-right">Pos</th>
          <th>Driver</th>
          <th>Team</th>
          <th className="text-right" title="Starting grid position (pit-lane starts have no grid slot)">Grid</th>
          <th className="text-right">+/−</th>
          <th className="text-right">Laps</th>
          <th className="text-right">Time / gap</th>
          <th>Status</th>
          <th className="text-right">Pts</th>
          {!sprint && <th className="text-right" title="Fastest lap as recorded by the provider. No championship point in 2026.">Fastest lap</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.driverNumber}-${r.code}`}>
            <td className="text-right">
              <span className="display text-[15px] font-bold">{r.positionText}</span>
            </td>
            <td>
              <DriverCell code={r.code} name={r.name} colour={r.teamColour} driverId={r.driverId} />
            </td>
            <td className="text-fg-2">{r.teamName}</td>
            <td className="text-right text-fg-2">{r.grid === 0 ? "PL" : r.grid ?? "—"}</td>
            <td className="text-right text-[11px]">
              <GridChange grid={r.grid} pos={r.position} />
            </td>
            <td className="text-right text-fg-2">{r.laps ?? "—"}</td>
            <td className="text-right">{r.timeText ?? "—"}</td>
            <td className={STATUS_CLASS[r.classification]}>{r.classification === "CLASSIFIED" ? (r.status === "Finished" ? "" : r.status) : `${r.classification === "RETIRED" ? "DNF" : r.classification.replace("_", " ")} · ${r.status}`}</td>
            <td className="text-right font-semibold">{r.points ?? "—"}</td>
            {!sprint && (
              <td className={`text-right ${r === fastest ? "m-session-best font-semibold" : "text-fg-2"}`}>
                {formatLapTime(r.fastestLap?.time)}
                {r.fastestLap?.lap ? <span className="ml-1 text-[10.5px] text-fg-3">L{r.fastestLap.lap}</span> : null}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QualifyingTable({ rows }: { rows: ResultRow[] }) {
  const best = (k: "q1" | "q2" | "q3") => Math.min(...rows.map((r) => r[k] ?? Infinity));
  const pole = best("q3");
  // Cut lines after P10 (Q2 eliminations end) and P16 (Q1 eliminations start) for a 22-car field.
  const q3Count = rows.filter((r) => r.q3 !== null).length;
  const q2Count = rows.filter((r) => r.q2 !== null).length;
  return (
    <table className="data-table tnum">
      <thead>
        <tr>
          <th className="text-right">Pos</th>
          <th>Driver</th>
          <th>Team</th>
          <th className="text-right">Q1</th>
          <th className="text-right">Q2</th>
          <th className="text-right">Q3</th>
          <th className="text-right" title="Q3 time minus pole">Gap</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const cut = (i === q3Count - 1 && q3Count > 0 && q3Count < rows.length) || (i === q2Count - 1 && q2Count > q3Count && q2Count < rows.length);
          return (
            <tr key={r.driverNumber} style={cut ? { boxShadow: "inset 0 -2px 0 var(--accent)" } : undefined}>
              <td className="text-right">
                <span className="display text-[15px] font-bold">{r.positionText}</span>
              </td>
              <td>
                <DriverCell code={r.code} name={r.name} colour={r.teamColour} driverId={r.driverId} />
              </td>
              <td className="text-fg-2">{r.teamName}</td>
              {(["q1", "q2", "q3"] as const).map((k) => (
                <td key={k} className={`text-right ${r[k] !== null && r[k] === best(k) ? "m-session-best font-semibold" : r[k] === null ? "text-fg-3" : "text-fg"}`}>
                  {formatLapTime(r[k])}
                </td>
              ))}
              <td className="text-right text-fg-2">{r.q3 !== null && Number.isFinite(pole) ? (r.q3 === pole ? "POLE" : formatDelta(r.q3 - pole)) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TimedTable({ rows, phases }: { rows: ResultRow[]; phases: boolean }) {
  const fastest = Math.min(...rows.map((r) => r.best ?? Infinity));
  return (
    <table className="data-table tnum">
      <thead>
        <tr>
          <th className="text-right">Pos</th>
          <th>Driver</th>
          <th>Team</th>
          {phases ? (
            <>
              <th className="text-right">SQ1</th>
              <th className="text-right">SQ2</th>
              <th className="text-right">SQ3</th>
            </>
          ) : (
            <th className="text-right">Best lap</th>
          )}
          <th className="text-right">Gap</th>
          <th className="text-right">Laps</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.driverNumber}>
            <td className="text-right">
              <span className="display text-[15px] font-bold">{r.positionText}</span>
            </td>
            <td>
              <DriverCell code={r.code} name={r.name} colour={r.teamColour} driverId={r.driverId ?? undefined} />
            </td>
            <td className="text-fg-2">{r.teamName}</td>
            {phases ? (
              (["q1", "q2", "q3"] as const).map((k) => (
                <td key={k} className={`text-right ${r[k] === null ? "text-fg-3" : "text-fg"}`}>
                  {formatLapTime(r[k])}
                </td>
              ))
            ) : (
              <td className={`text-right ${r.best === fastest ? "m-session-best font-semibold" : "text-fg"}`}>{formatLapTime(r.best)}</td>
            )}
            <td className="text-right text-fg-2">{r.best !== null && Number.isFinite(fastest) ? (r.best === fastest ? "—" : formatDelta(r.best - fastest)) : "—"}</td>
            <td className="text-right text-fg-2">{r.laps ?? "—"}</td>
            <td className={STATUS_CLASS[r.classification]}>{r.classification === "CLASSIFIED" ? "" : r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ResultsView() {
  const feed = useFeed();
  const hydrated = useHydrated();
  const completedRounds = useMemo(() => (hydrated ? ROUNDS_2026.filter((e) => e.sessions.some((s) => scheduleState(s) === "completed")) : ROUNDS_2026), [hydrated]);
  const initialRound = feed.event?.round && completedRounds.some((e) => e.round === feed.event?.round) ? feed.event.round : completedRounds[completedRounds.length - 1]?.round ?? 1;
  const [round, setRound] = useState<number>(initialRound);
  const event = ROUNDS_2026.find((e) => e.round === round);
  const sessions = event?.sessions ?? [];
  const defaultSession = () => {
    const race = sessions.find((s) => s.type === "RACE" && (!hydrated || scheduleState(s) === "completed"));
    const done = sessions.filter((s) => !hydrated || scheduleState(s) === "completed");
    return (race ?? done[done.length - 1] ?? sessions[0])?.openf1SessionKey ?? null;
  };
  const [sessionKey, setSessionKey] = useState<number | null>(defaultSession);
  useEffect(() => setSessionKey(defaultSession()), [round, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  const session = sessions.find((s) => s.openf1SessionKey === sessionKey) ?? null;
  const res = useSessionResults(round, session?.type ?? null, session?.type === "PRACTICE" ? session.name : null);
  const rows = res.data?.rows ?? [];

  return (
    <div>
      <PageTitle title="Results">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="res-round">
            Round
          </label>
          <select id="res-round" className="control w-[260px]" value={round} onChange={(e) => setRound(Number(e.target.value))}>
            {ROUNDS_2026.map((e) => (
              <option key={e.id} value={e.round ?? 0}>
                R{e.round} · {e.name}
                {e.format === "sprint" ? " (Sprint)" : ""}
                {hydrated && !completedRounds.includes(e) ? " — upcoming" : ""}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Session">
            {sessions.map((s) => (
              <button key={s.openf1SessionKey} className="btn" aria-pressed={s.openf1SessionKey === sessionKey} onClick={() => setSessionKey(s.openf1SessionKey)} disabled={s.cancelled}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </PageTitle>

      <section className="panel">
        <div className="panel-head flex-wrap py-1.5">
          <span className="panel-title">
            {event?.name} — {session ? (session.type === "PRACTICE" ? session.name : SESSION_TYPE_LABEL[session.type]) : ""}
          </span>
          {res.provenance?.completeness === "provisional" && <span className="rounded-[2px] bg-yellow/15 px-1.5 text-[10.5px] font-bold text-yellow">PROVISIONAL</span>}
          {res.provenance?.completeness === "complete" && <span className="rounded-[2px] bg-blue/10 px-1.5 text-[10.5px] font-bold text-blue">PUBLISHED CLASSIFICATION</span>}
          {session && (
            <Link className="btn ml-auto h-6" href={`/timing?session=${session.openf1SessionKey}`} onClick={() => feed.setSession(session.openf1SessionKey)}>
              Open in timing
            </Link>
          )}
        </div>
        {res.status === "error" && res.error ? (
          <ProviderErrorMessage error={res.error} onRetry={res.reload} />
        ) : res.status === "loading" || (res.status === "idle" && session) ? (
          <StateMessage kind="loading" title="Loading classification" />
        ) : rows.length === 0 ? (
          <StateMessage kind="empty" title="No classification">
            {res.provenance?.notes[0] ?? "The provider has not published results for this session."}
          </StateMessage>
        ) : (
          <div className="overflow-x-auto">
            {session?.type === "RACE" || session?.type === "SPRINT" ? (
              <RaceTable rows={rows} sprint={session.type === "SPRINT"} />
            ) : session?.type === "QUALIFYING" ? (
              <QualifyingTable rows={rows} />
            ) : (
              <TimedTable rows={rows} phases={session?.type === "SPRINT_QUALIFYING"} />
            )}
          </div>
        )}
        <div className="border-t border-line px-2.5 py-1.5">
          <ProvenanceNote provenance={res.provenance} />
          <p className="mt-1 text-[10.5px] text-fg-3">
            Points follow the 2026 tables (Grand Prix 25-18-15-12-10-8-6-4-2-1; Sprint 8-7-6-5-4-3-2-1; no fastest-lap point) and are shown as published by the provider. Grid and finish are listed separately; PL = pit-lane start.
          </p>
        </div>
      </section>
    </div>
  );
}
