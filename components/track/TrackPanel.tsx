"use client";

import { useMemo } from "react";
import { useFeed, useTimingResource } from "@/lib/client/feed";
import { demoTrack } from "@/lib/timing/providers/demo/provider";
import type { CarPosition, TimingSnapshot, TrackGeometry } from "@/lib/timing/types";
import { SourceInfo } from "@/components/ui/Popover";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { TrackMap, type MapCar } from "./TrackMap";

export function TrackPanel({ snapshot, height = 400 }: { snapshot: TimingSnapshot; height?: number }) {
  const feed = useFeed();
  const track = useTimingResource<{ geometry: TrackGeometry | null; cars: CarPosition[] }>("track", demoTrack);
  const isDemo = feed.source.kind === "demo";

  const cars: MapCar[] = useMemo(() => {
    const rows = new Map(snapshot.rows.map((r) => [r.driverNumber, r]));
    return (track.data?.cars ?? []).flatMap((c) => {
      const r = rows.get(c.driverNumber);
      if (!r || r.state === "DNS") return [];
      if (r.state === "RETIRED") return isDemo ? [{ ...c, code: r.code, colour: r.teamColour, position: null }] : [];
      return [{ ...c, code: r.code, colour: r.teamColour, position: r.position }];
    });
  }, [track.data, snapshot.rows, isDemo]);

  const basis = isDemo
    ? "Simulated positions."
    : cars.length > 0
      ? `Car positions ${feed.source.kind === "historical" ? (feed.atLap ? `at the end of lap ${feed.atLap}` : "at the end of the data") : "latest"}.`
      : "No car positions for this moment (cars in the garage or no data).";

  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="truncate text-[13px] font-medium text-fg">{isDemo ? "Apex Test Circuit (fictional)" : feed.event?.circuit.name}</span>
        <span className="ml-auto" />
        <SourceInfo provenance={track.provenance}>{track.data?.geometry && <p className="mb-2">{track.data.geometry.basis}.</p>}</SourceInfo>
      </div>
      <div className="px-3 pb-3">
        {track.status === "error" && track.error ? (
          <ProviderErrorMessage error={track.error} onRetry={track.reload} />
        ) : track.status === "loading" && !track.data ? (
          <StateMessage kind="loading" title="Drawing the circuit" />
        ) : !track.data?.geometry ? (
          <StateMessage kind="empty" title="No circuit map for this session">
            There was no usable position data to trace the circuit, and another circuit is never shown in its place.
          </StateMessage>
        ) : (
          <TrackMap geometry={track.data.geometry} cars={cars} selected={feed.selectedDriver} onSelect={feed.setSelectedDriver} markerBasis={basis} height={height} />
        )}
      </div>
    </div>
  );
}
