import type { NextRequest } from "next/server";
import { z } from "zod";
import { createOpenF1Provider, toProviderError } from "@/lib/server/openf1-provider";
import { badRequest, ok } from "@/lib/server/respond";
import { fail } from "@/lib/server/respond";
import { demoLapHistory, demoRaceControl, demoSnapshot, demoStints, demoTelemetry, demoTrack } from "@/lib/timing/providers/demo/provider";

/**
 * Timing API: /api/timing/{snapshot|laps|stints|race-control|track|telemetry}
 *   ?mode=historical|live|demo&session=<OpenF1 session key>&atLap=<n>&drivers=1,44&driver=44&lap=12&t=<demo seconds>
 *
 * Every response is `{ data, provenance }` or a ProviderError. Modes never fall back to each other.
 */

const RESOURCES = ["snapshot", "laps", "stints", "race-control", "track", "telemetry"] as const;

const query = z.object({
  mode: z.enum(["historical", "live", "demo"]),
  session: z.string().regex(/^\d+$|^demo-race$/).optional(),
  atLap: z.coerce.number().int().min(1).max(200).optional(),
  drivers: z
    .string()
    .regex(/^\d{1,3}(,\d{1,3}){0,21}$/)
    .optional(),
  driver: z.coerce.number().int().min(1).max(99).optional(),
  lap: z.coerce.number().int().min(1).max(200).optional(),
  t: z.coerce.number().min(-3600).max(20000).optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ resource: string }> }) {
  const { resource } = await ctx.params;
  if (!(RESOURCES as readonly string[]).includes(resource)) return badRequest(`Unknown resource "${resource}"`);
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const q = parsed.data;
  const drivers = q.drivers ? q.drivers.split(",").map(Number) : [];

  if (q.mode === "demo") {
    const t = q.t ?? 1800;
    switch (resource) {
      case "snapshot":
        return ok(demoSnapshot(t));
      case "laps": {
        const out: Record<number, unknown> = {};
        let provenance = null;
        for (const d of drivers) {
          const r = demoLapHistory(d, t);
          out[d] = r.data;
          provenance = r.provenance;
        }
        return ok({ data: out, provenance: provenance ?? demoSnapshot(t).provenance });
      }
      case "stints":
        return ok(demoStints(t));
      case "race-control":
        return ok(demoRaceControl(t));
      case "track":
        return ok(demoTrack(t));
      case "telemetry": {
        if (!q.driver || !q.lap) return badRequest("telemetry requires driver and lap");
        const r = demoTelemetry(q.driver, q.lap);
        return r ? ok(r) : fail(404, { error: "No such demo lap", code: "NOT_FOUND", mode: "DEMO", provider: "Apex demo generator (synthetic)" });
      }
    }
  }

  if (!q.session || q.session === "demo-race") return badRequest("session is required for live and historical modes");
  const provider = createOpenF1Provider(q.mode === "live" ? "live" : "historical");
  const opts = { atLap: q.atLap ?? null };
  // Completed sessions can be cached at the edge; live responses never are.
  const cache = q.mode === "historical" ? 60 : 0;
  try {
    switch (resource) {
      case "snapshot":
        return ok(await provider.getTiming(q.session, opts), cache);
      case "laps":
        if (drivers.length === 0) return badRequest("laps requires drivers=1,44,...");
        return ok(await provider.getLapHistory(q.session, drivers, opts), cache);
      case "stints":
        return ok(await provider.getStints(q.session, opts), cache);
      case "race-control":
        return ok(await provider.getRaceControl(q.session, opts), cache);
      case "track":
        return ok(await provider.getTrack(q.session, opts), cache);
      case "telemetry":
        if (!q.driver || !q.lap) return badRequest("telemetry requires driver and lap");
        return ok(await provider.getTelemetry(q.session, q.driver, q.lap), cache);
    }
  } catch (err) {
    const { status, body } = toProviderError(err);
    return fail(status, body);
  }
  return badRequest("Unhandled resource");
}
