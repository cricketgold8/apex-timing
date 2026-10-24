"use client";

import { useMemo } from "react";
import { demoLapHistory } from "@/lib/timing/providers/demo/provider";
import type { LapRecord } from "@/lib/timing/types";
import { useFeed } from "./feed";
import { useRemoteResource, type ResourceState } from "./remote";
import { useSettings } from "./settings";

/** Lap histories for a set of drivers from the current source (computed locally in demo mode). */
export function useLapHistories(drivers: number[]): ResourceState<Record<number, LapRecord[]>> & { reload: () => void } {
  const { source, query, scope, demo } = useFeed();
  const { settings } = useSettings();
  const key = [...new Set(drivers)].sort((a, b) => a - b).join(",");
  // Demo histories only change when a lap completes; quantise the clock so we don't recompute 4x per second.
  const demoTick = Math.floor(demo.t / 2);
  const local = useMemo(() => {
    if (source.kind !== "demo" || !key) return null;
    const out: Record<number, LapRecord[]> = {};
    let prov = null;
    for (const d of key.split(",").map(Number)) {
      const r = demoLapHistory(d, demoTick * 2);
      out[d] = r.data;
      prov = r.provenance;
    }
    return { data: out, provenance: prov, status: "ready" as const, error: null, lastSuccessAt: Date.now(), offline: false, reload: () => {} };
  }, [source.kind, key, demoTick]);
  const remote = useRemoteResource<Record<number, LapRecord[]>>(source.kind !== "demo" && query && key ? `/api/timing/laps?${query}&drivers=${key}` : null, {
    scope: `${scope}|${key}`,
    pollMs: source.kind === "live" ? Math.max(settings.refreshMs, 8000) : null,
    monotonic: source.kind === "live",
  });
  return local ?? remote;
}
