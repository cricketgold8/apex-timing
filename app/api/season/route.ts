import { ROUNDS_2026 } from "@/lib/config/season-2026";
import { fail, ok, upstreamFailure } from "@/lib/server/respond";
import { publishedStandings, scoredResults, seasonResults, teamNameMap } from "@/lib/server/results";
import { UpstreamError } from "@/lib/server/upstream";
import { constructorStandings, driverStandings, pointsDiscrepancies } from "@/lib/standings/standings";

/**
 * Season dataset for the Championship, Drivers and Teams pages: classified results per round (Jolpica-F1),
 * standings computed from those results, and a cross-check against the provider's published standings.
 */
export async function GET() {
  try {
    const season = await seasonResults();
    const published = await publishedStandings();
    const scored = scoredResults(season);
    const opts = { season: 2026, usePublishedPoints: true };
    const drivers = driverStandings(scored, opts);
    const constructors = constructorStandings(scored, opts, teamNameMap());
    const discrepancies = pointsDiscrepancies(scored, 2026);

    const driverMismatches = drivers
      .map((d) => {
        const p = published.drivers.find((x) => x.driverId === d.id);
        return p && p.points !== d.points ? { id: d.id, computed: d.points, published: p.points } : null;
      })
      .filter(Boolean);
    const constructorMismatches = constructors
      .map((c) => {
        const p = published.constructors.find((x) => x.teamId === c.id);
        return p && p.points !== c.points ? { id: c.id, computed: c.points, published: p.points } : null;
      })
      .filter(Boolean);

    const poles: Record<string, number> = {};
    const fastestLaps: Record<string, number> = {};
    for (const [, rows] of season.qualifying) {
      const p = rows.find((r) => r.position === 1);
      if (p?.driverId) poles[p.driverId] = (poles[p.driverId] ?? 0) + 1;
    }
    for (const [, rows] of season.races) {
      const f = rows.find((r) => r.fastestLap?.rank === 1);
      if (f?.driverId) fastestLaps[f.driverId] = (fastestLaps[f.driverId] ?? 0) + 1;
    }

    const rounds = ROUNDS_2026.map((e) => ({
      round: e.round as number,
      eventId: e.id,
      name: e.name,
      format: e.format,
      race: season.races.get(e.round as number) ?? [],
      sprint: season.sprints.get(e.round as number) ?? [],
      qualifying: season.qualifying.get(e.round as number) ?? [],
    }));

    const lastEvent = ROUNDS_2026.find((e) => e.round === season.lastRound);
    return ok(
      {
        data: {
          lastRound: season.lastRound,
          lastRoundName: lastEvent?.name ?? null,
          lastRoundDate: lastEvent?.endDate ?? null,
          drivers,
          constructors,
          poles,
          fastestLaps,
          rounds,
          verification: {
            publishedRound: published.round,
            driverMismatches,
            constructorMismatches,
            pointsDiscrepancies: discrepancies,
          },
        },
        provenance: {
          provider: "Jolpica-F1",
          mode: "HISTORICAL",
          sessionId: null,
          sourceTimestamp: lastEvent?.endDate ?? null,
          fetchedAt: new Date().toISOString(),
          completeness: "complete",
          notes: [
            `Standings computed from ${scored.length} classified race and sprint results up to round ${season.lastRound}.`,
            "Points use the provider's published value per result (which reflects penalties); the 2026 scoring table is used to flag discrepancies.",
            "Ties are separated by Grand Prix countback (wins, then second places, …).",
          ],
        },
      },
      300,
    );
  } catch (err) {
    if (err instanceof UpstreamError) return upstreamFailure(err);
    return fail(500, { error: err instanceof Error ? err.message : String(err), code: "UPSTREAM_ERROR", mode: "OFFLINE", provider: "apex-timing" });
  }
}
