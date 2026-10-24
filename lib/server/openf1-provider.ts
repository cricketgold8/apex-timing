import "server-only";
import { findSession, scheduleState, type ScheduleEvent, type ScheduleSession } from "@/lib/config/season-2026";
import {
  buildLapRecords,
  buildSnapshot,
  carsFromLocations,
  dataEnd,
  leaderLapInstant,
  normalisePits,
  normaliseRaceControl,
  normaliseStints,
  trackFromLocations,
  lapTimeline,
  deletedLapIndex,
  type OpenF1SessionRaw,
} from "@/lib/timing/normalisation";
import type { ProviderMode, ReplayOptions, TimingProvider } from "@/lib/timing/providers/types";
import { integrateDistance } from "@/lib/timing/telemetry";
import type { Completeness, Provenance, Sourced, TelemetryLap, TelemetrySample } from "@/lib/timing/types";
import {
  of1CarData,
  of1Driver,
  of1Interval,
  of1Lap,
  of1Location,
  of1Pit,
  of1Position,
  of1RaceControl,
  of1SessionResult,
  of1StartingGrid,
  of1Stint,
  of1Weather,
} from "@/lib/timing/validation";
import { OPENF1_PROVIDER, liveCredentialsConfigured, openf1, type Access, type Filter } from "./openf1";
import { upstreamErrorBody } from "./respond";
import { UpstreamError } from "./upstream";

/**
 * OpenF1-backed providers. `historical` serves completed sessions without credentials; `live` serves the session
 * currently inside its scheduled window and requires OPENF1_USERNAME / OPENF1_PASSWORD. Neither falls back to
 * the other, and neither falls back to demo data.
 */

export class ProviderRefusal extends Error {
  constructor(
    readonly code: "CREDENTIALS_MISSING" | "NOT_FOUND" | "NOT_PUBLISHED" | "BAD_REQUEST",
    message: string,
    readonly mode: "LIVE" | "HISTORICAL" | "UNAVAILABLE",
  ) {
    super(message);
  }
}

const HOUR = 3_600_000;

interface Loaded {
  raw: OpenF1SessionRaw;
  event: ScheduleEvent;
  session: ScheduleSession;
  notes: string[];
  rejected: number;
  completeness: Completeness;
}

function ttlFor(access: Access, session: ScheduleSession): number {
  if (access === "live") return 2_500;
  const sinceEnd = Date.now() - Date.parse(session.end);
  // Results and late corrections appear in the hour after a session; afterwards the data is effectively immutable.
  return sinceEnd < 2 * HOUR ? 60_000 : 6 * HOUR;
}

function resolve(sessionId: string, mode: ProviderMode): { event: ScheduleEvent; session: ScheduleSession; key: number } {
  const key = Number(sessionId);
  if (!Number.isInteger(key) || key <= 0) throw new ProviderRefusal("BAD_REQUEST", `Invalid session id "${sessionId}"`, "UNAVAILABLE");
  const found = findSession(key);
  if (!found) throw new ProviderRefusal("NOT_FOUND", `Session ${key} is not in the 2026 calendar`, "UNAVAILABLE");
  const state = scheduleState(found.session);
  if (state === "cancelled") throw new ProviderRefusal("NOT_FOUND", `${found.event.name} ${found.session.name} was cancelled`, "UNAVAILABLE");
  if (mode === "historical") {
    if (state === "upcoming") throw new ProviderRefusal("NOT_PUBLISHED", `${found.session.name} has not taken place yet`, "UNAVAILABLE");
    if (state === "in-window")
      throw new ProviderRefusal(
        "NOT_PUBLISHED",
        `${found.session.name} is inside its scheduled window. In-progress data is only served by the live provider, which needs OpenF1 credentials.`,
        "UNAVAILABLE",
      );
  }
  if (mode === "live") {
    if (!liveCredentialsConfigured())
      throw new ProviderRefusal("CREDENTIALS_MISSING", "Live timing needs a paid OpenF1 account. Set OPENF1_USERNAME and OPENF1_PASSWORD on the server.", "UNAVAILABLE");
    if (state !== "in-window") throw new ProviderRefusal("NOT_PUBLISHED", `${found.session.name} is not in progress (${state}); use historical data instead.`, "UNAVAILABLE");
  }
  return { ...found, key };
}

async function load(sessionId: string, mode: ProviderMode, opts: { needIntervals: boolean }): Promise<Loaded> {
  const { event, session, key } = resolve(sessionId, mode);
  const access: Access = mode === "live" ? "live" : "historical";
  const ttlMs = ttlFor(access, session);
  const base: Filter[] = [["session_key", "=", key]];
  const isRaceLike = session.type === "RACE" || session.type === "SPRINT";
  const get = <T,>(endpoint: string, schema: Parameters<typeof openf1<T>>[0]["schema"], filters: Filter[] = base) => openf1<T>({ endpoint, filters, schema, access, ttlMs });

  const drivers = await get("drivers", of1Driver);
  const laps = await get("laps", of1Lap);
  const positions = await get("position", of1Position);
  const stints = await get("stints", of1Stint);
  const pits = await get("pit", of1Pit);
  const rc = await get("race_control", of1RaceControl);
  const weather = await get("weather", of1Weather);
  const results = await get("session_result", of1SessionResult);
  const grid = isRaceLike ? await get("starting_grid", of1StartingGrid) : { records: [], rejected: 0, url: "" };
  let intervals = { records: [] as OpenF1SessionRaw["intervals"], rejected: 0, url: "" };
  if (isRaceLike && opts.needIntervals) {
    // Live: only the last half-minute is needed. Historical: the full feed once (cached) so lap replays cost nothing.
    const filters: Filter[] = access === "live" ? [...base, ["date", ">", new Date(Date.now() - 30_000).toISOString()]] : base;
    intervals = await get("intervals", of1Interval, filters);
  }

  const raw: OpenF1SessionRaw = {
    sessionKey: key,
    sessionType: session.type,
    drivers: drivers.records,
    laps: laps.records,
    positions: positions.records,
    intervals: intervals.records,
    stints: stints.records,
    pits: pits.records,
    raceControl: rc.records,
    weather: weather.records,
    results: results.records,
    grid: grid.records,
  };
  const rejected = [drivers, laps, positions, stints, pits, rc, weather, results, grid, intervals].reduce((n, r) => n + r.rejected, 0);

  if (raw.laps.length === 0 && raw.drivers.length === 0) {
    throw new ProviderRefusal("NOT_PUBLISHED", `OpenF1 has not published data for ${event.name} ${session.name} yet.`, mode === "live" ? "LIVE" : "HISTORICAL");
  }

  const notes: string[] = [];
  if (rejected > 0) notes.push(`${rejected} upstream record(s) failed validation and were discarded.`);
  if (raw.results.length === 0) notes.push("No classification published by the provider yet; order follows the position feed.");
  if (isRaceLike && raw.intervals.length === 0 && opts.needIntervals) notes.push("Interval feed unavailable for this session.");
  if (raw.raceControl.length === 0) notes.push("No race-control messages: track status and lap deletions cannot be established.");
  notes.push("Sector colours are derived from the provider's sector times (purple = fastest so far in session, green = personal best).");

  const sinceEnd = Date.now() - Date.parse(session.end);
  const completeness: Completeness = mode === "live" ? "partial" : raw.results.length === 0 ? "partial" : sinceEnd < 24 * HOUR ? "provisional" : "complete";
  if (completeness === "provisional") notes.push("Session ended within the last 24 hours: classification may still be amended by the stewards.");
  return { raw, event, session, notes, rejected, completeness };
}

function provenanceFor(l: Loaded, mode: ProviderMode, sourceTimestamp: string | null, extraNotes: string[] = []): Provenance {
  return {
    provider: OPENF1_PROVIDER,
    mode: mode === "live" ? "LIVE" : "HISTORICAL",
    sessionId: String(l.raw.sessionKey),
    sourceTimestamp,
    fetchedAt: new Date().toISOString(),
    completeness: l.completeness,
    notes: [...l.notes, ...extraNotes],
  };
}

function atMsFor(l: Loaded, opts?: ReplayOptions): number {
  const isRaceLike = l.session.type === "RACE" || l.session.type === "SPRINT";
  if (opts?.atLap != null && isRaceLike) {
    const t = leaderLapInstant(l.raw, opts.atLap);
    if (t !== null) return t + 500;
  }
  return dataEnd(l.raw) ?? Date.now();
}

export function createOpenF1Provider(mode: "live" | "historical"): TimingProvider {
  return {
    mode,
    async getTiming(sessionId, opts) {
      const l = await load(sessionId, mode, { needIntervals: true });
      const snapshot = buildSnapshot(
        l.raw,
        {
          id: sessionId,
          eventName: l.event.name,
          circuitName: l.event.circuit.name,
          country: l.event.circuit.country,
          type: l.session.type,
          name: l.session.name,
          scheduledStart: l.session.start,
          scheduledEnd: l.session.end,
          timeZone: l.event.circuit.timeZone,
        },
        { atLap: mode === "historical" ? opts?.atLap ?? null : null },
      );
      const extra = opts?.atLap != null ? [`Replay: reconstructed at the end of lap ${opts.atLap}.`] : [];
      return { data: snapshot, provenance: provenanceFor(l, mode, snapshot.asOf, extra) };
    },

    async getLapHistory(sessionId, driverNumbers, opts) {
      const l = await load(sessionId, mode, { needIntervals: false });
      const at = atMsFor(l, opts);
      const out: Record<number, ReturnType<typeof buildLapRecords>> = {};
      for (const d of driverNumbers) out[d] = buildLapRecords(l.raw, d, at);
      return { data: out, provenance: provenanceFor(l, mode, new Date(at).toISOString(), ["Lap validity comes from race-control deletion messages; tyre age is derived from the stint's starting age."]) };
    },

    async getStints(sessionId, opts) {
      const l = await load(sessionId, mode, { needIntervals: false });
      const at = atMsFor(l, opts);
      const lapsCompleted: Record<number, number> = {};
      for (const [d, tl] of lapTimeline(l.raw.laps)) lapsCompleted[d] = tl.filter((x) => x.end !== null && x.end <= at).length;
      const stints = normaliseStints(l.raw.stints).filter((s) => s.lapStart <= (lapsCompleted[s.driverNumber] ?? 0) + 1);
      const pits = normalisePits(l.raw.pits).filter((p) => Date.parse(p.at) <= at);
      return { data: { stints, pits, lapsCompleted }, provenance: provenanceFor(l, mode, new Date(at).toISOString()) };
    },

    async getRaceControl(sessionId, opts) {
      const l = await load(sessionId, mode, { needIntervals: false });
      const at = atMsFor(l, opts);
      const messages = normaliseRaceControl(l.raw.raceControl.filter((m) => Date.parse(m.date) <= at), sessionId);
      return { data: messages, provenance: provenanceFor(l, mode, messages[0]?.at ?? null) };
    },

    async getTrack(sessionId, opts) {
      const l = await load(sessionId, mode, { needIntervals: false });
      const access: Access = mode === "live" ? "live" : "historical";
      const key = l.raw.sessionKey;
      // Reference lap: the fastest valid, complete lap of the session.
      const deleted = deletedLapIndex(l.raw.raceControl, l.raw.laps);
      const ref = l.raw.laps
        .filter((x) => typeof x.lap_duration === "number" && x.date_start && !x.is_pit_out_lap && !deleted.has(`${x.driver_number}:${x.lap_number}`))
        .sort((a, b) => (a.lap_duration as number) - (b.lap_duration as number))[0];
      let geometry = null;
      if (ref?.date_start) {
        const start = Date.parse(ref.date_start);
        const end = start + (ref.lap_duration as number) * 1000;
        const loc = await openf1({
          endpoint: "location",
          filters: [["session_key", "=", key], ["driver_number", "=", ref.driver_number], ["date", ">", new Date(start - 200).toISOString()], ["date", "<", new Date(end + 200).toISOString()]],
          schema: of1Location,
          access,
          ttlMs: 24 * HOUR,
        });
        geometry = trackFromLocations(loc.records, start, [ref.duration_sector_1 ?? null, ref.duration_sector_2 ?? null, ref.duration_sector_3 ?? null], `Outline traced from car ${ref.driver_number}'s lap ${ref.lap_number} position data (OpenF1)`);
      }
      const at = mode === "live" ? Date.now() : atMsFor(l, opts);
      const window = await openf1({
        endpoint: "location",
        filters: [["session_key", "=", key], ["date", ">", new Date(at - 2500).toISOString()], ["date", "<", new Date(at).toISOString()]],
        schema: of1Location,
        access,
        ttlMs: mode === "live" ? 2_000 : 6 * HOUR,
      });
      const cars = carsFromLocations(window.records);
      const note = cars.length === 0 ? ["No car positions published for this instant."] : [`Car positions sampled at ${new Date(at).toISOString()}.`];
      return { data: { geometry, cars }, provenance: provenanceFor(l, mode, cars[0]?.at ?? null, note) };
    },

    async getTelemetry(sessionId, driverNumber, lapNumber) {
      const l = await load(sessionId, mode, { needIntervals: false });
      const lap = l.raw.laps.find((x) => x.driver_number === driverNumber && x.lap_number === lapNumber);
      if (!lap?.date_start) throw new ProviderRefusal("NOT_FOUND", `No lap ${lapNumber} for car ${driverNumber} in this session`, mode === "live" ? "LIVE" : "HISTORICAL");
      const start = Date.parse(lap.date_start);
      const tl = lapTimeline(l.raw.laps).get(driverNumber)?.find((x) => x.lap === lapNumber);
      const end = tl?.end ?? (typeof lap.lap_duration === "number" ? start + lap.lap_duration * 1000 : null);
      if (end === null) throw new ProviderRefusal("NOT_PUBLISHED", "Lap is incomplete; telemetry window unknown", mode === "live" ? "LIVE" : "HISTORICAL");
      const res = await openf1({
        endpoint: "car_data",
        filters: [["session_key", "=", l.raw.sessionKey], ["driver_number", "=", driverNumber], ["date", ">", new Date(start).toISOString()], ["date", "<", new Date(end).toISOString()]],
        schema: of1CarData,
        access: mode === "live" ? "live" : "historical",
        ttlMs: 24 * HOUR,
      });
      const rows = res.records.sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length === 0) throw new ProviderRefusal("NOT_PUBLISHED", "OpenF1 has no car data for this lap", mode === "live" ? "LIVE" : "HISTORICAL");
      const base = rows.map((r) => ({ t: (Date.parse(r.date) - start) / 1000, speedKmh: r.speed ?? null }));
      const dist = integrateDistance(base);
      const samples: TelemetrySample[] = rows.map((r, i) => ({
        distance: dist[i]!,
        t: Math.round(base[i]!.t * 1000) / 1000,
        speedKmh: r.speed ?? null,
        throttlePct: r.throttle ?? null,
        // OpenF1 publishes brake as 0/100 (on/off) for current cars.
        brake: r.brake ?? null,
        gear: r.n_gear ?? null,
        rpm: r.rpm ?? null,
      }));
      const duration = (end - start) / 1000;
      const data: TelemetryLap = {
        driverNumber,
        lap: lapNumber,
        lapTime: lap.lap_duration ?? null,
        samples,
        channels: ["speed", "throttle", "brake", "gear", "rpm"],
        distanceBasis: "integrated-speed",
        sampleRateHz: Math.round((rows.length / Math.max(1, duration)) * 10) / 10,
      };
      return {
        data,
        provenance: provenanceFor(l, mode, rows[rows.length - 1]?.date ?? null, [
          "Distance is derived by integrating speed over time; OpenF1 car data has no distance channel.",
          "The provider's `drs` field is not shown: DRS does not exist in the 2026 regulations and the field's 2026 meaning is undocumented.",
        ]),
      };
    },
  };
}

export function toProviderError(err: unknown): { status: number; body: import("@/lib/timing/types").ProviderError } {
  if (err instanceof ProviderRefusal) {
    const status = err.code === "BAD_REQUEST" ? 400 : err.code === "NOT_FOUND" ? 404 : err.code === "CREDENTIALS_MISSING" ? 503 : 409;
    return { status, body: { error: err.message, code: err.code, mode: err.mode, provider: OPENF1_PROVIDER } };
  }
  if (err instanceof UpstreamError) return { status: 502, body: upstreamErrorBody(err) };
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: "Unexpected server error", code: "UPSTREAM_ERROR", mode: "OFFLINE", provider: OPENF1_PROVIDER, detail: message } };
}
