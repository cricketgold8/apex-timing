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
import { SourceInfo } from "@/components/ui/Popover";
import { ProviderErrorMessage, StateMessage } from "@/components/ui/primitives";

const SEVERITY_BAR: Record<Severity, string> = {
  info: "bg-line",
  caution: "bg-yellow",
  warning: "bg-[var(--accent)]",
  critical: "bg-red",
};

const CATEGORIES = Object.keys(CATEGORY_LABEL) as RaceControlCategory[];

/** Race-control messages, newest first. Blue flags are hidden by default because they swamp everything else. */
export function RaceControlFeed({ maxHeight = 560 }: { maxHeight?: number }) {
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

  // Pausing freezes the visible set; new messages are counted, not inserted.
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
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-2">
        <span className={`chip h-6 text-[11px] ${isDemo ? "border-demo/50 bg-demo-soft text-demo" : ""}`}>{isDemo ? "Fictional demo messages" : "Official FIA race control"}</span>
        <span className="ml-auto" />
        <label className="sr-only" htmlFor="rc-cat">
          Show
        </label>
        <select id="rc-cat" className="control h-7 text-[12px]" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          <option value="HIDE_BLUE">All but blue flags</option>
          <option value="ALL">Everything</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="rc-driver">
          Driver
        </label>
        <select id="rc-driver" className="control h-7 w-[92px] text-[12px]" value={driver} onChange={(e) => setDriver(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}>
          <option value="ALL">All cars</option>
          {driversInFeed.map((d) => (
            <option key={d} value={d}>
              {codes.get(d) ?? d}
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={() => update({ autoScroll: !settings.autoScroll })} aria-pressed={paused} aria-label={paused ? "Resume live updates" : "Pause the feed"} title={paused ? "Resume" : "Pause"}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <SourceInfo provenance={rc.provenance} />
      </div>
      {pending > 0 && (
        <button className="mx-4 mb-2 rounded-md bg-blue/10 py-1.5 text-[12px] font-semibold text-blue" onClick={() => update({ autoScroll: true })}>
          {pending} new message{pending > 1 ? "s" : ""} — show
        </button>
      )}
      {rc.status === "error" && rc.error ? (
        <ProviderErrorMessage error={rc.error} onRetry={rc.reload} />
      ) : rc.status === "loading" && !rc.data ? (
        <StateMessage kind="loading" title="Loading messages" />
      ) : filtered.length === 0 ? (
        <StateMessage kind="empty" title="No messages">
          {all.length === 0 ? "Race control hasn't published any messages for this session." : "Nothing matches these filters."}
        </StateMessage>
      ) : (
        <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" style={{ maxHeight }} aria-live={paused ? "off" : "polite"}>
          {filtered.map((m) => (
            <li key={m.id} className="flex gap-3 rounded-lg px-2 py-2 hover:bg-panel-2">
              <span className={`mt-1 w-[3px] shrink-0 self-stretch rounded-full ${SEVERITY_BAR[m.severity]}`} aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-fg-3">
                  <span className="tnum">{timeOf(m)}</span>
                  {m.lap !== null && <span className="tnum">Lap {m.lap}</span>}
                  <span className="font-semibold uppercase tracking-wide text-fg-2">{CATEGORY_LABEL[m.category]}</span>
                  {m.driverNumbers.length > 0 && <span className="truncate">{m.driverNumbers.map((d) => codes.get(d) ?? `#${d}`).join(", ")}</span>}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-fg">{m.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
