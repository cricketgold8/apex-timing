import { DRIVERS_2026 } from "@/lib/config/drivers-2026";
import { TEAMS_2026, type TeamId } from "@/lib/config/teams-2026";
import type { Compound } from "@/lib/timing/types";
import { demoCircuit } from "./circuit";
import { gaussian, uniform } from "./random";

/**
 * Deterministic synthetic race used by DEMO mode. Everything is computed up front from a fixed seed, so the
 * classification at any instant is a pure function of time: replaying, pausing or scrubbing can never create a
 * contradictory history. Positions come from timing-line crossings and gaps from crossing-time differences.
 *
 * None of this represents a real event: the venue is fictional and every message is labelled DEMO.
 */

export const DEMO_SEED = 2026;
export const DEMO_TOTAL_LAPS = 52;
export const DEMO_SESSION_ID = "demo-race";
/** Fixed fictional epoch for timestamps inside the demo (displayed as elapsed time, never as a date). */
export const DEMO_EPOCH_MS = Date.UTC(2026, 0, 1, 12, 0, 0);
/** How far round its lap the fictional retirement happens. */
export const RETIREMENT_FRACTION = 0.46;

export interface DemoLap {
  lap: number;
  start: number;
  end: number;
  time: number;
  sectors: [number, number, number];
  speedTrap: number;
  compound: Compound;
  tyreAge: number;
  pitIn: boolean;
  pitOut: boolean;
  /** Instant at which race control deleted the lap, if it was deleted. */
  deletedAt: number | null;
  deletedReason: string | null;
  neutralised: boolean;
}

export interface DemoStint {
  stint: number;
  compound: Compound;
  lapStart: number;
  lapEnd: number;
  tyreAgeAtStart: number;
}

export interface DemoPit {
  lap: number;
  entry: number;
  exit: number;
  stationary: number;
}

export interface DemoDriver {
  number: number;
  code: string;
  name: string;
  teamId: TeamId;
  colour: string;
  grid: number;
  /** crossings[0] is the start; crossings[L] is when lap L was completed. */
  crossings: number[];
  laps: DemoLap[];
  stints: DemoStint[];
  pits: DemoPit[];
  retiredAt: number | null;
  retiredOnLap: number | null;
  finishedAt: number | null;
}

export interface DemoMessage {
  at: number;
  lap: number | null;
  category: "SessionStatus" | "Flag" | "SafetyCar" | "Other";
  flag: string | null;
  scope: string | null;
  sector: number | null;
  driverNumber: number | null;
  message: string;
}

export interface DemoRace {
  totalLaps: number;
  drivers: DemoDriver[];
  messages: DemoMessage[];
  vsc: [number, number];
  chequeredAt: number;
  endAt: number;
}

// Relative pace (seconds per lap) — fictional, chosen only to give a plausible spread.
const TEAM_PACE: Record<TeamId, number> = {
  mercedes: 0,
  ferrari: 0.18,
  red_bull: 0.27,
  mclaren: 0.31,
  racing_bulls: 0.78,
  alpine: 0.86,
  haas: 0.95,
  audi: 1.06,
  williams: 1.12,
  aston_martin: 1.24,
  cadillac: 1.58,
};

const COMPOUND: Record<"SOFT" | "MEDIUM" | "HARD", { offset: number; deg: number; cliff: number }> = {
  SOFT: { offset: -0.62, deg: 0.085, cliff: 20 },
  MEDIUM: { offset: 0, deg: 0.052, cliff: 32 },
  HARD: { offset: 0.42, deg: 0.034, cliff: 45 },
};

type Plan = Array<{ compound: "SOFT" | "MEDIUM" | "HARD"; until: number | null }>;

function strategyFor(driver: number, grid: number): Plan {
  const u = uniform(DEMO_SEED, "strategy", driver);
  const jitter = (k: string, span: number) => Math.round((uniform(DEMO_SEED, k, driver) - 0.5) * span);
  if (grid <= 8 && u < 0.7) return [{ compound: "MEDIUM", until: 24 + jitter("p1", 6) }, { compound: "HARD", until: null }];
  if (u < 0.32) return [{ compound: "SOFT", until: 15 + jitter("p1", 4) }, { compound: "HARD", until: 35 + jitter("p2", 4) }, { compound: "MEDIUM", until: null }];
  if (grid >= 14 && u > 0.5) return [{ compound: "HARD", until: 31 + jitter("p1", 6) }, { compound: "MEDIUM", until: null }];
  return [{ compound: "MEDIUM", until: 22 + jitter("p1", 6) }, { compound: "HARD", until: null }];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

interface SimOptions {
  vsc: [number, number] | null;
  retirement: { driver: number; lap: number; fraction: number };
}

function simulate(opts: SimOptions): { drivers: DemoDriver[]; retiredAt: number | null } {
  const circuit = demoCircuit();
  const ref = circuit.referenceLapTime + 3.2; // race trim vs. the theoretical profile

  // Grid from a fictional qualifying pace.
  const quali = DRIVERS_2026.map((d) => ({
    d,
    pace: TEAM_PACE[d.teamId] + gaussian(DEMO_SEED, "driver", d.number) * 0.16 + gaussian(DEMO_SEED, "quali", d.number) * 0.1,
  })).sort((a, b) => a.pace - b.pace);

  const drivers: DemoDriver[] = quali.map((q, i) => ({
    number: q.d.number,
    code: q.d.code,
    name: q.d.displayName,
    teamId: q.d.teamId,
    colour: TEAMS_2026[q.d.teamId].colour,
    grid: i + 1,
    crossings: [i * 0.21],
    laps: [],
    stints: [],
    pits: [],
    retiredAt: null,
    retiredOnLap: null,
    finishedAt: null,
  }));
  const racePace = new Map(quali.map((q) => [q.d.number, TEAM_PACE[q.d.teamId] + gaussian(DEMO_SEED, "driver", q.d.number) * 0.16]));
  const plans = new Map(drivers.map((d) => [d.number, strategyFor(d.number, d.grid)]));
  const state = new Map(drivers.map((d) => [d.number, { stint: 0, age: 0, active: true }]));
  let retiredAt: number | null = null;

  const vscExtra = (start: number, nominal: number): number => {
    if (!opts.vsc) return 0;
    const [a, b] = opts.vsc;
    let extra = 0;
    for (let k = 0; k < 4; k++) {
      const overlap = Math.max(0, Math.min(start + nominal + extra, b) - Math.max(start, a));
      extra = overlap * 0.42;
    }
    return extra;
  };

  let order = [...drivers];
  for (let lap = 1; lap <= DEMO_TOTAL_LAPS; lap++) {
    const provisional: Array<{ d: DemoDriver; cross: number; parts: { base: number; s1x: number; s3x: number; vsc: number }; pitIn: boolean; pitOut: boolean; compound: Compound; age: number; pace: number }> = [];
    for (const d of order) {
      const st = state.get(d.number)!;
      if (!st.active) continue;
      const plan = plans.get(d.number)!;
      const stintPlan = plan[st.stint]!;
      const pitIn = stintPlan.until !== null && lap === stintPlan.until;
      const prevLap = d.laps[d.laps.length - 1];
      const pitOut = Boolean(prevLap?.pitIn);
      const age = st.age + 1;
      const c = COMPOUND[stintPlan.compound];
      const fuel = 2.4 * (1 - (lap - 1) / DEMO_TOTAL_LAPS);
      const deg = c.deg * age + (age > c.cliff ? 0.09 * (age - c.cliff) ** 1.3 : 0);
      const noise = gaussian(DEMO_SEED, "lap", d.number, lap) * 0.17;
      const pace = racePace.get(d.number)!;
      let base = ref + pace + fuel + c.offset + deg + noise;
      if (lap === 1) base += 2.6 + Math.abs(gaussian(DEMO_SEED, "start", d.number)) * 0.5;
      const s1x = pitOut ? 15.2 + (d.pits[d.pits.length - 1]?.stationary ?? 2.4) : 0;
      const s3x = pitIn ? 6.4 : 0;
      const start = d.crossings[lap - 1]!;
      const nominal = base + s1x + s3x;
      if (d.number === opts.retirement.driver && lap === opts.retirement.lap) {
        // Stops on track part-way round; measured on nominal pace so the instant does not depend on the VSC it triggers.
        d.retiredAt = round3(start + nominal * opts.retirement.fraction);
        d.retiredOnLap = lap;
        retiredAt = d.retiredAt;
        st.active = false;
        continue;
      }
      const vsc = vscExtra(start, nominal);
      provisional.push({ d, cross: start + nominal + vsc, parts: { base, s1x, s3x, vsc }, pitIn, pitOut, compound: stintPlan.compound, age, pace: base });
    }

    // Traffic: a following car cannot pass unless clearly faster; it is held 0.35–0.75 s behind instead.
    for (let i = 1; i < provisional.length; i++) {
      const ahead = provisional[i - 1]!;
      const me = provisional[i]!;
      if (me.pitIn || me.pitOut || ahead.pitIn || ahead.pitOut || me.parts.vsc > 0) continue;
      const minGap = 0.35 + uniform(DEMO_SEED, "hold", me.d.number, lap) * 0.4;
      if (me.cross < ahead.cross + minGap) {
        const advantage = ahead.pace - me.pace;
        const passes = advantage > 0.75 || (advantage > 0.35 && uniform(DEMO_SEED, "pass", me.d.number, lap) < 0.3);
        if (passes && me.cross < ahead.cross - 0.05) {
          // Clean pass; the defender loses a little time.
          ahead.cross += 0.22;
          ahead.parts.base += 0.22;
          if (me.cross > ahead.cross - 0.15) {
            const shift = me.cross - (ahead.cross - 0.15);
            me.cross -= shift;
            me.parts.base -= shift;
          }
        } else {
          const held = ahead.cross + minGap - me.cross;
          me.cross += held;
          me.parts.base += held;
        }
      }
      // Keep the provisional list ordered by crossing so the next comparison is against the car physically ahead.
      for (let j = i; j > 0 && provisional[j]!.cross < provisional[j - 1]!.cross; j--) {
        [provisional[j - 1], provisional[j]] = [provisional[j]!, provisional[j - 1]!];
      }
    }

    provisional.sort((a, b) => a.cross - b.cross);
    for (const p of provisional) {
      const d = p.d;
      const st = state.get(d.number)!;
      const start = d.crossings[lap - 1]!;
      const time = round3(p.cross - start);
      const [f1, f2] = demoCircuit().sectorTimeFractions;
      const baseCore = time - p.parts.s1x - p.parts.s3x;
      const s1 = round3(baseCore * f1 + p.parts.s1x + gaussian(DEMO_SEED, "s1", d.number, lap) * 0.04);
      const s2 = round3(baseCore * (f2 - f1) + gaussian(DEMO_SEED, "s2", d.number, lap) * 0.04);
      const s3 = round3(time - s1 - s2);
      // Top speed falls with the car's pace deficit (seconds per lap), plus a little noise.
      const trap = Math.round(circuit.points[circuit.speedTrapIndex]!.speedKmh - racePace.get(d.number)! * 5 + gaussian(DEMO_SEED, "st", d.number, lap) * 2.2 + (p.compound === "SOFT" ? 0 : -1));
      const end = round3(start + time);
      d.crossings.push(end);
      d.laps.push({
        lap,
        start,
        end,
        time,
        sectors: [s1, s2, s3],
        speedTrap: trap,
        compound: p.compound,
        tyreAge: p.age,
        pitIn: p.pitIn,
        pitOut: p.pitOut,
        deletedAt: null,
        deletedReason: null,
        neutralised: p.parts.vsc > 0,
      });
      st.age = p.age;
      if (p.pitIn) {
        const stationary = round3(2.1 + uniform(DEMO_SEED, "stop", d.number, lap) * 1.1);
        d.pits.push({ lap, entry: round3(end - 6.4 - 4.8), exit: round3(end + 15.2 + stationary - 3.6), stationary });
        st.stint += 1;
        st.age = 0;
      }
    }
    order = provisional.filter((p) => state.get(p.d.number)!.active).map((p) => p.d);
  }

  // Stints from the laps actually driven.
  for (const d of drivers) {
    for (const l of d.laps) {
      const current = d.stints[d.stints.length - 1];
      if (!current || l.pitOut) d.stints.push({ stint: d.stints.length + 1, compound: l.compound, lapStart: l.lap, lapEnd: l.lap, tyreAgeAtStart: 0 });
      else current.lapEnd = l.lap;
    }
    const last: DemoStint | undefined = d.stints[d.stints.length - 1];
    if (d.retiredOnLap !== null && last) last.lapEnd = d.retiredOnLap;
  }
  return { drivers, retiredAt };
}

let cachedRace: DemoRace | null = null;

export function demoRace(): DemoRace {
  if (cachedRace) return cachedRace;
  const retirement = { driver: 31, lap: 23, fraction: RETIREMENT_FRACTION };
  const first = simulate({ vsc: null, retirement });
  const retiredAt = first.retiredAt ?? 1800;
  const vsc: [number, number] = [round3(retiredAt + 9), round3(retiredAt + 9 + 96)];
  const { drivers } = simulate({ vsc, retirement });

  // Chequered flag: when the leader completes the final lap. Everyone else finishes on their next crossing.
  const leaderFinish = Math.min(...drivers.filter((d) => d.laps.length === DEMO_TOTAL_LAPS).map((d) => d.crossings[DEMO_TOTAL_LAPS]!));
  for (const d of drivers) {
    if (d.retiredAt !== null) continue;
    const idx = d.crossings.findIndex((c, i) => i > 0 && c >= leaderFinish);
    if (idx > 0) {
      d.finishedAt = d.crossings[idx]!;
      d.crossings = d.crossings.slice(0, idx + 1);
      d.laps = d.laps.slice(0, idx);
      const last = d.stints[d.stints.length - 1];
      if (last) last.lapEnd = Math.min(last.lapEnd, idx);
      d.stints = d.stints.filter((s) => s.lapStart <= idx);
      d.pits = d.pits.filter((p) => p.lap <= idx);
    }
  }

  // Fictional track-limit deletions: these laps keep their race time but cannot count as a best lap.
  const deletions: Array<{ driver: number; lap: number; turn: number }> = [
    { driver: 44, lap: 9, turn: 4 },
    { driver: 43, lap: 17, turn: 11 },
    { driver: 63, lap: 38, turn: 4 },
  ];
  const messages: DemoMessage[] = [];
  const msg = (m: Omit<DemoMessage, "message"> & { message: string }) => messages.push({ ...m, message: `[DEMO] ${m.message}` });

  msg({ at: -900, lap: null, category: "Flag", flag: "GREEN", scope: "Track", sector: null, driverNumber: null, message: "GREEN LIGHT - PIT EXIT OPEN" });
  msg({ at: -300, lap: null, category: "Other", flag: null, scope: null, sector: null, driverNumber: null, message: "PIT EXIT CLOSED" });
  msg({ at: 0, lap: 1, category: "SessionStatus", flag: null, scope: null, sector: null, driverNumber: null, message: "SESSION STARTED" });
  msg({ at: 12, lap: 1, category: "Other", flag: null, scope: null, sector: null, driverNumber: null, message: "PIT EXIT OPEN" });

  for (const del of deletions) {
    const d = drivers.find((x) => x.number === del.driver);
    const lap = d?.laps.find((l) => l.lap === del.lap);
    if (!d || !lap) continue;
    lap.deletedAt = round3(lap.end + 21);
    lap.deletedReason = `TRACK LIMITS AT TURN ${del.turn}`;
    const t = formatLap(lap.time);
    msg({ at: lap.deletedAt, lap: del.lap + 1, category: "Other", flag: null, scope: null, sector: null, driverNumber: d.number, message: `CAR ${d.number} (${d.code}) TIME ${t} DELETED - TRACK LIMITS AT TURN ${del.turn} LAP ${del.lap} — FICTIONAL EXAMPLE` });
  }

  const retired = drivers.find((d) => d.retiredAt !== null)!;
  const leaderLapAt = (t: number) => Math.max(...drivers.map((d) => d.crossings.filter((c) => c <= t).length));
  msg({ at: retiredAt + 4, lap: leaderLapAt(retiredAt), category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", sector: 9, driverNumber: null, message: "DOUBLE YELLOW IN TRACK SECTOR 9" });
  msg({ at: retiredAt + 6, lap: leaderLapAt(retiredAt), category: "Other", flag: null, scope: null, sector: null, driverNumber: retired.number, message: `CAR ${retired.number} (${retired.code}) STOPPED ON TRACK AT TURN 9 — FICTIONAL EXAMPLE` });
  msg({ at: vsc[0], lap: leaderLapAt(vsc[0]), category: "SafetyCar", flag: null, scope: "Track", sector: null, driverNumber: null, message: "VIRTUAL SAFETY CAR DEPLOYED" });
  msg({ at: vsc[1] - 14, lap: leaderLapAt(vsc[1]), category: "SafetyCar", flag: null, scope: "Track", sector: null, driverNumber: null, message: "VIRTUAL SAFETY CAR ENDING" });
  msg({ at: vsc[1], lap: leaderLapAt(vsc[1]), category: "Flag", flag: "CLEAR", scope: "Track", sector: null, driverNumber: null, message: "TRACK CLEAR" });
  msg({ at: vsc[1] + 1, lap: leaderLapAt(vsc[1]), category: "Flag", flag: "CLEAR", scope: "Sector", sector: 9, driverNumber: null, message: "CLEAR IN TRACK SECTOR 9" });

  const yAt = drivers[0]!.crossings[33] ?? 2900;
  msg({ at: yAt + 40, lap: 34, category: "Flag", flag: "YELLOW", scope: "Sector", sector: 4, driverNumber: null, message: "YELLOW IN TRACK SECTOR 4" });
  msg({ at: yAt + 58, lap: 34, category: "Flag", flag: "CLEAR", scope: "Sector", sector: 4, driverNumber: null, message: "CLEAR IN TRACK SECTOR 4" });
  msg({ at: yAt + 75, lap: 34, category: "Other", flag: null, scope: null, sector: null, driverNumber: null, message: "TURN 6 INCIDENT INVOLVING CARS 23 (ALB) AND 55 (SAI) NOTED - FICTIONAL EXAMPLE" });
  msg({ at: yAt + 260, lap: 37, category: "Other", flag: null, scope: null, sector: null, driverNumber: null, message: "TURN 6 INCIDENT INVOLVING CARS 23 (ALB) AND 55 (SAI) REVIEWED NO FURTHER INVESTIGATION - FICTIONAL EXAMPLE" });

  msg({ at: leaderFinish, lap: DEMO_TOTAL_LAPS, category: "Flag", flag: "CHEQUERED", scope: "Track", sector: null, driverNumber: null, message: "CHEQUERED FLAG" });
  const allIn = Math.max(...drivers.map((d) => d.finishedAt ?? 0));
  msg({ at: allIn + 2, lap: DEMO_TOTAL_LAPS, category: "SessionStatus", flag: null, scope: null, sector: null, driverNumber: null, message: "SESSION FINISHED" });
  messages.sort((a, b) => a.at - b.at);

  cachedRace = { totalLaps: DEMO_TOTAL_LAPS, drivers, messages, vsc, chequeredAt: leaderFinish, endAt: allIn + 30 };
  return cachedRace;
}

function formatLap(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}
