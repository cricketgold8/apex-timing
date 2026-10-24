import { describe, expect, it } from "vitest";
import { classifyMessage, mentionedCars, parseDeletedLap, sessionPhaseAt, trackStatusAt, type RawRaceControl } from "@/lib/timing/status";

const m = (at: string, message: string, extra: Partial<RawRaceControl> = {}): RawRaceControl => ({
  at: `2026-10-11T${at}Z`,
  category: "Other",
  flag: null,
  scope: null,
  sector: null,
  message,
  ...extra,
});

// Sequence modelled on the 2026 Singapore GP race-control feed.
const race: RawRaceControl[] = [
  m("11:20:00", "GREEN LIGHT - PIT EXIT OPEN", { category: "Flag", flag: "GREEN", scope: "Track" }),
  m("12:03:39", "SESSION STARTED", { category: "SessionStatus" }),
  m("12:16:35", "VSC DEPLOYED", { category: "SafetyCar" }),
  m("12:17:40", "VSC ENDING", { category: "SafetyCar" }),
  m("12:17:54", "TRACK CLEAR", { category: "Flag", flag: "CLEAR", scope: "Track" }),
  m("12:53:13", "YELLOW IN TRACK SECTOR 6", { category: "Flag", flag: "YELLOW", scope: "Sector", sector: 6 }),
  m("12:53:13", "YELLOW IN TRACK SECTOR 5", { category: "Flag", flag: "YELLOW", scope: "Sector", sector: 5 }),
  m("12:53:35", "CLEAR IN TRACK SECTOR 6", { category: "Flag", flag: "CLEAR", scope: "Sector", sector: 6 }),
  m("12:53:35", "CLEAR IN TRACK SECTOR 5", { category: "Flag", flag: "CLEAR", scope: "Sector", sector: 5 }),
  m("13:45:40", "CHEQUERED FLAG", { category: "Flag", flag: "CHEQUERED", scope: "Track" }),
  m("13:45:40", "SESSION FINISHED", { category: "SessionStatus" }),
  m("13:47:00", "DOUBLE YELLOW IN TRACK SECTOR 9", { category: "Flag", flag: "DOUBLE YELLOW", scope: "Sector", sector: 9 }),
];

describe("track status state machine", () => {
  it("is unknown before any message", () => {
    expect(trackStatusAt(race, "2026-10-11T11:00:00Z").status).toBe("UNKNOWN");
  });

  it("follows VSC deployment, ending and track clear", () => {
    expect(trackStatusAt(race, "2026-10-11T12:17:00Z").status).toBe("VSC");
    expect(trackStatusAt(race, "2026-10-11T12:17:45Z").status).toBe("VSC_ENDING");
    expect(trackStatusAt(race, "2026-10-11T12:18:00Z").status).toBe("GREEN");
  });

  it("tracks local yellows per sector and clears them", () => {
    const y = trackStatusAt(race, "2026-10-11T12:53:20Z");
    expect(y.status).toBe("YELLOW");
    expect(y.yellowSectors).toEqual([5, 6]);
    expect(trackStatusAt(race, "2026-10-11T12:54:00Z").status).toBe("GREEN");
  });

  it("keeps the chequered state after the finish", () => {
    const s = trackStatusAt(race, null);
    expect(s.status).toBe("CHEQUERED");
    expect(s.yellowSectors).toEqual([9]);
  });

  it("handles safety car and red flags from explicit messages only", () => {
    const sc = [m("10:00:00", "SAFETY CAR DEPLOYED", { category: "SafetyCar" }), m("10:05:00", "SAFETY CAR IN THIS LAP", { category: "SafetyCar" })];
    expect(trackStatusAt(sc, "2026-10-11T10:01:00Z").status).toBe("SAFETY_CAR");
    expect(trackStatusAt(sc, "2026-10-11T10:06:00Z").status).toBe("SAFETY_CAR_ENDING");
    const red = [m("10:00:00", "RED FLAG", { category: "Flag", flag: "RED", scope: "Track" })];
    expect(trackStatusAt(red, null).status).toBe("RED");
    // A gap in data with no message never produces a red flag.
    expect(trackStatusAt([], null).status).toBe("UNKNOWN");
  });

  it("restarts after a qualifying phase's chequered flag", () => {
    const q = [
      m("13:30:00", "SESSION STARTED", { category: "SessionStatus", qualifyingPhase: 1 }),
      m("13:48:00", "CHEQUERED FLAG", { category: "Flag", flag: "CHEQUERED", qualifyingPhase: 1 }),
      m("13:55:00", "SESSION STARTED", { category: "SessionStatus", qualifyingPhase: 2 }),
    ];
    expect(trackStatusAt(q, "2026-10-11T13:50:00Z").status).toBe("CHEQUERED");
    expect(trackStatusAt(q, "2026-10-11T13:56:00Z").status).toBe("GREEN");
    expect(sessionPhaseAt(q, "2026-10-11T13:56:00Z")).toEqual({ phase: "RUNNING", qualifyingPhase: 2 });
  });
});

describe("session phase", () => {
  it("moves from not started to running to finished", () => {
    expect(sessionPhaseAt(race, "2026-10-11T11:30:00Z").phase).toBe("NOT_STARTED");
    expect(sessionPhaseAt(race, "2026-10-11T12:30:00Z").phase).toBe("RUNNING");
    expect(sessionPhaseAt(race, null).phase).toBe("FINISHED");
    expect(sessionPhaseAt([], null).phase).toBe("UNKNOWN");
  });
});

describe("message parsing", () => {
  it("parses deleted lap messages with a quoted time", () => {
    expect(parseDeletedLap("CAR 87 (BEA) TIME 1:40.294 DELETED - TRACK LIMITS AT TURN 2 LAP 3 20:07:17", "x")).toEqual({
      driverNumber: 87,
      lap: 3,
      time: "1:40.294",
      reason: "TRACK LIMITS AT TURN 2",
      at: "x",
    });
  });

  it("parses 'LAP DELETED' and 'NEXT LAP' variants", () => {
    expect(parseDeletedLap("CAR 6 (HAD) LAP DELETED - TRACK LIMITS AT TURN 2 LAP 33 20:57:43 (PIT)", "x")?.lap).toBe(33);
    const next = parseDeletedLap("CAR 81 (PIA) TIME 2:44.987 DELETED - TRACK LIMITS AT TURN 20 (NEXT LAP)", "x");
    expect(next?.time).toBe("2:44.987");
    expect(next?.lap).toBeNull();
  });

  it("ignores unrelated messages", () => {
    expect(parseDeletedLap("TRACK CLEAR", "x")).toBeNull();
  });

  it("extracts every car mentioned", () => {
    expect(mentionedCars("FIA STEWARDS: Q1 INCIDENT INVOLVING CARS 6 (HAD), 77 (BOT), 18 (STR) AND 5 (BOR) NOTED")).toEqual([6, 77, 18, 5]);
  });

  it("classifies messages by category", () => {
    expect(classifyMessage(m("1", "CAR 44 (HAM) TIME 1:32.123 DELETED - TRACK LIMITS AT TURN 9 LAP 13")).category).toBe("LAP_DELETED");
    expect(classifyMessage(m("1", "FIA STEWARDS: INCIDENT INVOLVING CAR 18 (STR) WILL BE INVESTIGATED AFTER THE RACE")).category).toBe("INVESTIGATION");
    expect(classifyMessage(m("1", "FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 55 (SAI) - CAUSING A COLLISION")).category).toBe("PENALTY");
    expect(classifyMessage(m("1", "VSC DEPLOYED", { category: "SafetyCar" })).category).toBe("SAFETY_CAR");
    expect(classifyMessage(m("1", "OVERTAKE ENABLED")).category).toBe("OVERTAKE_MODE");
    expect(classifyMessage(m("1", "RED FLAG", { flag: "RED", category: "Flag" })).severity).toBe("critical");
  });
});
