import "server-only";
import { NextResponse } from "next/server";
import type { ProviderError } from "@/lib/timing/types";

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
