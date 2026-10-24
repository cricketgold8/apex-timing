"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SortKey } from "@/lib/timing/calculations";
import type { SessionType } from "@/lib/config/season-2026";
import { readJson, writeJson } from "./storage";

export type ColumnId = "pos" | "chg" | "num" | "driver" | "team" | "lap" | "last" | "best" | "gap" | "int" | "s1" | "s2" | "s3" | "st" | "tyre" | "pits" | "q1" | "q2" | "q3" | "status";

export interface ColumnDef {
  id: ColumnId;
  label: string;
  /** Plain-language explanation shown as the header tooltip and in the column menu. */
  title: string;
  width: number;
  align: "left" | "right" | "center";
  sortKey?: SortKey;
  /** Required columns cannot be hidden. */
  required?: boolean;
  sessions?: SessionType[];
  /** Part of the Standard view; everything else appears in the Full view. */
  standard: boolean;
  /** Hidden in compact mode (tower beside a video window). */
  compactHidden?: boolean;
}

const RACE: SessionType[] = ["RACE", "SPRINT"];
const QUALI: SessionType[] = ["QUALIFYING", "SPRINT_QUALIFYING"];

export const COLUMNS: ColumnDef[] = [
  { id: "pos", label: "Pos", title: "Position", width: 46, align: "center", sortKey: "position", required: true, standard: true },
  { id: "driver", label: "Driver", title: "Driver (click a row for details)", width: 150, align: "left", required: true, standard: true },
  { id: "chg", label: "+/−", title: "Places gained or lost since the start", width: 44, align: "right", sessions: RACE, standard: false, compactHidden: true },
  { id: "num", label: "No.", title: "Car number", width: 40, align: "right", standard: false, compactHidden: true },
  { id: "team", label: "Team", title: "Team", width: 120, align: "left", standard: false, compactHidden: true },
  { id: "lap", label: "Laps", title: "Laps completed", width: 48, align: "right", standard: false, compactHidden: true },
  { id: "gap", label: "Gap", title: "Race: how far behind the leader. Practice/qualifying: how much slower their best lap is than the fastest.", width: 84, align: "right", sortKey: "gap", standard: true },
  { id: "int", label: "Interval", title: "Race: how far behind the car directly in front. Practice/qualifying: best-lap difference to the car in front.", width: 80, align: "right", sortKey: "interval", standard: true },
  { id: "last", label: "Last lap", title: "Most recent completed lap", width: 86, align: "right", sortKey: "lastLap", standard: true },
  { id: "best", label: "Best lap", title: "Fastest valid lap (purple = fastest of anyone)", width: 86, align: "right", sortKey: "bestLap", standard: true },
  { id: "q1", label: "Q1", title: "Best valid Q1 lap", width: 80, align: "right", sessions: QUALI, standard: true, compactHidden: true },
  { id: "q2", label: "Q2", title: "Best valid Q2 lap", width: 80, align: "right", sessions: QUALI, standard: true, compactHidden: true },
  { id: "q3", label: "Q3", title: "Best valid Q3 lap", width: 80, align: "right", sessions: QUALI, standard: true, compactHidden: true },
  { id: "s1", label: "S1", title: "Sector 1 (faded = from the previous lap)", width: 64, align: "right", sortKey: "s1", standard: false, compactHidden: true },
  { id: "s2", label: "S2", title: "Sector 2", width: 64, align: "right", sortKey: "s2", standard: false, compactHidden: true },
  { id: "s3", label: "S3", title: "Sector 3", width: 64, align: "right", sortKey: "s3", standard: false, compactHidden: true },
  { id: "st", label: "Speed", title: "Speed trap on the last lap", width: 58, align: "right", sortKey: "speedTrap", standard: false, compactHidden: true },
  { id: "tyre", label: "Tyre", title: "Current tyre and how many laps it has done", width: 70, align: "left", standard: true },
  { id: "pits", label: "Pits", title: "Pit-lane visits", width: 44, align: "right", sessions: RACE, standard: false, compactHidden: true },
  { id: "status", label: "", title: "In pit lane, out lap, retired or finished", width: 84, align: "left", standard: true },
];

export type ColumnPreset = "standard" | "full" | "custom";

const KEY = "apex.columns.v2";

function presetVisibility(preset: "standard" | "full"): Record<ColumnId, boolean> {
  return Object.fromEntries(COLUMNS.map((c) => [c.id, preset === "full" || c.standard])) as Record<ColumnId, boolean>;
}

/** Column visibility, saved for the current browser session only. Shared through ColumnsProvider. */
export function useColumnVisibilityState() {
  const [visible, setVisible] = useState<Record<ColumnId, boolean>>(() => presetVisibility("standard"));
  useEffect(() => {
    setVisible({ ...presetVisibility("standard"), ...readJson<Partial<Record<ColumnId, boolean>>>("session", KEY, {}) });
  }, []);
  const save = (next: Record<ColumnId, boolean>) => {
    writeJson("session", KEY, next);
    return next;
  };
  const toggle = useCallback((id: ColumnId) => {
    setVisible((prev) => (COLUMNS.find((c) => c.id === id)?.required ? prev : save({ ...prev, [id]: !prev[id] })));
  }, []);
  const applyPreset = useCallback((preset: "standard" | "full") => setVisible(save(presetVisibility(preset))), []);
  const resetColumns = useCallback(() => applyPreset("standard"), [applyPreset]);
  const preset: ColumnPreset = useMemo(() => {
    const same = (p: "standard" | "full") => COLUMNS.every((c) => c.required || visible[c.id] === presetVisibility(p)[c.id]);
    return same("standard") ? "standard" : same("full") ? "full" : "custom";
  }, [visible]);
  return { visible, toggle, applyPreset, resetColumns, preset };
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

export function columnsFor(sessionType: SessionType, visible: Record<ColumnId, boolean>, compact: boolean): ColumnDef[] {
  return COLUMNS.filter((c) => {
    if (c.sessions && !c.sessions.includes(sessionType)) return false;
    if (compact && c.compactHidden) return false;
    return c.required || visible[c.id];
  });
}
