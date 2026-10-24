"use client";

import { ArrowDownUp, ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useMemo, type KeyboardEvent } from "react";
import type { ColumnDef } from "@/lib/client/columns";
import { sortRows, type SortKey } from "@/lib/timing/calculations";
import type { SpeedUnit } from "@/lib/timing/formatters";
import type { TimingSnapshot } from "@/lib/timing/types";
import { TimingRow } from "./TimingRow";

export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

export const OFFICIAL_SORT: SortState = { key: "position", dir: "asc" };

const SORT_LABEL: Record<SortKey, string> = {
  position: "official order",
  bestLap: "best lap",
  lastLap: "last lap",
  gap: "gap",
  interval: "interval",
  s1: "sector 1",
  s2: "sector 2",
  s3: "sector 3",
  speedTrap: "speed trap",
};

export function sortLabel(key: SortKey) {
  return SORT_LABEL[key];
}

interface Props {
  snapshot: TimingSnapshot;
  columns: ColumnDef[];
  sort: SortState;
  onSort: (s: SortState) => void;
  selected: number | null;
  onSelect: (n: number) => void;
  highlighted: number[];
  speedUnit: SpeedUnit;
  flash: boolean;
  scope: string;
  compact: boolean;
}

export function TimingTower({ snapshot, columns, sort, onSort, selected, onSelect, highlighted, speedUnit, flash, scope, compact }: Props) {
  const rows = useMemo(() => sortRows(snapshot.rows, sort.key, sort.dir), [snapshot.rows, sort]);
  const isRace = snapshot.session.type === "RACE" || snapshot.session.type === "SPRINT";
  const columnsKey = columns.map((c) => c.id).join(",");
  const signatures = useMemo(() => new Map(rows.map((r) => [r.driverNumber, JSON.stringify(r)])), [rows]);

  const onKeyNav = useCallback(
    (e: KeyboardEvent<HTMLTableRowElement>, driverNumber: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(driverNumber);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const tr = e.currentTarget;
      const next = (e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling) as HTMLTableRowElement | null;
      next?.focus();
    },
    [onSelect],
  );

  const headerClick = (c: ColumnDef) => {
    if (!c.sortKey) return;
    if (sort.key === c.sortKey) onSort({ key: c.sortKey, dir: sort.dir === "asc" ? "desc" : "asc" });
    else onSort({ key: c.sortKey, dir: "asc" });
  };

  return (
    <div className="overflow-x-auto">
      <table className="data-table tower tnum min-w-max" aria-label={`Timing tower, ordered by ${SORT_LABEL[sort.key]}`}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.id} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = c.sortKey && sort.key === c.sortKey;
              const sticky = c.id === "pos" ? "sticky left-0 z-[2]" : c.id === "driver" ? "sticky left-[46px] z-[2]" : "";
              return (
                <th
                  key={c.id}
                  scope="col"
                  title={c.title}
                  className={`${sticky} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortKey ? (
                    <button className={`focus-ring inline-flex items-center gap-0.5 uppercase ${active ? "text-fg" : ""}`} onClick={() => headerClick(c)}>
                      {c.label}
                      {active ? sort.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} /> : <ArrowDownUp size={9} className="opacity-40" aria-hidden />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <TimingRow
              key={r.driverNumber}
              row={r}
              signature={signatures.get(r.driverNumber) ?? ""}
              columns={columns}
              columnsKey={columnsKey}
              selected={selected === r.driverNumber}
              highlighted={highlighted.includes(r.driverNumber)}
              speedUnit={speedUnit}
              flash={flash}
              scope={scope}
              isRace={isRace}
              compact={compact}
              onSelect={onSelect}
              onKeyNav={onKeyNav}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
