/**
 * Season-specific championship scoring. Points are never derived from a generic formula:
 * each season and session type has an explicit table.
 *
 * 2026 (FIA Formula One Sporting Regulations):
 *   - Grand Prix: 25-18-15-12-10-8-6-4-2-1 to the top ten classified finishers.
 *   - Sprint: 8-7-6-5-4-3-2-1 to the top eight classified finishers.
 *   - No point for fastest lap (removed from 2025).
 * Reduced points for shortened races follow the regulations' distance bands; this table models
 * full-distance results. Provider-published points (Jolpica `points`) are always preferred over
 * recomputation when available, and the app cross-checks the two (see lib/standings).
 */

export type ScoredSession = "RACE" | "SPRINT";

export interface ScoringRules {
  season: number;
  race: readonly number[];
  sprint: readonly number[];
  fastestLapPoint: false | { points: number; requiresTopTen: boolean };
}

export const SCORING: Record<number, ScoringRules> = {
  2026: {
    season: 2026,
    race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    sprint: [8, 7, 6, 5, 4, 3, 2, 1],
    fastestLapPoint: false,
  },
};

export function pointsFor(season: number, session: ScoredSession, classifiedPosition: number | null): number {
  const rules = SCORING[season];
  if (!rules) throw new Error(`No scoring rules configured for season ${season}`);
  if (classifiedPosition === null || !Number.isInteger(classifiedPosition) || classifiedPosition < 1) return 0;
  const table = session === "RACE" ? rules.race : rules.sprint;
  return table[classifiedPosition - 1] ?? 0;
}
