import type { RaceControlCategory, RaceControlMessage, SessionPhase, Severity, TrackStatus, TrackStatusState } from "./types";

/**
 * Track status and session phase are only ever established from explicit race-control messages.
 * Nothing here infers a state from timing gaps, missing data or the clock.
 */

export interface RawRaceControl {
  at: string;
  category: string | null;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  message: string;
  qualifyingPhase?: number | null;
}

export function initialTrackStatus(): TrackStatusState {
  return { status: "UNKNOWN", yellowSectors: [], since: null, basis: null };
}

/** Applies one race-control message to the track-status state machine. Messages must be applied in time order. */
export function applyRaceControl(state: TrackStatusState, msg: RawRaceControl): TrackStatusState {
  const text = msg.message.toUpperCase();
  const flag = (msg.flag ?? "").toUpperCase();
  const scope = (msg.scope ?? "").toUpperCase();
  const cat = (msg.category ?? "").toUpperCase();
  const set = (status: TrackStatus, yellowSectors = state.yellowSectors): TrackStatusState => ({
    status,
    yellowSectors,
    since: msg.at,
    basis: msg.message,
  });

  // Neutralisations take precedence over local flags.
  if (cat === "SAFETYCAR" || /SAFETY CAR|\bVSC\b/.test(text)) {
    if (/VIRTUAL SAFETY CAR ENDING|VSC ENDING/.test(text)) return set("VSC_ENDING");
    if (/VIRTUAL SAFETY CAR|\bVSC\b/.test(text) && /DEPLOYED/.test(text)) return set("VSC");
    if (/SAFETY CAR IN THIS LAP/.test(text)) return set("SAFETY_CAR_ENDING");
    if (/SAFETY CAR DEPLOYED/.test(text)) return set("SAFETY_CAR");
  }

  if (flag === "RED") return set("RED", []);
  if (flag === "CHEQUERED") return set("CHEQUERED", []);

  // A (re)started session — e.g. the next qualifying phase — clears a chequered or red state.
  if (cat === "SESSIONSTATUS" && /SESSION (STARTED|RESUMED)/.test(text) && ["CHEQUERED", "RED", "UNKNOWN"].includes(state.status)) {
    return set("GREEN", []);
  }
  // After the chequered flag, local flags on the in-lap are recorded but do not replace the chequered state.
  if (state.status === "CHEQUERED") {
    if (scope === "SECTOR" && msg.sector !== null) {
      const sectors = new Set(state.yellowSectors);
      if (flag === "YELLOW" || flag === "DOUBLE YELLOW") sectors.add(msg.sector);
      if (flag === "CLEAR" || flag === "GREEN") sectors.delete(msg.sector);
      return { ...state, yellowSectors: [...sectors].sort((a, b) => a - b) };
    }
    return state;
  }

  if (scope === "TRACK" && (flag === "GREEN" || flag === "CLEAR")) {
    // "TRACK CLEAR" ends a neutralisation; a green light at pit exit before the start just opens the track.
    return set("GREEN", []);
  }

  if (scope === "SECTOR" && msg.sector !== null) {
    const sectors = new Set(state.yellowSectors);
    if (flag === "YELLOW" || flag === "DOUBLE YELLOW") sectors.add(msg.sector);
    if (flag === "CLEAR" || flag === "GREEN") sectors.delete(msg.sector);
    const list = [...sectors].sort((a, b) => a - b);
    const neutralised = ["SAFETY_CAR", "SAFETY_CAR_ENDING", "VSC", "VSC_ENDING", "RED"].includes(state.status);
    if (neutralised) return { ...state, yellowSectors: list };
    if (flag === "DOUBLE YELLOW") return set("DOUBLE_YELLOW", list);
    if (flag === "YELLOW") return set(state.status === "DOUBLE_YELLOW" ? "DOUBLE_YELLOW" : "YELLOW", list);
    if (list.length === 0) return set("GREEN", list);
    return { ...state, yellowSectors: list };
  }

  return state;
}

export function trackStatusAt(messages: readonly RawRaceControl[], at: string | null): TrackStatusState {
  const limit = at ? Date.parse(at) : Number.POSITIVE_INFINITY;
  let state = initialTrackStatus();
  for (const m of messages) {
    if (Date.parse(m.at) > limit) break;
    state = applyRaceControl(state, m);
  }
  return state;
}

/** Session phase from SessionStatus messages (and red flags). Qualifying phases restart the session per part. */
export function sessionPhaseAt(messages: readonly RawRaceControl[], at: string | null): { phase: SessionPhase; qualifyingPhase: 1 | 2 | 3 | null } {
  const limit = at ? Date.parse(at) : Number.POSITIVE_INFINITY;
  let phase: SessionPhase = "UNKNOWN";
  let q: 1 | 2 | 3 | null = null;
  let seenAny = false;
  for (const m of messages) {
    if (Date.parse(m.at) > limit) break;
    const text = m.message.toUpperCase();
    const isStatus = (m.category ?? "").toUpperCase() === "SESSIONSTATUS";
    if (m.qualifyingPhase === 1 || m.qualifyingPhase === 2 || m.qualifyingPhase === 3) q = m.qualifyingPhase;
    if (isStatus && /SESSION STARTED|SESSION RESUMED/.test(text)) {
      phase = "RUNNING";
      seenAny = true;
    } else if (isStatus && /SESSION (FINISHED|ENDED|COMPLETE)/.test(text)) {
      phase = "FINISHED";
      seenAny = true;
    } else if ((isStatus && /SUSPENDED/.test(text)) || (m.flag ?? "").toUpperCase() === "RED") {
      phase = "SUSPENDED";
      seenAny = true;
    }
  }
  if (!seenAny) phase = messages.length > 0 ? "NOT_STARTED" : "UNKNOWN";
  return { phase, qualifyingPhase: q };
}

// ---------------------------------------------------------------------------------------------
// Message classification
// ---------------------------------------------------------------------------------------------

const DELETED = /CAR (\d+) \(([A-Z]{3})\) (?:TIME (\d+:\d{2}\.\d{3}) |LAP )DELETED\s*-\s*(.*?)(?:\bLAP (\d+)\b|$)/;

export interface DeletedLap {
  driverNumber: number;
  lap: number | null;
  time: string | null;
  reason: string;
  at: string;
}

/** Parses "CAR 87 (BEA) TIME 1:40.294 DELETED - TRACK LIMITS AT TURN 2 LAP 3 20:07:17". */
export function parseDeletedLap(text: string, at: string): DeletedLap | null {
  const m = DELETED.exec(text.toUpperCase());
  if (!m) return null;
  return {
    driverNumber: Number(m[1]),
    lap: m[5] ? Number(m[5]) : null,
    time: m[3] ?? null,
    reason: (m[4] ?? "").trim(),
    at,
  };
}

/** Car numbers mentioned as "CAR 44 (HAM)" or "CARS 6 (HAD), 77 (BOT) AND 5 (BOR)". */
export function mentionedCars(text: string): number[] {
  const out = new Set<number>();
  const re = /\b(\d{1,2}) \(([A-Z]{3})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text.toUpperCase()))) out.add(Number(m[1]));
  return [...out];
}

export function classifyMessage(raw: RawRaceControl): { category: RaceControlCategory; severity: Severity } {
  const text = raw.message.toUpperCase();
  const flag = (raw.flag ?? "").toUpperCase();
  const cat = (raw.category ?? "").toUpperCase();

  if (cat === "SAFETYCAR" || /SAFETY CAR|\bVSC\b/.test(text)) return { category: "SAFETY_CAR", severity: "warning" };
  if (flag === "RED") return { category: "FLAG", severity: "critical" };
  if (flag === "CHEQUERED") return { category: "SESSION", severity: "info" };
  if (cat === "SESSIONSTATUS") return { category: "SESSION", severity: "info" };
  if (/DELETED/.test(text)) return { category: "LAP_DELETED", severity: "caution" };
  if (/PENALTY|DISQUALIFIED|REPRIMAND|DRIVE THROUGH|STOP AND GO|GRID DROP/.test(text) && !/NO FURTHER|NOTED|WILL BE INVESTIGATED|UNDER INVESTIGATION/.test(text)) {
    return { category: "PENALTY", severity: "warning" };
  }
  if (/INVESTIGAT|NOTED|REVIEWED|NO FURTHER/.test(text)) return { category: "INVESTIGATION", severity: "caution" };
  if (/TRACK LIMITS/.test(text) || flag === "BLACK AND WHITE") return { category: "TRACK_LIMITS", severity: "caution" };
  if (/OVERTAKE (ENABLED|DISABLED)/.test(text)) return { category: "OVERTAKE_MODE", severity: "info" };
  if (/PIT (EXIT|ENTRY|LANE)/.test(text)) return { category: "PIT_LANE", severity: "info" };
  if (/CLASSIFICATION|RESULTS? (ARE )?(PROVISIONAL|FINAL|OFFICIAL)/.test(text)) return { category: "CLASSIFICATION", severity: "info" };
  if (flag === "YELLOW" || flag === "DOUBLE YELLOW") return { category: "FLAG", severity: flag === "DOUBLE YELLOW" ? "warning" : "caution" };
  if (flag === "GREEN" || flag === "CLEAR") return { category: "TRACK_STATUS", severity: "info" };
  if (flag === "BLUE") return { category: "FLAG", severity: "info" };
  if (cat === "FLAG") return { category: "FLAG", severity: "info" };
  return { category: "NOTICE", severity: "info" };
}

export const CATEGORY_LABEL: Record<RaceControlCategory, string> = {
  TRACK_STATUS: "Track status",
  FLAG: "Flag",
  SAFETY_CAR: "SC / VSC",
  INVESTIGATION: "Investigation",
  PENALTY: "Penalty",
  LAP_DELETED: "Lap deleted",
  TRACK_LIMITS: "Track limits",
  SESSION: "Session",
  PIT_LANE: "Pit lane",
  OVERTAKE_MODE: "Overtake mode",
  CLASSIFICATION: "Classification",
  NOTICE: "Notice",
};

export const TRACK_STATUS_LABEL: Record<TrackStatus, string> = {
  GREEN: "Green flag",
  YELLOW: "Yellow",
  DOUBLE_YELLOW: "Double yellow",
  SAFETY_CAR: "Safety Car",
  SAFETY_CAR_ENDING: "Safety Car in this lap",
  VSC: "Virtual Safety Car",
  VSC_ENDING: "VSC ending",
  RED: "Red flag",
  CHEQUERED: "Chequered flag",
  UNKNOWN: "Track status unavailable",
};

export const PHASE_LABEL: Record<SessionPhase, string> = {
  NOT_STARTED: "Not started",
  RUNNING: "Session running",
  SUSPENDED: "Session suspended",
  FINISHED: "Session finished",
  UNKNOWN: "Status unavailable",
};

export function toRaceControlMessage(raw: RawRaceControl & { lap: number | null; driverNumber: number | null }, sessionId: string, index: number, source: RaceControlMessage["source"]): RaceControlMessage {
  const { category, severity } = classifyMessage(raw);
  const cars = new Set(mentionedCars(raw.message));
  if (raw.driverNumber !== null) cars.add(raw.driverNumber);
  return {
    id: `${sessionId}-${index}-${raw.at}`,
    at: raw.at,
    sessionId,
    lap: raw.lap,
    category,
    severity,
    driverNumbers: [...cars],
    flag: raw.flag,
    scope: raw.scope,
    sector: raw.sector,
    text: raw.message,
    source,
  };
}
