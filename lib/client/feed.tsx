"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { latestCompletedSession, scheduleState, SEASON_2026, type ScheduleEvent, type ScheduleSession } from "@/lib/config/season-2026";
import { freshness, type Freshness } from "@/lib/timing/calculations";
import { demoSnapshot, demoTimeForLap, demoTimeRange } from "@/lib/timing/providers/demo/provider";
import { DEMO_SESSION_ID } from "@/lib/timing/providers/demo/race";
import type { Provenance, Sourced, TimingSnapshot } from "@/lib/timing/types";
import { useRemoteResource, type ResourceState } from "./remote";
import { useSettings } from "./settings";
import { readJson, writeJson } from "./storage";

/**
 * Which provider feeds the timing views. The choice follows the user's selection and the schedule; it never
 * switches provider because a request failed.
 */
export type Source =
  | { kind: "demo" }
  | { kind: "historical"; sessionKey: number }
  | { kind: "live"; sessionKey: number }
  | { kind: "live-unavailable"; sessionKey: number; reason: string }
  | { kind: "scheduled"; sessionKey: number; start: string }
  | { kind: "cancelled"; sessionKey: number }
  | { kind: "none" };

export interface DemoClock {
  t: number;
  playing: boolean;
  speed: number;
  range: { start: number; end: number; chequered: number };
  setT: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  jumpToLap: (lap: number) => void;
}

interface StatusInfo {
  liveConfigured: boolean;
  serverNow: string;
}

interface FeedCtx {
  event: ScheduleEvent | null;
  session: ScheduleSession | null;
  setEvent: (eventId: string) => void;
  setSession: (sessionKey: number) => void;
  source: Source;
  status: StatusInfo | null;
  selectedDriver: number | null;
  setSelectedDriver: (n: number | null) => void;
  atLap: number | null;
  setAtLap: (lap: number | null) => void;
  demo: DemoClock;
  snapshot: ResourceState<TimingSnapshot>;
  freshness: Freshness;
  /** Query string identifying the current dataset for API resources (null for demo / no data). */
  query: string | null;
  scope: string;
  reload: () => void;
}

const FeedContext = createContext<FeedCtx | null>(null);
const SEL_KEY = "apex.selection.v1";

function defaultSelection(): { eventId: string; sessionKey: number | null } {
  const latest = latestCompletedSession();
  if (latest) return { eventId: latest.event.id, sessionKey: latest.session.openf1SessionKey };
  const first = SEASON_2026.events.find((e) => e.round !== null) ?? SEASON_2026.events[0]!;
  return { eventId: first.id, sessionKey: first.sessions[0]?.openf1SessionKey ?? null };
}

const STALE_AFTER_MS = 30_000;

export function FeedProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [selection, setSelection] = useState<{ eventId: string; sessionKey: number | null }>(() => defaultSelection());
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [atLap, setAtLap] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const stored = readJson<{ eventId: string; sessionKey: number | null } | null>("session", SEL_KEY, null);
    if (stored && SEASON_2026.events.some((e) => e.id === stored.eventId)) setSelection(stored);
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/status", { signal: ctl.signal })
      .then((r) => r.json())
      .then((j: { providers: { live: { configured: boolean } }; now: string }) => setStatus({ liveConfigured: j.providers.live.configured, serverNow: j.now }))
      .catch(() => setStatus(null));
    return () => ctl.abort();
  }, []);

  // One-second clock for freshness labels and schedule transitions.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const event = SEASON_2026.events.find((e) => e.id === selection.eventId) ?? null;
  const session = event?.sessions.find((s) => s.openf1SessionKey === selection.sessionKey) ?? null;

  const setEvent = useCallback((eventId: string) => {
    const ev = SEASON_2026.events.find((e) => e.id === eventId);
    if (!ev) return;
    // Prefer the latest completed session of the event, else its first session.
    const completed = ev.sessions.filter((s) => scheduleState(s) === "completed");
    const pick = completed[completed.length - 1] ?? ev.sessions.find((s) => scheduleState(s) === "in-window") ?? ev.sessions[0];
    const next = { eventId, sessionKey: pick?.openf1SessionKey ?? null };
    writeJson("session", SEL_KEY, next);
    setSelection(next);
    setAtLap(null);
  }, []);

  const setSession = useCallback((sessionKey: number) => {
    const ev = SEASON_2026.events.find((e) => e.sessions.some((s) => s.openf1SessionKey === sessionKey));
    if (!ev) return;
    const next = { eventId: ev.id, sessionKey };
    writeJson("session", SEL_KEY, next);
    setSelection(next);
    setAtLap(null);
  }, []);

  // Minute-resolution clock for schedule state so the source doesn't change identity every second.
  const minute = Math.floor(now / 60_000);
  const source: Source = useMemo(() => {
    if (settings.demoMode) return { kind: "demo" };
    if (!session || !event) return { kind: "none" };
    const st = scheduleState(session, new Date(minute * 60_000 + 30_000));
    const key = session.openf1SessionKey;
    if (st === "cancelled") return { kind: "cancelled", sessionKey: key };
    if (st === "upcoming") return { kind: "scheduled", sessionKey: key, start: session.start };
    if (st === "in-window") {
      if (status?.liveConfigured) return { kind: "live", sessionKey: key };
      return { kind: "live-unavailable", sessionKey: key, reason: "This session is in progress. Live timing needs OpenF1 credentials on the server (see .env.example)." };
    }
    return { kind: "historical", sessionKey: key };
  }, [settings.demoMode, session, event, minute, status?.liveConfigured]);

  // ---- Demo clock -----------------------------------------------------------------------------
  const range = useMemo(() => demoTimeRange(), []);
  const [demoT, setDemoT] = useState(() => demoTimeForLap(18));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const tRef = useRef(demoT);
  tRef.current = demoT;
  useEffect(() => {
    if (source.kind !== "demo" || !playing) return;
    const id = setInterval(() => {
      const next = Math.min(range.end, tRef.current + 0.25 * speed);
      setDemoT(next);
      if (next >= range.end) setPlaying(false);
    }, 250);
    return () => clearInterval(id);
  }, [source.kind, playing, speed, range.end]);
  const demo: DemoClock = useMemo(
    () => ({
      t: demoT,
      playing,
      speed,
      range,
      setT: (t: number) => setDemoT(Math.max(range.start, Math.min(range.end, t))),
      setPlaying,
      setSpeed,
      jumpToLap: (lap: number) => setDemoT(demoTimeForLap(lap)),
    }),
    [demoT, playing, speed, range],
  );

  // ---- Snapshot -------------------------------------------------------------------------------
  const query =
    source.kind === "historical"
      ? `mode=historical&session=${source.sessionKey}${atLap ? `&atLap=${atLap}` : ""}`
      : source.kind === "live"
        ? `mode=live&session=${source.sessionKey}`
        : null;
  const scope = source.kind === "demo" ? DEMO_SESSION_ID : "sessionKey" in source ? `${source.kind}:${source.sessionKey}` : "none";
  const remote = useRemoteResource<TimingSnapshot>(query ? `/api/timing/snapshot?${query}` : null, {
    scope,
    pollMs: source.kind === "live" ? settings.refreshMs : null,
    monotonic: source.kind === "live",
  });

  const demoState: ResourceState<TimingSnapshot> | null = useMemo(() => {
    if (source.kind !== "demo") return null;
    const s: Sourced<TimingSnapshot> = demoSnapshot(demoT);
    return { data: s.data, provenance: s.provenance, status: "ready", error: null, lastSuccessAt: Date.now(), offline: false };
  }, [source.kind, demoT]);

  const snapshot = demoState ?? remote;
  const mode: Provenance["mode"] = snapshot.provenance?.mode ?? "UNAVAILABLE";
  const fresh = freshness({ mode, lastSourceTimestamp: snapshot.provenance?.sourceTimestamp ?? null, lastRequestFailed: snapshot.offline, now, thresholdMs: STALE_AFTER_MS });

  const value: FeedCtx = {
    event,
    session,
    setEvent,
    setSession,
    source,
    status,
    selectedDriver,
    setSelectedDriver,
    atLap,
    setAtLap,
    demo,
    snapshot,
    freshness: fresh,
    query,
    scope,
    reload: remote.reload,
  };
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): FeedCtx {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside FeedProvider");
  return ctx;
}

/**
 * A timing resource for the current source: computed locally in demo mode, fetched from /api/timing otherwise.
 * Polls only in live mode.
 */
export function useTimingResource<T>(resource: "race-control" | "stints" | "track", demoFn: (t: number) => Sourced<T>, opts: { pollMs?: number; enabled?: boolean } = {}): ResourceState<T> & { reload: () => void } {
  const { source, query, scope, demo } = useFeed();
  const { settings } = useSettings();
  const enabled = opts.enabled ?? true;
  const remote = useRemoteResource<T>(enabled && query ? `/api/timing/${resource}?${query}` : null, {
    scope,
    pollMs: source.kind === "live" ? opts.pollMs ?? settings.refreshMs : null,
    monotonic: source.kind === "live",
  });
  const local = useMemo(() => {
    if (source.kind !== "demo" || !enabled) return null;
    const s = demoFn(demo.t);
    return { data: s.data, provenance: s.provenance, status: "ready" as const, error: null, lastSuccessAt: Date.now(), offline: false, reload: () => {} };
    // demoFn identity is stable at call sites (module functions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind, demo.t, enabled]);
  return local ?? remote;
}
