"use client";

import { useRef } from "react";

export const MAX_SERIES = 6;

export const seriesVar = (slot: number) => `var(--series-${(slot % 8) + 1})`;

/**
 * Stable categorical slots: an entity keeps its colour while it stays selected, and a newly added entity takes the
 * lowest free slot. Colour follows the entity, never its rank.
 */
export function useSeriesSlots(ids: readonly number[]): Map<number, number> {
  const ref = useRef(new Map<number, number>());
  const current = ref.current;
  for (const id of [...current.keys()]) if (!ids.includes(id)) current.delete(id);
  for (const id of ids) {
    if (current.has(id)) continue;
    const used = new Set(current.values());
    let slot = 0;
    while (used.has(slot)) slot++;
    current.set(id, slot);
  }
  return current;
}
