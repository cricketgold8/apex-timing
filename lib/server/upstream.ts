import "server-only";

/**
 * Shared upstream HTTP helpers: per-host request spacing, timeouts, bounded retries on 429/5xx,
 * in-flight de-duplication and a small in-memory TTL cache.
 *
 * The cache lives in process memory. On serverless hosts each instance has its own cache, which is
 * acceptable: it only exists to avoid hammering upstream providers, not as a source of truth.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly provider: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

interface CacheEntry {
  value: unknown;
  expires: number;
  bytes: number;
}

const MAX_CACHE_BYTES = 120 * 1024 * 1024;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
let cacheBytes = 0;

function cacheGet(key: string): unknown | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) {
    cache.delete(key);
    cacheBytes -= e.bytes;
    return undefined;
  }
  // refresh LRU order
  cache.delete(key);
  cache.set(key, e);
  return e.value;
}

function cacheSet(key: string, value: unknown, ttlMs: number, bytes: number) {
  if (ttlMs <= 0) return;
  const old = cache.get(key);
  if (old) cacheBytes -= old.bytes;
  cache.set(key, { value, expires: Date.now() + ttlMs, bytes });
  cacheBytes += bytes;
  for (const [k, v] of cache) {
    if (cacheBytes <= MAX_CACHE_BYTES) break;
    cache.delete(k);
    cacheBytes -= v.bytes;
  }
}

const lastRequestAt = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

/** Serialises requests per host with a minimum spacing between them. */
async function spaced(host: string, spacingMs: number): Promise<void> {
  const prev = queues.get(host) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  queues.set(host, prev.then(() => mine));
  await prev;
  const wait = Math.max(0, (lastRequestAt.get(host) ?? 0) + spacingMs - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(host, Date.now());
  release();
}

export interface FetchJsonOptions {
  provider: string;
  ttlMs: number;
  spacingMs: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Treat this status as "no data" and resolve to the given value instead of throwing. */
  emptyOn?: { status: number; value: unknown };
  signal?: AbortSignal;
}

export async function fetchJson(url: string, opts: FetchJsonOptions): Promise<unknown> {
  const key = `${url}|${opts.headers?.authorization ? "auth" : "anon"}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const host = new URL(url).host;
    const retries = opts.retries ?? 2;
    let attempt = 0;
    for (;;) {
      await spaced(host, opts.spacingMs);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { accept: "application/json", "user-agent": "apex-timing/0.1 (+https://github.com/)", ...opts.headers },
          cache: "no-store",
          signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs ?? 20000)]) : AbortSignal.timeout(opts.timeoutMs ?? 20000),
        });
      } catch (err) {
        if (attempt < retries && !(opts.signal?.aborted ?? false)) {
          attempt++;
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new UpstreamError(`Request failed: ${reason}`, null, opts.provider, url);
      }

      if (opts.emptyOn && res.status === opts.emptyOn.status) {
        cacheSet(key, opts.emptyOn.value, Math.min(opts.ttlMs, 60_000), 64);
        return opts.emptyOn.value;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          attempt++;
          const retryAfter = Number(res.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1500 * attempt;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new UpstreamError(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`, res.status, opts.provider, url);
      }
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new UpstreamError("Response was not valid JSON", res.status, opts.provider, url);
      }
      cacheSet(key, json, opts.ttlMs, text.length * 2);
      return json;
    }
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}
