"use client";

import { CalendarClock, FlaskConical, History } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { latestCompletedSession } from "@/lib/config/season-2026";
import { columnsFor, useColumnVisibility } from "@/lib/client/columns";
import { useFeed } from "@/lib/client/feed";
import { useHydrated, useNow } from "@/lib/client/hooks";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { readJson, writeJson } from "@/lib/client/storage";
import { formatClock, formatDateTime } from "@/lib/timing/formatters";
import type { TimingSnapshot } from "@/lib/timing/types";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { SourceInfo } from "@/components/ui/Popover";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { RaceControlFeed } from "@/components/race-control/RaceControlFeed";
import { TyreStintTimeline } from "@/components/strategy/TyreStintTimeline";
import { TrackPanel } from "@/components/track/TrackPanel";
import { DriverFocus } from "./DriverFocus";
import { LapTimeChart } from "./LapTimeChart";
import { OFFICIAL_SORT, TimingTower, type SortState } from "./TimingTower";
import { TimingToolbar } from "./TimingToolbar";

function FallbackActions({ inline = false }: { inline?: boolean }) {
  const feed = useFeed();
  const { update } = useSettings();
  const latest = latestCompletedSession();
  return (
    <div className={`${inline ? "contents" : "mt-4 flex flex-wrap justify-center gap-2"}`}>
      {latest && (
        <button className="btn" onClick={() => feed.setSession(latest.session.openf1SessionKey)}>
          <History size={14} aria-hidden /> Show the last finished session ({latest.event.name.replace(" Grand Prix", " GP")} {latest.session.name})
        </button>
      )}
      <button className="btn" onClick={() => update({ demoMode: true })}>
        <FlaskConical size={14} aria-hidden /> Try the demo race
      </button>
    </div>
  );
}

type SideTab = "track" | "driver" | "rc" | "tyres" | "laps";
const TAB_KEY = "apex.sideTab.v1";

function SidePanel({ snap, selected, onSelect, initialLapDrivers }: { snap: TimingSnapshot; selected: number | null; onSelect: (n: number) => void; initialLapDrivers: number[] }) {
  const feed = useFeed();
  const [tab, setTab] = useState<SideTab>("track");
  useEffect(() => setTab(readJson<SideTab>("session", TAB_KEY, "track")), []);
  const choose = (t: SideTab) => {
    setTab(t);
    writeJson("session", TAB_KEY, t);
  };
  const code = snap.rows.find((r) => r.driverNumber === selected)?.code;
  const tabs: Array<{ id: SideTab; label: string }> = [
    { id: "track", label: "Track" },
    { id: "driver", label: code ? `Driver · ${code}` : "Driver" },
    { id: "rc", label: "Race control" },
    { id: "tyres", label: "Tyres" },
    { id: "laps", label: "Lap times" },
  ];
  return (
    <section className="panel flex min-h-0 flex-col xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)]" aria-label="Session details">
      <div className="tabs border-b border-line-soft px-2" role="tablist" aria-label="Details">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => choose(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        <ErrorBoundary label="Panel">
          {tab === "track" && <TrackPanel snapshot={snap} />}
          {tab === "driver" && (selected !== null ? <DriverFocus snapshot={snap} driver={selected} /> : <StateMessage kind="info" title="Click a driver in the timing table" />)}
          {tab === "rc" && <RaceControlFeed />}
          {tab === "tyres" && <TyreStintTimeline snapshot={snap} selected={selected} onSelect={onSelect} />}
          {tab === "laps" && <LapTimeChart key={feed.scope} snapshot={snap} initial={initialLapDrivers} />}
        </ErrorBoundary>
      </div>
    </section>
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
  const leader = snap?.rows[0]?.driverNumber ?? null;
  const selected = snap && feed.selectedDriver !== null && snap.rows.some((r) => r.driverNumber === feed.selectedDriver) ? feed.selectedDriver : leader;
  const onSelect = useCallback((n: number) => feed.setSelectedDriver(n), [feed]);
  const tz = resolveTimeZone(settings.timeZone, feed.event?.circuit.timeZone);
  const src = feed.source;

  // ---- Non-data states ---------------------------------------------------------------------------
  const notice = (title: string, body: React.ReactNode) => (
    <div className="panel mx-auto max-w-[720px] py-6">
      <StateMessage kind="info" title={title}>
        {body}
        <FallbackActions />
      </StateMessage>
    </div>
  );
  if (src.kind === "none") return notice("Pick a session", "Use the session menu at the top right.");
  if (src.kind === "cancelled") return notice("This session was cancelled", `${feed.event?.name} — ${feed.session?.name} didn't take place, so there's no timing.`);
  if (src.kind === "scheduled")
    return notice(
      `${feed.session?.name} hasn't started yet`,
      <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
        <CalendarClock size={14} aria-hidden />
        {hydrated ? formatDateTime(src.start, { timeZone: tz, hour12: settings.hour12 }) : ""}
        {hydrated && now ? ` · starts in ${formatClock(Math.max(0, (Date.parse(src.start) - now) / 1000))}` : ""}
      </span>,
    );
  if (src.kind === "live-unavailable") return notice("This session is happening now", <>Live timing needs an OpenF1 account set up on the server, so nothing is shown rather than incomplete data. {src.reason.includes(".env") ? "See .env.example." : ""}</>);

  if (feed.snapshot.status === "error" && feed.snapshot.error && !snap)
    return (
      <div className="panel mx-auto max-w-[720px] py-4">
        <ProviderErrorMessage error={feed.snapshot.error} onRetry={feed.reload} extra={<FallbackActions inline />} />
      </div>
    );
  if (!snap)
    return (
      <div className="panel mx-auto max-w-[720px] py-6">
        <StateMessage kind="loading" title="Loading timing">
          {src.kind === "historical" ? "Fetching the session from OpenF1 — the first load can take a few seconds." : null}
        </StateMessage>
      </div>
    );

  const isDemo = src.kind === "demo";
  const orderNote = snap.orderBasis === "classification" ? "Showing the final result." : snap.orderBasis === "race-position" ? "Order comes from the official position feed." : "Ordered by fastest lap.";

  const tower = (
    <section className="panel min-w-0 overflow-hidden" aria-label="Timing">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
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
      {feed.snapshot.offline && <div className="border-b border-red/30 bg-red/10 px-4 py-2 text-[12.5px] font-medium text-red">Connection lost — showing the last update received.</div>}
      <ErrorBoundary label="Timing table">
        <TimingTower
          snapshot={snap}
          columns={columns}
          sort={sort}
          onSort={setSort}
          selected={selected}
          onSelect={onSelect}
          highlighted={settings.highlighted}
          speedUnit={settings.speedUnit}
          flash={settings.flash}
          scope={feed.scope}
          compact={settings.compact}
        />
      </ErrorBoundary>
      <div className="flex items-center gap-2 border-t border-line-soft px-4 py-2 text-[12px] text-fg-3">
        <span>{orderNote}</span>
        {snap.positionReference && <span>+/− compares with the {snap.positionReference === "grid" ? "starting grid" : "order at the start"}.</span>}
        <span className="ml-auto" />
        <SourceInfo provenance={feed.snapshot.provenance} />
      </div>
    </section>
  );

  if (settings.compact) return <div className="mx-auto max-w-[620px]">{tower}</div>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,560px)] 2xl:grid-cols-[minmax(0,1.15fr)_minmax(560px,1fr)]">
      {tower}
      <SidePanel snap={snap} selected={selected} onSelect={onSelect} initialLapDrivers={[selected, ...snap.rows.slice(0, 3).map((r) => r.driverNumber)].filter((x): x is number => x !== null)} />
    </div>
  );
}
