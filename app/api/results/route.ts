import type { NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_TYPES } from "@/lib/config/season-2026";
import { badRequest, fail, ok } from "@/lib/server/respond";
import { sessionResults } from "@/lib/server/results";
import { UpstreamError } from "@/lib/server/upstream";

const query = z.object({
  round: z.coerce.number().int().min(1).max(30),
  type: z.enum(SESSION_TYPES),
  name: z.string().max(40).optional(),
});

export async function GET(req: NextRequest) {
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  try {
    const { provenance, ...data } = await sessionResults(parsed.data.round, parsed.data.type, parsed.data.name);
    return ok({ data, provenance }, 120);
  } catch (err) {
    if (err instanceof UpstreamError) return fail(502, { error: `${err.provider} request failed`, code: err.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR", mode: "OFFLINE", provider: err.provider, detail: err.message });
    return fail(404, { error: err instanceof Error ? err.message : String(err), code: "NOT_FOUND", mode: "UNAVAILABLE", provider: "apex-timing" });
  }
}
