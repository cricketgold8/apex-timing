import type { Compound, Gap, LapRecord, Stint, TimingMark, TimingRow, TyreAgeBasis } from "./types";

// ---------------------------------------------------------------------------------------------
// Sector and lap bests
// ---------------------------------------------------------------------------------------------

export interface BestTable {
  /** Fastest value per driver. */
  personal: Map<number, number>;
  /** Fastest value across all drivers, or null if nothing valid exists yet. */
  session: number | null;
}

/** Lowest valid positive value per driver and overall. Ties keep the first driver to set it. */
export function bestTable(entries: Iterable<{ driverNumber: number; value: number | null; valid: boolean | null }>): BestTable {
  const personal = new Map<number, number>();
  let session: number | null = null;
  for (const e of entries) {
    if (e.valid === false) continue;
    if (typeof e.value !== "number" || !Number.isFinite(e.value) || e.value <= 0) continue;
    const prev = personal.get(e.driverNumber);
    if (prev === undefined || e.value < prev) personal.set(e.driverNumber, e.value);
    if (session === null || e.value < session) session = e.value;
  }
  return { personal, session };
}

/**
 * Timing-screen colour for a value. Purple only when the value equals the session best; green when it
 * equals the driver's own best; otherwise a plain completed time. Invalid (deleted) values are marked as such.
 * Equality uses millisecond rounding because timing sources publish three decimals.
 */
export function markFor(value: number | null, driverNumber: number, table: BestTable, valid: boolean | null = true): TimingMark | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  if (valid === false) return "invalid";
  const ms = Math.round(value * 1000);
  if (table.session !== null && ms === Math.round(table.session * 1000)) return "session-best";
  const pb = table.personal.get(driverNumber);
  if (pb !== undefined && ms === Math.round(pb * 1000)) return "personal-best";
  return "normal";
}

/** Highest-is-best variant for speed traps. */
export function speedMark(value: number | null, driverNumber: number, all: Iterable<{ driverNumber: number; value: number | null }>): TimingMark | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  let session = -Infinity;
  let personal = -Infinity;
  for (const e of all) {
    if (e.value === null || !Number.isFinite(e.value)) continue;
    if (e.value > session) session = e.value;
    if (e.driverNumber === driverNumber && e.value > personal) personal = e.value;
  }
  if (value >= session) return "session-best";
  if (value >= personal) return "personal-best";
  return "normal";
}

// ---------------------------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------------------------

export type SortKey = "position" | "bestLap" | "lastLap" | "gap" | "interval" | "s1" | "s2" | "s3" | "speedTrap";

function gapSortValue(g: Gap): number {
  switch (g.kind) {
    case "leader":
      return -1;
    case "time":
      return g.seconds;
    case "laps":
      // Any lapped car is behind every car on the lead lap; more laps down sorts later.
      return 1e6 + g.laps * 1e4;
    case "none":
      return Number.POSITIVE_INFINITY;
  }
}

function keyValue(row: TimingRow, key: SortKey): number {
  const n = (v: number | null) => (v === null || !Number.isFinite(v) ? Number.POSITIVE_INFINITY : v);
  switch (key) {
    case "position":
      return n(row.position);
    case "bestLap":
      return n(row.bestLap.value);
    case "lastLap":
      return n(row.lastLap.value);
    case "gap":
      return gapSortValue(row.gap);
    case "interval":
      return gapSortValue(row.interval);
    case "s1":
      return n(row.sectors[0].value);
    case "s2":
      return n(row.sectors[1].value);
    case "s3":
      return n(row.sectors[2].value);
    case "speedTrap":
      // Fastest first.
      return row.speedTrap.value === null ? Number.POSITIVE_INFINITY : -row.speedTrap.value;
  }
}

/**
 * Sorts a copy of the rows. Sorting by position always reproduces the authoritative order supplied by the
 * provider (rows arrive in official order), so a race is never re-ranked by lap times. Unknown values sort last;
 * ties fall back to the official order so the result is stable.
 */
export function sortRows(rows: readonly TimingRow[], key: SortKey, direction: "asc" | "desc" = "asc"): TimingRow[] {
  const official = new Map(rows.map((r, i) => [r.driverNumber, i]));
  if (key === "position") {
    const copy = [...rows];
    return direction === "asc" ? copy : copy.reverse();
  }
  return [...rows].sort((a, b) => {
    const va = keyValue(a, key);
    const vb = keyValue(b, key);
    const aUnknown = !Number.isFinite(va);
    const bUnknown = !Number.isFinite(vb);
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
    if (va !== vb) return direction === "asc" ? va - vb : vb - va;
    return (official.get(a.driverNumber) ?? 0) - (official.get(b.driverNumber) ?? 0);
  });
}

/**
 * Race order from the timing line: more laps completed first, then whoever crossed the line earlier.
 * Live/historical providers use the source's position feed instead.
 */
export function raceOrder<T extends { driverNumber: number; lapsCompleted: number; lastCrossing: number | null; retired: boolean }>(cars: readonly T[]): T[] {
  return [...cars].sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (a.lapsCompleted !== b.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
    const ta = a.lastCrossing ?? Number.POSITIVE_INFINITY;
    const tb = b.lastCrossing ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.driverNumber - b.driverNumber;
  });
}

/** Instant at which a car reached `progress` laps, interpolating within a lap: crossings[L] is when lap L ended. */
export function timeAtProgress(crossings: readonly number[], progress: number): number | null {
  const lap = Math.floor(progress);
  const start = crossings[lap];
  if (start === undefined) return null;
  const end = crossings[lap + 1];
  const frac = progress - lap;
  if (end === undefined) return frac === 0 ? start : null;
  return start + frac * (end - start);
}

export interface ProgressCar {
  driverNumber: number;
  /** Laps completed plus the fraction of the current lap (by time). */
  progress: number;
  /** Instant the comparison is made at: now for running cars, the finish for finished cars. */
  at: number;
  retired: boolean;
}

/**
 * Gap and interval as "how long ago the reference car was where this car is now" — the way timing loops around
 * the lap measure it, so a car that pits loses time immediately rather than at its next line crossing. Cars a full
 * lap or more behind get a gap in laps. Ordered cars ahead always reached a point earlier, so values are never
 * negative.
 */
export function gapsFromProgress(ordered: readonly ProgressCar[], crossings: ReadonlyMap<number, readonly number[]>): Map<number, { gap: Gap; interval: Gap }> {
  const out = new Map<number, { gap: Gap; interval: Gap }>();
  const compare = (me: ProgressCar, ref: ProgressCar): Gap => {
    if (me.progress <= 0) return { kind: "none" };
    const lapsDown = Math.floor(ref.progress - me.progress + 1e-9);
    if (lapsDown >= 1) return { kind: "laps", laps: lapsDown };
    const refThere = timeAtProgress(crossings.get(ref.driverNumber) ?? [], me.progress);
    if (refThere === null) return { kind: "none" };
    return { kind: "time", seconds: Math.max(0, Math.round((me.at - refThere) * 1000) / 1000) };
  };
  const running = ordered.filter((c) => !c.retired);
  ordered.forEach((car) => {
    if (car.retired) {
      out.set(car.driverNumber, { gap: { kind: "none" }, interval: { kind: "none" } });
      return;
    }
    const i = running.indexOf(car);
    if (i === 0) {
      out.set(car.driverNumber, { gap: { kind: "leader" }, interval: { kind: "leader" } });
      return;
    }
    out.set(car.driverNumber, { gap: compare(car, running[0]!), interval: compare(car, running[i - 1]!) });
  });
  return out;
}

/** Parses a provider gap value: number of seconds, "+1 LAP", "+2 LAPS", or null. */
export function parseGapValue(raw: unknown, isLeader = false): Gap {
  if (isLeader) return { kind: "leader" };
  if (typeof raw === "number" && Number.isFinite(raw)) return { kind: "time", seconds: raw };
  if (typeof raw === "string") {
    const m = /^\+?\s*(\d+)\s*LAPS?$/i.exec(raw.trim());
    if (m) return { kind: "laps", laps: Number(m[1]) };
    const n = Number(raw.replace("+", ""));
    if (Number.isFinite(n) && raw.trim() !== "") return { kind: "time", seconds: n };
  }
  return { kind: "none" };
}

/** Gap to the fastest lap in timed sessions (practice/qualifying), the official convention for those sessions. */
export function bestLapGap(best: number | null, reference: number | null): Gap {
  if (best === null || reference === null) return { kind: "none" };
  const d = Math.round((best - reference) * 1000) / 1000;
  return d <= 0 ? { kind: "leader" } : { kind: "time", seconds: d };
}

// ---------------------------------------------------------------------------------------------
// Tyres and stints
// ---------------------------------------------------------------------------------------------

export function normaliseCompound(raw: string | null | undefined): Compound | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  if (c === "SOFT" || c === "MEDIUM" || c === "HARD" || c === "WET") return c;
  if (c === "INTERMEDIATE" || c === "INTER" || c === "INTERS") return "INTERMEDIATE";
  return null;
}

/** The stint covering a lap; the last stint is open-ended when its end lap is unknown. */
export function stintForLap(stints: readonly Stint[], lap: number): Stint | undefined {
  return stints.find((s) => lap >= s.lapStart && (s.lapEnd === null || lap <= s.lapEnd));
}

/**
 * Laps completed on the current set at the end of `lapsCompleted` laps. The starting age comes from the source;
 * the increment is derived from lap counting, so the result is labelled "derived".
 */
export function tyreAgeAt(stint: Stint | undefined, lapsCompleted: number): { age: number | null; basis: TyreAgeBasis } {
  if (!stint) return { age: null, basis: "unknown" };
  if (stint.tyreAgeAtStart === null) return { age: null, basis: "unknown" };
  const lapsOnSetThisStint = Math.max(0, lapsCompleted - stint.lapStart + 1);
  if (lapsOnSetThisStint === 0) return { age: stint.tyreAgeAtStart, basis: "sourced" };
  return { age: stint.tyreAgeAtStart + lapsOnSetThisStint, basis: "derived" };
}

export interface StintSummary extends Stint {
  laps: number | null;
}

/**
 * Sorts stints and fills their lap counts. An unknown end lap stays unknown unless the caller knows the
 * driver's total laps. Stints are never invented between known stints.
 */
export function summariseStints(stints: readonly Stint[], totalLapsForDriver: number | null): StintSummary[] {
  const sorted = [...stints].sort((a, b) => a.stint - b.stint || a.lapStart - b.lapStart);
  return sorted.map((s, i) => {
    const isLast = i === sorted.length - 1;
    const end = s.lapEnd ?? (isLast ? totalLapsForDriver : null);
    return { ...s, lapEnd: end, laps: end === null ? null : Math.max(0, end - s.lapStart + 1) };
  });
}

/**
 * Pit stops that coincide with a stint change. A pit stop with no following stint (e.g. a drive-through or a
 * repair stop) does not imply new tyres, so it is not reported as a tyre change.
 */
export function tyreChangeLaps(stints: readonly Stint[]): number[] {
  const sorted = [...stints].sort((a, b) => a.stint - b.stint);
  return sorted.slice(1).map((s) => s.lapStart - 1);
}

// ---------------------------------------------------------------------------------------------
// Laps
// ---------------------------------------------------------------------------------------------

export type LapFilter = "all" | "clean" | "pit" | "fastest";

/** "Clean" = complete, valid, not a pit in/out lap and not run under SC/VSC/red flag (when known). */
export function filterLaps(laps: readonly LapRecord[], filter: LapFilter): LapRecord[] {
  switch (filter) {
    case "all":
      return [...laps];
    case "clean":
      return laps.filter((l) => l.time !== null && l.valid !== false && !l.pitIn && !l.pitOut && l.neutralised !== true);
    case "pit":
      return laps.filter((l) => l.pitIn || l.pitOut);
    case "fastest":
      return laps.filter((l) => l.personalBest);
  }
}

/** Marks the single personal-best lap (first occurrence of the fastest valid time). */
export function markPersonalBests(laps: LapRecord[]): LapRecord[] {
  let best: LapRecord | null = null;
  for (const l of laps) {
    if (l.time === null || l.valid === false) continue;
    if (!best || l.time < (best.time as number)) best = l;
  }
  return laps.map((l) => ({ ...l, personalBest: best !== null && l === best }));
}

/** Checks that sector times add up to the lap time (± tolerance). Used by tests and the demo generator. */
export function sectorsConsistent(lap: Pick<LapRecord, "time" | "sectors">, toleranceSeconds = 0.0015): boolean {
  if (lap.time === null || lap.sectors.some((s) => s === null)) return true;
  const sum = (lap.sectors as number[]).reduce((a, b) => a + b, 0);
  return Math.abs(sum - lap.time) <= toleranceSeconds;
}

// ---------------------------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------------------------

export type Freshness = "fresh" | "stale" | "offline" | "static";

/**
 * Live data is stale when the newest source timestamp is older than `thresholdMs` while the session is running.
 * Historical and demo data are "static" — age is irrelevant. A failed last request makes the view "offline".
 */
export function freshness(args: {
  mode: "LIVE" | "HISTORICAL" | "DEMO" | "OFFLINE" | "UNAVAILABLE";
  lastSourceTimestamp: string | null;
  lastRequestFailed: boolean;
  now: number;
  thresholdMs: number;
}): Freshness {
  if (args.mode !== "LIVE") return args.lastRequestFailed ? "offline" : "static";
  if (args.lastRequestFailed) return "offline";
  if (!args.lastSourceTimestamp) return "stale";
  const t = Date.parse(args.lastSourceTimestamp);
  if (!Number.isFinite(t)) return "stale";
  return args.now - t > args.thresholdMs ? "stale" : "fresh";
}

/**
 * Accepts an incoming snapshot only if it is not older than what is already displayed. Protects against
 * delayed or out-of-order responses overwriting newer state.
 */
export function shouldAcceptUpdate(current: string | null, incoming: string | null): boolean {
  if (!incoming) return current === null;
  if (!current) return true;
  return Date.parse(incoming) >= Date.parse(current);
}
