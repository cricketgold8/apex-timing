"use client";

import { Columns3, History, Minimize2, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COLUMNS, useColumnVisibility } from "@/lib/client/columns";
import type { DemoClock } from "@/lib/client/feed";
import type { SortKey } from "@/lib/timing/calculations";
import { formatClock } from "@/lib/timing/formatters";
import { demoTimeForLap } from "@/lib/timing/providers/demo/provider";
import { DEMO_TOTAL_LAPS } from "@/lib/timing/providers/demo/race";
import { OFFICIAL_SORT, sortLabel, type SortState } from "./TimingTower";

const SORT_KEYS: SortKey[] = ["position", "bestLap", "lastLap", "gap", "interval", "s1", "s2", "s3", "speedTrap"];

function ColumnMenu() {
  const { visible, toggle, resetColumns } = useColumnVisibility();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Columns3 size={13} aria-hidden />
        Columns
      </button>
      {open && (
        <div className="panel absolute left-0 top-[32px] z-20 w-[300px] p-2" role="menu">
          <div className="grid grid-cols-2 gap-1">
            {COLUMNS.filter((c) => !c.required).map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[12px] hover:bg-panel-2" title={c.title}>
                <input type="checkbox" checked={visible[c.id]} onChange={() => toggle(c.id)} />
                {c.label}
                <span className="truncate text-[10.5px] text-fg-3">{c.title.split(/[.(:]/)[0]}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <span className="text-[10.5px] text-fg-3">Saved for this browser session</span>
            <button className="btn h-6" onClick={resetColumns}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
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
    <div className="flex items-center gap-2" title="Reconstruct the timing screen as it stood at the end of a lap, from the source's lap, position and interval data">
      <History size={13} className="text-fg-3" aria-hidden />
      <label className="label" htmlFor="replay">
        Replay
      </label>
      <input
        id="replay"
        type="range"
        min={1}
        max={maxLap}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        className="w-[160px] accent-[var(--accent)]"
        aria-valuetext={draft >= maxLap ? "Final classification" : `End of lap ${draft}`}
      />
      <span className="tnum w-[86px] text-[12px]">{draft >= maxLap ? "Final" : `After lap ${draft}`}</span>
      {atLap !== null && (
        <button className="btn h-6" onClick={() => onChange(null)}>
          <SkipForward size={12} aria-hidden /> Final
        </button>
      )}
    </div>
  );
}

function DemoControl({ demo }: { demo: DemoClock }) {
  const lapNow = (() => {
    for (let l = DEMO_TOTAL_LAPS; l >= 1; l--) if (demoTimeForLap(l) <= demo.t) return l;
    return 1;
  })();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[3px] border border-demo/40 bg-demo-soft px-2 py-1">
      <span className="text-[10.5px] font-bold tracking-wider text-demo">SIMULATION</span>
      <button className="btn btn-icon h-6 w-6" onClick={() => demo.setPlaying(!demo.playing)} aria-label={demo.playing ? "Pause simulation" : "Play simulation"}>
        {demo.playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <button className="btn btn-icon h-6 w-6" onClick={() => demo.setT(demo.range.start)} aria-label="Restart simulation">
        <RotateCcw size={12} />
      </button>
      <label className="sr-only" htmlFor="demo-speed">
        Speed
      </label>
      <select id="demo-speed" className="control h-6" value={demo.speed} onChange={(e) => demo.setSpeed(Number(e.target.value))}>
        {[1, 4, 16, 60].map((s) => (
          <option key={s} value={s}>
            ×{s}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="demo-lap">
        Jump to lap
      </label>
      <input id="demo-lap" type="range" min={1} max={DEMO_TOTAL_LAPS} value={lapNow} onChange={(e) => demo.jumpToLap(Number(e.target.value))} className="w-[130px] accent-[var(--demo)]" aria-valuetext={`Lap ${lapNow}`} />
      <span className="tnum text-[12px] text-fg-2">
        L{lapNow} · {formatClock(Math.max(0, demo.t))}
      </span>
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="label" htmlFor="sort">
        Order
      </label>
      <select id="sort" className="control" value={sort.key} onChange={(e) => onSort({ key: e.target.value as SortKey, dir: "asc" })}>
        {SORT_KEYS.map((k) => (
          <option key={k} value={k}>
            {k === "position" ? "Official order" : `By ${sortLabel(k)}`}
          </option>
        ))}
      </select>
      <ColumnMenu />
      <button className="btn" aria-pressed={compact} onClick={() => onCompact(!compact)} title="Compact tower for use beside a video window">
        <Minimize2 size={13} aria-hidden />
        Compact
      </button>
      {sort.key !== "position" || sort.dir !== "asc" ? (
        <span className="inline-flex items-center gap-2 rounded-[3px] border border-yellow/40 bg-yellow/10 px-2 py-1 text-[11.5px] text-yellow" role="status">
          Analysis order ({sortLabel(sort.key)}) — not the official classification
          <button className="underline" onClick={() => onSort(OFFICIAL_SORT)}>
            Reset
          </button>
        </span>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {isDemo ? <DemoControl demo={demo} /> : replay ? <ReplayControl maxLap={replay.maxLap} atLap={atLap} onChange={onReplay} /> : null}
      </div>
    </div>
  );
}
