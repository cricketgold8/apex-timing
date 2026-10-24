import "server-only";
import { z } from "zod";
import { fetchJson, UpstreamError } from "./upstream";
import { of1Token } from "@/lib/timing/validation";

/**
 * OpenF1 client (https://openf1.org). Historical data (2023 onwards) is free and unauthenticated.
 * Real-time data requires a paid OpenF1 account; the username/password are exchanged for a one-hour
 * bearer token on this server only — credentials and tokens never reach the browser.
 */

export const OPENF1_PROVIDER = "OpenF1";
const BASE = (process.env.OPENF1_BASE_URL ?? "https://api.openf1.org").replace(/\/$/, "");
const SPACING = Number(process.env.OPENF1_MIN_REQUEST_SPACING_MS ?? 350);

export type Access = "historical" | "live";

export function liveCredentialsConfigured(): boolean {
  return Boolean(process.env.OPENF1_USERNAME && process.env.OPENF1_PASSWORD);
}

let token: { value: string; expires: number } | null = null;
let tokenRequest: Promise<string> | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  if (tokenRequest) return tokenRequest;
  const username = process.env.OPENF1_USERNAME;
  const password = process.env.OPENF1_PASSWORD;
  if (!username || !password) throw new UpstreamError("OpenF1 credentials are not configured", 401, OPENF1_PROVIDER, `${BASE}/token`);
  tokenRequest = (async () => {
    const res = await fetch(`${BASE}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ username, password }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new UpstreamError(`Token request failed (HTTP ${res.status})`, res.status, OPENF1_PROVIDER, `${BASE}/token`);
    const parsed = of1Token.parse(await res.json());
    const ttl = Number(parsed.expires_in);
    token = { value: parsed.access_token, expires: Date.now() + (Number.isFinite(ttl) ? ttl : 3600) * 1000 };
    return token.value;
  })();
  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

export type Filter = [key: string, op: "=" | ">" | "<", value: string | number];

function buildUrl(endpoint: string, filters: Filter[]): string {
  const qs = filters.map(([k, op, v]) => `${encodeURIComponent(k)}${op === "=" ? "=" : encodeURIComponent(op)}${encodeURIComponent(String(v))}`).join("&");
  return `${BASE}/v1/${endpoint}${qs ? `?${qs}` : ""}`;
}

export interface OpenF1Request<T> {
  endpoint: string;
  filters: Filter[];
  schema: z.ZodType<T>;
  access: Access;
  /** Cache lifetime. Completed sessions are effectively immutable; live data must be near-uncached. */
  ttlMs: number;
  signal?: AbortSignal;
}

/**
 * Fetches and validates an OpenF1 array endpoint. Invalid records are dropped and counted rather than
 * passed through; a payload that is not an array at all is an error. 404 means "no data" for OpenF1.
 */
export async function openf1<T>(req: OpenF1Request<T>): Promise<{ records: T[]; rejected: number; url: string }> {
  const url = buildUrl(req.endpoint, req.filters);
  const headers: Record<string, string> = {};
  if (req.access === "live") headers.authorization = `Bearer ${await accessToken()}`;
  const json = await fetchJson(url, {
    provider: OPENF1_PROVIDER,
    ttlMs: req.ttlMs,
    spacingMs: SPACING,
    headers,
    emptyOn: { status: 404, value: [] },
    signal: req.signal,
  });
  if (!Array.isArray(json)) {
    const detail = typeof json === "object" && json && "detail" in json ? String((json as { detail: unknown }).detail) : "unexpected payload";
    throw new UpstreamError(`OpenF1 returned a non-array payload (${detail})`, null, OPENF1_PROVIDER, url);
  }
  const records: T[] = [];
  let rejected = 0;
  for (const item of json) {
    const r = req.schema.safeParse(item);
    if (r.success) records.push(r.data);
    else rejected++;
  }
  return { records, rejected, url };
}
