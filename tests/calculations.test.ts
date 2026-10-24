import { describe, expect, it } from "vitest";
import {
  bestLapGap,
  bestTable,
  filterLaps,
  freshness,
  gapsFromProgress,
  markFor,
  normaliseCompound,
  parseGapValue,
  raceOrder,
  sectorsConsistent,
  shouldAcceptUpdate,
  sortRows,
  speedMark,
  stintForLap,
  timeAtProgress,
  summariseStints,
  tyreAgeAt,
  tyreChangeLaps,
} from "@/lib/timing/calculations";
import type { LapRecord, Stint, TimingRow } from "@/lib/timing/types";

function row(driverNumber: number, patch: Partial<TimingRow> = {}): TimingRow {
  return {
    driverNumber,
    code: `D${driverNumber}`,
    name: `Driver ${driverNumber}`,
    teamId: null,
    teamColour: "#888888",
    position: null,
    positionChange: null,
    lapsCompleted: null,
    currentLap: null,
    lastLap: { value: null, mark: null },
    bestLap: { value: null, mark: null, lap: null },
    gap: { kind: "none" },
    interval: { kind: "none" },
    sectors: [
      { value: null, mark: null, current: false },
      { value: null, mark: null, current: false },
      { value: null, mark: null, current: false },
    ],
    speedTrap: { value: null, mark: null },
    tyre: { compound: null, age: null, ageBasis: "unknown", stintNumber: null },
    pitStops: null,
    state: "RUNNING",
    qualifying: null,
    ...patch,
  };
}

describe("sector-best detection", () => {
  const entries = [
    { driverNumber: 1, value: 28.5, valid: true },
    { driverNumber: 1, value: 28.2, valid: true },
    { driverNumber: 44, value: 28.1, valid: false }, // deleted: must not set the session best
    { driverNumber: 44, value: 28.3, valid: true },
    { driverNumber: 16, value: 28.25, valid: true },
  ];
  const table = bestTable(entries);

  it("ignores deleted values when finding bests", () => {
    expect(table.session).toBe(28.2);
    expect(table.personal.get(44)).toBe(28.3);
  });

  it("marks purple only for the session best", () => {
    expect(markFor(28.2, 1, table)).toBe("session-best");
    expect(markFor(28.2000001, 1, table)).toBe("session-best"); // millisecond equality
  });

  it("marks green for a personal best that is not the session best", () => {
    expect(markFor(28.3, 44, table)).toBe("personal-best");
    expect(markFor(28.25, 16, table)).toBe("personal-best");
  });

  it("marks other completed values as normal and deleted values as invalid", () => {
    expect(markFor(28.5, 1, table)).toBe("normal");
    expect(markFor(28.1, 44, table, false)).toBe("invalid");
  });

  it("returns no mark for missing values", () => {
    expect(markFor(null, 1, table)).toBeNull();
    expect(markFor(0, 1, table)).toBeNull();
  });

  it("treats the highest speed-trap value as best", () => {
    const st = [
      { driverNumber: 1, value: 320 },
      { driverNumber: 1, value: 318 },
      { driverNumber: 3, value: 325 },
    ];
    expect(speedMark(325, 3, st)).toBe("session-best");
    expect(speedMark(320, 1, st)).toBe("personal-best");
    expect(speedMark(318, 1, st)).toBe("normal");
  });
});

describe("position ordering", () => {
  const rows = [
    row(3, { position: 1, bestLap: { value: 96.2, mark: null, lap: 40 }, gap: { kind: "leader" } }),
    row(16, { position: 2, bestLap: { value: 95.2, mark: null, lap: 41 }, gap: { kind: "time", seconds: 7.3 } }),
    row(77, { position: 3, bestLap: { value: null, mark: null, lap: null }, gap: { kind: "laps", laps: 1 } }),
    row(12, { position: 4, bestLap: { value: 95.5, mark: null, lap: 10 }, gap: { kind: "time", seconds: 24.5 } }),
  ];

  it("keeps the authoritative order when sorting by position", () => {
    expect(sortRows(rows, "position").map((r) => r.driverNumber)).toEqual([3, 16, 77, 12]);
  });

  it("does not re-rank a race by lap time unless asked", () => {
    expect(sortRows(rows, "position")[0]?.driverNumber).toBe(3);
    expect(sortRows(rows, "bestLap").map((r) => r.driverNumber)).toEqual([16, 12, 3, 77]);
  });

  it("puts unknown values last regardless of direction", () => {
    expect(sortRows(rows, "bestLap", "desc").at(-1)?.driverNumber).toBe(77);
  });

  it("orders lapped cars behind every lead-lap car when sorting by gap", () => {
    expect(sortRows(rows, "gap").map((r) => r.driverNumber)).toEqual([3, 16, 12, 77]);
  });

  it("orders a race from timing-line crossings", () => {
    const order = raceOrder([
      { driverNumber: 1, lapsCompleted: 10, lastCrossing: 900.5, retired: false },
      { driverNumber: 2, lapsCompleted: 11, lastCrossing: 990.1, retired: false },
      { driverNumber: 3, lapsCompleted: 10, lastCrossing: 899.9, retired: false },
      { driverNumber: 4, lapsCompleted: 12, lastCrossing: 1000, retired: true },
    ]);
    expect(order.map((c) => c.driverNumber)).toEqual([2, 3, 1, 4]);
  });
});

describe("progress-based gaps", () => {
  // crossings[L] = instant lap L completed
  const crossings = new Map<number, number[]>([
    [1, [0, 90, 180, 270, 360]],
    [2, [0, 91, 182, 273.5, 365]],
    [3, [0, 95, 190, 300]],
  ]);

  it("interpolates the instant a car reached a point on track", () => {
    expect(timeAtProgress(crossings.get(1)!, 2.5)).toBe(225);
    expect(timeAtProgress(crossings.get(1)!, 4)).toBe(360);
    expect(timeAtProgress(crossings.get(3)!, 3.5)).toBeNull();
  });

  it("measures how long ago the car ahead was at the same point", () => {
    const now = 300;
    const ordered = [
      { driverNumber: 1, progress: 3 + 30 / 90, at: now, retired: false },
      { driverNumber: 2, progress: 3 + 26.5 / 91.5, at: now, retired: false },
    ];
    const g = gapsFromProgress(ordered, crossings);
    expect(g.get(1)).toEqual({ gap: { kind: "leader" }, interval: { kind: "leader" } });
    const gap = g.get(2)!.gap as { kind: "time"; seconds: number };
    expect(gap.kind).toBe("time");
    expect(gap.seconds).toBeGreaterThan(0);
    expect(gap.seconds).toBeLessThan(5);
  });

  it("charges a pit stop immediately instead of at the next line crossing", () => {
    // Car 3 completed lap 3 at 300 after a slow (pit) lap; at 300 it is at progress 3 while the leader is at 3.33.
    const g = gapsFromProgress(
      [
        { driverNumber: 1, progress: 3 + 30 / 90, at: 300, retired: false },
        { driverNumber: 3, progress: 3, at: 300, retired: false },
      ],
      crossings,
    );
    expect(g.get(3)!.gap).toEqual({ kind: "time", seconds: 30 });
  });

  it("expresses a lapped car's gap in laps and never goes negative", () => {
    const g = gapsFromProgress(
      [
        { driverNumber: 1, progress: 3.9, at: 350, retired: false },
        { driverNumber: 2, progress: 3.5, at: 350, retired: false },
        { driverNumber: 3, progress: 2.7, at: 350, retired: false },
        { driverNumber: 9, progress: 1, at: 350, retired: true },
      ],
      crossings,
    );
    expect(g.get(3)!.gap).toEqual({ kind: "laps", laps: 1 });
    expect(g.get(3)!.interval.kind).toBe("time");
    expect(g.get(9)).toEqual({ gap: { kind: "none" }, interval: { kind: "none" } });
    for (const v of g.values()) for (const x of [v.gap, v.interval]) if (x.kind === "time") expect(x.seconds).toBeGreaterThanOrEqual(0);
  });

  it("parses provider gap values", () => {
    expect(parseGapValue(1.432)).toEqual({ kind: "time", seconds: 1.432 });
    expect(parseGapValue("+1 LAP")).toEqual({ kind: "laps", laps: 1 });
    expect(parseGapValue("+3 LAPS")).toEqual({ kind: "laps", laps: 3 });
    expect(parseGapValue(null)).toEqual({ kind: "none" });
    expect(parseGapValue("garbage")).toEqual({ kind: "none" });
    expect(parseGapValue(null, true)).toEqual({ kind: "leader" });
  });

  it("computes best-lap gaps for timed sessions", () => {
    expect(bestLapGap(95.333, 95.291)).toEqual({ kind: "time", seconds: 0.042 });
    expect(bestLapGap(95.291, 95.291)).toEqual({ kind: "leader" });
    expect(bestLapGap(null, 95.291)).toEqual({ kind: "none" });
  });
});

describe("tyres and stints", () => {
  const stints: Stint[] = [
    { driverNumber: 44, stint: 1, compound: "MEDIUM", lapStart: 1, lapEnd: 18, tyreAgeAtStart: 0 },
    { driverNumber: 44, stint: 2, compound: "HARD", lapStart: 19, lapEnd: null, tyreAgeAtStart: 3 },
  ];

  it("finds the stint for a lap, with an open final stint", () => {
    expect(stintForLap(stints, 10)?.compound).toBe("MEDIUM");
    expect(stintForLap(stints, 40)?.compound).toBe("HARD");
  });

  it("derives tyre age from the sourced starting age", () => {
    expect(tyreAgeAt(stints[1], 18)).toEqual({ age: 3, basis: "sourced" });
    expect(tyreAgeAt(stints[1], 25)).toEqual({ age: 10, basis: "derived" });
    expect(tyreAgeAt(undefined, 25)).toEqual({ age: null, basis: "unknown" });
    expect(tyreAgeAt({ ...stints[0]!, tyreAgeAtStart: null }, 5)).toEqual({ age: null, basis: "unknown" });
  });

  it("summarises stint lengths without inventing an end lap", () => {
    expect(summariseStints(stints, 40).map((s) => s.laps)).toEqual([18, 22]);
    expect(summariseStints(stints, null).map((s) => s.laps)).toEqual([18, null]);
  });

  it("reports tyre changes only at stint boundaries", () => {
    expect(tyreChangeLaps(stints)).toEqual([18]);
  });

  it("normalises compound names", () => {
    expect(normaliseCompound("soft")).toBe("SOFT");
    expect(normaliseCompound("INTERMEDIATE")).toBe("INTERMEDIATE");
    expect(normaliseCompound("UNKNOWN")).toBeNull();
    expect(normaliseCompound(null)).toBeNull();
  });
});

describe("lap filters", () => {
  const base: LapRecord = {
    driverNumber: 1,
    lap: 1,
    startedAt: null,
    time: 90,
    sectors: [30, 30, 30],
    speedTrap: null,
    compound: null,
    tyreAge: null,
    tyreAgeBasis: "unknown",
    pitIn: false,
    pitOut: false,
    valid: true,
    deletedReason: null,
    personalBest: false,
    neutralised: false,
  };
  const laps: LapRecord[] = [
    { ...base, lap: 1, pitOut: true },
    { ...base, lap: 2, time: 89, personalBest: true },
    { ...base, lap: 3, valid: false },
    { ...base, lap: 4, neutralised: true },
    { ...base, lap: 5, pitIn: true },
  ];

  it("filters clean, pit and fastest laps", () => {
    expect(filterLaps(laps, "clean").map((l) => l.lap)).toEqual([2]);
    expect(filterLaps(laps, "pit").map((l) => l.lap)).toEqual([1, 5]);
    expect(filterLaps(laps, "fastest").map((l) => l.lap)).toEqual([2]);
    expect(filterLaps(laps, "all")).toHaveLength(5);
  });

  it("checks sectors add up to the lap time", () => {
    expect(sectorsConsistent({ time: 90, sectors: [30, 30, 30] })).toBe(true);
    expect(sectorsConsistent({ time: 90.01, sectors: [30, 30, 30] })).toBe(false);
    expect(sectorsConsistent({ time: null, sectors: [30, 30, 30] })).toBe(true);
  });
});

describe("freshness and update ordering", () => {
  const now = Date.parse("2026-10-24T18:00:00Z");

  it("flags live data as stale once the source stops advancing", () => {
    expect(freshness({ mode: "LIVE", lastSourceTimestamp: "2026-10-24T17:59:55Z", lastRequestFailed: false, now, thresholdMs: 30_000 })).toBe("fresh");
    expect(freshness({ mode: "LIVE", lastSourceTimestamp: "2026-10-24T17:59:00Z", lastRequestFailed: false, now, thresholdMs: 30_000 })).toBe("stale");
    expect(freshness({ mode: "LIVE", lastSourceTimestamp: null, lastRequestFailed: false, now, thresholdMs: 30_000 })).toBe("stale");
  });

  it("reports offline when the last request failed", () => {
    expect(freshness({ mode: "LIVE", lastSourceTimestamp: "2026-10-24T17:59:59Z", lastRequestFailed: true, now, thresholdMs: 30_000 })).toBe("offline");
  });

  it("never calls historical or demo data stale", () => {
    expect(freshness({ mode: "HISTORICAL", lastSourceTimestamp: "2026-01-01T00:00:00Z", lastRequestFailed: false, now, thresholdMs: 30_000 })).toBe("static");
    expect(freshness({ mode: "DEMO", lastSourceTimestamp: null, lastRequestFailed: false, now, thresholdMs: 30_000 })).toBe("static");
  });

  it("rejects out-of-order (older) updates", () => {
    expect(shouldAcceptUpdate("2026-10-24T18:00:05Z", "2026-10-24T18:00:01Z")).toBe(false);
    expect(shouldAcceptUpdate("2026-10-24T18:00:05Z", "2026-10-24T18:00:05Z")).toBe(true);
    expect(shouldAcceptUpdate(null, "2026-10-24T18:00:01Z")).toBe(true);
    expect(shouldAcceptUpdate("2026-10-24T18:00:05Z", null)).toBe(false);
  });
});
