"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR and hydration, true afterwards. Use before rendering anything time-zone or clock dependent. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Wall clock that ticks every `ms` once hydrated (0 before). */
export function useNow(ms = 1000): number {
  const hydrated = useHydrated();
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!hydrated) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [hydrated, ms]);
  return now;
}

/**
 * Returns true for ~1.1 s after `value` changes (not on first render, and not when `resetKey` changes).
 * Drives the subtle cell flash on genuine value updates only.
 */
export function useFlashOnChange(value: unknown, enabled: boolean, resetKey: string): boolean {
  const prev = useRef<{ value: unknown; key: string } | null>(null);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    const p = prev.current;
    prev.current = { value, key: resetKey };
    if (!enabled || !p || p.key !== resetKey) return;
    if (p.value !== value) setFlash((n) => n + 1);
  }, [value, enabled, resetKey]);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(0), 1100);
    return () => clearTimeout(id);
  }, [flash]);
  return flash > 0;
}
