/** Seeded randomness for the demo. Values depend only on (seed, keys), never on call order. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashKeys(...keys: Array<number | string>): number {
  let h = 2166136261 >>> 0;
  for (const k of keys) {
    const s = String(k);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e37;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Uniform [0, 1) for a key tuple. */
export function uniform(...keys: Array<number | string>): number {
  return mulberry32(hashKeys(...keys))();
}

/** Standard normal for a key tuple (Box–Muller). */
export function gaussian(...keys: Array<number | string>): number {
  const r = mulberry32(hashKeys(...keys));
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
