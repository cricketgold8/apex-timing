import { bestTable, gapsFromProgress, markFor, markPersonalBests, speedMark, tyreAgeAt } from "@/lib/timing/calculations";
import { initialTrackStatus, applyRaceControl, sessionPhaseAt, toRaceControlMessage, type RawRaceControl } from "@/lib/timing/status";
import type {
  CarPosition,
  DriverRunState,
  LapRecord,
  PitStop,
  Provenance,
  RaceControlMessage,
  SectorCell,
  Sourced,
  Stint,
  TelemetryLap,
  TimingRow,
  TimingSnapshot,
  TrackGeometry,
  Weather,
} from "@/lib/timing/types";
import { demoCircuit, pointAtTimeFraction } from "./circuit";
import { gaussian } from "./random";
import { DEMO_EPOCH_MS, DEMO_SESSION_ID, RETIREMENT_FRACTION, demoRace, type DemoDriver, type DemoLap } from "./race";

/**
 * DemoTimingProvider: synthetic data only. Every dataset it returns carries mode "DEMO" and the provider name
 * "Apex demo generator"; it is never used as a fallback for a failed live or historical request.
 */

export const DEMO_PROVIDER = "Apex demo generator (synthetic)";

/** Simulated timing loops per lap at which gaps and order are refreshed. */
const TIMING_LOOPS = 8;

function provenance(t: number, notes: string[] = []): Provenance {
  return {
    provider: DEMO_PROVIDER,
    mode: "DEMO",
    sessionId: DEMO_SESSION_ID,
    sourceTimestamp: new Date(DEMO_EPOCH_MS + t * 1000).toISOString(),
    fetchedAt: new Date().toISOString(),
    completeness: "complete",
    notes: ["SIMULATED DATA — fictional race at a fictional circuit. Not a real Grand Prix.", ...notes],
  };
}

const at = (t: number) => new Date(DEMO_EPOCH_MS + t * 1000).toISOString();

export function demoTimeRange(): { start: number; end: number; chequered: number } {
  const race = demoRace();
  return { start: -120, end: race.endAt, chequered: race.chequeredAt };
}

/** Sim time at which the leader starts a given lap (used by the lap scrubber). */
export function demoTimeForLap(lap: number): number {
  const race = demoRace();
  if (lap <= 1) return 0;
  return Math.min(...race.drivers.map((d) => d.crossings[lap - 1] ?? Infinity));
}

function rawMessages(): Array<RawRaceControl & { lap: number | null; driverNumber: number | null; t: number }> {
  return demoRace().messages.map((m) => ({
    at: at(m.at),
    t: m.at,
    category: m.category,
    flag: m.flag,
    scope: m.scope,
    sector: m.sector,
    message: m.message,
    lap: m.lap,
    driverNumber: m.driverNumber,
  }));
}

function lapsDoneBy(d: DemoDriver, t: number): DemoLap[] {
  return d.laps.filter((l) => l.end <= t);
}

function currentLap(d: DemoDriver, t: number): DemoLap | null {
  if (d.retiredAt !== null && t >= d.retiredAt) return null;
  if (d.finishedAt !== null && t >= d.finishedAt) return null;
  return d.laps.find((l) => l.start <= t && l.end > t) ?? null;
}

const isDeleted = (l: DemoLap, t: number) => l.deletedAt !== null && l.deletedAt <= t;

export function demoSnapshot(t: number): Sourced<TimingSnapshot> {
  const race = demoRace();
  const circuit = demoCircuit();
  const drivers = race.drivers;

  // Bests over completed laps / sectors at time t.
  const lapEntries = drivers.flatMap((d) => lapsDoneBy(d, t).map((l) => ({ driverNumber: d.number, value: l.time, valid: !isDeleted(l, t), lap: l.lap })));
  const sectorEntries: Array<Array<{ driverNumber: number; value: number; valid: boolean }>> = [[], [], []];
  for (const d of drivers) {
    for (const l of d.laps) {
      if (l.start > t) break;
      let cursor = l.start;
      l.sectors.forEach((s, k) => {
        cursor += s;
        if (cursor <= t) sectorEntries[k]!.push({ driverNumber: d.number, value: s, valid: !isDeleted(l, t) });
      });
    }
  }
  const lapBests = bestTable(lapEntries);
  const sectorBests = sectorEntries.map((e) => bestTable(e));
  const speedEntries = drivers.flatMap((d) => lapsDoneBy(d, t).map((l) => ({ driverNumber: d.number, value: l.speedTrap })));

  // Order and gaps from on-track progress (laps completed + fraction of the current lap), as timing loops around
  // the lap would measure them; before the start, grid order.
  const cars = drivers.map((d) => {
    const done = d.crossings.filter((c, i) => i > 0 && c <= t).length;
    const retired = d.retiredAt !== null && t >= d.retiredAt;
    const finished = d.finishedAt !== null && t >= d.finishedAt;
    // Progress only advances at timing loops (TIMING_LOOPS per lap), and the comparison instant is when the car
    // passed its last loop — so a car's gap changes when it reaches a loop, not on every clock tick.
    let progress = done;
    let at = finished ? (d.finishedAt as number) : (d.crossings[done] ?? 0);
    const start = d.crossings[done];
    const end = d.crossings[done + 1];
    if (!finished && !retired && t >= 0 && start !== undefined && end !== undefined) {
      const loop = Math.floor(Math.min(0.999, Math.max(0, (t - start) / (end - start))) * TIMING_LOOPS);
      progress = done + loop / TIMING_LOOPS;
      at = start + (loop / TIMING_LOOPS) * (end - start);
    }
    return { d, driverNumber: d.number, lapsCompleted: done, progress, at, retired };
  });
  const ordered = [...cars].sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (t < 0) return a.d.grid - b.d.grid;
    if (a.progress !== b.progress) return b.progress - a.progress;
    if (a.at !== b.at) return a.at - b.at;
    return a.d.grid - b.d.grid;
  });
  const crossings = new Map(drivers.map((d) => [d.number, d.crossings]));
  const gaps = gapsFromProgress(ordered, crossings);
  const chequered = t >= race.chequeredAt;

  const rows: TimingRow[] = ordered.map((car, idx) => {
    const d = car.d;
    const done = lapsDoneBy(d, t);
    const last = done[done.length - 1] ?? null;
    const cur = currentLap(d, t);
    const sectors: [SectorCell, SectorCell, SectorCell] = [
      { value: null, mark: null, current: false },
      { value: null, mark: null, current: false },
      { value: null, mark: null, current: false },
    ];
    if (cur) {
      let cursor = cur.start;
      cur.sectors.forEach((s, k) => {
        cursor += s;
        if (cursor <= t) sectors[k] = { value: s, mark: markFor(s, d.number, sectorBests[k]!, !isDeleted(cur, t)), current: true };
      });
    }
    if (last) {
      last.sectors.forEach((s, k) => {
        if (sectors[k]!.value === null) sectors[k] = { value: s, mark: markFor(s, d.number, sectorBests[k]!, !isDeleted(last, t)), current: false };
      });
    }
    const best = lapBests.personal.get(d.number) ?? null;
    const bestLap = lapEntries.find((e) => e.driverNumber === d.number && e.valid && e.value === best)?.lap ?? null;
    const lapsCompleted = car.lapsCompleted;
    const lapForTyre = cur?.lap ?? last?.lap ?? 1;
    const stint = d.stints.find((s) => lapForTyre >= s.lapStart && lapForTyre <= s.lapEnd) ?? d.stints[0];
    const age = tyreAgeAt(
      stint ? { driverNumber: d.number, stint: stint.stint, compound: stint.compound, lapStart: stint.lapStart, lapEnd: stint.lapEnd, tyreAgeAtStart: stint.tyreAgeAtStart } : undefined,
      lapsCompleted,
    );
    const pitsDone = d.pits.filter((p) => p.entry <= t);
    const inPit = d.pits.some((p) => t >= p.entry && t <= p.exit);
    let state: DriverRunState = "RUNNING";
    if (car.retired) state = "RETIRED";
    else if (d.finishedAt !== null && t >= d.finishedAt) state = "FINISHED";
    else if (inPit) state = "PIT";
    else if (cur?.pitOut) state = "OUT";
    else if (t < 0) state = "UNKNOWN";
    const g = gaps.get(d.number) ?? { gap: { kind: "none" as const }, interval: { kind: "none" as const } };
    return {
      driverNumber: d.number,
      code: d.code,
      name: d.name,
      teamId: d.teamId,
      teamColour: d.colour,
      position: car.retired ? null : idx + 1,
      positionChange: car.retired ? null : d.grid - (idx + 1),
      lapsCompleted,
      currentLap: cur?.lap ?? null,
      lastLap: { value: last?.time ?? null, mark: last ? markFor(last.time, d.number, lapBests, !isDeleted(last, t)) : null },
      bestLap: { value: best, mark: markFor(best, d.number, lapBests), lap: bestLap },
      gap: t < 0 ? { kind: "none" } : g.gap,
      interval: t < 0 ? { kind: "none" } : g.interval,
      sectors,
      speedTrap: { value: last?.speedTrap ?? null, mark: speedMark(last?.speedTrap ?? null, d.number, speedEntries) },
      tyre: { compound: stint?.compound ?? null, age: age.age, ageBasis: age.basis, stintNumber: stint?.stint ?? null },
      pitStops: pitsDone.length,
      state,
      qualifying: null,
    };
  });

  // Track status from the same state machine used for real race control.
  const msgs = rawMessages();
  let track = initialTrackStatus();
  for (const m of msgs) if (m.t <= t) track = applyRaceControl(track, m);
  const phase = sessionPhaseAt(msgs, at(t));
  const leader = ordered[0];
  const bestLapEntry = lapEntries.filter((e) => e.valid).sort((a, b) => a.value - b.value)[0];

  const snapshot: TimingSnapshot = {
    session: {
      id: DEMO_SESSION_ID,
      eventName: "Demo Grand Prix",
      circuitName: circuit.name,
      country: "Fictional venue",
      type: "RACE",
      name: "Race (simulated)",
      scheduledStart: null,
      scheduledEnd: null,
      timeZone: "UTC",
      totalLaps: race.totalLaps,
      qualifyingPhase: null,
    },
    rows,
    orderBasis: "race-position",
    positionReference: "grid",
    bests: {
      lap: bestLapEntry ? { driverNumber: bestLapEntry.driverNumber, time: bestLapEntry.value, lap: bestLapEntry.lap } : null,
      sectors: [sectorBests[0]!.session, sectorBests[1]!.session, sectorBests[2]!.session],
      speedTrap: speedEntries.reduce<number | null>((m, e) => (m === null || e.value > m ? e.value : m), null),
    },
    trackStatus: track,
    phase: phase.phase,
    leaderLap: leader ? Math.min(race.totalLaps, leader.lapsCompleted + (chequered ? 0 : 1)) : null,
    clock: { elapsed: Math.max(0, t), remaining: null, basis: "simulation" },
    weather: demoWeather(t),
    asOf: at(t),
    replay: null,
  };
  return { data: snapshot, provenance: provenance(t) };
}

function demoWeather(t: number): Weather {
  return {
    airTempC: Math.round((24.2 + 0.6 * Math.sin(t / 2400)) * 10) / 10,
    trackTempC: Math.round((38.5 + 1.8 * Math.sin(t / 3000)) * 10) / 10,
    humidityPct: 48,
    pressureMbar: 1012.4,
    rainfall: false,
    windSpeedMs: 2.1,
    windDirectionDeg: 215,
    observedAt: at(Math.floor(t / 60) * 60),
  };
}

export function demoLapHistory(driverNumber: number, t: number): Sourced<LapRecord[]> {
  const d = demoRace().drivers.find((x) => x.number === driverNumber);
  const laps: LapRecord[] = (d ? lapsDoneBy(d, t) : []).map((l) => ({
    driverNumber,
    lap: l.lap,
    startedAt: at(l.start),
    time: l.time,
    sectors: l.sectors,
    speedTrap: l.speedTrap,
    compound: l.compound,
    tyreAge: l.tyreAge,
    tyreAgeBasis: "sourced",
    pitIn: l.pitIn,
    pitOut: l.pitOut,
    valid: !isDeleted(l, t),
    deletedReason: isDeleted(l, t) ? l.deletedReason : null,
    personalBest: false,
    neutralised: l.neutralised,
  }));
  return { data: markPersonalBests(laps), provenance: provenance(t) };
}

export function demoStints(t: number): Sourced<{ stints: Stint[]; pits: PitStop[]; lapsCompleted: Record<number, number> }> {
  const race = demoRace();
  const stints: Stint[] = [];
  const pits: PitStop[] = [];
  const lapsCompleted: Record<number, number> = {};
  for (const d of race.drivers) {
    const done = lapsDoneBy(d, t).length;
    const current = currentLap(d, t)?.lap ?? done;
    lapsCompleted[d.number] = done;
    for (const s of d.stints) {
      if (s.lapStart > Math.max(1, current)) continue;
      const open = current <= s.lapEnd && !(d.finishedAt !== null && t >= d.finishedAt) && !(d.retiredAt !== null && t >= d.retiredAt);
      stints.push({ driverNumber: d.number, stint: s.stint, compound: s.compound, lapStart: s.lapStart, lapEnd: open ? null : s.lapEnd, tyreAgeAtStart: s.tyreAgeAtStart });
    }
    for (const p of d.pits) if (p.entry <= t) pits.push({ driverNumber: d.number, lap: p.lap, at: at(p.entry), laneDuration: Math.round((p.exit - p.entry) * 10) / 10, stopDuration: p.stationary });
  }
  return { data: { stints, pits, lapsCompleted }, provenance: provenance(t) };
}

export function demoRaceControl(t: number): Sourced<RaceControlMessage[]> {
  const msgs = rawMessages()
    .filter((m) => m.t <= t)
    .map((m, i) => toRaceControlMessage(m, DEMO_SESSION_ID, i, "DEMO — fictional"))
    .reverse();
  return { data: msgs, provenance: provenance(t) };
}

export function demoTrack(t: number): Sourced<{ geometry: TrackGeometry; cars: CarPosition[] }> {
  const race = demoRace();
  const circuit = demoCircuit();
  const cars: CarPosition[] = [];
  for (const d of race.drivers) {
    let fraction: number | null = null;
    if (d.retiredAt !== null && t >= d.retiredAt) {
      // Stationary where the car stopped (the simulator retires it 46% of the way round its lap).
      fraction = RETIREMENT_FRACTION;
    } else if (d.finishedAt !== null && t >= d.finishedAt) {
      fraction = Math.min(0.25, (t - d.finishedAt) / (circuit.referenceLapTime * 2.2));
    } else if (t < 0) {
      fraction = 1 - d.grid * 0.0016;
    } else {
      const cur = d.laps.find((l) => l.start <= t && l.end > t);
      if (cur) fraction = (t - cur.start) / cur.time;
    }
    if (fraction === null) continue;
    const p = pointAtTimeFraction(circuit, fraction);
    cars.push({ driverNumber: d.number, x: p.x, y: p.y, at: at(t) });
  }
  return {
    data: { geometry: { outline: circuit.outline, sectorBoundaries: circuit.sectorBoundaryIndices, basis: "Fictional demo circuit" }, cars },
    provenance: provenance(t, ["Car positions are interpolated from simulated lap progress."]),
  };
}

export function demoTelemetry(driverNumber: number, lap: number): Sourced<TelemetryLap> | null {
  const d = demoRace().drivers.find((x) => x.number === driverNumber);
  const l = d?.laps.find((x) => x.lap === lap);
  if (!d || !l) return null;
  const circuit = demoCircuit();
  const scale = circuit.referenceLapTime / l.time;
  const step = 0.1; // 10 Hz
  const samples = [];
  let idx = 0;
  const pts = circuit.points;
  for (let tt = 0; tt <= l.time; tt += step) {
    const refT = tt * scale;
    while (idx < pts.length - 1 && pts[idx + 1]!.t <= refT) idx++;
    const p = pts[idx]!;
    const wobble = gaussian(driverNumber, lap, idx, "tel") * 1.4;
    // Interpolate within the 4 m profile step so distance is smooth and strictly increasing.
    const distance = p.distance + (refT - p.t) * (p.speedKmh / 3.6);
    samples.push({
      distance: Math.round(distance * 10) / 10,
      t: Math.round(tt * 1000) / 1000,
      speedKmh: Math.max(0, Math.round((p.speedKmh * scale + wobble) * 10) / 10),
      throttlePct: Math.max(0, Math.min(100, Math.round(p.throttlePct + (p.throttlePct < 100 ? wobble * 2 : 0)))),
      brake: p.brake,
      gear: p.gear,
      rpm: Math.round(p.rpm + wobble * 30),
    });
  }
  return {
    data: { driverNumber, lap, lapTime: l.time, samples, channels: ["speed", "throttle", "brake", "gear", "rpm"], distanceBasis: "simulated", sampleRateHz: 10 },
    provenance: provenance(l.end, ["Telemetry is a synthetic trace derived from the fictional circuit's speed profile."]),
  };
}

export function demoDrivers(): Array<{ driverNumber: number; code: string; name: string; teamId: string; colour: string; laps: number }> {
  return demoRace().drivers.map((d) => ({ driverNumber: d.number, code: d.code, name: d.name, teamId: d.teamId, colour: d.colour, laps: d.laps.length }));
}
