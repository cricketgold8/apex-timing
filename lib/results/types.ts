import type { SessionType } from "@/lib/config/season-2026";
import type { Provenance } from "@/lib/timing/types";

export type Classification = "CLASSIFIED" | "NOT_CLASSIFIED" | "RETIRED" | "DNS" | "DSQ" | "EXCLUDED";

export interface ResultRow {
  position: number | null;
  positionText: string;
  driverNumber: number;
  driverId: string | null;
  code: string;
  name: string;
  teamId: string | null;
  teamName: string;
  teamColour: string;
  grid: number | null;
  laps: number | null;
  /** Total race time for the winner, otherwise the published gap ("+5.123", "+1 Lap"). */
  timeText: string | null;
  /** Best lap in timed sessions. */
  best: number | null;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  status: string;
  classification: Classification;
  points: number | null;
  fastestLap: { time: number | null; lap: number | null; rank: number | null } | null;
}

export interface SessionResults {
  eventId: string;
  round: number | null;
  eventName: string;
  sessionType: SessionType;
  sessionName: string;
  sessionKey: number | null;
  rows: ResultRow[];
  provenance: Provenance;
}
