import type { TelemetryLap, TelemetrySample } from "./types";

/**
 * Distance by trapezoidal integration of speed over time. OpenF1 car data has no distance channel, so any
 * distance axis built from it is derived and labelled as such.
 */
export function integrateDistance(samples: ReadonlyArray<{ t: number; speedKmh: number | null }>): number[] {
  const out: number[] = [];
  let d = 0;
  for (let i = 0; i < samples.length; i++) {
    if (i > 0) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const va = (a.speedKmh ?? 0) / 3.6;
      const vb = (b.speedKmh ?? 0) / 3.6;
      const dt = b.t - a.t;
      if (dt > 0 && dt < 5) d += ((va + vb) / 2) * dt;
    }
    out.push(Math.round(d * 10) / 10);
  }
  return out;
}

/** Value of a channel at a distance by linear interpolation; null outside the recorded range. */
function interpolate(samples: readonly TelemetrySample[], key: keyof TelemetrySample, distance: number, step = false): number | null {
  if (samples.length === 0) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  if (distance < first.distance || distance > last.distance) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.distance <= distance) lo = mid;
    else hi = mid;
  }
  const a = samples[lo]!;
  const b = samples[hi]!;
  const va = a[key] as number | null;
  const vb = b[key] as number | null;
  if (va === null || vb === null) return va ?? vb;
  if (step || b.distance === a.distance) return va;
  const f = (distance - a.distance) / (b.distance - a.distance);
  return va + (vb - va) * f;
}

export interface AlignedPoint {
  distance: number;
  a: Partial<Record<"speed" | "throttle" | "brake" | "gear" | "rpm" | "t", number | null>>;
  b: Partial<Record<"speed" | "throttle" | "brake" | "gear" | "rpm" | "t", number | null>>;
  /** b's elapsed time minus a's at the same distance: positive = B is behind. */
  delta: number | null;
}

/**
 * Resamples one or two laps onto a shared distance grid so channels line up across charts and drivers.
 * Integrated distance drifts by a few tens of metres per lap at ~4 Hz, so lap B's distance is scaled to lap A's
 * length (both laps cover the same circuit) before comparison. The delta is each lap's own elapsed time at the same
 * normalised distance.
 */
export function alignLaps(a: TelemetryLap, b: TelemetryLap | null, stepMetres = 10): AlignedPoint[] {
  const maxA = a.samples[a.samples.length - 1]?.distance ?? 0;
  const maxB = b ? b.samples[b.samples.length - 1]?.distance ?? 0 : 0;
  if (b && maxB > 0 && maxA > 0 && Math.abs(maxB - maxA) / maxA < 0.05) {
    const k = maxA / maxB;
    b = { ...b, samples: b.samples.map((s) => ({ ...s, distance: s.distance * k })) };
  }
  const max = b ? Math.min(maxA, b.samples[b.samples.length - 1]?.distance ?? 0) : maxA;
  const out: AlignedPoint[] = [];
  const pick = (lap: TelemetryLap, d: number) => ({
    speed: interpolate(lap.samples, "speedKmh", d),
    throttle: interpolate(lap.samples, "throttlePct", d),
    brake: interpolate(lap.samples, "brake", d, true),
    gear: interpolate(lap.samples, "gear", d, true),
    rpm: interpolate(lap.samples, "rpm", d),
    t: interpolate(lap.samples, "t", d),
  });
  for (let d = 0; d <= max; d += stepMetres) {
    const pa = pick(a, d);
    const pb = b ? pick(b, d) : null;
    const delta = pb && pa.t != null && pb.t != null ? Math.round((pb.t - pa.t) * 1000) / 1000 : null;
    out.push({ distance: d, a: pa, b: pb ?? {}, delta });
  }
  return out;
}
