import type { TrackPoint } from "@/lib/timing/types";

/**
 * A fictional circuit for the demo session ("Apex Test Circuit"). It deliberately resembles no real venue,
 * so synthetic timing can never be mistaken for a real Grand Prix.
 *
 * The speed profile comes from a simple quasi-static lap simulation over the outline's curvature:
 * cornering speed from lateral grip, then forward (traction) and backward (braking) passes. That single
 * profile drives sector splits, car positions on the map and the simulated telemetry, so all three agree.
 */

const CONTROL: Array<[number, number]> = [
  [120, 500],
  [430, 512],
  [720, 505],
  [800, 470],
  [812, 395],
  [760, 330],
  [826, 262],
  [905, 205],
  [935, 125],
  [885, 72],
  [818, 102],
  [640, 160],
  [450, 148],
  [372, 192],
  [330, 150],
  [250, 118],
  [150, 165],
  [92, 262],
  [140, 335],
  [78, 412],
];

export const CIRCUIT_LENGTH_M = 5_214;
const STEP_M = 4;
const V_MAX = 93; // m/s ≈ 335 km/h
const A_MECH = 15; // m/s² mechanical grip (≈1.5 g)
const K_AERO = 0.0052; // aero grip coefficient: a_lat = A_MECH + K_AERO·v²
const A_BRAKE = 44; // m/s²
const GEAR_TOP_KMH = [95, 130, 165, 200, 235, 270, 305, 345];

export interface ProfilePoint {
  distance: number;
  x: number;
  y: number;
  speedKmh: number;
  throttlePct: number;
  brake: number;
  gear: number;
  rpm: number;
  /** seconds from the start line at reference pace */
  t: number;
}

export interface CircuitProfile {
  name: string;
  points: ProfilePoint[];
  referenceLapTime: number;
  sectorEnds: [number, number];
  /** time fraction of the reference lap at which each sector ends */
  sectorTimeFractions: [number, number];
  speedTrapIndex: number;
  outline: TrackPoint[];
  sectorBoundaryIndices: [number, number];
}

function catmullRom(points: Array<[number, number]>, samplesPerSegment: number): TrackPoint[] {
  const out: TrackPoint[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push({ x, y });
    }
  }
  return out;
}

/** Resamples a closed polyline at a fixed spacing (in the polyline's own units). */
function resample(poly: TrackPoint[], count: number): TrackPoint[] {
  const closed = [...poly, poly[0]!];
  const seg: number[] = [0];
  for (let i = 1; i < closed.length; i++) seg.push(seg[i - 1]! + Math.hypot(closed[i]!.x - closed[i - 1]!.x, closed[i]!.y - closed[i - 1]!.y));
  const total = seg[seg.length - 1]!;
  const out: TrackPoint[] = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const d = (k / count) * total;
    while (j < seg.length - 1 && seg[j]! < d) j++;
    const a = closed[j - 1]!;
    const b = closed[j]!;
    const f = (d - seg[j - 1]!) / Math.max(1e-9, seg[j]! - seg[j - 1]!);
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

function radiusAt(pts: TrackPoint[], i: number, span: number): number {
  const n = pts.length;
  const a = pts[(i - span + n) % n]!;
  const b = pts[i]!;
  const c = pts[(i + span) % n]!;
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
  if (area2 < 1e-9) return Infinity;
  return (ab * bc * ca) / (2 * area2);
}

function gearFor(kmh: number): number {
  const g = GEAR_TOP_KMH.findIndex((top) => kmh <= top);
  return g === -1 ? 8 : g + 1;
}

function rpmFor(kmh: number, gear: number): number {
  const top = GEAR_TOP_KMH[gear - 1]!;
  const bottom = gear === 1 ? 0 : GEAR_TOP_KMH[gear - 2]! * 0.92;
  const f = Math.min(1, Math.max(0, (kmh - bottom) / Math.max(1, top - bottom)));
  return Math.round(9400 + f * 2600);
}

let cached: CircuitProfile | null = null;

export function demoCircuit(): CircuitProfile {
  if (cached) return cached;
  const count = Math.round(CIRCUIT_LENGTH_M / STEP_M);
  const raw = resample(catmullRom(CONTROL, 24), count);
  // Scale drawing units to metres.
  let drawLen = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    const b = raw[(i + 1) % raw.length]!;
    drawLen += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const scale = CIRCUIT_LENGTH_M / drawLen;
  const metres = raw.map((p) => ({ x: p.x * scale, y: p.y * scale }));

  // Cornering limit, smoothed.
  const span = Math.round(18 / STEP_M);
  const vCorner = metres.map((_, i) => {
    const inv = 1 / radiusAt(metres, i, span) - K_AERO;
    return inv <= 0 ? V_MAX : Math.min(V_MAX, Math.sqrt(A_MECH / inv));
  });
  const smooth = vCorner.map((_, i) => {
    let m = Infinity;
    for (let k = -3; k <= 3; k++) m = Math.min(m, vCorner[(i + k + count) % count]!);
    return m;
  });

  // Forward pass (traction-limited), two laps so the start line inherits the previous lap's exit speed.
  const v = new Array<number>(count).fill(0);
  let cur = smooth[0]!;
  for (let lap = 0; lap < 2; lap++) {
    for (let i = 0; i < count; i++) {
      const aAcc = Math.max(2.5, 13.5 * (1 - (cur / V_MAX) ** 2));
      cur = Math.min(smooth[i]!, Math.sqrt(cur * cur + 2 * aAcc * STEP_M));
      v[i] = cur;
    }
  }
  // Backward pass (braking-limited), twice around for the same reason.
  const braking = new Array<boolean>(count).fill(false);
  let nxt = v[0]!;
  for (let lap = 0; lap < 2; lap++) {
    for (let i = count - 1; i >= 0; i--) {
      const limit = Math.sqrt(nxt * nxt + 2 * A_BRAKE * STEP_M);
      if (v[i]! > limit) {
        v[i] = limit;
        braking[i] = true;
      }
      nxt = v[i]!;
    }
  }

  const points: ProfilePoint[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const speed = v[i]!;
    const prev = v[(i - 1 + count) % count]!;
    const kmh = speed * 3.6;
    const accelerating = speed > prev + 0.05;
    const cornerLimited = !accelerating && !braking[i] && speed < V_MAX - 0.5;
    const gear = gearFor(kmh);
    points.push({
      distance: i * STEP_M,
      x: metres[i]!.x,
      y: metres[i]!.y,
      speedKmh: kmh,
      throttlePct: braking[i] ? 0 : cornerLimited ? 55 + 30 * (speed / V_MAX) : 100,
      brake: braking[i] ? 100 : 0,
      gear,
      rpm: rpmFor(kmh, gear),
      t,
    });
    t += STEP_M / Math.max(speed, 5);
  }

  const sectorEnds: [number, number] = [Math.round(count * 0.37), Math.round(count * 0.7)];
  const speedTrapIndex = points.reduce((bi, p, i) => (p.speedKmh > points[bi]!.speedKmh ? i : bi), 0);
  cached = {
    name: "Apex Test Circuit (fictional)",
    points,
    referenceLapTime: t,
    sectorEnds,
    sectorTimeFractions: [points[sectorEnds[0]]!.t / t, points[sectorEnds[1]]!.t / t],
    speedTrapIndex,
    outline: metres.filter((_, i) => i % 3 === 0),
    sectorBoundaryIndices: [Math.round(sectorEnds[0] / 3), Math.round(sectorEnds[1] / 3)],
  };
  return cached;
}

/** Position on the outline after a given fraction of lap *time* at reference pace. */
export function pointAtTimeFraction(profile: CircuitProfile, fraction: number): TrackPoint {
  const f = ((fraction % 1) + 1) % 1;
  const target = f * profile.referenceLapTime;
  const pts = profile.points;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid]!.t <= target) lo = mid;
    else hi = mid - 1;
  }
  const p = pts[lo]!;
  return { x: p.x, y: p.y };
}
