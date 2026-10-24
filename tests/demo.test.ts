import { describe, expect, it } from "vitest";
import { sectorsConsistent } from "@/lib/timing/calculations";
import { demoLapHistory, demoRaceControl, demoSnapshot, demoStints, demoTelemetry, demoTimeRange } from "@/lib/timing/providers/demo/provider";
import { DEMO_TOTAL_LAPS, demoRace } from "@/lib/timing/providers/demo/race";

const race = demoRace();
const { end } = demoTimeRange();
const instants = [0, 300, 900, 1500, 2000, 2050, 2600, 3500, 4400, end];

describe("demo race integrity", () => {
  it("has the full 22-car 2026 grid", () => {
    expect(race.drivers).toHaveLength(22);
    expect(new Set(race.drivers.map((d) => d.number)).size).toBe(22);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(demoSnapshot(1234).data.rows)).toBe(JSON.stringify(demoSnapshot(1234).data.rows));
  });

  it("has sector times that add up to every lap time", () => {
    for (const d of race.drivers) for (const l of d.laps) expect(sectorsConsistent({ time: l.time, sectors: l.sectors }, 0.0011)).toBe(true);
  });

  it("has plausible speed-trap readings", () => {
    for (const d of race.drivers) for (const l of d.laps) expect(l.speedTrap).toBeGreaterThan(300);
  });

  it("has contiguous laps and crossings", () => {
    for (const d of race.drivers) {
      d.laps.forEach((l, i) => {
        expect(l.lap).toBe(i + 1);
        expect(l.start).toBeCloseTo(d.crossings[i]!, 3);
        expect(l.end).toBeCloseTo(d.crossings[i + 1]!, 3);
      });
    }
  });

  it("has stints that cover the laps driven, with tyre changes only at pit stops", () => {
    for (const d of race.drivers) {
      const covered = d.stints.reduce((n, s) => n + (s.lapEnd - s.lapStart + 1), 0);
      expect(covered).toBe(d.retiredOnLap ?? d.laps.length);
      for (const s of d.stints.slice(1)) expect(d.laps.find((l) => l.lap === s.lapStart)?.pitOut).toBe(true);
    }
  });

  it("finishes the leader on the scheduled distance", () => {
    const winner = demoSnapshot(end).data.rows[0]!;
    expect(winner.lapsCompleted).toBe(DEMO_TOTAL_LAPS);
    expect(winner.state).toBe("FINISHED");
  });

  it.each(instants)("keeps a consistent classification at t=%s", (t) => {
    const snap = demoSnapshot(t).data;
    const classified = snap.rows.filter((r) => r.position !== null);
    expect(classified.map((r) => r.position)).toEqual(classified.map((_, i) => i + 1));
    for (const r of snap.rows) {
      if (r.gap.kind === "time") expect(r.gap.seconds).toBeGreaterThanOrEqual(0);
      if (r.interval.kind === "time") expect(r.interval.seconds).toBeGreaterThanOrEqual(0);
    }
    // Under green, gaps grow down the order among cars on the lead lap. (Under VSC each car's gap is measured at a
    // different timing loop while the leader slows, so adjacent gaps can briefly invert — as on real timing screens.)
    if (snap.trackStatus.status === "GREEN") {
      const times = classified.filter((r) => r.gap.kind === "time").map((r) => (r.gap as { seconds: number }).seconds);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it.each(instants)("reports best laps that match the lap history at t=%s", (t) => {
    const snap = demoSnapshot(t).data;
    for (const r of snap.rows) {
      const history = demoLapHistory(r.driverNumber, t).data;
      const valid = history.filter((l) => l.valid !== false && l.time !== null).map((l) => l.time as number);
      expect(r.bestLap.value).toBe(valid.length ? Math.min(...valid) : null);
      expect(r.lapsCompleted).toBe(history.length);
    }
  });

  it("never rewrites history as the clock advances", () => {
    for (const d of race.drivers.slice(0, 6)) {
      const early = demoLapHistory(d.number, 1800).data;
      const late = demoLapHistory(d.number, 3600).data;
      for (const l of early) {
        const same = late.find((x) => x.lap === l.lap)!;
        expect(same.time).toBe(l.time);
        expect(same.sectors).toEqual(l.sectors);
      }
    }
  });

  it("labels every dataset as DEMO and every message as fictional", () => {
    expect(demoSnapshot(100).provenance.mode).toBe("DEMO");
    expect(demoStints(100).provenance.mode).toBe("DEMO");
    const rc = demoRaceControl(end).data;
    expect(rc.length).toBeGreaterThan(5);
    for (const m of rc) {
      expect(m.source).toBe("DEMO — fictional");
      expect(m.text.startsWith("[DEMO]")).toBe(true);
    }
  });

  it("runs a VSC caused by the retirement, established from its own messages", () => {
    const [a, b] = race.vsc;
    expect(demoSnapshot((a + b) / 2).data.trackStatus.status).toBe("VSC");
    expect(demoSnapshot(b + 5).data.trackStatus.status).toBe("GREEN");
    expect(demoSnapshot(a + 10).data.rows.find((r) => r.driverNumber === 31)?.state).toBe("RETIRED");
  });

  it("produces telemetry with monotonic distance and plausible ranges", () => {
    const lap = race.drivers[0]!.laps[10]!;
    const tel = demoTelemetry(race.drivers[0]!.number, lap.lap)!;
    expect(tel.provenance.mode).toBe("DEMO");
    const s = tel.data.samples;
    for (let i = 1; i < s.length; i++) expect(s[i]!.distance).toBeGreaterThanOrEqual(s[i - 1]!.distance);
    expect(Math.max(...s.map((x) => x.speedKmh ?? 0))).toBeLessThan(360);
    expect(Math.min(...s.map((x) => x.gear ?? 0))).toBeGreaterThanOrEqual(1);
  });
});
