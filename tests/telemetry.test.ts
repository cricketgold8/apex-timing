import { describe, expect, it } from "vitest";
import { alignLaps, integrateDistance } from "@/lib/timing/telemetry";
import type { TelemetryLap } from "@/lib/timing/types";

function lap(speedKmh: number, seconds: number, hz = 4): TelemetryLap {
  const samples = [];
  const n = seconds * hz;
  const base = Array.from({ length: n + 1 }, (_, i) => ({ t: i / hz, speedKmh }));
  const dist = integrateDistance(base);
  for (let i = 0; i <= n; i++) samples.push({ distance: dist[i]!, t: base[i]!.t, speedKmh, throttlePct: 100, brake: 0, gear: 8, rpm: 11000 });
  return { driverNumber: 1, lap: 1, lapTime: seconds, samples, channels: ["speed"], distanceBasis: "integrated-speed", sampleRateHz: hz };
}

describe("telemetry", () => {
  it("integrates distance from speed", () => {
    const d = integrateDistance([
      { t: 0, speedKmh: 360 },
      { t: 1, speedKmh: 360 },
      { t: 2, speedKmh: 0 },
    ]);
    expect(d).toEqual([0, 100, 150]);
  });

  it("ignores gaps in the data rather than integrating across them", () => {
    const d = integrateDistance([
      { t: 0, speedKmh: 360 },
      { t: 30, speedKmh: 360 },
    ]);
    expect(d).toEqual([0, 0]);
  });

  it("aligns two laps on a shared distance grid with a signed delta", () => {
    const a = lap(360, 20); // 100 m/s
    const b = lap(352.8, 20); // 98 m/s — covers 2% less distance; scaled to A's length
    const aligned = alignLaps(a, b, 100);
    expect(aligned[0]!.distance).toBe(0);
    expect(aligned.at(-1)!.distance).toBeLessThanOrEqual(2000);
    // After normalising distance, both laps cover the same length in the same time, so the delta is ~0.
    expect(Math.abs(aligned.at(-1)!.delta ?? 1)).toBeLessThan(0.05);
  });

  it("returns no delta for a single lap", () => {
    expect(alignLaps(lap(300, 10), null, 50).every((p) => p.delta === null)).toBe(true);
  });
});
