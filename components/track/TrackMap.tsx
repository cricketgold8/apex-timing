"use client";

import { useMemo } from "react";
import type { TrackGeometry, CarPosition } from "@/lib/timing/types";

export interface MapCar extends CarPosition {
  code: string;
  colour: string;
  position: number | null;
}

interface Props {
  geometry: TrackGeometry | null;
  cars: MapCar[];
  selected: number | null;
  onSelect?: (n: number) => void;
  /** Accessible description of what the markers represent (sourced vs simulated). */
  markerBasis: string;
  height?: number;
  showLabels?: boolean;
}

/**
 * SVG circuit map. The outline comes from real position data for the selected session (or the fictional demo
 * circuit in demo mode) — it is never borrowed from another venue. Markers are drawn only where the source supplied
 * a position.
 */
export function TrackMap({ geometry, cars, selected, onSelect, markerBasis, height = 380, showLabels = true }: Props) {
  const view = useMemo(() => {
    if (!geometry || geometry.outline.length < 3) return null;
    const xs = geometry.outline.map((p) => p.x);
    const ys = geometry.outline.map((p) => -p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY);
    const pad = span * 0.07;
    return { minX: minX - pad, minY: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2, unit: span / 100 };
  }, [geometry]);

  if (!geometry || !view) return null;
  const pts = geometry.outline;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${(-p.y).toFixed(1)}`).join(" ") + " Z";
  const u = view.unit;

  // Perpendicular tick at an outline index.
  const tick = (i: number, len: number) => {
    const a = pts[(i - 2 + pts.length) % pts.length]!;
    const b = pts[(i + 2) % pts.length]!;
    const dx = b.x - a.x;
    const dy = -(b.y - a.y);
    const n = Math.hypot(dx, dy) || 1;
    const px = (-dy / n) * len;
    const py = (dx / n) * len;
    const c = pts[i]!;
    return { x1: c.x - px, y1: -c.y - py, x2: c.x + px, y2: -c.y + py, cx: c.x, cy: -c.y, dirX: dx / n, dirY: dy / n };
  };
  const sf = tick(0, u * 3.2);
  const arrowAt = tick(Math.round(pts.length * 0.04), 0);
  const ah = u * 2.4;
  const arrow = `M${arrowAt.cx + arrowAt.dirX * ah},${arrowAt.cy + arrowAt.dirY * ah} L${arrowAt.cx - arrowAt.dirY * ah * 0.6 - arrowAt.dirX * ah * 0.4},${arrowAt.cy + arrowAt.dirX * ah * 0.6 - arrowAt.dirY * ah * 0.4} L${arrowAt.cx + arrowAt.dirY * ah * 0.6 - arrowAt.dirX * ah * 0.4},${arrowAt.cy - arrowAt.dirX * ah * 0.6 - arrowAt.dirY * ah * 0.4} Z`;

  const ordered = [...cars].sort((a, b) => (a.driverNumber === selected ? 1 : b.driverNumber === selected ? -1 : (b.position ?? 99) - (a.position ?? 99)));

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`} style={{ height, width: "100%" }} role="img" aria-label={`Circuit map. ${markerBasis}`}>
        <path d={path} fill="none" stroke="var(--line)" strokeWidth={u * 3.4} strokeLinejoin="round" />
        <path d={path} fill="none" stroke="var(--text-3)" strokeWidth={u * 0.9} strokeLinejoin="round" />
        {geometry.sectorBoundaries?.map((idx, k) => {
          const t = tick(idx, u * 2.6);
          return (
            <g key={k}>
              <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="var(--t-yellow)" strokeWidth={u * 0.7} />
              <text x={t.x2 + u * 1.2} y={t.y2} fontSize={u * 3.2} fill="var(--text-2)" dominantBaseline="middle">
                S{k + 2}
              </text>
            </g>
          );
        })}
        <line x1={sf.x1} y1={sf.y1} x2={sf.x2} y2={sf.y2} stroke="var(--text)" strokeWidth={u * 1.1} strokeDasharray={`${u * 0.8} ${u * 0.6}`} />
        <path d={arrow} fill="var(--text-2)" />
        {ordered.map((c) => {
          const sel = c.driverNumber === selected;
          const r = sel ? u * 2.6 : u * 1.9;
          return (
            <g
              key={c.driverNumber}
              transform={`translate(${c.x},${-c.y})`}
              onClick={() => onSelect?.(c.driverNumber)}
              className={onSelect ? "cursor-pointer" : undefined}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${c.code}${c.position ? `, P${c.position}` : ""}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect?.(c.driverNumber)}
            >
              {sel && <circle r={r + u * 1.3} fill="none" stroke="var(--text)" strokeWidth={u * 0.5} />}
              <circle r={r} fill={c.colour} stroke="var(--bg)" strokeWidth={u * 0.5} />
              {(showLabels || sel) && (
                <text x={r + u * 0.8} y={0} fontSize={sel ? u * 3.6 : u * 2.9} fontWeight={700} fill={sel ? "var(--text)" : "var(--text-2)"} dominantBaseline="middle" style={{ fontFamily: "var(--font-display)" }}>
                  {c.code}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="8" aria-hidden>
            <line x1="1" y1="4" x2="13" y2="4" stroke="var(--text)" strokeWidth="2" strokeDasharray="2 1.5" />
          </svg>
          Start / finish
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="8" aria-hidden>
            <line x1="7" y1="0" x2="7" y2="8" stroke="var(--t-yellow)" strokeWidth="2" />
          </svg>
          Sector boundary
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <path d="M1 1 L9 5 L1 9 Z" fill="var(--text-2)" />
          </svg>
          Direction
        </span>
        {markerBasis && <span>{markerBasis}</span>}
      </div>
    </div>
  );
}
