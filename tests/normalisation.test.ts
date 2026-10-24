import { describe, expect, it } from "vitest";
import { buildLapRecords, buildSnapshot, deletedLapIndex, driverDirectory, normaliseRaceControl, type OpenF1SessionRaw } from "@/lib/timing/normalisation";
import { of1Interval, of1Lap, of1SessionResult } from "@/lib/timing/validation";
import type { OF1Lap, OF1RaceControl } from "@/lib/timing/validation";

const T0 = Date.parse("2026-10-11T12:00:00Z");
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();

/** Builds consecutive laps for one car from lap durations, OpenF1-shaped. */
function laps(driver: number, durations: number[], startOffset = 0, pitOutLaps: number[] = []): OF1Lap[] {
  let t = startOffset;
  return durations.map((d, i) => {
    const lap: OF1Lap = {
      driver_number: driver,
      lap_number: i + 1,
      date_start: iso(t),
      duration_sector_1: Math.round(d * 0.3 * 1000) / 1000,
      duration_sector_2: Math.round(d * 0.4 * 1000) / 1000,
      duration_sector_3: Math.round((d - Math.round(d * 0.3 * 1000) / 1000 - Math.round(d * 0.4 * 1000) / 1000) * 1000) / 1000,
      lap_duration: d,
      i1_speed: null,
      i2_speed: null,
      st_speed: 300 + driver,
      is_pit_out_lap: pitOutLaps.includes(i + 1),
    };
    t += d;
    return lap;
  });
}

const rc = (s: number, message: string, extra: Partial<OF1RaceControl> = {}): OF1RaceControl => ({ date: iso(s), message, category: "Other", flag: null, scope: null, sector: null, driver_number: null, lap_number: null, ...extra });

function raceRaw(): OpenF1SessionRaw {
  return {
    sessionKey: 1,
    sessionType: "RACE",
    drivers: [
      { driver_number: 27, name_acronym: "HUL", full_name: "Nico HULKENBERG", team_name: "Audi", team_colour: "F50537", session_key: 1 },
      { driver_number: 3, name_acronym: "VER", full_name: "Max VERSTAPPEN", team_name: "Red Bull Racing", team_colour: "4781D7", session_key: 1 },
      { driver_number: 99, name_acronym: "RES", full_name: "Reserve DRIVER", team_name: "Haas F1 Team", team_colour: "9C9FA2", session_key: 1 },
    ],
    laps: [...laps(3, [95, 94, 94.5, 94.2]), ...laps(27, [96, 95.5, 95.2, 95.4], 0.5, [3]), ...laps(99, [97, 98])],
    positions: [
      { date: iso(-60), driver_number: 27, position: 1 },
      { date: iso(-60), driver_number: 3, position: 2 },
      { date: iso(-60), driver_number: 99, position: 3 },
      { date: iso(95.1), driver_number: 3, position: 1 },
      { date: iso(95.1), driver_number: 27, position: 2 },
    ],
    intervals: [
      { date: iso(190), driver_number: 3, gap_to_leader: null, interval: null },
      { date: iso(190), driver_number: 27, gap_to_leader: 2.0, interval: 2.0 },
      { date: iso(190), driver_number: 99, gap_to_leader: "+1 LAP", interval: "+1 LAP" },
    ],
    stints: [
      { driver_number: 3, stint_number: 1, compound: "MEDIUM", lap_start: 1, lap_end: null, tyre_age_at_start: 2 },
      { driver_number: 27, stint_number: 1, compound: "SOFT", lap_start: 1, lap_end: 2, tyre_age_at_start: 0 },
      { driver_number: 27, stint_number: 2, compound: "HARD", lap_start: 3, lap_end: null, tyre_age_at_start: 0 },
    ],
    pits: [{ date: iso(185), driver_number: 27, lap_number: 2, lane_duration: 22.1, pit_duration: 22.1, stop_duration: 2.4 }],
    raceControl: [
      rc(0, "SESSION STARTED", { category: "SessionStatus" }),
      // Fastest lap of VER deleted: identified by its quoted time, not by the message's own lap counter.
      rc(200, "CAR 3 (VER) TIME 1:34.000 DELETED - TRACK LIMITS AT TURN 4 LAP 7 12:03:10"),
      rc(300, "VSC DEPLOYED", { category: "SafetyCar" }),
    ],
    weather: [{ date: iso(10), air_temperature: 30, track_temperature: 44, humidity: 70, pressure: 1008, rainfall: 0, wind_direction: 147, wind_speed: 1.5 }],
    results: [],
    grid: [],
  };
}

describe("driver identity", () => {
  it("uses the session entry list for teams and the config for accented names", () => {
    const dir = driverDirectory(raceRaw().drivers);
    expect(dir.get(27)).toMatchObject({ code: "HUL", name: "Nico Hülkenberg", teamId: "audi", teamColour: "#F50537" });
  });

  it("keeps drivers who are not on the race grid, using the source's details", () => {
    expect(driverDirectory(raceRaw().drivers).get(99)).toMatchObject({ code: "RES", name: "Reserve Driver", teamId: "haas" });
  });
});

describe("deleted laps", () => {
  it("matches deletions by quoted lap time", () => {
    const raw = raceRaw();
    // VER's 1:34.000 is lap 2 in the timing feed even though the message says LAP 7.
    expect([...deletedLapIndex(raw.raceControl, raw.laps).keys()]).toEqual(["3:2"]);
  });

  it("uses lap numbers only when no time is quoted and the session is a race", () => {
    const raw = raceRaw();
    const msgs = [rc(400, "CAR 27 (HUL) LAP DELETED - TRACK LIMITS AT TURN 2 LAP 3 20:57:43 (PIT)")];
    expect(deletedLapIndex(msgs, raw.laps, Infinity, true).has("27:3")).toBe(true);
    expect(deletedLapIndex(msgs, raw.laps, Infinity, false).size).toBe(0);
  });

  it("ignores deletions issued after the replay instant", () => {
    const raw = raceRaw();
    expect(deletedLapIndex(raw.raceControl, raw.laps, T0 + 150_000).size).toBe(0);
  });
});

describe("race snapshot", () => {
  const session = { id: "1", eventName: "Test GP", circuitName: "Test", country: "X", type: "RACE" as const, name: "Race", scheduledStart: null, scheduledEnd: null, timeZone: "UTC" };

  it("orders by the position feed and reads gaps from the interval feed", () => {
    const s = buildSnapshot(raceRaw(), session, { atMs: T0 + 191_000 });
    expect(s.orderBasis).toBe("race-position");
    expect(s.rows.map((r) => r.code)).toEqual(["VER", "HUL", "RES"]);
    expect(s.rows[0]!.gap).toEqual({ kind: "leader" });
    expect(s.rows[1]!.gap).toEqual({ kind: "time", seconds: 2 });
    expect(s.rows[2]!.gap).toEqual({ kind: "laps", laps: 1 });
  });

  it("reports position change against the pre-start position feed", () => {
    const s = buildSnapshot(raceRaw(), session, { atMs: T0 + 191_000 });
    expect(s.positionReference).toBe("start-of-session");
    expect(s.rows.find((r) => r.code === "VER")!.positionChange).toBe(1);
    expect(s.rows.find((r) => r.code === "HUL")!.positionChange).toBe(-1);
  });

  it("excludes deleted laps from bests once deleted, and marks the session best", () => {
    const before = buildSnapshot(raceRaw(), session, { atMs: T0 + 191_000 });
    expect(before.bests.lap?.time).toBe(94);
    const after = buildSnapshot(raceRaw(), session, { atMs: T0 + 400_000 });
    const ver = after.rows.find((r) => r.code === "VER")!;
    expect(ver.bestLap.value).toBe(94.2);
    expect(after.bests.lap).toEqual({ driverNumber: 3, time: 94.2, lap: 4 });
    expect(ver.bestLap.mark).toBe("session-best");
  });

  it("derives tyre age and counts pit visits up to the instant", () => {
    const s = buildSnapshot(raceRaw(), session, { atMs: T0 + 250_000 });
    const hul = s.rows.find((r) => r.code === "HUL")!;
    expect(hul.tyre).toMatchObject({ compound: "HARD", stintNumber: 2 });
    expect(hul.pitStops).toBe(1);
    const ver = s.rows.find((r) => r.code === "VER")!;
    expect(ver.tyre).toMatchObject({ compound: "MEDIUM", age: 4, ageBasis: "derived" });
  });

  it("shows sectors of the lap in progress and carries the rest from the previous lap", () => {
    // VER's lap 3 starts at 189 s; sector 1 (~28.35 s) completes at ~217.4 s.
    const s = buildSnapshot(raceRaw(), session, { atMs: T0 + 220_000 });
    const ver = s.rows.find((r) => r.code === "VER")!;
    expect(ver.sectors[0]).toMatchObject({ value: 28.35, current: true });
    expect(ver.sectors[1]!.current).toBe(false);
  });

  it("establishes track status and weather from the source", () => {
    const s = buildSnapshot(raceRaw(), session, { atMs: T0 + 400_000 });
    expect(s.trackStatus.status).toBe("VSC");
    expect(s.weather?.airTempC).toBe(30);
    expect(s.weather?.rainfall).toBe(false);
  });

  it("builds lap histories with pit, validity and personal-best flags", () => {
    const raw = raceRaw();
    const ver = buildLapRecords(raw, 3);
    expect(ver.find((l) => l.lap === 2)).toMatchObject({ valid: false, personalBest: false });
    expect(ver.find((l) => l.personalBest)?.lap).toBe(4);
    const hul = buildLapRecords(raw, 27);
    expect(hul.find((l) => l.lap === 2)?.pitIn).toBe(true);
    expect(hul.find((l) => l.lap === 3)?.pitOut).toBe(true);
    expect(hul.find((l) => l.lap === 4)?.neutralised).toBe(true);
  });

  it("lists race control newest first with categories", () => {
    const msgs = normaliseRaceControl(raceRaw().raceControl, "1");
    expect(msgs[0]!.category).toBe("SAFETY_CAR");
    expect(msgs.at(-1)!.category).toBe("SESSION");
    expect(msgs.find((m) => m.category === "LAP_DELETED")!.driverNumbers).toEqual([3]);
  });
});

describe("classification states", () => {
  it("removes stale gaps from retired cars in the final classification", () => {
    const raw = raceRaw();
    raw.results = [
      { driver_number: 3, position: 1, number_of_laps: 4, dnf: false, dns: false, dsq: false, gap_to_leader: 0 },
      { driver_number: 27, position: 2, number_of_laps: 4, dnf: false, dns: false, dsq: false, gap_to_leader: 2.1 },
      { driver_number: 99, position: null, number_of_laps: 2, dnf: true, dns: false, dsq: false, gap_to_leader: null },
    ];
    const s = buildSnapshot(raw, { id: "1", eventName: "", circuitName: "", country: "", type: "RACE", name: "Race", scheduledStart: null, scheduledEnd: null, timeZone: "UTC" });
    expect(s.orderBasis).toBe("classification");
    const res = s.rows.find((r) => r.code === "RES")!;
    expect(res.state).toBe("RETIRED");
    expect(res.gap).toEqual({ kind: "none" });
    expect(res.interval).toEqual({ kind: "none" });
    expect(s.rows[1]!.gap).toEqual({ kind: "time", seconds: 2.1 });
  });
});

describe("runtime validation", () => {
  it("accepts real-shaped records and rejects malformed ones", () => {
    expect(of1Lap.safeParse({ driver_number: 1, lap_number: 2, date_start: "2026-10-11T12:05:27.268000+00:00", lap_duration: 100.617 }).success).toBe(true);
    expect(of1Lap.safeParse({ driver_number: "1", lap_number: 2 }).success).toBe(false);
    expect(of1Interval.safeParse({ date: "x", driver_number: 6, gap_to_leader: "+1 LAP", interval: 6.185 }).success).toBe(true);
    expect(of1SessionResult.safeParse({ driver_number: 3, position: 1, duration: [93.241, 91.639, 91.373], gap_to_leader: [0.812, 0.11, 0] }).success).toBe(true);
    expect(of1SessionResult.safeParse({ driver_number: 3, duration: "fast" }).success).toBe(false);
  });
});
