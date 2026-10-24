"use client";

import { CalendarClock, FlaskConical, History } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { latestCompletedSession } from "@/lib/config/season-2026";
import { columnsFor, useColumnVisibility } from "@/lib/client/columns";
import { useFeed } from "@/lib/client/feed";
import { useHydrated, useNow } from "@/lib/client/hooks";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { formatClock, formatDateTime } from "@/lib/timing/formatters";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ProviderErrorMessage, SimulatedBanner, StateMessage } from "@/components/ui/primitives";
import { ProvenanceNote } from "@/components/ui/Provenance";
import { RaceControlFeed } from "@/components/race-control/RaceControlFeed";
import { TyreStintTimeline } from "@/components/strategy/TyreStintTimeline";
import { TrackPanel } from "@/components/track/TrackPanel";
import { LapHistory } from "./LapHistory";
import { LapTimeChart } from "./LapTimeChart";
import { SectorComparison } from "./SectorComparison";
import { OFFICIAL_SORT, TimingTower, type SortState } from "./TimingTower";
import { TimingToolbar } from "./TimingToolbar";

function FallbackActions() {
  const feed = useFeed();
  const { update } = useSettings();
  const latest = latestCompletedSession();
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-2">
      {latest && (
        <button className="btn" onClick={() => feed.setSession(latest.session.openf1SessionKey)}>
          <History size={13} aria-hidden /> Latest completed: {latest.event.name} — {latest.session.name}
        </button>
      )}
      <button className="btn" onClick={() => update({ demoMode: true })}>
        <FlaskConical size={13} aria-hidden /> Open demo session (simulated)
      </button>
    </div>
  );
}

export function LiveTimingView() {
  const feed = useFeed();
  const { settings, update } = useSettings();
  const { visible } = useColumnVisibility();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const now = useNow(1000);
  const [sort, setSort] = useState<SortState>(OFFICIAL_SORT);
  const [compare, setCompare] = useState<[number | null, number | null]>([null, null]);

  // Deep links: /timing?session=11388 or /timing?demo=1
  useEffect(() => {
    const s = params.get("session");
    if (s && /^\d+$/.test(s)) feed.setSession(Number(s));
    if (params.get("demo") === "1") update({ demoMode: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setSort(OFFICIAL_SORT), [feed.scope]);

  const snap = feed.snapshot.data;
  const columns = useMemo(() => (snap ? columnsFor(snap.session.type, visible, settings.compact) : []), [snap?.session.type, visible, settings.compact]);

  // Selected driver defaults to the leader of the current dataset.
  const leader = snap?.rows[0]?.driverNumber ?? null;
  const selected = snap && feed.selectedDriver !== null && snap.rows.some((r) => r.driverNumber === feed.selectedDriver) ? feed.selectedDriver : leader;
  const pickB = (a: number | null) => {
    if (!snap) return null;
    const idx = snap.rows.findIndex((r) => r.driverNumber === a);
    return snap.rows[idx > 0 ? idx - 1 : 1]?.driverNumber ?? null;
  };
  const cmpA = compare[0] ?? settings.compare[0] ?? selected;
  const cmpB = compare[1] ?? settings.compare[1] ?? pickB(cmpA);
  const onSelect = useCallback((n: number) => feed.setSelectedDriver(n), [feed]);

  const tz = resolveTimeZone(settings.timeZone, feed.event?.circuit.timeZone);
  const src = feed.source;

  // ---- Non-data states ---------------------------------------------------------------------------
  if (src.kind === "none") return <StateMessage kind="empty" title="Select a Grand Prix and session" />;
  if (src.kind === "cancelled")
    return (
      <div className="panel">
        <StateMessage kind="info" title="Session cancelled">
          {feed.event?.name} — {feed.session?.name} was cancelled (per the OpenF1 calendar). There is no timing.
          <FallbackActions />
        </StateMessage>
      </div>
    );
  if (src.kind === "scheduled")
    return (
      <div className="panel">
        <StateMessage kind="info" title={`${feed.event?.name} — ${feed.session?.name} has not started`}>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={13} aria-hidden />
            {hydrated ? formatDateTime(src.start, { timeZone: tz, hour12: settings.hour12 }) : ""}
            {hydrated && now ? ` · starts in ${formatClock(Math.max(0, (Date.parse(src.start) - now) / 1000))}` : ""}
          </span>
          <span className="block pt-1">No timing exists before the session. Nothing is shown in its place.</span>
          <FallbackActions />
        </StateMessage>
      </div>
    );
  if (src.kind === "live-unavailable")
    return (
      <div className="panel">
        <StateMessage kind="info" title="Live timing unavailable">
          {src.reason} The app will not display partial or unauthenticated data as live timing.
          <FallbackActions />
        </StateMessage>
      </div>
    );

  if (feed.snapshot.status === "error" && feed.snapshot.error && !snap)
    return (
      <div className="panel">
        <ProviderErrorMessage error={feed.snapshot.error} onRetry={feed.reload} extra={<FallbackActions />} />
      </div>
    );
  if (!snap)
    return (
      <div className="panel">
        <StateMessage kind="loading" title="Loading timing data">
          {src.kind === "historical" ? "Fetching laps, positions, intervals, stints and race control from OpenF1. The first load of a session can take a few seconds." : null}
        </StateMessage>
      </div>
    );

  const isDemo = src.kind === "demo";
  const tower = (
    <section className="panel min-w-0" aria-label="Timing tower">
      <div className="panel-head flex-wrap gap-y-1 py-1.5">
        <span className="panel-title">Timing</span>
        <span className="text-[11px] text-fg-3">
          {snap.orderBasis === "classification" ? "Final classification (provider)" : snap.orderBasis === "race-position" ? "Race order from position feed" : "Ordered by best lap"}
          {snap.positionReference === "start-of-session" ? " · +/− vs. position feed at the start" : snap.positionReference === "grid" ? " · +/− vs. starting grid" : ""}
        </span>
        {feed.snapshot.offline && <span className="rounded-[2px] bg-red/15 px-1.5 text-[10.5px] font-bold text-red">OFFLINE — showing last received update</span>}
      </div>
      <div className="px-2 py-2">
        <TimingToolbar
          sort={sort}
          onSort={setSort}
          compact={settings.compact}
          onCompact={(v) => update({ compact: v })}
          replay={snap.replay && src.kind === "historical" ? { maxLap: snap.replay.maxLap } : null}
          atLap={feed.atLap}
          onReplay={feed.setAtLap}
          demo={feed.demo}
          isDemo={isDemo}
        />
      </div>
      <ErrorBoundary label="Timing tower">
        <TimingTower snapshot={snap} columns={columns} sort={sort} onSort={setSort} selected={selected} onSelect={onSelect} highlighted={settings.highlighted} speedUnit={settings.speedUnit} flash={settings.flash} scope={feed.scope} />
      </ErrorBoundary>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-2.5 py-1.5 text-[11px] text-fg-3">
        <span>
          <span className="m-session-best">■</span> session best
        </span>
        <span>
          <span className="m-personal-best">■</span> personal best
        </span>
        <span>
          <span className="m-normal">■</span> completed
        </span>
        <span className="m-invalid">deleted</span>
        <span className="m-carried">faded = previous lap</span>
        <ProvenanceNote provenance={feed.snapshot.provenance} className="ml-auto" />
      </div>
    </section>
  );

  if (settings.compact) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col gap-2">
        {isDemo && <SimulatedBanner />}
        {tower}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isDemo && <SimulatedBanner />}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(380px,560px)]">
        {tower}
        <div className="flex min-w-0 flex-col gap-3">
          <ErrorBoundary label="Track map">
            <TrackPanel snapshot={snap} />
          </ErrorBoundary>
          <ErrorBoundary label="Race control">
            <RaceControlFeed maxHeight={320} />
          </ErrorBoundary>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {selected !== null && (
          <ErrorBoundary label="Lap history">
            <LapHistory snapshot={snap} driver={selected} />
          </ErrorBoundary>
        )}
        {cmpA !== null && cmpB !== null && (
          <ErrorBoundary label="Sector comparison">
            <SectorComparison snapshot={snap} a={cmpA} b={cmpB} onChange={(a, b) => setCompare([a, b])} />
          </ErrorBoundary>
        )}
        <ErrorBoundary label="Lap time chart">
          <LapTimeChart key={feed.scope} snapshot={snap} initial={[selected, cmpB, ...snap.rows.slice(0, 3).map((r) => r.driverNumber)].filter((x): x is number => x !== null)} />
        </ErrorBoundary>
        <ErrorBoundary label="Tyre strategy">
          <TyreStintTimeline snapshot={snap} selected={selected} onSelect={onSelect} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
