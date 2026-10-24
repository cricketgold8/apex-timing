import type { Gap } from "./types";

/** The single symbol used everywhere for a value the source did not supply. */
export const UNAVAILABLE = "—";

function isUsable(seconds: number | null | undefined): seconds is number {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0;
}

/** Integer milliseconds, so 83.4559999 formats as 1:23.456 rather than 1:23.455. */
function toMillis(seconds: number): number {
  return Math.round(seconds * 1000);
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}

/**
 * Lap time in timing-screen style: `1:23.456`, `59.123` below a minute, `1:02:03.456` beyond an hour.
 * Unknown, zero, negative and non-finite values render as the unavailable symbol, never `0:00.000`.
 */
export function formatLapTime(seconds: number | null | undefined): string {
  if (!isUsable(seconds)) return UNAVAILABLE;
  const ms = toMillis(seconds);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const frac = ms % 1000;
  if (h > 0) return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(frac, 3)}`;
  if (m > 0) return `${m}:${pad(s, 2)}.${pad(frac, 3)}`;
  return `${s}.${pad(frac, 3)}`;
}

/** Sector times read as seconds (`28.456`); a sector over a minute keeps the minute (`1:02.345`). */
export function formatSectorTime(seconds: number | null | undefined): string {
  return formatLapTime(seconds);
}

/** Race time for classifications: `1:23:06.801`. */
export function formatRaceTime(seconds: number | null | undefined): string {
  return formatLapTime(seconds);
}

/** Signed delta with three decimals: `+0.123`, `-1.045`. Zero renders as `0.000`. */
export function formatDelta(seconds: number | null | undefined, decimals = 3): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return UNAVAILABLE;
  const scale = 10 ** decimals;
  // Round half away from zero so +x and -x format symmetrically.
  const rounded = (Math.sign(seconds) * Math.round(Math.abs(seconds) * scale)) / scale;
  if (rounded === 0) return (0).toFixed(decimals);
  const abs = Math.abs(rounded);
  const body = abs >= 60 ? formatLapTime(abs) : abs.toFixed(decimals);
  return `${rounded > 0 ? "+" : "-"}${body}`;
}

/** `+1 LAP`, `+3 LAPS`. */
export function formatLapsBehind(laps: number): string {
  return `+${laps} ${laps === 1 ? "LAP" : "LAPS"}`;
}

/**
 * Gap to the leader. The leader shows `LEADER` in a race context (or nothing if `leaderLabel` is empty);
 * a missing value shows the unavailable symbol.
 */
export function formatGap(gap: Gap, leaderLabel = "LEADER"): string {
  switch (gap.kind) {
    case "time":
      return gap.seconds === 0 ? "+0.000" : formatDelta(gap.seconds);
    case "laps":
      return formatLapsBehind(gap.laps);
    case "leader":
      return leaderLabel || UNAVAILABLE;
    case "none":
      return UNAVAILABLE;
  }
}

/** Interval to the car ahead. The leader has no meaningful interval, so it renders as unavailable. */
export function formatInterval(gap: Gap): string {
  return gap.kind === "leader" ? UNAVAILABLE : formatGap(gap);
}

export type SpeedUnit = "kmh" | "mph";

const KMH_PER_MPH = 1.609344;

export function convertSpeed(kmh: number, unit: SpeedUnit): number {
  return unit === "kmh" ? kmh : kmh / KMH_PER_MPH;
}

export function formatSpeed(kmh: number | null | undefined, unit: SpeedUnit = "kmh", withUnit = false): string {
  if (typeof kmh !== "number" || !Number.isFinite(kmh) || kmh < 0) return UNAVAILABLE;
  const v = Math.round(convertSpeed(kmh, unit));
  return withUnit ? `${v} ${unit === "kmh" ? "km/h" : "mph"}` : `${v}`;
}

/** Parses `1:23.456`, `83.456` or `1:02:03.456` into seconds; returns null for anything else. */
export function parseLapTime(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.trim();
  const m = /^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const parts = t.split(":");
  const secPart = parts.pop() as string;
  const sec = Number(secPart);
  if (!Number.isFinite(sec)) return null;
  let total = sec;
  let mult = 60;
  while (parts.length) {
    const p = Number(parts.pop());
    if (!Number.isFinite(p)) return null;
    total += p * mult;
    mult *= 60;
  }
  return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

/** Elapsed / remaining session clock: `1:02:03` or `42:07`. */
export function formatClock(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return UNAVAILABLE;
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad(m, 2)}:${pad(r, 2)}` : `${pad(m, 2)}:${pad(r, 2)}`;
}

export function formatPosition(position: number | null | undefined): string {
  return typeof position === "number" && Number.isInteger(position) && position > 0 ? String(position) : UNAVAILABLE;
}

/** Relative time for freshness labels: `4s ago`, `3m ago`, `2h ago`. */
export function formatAge(fromIso: string | null | undefined, now: number = Date.now()): string {
  if (!fromIso) return UNAVAILABLE;
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return UNAVAILABLE;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export interface DateFormatOptions {
  timeZone: string;
  hour12: boolean;
}

export function formatDateTime(iso: string | null | undefined, opts: DateFormatOptions, withDate = true): string {
  if (!iso) return UNAVAILABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNAVAILABLE;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: opts.timeZone,
    hour12: opts.hour12,
    hour: "2-digit",
    minute: "2-digit",
    ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}),
  }).format(d);
}

export function formatDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return UNAVAILABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNAVAILABLE;
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(d);
}

/** Short zone label for a given instant, e.g. "CDT", "GMT+1". Correct across daylight-saving changes. */
export function zoneLabel(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" }).formatToParts(d);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** UTC offset of a zone at an instant, as `+HH:MM:SS` / `-HH:MM:SS` (OpenF1's gmt_offset style). */
export function utcOffsetAt(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const diffMin = Math.round((asUtc - d.getTime()) / 60000);
  const sign = diffMin < 0 ? "-" : "+";
  const abs = Math.abs(diffMin);
  return `${sign}${pad(Math.floor(abs / 60), 2)}:${pad(abs % 60, 2)}:00`;
}
