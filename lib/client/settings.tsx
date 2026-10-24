"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SpeedUnit } from "@/lib/timing/formatters";
import { readJson, removeKey, writeJson } from "./storage";

export type TimeZoneMode = "viewer" | "event" | "UTC" | (string & {});

export interface Settings {
  theme: "dark" | "light";
  hour12: boolean;
  speedUnit: SpeedUnit;
  timeZone: TimeZoneMode;
  /** Drivers to emphasise across views. */
  highlighted: number[];
  /** Comparison pair used by sector comparison, lap chart and telemetry. */
  compare: [number | null, number | null];
  autoScroll: boolean;
  /** Live polling interval. Bounded below by LIVE_MIN_REFRESH_MS; this is our request rate, not the source's. */
  refreshMs: number;
  demoMode: boolean;
  compact: boolean;
  flash: boolean;
}

export const LIVE_MIN_REFRESH_MS = 4000;

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  hour12: false,
  speedUnit: "kmh",
  timeZone: "viewer",
  highlighted: [],
  compare: [null, null],
  autoScroll: true,
  refreshMs: 5000,
  demoMode: false,
  compact: false,
  flash: true,
};

const KEY = "apex.settings.v1";

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  hydrated: boolean;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readJson<Partial<Settings>>("local", KEY, {});
    setSettings({ ...DEFAULT_SETTINGS, ...stored, refreshMs: Math.max(LIVE_MIN_REFRESH_MS, stored.refreshMs ?? DEFAULT_SETTINGS.refreshMs) });
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      next.refreshMs = Math.max(LIVE_MIN_REFRESH_MS, next.refreshMs);
      writeJson("local", KEY, next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    removeKey("local", KEY);
    removeKey("session", "apex.columns.v1");
    removeKey("session", "apex.selection.v1");
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo(() => ({ settings, update, reset, hydrated }), [settings, update, reset, hydrated]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

/** Resolves the display time zone for an event. */
export function resolveTimeZone(mode: TimeZoneMode, eventZone: string | null | undefined): string {
  if (mode === "event") return eventZone ?? "UTC";
  if (mode === "viewer") {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }
  return mode;
}
