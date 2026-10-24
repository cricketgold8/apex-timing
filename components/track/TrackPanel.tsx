"use client";

import { useMemo } from "react";
import { useFeed, useTimingResource } from "@/lib/client/feed";
import { demoTrack } from "@/lib/timing/providers/demo/provider";
import type { CarPosition, TimingSnapshot, TrackGeometry } from "@/lib/timing/types";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { ProvenanceNote } from "@/components/ui/Provenance";
import { TrackMap, type MapCar } from "./TrackMap";

export function TrackPanel({ snapshot, height = 360 }: { snapshot: TimingSnapshot; height?: number }) {
  const feed = useFeed();
  const track = useTimingResource<{ geometry: TrackGeometry | null; cars: CarPosition[] }>("track", demoTrack);
  const isDemo = feed.source.kind === "demo";

  const cars: MapCar[] = useMemo(() => {
    const rows = new Map(snapshot.rows.map((r) => [r.driverNumber, r]));
    return (track.data?.cars ?? []).flatMap((c) => {
      const r = rows.get(c.driverNumber);
      if (!r || r.state === "RETIRED" || r.state === "DNS") return isDemo && r?.state === "RETIRED" ? [{ ...c, code: r.code, colour: r.teamColour, position: null }] : [];
      return [{ ...c, code: r.code, colour: r.teamColour, position: r.position }];
    });
  }, [track.data, snapshot.rows, isDemo]);

  const basis = isDemo
    ? "Markers: simulated positions (demo)."
    : cars.length > 0
      ? `Markers: source positions${feed.source.kind === "historical" ? ` at ${feed.atLap ? `end of lap ${feed.atLap}` : "end of data"}` : " (latest)"}.`
      : "No car positions published for this instant.";

  return (
    <section className="panel" aria-label="Track map">
      <div className="panel-head">
        <span className="panel-title">Track</span>
        <span className="truncate text-[11px] text-fg-3">{isDemo ? "Fictional demo circuit" : feed.event?.circuit.name}</span>
      </div>
      <div className="p-2">
        {track.status === "error" && track.error ? (
          <ProviderErrorMessage error={track.error} onRetry={track.reload} />
        ) : track.status === "loading" && !track.data ? (
          <StateMessage kind="loading" title="Tracing circuit from position data" />
        ) : !track.data?.geometry ? (
          <StateMessage kind="empty" title="No circuit geometry">
            The source has no usable position trace for this session, so no map is drawn. Another circuit is never substituted.
          </StateMessage>
        ) : (
          <TrackMap geometry={track.data.geometry} cars={cars} selected={feed.selectedDriver} onSelect={feed.setSelectedDriver} markerBasis={basis} height={height} />
        )}
      </div>
      <div className="border-t border-line px-2.5 py-1.5">
        <ProvenanceNote provenance={track.provenance} />
      </div>
    </section>
  );
}
