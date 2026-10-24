import type { NextRequest } from "next/server";
import { z } from "zod";
import { SEASON_2026, scheduleState } from "@/lib/config/season-2026";
import { openf1 } from "@/lib/server/openf1";
import { badRequest, fail, ok, upstreamFailure } from "@/lib/server/respond";
import { UpstreamError } from "@/lib/server/upstream";
import { deletedLapIndex, trackFromLocations } from "@/lib/timing/normalisation";
import { of1Lap, of1Location, of1RaceControl } from "@/lib/timing/validation";

const query = z.object({ circuitKey: z.coerce.number().int().min(1).max(999) });

const sessionSchema = z.object({ session_key: z.number().int(), session_name: z.string(), year: z.number().int(), date_end: z.string() });

/**
 * Circuit outline for the circuit detail page, traced from real position data at that circuit (OpenF1 circuit_key).
 * Uses the most recent completed 2026 race there, else the 2025 race. Never substitutes another circuit.
 */
export async function GET(req: NextRequest) {
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest("circuitKey is required");
  const { circuitKey } = parsed.data;
  const DAY = 86_400_000;
  try {
    let sessionKey: number | null = null;
    let label = "";
    for (const e of [...SEASON_2026.events].reverse()) {
      if (e.circuit.openf1CircuitKey !== circuitKey || e.status === "cancelled") continue;
      const race = e.sessions.find((s) => (s.type === "RACE" || s.type === "QUALIFYING") && scheduleState(s) === "completed");
      if (race) {
        sessionKey = race.openf1SessionKey;
        label = `${e.name} ${race.name} (2026)`;
        break;
      }
    }
    if (sessionKey === null) {
      const prev = await openf1({ endpoint: "sessions", filters: [["circuit_key", "=", circuitKey], ["year", "=", 2025], ["session_name", "=", "Race"]], schema: sessionSchema, access: "historical", ttlMs: 7 * DAY });
      const s = prev.records[0];
      if (s) {
        sessionKey = s.session_key;
        label = `2025 Race at this circuit`;
      }
    }
    if (sessionKey === null) return fail(404, { error: "No position data recorded at this circuit yet", code: "NOT_PUBLISHED", mode: "UNAVAILABLE", provider: "OpenF1" });

    const laps = await openf1({ endpoint: "laps", filters: [["session_key", "=", sessionKey]], schema: of1Lap, access: "historical", ttlMs: 7 * DAY });
    const rc = await openf1({ endpoint: "race_control", filters: [["session_key", "=", sessionKey]], schema: of1RaceControl, access: "historical", ttlMs: 7 * DAY });
    const deleted = deletedLapIndex(rc.records, laps.records);
    const ref = laps.records
      .filter((l) => typeof l.lap_duration === "number" && l.date_start && !l.is_pit_out_lap && !deleted.has(`${l.driver_number}:${l.lap_number}`))
      .sort((a, b) => (a.lap_duration as number) - (b.lap_duration as number))[0];
    if (!ref?.date_start) return fail(404, { error: "No complete reference lap available", code: "NOT_PUBLISHED", mode: "UNAVAILABLE", provider: "OpenF1" });
    const start = Date.parse(ref.date_start);
    const end = start + (ref.lap_duration as number) * 1000;
    const loc = await openf1({
      endpoint: "location",
      filters: [["session_key", "=", sessionKey], ["driver_number", "=", ref.driver_number], ["date", ">", new Date(start - 200).toISOString()], ["date", "<", new Date(end + 200).toISOString()]],
      schema: of1Location,
      access: "historical",
      ttlMs: 7 * DAY,
    });
    const geometry = trackFromLocations(loc.records, start, [ref.duration_sector_1 ?? null, ref.duration_sector_2 ?? null, ref.duration_sector_3 ?? null], `Traced from car ${ref.driver_number}'s fastest lap, ${label} (OpenF1 position data)`);
    return ok(
      {
        data: { geometry, referenceLap: { driverNumber: ref.driver_number, lap: ref.lap_number, time: ref.lap_duration ?? null } },
        provenance: { provider: "OpenF1", mode: "HISTORICAL", sessionId: String(sessionKey), sourceTimestamp: new Date(end).toISOString(), fetchedAt: new Date().toISOString(), completeness: "complete", notes: [geometry?.basis ?? ""] },
      },
      3600,
    );
  } catch (err) {
    if (err instanceof UpstreamError) return upstreamFailure(err);
    return fail(500, { error: err instanceof Error ? err.message : String(err), code: "UPSTREAM_ERROR", mode: "OFFLINE", provider: "apex-timing" });
  }
}
