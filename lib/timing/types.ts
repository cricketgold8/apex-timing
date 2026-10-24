import type { SessionType } from "@/lib/config/season-2026";

/**
 * Domain model shared by every provider. Times are seconds (number) unless the name says otherwise;
 * instants are ISO 8601 UTC strings. `null` always means "not supplied by the source" — never zero.
 */

// ---------------------------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------------------------

/** What kind of data is on screen. Exactly one mode per dataset; providers never mix modes. */
export type DataMode = "LIVE" | "HISTORICAL" | "DEMO" | "OFFLINE" | "UNAVAILABLE";

export type Completeness = "complete" | "partial" | "provisional";

export interface Provenance {
  provider: string;
  mode: DataMode;
  sessionId: string | null;
  /** Latest timestamp contained in the source data itself (not when we fetched it). */
  sourceTimestamp: string | null;
  fetchedAt: string;
  completeness: Completeness;
  notes: string[];
}

export interface Sourced<T> {
  data: T;
  provenance: Provenance;
}

/** Error shape returned by API routes. `mode` tells the UI how to label the empty state. */
export interface ProviderError {
  error: string;
  code: "CREDENTIALS_MISSING" | "UPSTREAM_ERROR" | "NOT_FOUND" | "NOT_PUBLISHED" | "BAD_REQUEST" | "RATE_LIMITED" | "UNAUTHORISED" | "LIVE_LOCKED";
  mode: DataMode;
  provider: string;
  detail?: string;
}

// ---------------------------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------------------------

export type { SessionType };

export type TrackStatus =
  | "GREEN"
  | "YELLOW"
  | "DOUBLE_YELLOW"
  | "SAFETY_CAR"
  | "SAFETY_CAR_ENDING"
  | "VSC"
  | "VSC_ENDING"
  | "RED"
  | "CHEQUERED"
  | "UNKNOWN";

export type SessionPhase = "NOT_STARTED" | "RUNNING" | "SUSPENDED" | "FINISHED" | "UNKNOWN";

export interface TrackStatusState {
  status: TrackStatus;
  /** Sectors currently under a local yellow / double yellow (marshal sector numbers from the source). */
  yellowSectors: number[];
  since: string | null;
  /** Message that established the state, quoted from the source. */
  basis: string | null;
}

export interface Weather {
  airTempC: number | null;
  trackTempC: number | null;
  humidityPct: number | null;
  pressureMbar: number | null;
  rainfall: boolean | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  observedAt: string;
}

export interface SessionInfo {
  id: string;
  eventName: string;
  circuitName: string;
  country: string;
  type: SessionType;
  name: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  timeZone: string;
  totalLaps: number | null;
  qualifyingPhase: 1 | 2 | 3 | null;
}

// ---------------------------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------------------------

export type Compound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET";

/** Purple = fastest in session; green = driver's personal best; yellow = completed, neither. */
export type TimingMark = "session-best" | "personal-best" | "normal" | "invalid";

export interface TimedValue {
  value: number | null;
  mark: TimingMark | null;
}

export interface SectorCell extends TimedValue {
  /** true when the value belongs to the lap in progress; false when it is carried over from the previous lap. */
  current: boolean;
}

export type Gap =
  | { kind: "time"; seconds: number }
  | { kind: "laps"; laps: number }
  | { kind: "leader" }
  | { kind: "none" };

export type DriverRunState = "RUNNING" | "PIT" | "OUT" | "IN" | "RETIRED" | "DNS" | "DSQ" | "STOPPED" | "FINISHED" | "UNKNOWN";

export type TyreAgeBasis = "sourced" | "derived" | "unknown";

export interface TyreInfo {
  compound: Compound | null;
  /** Laps completed on this set, including laps from earlier sessions when the source says so. */
  age: number | null;
  ageBasis: TyreAgeBasis;
  stintNumber: number | null;
}

export interface QualifyingTimes {
  q1: number | null;
  q2: number | null;
  q3: number | null;
  /** Phase in which the driver was eliminated, when the classification establishes it. */
  eliminatedIn: 1 | 2 | null;
}

export interface TimingRow {
  driverNumber: number;
  code: string;
  name: string;
  teamId: string | null;
  teamColour: string;
  position: number | null;
  /** Positive = places gained against the reference (`positionReference`). */
  positionChange: number | null;
  lapsCompleted: number | null;
  currentLap: number | null;
  lastLap: TimedValue;
  bestLap: TimedValue & { lap: number | null };
  gap: Gap;
  interval: Gap;
  sectors: [SectorCell, SectorCell, SectorCell];
  speedTrap: TimedValue;
  tyre: TyreInfo;
  pitStops: number | null;
  state: DriverRunState;
  qualifying: QualifyingTimes | null;
}

export type OrderBasis = "race-position" | "best-lap" | "classification";

export interface SessionBests {
  lap: { driverNumber: number; time: number; lap: number } | null;
  sectors: [number | null, number | null, number | null];
  speedTrap: number | null;
}

export interface TimingSnapshot {
  session: SessionInfo;
  rows: TimingRow[];
  orderBasis: OrderBasis;
  positionReference: "grid" | "start-of-session" | "previous-update" | null;
  bests: SessionBests;
  trackStatus: TrackStatusState;
  phase: SessionPhase;
  leaderLap: number | null;
  clock: { elapsed: number | null; remaining: number | null; basis: "source" | "simulation" | "none" };
  weather: Weather | null;
  /** Instant this snapshot represents (end of data for completed sessions). */
  asOf: string | null;
  /** Lap scrubbing range for replays of completed race sessions. */
  replay: { minLap: number; maxLap: number; atLap: number | null } | null;
}

// ---------------------------------------------------------------------------------------------
// Laps, stints, race control, telemetry, track
// ---------------------------------------------------------------------------------------------

export interface LapRecord {
  driverNumber: number;
  lap: number;
  startedAt: string | null;
  time: number | null;
  sectors: [number | null, number | null, number | null];
  speedTrap: number | null;
  compound: Compound | null;
  tyreAge: number | null;
  tyreAgeBasis: TyreAgeBasis;
  pitIn: boolean;
  pitOut: boolean;
  /** false when race control deleted the lap; null when validity is not known. */
  valid: boolean | null;
  deletedReason: string | null;
  personalBest: boolean;
  /** Under SC / VSC / red flag at some point during the lap, when established from race control. */
  neutralised: boolean | null;
}

export interface Stint {
  driverNumber: number;
  stint: number;
  compound: Compound | null;
  lapStart: number;
  lapEnd: number | null;
  tyreAgeAtStart: number | null;
}

export interface PitStop {
  driverNumber: number;
  lap: number;
  at: string;
  laneDuration: number | null;
  stopDuration: number | null;
}

export type RaceControlCategory =
  | "TRACK_STATUS"
  | "FLAG"
  | "SAFETY_CAR"
  | "INVESTIGATION"
  | "PENALTY"
  | "LAP_DELETED"
  | "TRACK_LIMITS"
  | "SESSION"
  | "PIT_LANE"
  | "OVERTAKE_MODE"
  | "CLASSIFICATION"
  | "NOTICE";

export type Severity = "info" | "caution" | "warning" | "critical";

export interface RaceControlMessage {
  id: string;
  at: string;
  sessionId: string;
  lap: number | null;
  category: RaceControlCategory;
  severity: Severity;
  driverNumbers: number[];
  flag: string | null;
  scope: string | null;
  sector: number | null;
  text: string;
  source: "FIA race control (via OpenF1)" | "DEMO — fictional";
}

export interface TelemetrySample {
  /** metres from the start of the lap (derived by integrating speed when the source has no distance). */
  distance: number;
  /** seconds since the lap started */
  t: number;
  speedKmh: number | null;
  throttlePct: number | null;
  brake: number | null;
  gear: number | null;
  rpm: number | null;
}

export interface TelemetryLap {
  driverNumber: number;
  lap: number;
  lapTime: number | null;
  samples: TelemetrySample[];
  channels: Array<"speed" | "throttle" | "brake" | "gear" | "rpm">;
  distanceBasis: "integrated-speed" | "simulated";
  sampleRateHz: number | null;
}

export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackGeometry {
  outline: TrackPoint[];
  /** Indices into `outline` where sector 1/2 end (sector 3 ends at the start line, index 0). */
  sectorBoundaries: [number, number] | null;
  basis: string;
}

export interface CarPosition {
  driverNumber: number;
  x: number;
  y: number;
  at: string;
}
