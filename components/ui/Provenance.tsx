"use client";

import { useHydrated, useNow } from "@/lib/client/hooks";
import { formatAge } from "@/lib/timing/formatters";
import type { Provenance } from "@/lib/timing/types";

const MODE_TEXT: Record<Provenance["mode"], string> = {
  LIVE: "Live",
  HISTORICAL: "Completed session",
  DEMO: "Simulated (demo)",
  OFFLINE: "Offline",
  UNAVAILABLE: "Unavailable",
};

/** Where a dataset came from, how fresh it is and anything the reader should know about it. */
export function ProvenanceNote({ provenance, expanded = false }: { provenance: Provenance | null; expanded?: boolean }) {
  const hydrated = useHydrated();
  const now = useNow(5000);
  if (!provenance) return null;
  const isDemo = provenance.mode === "DEMO";
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-fg-3">Source</dt>
        <dd className="text-fg">{provenance.provider}</dd>
        <dt className="text-fg-3">Type</dt>
        <dd className="text-fg">
          {MODE_TEXT[provenance.mode]}
          {provenance.completeness !== "complete" ? ` · ${provenance.completeness}` : ""}
        </dd>
        {hydrated && !isDemo && (
          <>
            <dt className="text-fg-3">Fetched</dt>
            <dd className="text-fg">{formatAge(provenance.fetchedAt, now || Date.now())}</dd>
          </>
        )}
      </dl>
      {expanded && provenance.notes.length > 0 && (
        <ul className="list-disc space-y-1 border-t border-line pt-2 pl-4 text-[11.5px] text-fg-2">
          {provenance.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
