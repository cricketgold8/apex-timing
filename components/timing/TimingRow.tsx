"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { memo, type KeyboardEvent, type ReactNode } from "react";
import type { ColumnDef } from "@/lib/client/columns";
import { useFlashOnChange } from "@/lib/client/hooks";
import { TEAMS_2026, isTeamId } from "@/lib/config/teams-2026";
import { formatGap, formatInterval, formatLapTime, formatSectorTime, formatSpeed, type SpeedUnit, UNAVAILABLE } from "@/lib/timing/formatters";
import type { DriverRunState, TimingMark, TimingRow as Row } from "@/lib/timing/types";
import { TyreBadge } from "@/components/ui/primitives";

const markClass = (m: TimingMark | null | undefined) => (m ? `m-${m}` : "text-fg-3");

function FlashCell({ value, enabled, scope, className = "", children, title }: { value: unknown; enabled: boolean; scope: string; className?: string; children: ReactNode; title?: string }) {
  const flash = useFlashOnChange(value, enabled, scope);
  return (
    <td className={`${className} ${flash ? "flash" : ""}`} title={title}>
      {children}
    </td>
  );
}

const STATE_STYLE: Partial<Record<DriverRunState, { text: string; cls: string; title: string }>> = {
  PIT: { text: "In pit", cls: "bg-yellow/15 text-yellow", title: "In the pit lane" },
  OUT: { text: "Out lap", cls: "bg-blue/15 text-blue", title: "First lap after leaving the pits" },
  IN: { text: "In lap", cls: "bg-yellow/10 text-yellow", title: "Coming into the pits" },
  RETIRED: { text: "Retired", cls: "bg-red/10 text-red", title: "Out of the session" },
  DNS: { text: "Did not start", cls: "bg-red/10 text-red", title: "Did not start" },
  DSQ: { text: "Disqualified", cls: "bg-red/10 text-red", title: "Disqualified" },
  STOPPED: { text: "Stopped", cls: "bg-red/10 text-red", title: "Stopped on track" },
  FINISHED: { text: "Finished", cls: "text-fg-3", title: "Took the chequered flag" },
};

export function surname(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

export interface RowProps {
  row: Row;
  signature: string;
  columns: ColumnDef[];
  columnsKey: string;
  selected: boolean;
  highlighted: boolean;
  speedUnit: SpeedUnit;
  flash: boolean;
  scope: string;
  isRace: boolean;
  compact: boolean;
  onSelect: (driverNumber: number) => void;
  onKeyNav: (e: KeyboardEvent<HTMLTableRowElement>, driverNumber: number) => void;
}

function RowView({ row, columns, selected, highlighted, speedUnit, flash, scope, isRace, compact, onSelect, onKeyNav }: RowProps) {
  const teamName = row.teamId && isTeamId(row.teamId) ? TEAMS_2026[row.teamId].name : "—";
  const out = row.state === "RETIRED" || row.state === "DNS" || row.state === "DSQ";
  const cells: Record<string, ReactNode> = {};
  const align = (c: ColumnDef) => (c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left");

  for (const c of columns) {
    switch (c.id) {
      case "pos":
        cells.pos = (
          <td key="pos" className="sticky left-0 z-[1] bg-inherit text-center">
            <span className="display text-[18px] font-bold text-fg">{row.position ?? UNAVAILABLE}</span>
          </td>
        );
        break;
      case "driver":
        cells.driver = (
          <td key="driver" className="sticky left-[46px] z-[1] bg-inherit" title={`${row.name} · ${teamName} · #${row.driverNumber}`}>
            <span className="flex h-[24px] items-center gap-2.5">
              <span aria-hidden className="h-full w-[4px] rounded-full" style={{ background: row.teamColour }} />
              <span className={`display text-[16px] font-bold tracking-[0.05em] ${highlighted ? "underline decoration-2 underline-offset-4" : ""}`} style={highlighted ? { textDecorationColor: row.teamColour } : undefined}>
                {row.code}
              </span>
              {!compact && <span className="truncate text-[12.5px] text-fg-3">{surname(row.name)}</span>}
            </span>
          </td>
        );
        break;
      case "chg": {
        const v = row.positionChange;
        cells.chg = (
          <td key="chg" className={`tnum ${align(c)} text-[12px]`} title={v === null ? "Not available" : v > 0 ? `Gained ${v}` : v < 0 ? `Lost ${-v}` : "No change"}>
            {v === null ? (
              <span className="text-fg-3">{UNAVAILABLE}</span>
            ) : v > 0 ? (
              <span className="inline-flex items-center text-green">
                <ArrowUp size={11} aria-hidden />
                {v}
              </span>
            ) : v < 0 ? (
              <span className="inline-flex items-center text-red">
                <ArrowDown size={11} aria-hidden />
                {-v}
              </span>
            ) : (
              <span className="text-fg-3">–</span>
            )}
          </td>
        );
        break;
      }
      case "num":
        cells.num = (
          <td key="num" className={`tnum ${align(c)} text-fg-3`}>
            {row.driverNumber}
          </td>
        );
        break;
      case "team":
        cells.team = (
          <td key="team" className="max-w-[130px] truncate text-[12.5px] text-fg-2">
            {teamName}
          </td>
        );
        break;
      case "lap":
        cells.lap = (
          <FlashCell key="lap" value={row.lapsCompleted} enabled={flash} scope={scope} className={`tnum ${align(c)} text-fg-2`}>
            {row.lapsCompleted ?? UNAVAILABLE}
          </FlashCell>
        );
        break;
      case "gap":
        cells.gap = (
          <FlashCell key="gap" value={JSON.stringify(row.gap)} enabled={flash && isRace} scope={scope} className={`tnum ${align(c)} ${row.gap.kind === "leader" ? "text-[11.5px] font-semibold uppercase tracking-wide text-fg-3" : "font-medium text-fg"}`}>
            {formatGap(row.gap, isRace ? "Leader" : "Fastest")}
          </FlashCell>
        );
        break;
      case "int":
        cells.int = (
          <FlashCell key="int" value={JSON.stringify(row.interval)} enabled={flash && isRace} scope={scope} className={`tnum ${align(c)} ${row.interval.kind === "leader" ? "text-fg-3" : "text-fg-2"}`}>
            {formatInterval(row.interval)}
          </FlashCell>
        );
        break;
      case "last":
        cells.last = (
          <FlashCell key="last" value={row.lastLap.value} enabled={flash} scope={scope} className={`tnum ${align(c)} ${markClass(row.lastLap.mark)}`} title={row.lastLap.mark === "invalid" ? "Deleted by race control" : undefined}>
            {formatLapTime(row.lastLap.value)}
          </FlashCell>
        );
        break;
      case "best":
        cells.best = (
          <FlashCell key="best" value={row.bestLap.value} enabled={flash} scope={scope} className={`tnum ${align(c)} ${row.bestLap.mark === "session-best" ? "m-session-best font-semibold" : "text-fg"}`} title={row.bestLap.lap ? `Set on lap ${row.bestLap.lap}` : undefined}>
            {formatLapTime(row.bestLap.value)}
          </FlashCell>
        );
        break;
      case "q1":
      case "q2":
      case "q3": {
        const v = row.qualifying?.[c.id] ?? null;
        const knockedOut = row.qualifying?.eliminatedIn && Number(c.id.slice(1)) === row.qualifying.eliminatedIn;
        cells[c.id] = (
          <td key={c.id} className={`tnum ${align(c)} ${v === null ? "text-fg-3" : knockedOut ? "text-red" : "text-fg"}`} title={knockedOut ? `Knocked out in ${c.id.toUpperCase()}` : undefined}>
            {formatLapTime(v)}
          </td>
        );
        break;
      }
      case "s1":
      case "s2":
      case "s3": {
        const s = row.sectors[Number(c.id.slice(1)) - 1]!;
        cells[c.id] = (
          <FlashCell key={c.id} value={s.value} enabled={flash && s.current} scope={scope} className={`tnum ${align(c)} ${markClass(s.mark)} ${!s.current && s.value !== null && !out ? "m-carried" : ""}`}>
            {formatSectorTime(s.value)}
          </FlashCell>
        );
        break;
      }
      case "st":
        cells.st = (
          <td key="st" className={`tnum ${align(c)} ${row.speedTrap.mark === "session-best" ? "m-session-best" : row.speedTrap.mark === "personal-best" ? "m-personal-best" : "text-fg-3"}`}>
            {formatSpeed(row.speedTrap.value, speedUnit)}
          </td>
        );
        break;
      case "tyre":
        cells.tyre = (
          <td key="tyre" className="text-left" title={row.tyre.ageBasis === "derived" ? "Lap count derived from the stint's starting age" : undefined}>
            <span className="inline-flex items-center gap-2 align-middle">
              <TyreBadge compound={row.tyre.compound} size={20} />
              <span className="tnum text-[12px] text-fg-3">{row.tyre.age !== null ? `${row.tyre.age} ${row.tyre.age === 1 ? "lap" : "laps"}` : ""}</span>
            </span>
          </td>
        );
        break;
      case "pits":
        cells.pits = (
          <FlashCell key="pits" value={row.pitStops} enabled={flash} scope={scope} className={`tnum ${align(c)} text-fg-2`}>
            {row.pitStops ?? UNAVAILABLE}
          </FlashCell>
        );
        break;
      case "status": {
        const st = STATE_STYLE[row.state];
        cells.status = (
          <td key="status" className="text-[11.5px] font-semibold">
            {st ? (
              <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 ${st.cls}`} title={st.title}>
                {st.text}
              </span>
            ) : null}
          </td>
        );
        break;
      }
    }
  }

  return (
    <tr
      tabIndex={0}
      data-driver={row.driverNumber}
      aria-selected={selected}
      onClick={() => onSelect(row.driverNumber)}
      onKeyDown={(e) => onKeyNav(e, row.driverNumber)}
      className={`focus-ring cursor-pointer transition-colors ${selected ? "bg-[color-mix(in_srgb,var(--panel)_88%,var(--t-blue))]" : "bg-panel hover:bg-panel-2"} ${out ? "opacity-55" : ""}`}
      style={selected ? { boxShadow: `inset 3px 0 0 ${row.teamColour}` } : undefined}
    >
      {columns.map((c) => cells[c.id])}
    </tr>
  );
}

/** Re-renders only when this driver's data (signature) or display options change. */
export const TimingRow = memo(
  RowView,
  (a, b) =>
    a.signature === b.signature &&
    a.selected === b.selected &&
    a.highlighted === b.highlighted &&
    a.columnsKey === b.columnsKey &&
    a.speedUnit === b.speedUnit &&
    a.flash === b.flash &&
    a.scope === b.scope &&
    a.isRace === b.isRace &&
    a.compact === b.compact &&
    a.onSelect === b.onSelect &&
    a.onKeyNav === b.onKeyNav,
);
