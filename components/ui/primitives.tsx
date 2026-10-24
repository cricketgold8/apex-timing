"use client";

import { AlertTriangle, CloudOff, Info, Loader2, Radio } from "lucide-react";
import type { ReactNode } from "react";
import type { Compound, DataMode, ProviderError } from "@/lib/timing/types";
import type { Freshness } from "@/lib/timing/calculations";

export function TeamMarker({ colour, className = "" }: { colour: string; className?: string }) {
  return <span aria-hidden className={`inline-block w-[3px] self-stretch rounded-[1px] ${className}`} style={{ background: colour }} />;
}

const COMPOUND_META: Record<Compound, { letter: string; label: string; var: string }> = {
  SOFT: { letter: "S", label: "Soft", var: "var(--tyre-soft)" },
  MEDIUM: { letter: "M", label: "Medium", var: "var(--tyre-medium)" },
  HARD: { letter: "H", label: "Hard", var: "var(--tyre-hard)" },
  INTERMEDIATE: { letter: "I", label: "Intermediate", var: "var(--tyre-inter)" },
  WET: { letter: "W", label: "Wet", var: "var(--tyre-wet)" },
};

export function compoundLabel(c: Compound | null): string {
  return c ? COMPOUND_META[c].label : "Unknown";
}

export function compoundColour(c: Compound | null): string {
  return c ? COMPOUND_META[c].var : "var(--text-3)";
}

export function TyreBadge({ compound, size = 18 }: { compound: Compound | null; size?: number }) {
  if (!compound) {
    return (
      <span title="Compound not reported" className="inline-flex items-center justify-center rounded-full border border-dashed border-line text-[9px] text-fg-3" style={{ width: size, height: size }}>
        ?
      </span>
    );
  }
  const m = COMPOUND_META[compound];
  return (
    <span
      title={`${m.label} (as reported by the source)`}
      aria-label={m.label}
      className="inline-flex items-center justify-center rounded-full font-bold leading-none"
      style={{ width: size, height: size, border: `2px solid ${m.var}`, color: m.var, fontSize: size * 0.5 }}
    >
      {m.letter}
    </span>
  );
}

const MODE_STYLE: Record<DataMode | "SCHEDULED", { label: string; detail: string; cls: string }> = {
  LIVE: { label: "LIVE", detail: "source connected", cls: "text-green border-green/40 bg-green/10" },
  HISTORICAL: { label: "HISTORICAL", detail: "session completed", cls: "text-blue border-blue/40 bg-blue/10" },
  DEMO: { label: "SIMULATED DATA", detail: "synthetic demo", cls: "text-demo border-demo/50 bg-demo-soft" },
  OFFLINE: { label: "OFFLINE", detail: "showing last received update", cls: "text-red border-red/40 bg-red/10" },
  UNAVAILABLE: { label: "NO DATA", detail: "data unavailable", cls: "text-fg-2 border-line bg-bg-2" },
  SCHEDULED: { label: "SCHEDULED", detail: "no timing yet", cls: "text-fg-2 border-line bg-bg-2" },
};

/** The single status indicator for what is on screen. A LIVE badge requires live data that is fresh. */
export function DataModeBadge({ mode, freshness, compact = false }: { mode: DataMode | "SCHEDULED"; freshness?: Freshness; compact?: boolean }) {
  let style = MODE_STYLE[mode];
  if (mode === "LIVE" && freshness === "stale") style = { label: "LIVE · STALE", detail: "no new source data", cls: "text-yellow border-yellow/40 bg-yellow/10" };
  if (freshness === "offline" && mode !== "DEMO") style = MODE_STYLE.OFFLINE;
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-[3px] border px-2 text-[11px] font-semibold tracking-wide ${style.cls}`} title={`${style.label} — ${style.detail}`} role="status">
      {mode === "LIVE" && freshness === "fresh" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" aria-hidden /> : mode === "LIVE" ? <Radio size={12} aria-hidden /> : null}
      {style.label}
      {!compact && <span className="font-normal opacity-75">— {style.detail}</span>}
    </span>
  );
}

export function StateMessage({ kind, title, children, action }: { kind: "loading" | "empty" | "error" | "offline" | "info"; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = kind === "loading" ? Loader2 : kind === "error" ? AlertTriangle : kind === "offline" ? CloudOff : Info;
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 px-6 py-8 text-center" role={kind === "error" ? "alert" : "status"}>
      <Icon size={20} className={`${kind === "loading" ? "animate-spin" : ""} ${kind === "error" ? "text-red" : "text-fg-3"}`} aria-hidden />
      <div className="text-[13px] font-semibold text-fg">{title}</div>
      {children && <div className="max-w-[520px] text-[12px] text-fg-2">{children}</div>}
      {action}
    </div>
  );
}

export function ProviderErrorMessage({ error, onRetry, extra }: { error: ProviderError; onRetry?: () => void; extra?: ReactNode }) {
  const title =
    error.code === "CREDENTIALS_MISSING"
      ? "Live data not configured"
      : error.code === "NOT_PUBLISHED"
        ? "No data published yet"
        : error.code === "RATE_LIMITED"
          ? "Provider rate limit reached"
          : error.code === "NOT_FOUND"
            ? "Not found"
            : "Data source unavailable";
  return (
    <StateMessage
      kind={error.code === "UPSTREAM_ERROR" || error.code === "RATE_LIMITED" || error.code === "UNAUTHORISED" ? "error" : "info"}
      title={title}
      action={
        <div className="mt-1 flex gap-2">
          {onRetry && (
            <button className="btn" onClick={onRetry}>
              Retry
            </button>
          )}
          {extra}
        </div>
      }
    >
      {error.error}
      {error.detail ? <span className="block pt-1 text-fg-3">{error.detail}</span> : null}
      <span className="block pt-1 text-fg-3">Provider: {error.provider}. No substitute data is shown.</span>
    </StateMessage>
  );
}

export function SimulatedBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[3px] border border-demo/50 bg-demo-soft px-3 py-1.5 text-[12px] font-semibold text-demo" role="note">
      <AlertTriangle size={14} aria-hidden />
      SIMULATED DATA
      <span className="font-normal text-fg-2">{children ?? "Fictional race at a fictional circuit. Not a real Grand Prix and not real F1 timing."}</span>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[2px] border border-line bg-bg-2 px-1 text-[10px] text-fg-2">{children}</kbd>;
}
