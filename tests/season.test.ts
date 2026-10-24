import { describe, expect, it } from "vitest";
import { DRIVERS_2026, driverByNumber } from "@/lib/config/drivers-2026";
import { ROUNDS_2026, SEASON_2026, latestCompletedSession, scheduleState } from "@/lib/config/season-2026";
import { TEAM_LIST, TEAMS_2026 } from "@/lib/config/teams-2026";
import { utcOffsetAt } from "@/lib/timing/formatters";

describe("2026 grid configuration", () => {
  it("has 22 drivers in 11 teams of two", () => {
    expect(DRIVERS_2026).toHaveLength(22);
    expect(TEAM_LIST).toHaveLength(11);
    for (const t of TEAM_LIST) expect(DRIVERS_2026.filter((d) => d.teamId === t.id)).toHaveLength(2);
  });

  it("has unique numbers and codes", () => {
    expect(new Set(DRIVERS_2026.map((d) => d.number)).size).toBe(22);
    expect(new Set(DRIVERS_2026.map((d) => d.code)).size).toBe(22);
    for (const d of DRIVERS_2026) expect(d.code).toMatch(/^[A-Z]{3}$/);
  });

  it("matches the verified 2026 line-up", () => {
    const expected: Array<[number, string, string]> = [
      [1, "NOR", "mclaren"],
      [81, "PIA", "mclaren"],
      [63, "RUS", "mercedes"],
      [12, "ANT", "mercedes"],
      [16, "LEC", "ferrari"],
      [44, "HAM", "ferrari"],
      [3, "VER", "red_bull"],
      [6, "HAD", "red_bull"],
      [30, "LAW", "racing_bulls"],
      [41, "LIN", "racing_bulls"],
      [14, "ALO", "aston_martin"],
      [18, "STR", "aston_martin"],
      [10, "GAS", "alpine"],
      [43, "COL", "alpine"],
      [31, "OCO", "haas"],
      [87, "BEA", "haas"],
      [27, "HUL", "audi"],
      [5, "BOR", "audi"],
      [23, "ALB", "williams"],
      [55, "SAI", "williams"],
      [11, "PER", "cadillac"],
      [77, "BOT", "cadillac"],
    ];
    for (const [n, code, team] of expected) expect(driverByNumber(n, false)).toMatchObject({ code, teamId: team });
  });

  it("uses proper Unicode names", () => {
    expect(driverByNumber(27)?.displayName).toBe("Nico Hülkenberg");
    expect(driverByNumber(11)?.displayName).toBe("Sergio Pérez");
  });

  it("does not put substitutes on the race grid", () => {
    expect(driverByNumber(22, false)).toBeUndefined();
    expect(driverByNumber(22)?.code).toBe("TSU");
  });

  it("has a valid hex colour per team", () => {
    for (const t of Object.values(TEAMS_2026)) expect(t.colour).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("2026 calendar", () => {
  it("has contiguous championship rounds", () => {
    expect(ROUNDS_2026.map((e) => e.round)).toEqual(Array.from({ length: ROUNDS_2026.length }, (_, i) => i + 1));
  });

  it("flags cancelled events and keeps them out of the rounds", () => {
    const cancelled = SEASON_2026.events.filter((e) => e.status === "cancelled");
    for (const e of cancelled) expect(e.round).toBeNull();
  });

  it("marks sprint weekends from their actual sessions", () => {
    for (const e of ROUNDS_2026) {
      const hasSprint = e.sessions.some((s) => s.type === "SPRINT");
      expect(e.format === "sprint").toBe(hasSprint);
      if (hasSprint) expect(e.sessions.some((s) => s.type === "SPRINT_QUALIFYING")).toBe(true);
    }
  });

  it("orders sessions within each weekend", () => {
    for (const e of SEASON_2026.events) {
      const starts = e.sessions.map((s) => s.start);
      expect([...starts].sort()).toEqual(starts);
      for (const s of e.sessions) expect(Date.parse(s.end)).toBeGreaterThan(Date.parse(s.start));
    }
  });

  it("uses IANA zones whose offsets match the provider's published GMT offset", () => {
    for (const e of SEASON_2026.events) {
      const first = e.sessions[0];
      if (!first) continue;
      expect({ id: e.id, offset: utcOffsetAt(first.start, e.circuit.timeZone) }).toEqual({ id: e.id, offset: e.gmtOffset.startsWith("-") ? e.gmtOffset : `+${e.gmtOffset}` });
    }
  });

  it("derives schedule state from the clock only", () => {
    const s = { start: "2026-10-24T17:30:00.000Z", end: "2026-10-24T18:30:00.000Z", cancelled: false };
    expect(scheduleState(s, new Date("2026-10-24T17:00:00Z"))).toBe("upcoming");
    expect(scheduleState(s, new Date("2026-10-24T18:00:00Z"))).toBe("in-window");
    expect(scheduleState(s, new Date("2026-10-24T19:00:00Z"))).toBe("completed");
    expect(scheduleState({ ...s, cancelled: true }, new Date("2026-10-24T18:00:00Z"))).toBe("cancelled");
  });

  it("finds the latest completed session", () => {
    const latest = latestCompletedSession(new Date("2026-10-12T00:00:00Z"));
    expect(latest?.event.name).toBe("Singapore Grand Prix");
    expect(latest?.session.type).toBe("RACE");
  });
});
