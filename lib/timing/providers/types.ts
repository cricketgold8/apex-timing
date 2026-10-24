import type { CarPosition, LapRecord, PitStop, RaceControlMessage, Sourced, Stint, TelemetryLap, TimingSnapshot, TrackGeometry } from "../types";

/**
 * Contract every timing provider implements. Providers are separate modules (`demo/`, `openf1-*`) and never
 * substitute for one another: a failed live request returns an error, not demo or historical data.
 *
 * Schedule and classified results are served by their own modules (lib/config/season-2026.ts,
 * lib/server/results.ts) because they come from different sources with different update cycles.
 */
export type ProviderMode = "live" | "historical" | "demo";

export interface ReplayOptions {
  /** Reconstruct the session as it stood when the leader completed this lap (completed races only). */
  atLap?: number | null;
}

export interface TimingProvider {
  readonly mode: ProviderMode;
  getTiming(sessionId: string, opts?: ReplayOptions): Promise<Sourced<TimingSnapshot>>;
  getLapHistory(sessionId: string, driverNumbers: number[], opts?: ReplayOptions): Promise<Sourced<Record<number, LapRecord[]>>>;
  getStints(sessionId: string, opts?: ReplayOptions): Promise<Sourced<{ stints: Stint[]; pits: PitStop[]; lapsCompleted: Record<number, number> }>>;
  getRaceControl(sessionId: string, opts?: ReplayOptions): Promise<Sourced<RaceControlMessage[]>>;
  getTrack(sessionId: string, opts?: ReplayOptions): Promise<Sourced<{ geometry: TrackGeometry | null; cars: CarPosition[] }>>;
  getTelemetry(sessionId: string, driverNumber: number, lap: number): Promise<Sourced<TelemetryLap>>;
}
