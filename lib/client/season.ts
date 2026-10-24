"use client";

import type { ResultRow, SessionResults } from "@/lib/results/types";
import type { StandingRow, PointsCheck } from "@/lib/standings/standings";
import { useRemoteResource } from "./remote";

export interface SeasonRound {
  round: number;
  eventId: string;
  name: string;
  format: "standard" | "sprint" | "testing";
  race: ResultRow[];
  sprint: ResultRow[];
  qualifying: ResultRow[];
}

export interface SeasonData {
  lastRound: number;
  lastRoundName: string | null;
  lastRoundDate: string | null;
  drivers: StandingRow[];
  constructors: StandingRow[];
  poles: Record<string, number>;
  fastestLaps: Record<string, number>;
  rounds: SeasonRound[];
  verification: {
    publishedRound: number | null;
    driverMismatches: Array<{ id: string; computed: number; published: number }>;
    constructorMismatches: Array<{ id: string; computed: number; published: number }>;
    pointsDiscrepancies: PointsCheck[];
  };
}

/** Season results and standings (Jolpica-F1 via /api/season). */
export function useSeason() {
  return useRemoteResource<SeasonData>("/api/season", { scope: "season-2026" });
}

export function useSessionResults(round: number | null, type: string | null, name?: string | null) {
  const url = round && type ? `/api/results?round=${round}&type=${type}${name ? `&name=${encodeURIComponent(name)}` : ""}` : null;
  return useRemoteResource<Omit<SessionResults, "provenance">>(url, { scope: url ?? "none" });
}
