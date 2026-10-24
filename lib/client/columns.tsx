"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { SortKey } from "@/lib/timing/calculations";
import type { SessionType } from "@/lib/config/season-2026";
import { readJson, writeJson } from "./storage";

export type ColumnId =
  | "pos"
  | "chg"
  | "num"
  | "driver"
  | "team"
  | "lap"
  | "last"
  | "best"
  | "gap"
  | "int"
  | "s1"
  | "s2"
  | "s3"
  | "st"
  | "tyre"
  | "age"
  | "pits"
  | "q1"
  | "q2"
  | "q3"
  | "status";

export interface ColumnDef {
  id: ColumnId;
  label: string;
  title: string;
  width: number;
  align: "left" | "right" | "center";
  sortKey?: SortKey;
  /** Required columns cannot be hidden. */
  required?: boolean;
  sessions?: SessionType[];
  defaultVisible: boolean;
  /** Hidden by default in compact mode. */
  compactHidden?: boolean;
}

const RACE: SessionType[] = ["RACE", "SPRINT"];
const QUALI: SessionType[] = ["QUALIFYING", "SPRINT_QUALIFYING"];

export const COLUMNS: ColumnDef[] = [
  { id: "pos", label: "Pos", title: "Position (authoritative order from the source)", width: 40, align: "right", sortKey: "position", required: true, defaultVisible: true },
  { id: "driver", label: "Driver", title: "Driver code and team marker", width: 74, align: "left", required: true, defaultVisible: true },
  { id: "chg", label: "+/−", title: "Places gained or lost against the start", width: 36, align: "right", sessions: RACE, defaultVisible: true, compactHidden: true },
  { id: "num", label: "No", title: "Car number", width: 34, align: "right", defaultVisible: true, compactHidden: true },
  { id: "team", label: "Team", title: "Team", width: 112, align: "left", defaultVisible: true, compactHidden: true },
  { id: "lap", label: "Laps", title: "Laps completed", width: 42, align: "right", defaultVisible: true, compactHidden: true },
  { id: "gap", label: "Gap", title: "Race: time behind the leader on track. Practice/qualifying: best lap minus the fastest lap (in the phase that decided the position).", width: 78, align: "right", sortKey: "gap", defaultVisible: true },
  { id: "int", label: "Int", title: "Race: time behind the car immediately ahead. Practice/qualifying: best lap minus the best lap of the car ahead.", width: 72, align: "right", sortKey: "interval", defaultVisible: true },
  { id: "last", label: "Last", title: "Last completed lap", width: 78, align: "right", sortKey: "lastLap", defaultVisible: true },
  { id: "best", label: "Best", title: "Personal best valid lap", width: 78, align: "right", sortKey: "bestLap", defaultVisible: true },
  { id: "q1", label: "Q1", title: "Best valid Q1 lap", width: 72, align: "right", sessions: QUALI, defaultVisible: true, compactHidden: true },
  { id: "q2", label: "Q2", title: "Best valid Q2 lap", width: 72, align: "right", sessions: QUALI, defaultVisible: true, compactHidden: true },
  { id: "q3", label: "Q3", title: "Best valid Q3 lap", width: 72, align: "right", sessions: QUALI, defaultVisible: true, compactHidden: true },
  { id: "s1", label: "S1", title: "Sector 1 (faded = carried over from the previous lap)", width: 60, align: "right", sortKey: "s1", defaultVisible: true, compactHidden: true },
  { id: "s2", label: "S2", title: "Sector 2", width: 60, align: "right", sortKey: "s2", defaultVisible: true, compactHidden: true },
  { id: "s3", label: "S3", title: "Sector 3", width: 60, align: "right", sortKey: "s3", defaultVisible: true, compactHidden: true },
  { id: "st", label: "ST", title: "Speed trap on the last completed lap", width: 48, align: "right", sortKey: "speedTrap", defaultVisible: true, compactHidden: true },
  { id: "tyre", label: "Tyre", title: "Current tyre compound (as reported by the source)", width: 40, align: "center", defaultVisible: true },
  { id: "age", label: "Age", title: "Laps on the current set. * = derived from the stint's starting age plus laps completed.", width: 40, align: "right", defaultVisible: true, compactHidden: true },
  { id: "pits", label: "Pit", title: "Pit-lane visits (not necessarily tyre changes)", width: 34, align: "right", defaultVisible: true, compactHidden: true },
  { id: "status", label: "Status", title: "Car state from the source: PIT, OUT, RETIRED, DNS, DSQ, FINISHED", width: 70, align: "left", defaultVisible: true },
];

const KEY = "apex.columns.v1";

export function defaultVisible(): Record<ColumnId, boolean> {
  return Object.fromEntries(COLUMNS.map((c) => [c.id, c.defaultVisible])) as Record<ColumnId, boolean>;
}

/** Column visibility, saved for the current browser session only. Shared through ColumnsProvider. */
export function useColumnVisibilityState() {
  const [visible, setVisible] = useState<Record<ColumnId, boolean>>(defaultVisible);
  useEffect(() => {
    setVisible({ ...defaultVisible(), ...readJson<Partial<Record<ColumnId, boolean>>>("session", KEY, {}) });
  }, []);
  const toggle = useCallback((id: ColumnId) => {
    setVisible((prev) => {
      const col = COLUMNS.find((c) => c.id === id);
      if (col?.required) return prev;
      const next = { ...prev, [id]: !prev[id] };
      writeJson("session", KEY, next);
      return next;
    });
  }, []);
  const resetColumns = useCallback(() => {
    writeJson("session", KEY, defaultVisible());
    setVisible(defaultVisible());
  }, []);
  return { visible, toggle, resetColumns };
}

export function columnsFor(sessionType: SessionType, visible: Record<ColumnId, boolean>, compact: boolean): ColumnDef[] {
  return COLUMNS.filter((c) => {
    if (c.sessions && !c.sessions.includes(sessionType)) return false;
    if (compact && c.compactHidden) return false;
    return c.required || visible[c.id];
  });
}

type ColumnsCtx = ReturnType<typeof useColumnVisibilityState>;
const ColumnsContext = createContext<ColumnsCtx | null>(null);

export function ColumnsProvider({ children }: { children: ReactNode }) {
  const value = useColumnVisibilityState();
  return <ColumnsContext.Provider value={value}>{children}</ColumnsContext.Provider>;
}

export function useColumnVisibility(): ColumnsCtx {
  const ctx = useContext(ColumnsContext);
  if (!ctx) throw new Error("useColumnVisibility must be used inside ColumnsProvider");
  return ctx;
}
