import { driverByNumber } from "@/lib/config/drivers-2026";
import { TEAMS_2026, teamByOpenF1Name } from "@/lib/config/teams-2026";
import type { SessionType } from "@/lib/config/season-2026";
import { parseLapTime } from "./formatters";
import {
  bestLapGap,
  bestTable,
  markFor,
  normaliseCompound,
  parseGapValue,
  speedMark,
  stintForLap,
  tyreAgeAt,
  markPersonalBests,
} from "./calculations";
import { applyRaceControl, initialTrackStatus, parseDeletedLap, sessionPhaseAt, toRaceControlMessage, trackStatusAt, type RawRaceControl } from "./status";
import type {
  CarPosition,
  DriverRunState,
  Gap,
  LapRecord,
  PitStop,
  QualifyingTimes,
  RaceControlMessage,
  SectorCell,
  SessionInfo,
  Stint,
  TimingRow,
  TimingSnapshot,
  TrackGeometry,
  TrackPoint,
  Weather,
} from "./types";
import type {
  OF1Driver,
  OF1Interval,
  OF1Lap,
  OF1Location,
  OF1Pit,
  OF1Position,
  OF1RaceControl,
  OF1SessionResult,
  OF1StartingGrid,
  OF1Stint,
  OF1Weather,
} from "./validation";

/**
 * Pure normalisation of OpenF1 payloads into domain types. No I/O here, so every rule is unit-testable.
 */

export interface OpenF1SessionRaw {
  sessionKey: number;
  sessionType: SessionType;
  drivers: OF1Driver[];
  laps: OF1Lap[];
  positions: OF1Position[];
  intervals: OF1Interval[];
  stints: OF1Stint[];
  pits: OF1Pit[];
  raceControl: OF1RaceControl[];
  weather: OF1Weather[];
  results: OF1SessionResult[];
  grid: OF1StartingGrid[];
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const iso = (t: number | null): string | null => (t === null ? null : new Date(t).toISOString());

/** No F1 lap takes four minutes under green; an open lap older than this is treated as abandoned. */
const ABANDONED_LAP_MS = 240_000;

// ---------------------------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------------------------

export interface DriverIdentity {
  driverNumber: number;
  code: string;
  name: string;
  teamId: string | null;
  teamName: string;
  teamColour: string;
}

/**
 * Identity for each car in a session. The session's own entry list is authoritative for the team (it captures
 * substitutes and practice-only drivers); the 2026 config supplies correctly accented names.
 */
export function driverDirectory(drivers: readonly OF1Driver[]): Map<number, DriverIdentity> {
  const out = new Map<number, DriverIdentity>();
  for (const d of drivers) {
    const cfg = driverByNumber(d.driver_number);
    const team = teamByOpenF1Name(d.team_name);
    const colour = d.team_colour && /^[0-9a-f]{6}$/i.test(d.team_colour) ? `#${d.team_colour.toUpperCase()}` : team?.colour ?? "#8A8F98";
    const sourceName = d.full_name ? titleCase(d.full_name) : null;
    const nameMatchesConfig = cfg && d.name_acronym && cfg.code === d.name_acronym.toUpperCase();
    out.set(d.driver_number, {
      driverNumber: d.driver_number,
      code: (d.name_acronym ?? cfg?.code ?? String(d.driver_number)).toUpperCase(),
      name: nameMatchesConfig ? cfg.displayName : sourceName ?? cfg?.displayName ?? `Car ${d.driver_number}`,
      teamId: team?.id ?? null,
      teamName: team?.name ?? d.team_name ?? "Unknown team",
      teamColour: colour,
    });
  }
  return out;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function fallbackIdentity(driverNumber: number): DriverIdentity {
  const cfg = driverByNumber(driverNumber);
  const team = cfg ? TEAMS_2026[cfg.teamId] : undefined;
  return {
    driverNumber,
    code: cfg?.code ?? String(driverNumber),
    name: cfg?.displayName ?? `Car ${driverNumber}`,
    teamId: team?.id ?? null,
    teamName: team?.name ?? "Unknown team",
    teamColour: team?.colour ?? "#8A8F98",
  };
}

// ---------------------------------------------------------------------------------------------
// Laps
// ---------------------------------------------------------------------------------------------

interface LapTiming {
  driverNumber: number;
  lap: number;
  start: number | null;
  end: number | null;
  raw: OF1Lap;
}

/** Per-driver lap timeline with end instants: the next lap's start, else start + duration. */
export function lapTimeline(laps: readonly OF1Lap[]): Map<number, LapTiming[]> {
  const byDriver = new Map<number, OF1Lap[]>();
  for (const l of laps) {
    const list = byDriver.get(l.driver_number) ?? [];
    list.push(l);
    byDriver.set(l.driver_number, list);
  }
  const out = new Map<number, LapTiming[]>();
  for (const [driver, list] of byDriver) {
    list.sort((a, b) => a.lap_number - b.lap_number);
    const timeline: LapTiming[] = list.map((l, i) => {
      const start = ms(l.date_start);
      const next = list[i + 1];
      const nextStart = next && next.lap_number === l.lap_number + 1 ? ms(next.date_start) : null;
      const end = nextStart ?? (start !== null && typeof l.lap_duration === "number" ? start + l.lap_duration * 1000 : null);
      return { driverNumber: driver, lap: l.lap_number, start, end, raw: l };
    });
    out.set(driver, timeline);
  }
  return out;
}

export function rcRaw(m: OF1RaceControl): RawRaceControl & { lap: number | null; driverNumber: number | null } {
  return {
    at: new Date(m.date).toISOString(),
    category: m.category ?? null,
    flag: m.flag ?? null,
    scope: m.scope ?? null,
    sector: m.sector ?? null,
    message: m.message,
    qualifyingPhase: m.qualifying_phase ?? null,
    lap: m.lap_number ?? null,
    driverNumber: m.driver_number ?? null,
  };
}

function sortedRaceControl(raw: readonly OF1RaceControl[]) {
  return raw.map(rcRaw).sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Deleted laps keyed by `${driver}:${lap}`, limited to messages issued at or before `atMs`.
 *
 * Race control quotes the deleted time ("TIME 1:36.029 DELETED"), and that is what identifies the lap: its own
 * "LAP n" counter does not always match the timing feed's lap numbers (it differs in practice sessions). The lap
 * number is only used when no time is quoted and the session is a race, where the two counters agree.
 * Messages that identify neither are left unresolved rather than guessed.
 */
export function deletedLapIndex(
  raceControl: readonly OF1RaceControl[],
  laps: readonly OF1Lap[],
  atMs: number = Number.POSITIVE_INFINITY,
  lapNumbersReliable = false,
): Map<string, string> {
  const out = new Map<string, string>();
  const byDriver = lapTimeline(laps);
  for (const m of raceControl) {
    const t = ms(m.date);
    if (t === null || t > atMs) continue;
    const d = parseDeletedLap(m.message, m.date);
    if (!d) continue;
    const reason = d.reason || "Deleted by race control";
    const timeline = byDriver.get(d.driverNumber) ?? [];
    if (d.time) {
      const target = Math.round((parseLapTime(d.time) ?? -1) * 1000);
      const match = timeline
        .filter((l) => typeof l.raw.lap_duration === "number" && Math.round(l.raw.lap_duration * 1000) === target && (l.end === null || l.end <= t + 1000))
        .pop();
      if (match) out.set(`${d.driverNumber}:${match.lap}`, reason);
    } else if (d.lap !== null && lapNumbersReliable) {
      out.set(`${d.driverNumber}:${d.lap}`, reason);
    }
  }
  return out;
}

/** Instants covered by SC, VSC or a red flag, from race-control transitions. */
export function neutralisedWindows(raceControl: readonly OF1RaceControl[]): Array<[number, number]> {
  const msgs = sortedRaceControl(raceControl);
  const windows: Array<[number, number]> = [];
  let state = initialTrackStatus();
  let openedAt: number | null = null;
  const neutral = new Set(["SAFETY_CAR", "SAFETY_CAR_ENDING", "VSC", "VSC_ENDING", "RED"]);
  for (const m of msgs) {
    const next = applyRaceControl(state, m);
    const was = neutral.has(state.status);
    const is = neutral.has(next.status);
    const t = Date.parse(m.at);
    if (!was && is) openedAt = t;
    if (was && !is && openedAt !== null) {
      windows.push([openedAt, t]);
      openedAt = null;
    }
    state = next;
  }
  if (openedAt !== null) windows.push([openedAt, Number.POSITIVE_INFINITY]);
  return windows;
}

export function normaliseStints(raw: readonly OF1Stint[]): Stint[] {
  return raw
    .filter((s) => typeof s.lap_start === "number")
    .map((s) => ({
      driverNumber: s.driver_number,
      stint: s.stint_number,
      compound: normaliseCompound(s.compound),
      lapStart: s.lap_start as number,
      lapEnd: s.lap_end ?? null,
      tyreAgeAtStart: s.tyre_age_at_start ?? null,
    }))
    .sort((a, b) => a.driverNumber - b.driverNumber || a.stint - b.stint);
}

export function normalisePits(raw: readonly OF1Pit[]): PitStop[] {
  return raw
    .filter((p) => typeof p.lap_number === "number")
    .map((p) => ({
      driverNumber: p.driver_number,
      lap: p.lap_number as number,
      at: new Date(p.date).toISOString(),
      laneDuration: p.lane_duration ?? p.pit_duration ?? null,
      stopDuration: p.stop_duration ?? null,
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** Lap history for one driver up to `atMs`. Only completed laps are returned. */
export function buildLapRecords(raw: OpenF1SessionRaw, driverNumber: number, atMs: number = Number.POSITIVE_INFINITY): LapRecord[] {
  const timeline = lapTimeline(raw.laps).get(driverNumber) ?? [];
  const stints = normaliseStints(raw.stints).filter((s) => s.driverNumber === driverNumber);
  const pitLaps = new Set(normalisePits(raw.pits).filter((p) => p.driverNumber === driverNumber && Date.parse(p.at) <= atMs).map((p) => p.lap));
  const deleted = deletedLapIndex(raw.raceControl, raw.laps, atMs, raw.sessionType === "RACE" || raw.sessionType === "SPRINT");
  const windows = neutralisedWindows(raw.raceControl.filter((m) => (ms(m.date) ?? 0) <= atMs));
  const haveRaceControl = raw.raceControl.length > 0;

  const records: LapRecord[] = [];
  for (const t of timeline) {
    if (t.end === null || t.end > atMs) continue;
    const l = t.raw;
    const stint = stintForLap(stints, l.lap_number);
    const age = stint ? tyreAgeAt(stint, l.lap_number) : { age: null, basis: "unknown" as const };
    const reason = deleted.get(`${driverNumber}:${l.lap_number}`) ?? null;
    const neutralised = t.start === null || !haveRaceControl ? null : windows.some(([a, b]) => (t.start as number) < b && (t.end as number) > a);
    records.push({
      driverNumber,
      lap: l.lap_number,
      startedAt: iso(t.start),
      time: l.lap_duration ?? null,
      sectors: [l.duration_sector_1 ?? null, l.duration_sector_2 ?? null, l.duration_sector_3 ?? null],
      speedTrap: l.st_speed ?? null,
      compound: stint?.compound ?? null,
      tyreAge: age.age,
      tyreAgeBasis: age.basis,
      pitIn: pitLaps.has(l.lap_number),
      pitOut: Boolean(l.is_pit_out_lap),
      valid: reason ? false : haveRaceControl ? true : null,
      deletedReason: reason,
      personalBest: false,
      neutralised,
    });
  }
  return markPersonalBests(records);
}

// ---------------------------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------------------------

function latestBefore<T extends { date: string; driver_number: number }>(records: readonly T[], atMs: number): Map<number, T> {
  const out = new Map<number, T>();
  for (const r of records) {
    const t = ms(r.date);
    if (t === null || t > atMs) continue;
    const prev = out.get(r.driver_number);
    if (!prev || (ms(prev.date) as number) <= t) out.set(r.driver_number, r);
  }
  return out;
}

function emptySector(): SectorCell {
  return { value: null, mark: null, current: false };
}

/** Last instant contained in the data: used as "as of" for completed sessions. */
export function dataEnd(raw: OpenF1SessionRaw): number | null {
  let end: number | null = null;
  const bump = (t: number | null) => {
    if (t !== null && (end === null || t > end)) end = t;
  };
  for (const tl of lapTimeline(raw.laps).values()) for (const l of tl) bump(l.end);
  for (const p of raw.positions) bump(ms(p.date));
  for (const m of raw.raceControl) bump(ms(m.date));
  for (const i of raw.intervals) bump(ms(i.date));
  return end;
}

/** Instant at which the race leader completed `lap` (first car across the line after that many laps). */
export function leaderLapInstant(raw: OpenF1SessionRaw, lap: number): number | null {
  let best: number | null = null;
  for (const tl of lapTimeline(raw.laps).values()) {
    const l = tl.find((x) => x.lap === lap);
    if (l?.end != null && (best === null || l.end < best)) best = l.end;
  }
  return best;
}

export function maxLeaderLap(raw: OpenF1SessionRaw): number {
  let max = 0;
  for (const tl of lapTimeline(raw.laps).values()) for (const l of tl) if (l.end !== null && l.lap > max) max = l.lap;
  return max;
}

function qualifyingWindows(rc: ReturnType<typeof sortedRaceControl>): Array<{ phase: 1 | 2 | 3; start: number; end: number }> {
  const out: Array<{ phase: 1 | 2 | 3; start: number; end: number }> = [];
  let open: { phase: 1 | 2 | 3; start: number } | null = null;
  for (const m of rc) {
    if ((m.category ?? "").toUpperCase() !== "SESSIONSTATUS") continue;
    const p = m.qualifyingPhase;
    if (p !== 1 && p !== 2 && p !== 3) continue;
    const t = Date.parse(m.at);
    if (/STARTED|RESUMED/.test(m.message.toUpperCase())) {
      if (!open || open.phase !== p) open = { phase: p, start: t };
    } else if (/FINISHED|ENDED/.test(m.message.toUpperCase()) && open && open.phase === p) {
      out.push({ phase: p, start: open.start, end: t });
      open = null;
    }
  }
  if (open) out.push({ phase: open.phase, start: open.start, end: Number.POSITIVE_INFINITY });
  return out;
}

export interface SnapshotOptions {
  /** Instant to reconstruct; omitted = end of available data. */
  atMs?: number;
  atLap?: number | null;
  totalLapsHint?: number | null;
}

export function buildSnapshot(raw: OpenF1SessionRaw, session: Omit<SessionInfo, "qualifyingPhase" | "totalLaps">, opts: SnapshotOptions = {}): TimingSnapshot {
  const isRaceLike = raw.sessionType === "RACE" || raw.sessionType === "SPRINT";
  const isQualifying = raw.sessionType === "QUALIFYING" || raw.sessionType === "SPRINT_QUALIFYING";
  const end = dataEnd(raw);
  let atMs = opts.atMs ?? Number.POSITIVE_INFINITY;
  if (opts.atLap != null && isRaceLike) {
    const t = leaderLapInstant(raw, opts.atLap);
    if (t !== null) atMs = t + 500;
  }
  const isFinalState = !Number.isFinite(atMs) || (end !== null && atMs >= end);
  const effectiveAt = Number.isFinite(atMs) ? atMs : end ?? Date.now();

  const directory = driverDirectory(raw.drivers);
  const timeline = lapTimeline(raw.laps);
  const rc = sortedRaceControl(raw.raceControl);
  const deleted = deletedLapIndex(raw.raceControl, raw.laps, effectiveAt, isRaceLike);
  const stints = normaliseStints(raw.stints);
  const pits = normalisePits(raw.pits).filter((p) => Date.parse(p.at) <= effectiveAt);
  const results = new Map(raw.results.map((r) => [r.driver_number, r]));
  const drivers = new Set<number>([...directory.keys(), ...timeline.keys()]);

  // Completed laps and sector completions up to the snapshot instant.
  interface Done {
    lapsCompleted: number;
    last: LapTiming | null;
    current: LapTiming | null;
    completed: LapTiming[];
  }
  const done = new Map<number, Done>();
  for (const d of drivers) {
    const tl = timeline.get(d) ?? [];
    const completed = tl.filter((l) => l.end !== null && l.end <= effectiveAt);
    const last = completed[completed.length - 1] ?? null;
    // An unfinished lap that began long ago is abandoned (car stopped or retired), not in progress.
    const current =
      tl.find((l) => l.start !== null && l.start <= effectiveAt && (l.end !== null ? l.end > effectiveAt : effectiveAt - l.start < ABANDONED_LAP_MS)) ?? null;
    done.set(d, { lapsCompleted: last?.lap ?? 0, last, current, completed });
  }

  const isValid = (d: number, lap: number) => !deleted.has(`${d}:${lap}`);

  // Bests over everything completed so far (sector bests include sectors completed on the lap in progress).
  const lapEntries: Array<{ driverNumber: number; value: number | null; valid: boolean | null; lap: number }> = [];
  const sectorEntries: Array<Array<{ driverNumber: number; value: number | null; valid: boolean | null }>> = [[], [], []];
  const speedEntries: Array<{ driverNumber: number; value: number | null }> = [];
  for (const [d, info] of done) {
    const tl = [...info.completed, ...(info.current ? [info.current] : [])];
    for (const l of tl) {
      const complete = info.completed.includes(l);
      const valid = isValid(d, l.lap);
      if (complete) {
        lapEntries.push({ driverNumber: d, value: l.raw.lap_duration ?? null, valid, lap: l.lap });
        speedEntries.push({ driverNumber: d, value: l.raw.st_speed ?? null });
      }
      const secs = [l.raw.duration_sector_1, l.raw.duration_sector_2, l.raw.duration_sector_3];
      let cursor = l.start;
      secs.forEach((s, k) => {
        if (typeof s !== "number" || cursor === null) return;
        cursor += s * 1000;
        if (complete || cursor <= effectiveAt) sectorEntries[k]!.push({ driverNumber: d, value: s, valid });
      });
    }
  }
  const lapBests = bestTable(lapEntries);
  const sectorBests = sectorEntries.map((e) => bestTable(e));
  const bestLapEntry = lapEntries
    .filter((e) => e.valid && typeof e.value === "number")
    .sort((a, b) => (a.value as number) - (b.value as number))[0];

  // Qualifying phase times.
  const qWindows = isQualifying ? qualifyingWindows(rc) : [];
  const qTimes = new Map<number, QualifyingTimes>();
  if (isQualifying) {
    for (const [d, info] of done) {
      const times: [number | null, number | null, number | null] = [null, null, null];
      for (const w of qWindows) {
        for (const l of info.completed) {
          if (l.start === null || l.start < w.start || l.start > w.end) continue;
          if (!isValid(d, l.lap) || typeof l.raw.lap_duration !== "number") continue;
          const cur = times[w.phase - 1];
          if (cur === null || cur === undefined || l.raw.lap_duration < cur) times[w.phase - 1] = l.raw.lap_duration;
        }
      }
      const r = results.get(d);
      if (isFinalState && r && Array.isArray(r.duration)) {
        times[0] = r.duration[0] ?? times[0];
        times[1] = r.duration[1] ?? times[1];
        times[2] = r.duration[2] ?? times[2];
      }
      qTimes.set(d, { q1: times[0], q2: times[1], q3: times[2], eliminatedIn: null });
    }
  }

  // Order.
  const positions = latestBefore(raw.positions, effectiveAt);
  let orderBasis: TimingSnapshot["orderBasis"] = "race-position";
  let ordered: number[];
  const classified = isFinalState && raw.results.length > 0;
  if (classified) {
    orderBasis = "classification";
    ordered = [...drivers].sort((a, b) => {
      const ra = results.get(a);
      const rb = results.get(b);
      const pa = ra?.position ?? null;
      const pb = rb?.position ?? null;
      if (pa !== null && pb !== null) return pa - pb;
      if (pa !== null) return -1;
      if (pb !== null) return 1;
      return (rb?.number_of_laps ?? 0) - (ra?.number_of_laps ?? 0) || a - b;
    });
  } else if (positions.size > 0) {
    orderBasis = isRaceLike ? "race-position" : "best-lap";
    ordered = [...drivers].sort((a, b) => (positions.get(a)?.position ?? 999) - (positions.get(b)?.position ?? 999) || a - b);
  } else {
    orderBasis = "best-lap";
    ordered = [...drivers].sort((a, b) => (lapBests.personal.get(a) ?? Infinity) - (lapBests.personal.get(b) ?? Infinity) || a - b);
  }

  // Position reference for races: the position feed just before the start (grid order as published).
  let reference: Map<number, number> | null = null;
  if (isRaceLike) {
    if (raw.grid.length > 0) reference = new Map(raw.grid.map((g) => [g.driver_number, g.position]));
    else {
      const startMsg = rc.find((m) => (m.category ?? "").toUpperCase() === "SESSIONSTATUS" && /STARTED/.test(m.message.toUpperCase()));
      const startAt = startMsg ? Date.parse(startMsg.at) : null;
      if (startAt !== null) reference = new Map([...latestBefore(raw.positions, startAt)].map(([d, p]) => [d, p.position]));
    }
  }

  // Intervals for races.
  const intervals = isRaceLike ? latestBefore(raw.intervals, effectiveAt) : new Map<number, OF1Interval>();
  const chequeredAt = rc.find((m) => (m.flag ?? "").toUpperCase() === "CHEQUERED")?.at;
  const chequeredMs = chequeredAt && Date.parse(chequeredAt) <= effectiveAt ? Date.parse(chequeredAt) : null;

  // Qualifying elimination and gap basis: compare drivers within the phase that decided their position.
  const decidingPhase = new Map<number, 1 | 2 | 3 | null>();
  if (isQualifying) {
    for (const d of drivers) {
      const q = qTimes.get(d);
      decidingPhase.set(d, q?.q3 != null ? 3 : q?.q2 != null ? 2 : q?.q1 != null ? 1 : null);
    }
    if (classified) {
      const maxPhase = Math.max(0, ...[...decidingPhase.values()].map((p) => p ?? 0));
      for (const d of drivers) {
        const q = qTimes.get(d);
        const p = decidingPhase.get(d) ?? null;
        if (q && p !== null && p < maxPhase && (p === 1 || p === 2)) q.eliminatedIn = p;
      }
    }
  }
  const timeInPhase = (d: number, p: 1 | 2 | 3): number | null => {
    const q = qTimes.get(d);
    if (!q) return null;
    return p === 3 ? q.q3 : p === 2 ? q.q2 : q.q1;
  };
  const phaseTime = (d: number): number | null => {
    const p = decidingPhase.get(d);
    return p ? timeInPhase(d, p) : null;
  };
  // Fastest time set in each phase by anyone: the reference official timing uses for that phase.
  const phaseBest = new Map<number, number>();
  for (const d of drivers) {
    for (const p of [1, 2, 3] as const) {
      const t = timeInPhase(d, p);
      if (t === null) continue;
      const cur = phaseBest.get(p);
      if (cur === undefined || t < cur) phaseBest.set(p, t);
    }
  }

  const rows: TimingRow[] = ordered.map((d, idx) => {
    const id = directory.get(d) ?? fallbackIdentity(d);
    const info = done.get(d) as Done;
    const last = info.last;
    const result = results.get(d);
    const pos = classified ? result?.position ?? null : positions.get(d)?.position ?? (orderBasis === "best-lap" && lapBests.personal.has(d) ? idx + 1 : null);

    // Sectors: lap in progress where complete, otherwise carried over from the last completed lap.
    const sectors: [SectorCell, SectorCell, SectorCell] = [emptySector(), emptySector(), emptySector()];
    const fill = (lap: LapTiming, current: boolean) => {
      const secs = [lap.raw.duration_sector_1, lap.raw.duration_sector_2, lap.raw.duration_sector_3];
      let cursor = lap.start;
      secs.forEach((s, k) => {
        if (typeof s !== "number") return;
        if (current) {
          if (cursor === null) return;
          cursor += s * 1000;
          if (cursor > effectiveAt) return;
        }
        if (current || sectors[k]!.value === null) {
          sectors[k] = { value: s, mark: markFor(s, d, sectorBests[k]!, isValid(d, lap.lap)), current };
        }
      });
    };
    if (info.current && !isFinalState) fill(info.current, true);
    if (last) fill(last, false);

    const lastTime = last?.raw.lap_duration ?? null;
    const best = lapBests.personal.get(d) ?? null;
    const bestLapNo = lapEntries.find((e) => e.driverNumber === d && e.valid && e.value === best)?.lap ?? null;

    // Gap & interval.
    let gap: Gap = { kind: "none" };
    let interval: Gap = { kind: "none" };
    if (isRaceLike) {
      const isLeader = pos === 1;
      const iv = intervals.get(d);
      if (isLeader) {
        gap = { kind: "leader" };
        interval = { kind: "leader" };
      } else if (classified && result && result.gap_to_leader != null && !Array.isArray(result.gap_to_leader)) {
        gap = parseGapValue(result.gap_to_leader);
        interval = iv ? parseGapValue(iv.interval) : { kind: "none" };
      } else if (iv) {
        gap = parseGapValue(iv.gap_to_leader);
        interval = parseGapValue(iv.interval);
      }
    } else if (isQualifying) {
      const p = decidingPhase.get(d);
      const t = phaseTime(d);
      const ref = p ? phaseBest.get(p) ?? null : null;
      gap = bestLapGap(t, ref);
      const aheadDriver = idx > 0 ? ordered[idx - 1] : undefined;
      // Compare like with like: the car ahead's time in the phase that decided this driver's position.
      const aheadT = aheadDriver !== undefined && p ? timeInPhase(aheadDriver, p) : null;
      interval = idx === 0 ? { kind: "leader" } : aheadT !== null && t !== null ? { kind: "time", seconds: Math.round((t - aheadT) * 1000) / 1000 } : { kind: "none" };
    } else {
      gap = bestLapGap(best, lapBests.session);
      const aheadDriver = idx > 0 ? ordered[idx - 1] : undefined;
      const aheadBest = aheadDriver !== undefined ? lapBests.personal.get(aheadDriver) ?? null : null;
      interval = idx === 0 ? (best !== null ? { kind: "leader" } : { kind: "none" }) : best !== null && aheadBest !== null ? { kind: "time", seconds: Math.round((best - aheadBest) * 1000) / 1000 } : { kind: "none" };
    }

    // Tyres.
    const myStints = stints.filter((s) => s.driverNumber === d);
    const currentLapNo = info.current?.lap ?? (info.lapsCompleted > 0 ? info.lapsCompleted : 1);
    const stint = stintForLap(myStints, currentLapNo) ?? stintForLap(myStints, info.lapsCompleted) ?? (isFinalState ? myStints[myStints.length - 1] : undefined);
    const age = tyreAgeAt(stint, info.lapsCompleted);

    // State.
    const myPits = pits.filter((p) => p.driverNumber === d);
    const inPit = myPits.some((p) => {
      const t = Date.parse(p.at);
      return effectiveAt >= t && effectiveAt <= t + (p.laneDuration ?? 25) * 1000;
    });
    let state: DriverRunState = "RUNNING";
    if (result?.dsq && isFinalState) state = "DSQ";
    else if (result?.dns && (isFinalState || info.lapsCompleted === 0)) state = "DNS";
    else if (result?.dnf && (isFinalState || (last?.end != null && effectiveAt - last.end > 90_000 && !info.current))) state = "RETIRED";
    else if (chequeredMs !== null && last?.end != null && last.end >= chequeredMs && isRaceLike) state = "FINISHED";
    else if (inPit) state = "PIT";
    else if (info.current?.raw.is_pit_out_lap && !isFinalState) state = "OUT";
    else if (isFinalState) state = isRaceLike ? (chequeredMs !== null ? "FINISHED" : "UNKNOWN") : "FINISHED";

    // A car that is out of the session has no meaningful gap; its last interval reading would be stale.
    if (isRaceLike && (state === "RETIRED" || state === "DNS" || state === "DSQ")) {
      gap = { kind: "none" };
      interval = { kind: "none" };
    }

    const ref = reference?.get(d);
    const lastSt = last?.raw.st_speed ?? null;

    return {
      driverNumber: d,
      code: id.code,
      name: id.name,
      teamId: id.teamId,
      teamColour: id.teamColour,
      position: pos,
      positionChange: isRaceLike && ref !== undefined && pos !== null ? ref - pos : null,
      lapsCompleted: info.lapsCompleted,
      currentLap: isFinalState ? null : info.current?.lap ?? null,
      lastLap: { value: lastTime, mark: last ? markFor(lastTime, d, lapBests, isValid(d, last.lap)) : null },
      bestLap: { value: best, mark: markFor(best, d, lapBests), lap: bestLapNo },
      gap,
      interval,
      sectors,
      speedTrap: { value: lastSt, mark: speedMark(lastSt, d, speedEntries) },
      tyre: { compound: stint?.compound ?? null, age: age.age, ageBasis: age.basis, stintNumber: stint?.stint ?? null },
      pitStops: isRaceLike ? myPits.length : myPits.length > 0 ? myPits.length : null,
      state,
      qualifying: isQualifying ? qTimes.get(d) ?? null : null,
    };
  });

  // Session meta.
  const track = trackStatusAt(rc, iso(effectiveAt));
  const phase = sessionPhaseAt(rc, iso(effectiveAt));
  const startMsg = rc.find((m) => (m.category ?? "").toUpperCase() === "SESSIONSTATUS" && /STARTED/.test(m.message.toUpperCase()));
  const elapsed = startMsg ? Math.max(0, (effectiveAt - Date.parse(startMsg.at)) / 1000) : null;
  const weather = latestWeather(raw.weather, effectiveAt);
  const leader = rows[0];
  const winnerLaps = [...results.values()].find((r) => r.position === 1)?.number_of_laps ?? null;
  const maxLap = maxLeaderLap(raw);

  return {
    session: {
      ...session,
      totalLaps: isRaceLike ? (opts.totalLapsHint ?? winnerLaps) : null,
      qualifyingPhase: isQualifying ? phase.qualifyingPhase : null,
    },
    rows,
    orderBasis,
    positionReference: isRaceLike && reference ? (raw.grid.length > 0 ? "grid" : "start-of-session") : null,
    bests: {
      lap: bestLapEntry ? { driverNumber: bestLapEntry.driverNumber, time: bestLapEntry.value as number, lap: bestLapEntry.lap } : null,
      sectors: [sectorBests[0]!.session, sectorBests[1]!.session, sectorBests[2]!.session],
      speedTrap: speedEntries.reduce<number | null>((m, e) => (e.value !== null && (m === null || e.value > m) ? e.value : m), null),
    },
    trackStatus: track,
    phase: phase.phase,
    leaderLap: isRaceLike && leader ? Math.min((leader.lapsCompleted ?? 0) + (isFinalState ? 0 : 1), maxLap || Infinity) : null,
    clock: { elapsed, remaining: null, basis: elapsed !== null ? "source" : "none" },
    weather,
    asOf: iso(effectiveAt),
    replay: isRaceLike && maxLap > 0 ? { minLap: 1, maxLap, atLap: opts.atLap ?? null } : null,
  };
}

export function latestWeather(raw: readonly OF1Weather[], atMs: number): Weather | null {
  let best: OF1Weather | null = null;
  for (const w of raw) {
    const t = ms(w.date);
    if (t === null || t > atMs) continue;
    if (!best || t > (ms(best.date) as number)) best = w;
  }
  if (!best) return null;
  return {
    airTempC: best.air_temperature ?? null,
    trackTempC: best.track_temperature ?? null,
    humidityPct: best.humidity ?? null,
    pressureMbar: best.pressure ?? null,
    rainfall: best.rainfall == null ? null : Boolean(best.rainfall),
    windSpeedMs: best.wind_speed ?? null,
    windDirectionDeg: best.wind_direction ?? null,
    observedAt: new Date(best.date).toISOString(),
  };
}

export function normaliseRaceControl(raw: readonly OF1RaceControl[], sessionId: string): RaceControlMessage[] {
  return sortedRaceControl(raw)
    .map((m, i) => toRaceControlMessage(m, sessionId, i, "FIA race control (via OpenF1)"))
    .reverse();
}

// ---------------------------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------------------------

/** Outline from one lap of position samples, with sector boundary indices from that lap's sector times. */
export function trackFromLocations(samples: readonly OF1Location[], lapStartMs: number, sectorTimes: [number | null, number | null, number | null], basis: string): TrackGeometry | null {
  const pts = samples
    .map((s) => ({ t: ms(s.date) as number, x: s.x, y: s.y }))
    .filter((p) => Number.isFinite(p.t) && !(p.x === 0 && p.y === 0))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 40) return null;
  // Drop consecutive duplicates (car stationary or repeated samples).
  const outline: Array<TrackPoint & { t: number }> = [];
  for (const p of pts) {
    const prev = outline[outline.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1) outline.push(p);
  }
  let boundaries: [number, number] | null = null;
  if (sectorTimes[0] !== null && sectorTimes[1] !== null) {
    const t1 = lapStartMs + sectorTimes[0] * 1000;
    const t2 = t1 + sectorTimes[1] * 1000;
    const nearest = (t: number) => outline.reduce((bi, p, i) => (Math.abs(p.t - t) < Math.abs((outline[bi] as { t: number }).t - t) ? i : bi), 0);
    boundaries = [nearest(t1), nearest(t2)];
  }
  return { outline: outline.map(({ x, y }) => ({ x, y })), sectorBoundaries: boundaries, basis };
}

export function carsFromLocations(samples: readonly OF1Location[]): CarPosition[] {
  const latest = new Map<number, OF1Location>();
  for (const s of samples) {
    if (s.x === 0 && s.y === 0) continue;
    const prev = latest.get(s.driver_number);
    if (!prev || s.date > prev.date) latest.set(s.driver_number, s);
  }
  return [...latest.values()].map((s) => ({ driverNumber: s.driver_number, x: s.x, y: s.y, at: new Date(s.date).toISOString() }));
}
