import { describe, expect, it } from "vitest";
import {
  UNAVAILABLE,
  convertSpeed,
  formatClock,
  formatDelta,
  formatGap,
  formatInterval,
  formatLapTime,
  formatSectorTime,
  formatSpeed,
  parseLapTime,
  utcOffsetAt,
} from "@/lib/timing/formatters";

describe("formatLapTime", () => {
  it("formats standard lap times", () => {
    expect(formatLapTime(83.456)).toBe("1:23.456");
    expect(formatLapTime(95.291)).toBe("1:35.291");
    expect(formatLapTime(60)).toBe("1:00.000");
  });

  it("rounds to milliseconds without floating-point artefacts", () => {
    expect(formatLapTime(83.4559999)).toBe("1:23.456");
    expect(formatLapTime(0.1 + 0.2 + 82)).toBe("1:22.300");
  });

  it("formats sub-minute and over-an-hour values", () => {
    expect(formatLapTime(28.456)).toBe("28.456");
    expect(formatLapTime(4986.801)).toBe("1:23:06.801");
  });

  it("never renders an unknown time as zero", () => {
    for (const v of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatLapTime(v as number | null | undefined)).toBe(UNAVAILABLE);
    }
    expect(formatLapTime(null)).not.toBe("0:00.000");
  });

  it("formats sector times as seconds", () => {
    expect(formatSectorTime(27.033)).toBe("27.033");
    expect(formatSectorTime(62.345)).toBe("1:02.345");
    expect(formatSectorTime(null)).toBe(UNAVAILABLE);
  });
});

describe("gaps and intervals", () => {
  it("formats time gaps with a sign", () => {
    expect(formatGap({ kind: "time", seconds: 7.335 })).toBe("+7.335");
    expect(formatGap({ kind: "time", seconds: 81.666 })).toBe("+1:21.666");
  });

  it("formats lapped cars", () => {
    expect(formatGap({ kind: "laps", laps: 1 })).toBe("+1 LAP");
    expect(formatGap({ kind: "laps", laps: 3 })).toBe("+3 LAPS");
  });

  it("labels the leader and leaves the leader's interval empty", () => {
    expect(formatGap({ kind: "leader" })).toBe("LEADER");
    expect(formatInterval({ kind: "leader" })).toBe(UNAVAILABLE);
  });

  it("shows unavailable for missing gaps", () => {
    expect(formatGap({ kind: "none" })).toBe(UNAVAILABLE);
    expect(formatInterval({ kind: "none" })).toBe(UNAVAILABLE);
  });

  it("formats deltas", () => {
    expect(formatDelta(0.1234)).toBe("+0.123");
    expect(formatDelta(-1.0456)).toBe("-1.046");
    expect(formatDelta(-0.1234)).toBe("-0.123");
    expect(formatDelta(0)).toBe("0.000");
    expect(formatDelta(null)).toBe(UNAVAILABLE);
  });
});

describe("parseLapTime", () => {
  it("parses the published formats", () => {
    expect(parseLapTime("1:23.456")).toBe(83.456);
    expect(parseLapTime("59.123")).toBe(59.123);
    expect(parseLapTime("1:23:06.801")).toBe(4986.801);
  });

  it("rejects malformed input", () => {
    expect(parseLapTime("")).toBeNull();
    expect(parseLapTime("DNF")).toBeNull();
    expect(parseLapTime("1:2x.000")).toBeNull();
    expect(parseLapTime(undefined)).toBeNull();
  });

  it("round-trips through the formatter", () => {
    for (const t of [83.456, 95.333, 101.005]) expect(parseLapTime(formatLapTime(t))).toBe(t);
  });
});

describe("units and clocks", () => {
  it("converts km/h to mph accurately", () => {
    expect(convertSpeed(100, "mph")).toBeCloseTo(62.137, 3);
    expect(formatSpeed(335, "mph")).toBe("208");
    expect(formatSpeed(335, "kmh", true)).toBe("335 km/h");
    expect(formatSpeed(null)).toBe(UNAVAILABLE);
  });

  it("formats session clocks", () => {
    expect(formatClock(6273.9)).toBe("1:44:33");
    expect(formatClock(427)).toBe("07:07");
    expect(formatClock(null)).toBe(UNAVAILABLE);
  });

  it("computes UTC offsets including daylight saving", () => {
    expect(utcOffsetAt("2026-10-24T17:30:00Z", "America/Chicago")).toBe("-05:00:00");
    expect(utcOffsetAt("2026-11-21T04:00:00Z", "America/Los_Angeles")).toBe("-08:00:00");
    expect(utcOffsetAt("2026-07-05T14:00:00Z", "Europe/London")).toBe("+01:00:00");
  });
});
