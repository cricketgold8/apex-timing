"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFeed, useTimingResource } from "@/lib/client/feed";
import { useHydrated } from "@/lib/client/hooks";
import { resolveTimeZone, useSettings } from "@/lib/client/settings";
import { formatClock, formatDateTime } from "@/lib/timing/formatters";
import { demoRaceControl } from "@/lib/timing/providers/demo/provider";
import { DEMO_EPOCH_MS } from "@/lib/timing/providers/demo/race";
import { CATEGORY_LABEL } from "@/lib/timing/status";
import type { RaceControlCategory, RaceControlMessage, Severity } from "@/lib/timing/types";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";
import { ProvenanceNote } from "@/components/ui/Provenance";

const SEVERITY: Record<Severity, string> = {
  info: "border-l-line",
  caution: "border-l-yellow",
  warning: "border-l-[var(--accent)]",
  critical: "border-l-red",
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as RaceControlCategory[];

export function RaceControlFeed({ maxHeight = 420 }: { maxHeight?: number }) {
  const feed = useFeed();
  const { settings, update } = useSettings();
  const hydrated = useHydrated();
  const rc = useTimingResource("race-control", demoRaceControl);
  const [category, setCategory] = useState<RaceControlCategory | "ALL" | "HIDE_BLUE">("HIDE_BLUE");
  const [driver, setDriver] = useState<number | "ALL">("ALL");
  const [frozen, setFrozen] = useState<Set<string> | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const isDemo = feed.source.kind === "demo";
  const tz = resolveTimeZone(settings.timeZone, feed.event?.circuit.timeZone);

  const all = rc.data ?? [];
  const codes = useMemo(() => new Map((feed.snapshot.data?.rows ?? []).map((r) => [r.driverNumber, r.code])), [feed.snapshot.data?.rows]);

  // Pausing auto-scroll freezes the visible set; new messages are counted, not inserted.
  const paused = !settings.autoScroll;
  useEffect(() => {
    if (paused && !frozen) setFrozen(new Set(all.map((m) => m.id)));
    if (!paused && frozen) setFrozen(null);
  }, [paused, frozen, all]);

  const filtered = all.filter((m) => {
    if (frozen && !frozen.has(m.id)) return false;
    if (category === "HIDE_BLUE" && m.category === "FLAG" && m.flag === "BLUE") return false;
    if (category !== "ALL" && category !== "HIDE_BLUE" && m.category !== category) return false;
    if (driver !== "ALL" && !m.driverNumbers.includes(driver)) return false;
    return true;
  });
  const pending = frozen ? all.filter((m) => !frozen.has(m.id)).length : 0;

  useEffect(() => {
    if (!paused) listRef.current?.scrollTo({ top: 0 });
  }, [all.length, paused]);

  const timeOf = (m: RaceControlMessage) => (isDemo ? `+${formatClock(Math.max(0, (Date.parse(m.at) - DEMO_EPOCH_MS) / 1000))}` : hydrated ? formatDateTime(m.at, { timeZone: tz, hour12: settings.hour12 }, false) : "");
  const driversInFeed = [...new Set(all.flatMap((m) => m.driverNumbers))].sort((a, b) => a - b);

  return (
    <section className="panel flex min-h-0 flex-col" aria-label="Race control messages">
      <div className="panel-head flex-wrap py-1">
        <span className="panel-title">Race control</span>
        <span className={`rounded-[2px] px-1.5 text-[10px] font-bold tracking-wide ${isDemo ? "bg-demo-soft text-demo" : "bg-blue/10 text-blue"}`}>{isDemo ? "DEMO — FICTIONAL MESSAGES" : "FIA RACE CONTROL VIA OPENF1"}</span>
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="rc-cat">
            Category
          </label>
          <select id="rc-cat" className="control h-6 text-[11px]" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            <option value="HIDE_BLUE">All (hide blue flags)</option>
            <option value="ALL">All messages</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="rc-driver">
            Driver
          </label>
          <select id="rc-driver" className="control h-6 w-[80px] text-[11px]" value={driver} onChange={(e) => setDriver(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}>
            <option value="ALL">All cars</option>
            {driversInFeed.map((d) => (
              <option key={d} value={d}>
                {codes.get(d) ?? d}
              </option>
            ))}
          </select>
          <button className="btn h-6 px-1.5" onClick={() => update({ autoScroll: !settings.autoScroll })} aria-pressed={paused} title={paused ? "Resume auto-scroll" : "Pause auto-scroll"}>
            {paused ? <Play size={11} /> : <Pause size={11} />}
            <span className="text-[11px]">{paused ? "Resume" : "Pause"}</span>
          </button>
        </div>
      </div>
      {pending > 0 && (
        <button className="border-b border-line bg-blue/10 py-1 text-[11.5px] font-semibold text-blue" onClick={() => update({ autoScroll: true })}>
          {pending} new message{pending > 1 ? "s" : ""} — show
        </button>
      )}
      {rc.status === "error" && rc.error ? (
        <ProviderErrorMessage error={rc.error} onRetry={rc.reload} />
      ) : rc.status === "loading" && !rc.data ? (
        <StateMessage kind="loading" title="Loading race control" />
      ) : filtered.length === 0 ? (
        <StateMessage kind="empty" title="No messages">
          {all.length === 0 ? "The source has published no race-control messages for this session." : "No messages match the filters."}
        </StateMessage>
      ) : (
        <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight }} aria-live={paused ? "off" : "polite"}>
          {filtered.map((m) => (
            <li key={m.id} className={`border-b border-l-2 border-b-line-soft px-2.5 py-1.5 ${SEVERITY[m.severity]}`}>
              <div className="flex items-center gap-2 text-[10.5px] text-fg-3">
                <span className="tnum">{timeOf(m)}</span>
                {m.lap !== null && <span className="tnum">L{m.lap}</span>}
                <span className="font-semibold uppercase tracking-wide text-fg-2">{CATEGORY_LABEL[m.category]}</span>
                {m.driverNumbers.length > 0 && <span className="truncate">{m.driverNumbers.map((d) => codes.get(d) ?? `#${d}`).join(", ")}</span>}
              </div>
              <p className="text-[12px] leading-snug text-fg">{m.text}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-line px-2.5 py-1.5">
        <ProvenanceNote provenance={rc.provenance} />
      </div>
    </section>
  );
}
