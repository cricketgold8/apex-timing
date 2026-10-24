import "server-only";
import { driverById } from "@/lib/config/drivers-2026";
import { eventByRound, ROUNDS_2026, findSession, scheduleState, type SessionType } from "@/lib/config/season-2026";
import { TEAMS_2026, teamByJolpicaId } from "@/lib/config/teams-2026";
import type { ResultRow, SessionResults, Classification } from "@/lib/results/types";
import { driverDirectory, fallbackIdentity } from "@/lib/timing/normalisation";
import { parseLapTime } from "@/lib/timing/formatters";
import type { Provenance } from "@/lib/timing/types";
import {
  jolpicaConstructorStandings,
  jolpicaDriverStandings,
  jolpicaResultsPage,
  of1Driver,
  of1SessionResult,
  type JolpicaQualifying,
  type JolpicaResult,
  type JolpicaResultsPage,
} from "@/lib/timing/validation";
import { JOLPICA_PROVIDER, jolpica, jolpicaAllPages } from "./jolpica";
import { OPENF1_PROVIDER, openf1 } from "./openf1";
import type { ScoredResult } from "@/lib/standings/standings";

const SEASON = 2026;

function mergePages(pages: JolpicaResultsPage[]): JolpicaResultsPage {
  const byRound = new Map<string, JolpicaResultsPage["MRData"]["RaceTable"]["Races"][number]>();
  for (const p of pages) {
    for (const race of p.MRData.RaceTable.Races) {
      const prev = byRound.get(race.round);
      if (!prev) byRound.set(race.round, { ...race, Results: [...(race.Results ?? [])], SprintResults: [...(race.SprintResults ?? [])], QualifyingResults: [...(race.QualifyingResults ?? [])] });
      else {
        prev.Results!.push(...(race.Results ?? []));
        prev.SprintResults!.push(...(race.SprintResults ?? []));
        prev.QualifyingResults!.push(...(race.QualifyingResults ?? []));
      }
    }
  }
  const first = pages[0]!;
  return { MRData: { ...first.MRData, RaceTable: { Races: [...byRound.values()].sort((a, b) => Number(a.round) - Number(b.round)) } } };
}

function identity(driverId: string, number: string, constructorId: string, given: string, family: string, code?: string) {
  const cfg = driverById(driverId);
  const team = teamByJolpicaId(constructorId);
  return {
    driverNumber: Number(number),
    driverId,
    code: (code ?? cfg?.code ?? family.slice(0, 3)).toUpperCase(),
    name: cfg?.displayName ?? `${given} ${family}`,
    teamId: team?.id ?? null,
    teamName: team?.name ?? constructorId,
    teamColour: team?.colour ?? "#8A8F98",
  };
}

function classificationOf(positionText: string, status: string): Classification {
  if (/^\d+$/.test(positionText)) return "CLASSIFIED";
  if (positionText === "D") return "DSQ";
  if (positionText === "E") return "EXCLUDED";
  if (positionText === "W" || /did not start/i.test(status)) return "DNS";
  if (positionText === "N") return "NOT_CLASSIFIED";
  return "RETIRED";
}

export function normaliseJolpicaResult(r: JolpicaResult): ResultRow {
  const id = identity(r.Driver.driverId, r.number, r.Constructor.constructorId, r.Driver.givenName, r.Driver.familyName, r.Driver.code);
  const classification = classificationOf(r.positionText, r.status);
  return {
    ...id,
    position: classification === "CLASSIFIED" ? Number(r.position) : null,
    positionText: r.positionText,
    // Jolpica uses grid 0 for a pit-lane start.
    grid: r.grid !== undefined && r.grid !== "" ? Number(r.grid) : null,
    laps: r.laps !== undefined ? Number(r.laps) : null,
    timeText: r.Time?.time ?? null,
    best: null,
    q1: null,
    q2: null,
    q3: null,
    status: r.status,
    classification,
    points: Number(r.points),
    fastestLap: r.FastestLap
      ? { time: parseLapTime(r.FastestLap.Time?.time), lap: r.FastestLap.lap ? Number(r.FastestLap.lap) : null, rank: r.FastestLap.rank ? Number(r.FastestLap.rank) : null }
      : null,
  };
}

function normaliseJolpicaQualifying(r: JolpicaQualifying): ResultRow {
  const id = identity(r.Driver.driverId, r.number, r.Constructor.constructorId, r.Driver.givenName, r.Driver.familyName, r.Driver.code);
  const q1 = parseLapTime(r.Q1);
  const q2 = parseLapTime(r.Q2);
  const q3 = parseLapTime(r.Q3);
  return {
    ...id,
    position: Number(r.position),
    positionText: r.position,
    grid: null,
    laps: null,
    timeText: null,
    best: q3 ?? q2 ?? q1,
    q1,
    q2,
    q3,
    status: "",
    classification: "CLASSIFIED",
    points: null,
    fastestLap: null,
  };
}

function prov(provider: string, sessionId: string | null, completeness: Provenance["completeness"], notes: string[]): Provenance {
  return { provider, mode: "HISTORICAL", sessionId, sourceTimestamp: null, fetchedAt: new Date().toISOString(), completeness, notes };
}

export interface SeasonResults {
  races: Map<number, ResultRow[]>;
  sprints: Map<number, ResultRow[]>;
  qualifying: Map<number, ResultRow[]>;
  lastRound: number;
  urls: string[];
}

let seasonInflight: Promise<SeasonResults> | null = null;
let seasonCache: { at: number; value: SeasonResults } | null = null;

/** All 2026 race, sprint and qualifying classifications published by Jolpica-F1. */
export async function seasonResults(): Promise<SeasonResults> {
  if (seasonCache && Date.now() - seasonCache.at < 10 * 60_000) return seasonCache.value;
  if (seasonInflight) return seasonInflight;
  seasonInflight = (async () => {
    const [races, sprints, quali] = [
      await jolpicaAllPages(`${SEASON}/results.json`, jolpicaResultsPage, mergePages),
      await jolpicaAllPages(`${SEASON}/sprint.json`, jolpicaResultsPage, mergePages),
      await jolpicaAllPages(`${SEASON}/qualifying.json`, jolpicaResultsPage, mergePages),
    ];
    const toMap = (page: JolpicaResultsPage, pick: (r: JolpicaResultsPage["MRData"]["RaceTable"]["Races"][number]) => ResultRow[]) =>
      new Map(page.MRData.RaceTable.Races.map((r) => [Number(r.round), pick(r)]));
    const value: SeasonResults = {
      races: toMap(races.data, (r) => (r.Results ?? []).map(normaliseJolpicaResult)),
      sprints: toMap(sprints.data, (r) => (r.SprintResults ?? []).map(normaliseJolpicaResult)),
      qualifying: toMap(quali.data, (r) => (r.QualifyingResults ?? []).map(normaliseJolpicaQualifying)),
      lastRound: Math.max(0, ...races.data.MRData.RaceTable.Races.map((r) => Number(r.round))),
      urls: [...races.urls, ...sprints.urls, ...quali.urls],
    };
    seasonCache = { at: Date.now(), value };
    return value;
  })();
  try {
    return await seasonInflight;
  } finally {
    seasonInflight = null;
  }
}

export function scoredResults(season: SeasonResults): ScoredResult[] {
  const out: ScoredResult[] = [];
  const add = (round: number, session: "RACE" | "SPRINT", rows: ResultRow[]) => {
    for (const r of rows) {
      out.push({
        round,
        session,
        driverId: r.driverId ?? `car-${r.driverNumber}`,
        driverCode: r.code,
        driverName: r.name,
        teamId: r.teamId ?? "unknown",
        teamName: r.teamName,
        position: r.position,
        publishedPoints: r.points,
        fastestLapRank: r.fastestLap?.rank ?? null,
      });
    }
  };
  for (const [round, rows] of season.races) add(round, "RACE", rows);
  for (const [round, rows] of season.sprints) add(round, "SPRINT", rows);
  return out;
}

export async function publishedStandings() {
  const [d, c] = [
    await jolpica(`${SEASON}/driverStandings.json`, jolpicaDriverStandings),
    await jolpica(`${SEASON}/constructorStandings.json`, jolpicaConstructorStandings),
  ];
  const dl = d.data.MRData.StandingsTable.StandingsLists[0];
  const cl = c.data.MRData.StandingsTable.StandingsLists[0];
  return {
    round: dl ? Number(dl.round) : null,
    drivers: (dl?.DriverStandings ?? []).map((s) => ({ driverId: s.Driver.driverId, points: Number(s.points), wins: Number(s.wins), position: s.position ? Number(s.position) : null })),
    constructors: (cl?.ConstructorStandings ?? []).map((s) => ({ teamId: teamByJolpicaId(s.Constructor.constructorId)?.id ?? s.Constructor.constructorId, points: Number(s.points), wins: Number(s.wins), position: s.position ? Number(s.position) : null })),
    urls: [d.url, c.url],
  };
}

/**
 * Classification for one session. Grand Prix, Sprint and Qualifying come from Jolpica-F1 (official classification
 * with points and status text); Practice and Sprint Qualifying come from OpenF1's session_result.
 */
export async function sessionResults(round: number, type: SessionType, practiceName?: string): Promise<SessionResults> {
  const event = eventByRound(round);
  if (!event) throw new Error(`Round ${round} is not on the 2026 calendar`);
  const session = event.sessions.find((s) => s.type === type && (!practiceName || s.name === practiceName));
  if (!session) throw new Error(`${event.name} has no ${type.toLowerCase().replace("_", " ")} session`);
  const state = scheduleState(session);
  const base = { eventId: event.id, round, eventName: event.name, sessionType: type, sessionName: session.name, sessionKey: session.openf1SessionKey };
  if (state !== "completed") {
    return { ...base, rows: [], provenance: { ...prov(JOLPICA_PROVIDER, String(session.openf1SessionKey), "partial", [state === "in-window" ? "Session in progress — no classification yet." : "Session has not taken place yet."]), mode: "UNAVAILABLE" } };
  }
  const ageH = (Date.now() - Date.parse(session.end)) / 3_600_000;

  if (type === "RACE" || type === "SPRINT" || type === "QUALIFYING") {
    const path = type === "RACE" ? "results" : type === "SPRINT" ? "sprint" : "qualifying";
    const { data, url } = await jolpica(`${SEASON}/${round}/${path}.json?limit=100`, jolpicaResultsPage);
    const race = data.MRData.RaceTable.Races[0];
    const rows = type === "QUALIFYING" ? (race?.QualifyingResults ?? []).map(normaliseJolpicaQualifying) : ((type === "RACE" ? race?.Results : race?.SprintResults) ?? []).map(normaliseJolpicaResult);
    const notes = [`Source: ${url}`];
    if (rows.length === 0) notes.push("The provider has not published this classification yet.");
    if (ageH < 24 && rows.length > 0) notes.push("Published within 24 hours of the session: may still change after stewards' decisions.");
    return { ...base, rows, provenance: prov(JOLPICA_PROVIDER, String(session.openf1SessionKey), rows.length === 0 ? "partial" : ageH < 24 ? "provisional" : "complete", notes) };
  }

  // Practice / Sprint Qualifying via OpenF1.
  const filters = [["session_key", "=", session.openf1SessionKey]] as Array<["session_key", "=", number]>;
  const [res, drv] = [
    await openf1({ endpoint: "session_result", filters, schema: of1SessionResult, access: "historical", ttlMs: ageH < 2 ? 60_000 : 6 * 3_600_000 }),
    await openf1({ endpoint: "drivers", filters, schema: of1Driver, access: "historical", ttlMs: 6 * 3_600_000 }),
  ];
  const dir = driverDirectory(drv.records);
  const rows: ResultRow[] = res.records
    .slice()
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .map((r) => {
      const id = dir.get(r.driver_number) ?? fallbackIdentity(r.driver_number);
      const phases = Array.isArray(r.duration) ? r.duration : null;
      const best = phases ? (phases[2] ?? phases[1] ?? phases[0] ?? null) : (r.duration as number | null | undefined) ?? null;
      const classification: Classification = r.dsq ? "DSQ" : r.dns ? "DNS" : r.dnf ? "RETIRED" : r.position != null ? "CLASSIFIED" : "NOT_CLASSIFIED";
      return {
        ...id,
        driverId: null,
        position: r.position ?? null,
        positionText: r.position != null ? String(r.position) : classification === "DNS" ? "DNS" : "NC",
        grid: null,
        laps: r.number_of_laps ?? null,
        timeText: null,
        best,
        q1: phases ? phases[0] ?? null : null,
        q2: phases ? phases[1] ?? null : null,
        q3: phases ? phases[2] ?? null : null,
        status: classification === "CLASSIFIED" ? "" : classification,
        classification,
        points: null,
        fastestLap: null,
      };
    });
  const notes = [`Source: ${res.url}`];
  if (rows.length === 0) notes.push("The provider has not published this classification yet.");
  return { ...base, rows, provenance: prov(OPENF1_PROVIDER, String(session.openf1SessionKey), rows.length === 0 ? "partial" : ageH < 24 ? "provisional" : "complete", notes) };
}

export function teamNameMap(): Record<string, string> {
  return Object.fromEntries(Object.values(TEAMS_2026).map((t) => [t.id, t.name]));
}

export { ROUNDS_2026, findSession };
