"use client";

import { useEffect, useRef, useState } from "react";
import { shouldAcceptUpdate } from "@/lib/timing/calculations";
import type { Provenance, ProviderError } from "@/lib/timing/types";

export interface ResourceState<T> {
  data: T | null;
  provenance: Provenance | null;
  status: "idle" | "loading" | "ready" | "error";
  error: ProviderError | null;
  /** Wall-clock time of the last successful response. */
  lastSuccessAt: number | null;
  /** The last request failed while older data is still shown. */
  offline: boolean;
}

export const IDLE: ResourceState<never> = { data: null, provenance: null, status: "idle", error: null, lastSuccessAt: null, offline: false };

async function getJson(url: string, signal: AbortSignal): Promise<{ ok: true; body: { data: unknown; provenance: Provenance } } | { ok: false; error: ProviderError }> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return { ok: false, error: { error: "Network request failed", code: "UPSTREAM_ERROR", mode: "OFFLINE", provider: "apex-timing", detail: (err as Error).message } };
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok || !json || typeof json !== "object") {
    const e = json as ProviderError | null;
    return { ok: false, error: e && "code" in e ? e : { error: `HTTP ${res.status}`, code: "UPSTREAM_ERROR", mode: "OFFLINE", provider: "apex-timing" } };
  }
  return { ok: true, body: json as { data: unknown; provenance: Provenance } };
}

/**
 * Fetches a `{ data, provenance }` resource, optionally polling.
 *  - `scope` identifies the dataset (e.g. session). Changing it clears old data so sessions never mix;
 *    changing only the URL within a scope (e.g. replay lap) keeps the previous data visible while loading.
 *  - Responses that arrive out of order are discarded (request sequence numbers), and when `monotonic` is set
 *    a response whose source timestamp is older than the one displayed is ignored.
 *  - A failed poll keeps the last good data and marks the state offline.
 */
export function useRemoteResource<T>(url: string | null, opts: { scope: string; pollMs?: number | null; monotonic?: boolean }): ResourceState<T> & { reload: () => void } {
  const [state, setState] = useState<ResourceState<T>>(IDLE);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const scopeRef = useRef(opts.scope);

  useEffect(() => {
    if (scopeRef.current !== opts.scope) {
      scopeRef.current = opts.scope;
      setState(IDLE);
    }
  }, [opts.scope]);

  useEffect(() => {
    if (!url) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const run = async () => {
      const id = ++seq.current;
      controller = new AbortController();
      setState((s) => ({ ...s, status: s.data ? s.status : "loading" }));
      try {
        const r = await getJson(url, controller.signal);
        if (cancelled || id !== seq.current) return;
        if (r.ok) {
          setState((prev) => {
            if (opts.monotonic && prev.provenance && !shouldAcceptUpdate(prev.provenance.sourceTimestamp, r.body.provenance.sourceTimestamp)) {
              return { ...prev, offline: false, lastSuccessAt: Date.now() };
            }
            return { data: r.body.data as T, provenance: r.body.provenance, status: "ready", error: null, lastSuccessAt: Date.now(), offline: false };
          });
        } else {
          setState((prev) => ({ ...prev, status: prev.data ? prev.status : "error", error: r.error, offline: prev.data !== null }));
        }
      } catch {
        return; // aborted
      }
      if (!cancelled && opts.pollMs && opts.pollMs > 0) timer = setTimeout(run, opts.pollMs);
    };
    void run();
    return () => {
      cancelled = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [url, opts.pollMs, opts.monotonic, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
