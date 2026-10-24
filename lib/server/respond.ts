import "server-only";
import { NextResponse } from "next/server";
import type { ProviderError } from "@/lib/timing/types";
import { UpstreamError } from "./upstream";

export function ok<T>(body: T, cacheSeconds = 0): NextResponse {
  return NextResponse.json(body, {
    headers: {
      "cache-control": cacheSeconds > 0 ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` : "no-store",
    },
  });
}

export function fail(status: number, body: ProviderError): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function badRequest(message: string): NextResponse {
  return fail(400, { error: message, code: "BAD_REQUEST", mode: "UNAVAILABLE", provider: "apex-timing" });
}

/** OpenF1 answers 401 with this message while any F1 session is running, for past sessions too. */
const LIVE_LOCK = /live f1 session in progress/i;

/** Plain-language error for a failed upstream request. */
export function upstreamErrorBody(err: UpstreamError): ProviderError {
  if (err.status === 401 && LIVE_LOCK.test(err.message)) {
    return {
      error: "OpenF1 pauses free access while a Formula 1 session is on track — including for past sessions.",
      code: "LIVE_LOCKED",
      mode: "UNAVAILABLE",
      provider: err.provider,
      detail: "It comes back by itself when the session ends. Race results, standings and the schedule still work, and so does the demo.",
    };
  }
  if (err.status === 401 || err.status === 403) {
    return { error: `${err.provider} refused the request`, code: "UNAUTHORISED", mode: "OFFLINE", provider: err.provider, detail: "The provider requires an account for this data." };
  }
  if (err.status === 429) {
    return { error: `${err.provider} is busy`, code: "RATE_LIMITED", mode: "OFFLINE", provider: err.provider, detail: "Too many requests in a short time. Wait a moment and try again." };
  }
  return { error: `Couldn't reach ${err.provider}`, code: "UPSTREAM_ERROR", mode: "OFFLINE", provider: err.provider, detail: err.message };
}

export function upstreamFailure(err: UpstreamError): NextResponse {
  return fail(502, upstreamErrorBody(err));
}
