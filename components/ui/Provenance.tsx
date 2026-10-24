"use client";

import { Database } from "lucide-react";
import { useState } from "react";
import { useHydrated, useNow } from "@/lib/client/hooks";
import { formatAge } from "@/lib/timing/formatters";
import type { Provenance } from "@/lib/timing/types";

/** Footnote stating where a dataset came from, how fresh it is and anything the user should know about it. */
export function ProvenanceNote({ provenance, className = "" }: { provenance: Provenance | null; className?: string }) {
  const hydrated = useHydrated();
  const now = useNow(5000);
  const [open, setOpen] = useState(false);
  if (!provenance) return null;
  const isDemo = provenance.mode === "DEMO";
  return (
    <div className={`text-[11px] text-fg-3 ${className}`}>
      <button className="focus-ring inline-flex items-center gap-1.5 hover:text-fg-2" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Database size={11} aria-hidden />
        <span>
          {provenance.provider} · {provenance.mode.toLowerCase()} · {provenance.completeness}
          {hydrated && !isDemo && provenance.fetchedAt ? ` · fetched ${formatAge(provenance.fetchedAt, now || Date.now())}` : ""}
        </span>
        {provenance.notes.length > 0 && <span className="underline decoration-dotted">{open ? "hide notes" : `${provenance.notes.length} note${provenance.notes.length > 1 ? "s" : ""}`}</span>}
      </button>
      {open && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {provenance.sourceTimestamp && !isDemo && <li>Source timestamp: {provenance.sourceTimestamp}</li>}
          {provenance.sessionId && <li>Session id: {provenance.sessionId}</li>}
          {provenance.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
