"use client";

import { CircleHelp, Columns3, History, Maximize2, Minimize2, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { COLUMNS, useColumnVisibility } from "@/lib/client/columns";
import type { DemoClock } from "@/lib/client/feed";
import { formatClock } from "@/lib/timing/formatters";
import { demoTimeForLap } from "@/lib/timing/providers/demo/provider";
import { DEMO_TOTAL_LAPS } from "@/lib/timing/providers/demo/race";
import { Popover, Segmented } from "@/components/ui/Popover";
import { TyreBadge } from "@/components/ui/primitives";
import { OFFICIAL_SORT, sortLabel, type SortState } from "./TimingTower";

function ColumnMenu() {
  const { visible, toggle, resetColumns } = useColumnVisibility();
  return (
    <Popover
      label="Choose columns"
      align="left"
      width={300}
      trigger={({ open, toggle: t, id }) => (
        <button className="btn btn-ghost" aria-expanded={open} aria-controls={id} onClick={t} title="Choose columns">
          <Columns3 size={15} aria-hidden />
          <span className="hidden md:inline">Columns</span>
        </button>
      )}
    >
      <div className="max-h-[420px] overflow-y-auto p-2">
        {COLUMNS.filter((c) => !c.required).map((c) => (
          <label key={c.id} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-panel-2">
            <input type="checkbox" className="mt-0.5" checked={visible[c.id]} onChange={() => toggle(c.id)} />
            <span>
              <span className="block text-[13px] text-fg">{c.label || "Status"}</span>
              <span className="block text-[11.5px] leading-snug text-fg-3">{c.title}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <span className="text-[11px] text-fg-3">Kept for this browser session</span>
        <button className="btn h-7" onClick={resetColumns}>
          Reset
        </button>
      </div>
    </Popover>
  );
}

function Legend() {
  return (
    <Popover
      label="How to read the timing screen"
      align="left"
      width={340}
      trigger={({ open, toggle, id }) => (
        <button className="btn btn-ghost" aria-expanded={open} aria-controls={id} onClick={toggle} title="How to read this">
          <CircleHelp size={15} aria-hidden />
          <span className="hidden md:inline">How to read</span>
        </button>
      )}
    >
      <div className="space-y-3 p-4 text-[12.5px] text-fg-2">
        <div>
          <div className="label mb-1.5">Lap and sector colours</div>
          <ul className="space-y-1">
            <li>
              <span className="m-session-best font-semibold">Purple</span> — fastest of anyone in the session
            </li>
            <li>
              <span className="m-personal-best font-semibold">Green</span> — the driver&apos;s own best
            </li>
            <li>
              <span className="m-normal font-semibold">Yellow</span> — a completed time, not a best
            </li>
            <li>
              <span className="m-invalid">Struck through</span> — deleted by race control (e.g. track limits)
            </li>
          </ul>
        </div>
        <div>
          <div className="label mb-1.5">Gap and interval</div>
          <p>
            <b className="text-fg">Gap</b> is the time to the leader, <b className="text-fg">Interval</b> the time to the car directly ahead. &ldquo;+1 lap&rdquo; means the leader has lapped that car.
          </p>
        </div>
        <div>
          <div className="label mb-1.5">Tyres</div>
          <div className="flex flex-wrap gap-3">
            {(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"] as const).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <TyreBadge compound={c} size={18} />
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </span>
            ))}
          </div>
        </div>
        <p className="text-[11.5px] text-fg-3">Click any driver for their laps, sectors and tyres. Click a column heading to sort by it.</p>
      </div>
    </Popover>
  );
}

/** Lap scrubber for completed races: commits once the value settles so dragging doesn't fire a request per lap. */
function ReplayControl({ maxLap, atLap, onChange }: { maxLap: number; atLap: number | null; onChange: (lap: number | null) => void }) {
  const [draft, setDraft] = useState<number>(atLap ?? maxLap);
  useEffect(() => setDraft(atLap ?? maxLap), [atLap, maxLap]);
  useEffect(() => {
    const target = draft >= maxLap ? null : draft;
    if (target === atLap) return;
    const id = setTimeout(() => onChange(target), 450);
    return () => clearTimeout(id);
  }, [draft, maxLap, atLap, onChange]);
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line-soft bg-bg-2 px-3 py-1" title="Rewind the race: see the timing screen as it was at the end of any lap">
      <History size={14} className="text-fg-3" aria-hidden />
      <label className="text-[12.5px] text-fg-2" htmlFor="replay">
        Replay
      </label>
      <input
        id="replay"
        type="range"
        min={1}
        max={maxLap}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        className="w-[150px] accent-[var(--accent)] md:w-[200px]"
        aria-valuetext={draft >= maxLap ? "Final result" : `After lap ${draft}`}
      />
      <span className="tnum w-[84px] text-[12.5px] font-medium">{draft >= maxLap ? "Final result" : `After lap ${draft}`}</span>
    </div>
  );
}

function DemoControl({ demo }: { demo: DemoClock }) {
  const lapNow = (() => {
    for (let l = DEMO_TOTAL_LAPS; l >= 1; l--) if (demoTimeForLap(l) <= demo.t) return l;
    return 1;
  })();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-demo/40 bg-demo-soft px-2.5 py-1">
      <button className="icon-btn text-demo" onClick={() => demo.setPlaying(!demo.playing)} aria-label={demo.playing ? "Pause simulation" : "Play simulation"} title={demo.playing ? "Pause" : "Play"}>
        {demo.playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button className="icon-btn text-demo" onClick={() => demo.setT(demo.range.start)} aria-label="Restart simulation" title="Restart">
        <RotateCcw size={14} />
      </button>
      <label className="sr-only" htmlFor="demo-lap">
        Jump to lap
      </label>
      <input id="demo-lap" type="range" min={1} max={DEMO_TOTAL_LAPS} value={lapNow} onChange={(e) => demo.jumpToLap(Number(e.target.value))} className="w-[120px] accent-[var(--demo)] md:w-[160px]" aria-valuetext={`Lap ${lapNow}`} />
      <span className="tnum text-[12.5px] font-medium text-fg-2">
        Lap {lapNow} · {formatClock(Math.max(0, demo.t))}
      </span>
      <Segmented
        size="sm"
        label="Simulation speed"
        value={String(demo.speed)}
        options={[1, 4, 16].map((s) => ({ value: String(s), label: `${s}×`, title: `${s}× real time` }))}
        onChange={(v) => demo.setSpeed(Number(v))}
      />
    </div>
  );
}

export function TimingToolbar({
  sort,
  onSort,
  compact,
  onCompact,
  replay,
  atLap,
  onReplay,
  demo,
  isDemo,
}: {
  sort: SortState;
  onSort: (s: SortState) => void;
  compact: boolean;
  onCompact: (v: boolean) => void;
  replay: { maxLap: number } | null;
  atLap: number | null;
  onReplay: (lap: number | null) => void;
  demo: DemoClock;
  isDemo: boolean;
}) {
  const { preset, applyPreset } = useColumnVisibility();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compact && (
        <Segmented
          label="Detail level"
          value={preset === "custom" ? ("custom" as const) : preset}
          options={[
            { value: "standard", label: "Simple", title: "Just the essentials" },
            { value: "full", label: "Detailed", title: "Adds sectors, speed trap, team, laps and pit stops" },
            ...(preset === "custom" ? [{ value: "custom" as const, label: "Custom", title: "Your own column choice" }] : []),
          ]}
          onChange={(v) => v !== "custom" && applyPreset(v)}
        />
      )}
      {!compact && <ColumnMenu />}
      {!compact && <Legend />}
      <button className="btn btn-ghost" aria-pressed={compact} onClick={() => onCompact(!compact)} title={compact ? "Back to the full screen" : "Narrow tower only — handy beside a video window"}>
        {compact ? <Maximize2 size={15} aria-hidden /> : <Minimize2 size={15} aria-hidden />}
        <span className="hidden md:inline">{compact ? "Exit compact" : "Compact"}</span>
      </button>
      {(sort.key !== "position" || sort.dir !== "asc") && (
        <span className="chip border-yellow/40 bg-yellow/10 text-yellow" role="status">
          Sorted by {sortLabel(sort.key)} — not the race order
          <button className="underline underline-offset-2" onClick={() => onSort(OFFICIAL_SORT)}>
            Reset
          </button>
        </span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">{isDemo ? <DemoControl demo={demo} /> : replay ? <ReplayControl maxLap={replay.maxLap} atLap={atLap} onChange={onReplay} /> : null}</div>
    </div>
  );
}
