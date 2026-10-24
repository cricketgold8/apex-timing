import { describe, expect, it } from "vitest";
import { pointsFor } from "@/lib/config/scoring";
import { compareCountback, constructorStandings, driverStandings, pointsDiscrepancies, type ScoredResult } from "@/lib/standings/standings";

const r = (round: number, session: "RACE" | "SPRINT", driverId: string, teamId: string, position: number | null, publishedPoints: number | null = null): ScoredResult => ({
  round,
  session,
  driverId,
  driverCode: driverId.slice(0, 3).toUpperCase(),
  driverName: driverId,
  teamId,
  teamName: teamId,
  position,
  publishedPoints,
  fastestLapRank: null,
});

describe("2026 scoring tables", () => {
  it("awards Grand Prix points to the top ten", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((p) => pointsFor(2026, "RACE", p))).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0]);
  });

  it("awards Sprint points to the top eight", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => pointsFor(2026, "SPRINT", p))).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("gives nothing to unclassified finishers and has no fastest-lap point", () => {
    expect(pointsFor(2026, "RACE", null)).toBe(0);
    expect(pointsFor(2026, "RACE", 0)).toBe(0);
  });

  it("refuses to score a season without configured rules", () => {
    expect(() => pointsFor(1999, "RACE", 1)).toThrow();
  });
});

describe("driver standings", () => {
  const results = [
    r(1, "RACE", "alpha", "t1", 1),
    r(1, "RACE", "bravo", "t2", 2),
    r(1, "RACE", "charlie", "t1", null),
    r(2, "SPRINT", "bravo", "t2", 1),
    r(2, "SPRINT", "alpha", "t1", 2),
    r(2, "RACE", "bravo", "t2", 1),
    r(2, "RACE", "alpha", "t1", 3),
    r(2, "RACE", "charlie", "t1", 2),
  ];
  const table = driverStandings(results, { season: 2026, usePublishedPoints: false });

  it("sums race and sprint points", () => {
    const pts = Object.fromEntries(table.map((s) => [s.id, s.points]));
    expect(pts).toEqual({ bravo: 18 + 8 + 25, alpha: 25 + 7 + 15, charlie: 18 });
  });

  it("counts wins and podiums from Grand Prix results only", () => {
    const bravo = table.find((s) => s.id === "bravo")!;
    expect(bravo.wins).toBe(1);
    expect(bravo.podiums).toBe(2);
  });

  it("builds a cumulative progression per round", () => {
    expect(table.find((s) => s.id === "alpha")!.progression).toEqual([25, 47]);
    expect(table.find((s) => s.id === "charlie")!.progression).toEqual([0, 18]);
  });

  it("breaks ties on countback of Grand Prix results", () => {
    const tied = driverStandings(
      [r(1, "RACE", "x", "t1", 1), r(1, "RACE", "y", "t2", 2), r(2, "RACE", "y", "t2", 1), r(2, "RACE", "x", "t1", 2), r(3, "RACE", "x", "t1", 3), r(3, "RACE", "y", "t2", 4), r(3, "SPRINT", "y", "t2", 3)],
      { season: 2026, usePublishedPoints: false },
    );
    // x: 25+18+15 = 58; y: 18+25+12+6 = 61 → y ahead on points.
    expect(tied.map((s) => s.id)).toEqual(["y", "x"]);
    const equal = driverStandings([r(1, "RACE", "p", "t1", 1), r(1, "RACE", "q", "t2", 2), r(2, "RACE", "q", "t2", 1), r(2, "RACE", "p", "t1", 2)], { season: 2026, usePublishedPoints: false });
    expect(equal.map((s) => s.points)).toEqual([43, 43]);
    // Same wins and seconds: shared position.
    expect(equal.map((s) => s.position)).toEqual([1, 1]);
  });

  it("compares countback position by position", () => {
    expect(compareCountback({ points: 10, countback: [1, 0] }, { points: 10, countback: [0, 3] })).toBeLessThan(0);
    expect(compareCountback({ points: 10, countback: [0, 2] }, { points: 10, countback: [0, 1, 5] })).toBeLessThan(0);
  });

  it("prefers published points and reports discrepancies", () => {
    const withPenalty = [r(1, "RACE", "alpha", "t1", 1, 25), r(1, "RACE", "bravo", "t2", 2, 16)];
    const pub = driverStandings(withPenalty, { season: 2026, usePublishedPoints: true });
    expect(pub.find((s) => s.id === "bravo")!.points).toBe(16);
    expect(pointsDiscrepancies(withPenalty, 2026)).toEqual([{ round: 1, session: "RACE", driverId: "bravo", computed: 18, published: 16 }]);
  });
});

describe("constructor standings", () => {
  it("sums both cars, including substitutes", () => {
    const table = constructorStandings(
      [r(1, "RACE", "a", "t1", 1), r(1, "RACE", "sub", "t1", 4), r(1, "RACE", "b", "t2", 2), r(1, "SPRINT", "b", "t2", 1)],
      { season: 2026, usePublishedPoints: false },
      { t1: "Team One", t2: "Team Two" },
    );
    expect(table.map((t) => [t.id, t.points])).toEqual([
      ["t1", 37],
      ["t2", 26],
    ]);
    expect(table[0]!.name).toBe("Team One");
  });
});
