import { pointsFor, SCORING } from "@/lib/config/scoring";

/**
 * Championship standings from classified results. Pure functions: callers pass results in, so the scoring
 * and tie-break rules are testable without network access.
 *
 * Tie-break (FIA Sporting Regulations): equal points are separated by countback — more Grand Prix wins, then
 * more second places, and so on. Sprint results are excluded from countback (`countbackIncludesSprint`).
 */

export interface ScoredResult {
  round: number;
  session: "RACE" | "SPRINT";
  driverId: string;
  driverCode: string;
  driverName: string;
  teamId: string;
  teamName: string;
  /** Classified finishing position; null when not classified (DNF, DNS, DSQ). */
  position: number | null;
  /** Points as published by the source, when available. */
  publishedPoints: number | null;
  fastestLapRank: number | null;
}

export interface StandingRow {
  id: string;
  code?: string;
  name: string;
  teamId?: string;
  teamName?: string;
  position: number;
  points: number;
  wins: number;
  podiums: number;
  /** Grand Prix finishing-position histogram used for countback (index 0 = wins). */
  countback: number[];
  recent: Array<{ round: number; position: number | null; session: "RACE" | "SPRINT" }>;
  /** Cumulative points after each round (index = round - 1). */
  progression: number[];
}

export interface PointsCheck {
  round: number;
  session: "RACE" | "SPRINT";
  driverId: string;
  computed: number;
  published: number;
}

export interface StandingsOptions {
  season: number;
  usePublishedPoints: boolean;
  countbackIncludesSprint?: boolean;
}

/** Points for one result: published value when requested and present, else the season table. */
export function resultPoints(r: ScoredResult, opts: StandingsOptions): number {
  if (opts.usePublishedPoints && r.publishedPoints !== null) return r.publishedPoints;
  return pointsFor(opts.season, r.session, r.position);
}

/** Results whose published points differ from the season's table (penalties, shortened races, data errors). */
export function pointsDiscrepancies(results: readonly ScoredResult[], season: number): PointsCheck[] {
  const out: PointsCheck[] = [];
  for (const r of results) {
    if (r.publishedPoints === null) continue;
    const computed = pointsFor(season, r.session, r.position);
    if (computed !== r.publishedPoints) out.push({ round: r.round, session: r.session, driverId: r.driverId, computed, published: r.publishedPoints });
  }
  return out;
}

export function compareCountback(a: Pick<StandingRow, "points" | "countback">, b: Pick<StandingRow, "points" | "countback">): number {
  if (a.points !== b.points) return b.points - a.points;
  const n = Math.max(a.countback.length, b.countback.length);
  for (let i = 0; i < n; i++) {
    const d = (b.countback[i] ?? 0) - (a.countback[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function finalise(rows: Map<string, StandingRow>, lastRound: number): StandingRow[] {
  const list = [...rows.values()];
  for (const r of list) {
    // Carry cumulative totals across rounds with no score for this competitor.
    let acc = 0;
    for (let i = 0; i < lastRound; i++) {
      acc = r.progression[i] ?? acc;
      r.progression[i] = acc;
    }
    r.recent.sort((a, b) => b.round - a.round || (a.session === "RACE" ? -1 : 1));
  }
  list.sort((a, b) => compareCountback(a, b) || a.name.localeCompare(b.name));
  let pos = 0;
  list.forEach((r, i) => {
    const prev = list[i - 1];
    if (!prev || compareCountback(prev, r) !== 0) pos = i + 1;
    r.position = pos;
  });
  return list;
}

export function driverStandings(results: readonly ScoredResult[], opts: StandingsOptions): StandingRow[] {
  if (!SCORING[opts.season]) throw new Error(`No scoring rules for ${opts.season}`);
  const lastRound = Math.max(0, ...results.map((r) => r.round));
  const rows = new Map<string, StandingRow>();
  const ordered = [...results].sort((a, b) => a.round - b.round || (a.session === "SPRINT" ? -1 : 1));
  for (const r of ordered) {
    let row = rows.get(r.driverId);
    if (!row) {
      row = { id: r.driverId, code: r.driverCode, name: r.driverName, teamId: r.teamId, teamName: r.teamName, position: 0, points: 0, wins: 0, podiums: 0, countback: [], recent: [], progression: [] };
      rows.set(r.driverId, row);
    }
    // Latest team association wins (substitutes keep the team they drove for most recently).
    row.teamId = r.teamId;
    row.teamName = r.teamName;
    row.points += resultPoints(r, opts);
    if (r.session === "RACE" || opts.countbackIncludesSprint) {
      if (r.position !== null) row.countback[r.position - 1] = (row.countback[r.position - 1] ?? 0) + 1;
    }
    if (r.session === "RACE" && r.position === 1) row.wins++;
    if (r.session === "RACE" && r.position !== null && r.position <= 3) row.podiums++;
    row.recent.push({ round: r.round, position: r.position, session: r.session });
    row.progression[r.round - 1] = row.points;
  }
  for (const row of rows.values()) for (let i = 0; i < row.countback.length; i++) row.countback[i] ??= 0;
  return finalise(rows, lastRound);
}

export function constructorStandings(results: readonly ScoredResult[], opts: StandingsOptions, teamNames: Record<string, string>): StandingRow[] {
  const lastRound = Math.max(0, ...results.map((r) => r.round));
  const rows = new Map<string, StandingRow>();
  const ordered = [...results].sort((a, b) => a.round - b.round || (a.session === "SPRINT" ? -1 : 1));
  for (const r of ordered) {
    let row = rows.get(r.teamId);
    if (!row) {
      row = { id: r.teamId, name: teamNames[r.teamId] ?? r.teamName, position: 0, points: 0, wins: 0, podiums: 0, countback: [], recent: [], progression: [] };
      rows.set(r.teamId, row);
    }
    row.points += resultPoints(r, opts);
    if (r.session === "RACE" || opts.countbackIncludesSprint) {
      if (r.position !== null) row.countback[r.position - 1] = (row.countback[r.position - 1] ?? 0) + 1;
    }
    if (r.session === "RACE" && r.position === 1) row.wins++;
    if (r.session === "RACE" && r.position !== null && r.position <= 3) row.podiums++;
    row.progression[r.round - 1] = row.points;
  }
  for (const row of rows.values()) for (let i = 0; i < row.countback.length; i++) row.countback[i] ??= 0;
  return finalise(rows, lastRound);
}
